import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  User,
  GraduationCap,
  ShieldCheck,
  History,
  MonitorSmartphone,
  LogOut,
  CheckCircle2,
  XCircle,
  UserRoundCheck,
} from 'lucide-react';
import type { SwitchAccountTarget } from './SwitchAccountModal';
import {
  Button,
  ModalDialog,
  ConfirmDialog,
  Skeleton,
} from '../ui/primitives';
import { apiRequest } from '../../lib/api';
import { formatDateTime } from '../../lib/utils';
import { toast } from 'sonner';

interface Props {
  userId: string | null;
  onClose: () => void;
  canManageUsers: boolean;
  canImpersonate?: boolean;
  currentUserId?: string;
  onSwitchAccount?: (target: SwitchAccountTarget) => void;
}

type DetailTab = 'overview' | 'academic' | 'access' | 'activity' | 'sessions';

export function UserDetailModal({
  userId,
  onClose,
  canManageUsers,
  canImpersonate,
  currentUserId,
  onSwitchAccount,
}: Props) {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<DetailTab>('overview');
  const [revokeConfirm, setRevokeConfirm] = useState<{
    mode: 'single' | 'all';
    sessionId?: string;
  } | null>(null);

  const detailQuery = useQuery({
    queryKey: ['admin-user-detail', userId],
    queryFn: () => apiRequest<any>(`/users/${userId}`),
    enabled: Boolean(userId),
  });

  const revokeMutation = useMutation({
    mutationFn: (payload: { mode: 'single' | 'all'; sessionId?: string }) => {
      if (payload.mode === 'all') {
        return apiRequest(`/users/${userId}/sessions/revoke-all`, {
          method: 'POST',
          body: JSON.stringify({}),
        });
      }
      return apiRequest(`/users/${userId}/sessions/${payload.sessionId}/revoke`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
    },
    onSuccess: () => {
      toast.success('Sesi pengguna berhasil dicabut pada server.');
      setRevokeConfirm(null);
      queryClient.invalidateQueries({ queryKey: ['admin-user-detail', userId] });
    },
    onError: (err: any) => {
      toast.error(err?.message || 'Gagal mencabut sesi.');
    },
  });

  const detail = detailQuery.data?.data;

  const tabs: { id: DetailTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: 'overview', label: 'Ringkasan', icon: User },
    { id: 'academic', label: 'Akademik', icon: GraduationCap },
    { id: 'access', label: 'Akses & Izin', icon: ShieldCheck },
    { id: 'activity', label: 'Aktivitas', icon: History },
    { id: 'sessions', label: 'Sesi & Keamanan', icon: MonitorSmartphone },
  ];

  return (
    <>
      <ModalDialog
        open={Boolean(userId)}
        onClose={onClose}
        title={detail ? `Detail Pengguna — ${detail.fullName}` : 'Memuat Detail Pengguna...'}
        description="Informasi identitas akademik, hak akses RBAC, riwayat aktivitas, dan sesi aktif."
        maxWidth="max-w-3xl"
      >
        {detailQuery.isLoading ? (
          <div className="space-y-3 py-4">
            <Skeleton className="h-10 rounded-lg" />
            <Skeleton className="h-48 rounded-xl" />
          </div>
        ) : !detail ? (
          <p className="text-xs text-[#64748B] py-6 text-center">
            Data pengguna tidak ditemukan.
          </p>
        ) : (
          <div className="space-y-4">
            {/* Sub-tabs */}
            <div className="flex items-center gap-1 overflow-x-auto border-b border-[#E2E8F0] pb-1">
              {tabs.map((t) => {
                const Icon = t.icon;
                const active = activeTab === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setActiveTab(t.id)}
                    className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer ${
                      active
                        ? 'bg-[#14213D] text-white'
                        : 'text-[#64748B] hover:bg-[#F7F9FC] hover:text-[#172033]'
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    <span>{t.label}</span>
                  </button>
                );
              })}
            </div>

            {activeTab === 'overview' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div className="rounded-xl border border-[#E2E8F0] bg-[#F7F9FC] p-3.5 space-y-1">
                  <span className="text-[#64748B]">Nama Lengkap</span>
                  <p className="font-bold text-[#172033]">{detail.fullName}</p>
                </div>
                <div className="rounded-xl border border-[#E2E8F0] bg-[#F7F9FC] p-3.5 space-y-1">
                  <span className="text-[#64748B]">Alamat Email</span>
                  <p className="font-mono font-semibold text-[#172033] break-all">{detail.email}</p>
                </div>
                <div className="rounded-xl border border-[#E2E8F0] bg-[#F7F9FC] p-3.5 space-y-1">
                  <span className="text-[#64748B]">Nomor Telepon</span>
                  <p className="font-mono text-[#172033]">{detail.profile?.phone || '—'}</p>
                </div>
                <div className="rounded-xl border border-[#E2E8F0] bg-[#F7F9FC] p-3.5 space-y-1">
                  <span className="text-[#64748B]">Status Akun</span>
                  <p className="font-bold text-[#14213D]">
                    {detail.accountStatus} {detail.mustResetPassword ? '· Wajib Reset Sandi' : ''}
                  </p>
                </div>
                <div className="rounded-xl border border-[#E2E8F0] bg-[#F7F9FC] p-3.5 space-y-1">
                  <span className="text-[#64748B]">Login Terakhir</span>
                  <p className="font-mono text-[#172033]">
                    {detail.lastLoginAt ? formatDateTime(detail.lastLoginAt) : 'Belum pernah login'}
                  </p>
                </div>
                <div className="rounded-xl border border-[#E2E8F0] bg-[#F7F9FC] p-3.5 space-y-1">
                  <span className="text-[#64748B]">Tanggal Dibuat</span>
                  <p className="font-mono text-[#172033]">{formatDateTime(detail.createdAt)}</p>
                </div>
                {canImpersonate &&
                  onSwitchAccount &&
                  detail.id !== currentUserId &&
                  detail.isActive &&
                  detail.accountStatus === 'ACTIVE' &&
                  !(detail.roles || []).some(
                    (r: any) => String(r?.code || r).toUpperCase() === 'SUPERADMIN'
                  ) && (
                    <div className="sm:col-span-2 pt-2 flex justify-end">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          onClose();
                          onSwitchAccount({
                            id: detail.id,
                            fullName: detail.fullName,
                            email: detail.email,
                            identityNumber: detail.identityNumber,
                            nim: detail.profile?.nim,
                            nidn: detail.profile?.nidn,
                            nip: detail.profile?.nip,
                            studyProgram: detail.profile?.studyProgram,
                            organizationalUnit: detail.profile?.organizationalUnit,
                            roles: (detail.roles || []).map((r: any) =>
                              typeof r === 'string' ? r : r.code
                            ),
                            accountStatus: detail.accountStatus,
                            isActive: detail.isActive,
                          });
                        }}
                        className="border-amber-300 text-amber-800 hover:bg-amber-50"
                      >
                        <UserRoundCheck className="w-4 h-4 mr-1.5" />
                        Switch Account
                      </Button>
                    </div>
                  )}
              </div>
            )}

            {activeTab === 'academic' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div className="rounded-xl border border-[#E2E8F0] bg-[#F7F9FC] p-3.5 space-y-1">
                  <span className="text-[#64748B]">Nomor Identitas Utama</span>
                  <p className="font-mono font-bold text-[#172033]">{detail.identityNumber || '—'}</p>
                </div>
                <div className="rounded-xl border border-[#E2E8F0] bg-[#F7F9FC] p-3.5 space-y-1">
                  <span className="text-[#64748B]">Program Studi</span>
                  <p className="font-semibold text-[#172033]">{detail.profile?.studyProgram}</p>
                </div>
                <div className="rounded-xl border border-[#E2E8F0] bg-[#F7F9FC] p-3.5 space-y-1">
                  <span className="text-[#64748B]">Unit Organisasi</span>
                  <p className="font-semibold text-[#172033]">{detail.profile?.organizationalUnit}</p>
                </div>
                <div className="rounded-xl border border-[#E2E8F0] bg-[#F7F9FC] p-3.5 space-y-1">
                  <span className="text-[#64748B]">Status Akademik</span>
                  <p className="font-semibold text-[#172033]">{detail.profile?.academicStatus || 'AKTIF'}</p>
                </div>
                {detail.profile?.academicTitle && (
                  <div className="rounded-xl border border-[#E2E8F0] bg-[#F7F9FC] p-3.5 space-y-1">
                    <span className="text-[#64748B]">Gelar Akademik</span>
                    <p className="font-semibold text-[#172033]">{detail.profile.academicTitle}</p>
                  </div>
                )}
                {detail.profile?.admissionYear && (
                  <div className="rounded-xl border border-[#E2E8F0] bg-[#F7F9FC] p-3.5 space-y-1">
                    <span className="text-[#64748B]">Tahun Angkatan</span>
                    <p className="font-mono font-semibold text-[#172033]">{detail.profile.admissionYear}</p>
                  </div>
                )}
                <div className="sm:col-span-2 rounded-xl border border-[#E2E8F0] bg-white p-3.5 flex flex-wrap gap-6">
                  <div>
                    <span className="text-[#64748B] block">Kelas Diampu</span>
                    <strong className="font-mono text-base text-[#14213D]">
                      {detail.academicRelationships?.teachingClassroomsCount ?? 0}
                    </strong>
                  </div>
                  <div>
                    <span className="text-[#64748B] block">Kelas Diikuti</span>
                    <strong className="font-mono text-base text-[#14213D]">
                      {detail.academicRelationships?.enrolledClassroomsCount ?? 0}
                    </strong>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'access' && (
              <div className="space-y-3 text-xs">
                <div className="flex flex-wrap gap-2">
                  {(detail.roles || []).map((r: any) => (
                    <span
                      key={r.roleId}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-[#14213D] px-3 py-1.5 font-mono font-bold text-white"
                    >
                      {r.roleCode} — {r.roleName}
                    </span>
                  ))}
                </div>
                <div className="rounded-xl border border-[#E2E8F0] bg-[#F7F9FC] p-3.5">
                  <p className="font-semibold text-[#172033] mb-2">
                    Izin Efektif ({detail.effectivePermissions?.length || 0})
                  </p>
                  <div className="flex flex-wrap gap-1.5 max-h-56 overflow-y-auto">
                    {(detail.effectivePermissions || []).map((p: any) => (
                      <span
                        key={p.code}
                        className="rounded-md bg-white border border-[#E2E8F0] px-2 py-1 font-mono text-[11px] text-[#172033]"
                        title={p.description}
                      >
                        {p.code}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'activity' && (
              <div className="space-y-2 max-h-72 overflow-y-auto text-xs">
                {(detail.activityHistory || []).length === 0 ? (
                  <p className="text-[#64748B] text-center py-6">
                    Belum ada riwayat aktivitas tercatat.
                  </p>
                ) : (
                  detail.activityHistory.map((act: any) => (
                    <div
                      key={act.id}
                      className="rounded-xl border border-[#E2E8F0] bg-[#F7F9FC] px-3.5 py-2.5 flex items-center justify-between gap-2"
                    >
                      <div>
                        <p className="font-mono font-semibold text-[#14213D]">{act.action}</p>
                        <p className="text-[11px] text-[#64748B]">
                          {act.entityType} · IP {act.ipAddress || '—'}
                        </p>
                      </div>
                      <span className="font-mono text-[11px] text-[#64748B] shrink-0">
                        {formatDateTime(act.createdAt)}
                      </span>
                    </div>
                  ))
                )}
              </div>
            )}

            {activeTab === 'sessions' && (
              <div className="space-y-3 text-xs">
                {canManageUsers && (
                  <div className="flex justify-end">
                    <Button
                      type="button"
                      size="sm"
                      variant="destructive"
                      onClick={() => setRevokeConfirm({ mode: 'all' })}
                    >
                      <LogOut className="h-3.5 w-3.5" />
                      <span>Cabut Semua Sesi Aktif</span>
                    </Button>
                  </div>
                )}

                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {(detail.sessions || []).length === 0 ? (
                    <p className="text-[#64748B] text-center py-6">
                      Tidak ada catatan sesi untuk pengguna ini.
                    </p>
                  ) : (
                    detail.sessions.map((s: any) => (
                      <div
                        key={s.id}
                        className="rounded-xl border border-[#E2E8F0] bg-[#F7F9FC] p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                      >
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2">
                            {s.isRevoked ? (
                              <XCircle className="h-3.5 w-3.5 text-red-600" />
                            ) : (
                              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                            )}
                            <span className="font-semibold text-[#172033]">
                              {s.deviceLabel}
                            </span>
                            {s.isCurrentSession && (
                              <span className="rounded bg-blue-50 border border-blue-200 px-1.5 py-0.5 text-[10px] font-semibold text-[#2563EB]">
                                Sesi Saat Ini
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-[#64748B] font-mono">
                            IP: {s.ipAddress || '—'} · Dibuat: {formatDateTime(s.createdAt)}
                          </p>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                              s.isRevoked
                                ? 'bg-red-50 text-red-700 border border-red-200'
                                : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            }`}
                          >
                            {s.isRevoked ? 'DICABUT' : 'AKTIF'}
                          </span>
                          {canManageUsers && !s.isRevoked && (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                setRevokeConfirm({ mode: 'single', sessionId: s.id })
                              }
                            >
                              Cabut
                            </Button>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </ModalDialog>

      <ConfirmDialog
        open={Boolean(revokeConfirm)}
        onClose={() => setRevokeConfirm(null)}
        onConfirm={() => {
          if (revokeConfirm) revokeMutation.mutate(revokeConfirm);
        }}
        title={
          revokeConfirm?.mode === 'all'
            ? 'Cabut Semua Sesi Pengguna?'
            : 'Cabut Sesi Terpilih?'
        }
        description="Pengguna akan otomatis keluar dari sesi tersebut dan harus melakukan autentikasi ulang."
        confirmLabel="Cabut Sesi"
        variant="destructive"
        isLoading={revokeMutation.isPending}
      />
    </>
  );
}
