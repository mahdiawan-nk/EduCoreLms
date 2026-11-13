import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { signInWithPopup } from 'firebase/auth';
import { auth, googleAuthProvider } from '../lib/firebase';
import {
  apiRequest,
  setApiSecurityTokens,
  setUnauthorizedHandler,
  startImpersonation as apiStartImpersonation,
  stopImpersonation as apiStopImpersonation,
} from '../lib/api';

export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

export interface ImpersonationInfo {
  isImpersonating: true;
  impersonationSessionId: string;
  originalUserId: string;
  originalUserName: string;
  originalUserEmail: string;
  originalRole: string;
  impersonatedUserId: string;
  impersonatedUserName: string;
  impersonatedRole: string;
  startedAt: string;
  expiresAt: string;
  reason: string | null;
}

export interface LmsUser {
  id: string;
  email: string;
  fullName: string;
  identityNumber: string | null;
  studyProgram: string;
  roles: string[];
  permissions: string[];
  mustResetPassword?: boolean;
  temporaryPasswordExpiresAt?: string | null;
  passwordChangedAt?: string | null;
}

export interface LmsNotification {
  id: string;
  title: string;
  message: string;
  type: string;
  linkUrl: string | null;
  isRead: boolean;
  createdAt: string;
}

interface AuthContextValue {
  user: LmsUser | null;
  impersonation: ImpersonationInfo | null;
  notifications: LmsNotification[];
  isLoading: boolean;
  status: AuthStatus;
  loginWithCredentials: (email: string, password: string) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<void>;
  markAllNotificationsRead: () => Promise<void>;
  startImpersonation: (targetUserId: string, reason?: string) => Promise<LmsUser>;
  stopImpersonation: () => Promise<LmsUser>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

// Deduplicate concurrent in-flight session verification calls (handles React StrictMode)
let inFlightSessionCheck: Promise<void> | null = null;

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<LmsUser | null>(null);
  const [impersonation, setImpersonation] = useState<ImpersonationInfo | null>(null);
  const [notifications, setNotifications] = useState<LmsNotification[]>([]);
  const [status, setStatus] = useState<AuthStatus>('loading');

  const refreshSession = useCallback(async (): Promise<void> => {
    if (inFlightSessionCheck) {
      await inFlightSessionCheck;
      return;
    }

    inFlightSessionCheck = (async () => {
      try {
        const res = await apiRequest<{
          user: LmsUser;
          csrfToken: string;
          impersonation?: ImpersonationInfo | null;
          notifications: LmsNotification[];
        }>('/auth/me');
        setApiSecurityTokens({ csrfToken: res.data.csrfToken });
        setUser(res.data.user);
        setImpersonation(res.data.impersonation || null);
        setNotifications(res.data.notifications || []);
        setStatus('authenticated');
      } catch {
        setUser(null);
        setImpersonation(null);
        setNotifications([]);
        setStatus('unauthenticated');
      } finally {
        inFlightSessionCheck = null;
      }
    })();

    await inFlightSessionCheck;
  }, []);

  useEffect(() => {
    refreshSession();
  }, [refreshSession]);

  // Hook into centralized 401 unhandled listener for mid-session expirations
  useEffect(() => {
    setUnauthorizedHandler(() => {
      setApiSecurityTokens({ csrfToken: '', bearerToken: '' });
      setUser(null);
      setImpersonation(null);
      setNotifications([]);
      setStatus('unauthenticated');
    });
    return () => {
      setUnauthorizedHandler(null);
    };
  }, []);

  const loginWithCredentials = async (email: string, password: string) => {
    const res = await apiRequest<{
      user: LmsUser;
      csrfToken: string;
      notifications?: LmsNotification[];
    }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    setApiSecurityTokens({ csrfToken: res.data.csrfToken });
    setUser(res.data.user);
    if (res.data.notifications) {
      setNotifications(res.data.notifications);
    }
    setStatus('authenticated');
    queryClient.invalidateQueries({ queryKey: ['app-config'] });
  };

  const loginWithGoogle = async () => {
    const cred = await signInWithPopup(auth, googleAuthProvider);
    const idToken = await cred.user.getIdToken();
    setApiSecurityTokens({ bearerToken: idToken });
    const res = await apiRequest<{
      user: LmsUser;
      csrfToken: string;
      notifications?: LmsNotification[];
    }>('/auth/google', {
      method: 'POST',
      body: JSON.stringify({ idToken }),
    });
    setApiSecurityTokens({
      csrfToken: res.data.csrfToken,
      bearerToken: idToken,
    });
    setUser(res.data.user);
    if (res.data.notifications) {
      setNotifications(res.data.notifications);
    }
    setStatus('authenticated');
    queryClient.invalidateQueries({ queryKey: ['app-config'] });
  };

  const logout = async () => {
    try {
      await apiRequest('/auth/logout', { method: 'POST' });
    } catch {
      // Ignore logout network error
    } finally {
      setApiSecurityTokens({ csrfToken: '', bearerToken: '' });
      setUser(null);
      setImpersonation(null);
      setNotifications([]);
      queryClient.clear();
      setStatus('unauthenticated');
    }
  };

  const startImpersonation = async (targetUserId: string, reason?: string): Promise<LmsUser> => {
    const res = await apiStartImpersonation(targetUserId, reason);
    setApiSecurityTokens({ csrfToken: res.data.csrfToken });
    setUser(res.data.user);
    setImpersonation(res.data.impersonation);
    setStatus('authenticated');
    queryClient.clear();
    await refreshSession();
    return res.data.user;
  };

  const stopImpersonation = async (): Promise<LmsUser> => {
    const res = await apiStopImpersonation();
    setApiSecurityTokens({ csrfToken: res.data.csrfToken });
    setUser(res.data.user);
    setImpersonation(null);
    setStatus('authenticated');
    queryClient.clear();
    await refreshSession();
    return res.data.user;
  };

  const markAllNotificationsRead = async () => {
    await apiRequest('/notifications/read-all', { method: 'POST' });
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
  };

  const isLoading = status === 'loading';

  return (
    <AuthContext.Provider
      value={{
        user,
        impersonation,
        notifications,
        isLoading,
        status,
        loginWithCredentials,
        loginWithGoogle,
        logout,
        refreshSession,
        markAllNotificationsRead,
        startImpersonation,
        stopImpersonation,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}
