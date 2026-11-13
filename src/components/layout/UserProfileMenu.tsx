import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ChevronDown,
  User,
  KeyRound,
  Settings,
  LogOut,
  ShieldCheck,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import {
  canPerformMutations,
  getPrimaryRoleLabel,
  hasPermission,
  isSuperadminUser,
} from '../../lib/authorization';
import { Button, ModalDialog } from '../ui/primitives';

export function UserProfileMenu() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const menuRef = useRef<HTMLDivElement>(null);

  const [open, setOpen] = useState(false);
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [logoutModalOpen, setLogoutModalOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  if (!user) return null;

  const primaryRoleLabel = getPrimaryRoleLabel(user);
  const canOpenSystemSettings =
    isSuperadminUser(user) &&
    canPerformMutations(user) &&
    hasPermission(user, 'system_settings.view');

  const initials = (user.fullName || 'U')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('');

  const handleConfirmLogout = async () => {
    try {
      setLoggingOut(true);
      await logout();
      setLogoutModalOpen(false);
      navigate('/login');
    } finally {
      setLoggingOut(false);
    }
  };

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-2 rounded-lg border px-2 py-1.5 text-left transition-colors hover:bg-slate-50 cursor-pointer"
        style={{
          borderColor: 'var(--theme-border)',
          backgroundColor: 'var(--theme-card-bg)',
          color: 'var(--theme-text-primary)',
        }}
      >
        <div
          className="flex h-7 w-7 items-center justify-center rounded-md text-xs font-bold shrink-0"
          style={{
            backgroundColor: 'var(--theme-primary)',
            color: '#FFFFFF',
          }}
        >
          {initials}
        </div>
        <div className="hidden md:block min-w-0 max-w-[140px]">
          <p className="text-xs font-semibold truncate leading-tight">
            {user.fullName}
          </p>
          <p
            className="text-[10px] truncate leading-tight"
            style={{ color: 'var(--theme-text-secondary)' }}
          >
            {primaryRoleLabel}
          </p>
        </div>
        <ChevronDown className="h-3.5 w-3.5 opacity-60 shrink-0" />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 mt-2 w-72 max-w-[calc(100vw-1.5rem)] rounded-xl border bg-white shadow-lg z-50 overflow-hidden"
          style={{
            borderColor: 'var(--theme-border)',
            backgroundColor: 'var(--theme-card-bg)',
            color: 'var(--theme-text-primary)',
          }}
        >
          {/* Identity Header */}
          <div
            className="px-4 py-3 border-b"
            style={{
              borderColor: 'var(--theme-border)',
              backgroundColor: 'var(--theme-surface-bg)',
            }}
          >
            <div className="flex items-center gap-3">
              <div
                className="flex h-10 w-10 items-center justify-center rounded-lg text-sm font-bold shrink-0"
                style={{
                  backgroundColor: 'var(--theme-primary)',
                  color: '#FFFFFF',
                }}
              >
                {initials}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold truncate">{user.fullName}</p>
                <p
                  className="text-xs truncate"
                  style={{ color: 'var(--theme-text-secondary)' }}
                >
                  {user.email}
                </p>
                <span
                  className="mt-1 inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide"
                  style={{
                    backgroundColor: 'var(--theme-card-bg)',
                    border: '1px solid var(--theme-border)',
                    color: 'var(--theme-primary)',
                  }}
                >
                  <ShieldCheck className="h-3 w-3" />
                  {primaryRoleLabel}
                </span>
              </div>
            </div>
          </div>

          {/* Menu Actions */}
          <div className="p-1.5 space-y-0.5">
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                setProfileModalOpen(true);
              }}
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium hover:bg-slate-100 transition-colors cursor-pointer"
            >
              <User className="h-4 w-4 text-slate-500 shrink-0" />
              <span>Profil Saya</span>
            </button>

            {canPerformMutations(user) && (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  navigate('/auth/force-password-change');
                }}
                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <KeyRound className="h-4 w-4 text-slate-500 shrink-0" />
                <span>Profil & Keamanan</span>
              </button>
            )}

            {canOpenSystemSettings && (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  navigate('/admin/settings');
                }}
                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <Settings className="h-4 w-4 text-slate-500 shrink-0" />
                <span>Pengaturan Sistem</span>
              </button>
            )}
          </div>

          {/* Visual Separator */}
          <div
            className="border-t my-0.5"
            style={{ borderColor: 'var(--theme-border)' }}
          />

          <div className="p-1.5">
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                setLogoutModalOpen(true);
              }}
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
            >
              <LogOut className="h-4 w-4 shrink-0" />
              <span>Keluar</span>
            </button>
          </div>
        </div>
      )}

      {/* Profil Saya Modal */}
      <ModalDialog
        open={profileModalOpen}
        onClose={() => setProfileModalOpen(false)}
        title="Profil Pengguna"
        description="Informasi identitas akun yang sedang aktif pada sesi ini."
      >
        <div className="space-y-3 text-sm">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3.5">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Nama Lengkap
              </p>
              <p className="mt-0.5 font-semibold text-slate-900">{user.fullName}</p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Email Institusi
              </p>
              <p className="mt-0.5 font-medium text-slate-800 break-all">{user.email}</p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Role Aktif
              </p>
              <p className="mt-0.5 font-semibold text-blue-700">{primaryRoleLabel}</p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                NIM / NIDN / NIP
              </p>
              <p className="mt-0.5 font-mono text-slate-800">
                {user.identityNumber || 'Tidak ada'}
              </p>
            </div>
            <div className="sm:col-span-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Unit / Program Studi
              </p>
              <p className="mt-0.5 font-medium text-slate-800">{user.studyProgram}</p>
            </div>
          </div>

          <div className="flex justify-end">
            <Button variant="outline" onClick={() => setProfileModalOpen(false)}>
              Tutup
            </Button>
          </div>
        </div>
      </ModalDialog>

      {/* Logout Confirmation Modal */}
      <ModalDialog
        open={logoutModalOpen}
        onClose={() => !loggingOut && setLogoutModalOpen(false)}
        title="Konfirmasi Keluar Sesi"
        description="Apakah Anda yakin ingin mengakhiri sesi aktif dan keluar dari sistem?"
      >
        <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 pt-2">
          <Button
            variant="outline"
            onClick={() => setLogoutModalOpen(false)}
            disabled={loggingOut}
          >
            Batal
          </Button>
          <Button
            variant="destructive"
            onClick={handleConfirmLogout}
            disabled={loggingOut}
          >
            <LogOut className="h-4 w-4" />
            <span>{loggingOut ? 'Mengeluarkan...' : 'Ya, Keluar'}</span>
          </Button>
        </div>
      </ModalDialog>
    </div>
  );
}
