import React, { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import {
  KeyRound,
  ShieldAlert,
  Eye,
  EyeOff,
  Copy,
  CheckCircle2,
  Circle,
  AlertTriangle,
  Sparkles,
  UserCheck,
  Lock,
} from 'lucide-react';
import { Button, Input, ModalDialog, ConfirmDialog } from '../ui/primitives';
import { apiRequest } from '../../lib/api';
import { formatDateTime } from '../../lib/utils';
import { toast } from 'sonner';

export interface ResetPasswordUserInfo {
  id: string;
  fullName: string;
  email: string;
  identityNumber: string | null;
  nim: string | null;
  nidn: string | null;
  nip: string | null;
  roles: string[];
  accountStatus: string;
}

interface ResetPasswordModalProps {
  user: ResetPasswordUserInfo | null;
  onClose: () => void;
  onSuccessRefresh: () => void;
}

type ResetMethod = 'AUTOMATIC' | 'MANUAL' | 'IDENTITY_BASED';

export function ResetPasswordModal({
  user,
  onClose,
  onSuccessRefresh,
}: ResetPasswordModalProps) {
  const [method, setMethod] = useState<ResetMethod>('AUTOMATIC');
  const [manualPassword, setManualPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showManual, setShowManual] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [revokeSessions, setRevokeSessions] = useState(true);
  const [expirationHours, setExpirationHours] = useState(24);
  const [reason, setReason] = useState('');
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);

  const [revealGenerated, setRevealGenerated] = useState(true);
  const [resultData, setResultData] = useState<{
    method: ResetMethod;
    expiresAt: string;
    sessionsRevoked: boolean;
    temporaryPassword: string | null;
    identityTypeUsed: string | null;
  } | null>(null);

  const resolvedIdentity = user
    ? user.nim
      ? { label: 'NIM', value: user.nim }
      : user.nidn
        ? { label: 'NIDN', value: user.nidn }
        : user.nip
          ? { label: 'NIP', value: user.nip }
          : user.identityNumber
            ? { label: 'Nomor Identitas', value: user.identityNumber }
            : null
    : null;

  const manualChecks = [
    { label: 'Minimal 12 karakter', ok: manualPassword.length >= 12 },
    { label: 'Huruf kapital (A-Z)', ok: /[A-Z]/.test(manualPassword) },
    { label: 'Huruf kecil (a-z)', ok: /[a-z]/.test(manualPassword) },
    { label: 'Angka (0-9)', ok: /[0-9]/.test(manualPassword) },
    { label: 'Karakter spesial (!@#$%^&* dll)', ok: /[^A-Za-z0-9]/.test(manualPassword) },
    {
      label: 'Tidak mengandung NIM/NIDN/NIP',
      ok:
        !resolvedIdentity ||
        resolvedIdentity.value.length < 4 ||
        !manualPassword.toLowerCase().includes(resolvedIdentity.value.toLowerCase()),
    },
    {
      label: 'Konfirmasi password cocok',
      ok: manualPassword.length > 0 && manualPassword === confirmPassword,
    },
  ];
  const manualPassedCount = manualChecks.filter((c) => c.ok).length;
  const manualStrengthPct = Math.round((manualPassedCount / manualChecks.length) * 100);
  const manualValid = manualChecks.every((c) => c.ok);

  const canProceed =
    method === 'AUTOMATIC' ||
    (method === 'MANUAL' && manualValid) ||
    (method === 'IDENTITY_BASED' && resolvedIdentity !== null);

  const resetMutation = useMutation({
    mutationFn: () => {
      if (!user) throw new Error('Target pengguna tidak ditemukan');
      return apiRequest<{
        userId: string;
        method: ResetMethod;
        identityTypeUsed: string | null;
        expiresAt: string;
        mustResetPassword: boolean;
        sessionsRevoked: boolean;
        temporaryPassword: string | null;
      }>(`/api/v1/users/${user.id}/reset-password`, {
        method: 'POST',
        body: JSON.stringify({
          method,
          manualPassword: method === 'MANUAL' ? manualPassword : undefined,
          confirmPassword: method === 'MANUAL' ? confirmPassword : undefined,
          expirationHours,
          revokeSessions: method === 'IDENTITY_BASED' ? true : revokeSessions,
          reason: reason.trim() || undefined,
        }),
      });
    },
    onSuccess: (res) => {
      toast.success('Reset password berhasil diproses dan diaudit.');
      setConfirmDialogOpen(false);
      setResultData({
        method: res.data.method,
        expiresAt: res.data.expiresAt,
        sessionsRevoked: res.data.sessionsRevoked,
        temporaryPassword: res.data.temporaryPassword,
        identityTypeUsed: res.data.identityTypeUsed,
      });
      onSuccessRefresh();
    },
    onError: (err: any) => {
      setConfirmDialogOpen(false);
      toast.error(err?.message || 'Gagal memproses reset password.');
    },
  });

  const handleClose = () => {
    setMethod('AUTOMATIC');
    setManualPassword('');
    setConfirmPassword('');
    setReason('');
    setRevokeSessions(true);
    setExpirationHours(24);
    setResultData(null);
    setConfirmDialogOpen(false);
    onClose();
  };

  const copyText = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Kredensial sementara disalin ke clipboard.');
  };

  return (
    <>
      <ModalDialog
        open={user !== null}
        onClose={handleClose}
        title="Manajemen Kredensial & Reset Password"
        description="Terbitkan password sementara, paksa pembaruan saat login, dan cabut sesi aktif pengguna."
        maxWidth="max-w-2xl"
      >
        {user && resultData ? (
          <div className="space-y-4">
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl space-y-3">
              <div className="flex items-start gap-2.5">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-sm font-bold text-emerald-950">
                    Password Sementara Berhasil Diterbitkan
                  </h4>
                  <p className="text-xs text-emerald-800 mt-0.5">
                    Pengguna <strong>{user.fullName}</strong> wajib mengganti password saat masuk
                    berikutnya. Berlaku hingga{' '}
                    <strong>{formatDateTime(resultData.expiresAt)}</strong>.
                  </p>
                </div>
              </div>

              {resultData.temporaryPassword && (
                <div className="p-3 bg-white border border-emerald-300 rounded-lg space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-700">
                      Password Sementara (Tampil Satu Kali)
                    </span>
                    <button
                      type="button"
                      onClick={() => setRevealGenerated((v) => !v)}
                      className="text-indigo-600 hover:underline inline-flex items-center gap-1"
                    >
                      {revealGenerated ? (
                        <>
                          <EyeOff className="w-3.5 h-3.5" /> Sembunyikan
                        </>
                      ) : (
                        <>
                          <Eye className="w-3.5 h-3.5" /> Tampilkan
                        </>
                      )}
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      readOnly
                      type={revealGenerated ? 'text' : 'password'}
                      value={resultData.temporaryPassword}
                      className="flex-1 px-3 py-2 text-sm font-mono bg-slate-50 border border-slate-200 rounded-lg text-slate-900"
                    />
                    <Button
                      size="sm"
                      onClick={() => copyText(resultData.temporaryPassword!)}
                      className="gap-1.5"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      Salin
                    </Button>
                  </div>
                  <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded px-2.5 py-1.5">
                    Panduan Keamanan: Kredensial ini tidak disimpan dalam bentuk plaintext di
                    database atau log audit. Sampaikan hanya melalui saluran komunikasi internal
                    yang aman kepada pemilik akun.
                  </p>
                </div>
              )}

              {resultData.method === 'IDENTITY_BASED' && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900">
                  Password sementara disetel menggunakan{' '}
                  <strong>{resultData.identityTypeUsed || 'Identitas Akademik'}</strong> pengguna.
                  Pengguna dipaksa mengganti password segera setelah login dan seluruh sesi lama
                  telah dicabut.
                </div>
              )}

              {resultData.method === 'MANUAL' && (
                <div className="p-3 bg-white border border-emerald-200 rounded-lg text-xs text-slate-700">
                  Password sementara manual telah di-hash dengan Argon2id dan diterapkan. Seluruh
                  sesi sebelumnya {resultData.sessionsRevoked ? 'telah dicabut' : 'tetap aktif'}.
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setResultData(null)}>
                Generate Ulang
              </Button>
              <Button onClick={handleClose} className="bg-[#14213D] hover:bg-[#1d2f54]">
                Selesai
              </Button>
            </div>
          </div>
        ) : (
          user && (
            <div className="space-y-5">
              {/* Section 1: Account Information */}
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  1. Informasi Akun Target
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-slate-500">Nama Lengkap:</span>{' '}
                    <span className="font-semibold text-slate-900">{user.fullName}</span>
                  </div>
                  <div>
                    <span className="text-slate-500">Email:</span>{' '}
                    <span className="font-medium text-slate-800">{user.email}</span>
                  </div>
                  <div>
                    <span className="text-slate-500">Identitas Utama:</span>{' '}
                    <span className="font-mono font-semibold text-slate-800">
                      {resolvedIdentity
                        ? `${resolvedIdentity.label}: ${resolvedIdentity.value}`
                        : 'Tidak tersedia'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-slate-500">Peran & Status:</span>
                    <span className="px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 font-medium">
                      {user.roles?.[0] || 'MAHASISWA'}
                    </span>
                    <span className="px-2 py-0.5 rounded-full bg-slate-200 text-slate-700 font-medium">
                      {user.accountStatus}
                    </span>
                  </div>
                </div>
              </div>

              {/* Section 2: Password Generation Method */}
              <div className="space-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  2. Metode Pembuatan Password Sementara
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setMethod('AUTOMATIC')}
                    className={`text-left p-3 rounded-xl border transition-all ${
                      method === 'AUTOMATIC'
                        ? 'border-indigo-500 bg-indigo-50/50 ring-2 ring-indigo-500/15'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900">
                      <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                      Otomatis (16-Char)
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1">
                      Kriptografis acak aman, tampil satu kali setelah reset.
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setMethod('MANUAL')}
                    className={`text-left p-3 rounded-xl border transition-all ${
                      method === 'MANUAL'
                        ? 'border-indigo-500 bg-indigo-50/50 ring-2 ring-indigo-500/15'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900">
                      <KeyRound className="w-3.5 h-3.5 text-indigo-600" />
                      Manual
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1">
                      Tetapkan password sementara sesuai kebijakan keamanan.
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setMethod('IDENTITY_BASED')}
                    className={`text-left p-3 rounded-xl border transition-all ${
                      method === 'IDENTITY_BASED'
                        ? 'border-amber-500 bg-amber-50/50 ring-2 ring-amber-500/15'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900">
                      <UserCheck className="w-3.5 h-3.5 text-amber-600" />
                      Identitas Akademik
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1">
                      Gunakan NIM / NIDN / NIP sebagai bootstrap sementara.
                    </p>
                  </button>
                </div>
              </div>

              {/* Section 3: Password Configuration */}
              <div className="space-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  3. Konfigurasi Kredensial
                </p>

                {method === 'AUTOMATIC' && (
                  <div className="p-3.5 bg-indigo-50/50 border border-indigo-200 rounded-xl text-xs text-indigo-950 space-y-1">
                    <p className="font-semibold">
                      Generator Kriptografis 16-Karakter (Default Rekomendasi)
                    </p>
                    <p className="text-indigo-800">
                      Sistem akan menghasilkan password acak 16 karakter dengan huruf kapital, huruf
                      kecil, angka, dan simbol tanpa karakter ambigu. Password akan ditampilkan satu
                      kali setelah konfirmasi.
                    </p>
                  </div>
                )}

                {method === 'MANUAL' && (
                  <div className="p-3.5 bg-white border border-slate-200 rounded-xl space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">
                          Password Sementara Baru *
                        </label>
                        <div className="relative">
                          <Input
                            type={showManual ? 'text' : 'password'}
                            value={manualPassword}
                            onChange={(e) => setManualPassword(e.target.value)}
                            placeholder="Minimal 12 karakter"
                            className="pr-9"
                          />
                          <button
                            type="button"
                            onClick={() => setShowManual((v) => !v)}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                          >
                            {showManual ? (
                              <EyeOff className="w-4 h-4" />
                            ) : (
                              <Eye className="w-4 h-4" />
                            )}
                          </button>
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">
                          Konfirmasi Password Sementara *
                        </label>
                        <div className="relative">
                          <Input
                            type={showConfirm ? 'text' : 'password'}
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            placeholder="Ulangi password sementara"
                            className="pr-9"
                          />
                          <button
                            type="button"
                            onClick={() => setShowConfirm((v) => !v)}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                          >
                            {showConfirm ? (
                              <EyeOff className="w-4 h-4" />
                            ) : (
                              <Eye className="w-4 h-4" />
                            )}
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <div className="flex justify-between text-[11px] text-slate-600">
                        <span>Kekuatan Password</span>
                        <span className="font-semibold">{manualStrengthPct}%</span>
                      </div>
                      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full transition-all ${
                            manualStrengthPct >= 100
                              ? 'bg-emerald-600'
                              : manualStrengthPct >= 60
                                ? 'bg-amber-500'
                                : 'bg-rose-500'
                          }`}
                          style={{ width: `${manualStrengthPct}%` }}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                      {manualChecks.map((c) => (
                        <div
                          key={c.label}
                          className={`flex items-center gap-1.5 text-[11px] ${
                            c.ok ? 'text-emerald-700 font-medium' : 'text-slate-500'
                          }`}
                        >
                          {c.ok ? (
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                          ) : (
                            <Circle className="w-3.5 h-3.5 text-slate-300 shrink-0" />
                          )}
                          <span>{c.label}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {method === 'IDENTITY_BASED' && (
                  <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl space-y-2 text-xs">
                    <div className="flex items-start gap-2 text-amber-950">
                      <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                      <div>
                        <p className="font-bold">Peringatan Keamanan Kredensial Identitas</p>
                        <p className="text-amber-800 mt-0.5">
                          Password berbasis identitas bersifat bootstrap sementara. Sistem otomatis
                          memaksa ganti password saat login pertama, mencabut semua sesi aktif, dan
                          menetapkan masa kedaluwarsa.
                        </p>
                      </div>
                    </div>
                    {resolvedIdentity ? (
                      <div className="px-3 py-2 bg-white border border-amber-200 rounded-lg font-mono text-slate-800">
                        Sumber Identitas: <strong>{resolvedIdentity.label}</strong> (
                        {resolvedIdentity.value})
                      </div>
                    ) : (
                      <div className="px-3 py-2 bg-rose-50 border border-rose-200 rounded-lg text-rose-800 font-medium">
                        Pengguna ini tidak memiliki NIM, NIDN, NIP, atau Nomor Identitas di database.
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Section 4: Security Enforcement */}
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  4. Penegakan Keamanan
                </p>
                <div className="space-y-2 text-xs text-slate-700">
                  <label className="flex items-center gap-2 font-medium text-slate-900">
                    <input type="checkbox" checked readOnly disabled />
                    Wajib ganti password saat login berikutnya (Wajib untuk reset administratif)
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={method === 'IDENTITY_BASED' ? true : revokeSessions}
                      disabled={method === 'IDENTITY_BASED'}
                      onChange={(e) => setRevokeSessions(e.target.checked)}
                    />
                    Cabut seluruh sesi aktif & invalidasi token sesi sebelumnya
                  </label>
                  <div className="flex items-center gap-3 pt-1">
                    <label className="text-slate-600">Masa berlaku password sementara:</label>
                    <select
                      value={expirationHours}
                      onChange={(e) => setExpirationHours(Number(e.target.value))}
                      className="px-2.5 py-1 border border-slate-200 rounded-lg bg-white text-xs"
                    >
                      <option value={6}>6 Jam</option>
                      <option value={12}>12 Jam</option>
                      <option value={24}>24 Jam (Rekomendasi)</option>
                      <option value={48}>48 Jam</option>
                      <option value={72}>72 Jam</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Section 5: Reset Reason */}
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1">
                  5. Alasan Reset Password (Audit Log)
                </label>
                <Input
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Contoh: Pengguna lupa password / rotasi keamanan berkala"
                />
              </div>

              {/* Footer Actions */}
              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <Button variant="outline" onClick={handleClose}>
                  Batal
                </Button>
                <Button
                  variant="destructive"
                  disabled={!canProceed}
                  onClick={() => setConfirmDialogOpen(true)}
                  className="gap-1.5"
                >
                  <Lock className="w-4 h-4" />
                  Proses Reset Password
                </Button>
              </div>
            </div>
          )
        )}
      </ModalDialog>

      <ConfirmDialog
        open={confirmDialogOpen}
        onClose={() => setConfirmDialogOpen(false)}
        onConfirm={() => resetMutation.mutate()}
        title="Konfirmasi Reset Password Administratif"
        description={`Terbitkan password sementara (${method}) untuk ${user?.fullName || 'pengguna ini'}? Tindakan ini akan dicatat di audit log dan memaksa pengguna mengganti password saat masuk.`}
        confirmLabel="Ya, Terbitkan Password"
        variant="destructive"
        isLoading={resetMutation.isPending}
      />
    </>
  );
}
