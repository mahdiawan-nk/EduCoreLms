import React, { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  FileSpreadsheet,
  Download,
  UploadCloud,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  XCircle,
  ArrowRight,
  ArrowLeft,
} from 'lucide-react';
import { toast } from 'sonner';
import { apiFetch } from '../../lib/api';
import { Button, Input, Card } from '../ui/primitives';

interface PreviewResponse {
  filename: string;
  detectedFormat: 'XLSX' | 'CSV';
  delimiter: ',' | ';';
  fingerprint: string;
  columns: string[];
  totalRows: number;
  validCount: number;
  invalidCount: number;
  previewRows: Array<{
    rowNumber: number;
    externalQuestionId: string;
    questionType: string;
    promptText: string;
    difficulty: string;
    points: number;
  }>;
  validRows: unknown[];
  validationErrors: Array<{
    rowNumber: number;
    externalQuestionId: string;
    field: string;
    message: string;
  }>;
}

interface ImportJob {
  id: string;
  filename: string;
  fileFormat: string;
  importMode: string;
  status: string;
  batchSize: number;
  totalRows: number;
  processedRows: number;
  successfulRows: number;
  failedRows: number;
  skippedRows: number;
  errorReport?: Array<{ rowNumber: number; field: string; message: string }>;
  createdAt: string;
}

const STEPS = [
  '1. Unggah Berkas',
  '2. Deteksi Format',
  '3. Pemetaan Kolom',
  '4. Pratinjau Data',
  '5. Validasi Soal',
  '6. Tinjau Error',
  '7. Konfirmasi Import',
  '8. Proses Latar Belakang',
  '9. Ringkasan Import',
];

