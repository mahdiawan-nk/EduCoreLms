import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  FileSpreadsheet,
  Upload,
  Download,
  CheckCircle2,
  AlertTriangle,
  History,
  ArrowRight,
  ArrowLeft,
} from 'lucide-react';
import { Button, ModalDialog, ConfirmDialog } from '../ui/primitives';
import { apiRequest } from '../../lib/api';
import { formatDateTime } from '../../lib/utils';
import { toast } from 'sonner';

interface Props {
  open: boolean;
  onClose: () => void;
  onSuccessRefresh: () => void;
}

type ImportType = 'DOSEN' | 'MAHASISWA' | 'GENERAL';
type ImportMode = 'SKIP_DUPLICATES' | 'CREATE_ONLY' | 'UPSERT';

export function UserImportWizardModal({ open, onClose, onSuccessRefresh }: Props) {
  const queryClient = useQueryClient();
  const [viewMode, setViewMode] = useState<'wizard' | 'history'>('wizard');
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [importType, setImportType] = useState<ImportType>('GENERAL');
  const [importMode, setImportMode] = useState<ImportMode>('SKIP_DUPLICATES');
  const [previewData, setPreviewData] = useState<any>(null);
  const [commitResult, setCommitResult] = useState<any>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const historyQuery = useQuery({
    queryKey: ['admin-user-import-history'],
    queryFn: () => apiRequest<any[]>('/users/import/history'),
    enabled: open && viewMode === 'history',
  });

  const previewMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/v1/users/import/preview', {
        method: 'POST',
        body: formData,
        credentials: 'include',
        headers: {
          'x-csrf-token': document.cookie.match(/pk_lms_csrf=([^;]+)/)?.[1] || '',
        },
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json?.error?.message || 'Gagal memvalidasi file impor.');
      }
      return json.data;
    },
    onSuccess: (data) => {
      setPreviewData(data);
      setStep(3);
      toast.success(`File ${data.filename} berhasil divalidasi (${data.totalRows} baris).`);
    },
    onError: (err: any) => {
      toast.error(err?.message || 'Gagal memproses file impor.');
    },
  });

  const commitMutation = useMutation({
    mutationFn: () => {
      const validRows = (previewData?.rows || [])
        .filter((r: any) => r.isValid)
        .map((r: any) => ({
          rowNumber: r.rowNumber,
          fullName: r.fullName,
          email: r.email,
          identityNumber: r.identityNumber,
          roleCode: r.roleCode,
          studyProgram: r.studyProgram,
          organizationalUnit: r.organizationalUnit,
          phone: r.phone,
          academicTitle: r.academicTitle,
          admissionYear: r.admissionYear,
          accountStatus: r.accountStatus,
        }));

      return apiRequest<any>('/users/import/commit', {
        method: 'POST',
        body: JSON.stringify({
          filename: previewData.filename,
          fingerprint: previewData.fingerprint,
          importType,
          importMode,
          rows: validRows,
        }),
      });
    },
    onSuccess: (res) => {
      setConfirmOpen(false);
      setCommitResult(res.data);
      setStep(4);
      queryClient.invalidateQueries({ queryKey: ['admin-user-import-history'] });
      onSuccessRefresh();
      toast.success('Impor pengguna massal selesai diproses.');
    },
    onError: (err: any) => {
      setConfirmOpen(false);
      toast.error(err?.message || 'Gagal menjalankan impor pengguna.');
    },
  });

  const handleDownloadTemplate = (templateType: string) => {
    window.open(
      `/api/v1/users/import/templates/${templateType}`,
      '_blank',
      'noopener,noreferrer'
    );
  };

  const resetWizard = () => {
    setStep(1);
    setPreviewData(null);
    setCommitResult(null);
    setViewMode('wizard');
  };

  return (
    <>
      <ModalDialog
        open={open}
        onClose={() => {
          resetWizard();
          onClose();
        }}
        title="Import Pengguna Massal (Excel & CSV)"
        description="Unggah data Dosen, Mahasiswa, atau Pengguna Umum dalam format .xlsx, .xls, atau .csv."
        maxWidth="max-w-3xl"
      >
        <div className="space-y-4">
          {/* Top Switcher */}
          <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setViewMode('wizard')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
                  viewMode === 'wizard'
                    ? 'bg-[#14213D] text-white'
                    : 'text-[#64748B] hover:bg-[#F7F9FC]'
                }`}
              >
                Wizard Impor
              </button>
              <button
                type="button"
                onClick={() => setViewMode('history')}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
                  viewMode === 'history'
                    ? 'bg-[#14213D] text-white'
                    : 'text-[#64748B] hover:bg-[#F7F9FC]'
                }`}
              >
                <History className="h-3.5 w-3.5" />
                <span>Riwayat Impor</span>
              </button>
            </div>
            {viewMode === 'wizard' && (
              <span className="font-mono text-[11px] font-semibold text-[#64748B]">
                Langkah {step} / 4
              </span>
            )}
          </div>

          {viewMode === 'history' ? (
            <div className="space-y-2.5 max-h-80 overflow-y-auto text-xs">
              {historyQuery.isLoading ? (
                <p className="text-[#64748B] text-center py-6">Memuat riwayat impor...</p>
              ) : (historyQuery.data?.data || []).length === 0 ? (
                <p className="text-[#64748B] text-center py-6">Belum ada riwayat impor massal.</p>
              ) : (
                (historyQuery.data?.data || []).map((b: any) => (
                  <div
                    key={b.id}
                    className="rounded-xl border border-[#E2E8F0] bg-[#F7F9FC] p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                  >
                    <div>
                      <p className="font-bold text-[#172033]">{b.originalFilename}</p>
                      <p className="text-[11px] text-[#64748B]">
                        Tipe: {b.importType} · Mode: {b.importMode} · Oleh: {b.operatorName || 'Admin'}
                      </p>
                    </div>
                    <div className="text-right font-mono text-[11px]">
                      <span className="font-bold text-emerald-700">{b.successfulRecords} berhasil</span>
                      {' · '}
                      <span className="text-amber-700">{b.skippedRecords} dilewati</span>
                      {' · '}
                      <span className="text-red-700">{b.failedRecords} gagal</span>
                      <p className="text-[#64748B] mt-0.5">{formatDateTime(b.createdAt)}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          ) : (
            <>
              {step === 1 && (
                <div className="space-y-4 text-xs">
                  <div>
                    <p className="font-semibold text-[#172033] mb-2">
                      1. Pilih Kategori Pengguna yang Akan Diimpor
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                      {(
                        [
                          { id: 'DOSEN', label: 'Dosen Pengampu', desc: 'NIDN, gelar, unit & prodi' },
                          { id: 'MAHASISWA', label: 'Mahasiswa', desc: 'NIM, angkatan & prodi' },
                          { id: 'GENERAL', label: 'Pengguna Umum', desc: 'Campuran semua peran' },
                        ] as const
                      ).map((opt) => (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => setImportType(opt.id)}
                          className={`text-left rounded-xl border p-3.5 transition-all cursor-pointer ${
                            importType === opt.id
                              ? 'border-[#2563EB] bg-blue-50/50 ring-1 ring-[#2563EB]'
                              : 'border-[#E2E8F0] bg-white hover:border-slate-300'
                          }`}
                        >
                          <p className="font-bold text-[#172033]">{opt.label}</p>
                          <p className="text-[11px] text-[#64748B] mt-0.5">{opt.desc}</p>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-xl border border-[#E2E8F0] bg-[#F7F9FC] p-4 space-y-2.5">
                    <p className="font-semibold text-[#172033] flex items-center gap-1.5">
                      <FileSpreadsheet className="h-4 w-4 text-[#2563EB]" />
                      <span>Unduh Template Resmi (Disertai Panduan Kolom)</span>
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => handleDownloadTemplate('dosen-xlsx')}
                      >
                        <Download className="h-3.5 w-3.5" />
                        <span>Template Dosen (.xlsx)</span>
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => handleDownloadTemplate('mahasiswa-xlsx')}
                      >
                        <Download className="h-3.5 w-3.5" />
                        <span>Template Mahasiswa (.xlsx)</span>
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => handleDownloadTemplate('general-xlsx')}
                      >
                        <Download className="h-3.5 w-3.5" />
                        <span>Pengguna Umum (.xlsx)</span>
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => handleDownloadTemplate('general-csv')}
                      >
                        <Download className="h-3.5 w-3.5" />
                        <span>Template (.csv)</span>
                      </Button>
                    </div>
                  </div>

                  <div className="flex justify-end">
                    <Button
                      type="button"
                      className="bg-[#2563EB] hover:bg-blue-700 text-white"
                      onClick={() => setStep(2)}
                    >
                      <span>Lanjut Unggah File</span>
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}

              {step === 2 && (
                <div className="space-y-4 text-xs">
                  <label className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-[#E2E8F0] bg-[#F7F9FC] p-8 text-center cursor-pointer hover:border-[#2563EB] transition-colors">
                    <Upload className="h-8 w-8 text-[#2563EB] mb-2" />
                    <span className="font-bold text-[#172033]">
                      {previewMutation.isPending
                        ? 'Memvalidasi file dan memeriksa duplikat...'
                        : 'Klik untuk memilih file .xlsx, .xls, atau .csv'}
                    </span>
                    <span className="text-[11px] text-[#64748B] mt-1">
                      Kata sandi tidak pernah diimpor dalam bentuk plaintext; pengguna baru akan menerima status wajib atur kata sandi.
                    </span>
                    <input
                      type="file"
                      accept=".xlsx,.xls,.csv"
                      className="hidden"
                      disabled={previewMutation.isPending}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) previewMutation.mutate(file);
                      }}
                    />
                  </label>

                  <div className="flex justify-between">
                    <Button type="button" variant="outline" onClick={() => setStep(1)}>
                      <ArrowLeft className="h-4 w-4" />
                      <span>Kembali</span>
                    </Button>
                  </div>
                </div>
              )}

              {step === 3 && previewData && (
                <div className="space-y-4 text-xs">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    <div className="rounded-xl border border-[#E2E8F0] bg-[#F7F9FC] p-3">
                      <span className="text-[#64748B]">Total Baris</span>
                      <p className="font-mono text-lg font-bold text-[#172033]">
                        {previewData.totalRows}
                      </p>
                    </div>
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3">
                      <span className="text-emerald-700">Valid</span>
                      <p className="font-mono text-lg font-bold text-emerald-800">
                        {previewData.validRows}
                      </p>
                    </div>
                    <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3">
                      <span className="text-amber-700">Duplikat DB</span>
                      <p className="font-mono text-lg font-bold text-amber-800">
                        {previewData.duplicateRows}
                      </p>
                    </div>
                    <div className="rounded-xl border border-red-200 bg-red-50/60 p-3">
                      <span className="text-red-700">Tidak Valid</span>
                      <p className="font-mono text-lg font-bold text-red-800">
                        {previewData.invalidRows}
                      </p>
                    </div>
                  </div>

                  <div>
                    <label className="block font-semibold text-[#172033] mb-1.5">
                      Kebijakan Penanganan Duplikat
                    </label>
                    <select
                      value={importMode}
                      onChange={(e) => setImportMode(e.target.value as ImportMode)}
                      className="w-full h-9 rounded-lg border border-[#E2E8F0] bg-white px-3 text-xs font-medium text-[#172033]"
                    >
                      <option value="SKIP_DUPLICATES">
                        Lewati Duplikat (Hanya buat pengguna baru)
                      </option>
                      <option value="CREATE_ONLY">
                        Ketat — Tolak baris yang sudah terdaftar
                      </option>
                      <option value="UPSERT">
                        Perbarui Profil Pengguna Lama yang Cocok
                      </option>
                    </select>
                  </div>

                  <div className="max-h-56 overflow-y-auto border border-[#E2E8F0] rounded-xl divide-y divide-[#E2E8F0]">
                    {(previewData.rows || []).slice(0, 50).map((r: any) => (
                      <div
                        key={r.rowNumber}
                        className="px-3 py-2 flex items-start justify-between gap-2 bg-white"
                      >
                        <div className="min-w-0">
                          <p className="font-semibold text-[#172033] truncate">
                            Baris {r.rowNumber}: {r.fullName || '—'} ({r.email || '—'})
                          </p>
                          <p className="text-[11px] text-[#64748B]">
                            {r.roleCode} · {r.identityNumber} · {r.studyProgram}
                          </p>
                          {r.errors?.length > 0 && (
                            <p className="text-[11px] text-red-600 font-medium mt-0.5">
                              Error: {r.errors.join('; ')}
                            </p>
                          )}
                          {r.warnings?.length > 0 && (
                            <p className="text-[11px] text-amber-700 mt-0.5">
                              Catatan: {r.warnings.join('; ')}
                            </p>
                          )}
                        </div>
                        <span
                          className={`shrink-0 rounded px-2 py-0.5 text-[10px] font-bold ${
                            !r.isValid
                              ? 'bg-red-50 text-red-700'
                              : r.isDuplicateDb
                                ? 'bg-amber-50 text-amber-700'
                                : 'bg-emerald-50 text-emerald-700'
                          }`}
                        >
                          {!r.isValid ? 'INVALID' : r.isDuplicateDb ? 'DUPLIKAT' : 'BARU'}
                        </span>
                      </div>
                    ))}
                  </div>

                  <div className="flex justify-between pt-2">
                    <Button type="button" variant="outline" onClick={() => setStep(2)}>
                      <ArrowLeft className="h-4 w-4" />
                      <span>Unggah Ulang</span>
                    </Button>
                    <Button
                      type="button"
                      disabled={previewData.validRows === 0}
                      className="bg-[#2563EB] hover:bg-blue-700 text-white"
                      onClick={() => setConfirmOpen(true)}
                    >
                      <span>Proses Impor ({previewData.validRows} Baris Valid)</span>
                    </Button>
                  </div>
                </div>
              )}

              {step === 4 && commitResult && (
                <div className="space-y-4 text-xs text-center py-4">
                  <CheckCircle2 className="h-10 w-10 text-emerald-600 mx-auto" />
                  <h3 className="text-base font-bold text-[#172033]">
                    Impor Pengguna Selesai Diproses
                  </h3>
                  <div className="grid grid-cols-3 gap-2.5 max-w-md mx-auto">
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                      <span className="text-emerald-700 block">Berhasil</span>
                      <strong className="font-mono text-lg text-emerald-800">
                        {commitResult.successfulRecords}
                      </strong>
                    </div>
                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                      <span className="text-amber-700 block">Dilewati</span>
                      <strong className="font-mono text-lg text-amber-800">
                        {commitResult.skippedRecords}
                      </strong>
                    </div>
                    <div className="rounded-xl border border-red-200 bg-red-50 p-3">
                      <span className="text-red-700 block">Gagal</span>
                      <strong className="font-mono text-lg text-red-800">
                        {commitResult.failedRecords}
                      </strong>
                    </div>
                  </div>
                  {commitResult.errorReport?.length > 0 && (
                    <div className="text-left rounded-xl border border-red-200 bg-red-50/50 p-3 max-h-36 overflow-y-auto">
                      <p className="font-semibold text-red-800 mb-1 flex items-center gap-1">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        Laporan Baris Gagal
                      </p>
                      {commitResult.errorReport.map((e: any, idx: number) => (
                        <p key={idx} className="text-[11px] text-red-700">
                          Baris {e.rowNumber} ({e.email}): {e.reason}
                        </p>
                      ))}
                    </div>
                  )}
                  <Button
                    type="button"
                    className="bg-[#14213D] text-white"
                    onClick={() => {
                      resetWizard();
                      onClose();
                    }}
                  >
                    Tutup Wizard
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </ModalDialog>

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => commitMutation.mutate()}
        title="Konfirmasi Impor Pengguna Massal"
        description={`Sebanyak ${previewData?.validRows ?? 0} baris valid akan diproses dengan mode "${importMode}". Tindakan ini akan dicatat di log audit sistem.`}
        confirmLabel="Jalankan Impor"
        isLoading={commitMutation.isPending}
      />
    </>
  );
}
