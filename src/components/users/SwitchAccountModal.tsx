import React, { useState } from 'react';
import { UserRoundCheck, ShieldAlert } from 'lucide-react';
import { Button, ModalDialog } from '../ui/primitives';

export interface SwitchAccountTarget {
  id: string;
  fullName: string;
  email: string;
  identityNumber: string | null;
  nim?: string | null;
  nidn?: string | null;
  nip?: string | null;
  studyProgram?: string | null;
  organizationalUnit?: string | null;
  roles: string[];
  accountStatus?: string;
  isActive?: boolean;
}

const ROLE_LABEL_MAP: Record<string, string> = {
  SUPERADMIN: 'Superadmin',
  DOSEN: 'Dosen',
  MAHASISWA: 'Mahasiswa',
  AUDITOR: 'Auditor',
};

interface SwitchAccountModalProps {
  target: SwitchAccountTarget | null;
  isSubmitting: boolean;
  onClose: () => void;
  onConfirm: (reason?: string) => Promise<void> | void;
}

export function SwitchAccountModal({
  target,
  isSubmitting,
  onClose,
  onConfirm,
}: SwitchAccountModalProps) {
  const [reason, setReason] = useState('');

  if (!target) return null;

  const identityDisplay =
    target.nim || target.nidn || target.nip || target.identityNumber || '—';
  const primaryRole = target.roles?.[0] || 'MAHASISWA';
  const roleDisplay = ROLE_LABEL_MAP[primaryRole.toUpperCase()] || primaryRole;
  const unitDisplay =
    [target.studyProgram, target.organizationalUnit].filter(Boolean).join(' • ') || '—';

  return (
    <ModalDialog
      open={Boolean(target)}
      onClose={onClose}
      title="Switch Account"
      maxWidth="max-w-lg"
    >
      <div className="space-y-4">
        <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-3.5 flex items-start gap-3">
          <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-950 leading-relaxed">
            Anda akan mengakses LMS sebagai pengguna ini. Seluruh aktivitas selama sesi impersonasi akan tercatat dalam audit log.
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4 space-y-2.5 text-xs">
          <div className="grid grid-cols-3 gap-2">
            <span className="text-slate-500">Nama pengguna</span>
            <span className="col-span-2 font-semibold text-slate-900">{target.fullName}</span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <span className="text-slate-500">Email</span>
            <span className="col-span-2 text-slate-800 break-all">{target.email}</span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <span className="text-slate-500">NIM / NIDN / NIP</span>
            <span className="col-span-2 font-mono font-medium text-slate-800">
              {identityDisplay}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <span className="text-slate-500">Role tujuan</span>
            <span className="col-span-2">
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
                {roleDisplay} ({target.roles?.[0] || 'MAHASISWA'})
              </span>
            </span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <span className="text-slate-500">Program Studi / Unit</span>
            <span className="col-span-2 text-slate-800">{unitDisplay}</span>
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-slate-700 block">
            Alasan Switch Account (Opsional — untuk Audit Log)
          </label>
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Contoh: Troubleshooting akses kelas atau verifikasi kendala mahasiswa"
            className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
          />
        </div>

        <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={isSubmitting}
          >
            Batal
          </Button>
          <Button
            type="button"
            disabled={isSubmitting}
            onClick={async () => {
              await onConfirm(reason.trim() || undefined);
              setReason('');
            }}
            className="bg-amber-600 hover:bg-amber-700 text-white"
          >
            <UserRoundCheck className="w-4 h-4 mr-1.5" />
            {isSubmitting ? 'Memproses...' : 'Lanjutkan sebagai pengguna ini'}
          </Button>
        </div>
      </div>
    </ModalDialog>
  );
}
