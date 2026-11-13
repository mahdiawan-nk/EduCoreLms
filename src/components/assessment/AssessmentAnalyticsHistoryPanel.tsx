import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Activity, BarChart3, History, ExternalLink, Award, Users } from 'lucide-react';
import { apiFetch } from '../../lib/api';
import { Card, Button, Skeleton } from '../ui/primitives';

export function AssessmentMonitoringSummaryPanel({
  classroomId,
  assessmentId,
}: {
  classroomId: string;
  assessmentId?: string;
}) {
  const { data, isLoading } = useQuery<any>({
    queryKey: ['assessment-monitoring-summary', assessmentId],
    queryFn: () => apiFetch(`/api/v1/assessments/${assessmentId}/monitoring`),
    enabled: Boolean(assessmentId),
  });

  if (!assessmentId) {
    return (
      <Card className="p-6 text-center text-xs text-slate-500">
        Simpan informasi ujian terlebih dahulu untuk mengaktifkan dashboard monitoring peserta.
      </Card>
    );
  }

  if (isLoading) return <Skeleton className="h-40 w-full rounded-xl" />;

  const summary = data?.summary || {};
  return (
    <Card className="p-6 space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
        <div>
          <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <Activity className="h-4 w-4 text-blue-700" />
            Monitoring Ujian Real-Time
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Pantau status peserta, pengerjaan aktif, pengumpulan, dan log aktivitas ujian.
          </p>
        </div>
        <Link to={`/classrooms/${classroomId}/assessments/${assessmentId}/monitoring`}>
          <Button type="button" size="sm">
            <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
            Buka Konsol Monitoring Lengkap
          </Button>
        </Link>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
        <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
          <div className="text-slate-500">Total Peserta</div>
          <div className="text-lg font-bold text-slate-900">{summary.totalStudents ?? 0}</div>
        </div>
        <div className="p-3 rounded-lg bg-blue-50 border border-blue-200">
          <div className="text-blue-700">Sedang Mengerjakan</div>
          <div className="text-lg font-bold text-blue-900">{summary.inProgress ?? 0}</div>
        </div>
        <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200">
          <div className="text-emerald-700">Sudah Dikumpulkan</div>
          <div className="text-lg font-bold text-emerald-900">{summary.submitted ?? 0}</div>
        </div>
        <div className="p-3 rounded-lg bg-amber-50 border border-amber-200">
          <div className="text-amber-700">Menunggu Penilaian</div>
          <div className="text-lg font-bold text-amber-900">{summary.gradingPending ?? 0}</div>
        </div>
      </div>
    </Card>
  );
}

