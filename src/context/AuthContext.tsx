import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { signInWithPopup } from 'firebase/auth';
import { auth, googleAuthProvider } from '../lib/firebase';
import { apiRequest, setApiSecurityTokens } from '../lib/api';

export interface LmsUser {
  id: string;
  email: string;
  fullName: string;
  identityNumber: string | null;
  studyProgram: string;
  roles: string[];
  permissions: string[];
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
  notifications: LmsNotification[];
  isLoading: boolean;
  loginWithCredentials: (email: string, password: string) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<void>;
  markAllNotificationsRead: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<LmsUser | null>(null);
  const [notifications, setNotifications] = useState<LmsNotification[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const refreshSession = useCallback(async () => {
    try {
      const res = await apiRequest<{
        user: LmsUser;
        csrfToken: string;
        notifications: LmsNotification[];
      }>('/auth/me');
      setApiSecurityTokens({ csrfToken: res.data.csrfToken });
      setUser(res.data.user);
      setNotifications(res.data.notifications || []);
    } catch {
      setUser(null);
      setNotifications([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshSession();
  }, [refreshSession]);

  const loginWithCredentials = async (email: string, password: string) => {
    const res = await apiRequest<{ user: LmsUser; csrfToken: string }>(
      '/auth/login',
      {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      }
    );
    setApiSecurityTokens({ csrfToken: res.data.csrfToken });
    setUser(res.data.user);
    await refreshSession();
  };

  const loginWithGoogle = async () => {
    const cred = await signInWithPopup(auth, googleAuthProvider);
    const idToken = await cred.user.getIdToken();
    setApiSecurityTokens({ bearerToken: idToken });
    const res = await apiRequest<{ user: LmsUser; csrfToken: string }>(
      '/auth/google',
      {
        method: 'POST',
        body: JSON.stringify({ idToken }),
      }
    );
    setApiSecurityTokens({
      csrfToken: res.data.csrfToken,
      bearerToken: idToken,
    });
    setUser(res.data.user);
    await refreshSession();
  };

  const logout = async () => {
    try {
      await apiRequest('/auth/logout', { method: 'POST' });
    } catch {
      // Ignore logout network error
    }
    setApiSecurityTokens({ csrfToken: '', bearerToken: '' });
    setUser(null);
    setNotifications([]);
  };

  const markAllNotificationsRead = async () => {
    await apiRequest('/notifications/read-all', { method: 'POST' });
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        notifications,
        isLoading,
        loginWithCredentials,
        loginWithGoogle,
        logout,
        refreshSession,
        markAllNotificationsRead,
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
