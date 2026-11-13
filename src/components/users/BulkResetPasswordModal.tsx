import React, { useEffect, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import {
  KeyRound,
  Sparkles,
  UserCheck,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Copy,
  Lock,
} from 'lucide-react';
import { Button, Input, ModalDialog, ConfirmDialog } from '../ui/primitives';
import { apiRequest } from '../../lib/api';
import { formatDateTime } from '../../lib/utils';
import { toast } from 'sonner';

interface BulkResetPasswordModalProps {
  userIds: string[];
  open: boolean;
  onClose: () => void;
  onSuccessRefresh: () => void;
}

interface PreviewItem {
  userId: string;
  fullName: string;
  email: string;
  roleCode: string;
  identityType: string | null;
  eligible: boolean;
  reason: string | null;
}

interface ExecutionResultItem {
  userId: string;
  fullName: string;
  email: string;
  status: 'SUCCESS' | 'FAILED';
  message: string;
  temporaryPassword?: string | null;
  identityTypeUsed?: string | null;
}

export function BulkResetPasswordModal({
  userIds,
  open,
  onClose,
  onSuccessRefresh,
}: BulkResetPasswordModalProps) {
  const [method, setMethod] = useState<'AUTOMATIC' | 'IDENTITY_BASED'>('AUTOMATIC');
  const [revokeSessions, setRevokeSessions] = useState(true);
  const [expirationHours, setExpirationHours] = useState(24);
  const [reason, setReason] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);

  const [preview, setPreview] = useState<{
    totalSelected: number;
    eligibleCount: number;
    ineligibleCount: number;
    items: PreviewItem[];
  } | null>(null);

  const [executionResult, setExecutionResult] = useState<{
    method: string;
    expiresAt: string;
    totalRequested: number;
    successCount: number;
    failedCount: number;
    results: ExecutionResultItem[];
  } | null>(null);

  const previewMutation = useMutation({
    mutationFn: (selectedMethod: 'AUTOMATIC' | 'IDENTITY_BASED') =>
      apiRequest<{
        totalSelected: number;
        eligibleCount: number;
        ineligibleCount: number;
        items: PreviewItem[];
      }>('/api/v1/users/bulk-reset-password', {
        method: 'POST',
        body: JSON.stringify({
          userIds,
          method: selectedMethod,
          previewOnly: true,
        }),
      }),
    onSuccess: (res) => {
      setPreview(res.data);
    },
    onError: (err: any) => {
      toast.error(err?.message || 'Gagal memuat pratinjau bulk reset.');
    },
  });

  useEffect(() => {
    if (open && userIds.length > 0 && !executionResult) {
      previewMutation.mutate(method);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, method, userIds.length]);

  const executeMutation = useMutation({
    mutationFn: () =>
      apiRequest<{
        method: string;
        expiresAt: string;
        totalRequested: number;
        successCount: number;
        failedCount: number;
        results: ExecutionResultItem[];
      }>('/api/v1/users/bulk-reset-password', {
        method: 'POST',
        body: JSON.stringify({
          userIds,
          method,
          revokeSessions: method === 'IDENTITY_BASED' ? true : revokeSessions,
          expirationHours,
          reason: reason.trim() || undefined,
          previewOnly: false,
        }),
      }),
    onSuccess: (res) => {
      setConfirmOpen(false);
      setExecutionResult(res.data);
      toast.success(
        `Bulk reset selesai: ${res.data.successCount} berhasil, ${res.data.failedCount} dilewati/gagal.`
      );
      onSuccessRefresh();
    },
    onError: (err: any) => {
      setConfirmOpen(false);
      toast.error(err?.message || 'Gagal menjalankan bulk reset password.');
    },
  });

  const handleClose = () => {
    setPreview(null);
    setExecutionResult(null);
    setConfirmOpen(false);
    setReason('');
    onClose();
  };

  const copyText = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Disalin ke clipboard.');
  };

  return (
    <>
      <ModalDialog
        open={open}
        onClose={handleClose}
        title="Reset Password Massal (Bulk Security Reset)"
        description={`Kelola reset kredensial sementara untuk ${userIds.length} akun pengguna terpilih.`}
        maxWidth="max-w-3xl"
      >
        {executionResult ? (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                <p className="text-[11px] text-slate-500">Total Dipilih</p>
                <p className="text-xl font-bold text-slate-900">{executionResult.totalRequested}</p>
              </div>
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl">
                <p className="text-[11px] text-emerald-700">Berhasil Direset</p>
                <p className="text-xl font-bold text-emerald-900">{executionResult.successCount}</p>
              </div>
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl">
                <p className="text-[11px] text-rose-700">Gagal / Dilewati</p>
                <p className="text-xl font-bold text-rose-900">{executionResult.failedCount}</p>
              </div>
            </div>

            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900">
              Password sementara berlaku hingga{' '}
              <strong>{formatDateTime(executionResult.expiresAt)}</strong>. Laporan audit tidak
              menyimpan password plaintext; salin kredensial yang diperlukan sekarang sebelum
              menutup jendela ini.
            </div>

            <div className="max-h-72 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100">
              {executionResult.results.map((r) => (
                <div
                  key={r.userId}
                  className="p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      {r.status === 'SUCCESS' ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      ) : (
                        <XCircle className="w-4 h-4 text-rose-500 shrink-0" />
                      )}
                      <span className="font-semibold text-slate-900 truncate">{r.fullName}</span>
                    </div>
                    <p className="text-slate-500 truncate pl-5">
                      {r.email} — {r.message}
                    </p>
                  </div>

                  {r.temporaryPassword && (
                    <div className="flex items-center gap-1.5 pl-5 sm:pl-0 shrink-0">
                      <code className="px-2 py-1 bg-slate-100 border border-slate-200 rounded font-mono text-[11px]">
                        {r.temporaryPassword}
                      </code>
                      <button
                        type="button"
                        onClick={() => copyText(r.temporaryPassword!)}
                        className="p-1.5 text-slate-500 hover:text-indigo-600 rounded hover:bg-indigo-50"
                        title="Salin password sementara"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="flex justify-end">
              <Button onClick={handleClose} className="bg-[#14213D] hover:bg-[#1d2f54]">
                Selesai
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setMethod('AUTOMATIC')}
                className={`text-left p-3 rounded-xl border transition-all ${
                  method === 'AUTOMATIC'
                    ? 'border-indigo-500 bg-indigo-50/50 ring-2 ring-indigo-500/15'
                    : 'border-slate-200 bg-white'
                }`}
              >
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900">
                  <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                  Otomatis Unik per Pengguna (16-Char)
                </div>
                <p className="text-[11px] text-slate-500 mt-1">
                  Menghasilkan password kriptografis unik yang berbeda untuk setiap akun.
                </p>
              </button>

              <button
                type="button"
                onClick={() => setMethod('IDENTITY_BASED')}
                className={`text-left p-3 rounded-xl border transition-all ${
                  method === 'IDENTITY_BASED'
                    ? 'border-amber-500 bg-amber-50/50 ring-2 ring-amber-500/15'
                    : 'border-slate-200 bg-white'
                }`}
              >
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900">
                  <UserCheck className="w-3.5 h-3.5 text-amber-600" />
                  Berbasis Identitas (NIM/NIDN/NIP)
                </div>
                <p className="text-[11px] text-slate-500 mt-1">
                  Password sementara bootstrap dari NIM/NIDN/NIP masing-masing akun.
                </p>
              </button>
            </div>

            {method === 'IDENTITY_BASED' && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-2 text-xs text-amber-900">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <span>
                  Mode identitas hanya berlaku sebagai kredensial sementara. Pengguna wajib mengganti
                  password saat login pertama dan seluruh sesi aktif akan dicabut.
                </span>
              </div>
            )}

            {/* Preview List */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-700">Pratinjau Akun Terdampak</span>
                {preview && (
                  <span className="text-slate-600">
                    Memenuhi syarat: <strong>{preview.eligibleCount}</strong> • Dilewati:{' '}
                    <strong>{preview.ineligibleCount}</strong>
                  </span>
                )}
              </div>

              <div className="max-h-52 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100">
                {previewMutation.isPending ? (
                  <div className="p-4 text-center text-xs text-slate-500">
                    Memvalidasi kelayakan akun...
                  </div>
                ) : (
                  (preview?.items || []).map((item) => (
                    <div
                      key={item.userId}
                      className="p-2.5 flex items-center justify-between gap-2 text-xs"
                    >
                      <div className="min-w-0">
                        <p className="font-medium text-slate-900 truncate">{item.fullName}</p>
                        <p className="text-[11px] text-slate-500 truncate">
                          {item.email} • {item.roleCode}
                          {item.identityType ? ` • ${item.identityType}` : ''}
                        </p>
                      </div>
                      {item.eligible ? (
                        <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-medium shrink-0">
                          Siap Direset
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200 text-[11px] font-medium shrink-0">
                          {item.reason || 'Dilewati'}
                        </span>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Security options */}
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2 text-xs">
              <label className="flex items-center gap-2 font-medium text-slate-900">
                <input type="checkbox" checked readOnly disabled />
                Wajib ganti password saat login berikutnya (aktif untuk semua akun)
              </label>
              <label className="flex items-center gap-2 text-slate-700">
                <input
                  type="checkbox"
                  checked={method === 'IDENTITY_BASED' ? true : revokeSessions}
                  disabled={method === 'IDENTITY_BASED'}
                  onChange={(e) => setRevokeSessions(e.target.checked)}
                />
                Cabut seluruh sesi aktif pengguna terdampak
              </label>
              <div className="flex items-center gap-3 pt-1">
                <span className="text-slate-600">Masa berlaku sementara:</span>
                <select
                  value={expirationHours}
                  onChange={(e) => setExpirationHours(Number(e.target.value))}
                  className="px-2.5 py-1 border border-slate-200 rounded-lg bg-white"
                >
                  <option value={6}>6 Jam</option>
                  <option value={12}>12 Jam</option>
                  <option value={24}>24 Jam (Rekomendasi)</option>
                  <option value={48}>48 Jam</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Alasan Reset Massal (Audit Log)
              </label>
              <Input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Contoh: Orientasi mahasiswa baru / rotasi keamanan semester"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <Button variant="outline" onClick={handleClose}>
                Batal
              </Button>
              <Button
                variant="destructive"
                disabled={!preview || preview.eligibleCount === 0}
                onClick={() => setConfirmOpen(true)}
                className="gap-1.5"
              >
                <Lock className="w-4 h-4" />
                Reset {preview?.eligibleCount || 0} Akun
              </Button>
            </div>
          </div>
        )}
      </ModalDialog>

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => executeMutation.mutate()}
        title="Konfirmasi Reset Password Massal"
        description={`Jalankan reset password (${method}) untuk ${preview?.eligibleCount || 0} akun yang memenuhi syarat?`}
        confirmLabel="Ya, Jalankan Bulk Reset"
        variant="destructive"
        isLoading={executeMutation.isPending}
      />
    </>
  );
}
