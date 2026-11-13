import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Search,
  Database,
  Plus,
  Archive,
  RotateCcw,
  Copy,
  Eye,
  RefreshCw,
  CheckCircle2,
  Clock,
} from 'lucide-react';
import { toast } from 'sonner';
import { apiFetch } from '../../lib/api';
import { Button, Input, Card, Skeleton, ModalDialog } from '../ui/primitives';

interface RepositoryQuestion {
  id: string;
  questionCode: string | null;
  title: string;
  questionMode: string;
  questionType: string;
  topic: string;
  learningOutcome: string;
  difficulty: string;
  promptText: string;
  points: string;
  status: 'DRAFT' | 'READY' | 'ARCHIVED';
  sourceType: string;
  authorId: string;
  authorName: string;
  versionNumber: number;
  usageCount: number;
  versionHistory: unknown[];
  usageHistory: Array<{ assessmentTitle?: string; addedAt?: string }>;
  createdAt: string;
  updatedAt: string;
  options: Array<{ id: string; optionLabel: string; optionText: string; isCorrect: boolean }>;
  media: Array<{ id: string; mediaType: string; objectKey: string; originalName: string }>;
}

interface RepoResponse {
  items: RepositoryQuestion[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

export function QuestionRepositoryPanel({
  classroomId,
  assessmentId,
  assessmentStatus,
  onImportedToAssessment,
  onEditInEditor,
}: {
  classroomId: string;
  assessmentId?: string;
  assessmentStatus?: string;
  onImportedToAssessment: () => void;
  onEditInEditor?: (q: RepositoryQuestion) => void;
}) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [qType, setQType] = useState('ALL');
  const [difficulty, setDifficulty] = useState('ALL');
  const [sourceType, setSourceType] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('READY');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [inspectItem, setInspectItem] = useState<RepositoryQuestion | null>(null);

  const { data, isLoading } = useQuery<RepoResponse>({
    queryKey: [
      'question-repository',
      classroomId,
      search,
      qType,
      difficulty,
      sourceType,
      statusFilter,
    ],
    queryFn: () => {
      const params = new URLSearchParams({
        questionType: qType,
        difficulty,
        sourceType,
        status: statusFilter,
        limit: '50',
      });
      if (search.trim()) params.set('search', search.trim());
      return apiFetch<RepoResponse>(`/api/v1/question-repository?${params.toString()}`);
    },
  });

  const importMutation = useMutation({
    mutationFn: (ids: string[]) =>
      apiFetch<{ importedCount?: number }>(
        `/api/v1/assessments/${assessmentId}/import-from-repository`,
        {
          method: 'POST',
          body: JSON.stringify({ questionIds: ids }),
        }
      ),
    onSuccess: (res: { importedCount?: number }) => {
      toast.success(
        `${res?.importedCount ?? selectedIds.length} soal berhasil disalin ke ujian sebagai snapshot permanen.`
      );
      setSelectedIds([]);
      queryClient.invalidateQueries({ queryKey: ['question-repository'] });
      onImportedToAssessment();
    },
    onError: (err: Error) => toast.error(err.message || 'Gagal mengimpor soal ke ujian.'),
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'DRAFT' | 'READY' | 'ARCHIVED' }) =>
      apiFetch(`/api/v1/question-repository/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      }),
    onSuccess: () => {
      toast.success('Status soal di Bank Soal diperbarui.');
      queryClient.invalidateQueries({ queryKey: ['question-repository'] });
    },
    onError: (err: Error) => toast.error(err.message || 'Gagal mengubah status soal.'),
  });

  const duplicateMutation = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/api/v1/questions/${id}/duplicate`, {
        method: 'POST',
        body: JSON.stringify({}),
      }),
    onSuccess: () => {
      toast.success('Soal berhasil diduplikasi ke Bank Soal.');
      queryClient.invalidateQueries({ queryKey: ['question-repository'] });
    },
    onError: (err: Error) => toast.error(err.message || 'Gagal menduplikasi soal.'),
  });

  const syncSnapshotMutation = useMutation({
    mutationFn: () =>
      apiFetch<{ syncedCount?: number }>(
        `/api/v1/assessments/${assessmentId}/sync-question-snapshots`,
        {
          method: 'POST',
          body: JSON.stringify({}),
        }
      ),
    onSuccess: (res: { syncedCount?: number }) => {
      toast.success(`${res?.syncedCount ?? 0} snapshot soal draf disinkronkan dengan versi terbaru.`);
      onImportedToAssessment();
    },
    onError: (err: Error) => toast.error(err.message || 'Gagal menyinkronkan snapshot soal.'),
  });

  const items = data?.items || [];

  return (
    <div className="space-y-4">
      <Card className="p-5 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div>
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Database className="h-4 w-4 text-blue-700" />
              Bank Soal (Question Repository)
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Seluruh soal berasal dari Editor Soal dan hasil Import Excel/CSV. Penambahan ke ujian membuat snapshot permanen.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {assessmentId && assessmentStatus === 'DRAFT' && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => syncSnapshotMutation.mutate()}
                disabled={syncSnapshotMutation.isPending}
              >
                <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                Sinkronkan Snapshot Draf
              </Button>
            )}
            {assessmentId && selectedIds.length > 0 && (
              <Button
                type="button"
                size="sm"
                onClick={() => importMutation.mutate(selectedIds)}
                disabled={importMutation.isPending}
              >
                <Plus className="h-3.5 w-3.5 mr-1.5" />
                Tambahkan {selectedIds.length} Soal ke Ujian
              </Button>
            )}
          </div>
        </div>

        {/* Filters */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
          <div className="relative lg:col-span-2">
            <Search className="h-3.5 w-3.5 text-slate-400 absolute left-2.5 top-2.5" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari teks soal atau kode (SOAL-...)..."
              className="pl-8 h-9 text-xs"
            />
          </div>
          <select
            value={qType}
            onChange={(e) => setQType(e.target.value)}
            className="h-9 rounded-lg border border-slate-300 bg-white px-2.5 text-xs text-slate-700"
          >
            <option value="ALL">Semua Tipe Soal</option>
            <option value="SINGLE_CHOICE">Pilihan Ganda Tunggal</option>
            <option value="MULTIPLE_SELECT">Pilihan Ganda Kompleks</option>
            <option value="TRUE_FALSE">Benar / Salah</option>
            <option value="SHORT_ANSWER">Jawaban Pendek</option>
            <option value="NUMERIC">Numerik</option>
            <option value="ESSAY_LONG">Esai Panjang</option>
            <option value="CASE_STUDY">Studi Kasus</option>
          </select>
          <select
            value={difficulty}
            onChange={(e) => setDifficulty(e.target.value)}
            className="h-9 rounded-lg border border-slate-300 bg-white px-2.5 text-xs text-slate-700"
          >
            <option value="ALL">Semua Kesulitan</option>
            <option value="EASY">Mudah (EASY)</option>
            <option value="MEDIUM">Sedang (MEDIUM)</option>
            <option value="HARD">Sulit (HARD)</option>
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-9 rounded-lg border border-slate-300 bg-white px-2.5 text-xs text-slate-700"
          >
            <option value="READY">Status: READY</option>
            <option value="DRAFT">Status: DRAFT</option>
            <option value="ARCHIVED">Status: ARCHIVED</option>
            <option value="ALL">Semua Status</option>
          </select>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-slate-500 font-medium">Sumber:</span>
          {(['ALL', 'EDITOR', 'IMPORT_XLSX', 'IMPORT_CSV'] as const).map((src) => (
            <button
              key={src}
              type="button"
              onClick={() => setSourceType(src)}
              className={`px-2.5 py-1 rounded-full border text-[11px] font-medium ${
                sourceType === src
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
              }`}
            >
              {src === 'ALL'
                ? 'Semua'
                : src === 'EDITOR'
                ? 'Editor Soal'
                : src === 'IMPORT_XLSX'
                ? 'Import XLSX'
                : 'Import CSV'}
            </button>
          ))}
        </div>

        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : items.length === 0 ? (
          <div className="py-10 text-center text-xs text-slate-500 border border-dashed border-slate-200 rounded-xl">
            Belum ada soal yang sesuai filter. Buat soal melalui <strong>Editor Soal</strong> atau impor melalui <strong>Import Soal</strong>.
          </div>
        ) : (
          <div className="space-y-2">
            {items.map((q) => {
              const checked = selectedIds.includes(q.id);
              return (
                <div
                  key={q.id}
                  className={`p-3.5 rounded-xl border transition-colors ${
                    checked ? 'border-blue-500 bg-blue-50/40' : 'border-slate-200 bg-white'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    {assessmentId && (
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() =>
                          setSelectedIds((prev) =>
                            prev.includes(q.id) ? prev.filter((id) => id !== q.id) : [...prev, q.id]
                          )
                        }
                        className="mt-1 rounded border-slate-300 text-blue-600"
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5 mb-1">
                        {q.questionCode && (
                          <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 font-mono text-[10px] font-semibold">
                            {q.questionCode}
                          </span>
                        )}
                        <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-800 text-[10px] font-semibold">
                          {q.questionType}
                        </span>
                        <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 text-[10px] font-semibold">
                          {q.difficulty}
                        </span>
                        <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-semibold">
                          {q.points} Poin
                        </span>
                        {q.learningOutcome && (
                          <span className="px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 text-[10px] font-semibold">
                            {q.learningOutcome}
                          </span>
                        )}
                        <span className="text-[10px] text-slate-400">
                          • v{q.versionNumber} • Dipakai {q.usageCount}× • {q.authorName}
                        </span>
                      </div>
                      <p className="text-xs font-medium text-slate-900 line-clamp-2">
                        {q.promptText}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setInspectItem(q)}
                        title="Lihat detail & riwayat"
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </Button>
                      {onEditInEditor && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => onEditInEditor(q)}
                          title="Muat ke Editor Soal"
                        >
                          Edit
                        </Button>
                      )}
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => duplicateMutation.mutate(q.id)}
                        title="Duplikasi soal"
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </Button>
                      {q.status === 'ARCHIVED' ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => statusMutation.mutate({ id: q.id, status: 'READY' })}
                          title="Pulihkan soal"
                        >
                          <RotateCcw className="h-3.5 w-3.5 text-emerald-600" />
                        </Button>
                      ) : (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => statusMutation.mutate({ id: q.id, status: 'ARCHIVED' })}
                          title="Arsipkan soal"
                        >
                          <Archive className="h-3.5 w-3.5 text-amber-600" />
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <ModalDialog
        open={Boolean(inspectItem)}
        onClose={() => setInspectItem(null)}
        title={`Detail Soal ${inspectItem?.questionCode || ''}`}
      >
        {inspectItem && (
          <div className="space-y-4 text-xs">
            <div>
              <div className="font-semibold text-slate-500 mb-1">Pertanyaan</div>
              <p className="text-slate-900 whitespace-pre-wrap">{inspectItem.promptText}</p>
            </div>
            {inspectItem.options.length > 0 && (
              <div>
                <div className="font-semibold text-slate-500 mb-1">Opsi Jawaban</div>
                <ul className="space-y-1">
                  {inspectItem.options.map((o) => (
                    <li
                      key={o.id}
                      className={`px-2.5 py-1.5 rounded border ${
                        o.isCorrect
                          ? 'border-emerald-300 bg-emerald-50 text-emerald-900 font-semibold'
                          : 'border-slate-200 bg-white text-slate-700'
                      }`}
                    >
                      {o.optionLabel}. {o.optionText}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-100">
              <div>
                <span className="text-slate-500">Pembuat:</span>{' '}
                <strong className="text-slate-900">{inspectItem.authorName}</strong>
              </div>
              <div>
                <span className="text-slate-500">Versi:</span>{' '}
                <strong className="text-slate-900">v{inspectItem.versionNumber}</strong>
              </div>
            </div>
            {Array.isArray(inspectItem.usageHistory) && inspectItem.usageHistory.length > 0 && (
              <div>
                <div className="font-semibold text-slate-500 mb-1">Riwayat Penggunaan</div>
                <ul className="space-y-1 text-[11px] text-slate-600">
                  {inspectItem.usageHistory.map((u, i) => (
                    <li key={i} className="flex items-center gap-1.5">
                      <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                      {u.assessmentTitle || 'Evaluasi'} ({u.addedAt ? new Date(u.addedAt).toLocaleDateString('id-ID') : '-'})
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </ModalDialog>
    </div>
  );
}
