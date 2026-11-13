import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  CalendarDays,
  Presentation,
  Users,
  ShieldCheck,
  ShieldAlert,
  BookOpen,
  BookMarked,
  PlusCircle,
  UserRoundCheck,
  ArrowLeft,
  Settings,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useAppConfig } from '../context/ThemeContext';
import { Button, ModalDialog } from './ui/primitives';
import { formatDateTime } from '../lib/utils';
import {
  hasAnyPermission,
  hasPermission,
  isSuperadminUser,
  canPerformMutations,
} from '../lib/authorization';
import { GlobalSidebar, NavGroup, NavItem } from './layout/GlobalSidebar';
import { GlobalTopbar } from './layout/GlobalTopbar';
import { toast } from 'sonner';

export function AppShell({
  children,
  breadcrumb,
  primaryAction,
}: {
  children: React.ReactNode;
  breadcrumb?: string;
  primaryAction?: React.ReactNode;
}) {
  const {
    user,
    impersonation,
    notifications,
    markAllNotificationsRead,
    stopImpersonation,
  } = useAuth();
  const { config, applyPageSeo } = useAppConfig();
  const [stoppingImpersonation, setStoppingImpersonation] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isCompact, setIsCompact] = useState<boolean>(() => {
    try {
      return localStorage.getItem('pk_lms_sidebar_compact') === 'true';
    } catch {
      return false;
    }
  });

  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>(() => {
    try {
      const stored = localStorage.getItem('pk_lms_nav_collapsed');
      return stored ? JSON.parse(stored) : {};
    } catch {
      return {};
    }
  });

  const [notifOpen, setNotifOpen] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem('pk_lms_sidebar_compact', String(isCompact));
    } catch {
      // ignore
    }
  }, [isCompact]);

  useEffect(() => {
    try {
      localStorage.setItem('pk_lms_nav_collapsed', JSON.stringify(collapsedGroups));
    } catch {
      // ignore
    }
  }, [collapsedGroups]);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    applyPageSeo({
      pageTitle: breadcrumb,
      isAuthenticatedPage: true,
      pathname: location.pathname,
    });
  }, [applyPageSeo, breadcrumb, location.pathname]);

  if (!user) return <>{children}</>;

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  const toggleGroup = (groupId: string) => {
    setCollapsedGroups((prev) => ({
      ...prev,
      [groupId]: !prev[groupId],
    }));
  };

  const rawNavGroups: NavGroup[] = [
    {
      id: 'utama',
      label: 'UTAMA',
      items: [
        {
          label: 'Dashboard',
          to: '/',
          icon: LayoutDashboard,
          exact: true,
          visible: true,
        },
      ],
    },
    {
      id: 'akademik',
      label: 'MANAJEMEN AKADEMIK',
      items: [
        {
          label: 'Periode Akademik',
          to: '/academic-periods',
          icon: CalendarDays,
          visible: hasPermission(user, 'academic_period.view'),
        },
      ],
    },
    {
      id: 'kelas',
      label: 'MANAJEMEN RUANG KELAS',
      items: [
        {
          label: 'Ruang Kelas',
          to: '/classrooms',
          icon: Presentation,
          visible: hasAnyPermission(user, [
            'classrooms:view',
            'classrooms:manage_all',
            'classrooms:teach',
            'enrollments:join',
          ]),
        },
        {
          label: 'Buat Ruang Kelas (Wizard)',
          to: '/classrooms/new',
          icon: PlusCircle,
          visible:
            canPerformMutations(user) &&
            hasPermission(user, 'classrooms:create'),
        },
      ],
    },
    {
      id: 'sistem',
      label: 'SISTEM & KEAMANAN',
      items: [
        {
          label: 'Pengaturan Sistem',
          to: '/admin/settings',
          icon: Settings,
          visible:
            canPerformMutations(user) &&
            isSuperadminUser(user) &&
            hasPermission(user, 'system_settings.view'),
        },
        {
          label: 'Manajemen Pengguna',
          to: '/admin/users',
          icon: Users,
          visible: hasAnyPermission(user, ['users:read', 'users:manage']),
        },
        {
          label: 'Role & Permission (RBAC)',
          to: '/admin/rbac',
          icon: ShieldCheck,
          visible: hasAnyPermission(user, ['rbac:view', 'rbac:manage']),
        },
        {
          label: 'Log Audit Keamanan',
          to: '/admin/audit-logs',
          icon: ShieldAlert,
          visible: hasPermission(user, 'audit:view'),
        },
        {
          label: 'Kelola Knowledge Center',
          to: '/admin/help',
          icon: BookMarked,
          visible:
            canPerformMutations(user) &&
            isSuperadminUser(user) &&
            hasPermission(user, 'knowledge.manage'),
        },
      ],
    },
    {
      id: 'bantuan',
      label: 'BANTUAN & DOKUMENTASI',
      items: [
        {
          label: 'Pusat Bantuan',
          to: '/help',
          icon: BookOpen,
          visible: hasAnyPermission(user, ['knowledge.view', 'knowledge.manage']),
        },
      ],
    },
  ];

  const currentGroups: NavGroup[] = rawNavGroups
    .map((group) => ({
      id: group.id,
      label: group.label,
      items: group.items.filter((item) => item.visible),
    }))
    .filter((group) => group.items.length > 0);

  const isRouteActive = (item: NavItem) => {
    if (item.isAction) return false;
    if (item.exact) return location.pathname === item.to;
    return location.pathname.startsWith(item.to);
  };

  const handleActionItem = (_item: NavItem) => {
    // Reserved for future action navigation items
  };

  const contentPaddingClass = isCompact ? 'lg:pl-[72px]' : 'lg:pl-[264px]';

  return (
    <div
      className="min-h-screen flex transition-colors"
      style={{
        backgroundColor: 'var(--theme-content-bg)',
        color: 'var(--theme-text-primary)',
      }}
    >
      <GlobalSidebar
        groups={currentGroups}
        isCompact={isCompact}
        onToggleCompact={() => setIsCompact((prev) => !prev)}
        collapsedGroups={collapsedGroups}
        onToggleGroup={toggleGroup}
        mobileMenuOpen={mobileMenuOpen}
        onCloseMobileMenu={() => setMobileMenuOpen(false)}
        isRouteActive={isRouteActive}
        onActionItem={handleActionItem}
      />

      <div
        className={`flex-1 flex flex-col ${contentPaddingClass} min-w-0 transition-all duration-200`}
      >
        {/* Permanent Impersonation Indicator Banner */}
        {impersonation?.isImpersonating && (
          <div
            role="status"
            aria-live="polite"
            className="sticky top-0 z-40 border-b border-amber-400 bg-amber-500 text-slate-950 px-4 sm:px-6 py-2.5 shadow-sm"
          >
            <div className="max-w-[1360px] mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              <div className="flex items-start sm:items-center gap-2.5 min-w-0">
                <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-slate-950/15 text-slate-950 shrink-0 mt-0.5 sm:mt-0">
                  <UserRoundCheck className="w-4 h-4" />
                </span>
                <div className="min-w-0 text-xs sm:text-sm">
                  <p className="font-bold leading-snug">
                    Anda sedang mengakses LMS sebagai{' '}
                    <span className="underline decoration-slate-950/40 underline-offset-2">
                      {impersonation.impersonatedUserName}
                    </span>{' '}
                    ({impersonation.impersonatedRole}).
                  </p>
                  <p className="text-[11px] text-slate-900/90 mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <span>
                      Superadmin Asli: <strong>{impersonation.originalUserName}</strong>
                    </span>
                    <span aria-hidden="true">•</span>
                    <span>
                      Role Tujuan: <strong>{impersonation.impersonatedRole}</strong>
                    </span>
                    <span aria-hidden="true">•</span>
                    <span>
                      Mulai: <strong>{formatDateTime(impersonation.startedAt)}</strong>
                    </span>
                  </p>
                </div>
              </div>
              <button
                type="button"
                disabled={stoppingImpersonation}
                onClick={async () => {
                  setStoppingImpersonation(true);
                  try {
                    await stopImpersonation();
                    toast.success('Sesi impersonasi diakhiri. Kembali ke akun Superadmin.');
                    navigate('/admin/users');
                  } catch (err: any) {
                    toast.error(err?.message || 'Gagal kembali ke akun Superadmin.');
                  } finally {
                    setStoppingImpersonation(false);
                  }
                }}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-slate-950 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-60 transition-colors shrink-0 cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                {stoppingImpersonation ? 'Memulihkan...' : 'Kembali ke Akun Superadmin'}
              </button>
            </div>
          </div>
        )}

        <GlobalTopbar
          breadcrumb={breadcrumb}
          primaryAction={primaryAction}
          isCompact={isCompact}
          onToggleCompact={() => setIsCompact((prev) => !prev)}
          onOpenMobileMenu={() => setMobileMenuOpen(true)}
          unreadCount={unreadCount}
          onOpenNotifications={() => setNotifOpen(true)}
        />

        <main className="flex-1 w-full max-w-[1360px] mx-auto px-4 sm:px-6 lg:px-8 py-6">
          {children}
        </main>

        <footer
          className="border-t px-6 py-4 text-xs"
          style={{
            borderColor: 'var(--theme-border)',
            backgroundColor: 'var(--theme-card-bg)',
            color: 'var(--theme-text-secondary)',
          }}
        >
          <div className="max-w-[1360px] mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <span>
              {config.identity.institutionName} — {config.identity.applicationName}
            </span>
            <span>
              {config.identity.copyrightText ||
                `${config.identity.applicationBrand} · ${config.identity.institutionShortName}`}
            </span>
          </div>
        </footer>
      </div>

      {/* Notifications Modal */}
      <ModalDialog
        open={notifOpen}
        onClose={() => setNotifOpen(false)}
        title="Notifikasi Akademik & Kelas"
        description="Pemberitahuan nilai tugas, persetujuan pendaftaran kelas, dan aktivitas terbaru."
      >
        <div className="space-y-3">
          {notifications.length === 0 ? (
            <p className="text-sm text-slate-500 py-6 text-center">
              Belum ada notifikasi untuk akun Anda.
            </p>
          ) : (
            notifications.map((n) => (
              <div
                key={n.id}
                className={`rounded-lg border p-3.5 ${
                  n.isRead
                    ? 'border-slate-200 bg-white'
                    : 'border-amber-300 bg-amber-50/40'
                }`}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <h4 className="text-sm font-semibold text-slate-900">
                    {n.title}
                  </h4>
                  <span className="font-mono text-xs text-slate-500 tabular-nums shrink-0">
                    {formatDateTime(n.createdAt)}
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-600 leading-relaxed">
                  {n.message}
                </p>
                {n.linkUrl && (
                  <button
                    type="button"
                    onClick={() => {
                      setNotifOpen(false);
                      navigate(n.linkUrl!);
                    }}
                    className="mt-2 text-xs font-medium text-amber-700 hover:underline cursor-pointer"
                  >
                    Buka Ruang Kelas →
                  </button>
                )}
              </div>
            ))
          )}
        </div>
        {unreadCount > 0 && (
          <div className="mt-5 flex justify-end">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={async () => {
                await markAllNotificationsRead();
                toast.success('Semua notifikasi ditandai telah dibaca');
              }}
            >
              Tandai Semua Dibaca
            </Button>
          </div>
        )}
      </ModalDialog>
    </div>
  );
}
