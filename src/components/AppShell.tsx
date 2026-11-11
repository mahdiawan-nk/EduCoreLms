import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  BookOpen,
  GraduationCap,
  ShieldCheck,
  Users,
  Bell,
  LogOut,
  Menu,
  X,
  FileCode2,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Button, ModalDialog } from './ui/primitives';
import { formatDateTime } from '../lib/utils';
import { apiRequest } from '../lib/api';
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
    notifications,
    logout,
    markAllNotificationsRead,
    loginWithCredentials,
  } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [openApiModal, setOpenApiModal] = useState(false);
  const [openApiJson, setOpenApiJson] = useState<string>('');
  const [switchingRole, setSwitchingRole] = useState(false);

  if (!user) return <>{children}</>;

  const isSuperadmin = user.roles.includes('SUPERADMIN');
  const isDosen = user.roles.includes('DOSEN');
  const primaryRoleLabel = isSuperadmin
    ? 'Superadmin Akademik'
    : isDosen
      ? 'Dosen Pengampu'
      : 'Mahasiswa';

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  const handleOpenSpec = async () => {
    try {
      const res = await apiRequest<Record<string, unknown>>('/openapi.json');
      setOpenApiJson(JSON.stringify(res.data, null, 2));
      setOpenApiModal(true);
    } catch (err: any) {
      toast.error(err.message || 'Gagal memuat spesifikasi OpenAPI');
    }
  };

  const handleQuickSwitchActor = async (email: string, password: string, label: string) => {
    try {
      setSwitchingRole(true);
      await loginWithCredentials(email, password);
      toast.success(`Beralih sesi ke ${label}`);
      navigate('/');
    } catch (err: any) {
      toast.error(err.message || 'Gagal beralih akun');
    } finally {
      setSwitchingRole(false);
    }
  };

  return (
    <div className="min-h-screen flex bg-slate-50 text-slate-900">
      {/* Desktop Sidebar (264px width per SaaS Workspace Canvas contract) */}
      <aside className="hidden lg:flex lg:w-[264px] lg:flex-col lg:fixed lg:inset-y-0 border-r border-slate-200 bg-white">
        <div className="flex items-center justify-between px-6 h-16 border-b border-slate-200">
          <Link
            to="/"
            className="flex items-center gap-2.5 text-base font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900 text-amber-400">
              <GraduationCap className="h-4 w-4" />
            </div>
            <span>Politeknik Kampar</span>
          </Link>
        </div>

        {/* Actor Identity Summary (Clean unboxed metadata) */}
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/60">
          <p className="text-sm font-semibold text-slate-900 truncate">
            {user.fullName}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
            <span>{primaryRoleLabel}</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums">
              {user.identityNumber || 'Terverifikasi'}
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-500 truncate">
            {user.studyProgram}
          </p>
        </div>

        {/* Primary Workspace Navigation */}
        <nav className="flex-1 px-4 py-5 space-y-1">
          <Link
            to="/"
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap shrink-0 ${
              location.pathname === '/'
                ? 'bg-slate-900 text-white'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <BookOpen className="h-4 w-4 shrink-0" />
            <span>
              {isSuperadmin
                ? 'Pusat Kendali Superadmin'
                : isDosen
                  ? 'Ruang Pengajaran Dosen'
                  : 'Ruang Belajar Mahasiswa'}
            </span>
          </Link>

          <button
            type="button"
            onClick={handleOpenSpec}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <FileCode2 className="h-4 w-4 shrink-0" />
            <span>Spesifikasi OpenAPI v1</span>
          </button>
        </nav>

        {/* Quick Actor Switcher for Testing 3 Primary Actors */}
        <div className="px-4 py-4 border-t border-slate-200 bg-slate-50/50">
          <p className="px-2 text-xs font-semibold text-slate-700">
            Simulasi Aktor Produksi
          </p>
          <p className="px-2 mt-0.5 text-xs text-slate-500">
            Uji sesi nyata Argon2id & RBAC:
          </p>
          <div className="mt-2.5 space-y-1">
            <button
              type="button"
              disabled={switchingRole}
              onClick={() =>
                handleQuickSwitchActor(
                  'superadmin@poltek-kampar.ac.id',
                  'AdminPolkam#2026',
                  'Superadmin (Ir. Hendra Pratama)'
                )
              }
              className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                isSuperadmin
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-600 hover:bg-slate-200/70'
              }`}
            >
              <span className="flex items-center gap-2 truncate">
                <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
                <span>Superadmin</span>
              </span>
              <span className="font-mono text-[11px] opacity-75">RBAC Penuh</span>
            </button>

            <button
              type="button"
              disabled={switchingRole}
              onClick={() =>
                handleQuickSwitchActor(
                  'fitriani.dosen@poltek-kampar.ac.id',
                  'DosenPolkam#2026',
                  'Dosen (Dr. Fitriani Syahrir)'
                )
              }
              className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                isDosen && !isSuperadmin
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-600 hover:bg-slate-200/70'
              }`}
            >
              <span className="flex items-center gap-2 truncate">
                <Users className="h-3.5 w-3.5 shrink-0" />
                <span>Dosen Pengampu</span>
              </span>
              <span className="font-mono text-[11px] opacity-75">NIDN</span>
            </button>

            <button
              type="button"
              disabled={switchingRole}
              onClick={() =>
                handleQuickSwitchActor(
                  'ahmad.mhs@student.poltek-kampar.ac.id',
                  'MhsPolkam#2026',
                  'Mahasiswa (Ahmad Fauzan)'
                )
              }
              className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                !isSuperadmin && !isDosen
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-600 hover:bg-slate-200/70'
              }`}
            >
              <span className="flex items-center gap-2 truncate">
                <GraduationCap className="h-3.5 w-3.5 shrink-0" />
                <span>Mahasiswa</span>
              </span>
              <span className="font-mono text-[11px] opacity-75">NIM</span>
            </button>
          </div>
        </div>

        {/* Logout Footer */}
        <div className="p-4 border-t border-slate-200">
          <Button
            type="button"
            variant="outline"
            className="w-full justify-start text-slate-700"
            onClick={async () => {
              await logout();
              navigate('/login');
            }}
          >
            <LogOut className="h-4 w-4" />
            <span>Keluar Sesi</span>
          </Button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col lg:pl-[264px] min-w-0">
        {/* Top Bar Contract: Zone 1 Breadcrumb — Zone 2 Navigation — Zone 3 Primary Action */}
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-8 border-b border-slate-200 bg-white/95 px-6 backdrop-blur-xs">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden rounded-lg p-2 text-slate-600 hover:bg-slate-100"
              aria-label="Buka navigasi"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="flex items-center gap-2 text-sm font-medium text-slate-600 truncate">
              <Link
                to="/"
                className="font-semibold text-slate-900 hover:underline whitespace-nowrap shrink-0"
              >
                LMS Politeknik Kampar
              </Link>
              {breadcrumb && (
                <>
                  <span aria-hidden="true" className="text-slate-400">
                    /
                  </span>
                  <span className="text-slate-700 truncate">{breadcrumb}</span>
                </>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {primaryAction}

            <button
              type="button"
              onClick={() => setNotifOpen(true)}
              className="relative inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 cursor-pointer"
              aria-label="Notifikasi"
            >
              <Bell className="h-4 w-4" />
              {unreadCount > 0 && (
                <span className="ml-1 font-mono text-xs font-semibold text-amber-700 tabular-nums">
                  {unreadCount}
                </span>
              )}
            </button>
          </div>
        </header>

        {/* Mobile Drawer */}
        {mobileMenuOpen && (
          <div className="fixed inset-0 z-50 lg:hidden flex">
            <div
              className="fixed inset-0 bg-slate-950/50"
              onClick={() => setMobileMenuOpen(false)}
            />
            <div className="relative z-10 w-72 bg-white h-full flex flex-col justify-between p-6">
              <div>
                <div className="flex items-center justify-between pb-4 border-b border-slate-200">
                  <span className="text-base font-bold text-slate-900">
                    Politeknik Kampar LMS
                  </span>
                  <button
                    type="button"
                    onClick={() => setMobileMenuOpen(false)}
                    className="p-1.5 text-slate-500"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
                <div className="py-4 border-b border-slate-100">
                  <p className="text-sm font-semibold text-slate-900">
                    {user.fullName}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {primaryRoleLabel} · {user.studyProgram}
                  </p>
                </div>
                <div className="mt-4 space-y-2">
                  <Link
                    to="/"
                    onClick={() => setMobileMenuOpen(false)}
                    className="block px-3 py-2 rounded-lg text-sm font-medium bg-slate-900 text-white"
                  >
                    Beranda Dashboard
                  </Link>
                  <button
                    type="button"
                    onClick={() => {
                      setMobileMenuOpen(false);
                      handleOpenSpec();
                    }}
                    className="w-full text-left px-3 py-2 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-100"
                  >
                    Spesifikasi OpenAPI v1
                  </button>
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={async () => {
                  await logout();
                  navigate('/login');
                }}
              >
                <LogOut className="h-4 w-4" />
                <span>Keluar Sesi</span>
              </Button>
            </div>
          </div>
        )}

        {/* Main Workspace Viewport */}
        <main className="flex-1 px-6 py-8 max-w-[1360px] w-full mx-auto">
          {children}
        </main>

        {/* Quiet Institutional Footer */}
        <footer className="border-t border-slate-200 bg-white px-6 py-4 text-xs text-slate-500">
          <div className="max-w-[1360px] mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
            <span>
              Politeknik Kampar — Sistem Manajemen Pembelajaran Digital Terpadu
            </span>
            <span>
              Bangkinang, Kabupaten Kampar, Provinsi Riau · Tahun Akademik 2026/2027
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

      {/* OpenAPI 3.1 Specification Viewer Modal */}
      <ModalDialog
        open={openApiModal}
        onClose={() => setOpenApiModal(false)}
        title="Dokumentasi OpenAPI 3.1 — REST API /api/v1"
        description="Spesifikasi resmi endpoint backend Fastify, skema respons standar, dan skema keamanan."
        maxWidth="max-w-3xl"
      >
        <pre className="rounded-lg bg-slate-950 p-4 text-xs font-mono text-slate-100 overflow-x-auto max-h-[60vh]">
          {openApiJson}
        </pre>
      </ModalDialog>
    </div>
  );
}
