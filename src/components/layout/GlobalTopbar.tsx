import React from 'react';
import { Link } from 'react-router-dom';
import {
  Bell,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  ShieldAlert,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { canPerformMutations, isAuditorUser } from '../../lib/authorization';
import { UserProfileMenu } from './UserProfileMenu';
import { ApplicationBrand } from './ApplicationBrand';

interface GlobalTopbarProps {
  breadcrumb?: string;
  primaryAction?: React.ReactNode;
  isCompact: boolean;
  onToggleCompact: () => void;
  onOpenMobileMenu: () => void;
  unreadCount: number;
  onOpenNotifications: () => void;
}

export function GlobalTopbar({
  breadcrumb,
  primaryAction,
  isCompact,
  onToggleCompact,
  onOpenMobileMenu,
  unreadCount,
  onOpenNotifications,
}: GlobalTopbarProps) {
  const { user } = useAuth();

  if (!user) return null;

  const isAuditor = isAuditorUser(user);
  const brandLabel = 'EduCoreLMS';

  return (
    <header
      className="sticky top-0 z-30 flex h-16 items-center justify-between gap-3 sm:gap-6 border-b px-4 sm:px-6 backdrop-blur-xs transition-colors"
      style={{
        backgroundColor: 'var(--theme-topbar-bg)',
        color: 'var(--theme-topbar-text)',
        borderColor: 'var(--theme-border)',
      }}
    >
      <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
        {/* Mobile Sidebar Drawer Toggle */}
        <button
          type="button"
          onClick={onOpenMobileMenu}
          className="lg:hidden rounded-lg p-2 hover:bg-slate-100 transition-colors cursor-pointer"
          aria-label="Buka navigasi"
        >
          <Menu className="h-5 w-5" />
        </button>

        {/* Desktop Compact Toggle */}
        <button
          type="button"
          onClick={onToggleCompact}
          className="hidden lg:inline-flex rounded-lg p-1.5 opacity-70 hover:opacity-100 hover:bg-slate-100 transition-colors cursor-pointer"
          title={isCompact ? 'Perluas Sidebar' : 'Ciutkan Sidebar'}
          aria-label="Toggle sidebar"
        >
          {isCompact ? (
            <PanelLeftOpen className="h-4 w-4" />
          ) : (
            <PanelLeftClose className="h-4 w-4" />
          )}
        </button>

        {/* Mobile Branding (Logo + EduCoreLMS + Institution) */}
        <div className="lg:hidden min-w-0">
          <ApplicationBrand variant="topbar" />
        </div>

        {/* Desktop Breadcrumb */}
        <nav
          aria-label="Breadcrumb"
          className="hidden lg:flex items-center gap-2 text-sm font-medium truncate"
        >
          <Link
            to="/"
            className="font-semibold hover:underline whitespace-nowrap shrink-0"
            style={{ color: 'var(--theme-topbar-text)' }}
          >
            {brandLabel}
          </Link>
          {breadcrumb && (
            <>
              <span aria-hidden="true" className="opacity-40">
                /
              </span>
              <span
                className="truncate"
                style={{ color: 'var(--theme-text-secondary)' }}
              >
                {breadcrumb}
              </span>
            </>
          )}
        </nav>
      </div>

      <div className="flex items-center gap-2 sm:gap-3 shrink-0">
        {isAuditor && (
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1 text-[11px] font-bold tracking-wide text-amber-900">
            <ShieldAlert className="h-3.5 w-3.5 text-amber-600 shrink-0" />
            <span className="hidden sm:inline">AUDITOR — READ ONLY</span>
            <span className="sm:hidden">READ ONLY</span>
          </span>
        )}

        {canPerformMutations(user) && primaryAction}

        {/* Notification Center */}
        <button
          type="button"
          onClick={onOpenNotifications}
          className="relative inline-flex h-9 w-9 items-center justify-center rounded-lg border hover:bg-slate-50 transition-colors cursor-pointer"
          style={{
            borderColor: 'var(--theme-border)',
            backgroundColor: 'var(--theme-card-bg)',
            color: 'var(--theme-text-primary)',
          }}
          aria-label="Notifikasi"
          title="Pusat Notifikasi"
        >
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-amber-600 px-1 font-mono text-[10px] font-bold text-white tabular-nums">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </button>

        {/* User Profile Menu */}
        <UserProfileMenu />
      </div>
    </header>
  );
}