export function AssessmentGradingAnalyticsPanel({
  classroomId,
  assessmentId,
}: {
  classroomId: string;
  assessmentId?: string;
}) {
  const { data, isLoading } = useQuery<any>({
    queryKey: ['assessment-analytics-summary', assessmentId],
    queryFn: () => apiFetch(`/api/v1/assessments/${assessmentId}/analytics`),
    enabled: Boolean(assessmentId),
  });

  if (!assessmentId) {
    return (
      <Card className="p-6 text-center text-xs text-slate-500">
        Simpan ujian terlebih dahulu untuk melihat penilaian dan analitik hasil.
      </Card>
    );
  }

  if (isLoading) return <Skeleton className="h-48 w-full rounded-xl" />;

  const stats = data?.summary || {};
  return (
    <Card className="p-6 space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
        <div>
          <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-blue-700" />
            Penilaian, Evaluasi & Analitik Psikometrik
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Ringkasan nilai objektif/esai, tingkat kelulusan, serta analisis butir soal.
          </p>
        </div>
        <Link to={`/classrooms/${classroomId}/assessments/${assessmentId}/grading`}>
          <Button type="button" size="sm">
            <Award className="h-3.5 w-3.5 mr-1.5" />
            Buka Workspace Penilaian Esai
          </Button>
        </Link>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs">
        <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
          <div className="text-slate-500">Rata-rata Nilai</div>
          <div className="text-lg font-bold text-slate-900">
            {stats.averageScore != null ? Number(stats.averageScore).toFixed(1) : '-'}
          </div>
        </div>
        <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
          <div className="text-slate-500">Nilai Tertinggi</div>
          <div className="text-lg font-bold text-emerald-700">
            {stats.highestScore != null ? Number(stats.highestScore).toFixed(1) : '-'}
          </div>
        </div>
        <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
          <div className="text-slate-500">Nilai Terendah</div>
          <div className="text-lg font-bold text-rose-700">
            {stats.lowestScore != null ? Number(stats.lowestScore).toFixed(1) : '-'}
          </div>
        </div>
        <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
          <div className="text-slate-500">Median</div>
          <div className="text-lg font-bold text-slate-900">
            {stats.medianScore != null ? Number(stats.medianScore).toFixed(1) : '-'}
          </div>
        </div>
        <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
          <div className="text-slate-500">Tingkat Kelulusan</div>
          <div className="text-lg font-bold text-blue-700">
            {stats.passRate != null ? `${Number(stats.passRate).toFixed(0)}%` : '-'}
          </div>
        </div>
      </div>

      {Array.isArray(data?.questionAnalysis) && data.questionAnalysis.length > 0 && (
        <div className="overflow-x-auto border border-slate-200 rounded-lg">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
              <tr>
                <th className="px-3 py-2">Butir Soal</th>
                <th className="px-3 py-2">Tingkat Kesukaran (p)</th>
                <th className="px-3 py-2">Daya Pembeda (D)</th>
                <th className="px-3 py-2">% Benar</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.questionAnalysis.map((qa: any, i: number) => (
                <tr key={qa.questionId || i}>
                  <td className="px-3 py-2 font-medium text-slate-900 max-w-xs truncate">
                    {qa.promptText || `Soal #${i + 1}`}
                  </td>
                  <td className="px-3 py-2">{qa.difficultyIndex ?? '-'}</td>
                  <td className="px-3 py-2">{qa.discriminationIndex ?? '-'}</td>
                  <td className="px-3 py-2">{qa.correctRate != null ? `${qa.correctRate}%` : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

export function AssessmentHistoryPanel({ assessmentId }: { assessmentId?: string }) {
  const { data, isLoading } = useQuery<{
    auditLogs: Array<{
      id: string;
      action: string;
      actorName: string | null;
      actorRole: string;
      changeSummary: string | null;
      createdAt: string;
    }>;
  }>({
    queryKey: ['assessment-history', assessmentId],
    queryFn: () => apiFetch(`/api/v1/assessments/${assessmentId}/history`),
    enabled: Boolean(assessmentId),
  });

  if (!assessmentId) {
    return (
      <Card className="p-6 text-center text-xs text-slate-500">
        Riwayat perubahan akan tersedia setelah ujian disimpan.
      </Card>
    );
  }

  if (isLoading) return <Skeleton className="h-40 w-full rounded-xl" />;

  const logs = data?.auditLogs || [];
  return (
    <Card className="p-6 space-y-4">
      <div className="pb-3 border-b border-slate-100">
        <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
          <History className="h-4 w-4 text-blue-700" />
          Riwayat Audit & Perubahan Ujian
        </h3>
        <p className="text-xs text-slate-500 mt-0.5">
          Catatan kronologis pembuatan, pembaruan aturan, impor soal, dan publikasi evaluasi.
        </p>
      </div>
      {logs.length === 0 ? (
        <div className="py-6 text-center text-xs text-slate-500">
          Belum ada catatan riwayat perubahan untuk ujian ini.
        </div>
      ) : (
        <div className="space-y-2">
          {logs.map((l) => (
            <div key={l.id} className="p-3 rounded-lg border border-slate-200 bg-white text-xs">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-900">
                  [{l.action}] {l.changeSummary || 'Perubahan evaluasi'}
                </span>
                <span className="text-[11px] text-slate-400">
                  {new Date(l.createdAt).toLocaleString('id-ID')}
                </span>
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                Oleh {l.actorName || 'Sistem'} ({l.actorRole})
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