export function QuestionImportCenterPanel({
  classroomId,
  assessmentId,
  onImportCompleted,
}: {
  classroomId: string;
  assessmentId?: string;
  onImportCompleted?: () => void;
}) {
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<number>(1);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [importMode, setImportMode] = useState<
    'SKIP_DUPLICATES' | 'INSERT_ONLY' | 'UPDATE_OWNED_QUESTIONS'
  >('SKIP_DUPLICATES');
  const [batchSize, setBatchSize] = useState<number>(100);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);

  const { data: jobsData } = useQuery<{ jobs: ImportJob[] }>({
    queryKey: ['question-import-jobs'],
    queryFn: () => apiFetch<{ jobs: ImportJob[] }>('/api/v1/question-imports/jobs'),
  });

  const { data: activeJob } = useQuery<ImportJob>({
    queryKey: ['question-import-job', activeJobId],
    queryFn: () => apiFetch<ImportJob>(`/api/v1/question-imports/jobs/${activeJobId}`),
    enabled: Boolean(activeJobId),
    refetchInterval: (query) => {
      const st = query.state.data?.status;
      if (st === 'PENDING' || st === 'PROCESSING') return 1000;
      if (st === 'COMPLETED' && step === 8) {
        setStep(9);
        queryClient.invalidateQueries({ queryKey: ['question-repository'] });
        queryClient.invalidateQueries({ queryKey: ['question-import-jobs'] });
        onImportCompleted?.();
      }
      return false;
    },
  });

  const handleFileUpload = async (file: File) => {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const data = await apiFetch<PreviewResponse>('/api/v1/question-imports/preview', {
        method: 'POST',
        body: fd,
      });
      setPreview(data);
      setStep(2);
      toast.success(`Berkas ${file.name} berhasil dipindai (${data.totalRows} baris).`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Gagal memproses berkas.');
    } finally {
      setUploading(false);
    }
  };

  const startJobMutation = useMutation({
    mutationFn: () =>
      apiFetch<{ jobId: string }>('/api/v1/question-imports/jobs', {
        method: 'POST',
        body: JSON.stringify({
          classroomId,
          assessmentId: assessmentId || null,
          filename: preview!.filename,
          fileFormat: preview!.detectedFormat,
          importMode,
          fingerprint: preview!.fingerprint,
          batchSize,
          rows: preview!.validRows,
        }),
      }),
    onSuccess: (res) => {
      setActiveJobId(res.jobId);
      setStep(8);
      toast.success('Import berjalan di latar belakang per batch.');
    },
    onError: (err: Error) => toast.error(err.message || 'Gagal memulai import.'),
  });

  const retryMutation = useMutation({
    mutationFn: (jobId: string) =>
      apiFetch(`/api/v1/question-imports/jobs/${jobId}/retry`, {
        method: 'POST',
        body: JSON.stringify({}),
      }),
    onSuccess: () => {
      toast.success('Batch yang gagal dijadwalkan ulang.');
      queryClient.invalidateQueries({ queryKey: ['question-import-job', activeJobId] });
    },
  });

  return (
    <div className="space-y-6">
      {/* Templates Download */}
      <Card className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-50/70">
        <div>
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <FileSpreadsheet className="h-4 w-4 text-emerald-700" />
            Templat Resmi Import Soal (XLSX & CSV)
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Unduh templat 4-worksheet XLSX (Petunjuk, Soal, Opsi_Jawaban, Rubrik) atau CSV (UTF-8 BOM). Mendukung &gt;200 soal per berkas.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 shrink-0">
          <a
            href="/api/v1/question-imports/templates/xlsx"
            className="inline-flex items-center px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            <Download className="h-3.5 w-3.5 mr-1.5" />
            Unduh Templat XLSX
          </a>
          <a
            href="/api/v1/question-imports/templates/csv"
            className="inline-flex items-center px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            <Download className="h-3.5 w-3.5 mr-1.5" />
            Unduh Templat CSV
          </a>
        </div>
      </Card>

      {/* 9-Step Wizard */}
      <Card className="p-6 space-y-5">
        <div className="flex flex-wrap gap-1.5 pb-4 border-b border-slate-100">
          {STEPS.map((label, idx) => {
            const num = idx + 1;
            const active = step === num;
            const done = step > num;
            return (
              <span
                key={label}
                className={`px-2.5 py-1 rounded-full text-[11px] font-semibold ${
                  active
                    ? 'bg-slate-900 text-white'
                    : done
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'bg-slate-100 text-slate-500'
                }`}
              >
                {label}
              </span>
            );
          })}
        </div>

        {step === 1 && (
          <div className="py-8 text-center border-2 border-dashed border-slate-300 rounded-xl bg-slate-50/50 space-y-3">
            <UploadCloud className="h-10 w-10 text-slate-400 mx-auto" />
            <div>
              <p className="text-sm font-semibold text-slate-800">
                Unggah Berkas Soal (.xlsx atau .csv)
              </p>
              <p className="text-xs text-slate-500 mt-0.5">
                Mendukung UTF-8, UTF-8 BOM, delimiter koma (,) maupun titik koma (;), serta ratusan soal.
              </p>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleFileUpload(f);
                e.target.value = '';
              }}
            />
            <Button type="button" onClick={() => fileRef.current?.click()} disabled={uploading}>
              {uploading ? 'Memindai Berkas...' : 'Pilih Berkas XLSX / CSV'}
            </Button>
          </div>
        )}

        {step >= 2 && step <= 7 && preview && (
          <div className="space-y-4">
            {step === 2 && (
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-1.5">
                <div className="font-bold text-slate-900">Deteksi Format Otomatis</div>
                <div>Nama Berkas: <strong>{preview.filename}</strong></div>
                <div>Format Terdeteksi: <strong>{preview.detectedFormat}</strong></div>
                {preview.detectedFormat === 'CSV' && (
                  <div>Delimiter Terdeteksi: <strong>{preview.delimiter === ';' ? 'Titik Koma (;)' : 'Koma (,)'}</strong></div>
                )}
                <div>Total Baris Terbaca: <strong>{preview.totalRows}</strong></div>
              </div>
            )}

            {step === 3 && (
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-2">
                <div className="font-bold text-slate-900">Pemetaan Kolom Terdeteksi</div>
                <div className="flex flex-wrap gap-1.5">
                  {preview.columns.map((col) => (
                    <span
                      key={col}
                      className="px-2 py-1 rounded bg-white border border-slate-200 font-mono text-[11px]"
                    >
                      {col}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {step === 4 && (
              <div className="overflow-x-auto border border-slate-200 rounded-lg">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                    <tr>
                      <th className="px-3 py-2">Baris</th>
                      <th className="px-3 py-2">ID Eksternal</th>
                      <th className="px-3 py-2">Tipe</th>
                      <th className="px-3 py-2">Pertanyaan</th>
                      <th className="px-3 py-2">Kesulitan</th>
                      <th className="px-3 py-2">Poin</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {preview.previewRows.map((r) => (
                      <tr key={r.rowNumber}>
                        <td className="px-3 py-2">{r.rowNumber}</td>
                        <td className="px-3 py-2 font-mono">{r.externalQuestionId}</td>
                        <td className="px-3 py-2">{r.questionType}</td>
                        <td className="px-3 py-2 max-w-xs truncate">{r.promptText}</td>
                        <td className="px-3 py-2">{r.difficulty}</td>
                        <td className="px-3 py-2">{r.points}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {(step === 5 || step === 6) && (
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-3 text-xs">
                  <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                    <div className="text-slate-500">Total Baris</div>
                    <div className="text-lg font-bold text-slate-900">{preview.totalRows}</div>
                  </div>
                  <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200">
                    <div className="text-emerald-700">Baris Valid</div>
                    <div className="text-lg font-bold text-emerald-800">{preview.validCount}</div>
                  </div>
                  <div className="p-3 rounded-lg bg-rose-50 border border-rose-200">
                    <div className="text-rose-700">Baris Bermasalah</div>
                    <div className="text-lg font-bold text-rose-800">{preview.invalidCount}</div>
                  </div>
                </div>

                {preview.validationErrors.length > 0 && (
                  <div className="max-h-56 overflow-y-auto border border-rose-200 rounded-lg divide-y divide-rose-100 bg-rose-50/40 text-xs">
                    {preview.validationErrors.map((err, i) => (
                      <div key={i} className="px-3 py-2 text-rose-800">
                        <strong>Baris {err.rowNumber}</strong> ({err.field}): {err.message}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {step === 7 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Mode Import</label>
                  <select
                    value={importMode}
                    onChange={(e) =>
                      setImportMode(
                        e.target.value as
                          | 'SKIP_DUPLICATES'
                          | 'INSERT_ONLY'
                          | 'UPDATE_OWNED_QUESTIONS'
                      )
                    }
                    className="w-full h-9 rounded-lg border border-slate-300 bg-white px-2.5"
                  >
                    <option value="SKIP_DUPLICATES">SKIP_DUPLICATES (Default Produksi)</option>
                    <option value="INSERT_ONLY">INSERT_ONLY (Tolak ID Duplikat)</option>
                    <option value="UPDATE_OWNED_QUESTIONS">UPDATE_OWNED_QUESTIONS (Perbarui Milik Sendiri)</option>
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Ukuran Batch (Baris per Transaksi)
                  </label>
                  <Input
                    type="number"
                    min={10}
                    max={250}
                    value={batchSize}
                    onChange={(e) => setBatchSize(Number(e.target.value) || 100)}
                  />
                </div>
              </div>
            )}

            <div className="flex items-center justify-between pt-3 border-t border-slate-100">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => (step === 2 ? setStep(1) : setStep((s) => s - 1))}
              >
                <ArrowLeft className="h-3.5 w-3.5 mr-1.5" />
                Kembali
              </Button>
              {step < 7 ? (
                <Button type="button" size="sm" onClick={() => setStep((s) => s + 1)}>
                  Lanjut
                  <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
                </Button>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  disabled={preview.validCount === 0 || startJobMutation.isPending}
                  onClick={() => startJobMutation.mutate()}
                >
                  {startJobMutation.isPending
                    ? 'Memulai Import...'
                    : `Konfirmasi & Import ${preview.validCount} Soal`}
                </Button>
              )}
            </div>
          </div>
        )}

        {(step === 8 || step === 9) && activeJob && (
          <div className="space-y-4 text-xs">
            <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-900">
                  Status Job: {activeJob.status}
                </span>
                <span className="text-slate-600">
                  {activeJob.processedRows} / {activeJob.totalRows} baris
                </span>
              </div>
              <div className="w-full h-2.5 bg-slate-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-600 transition-all"
                  style={{
                    width: `${
                      activeJob.totalRows > 0
                        ? Math.round((activeJob.processedRows / activeJob.totalRows) * 100)
                        : 0
                    }%`,
                  }}
                />
              </div>
              <div className="grid grid-cols-3 gap-2 pt-2">
                <div className="text-emerald-700 font-semibold">
                  Berhasil: {activeJob.successfulRows}
                </div>
                <div className="text-amber-700 font-semibold">
                  Dilewati: {activeJob.skippedRows}
                </div>
                <div className="text-rose-700 font-semibold">
                  Gagal: {activeJob.failedRows}
                </div>
              </div>
            </div>

            <div className="flex gap-2">
              {activeJob.failedRows > 0 && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => retryMutation.mutate(activeJob.id)}
                >
                  <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                  Ulangi Batch Gagal
                </Button>
              )}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setPreview(null);
                  setActiveJobId(null);
                  setStep(1);
                }}
              >
                Import Berkas Lain
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* Import History */}
      {jobsData && jobsData.jobs.length > 0 && (
        <Card className="p-5 space-y-3">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
            Riwayat Import Soal Terakhir
          </h4>
          <div className="overflow-x-auto border border-slate-200 rounded-lg">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                <tr>
                  <th className="px-3 py-2">Berkas</th>
                  <th className="px-3 py-2">Format</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Berhasil / Total</th>
                  <th className="px-3 py-2">Waktu</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {jobsData.jobs.map((j) => (
                  <tr key={j.id}>
                    <td className="px-3 py-2 font-medium text-slate-900">{j.filename}</td>
                    <td className="px-3 py-2">{j.fileFormat}</td>
                    <td className="px-3 py-2">{j.status}</td>
                    <td className="px-3 py-2">
                      {j.successfulRows} / {j.totalRows}
                    </td>
                    <td className="px-3 py-2 text-slate-500">
                      {new Date(j.createdAt).toLocaleString('id-ID')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
