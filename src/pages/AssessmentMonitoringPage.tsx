import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft,
  Award,
  BarChart3,
  CheckCircle2,
  Download,
  Edit3,
  FileSpreadsheet,
  RefreshCw,
  Search,
  Users,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import { toast } from 'sonner';

export const AssessmentMonitoringPage: React.FC = () => {
  const { classroomId, assessmentId } = useParams<{
    classroomId: string;
    assessmentId: string;
  }>();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<'monitoring' | 'analytics'>(
    'monitoring'
  );
  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState(false);

  const [assessment, setAssessment] = useState<any>(null);
  const [summary, setSummary] = useState<any>(null);
  const [participants, setParticipants] = useState<any[]>([]);
  const [analytics, setAnalytics] = useState<any>(null);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [sortBy, setSortBy] = useState('name_asc');

  const fetchMonitoringAndAnalytics = async (silent = false) => {
    if (!assessmentId) return;
    if (!silent) setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (search) qs.set('search', search);
      if (statusFilter !== 'ALL') qs.set('status', statusFilter);
      if (sortBy) qs.set('sortBy', sortBy);

      const monRes = await apiFetch<any>(
        `/api/v1/assessments/${assessmentId}/monitoring?${qs.toString()}`
      );
      setAssessment(monRes.assessment);
      setSummary(monRes.summary);
      setParticipants(monRes.participants || []);

      const anaRes = await apiFetch<any>(
        `/api/v1/assessments/${assessmentId}/analytics`
      );
      setAnalytics(anaRes.analytics);
    } catch (err: any) {
      if (!silent) toast.error(err.message || 'Gagal memuat monitoring ujian');
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    fetchMonitoringAndAnalytics(false);
    // Non-disruptive background polling for live examination monitoring
    const timer = setInterval(() => {
      fetchMonitoringAndAnalytics(true);
    }, 10000);
    return () => clearInterval(timer);
  }, [assessmentId, statusFilter, sortBy]);

  const handlePublishResults = async () => {
    if (!assessmentId) return;
    setPublishing(true);
    try {
      const res = await apiFetch<any>(
        `/api/v1/assessments/${assessmentId}/publish-results`,
        {
          method: 'POST',
          body: JSON.stringify({}),
        }
      );
      toast.success(
        `Berhasil mempublikasikan hasil ujian untuk ${res.publishedAttemptsCount} peserta.`
      );
      await fetchMonitoringAndAnalytics(true);
    } catch (err: any) {
      toast.error(err.message || 'Gagal mempublikasikan hasil ujian');
    } finally {
      setPublishing(false);
    }
  };

  const handleExport = (format: 'csv' | 'xlsx') => {
    if (!assessmentId) return;
    window.location.href = `/api/v1/assessments/${assessmentId}/monitoring?format=${format}`;
  };

  if (loading && !assessment) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex items-center gap-3 text-slate-700 font-medium text-sm">
          <div className="w-5 h-5 border-2 border-amber-600 border-t-transparent rounded-full animate-spin" />
          Memuat Dashboard Monitoring & Analitik Ujian...
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 pb-20">
      <header className="sticky top-0 z-30 bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => navigate(`/classrooms/${classroomId}`)}
              className="p-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 shrink-0"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-xs text-slate-500 font-mono">
                <span className="font-bold text-slate-900">
                  Monitoring & Analitik Ujian
                </span>
                <span>·</span>
                <span>Mode: {assessment?.assessmentMode}</span>
                <span>·</span>
                <span>
                  Publikasi Nilai:{' '}
                  {assessment?.resultsPublished ? 'Dipublikasikan' : 'Manual'}
                </span>
              </div>
              <h1 className="text-base font-bold text-slate-900 truncate">
                {assessment?.title}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => handleExport('csv')}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" />
              CSV
            </button>
            <button
              type="button"
              onClick={() => handleExport('xlsx')}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              XLSX
            </button>
            <button
              type="button"
              disabled={publishing}
              onClick={handlePublishResults}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold whitespace-nowrap"
            >
              <Award className="w-4 h-4" />
              Publikasikan Seluruh Hasil Siap Nilai
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 space-y-6">
        {/* View Switcher */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-1 p-1 bg-slate-200/70 rounded-xl">
            <button
              type="button"
              onClick={() => setActiveTab('monitoring')}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition ${
                activeTab === 'monitoring'
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              Monitoring Peserta Real-Time ({participants.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('analytics')}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition ${
                activeTab === 'analytics'
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5" />
              Analitik Skor & Analisis Butir Soal
            </button>
          </div>

          <button
            type="button"
            onClick={() => fetchMonitoringAndAnalytics(false)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Segarkan Data
          </button>
        </div>

        {/* =================================================================
            TAB 1: REAL-TIME PARTICIPANT MONITORING
        ================================================================= */}
        {activeTab === 'monitoring' && (
          <div className="space-y-6">
            {/* Summary Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
              {[
                {
                  label: 'Total Peserta',
                  val: summary?.totalParticipants ?? 0,
                },
                { label: 'Belum Mulai', val: summary?.notStarted ?? 0 },
                { label: 'Sedang Ujian', val: summary?.inProgress ?? 0 },
                { label: 'Terkumpul', val: summary?.submitted ?? 0 },
                { label: 'Auto-Submit', val: summary?.autoSubmitted ?? 0 },
                { label: 'Timed Out', val: summary?.timedOut ?? 0 },
                { label: 'Menunggu Esai', val: summary?.pendingEssayGrading ?? 0 },
                { label: 'Dibatalkan', val: summary?.invalidated ?? 0 },
              ].map((stat, idx) => (
                <div
                  key={idx}
                  className="bg-white rounded-xl border border-slate-200 p-3.5"
                >
                  <div className="text-[11px] font-medium text-slate-500">
                    {stat.label}
                  </div>
                  <div className="text-xl font-black font-mono tabular-nums text-slate-900 mt-1">
                    {stat.val}
                  </div>
                </div>
              ))}
            </div>

            {/* Filter & Search Bar */}
            <div className="bg-white rounded-xl border border-slate-200 p-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 flex-1 min-w-[240px]">
                <Search className="w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={(e) =>
                    e.key === 'Enter' && fetchMonitoringAndAnalytics(false)
                  }
                  placeholder="Cari nama mahasiswa, NIM, atau email..."
                  className="flex-1 text-xs px-3 py-1.5 rounded-lg border border-slate-300"
                />
              </div>

              <div className="flex items-center gap-2">
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-semibold bg-white"
                >
                  <option value="ALL">Semua Status Peserta</option>
                  <option value="NOT_STARTED">Belum Memulai (NOT_STARTED)</option>
                  <option value="IN_PROGRESS">Sedang Mengerjakan (IN_PROGRESS)</option>
                  <option value="SUBMITTED">Terkumpul (SUBMITTED)</option>
                  <option value="AUTO_SUBMITTED">Auto-Submit (AUTO_SUBMITTED)</option>
                  <option value="GRADED">Selesai Dinilai (GRADED)</option>
                </select>

                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-semibold bg-white"
                >
                  <option value="name_asc">Urut Nama (A-Z)</option>
                  <option value="score_desc">Skor Tertinggi</option>
                  <option value="progress_desc">Progres Pengerjaan</option>
                </select>
              </div>
            </div>

            {/* Participant Table */}
            <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 font-bold">
                    <th className="py-3 px-4">Mahasiswa & NIM</th>
                    <th className="py-3 px-3">Percobaan</th>
                    <th className="py-3 px-3">Status Ujian</th>
                    <th className="py-3 px-3">Progres Soal</th>
                    <th className="py-3 px-3">Skor Objektif</th>
                    <th className="py-3 px-3">Status Esai</th>
                    <th className="py-3 px-3">Skor Akhir</th>
                    <th className="py-3 px-4 text-right">Aksi Penilaian</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono tabular-nums">
                  {participants.map((p) => (
                    <tr key={p.studentId} className="hover:bg-slate-50/80">
                      <td className="py-3.5 px-4 font-sans">
                        <div className="font-bold text-slate-900">
                          {p.studentName}
                        </div>
                        <div className="text-[11px] font-mono text-slate-500">
                          NIM: {p.studentNim}
                        </div>
                      </td>
                      <td className="py-3.5 px-3">
                        {p.attemptNumber > 0 ? `#${p.attemptNumber}` : '—'}
                      </td>
                      <td className="py-3.5 px-3 font-bold text-slate-800">
                        {p.attemptStatus}
                      </td>
                      <td className="py-3.5 px-3">
                        {p.attemptId ? (
                          <div>
                            <span>
                              {p.answeredQuestions}/{p.totalQuestions} (
                              {p.progressPercentage}%)
                            </span>
                          </div>
                        ) : (
                          '0%'
                        )}
                      </td>
                      <td className="py-3.5 px-3 font-bold">
                        {p.objectiveScore !== null ? p.objectiveScore : '—'}
                      </td>
                      <td className="py-3.5 px-3">
                        {p.essayGradingStatus}
                      </td>
                      <td className="py-3.5 px-3 font-bold text-slate-900">
                        {p.finalScore !== null
                          ? `${p.finalScore} / ${assessment?.maxScore || 100}`
                          : '—'}
                      </td>
                      <td className="py-3.5 px-4 text-right font-sans">
                        {p.attemptId ? (
                          <Link
                            to={`/classrooms/${classroomId}/assessments/${assessmentId}/grading/${p.attemptId}`}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold"
                          >
                            <Edit3 className="w-3.5 h-3.5 text-amber-400" />
                            Periksa & Nilai Esai
                          </Link>
                        ) : (
                          <span className="text-slate-400">Belum Mulai</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* =================================================================
            TAB 2: ANALYTICS & ITEM ANALYSIS
        ================================================================= */}
        {activeTab === 'analytics' && analytics && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-4">
              {[
                { label: 'Rata-Rata (Mean)', val: analytics.averageScore },
                { label: 'Nilai Tengah (Median)', val: analytics.medianScore },
                { label: 'Skor Tertinggi', val: analytics.highestScore },
                { label: 'Skor Terendah', val: analytics.lowestScore },
                {
                  label: 'Tingkat Kelulusan',
                  val: `${analytics.passPercentage}%`,
                },
                {
                  label: 'Tingkat Pengumpulan',
                  val: `${analytics.submissionRate}%`,
                },
              ].map((m, idx) => (
                <div
                  key={idx}
                  className="bg-white rounded-xl border border-slate-200 p-4"
                >
                  <div className="text-xs text-slate-500">{m.label}</div>
                  <div className="text-2xl font-black font-mono tabular-nums text-slate-900 mt-1">
                    {m.val}
                  </div>
                </div>
              ))}
            </div>

            {/* Grade Distribution */}
            <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
              <h2 className="text-base font-bold text-slate-900">
                Distribusi Nilai Peserta (Berdasarkan Data PostgreSQL)
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
                {(analytics.gradeDistribution || []).map(
                  (bucket: any, idx: number) => (
                    <div
                      key={idx}
                      className="p-4 rounded-xl border border-slate-200 bg-slate-50 font-mono"
                    >
                      <div className="text-xs font-bold text-slate-700">
                        {bucket.grade}
                      </div>
                      <div className="text-xl font-black text-slate-900 mt-1">
                        {bucket.count} Mahasiswa
                      </div>
                    </div>
                  )
                )}
              </div>
            </div>

            {/* Per-Question Item Difficulty, Discrimination & Distractor Analysis */}
            <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-base font-bold text-slate-900">
                    Analisis Butir Soal (Item Difficulty, Discrimination & Distractor Analysis)
                  </h2>
                  <p className="text-xs text-slate-500">
                    {analytics.sampleSizeSufficient
                      ? 'Ukuran sampel memenuhi ambang reliabilitas psikometrik (N >= 10).'
                      : `Catatan Reliabilitas Statistik: Jumlah peserta terkumpul saat ini N = ${analytics.totalSubmittedAttempts} (< 10). Indeks daya pembeda (Item Discrimination) ditandai belum konklusif untuk mencegah kesimpulan statistik yang bias pada sampel kecil.`}
                  </p>
                </div>
              </div>

              <div className="space-y-4">
                {(analytics.itemAnalysis || []).map((item: any, idx: number) => (
                  <div
                    key={idx}
                    className="p-4 rounded-xl border border-slate-200 bg-slate-50/60 space-y-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-mono">
                      <span className="font-bold text-slate-900">
                        Soal #{idx + 1} · {item.questionMode} ({item.questionType})
                      </span>
                      <div className="flex items-center gap-3 text-slate-600">
                        <span>Benar: {item.correctPercentage}%</span>
                        <span>·</span>
                        <span>
                          Rata-Rata Skor: {item.averageScore}/{item.maxPoints}
                        </span>
                        <span>·</span>
                        <span>
                          Indeks Kesukaran (p): {item.itemDifficultyIndex}
                        </span>
                        <span>·</span>
                        <span>
                          Daya Pembeda (D):{' '}
                          {item.itemDiscriminationIndex !== null
                            ? item.itemDiscriminationIndex
                            : 'N < 10'}
                        </span>
                      </div>
                    </div>

                    <p className="text-sm font-medium text-slate-900">
                      {item.promptText}
                    </p>

                    {item.distractorAnalysis?.length > 0 && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2">
                        {item.distractorAnalysis.map((dist: any) => (
                          <div
                            key={dist.optionId}
                            className={`p-2.5 rounded-lg border text-xs flex items-center justify-between ${
                              dist.isCorrect
                                ? 'bg-emerald-50 border-emerald-200 text-emerald-950'
                                : 'bg-white border-slate-200 text-slate-700'
                            }`}
                          >
                            <span>
                              <strong className="font-mono mr-1.5">
                                {dist.optionLabel}.
                              </strong>
                              {dist.optionText}
                              {dist.isCorrect ? ' (Kunci)' : ''}
                            </span>
                            <span className="font-mono font-bold">
                              {dist.selectedCount} ({dist.selectionPercentage}%)
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default AssessmentMonitoringPage;
