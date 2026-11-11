import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Users,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Award,
  Search,
  Filter,
  Download,
  Bell,
  FileSpreadsheet,
  Edit3,
  Eye,
  RotateCcw,
  BarChart3,
  ArrowUpDown,
  Send,
  X,
  FileCheck,
} from 'lucide-react';
import { apiFetch } from '../lib/api';

export const AssignmentMonitoringPage: React.FC = () => {
  const { classroomId, assignmentId } = useParams<{ classroomId: string; assignmentId: string }>();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [assignment, setAssignment] = useState<any>(null);
  const [summary, setSummary] = useState<any>(null);
  const [participants, setParticipants] = useState<any[]>([]);
  const [analytics, setAnalytics] = useState<any>(null);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Filters & sorting
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [gradingFilter, setGradingFilter] = useState('ALL');
  const [lateOnly, setLateOnly] = useState(false);
  const [missingOnly, setMissingOnly] = useState(false);
  const [sortBy, setSortBy] = useState('student_name');

  // Reminder modal
  const [showReminderModal, setShowReminderModal] = useState(false);
  const [reminderMessage, setReminderMessage] = useState(
    'Pengingat Akademik: Mohon segera selesaikan dan kumpulkan tugas ini sebelum batas waktu berakhir.'
  );
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [sendingReminders, setSendingReminders] = useState(false);

  const loadMonitoringData = async () => {
    if (!assignmentId) return;
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (searchQuery.trim()) params.set('search', searchQuery.trim());
      if (statusFilter !== 'ALL') params.set('status', statusFilter);
      if (gradingFilter !== 'ALL') params.set('gradingStatus', gradingFilter);
      if (lateOnly) params.set('lateOnly', 'true');
      if (missingOnly) params.set('missingOnly', 'true');
      if (sortBy) params.set('sortBy', sortBy);

      const [partRes, analyticsRes] = await Promise.all([
        apiFetch<any>(`/api/v1/assignments/${assignmentId}/participants?${params.toString()}`),
        apiFetch<any>(`/api/v1/assignments/${assignmentId}/analytics`),
      ]);

      setAssignment(partRes.assignment || { title: analyticsRes.title, maxScore: 100 });
      setSummary(partRes.summary);
      setParticipants(partRes.participants || []);
      setAnalytics(analyticsRes);
    } catch (err: any) {
      setError(err.message || 'Gagal memuat data monitoring tugas');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMonitoringData();
  }, [assignmentId, statusFilter, gradingFilter, lateOnly, missingOnly, sortBy]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loadMonitoringData();
  };

  const handleSendReminders = async () => {
    if (!assignmentId) return;
    setSendingReminders(true);
    setError('');
    try {
      const res = await apiFetch<any>(`/api/v1/assignments/${assignmentId}/reminders`, {
        method: 'POST',
        body: JSON.stringify({
          studentIds: selectedStudentIds.length > 0 ? selectedStudentIds : undefined,
          message: reminderMessage,
        }),
      });
      setSuccessMsg(
        `Berhasil mengirim pengingat kepada ${res.remindedCount ?? res.sentCount ?? 0} mahasiswa.`
      );
      setShowReminderModal(false);
      setSelectedStudentIds([]);
    } catch (err: any) {
      setError(err.message || 'Gagal mengirim pengingat');
    } finally {
      setSendingReminders(false);
    }
  };

  const handleExport = (format: 'csv' | 'xlsx') => {
    if (!assignmentId) return;
    window.location.href = `/api/v1/assignments/${assignmentId}/export?format=${format}`;
  };

  const getSubmissionStatusBadge = (status: string, isLate: boolean) => {
    const map: Record<string, { label: string; cls: string }> = {
      not_submitted: { label: 'Belum Mengumpulkan', cls: 'bg-rose-50 text-rose-700 border-rose-200' },
      draft: { label: 'Draf Mahasiswa', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
      submitted: { label: 'Terkumpul', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
      resubmitted: { label: 'Dikumpulkan Ulang', cls: 'bg-blue-50 text-blue-700 border-blue-200' },
      late: { label: 'Terlambat', cls: 'bg-orange-50 text-orange-700 border-orange-200' },
      under_review: { label: 'Sedang Direview', cls: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
      graded: { label: 'Sudah Dinilai', cls: 'bg-emerald-100 text-emerald-900 border-emerald-300' },
      returned_for_revision: { label: 'Revisi Diminta', cls: 'bg-purple-50 text-purple-700 border-purple-200' },
      excused: { label: 'Dispensasi', cls: 'bg-slate-100 text-slate-700 border-slate-300' },
    };
    const item = map[status] || { label: status, cls: 'bg-slate-100 text-slate-700 border-slate-200' };
    return (
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className={`px-2 py-0.5 rounded text-[11px] font-bold border ${item.cls}`}>
          {item.label}
        </span>
        {isLate && status !== 'late' && (
          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-orange-100 text-orange-800 border border-orange-200">
            LATE
          </span>
        )}
      </div>
    );
  };

  const getGradingStatusBadge = (gradingStatus: string, isPublished: boolean) => {
    if (gradingStatus === 'not_graded') {
      return <span className="text-xs text-slate-400 font-medium">Belum Dinilai</span>;
    }
    if (gradingStatus === 'draft' || !isPublished) {
      return (
        <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
          Draf Nilai (Tersembunyi)
        </span>
      );
    }
    if (gradingStatus === 'returned_for_revision') {
      return (
        <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-purple-50 text-purple-800 border border-purple-200">
          Dikembalikan Revisi
        </span>
      );
    }
    return (
      <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
        Nilai Dipublikasikan
      </span>
    );
  };

  if (loading && !assignment) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex items-center gap-3 text-slate-700 font-medium">
          <div className="w-5 h-5 border-2 border-amber-600 border-t-transparent rounded-full animate-spin" />
          Memuat Dashboard Monitoring & Analitik Tugas...
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 pb-16">
      {/* Top Bar */}
      <header className="sticky top-0 z-30 bg-white border-b border-slate-200 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => navigate(`/classrooms/${classroomId}?tab=assignments`)}
              className="p-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider rounded bg-slate-900 text-white">
                  Monitoring & Analitik Tugas
                </span>
                <span className="text-xs font-mono text-slate-500">
                  Max Skor: {assignment?.maxScore || 100}
                </span>
              </div>
              <h1 className="text-base font-bold text-slate-900 truncate max-w-xl">
                {assignment?.title}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => navigate(`/classrooms/${classroomId}/assignments/${assignmentId}/edit`)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
            >
              <Edit3 className="w-3.5 h-3.5" />
              Edit Tugas
            </button>

            <button
              type="button"
              onClick={() => setShowReminderModal(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100"
            >
              <Bell className="w-3.5 h-3.5" />
              Kirim Pengingat ({summary?.notSubmitted || 0})
            </button>

            <button
              type="button"
              onClick={() => handleExport('csv')}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
            >
              <Download className="w-3.5 h-3.5" />
              CSV
            </button>

            <button
              type="button"
              onClick={() => handleExport('xlsx')}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold bg-emerald-700 text-white hover:bg-emerald-800"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              Export Excel (.xlsx)
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 space-y-6">
        {error && (
          <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-sm">
            {error}
          </div>
        )}
        {successMsg && (
          <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm flex items-center justify-between">
            <span>{successMsg}</span>
            <button onClick={() => setSuccessMsg('')} className="text-xs font-bold underline">
              Tutup
            </button>
          </div>
        )}

        {/* Summary Statistics Strip */}
        {summary && (
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
            <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
              <div className="text-[11px] font-bold uppercase text-slate-400">Total Peserta</div>
              <div className="text-2xl font-black font-mono text-slate-900 mt-1">
                {summary.totalParticipants}
              </div>
            </div>
            <div className="bg-white p-3.5 rounded-xl border border-emerald-200 shadow-2xs">
              <div className="text-[11px] font-bold uppercase text-emerald-700">Sudah Kumpul</div>
              <div className="text-2xl font-black font-mono text-emerald-700 mt-1">
                {summary.submitted}
              </div>
            </div>
            <div className="bg-white p-3.5 rounded-xl border border-rose-200 shadow-2xs">
              <div className="text-[11px] font-bold uppercase text-rose-700">Belum Kumpul</div>
              <div className="text-2xl font-black font-mono text-rose-700 mt-1">
                {summary.notSubmitted}
              </div>
            </div>
            <div className="bg-white p-3.5 rounded-xl border border-orange-200 shadow-2xs">
              <div className="text-[11px] font-bold uppercase text-orange-700">Terlambat</div>
              <div className="text-2xl font-black font-mono text-orange-700 mt-1">
                {summary.lateSubmissions}
              </div>
            </div>
            <div className="bg-white p-3.5 rounded-xl border border-amber-200 shadow-2xs">
              <div className="text-[11px] font-bold uppercase text-amber-700">Menunggu Nilai</div>
              <div className="text-2xl font-black font-mono text-amber-700 mt-1">
                {summary.pendingGrading}
              </div>
            </div>
            <div className="bg-white p-3.5 rounded-xl border border-blue-200 shadow-2xs">
              <div className="text-[11px] font-bold uppercase text-blue-700">Sudah Dinilai</div>
              <div className="text-2xl font-black font-mono text-blue-700 mt-1">
                {summary.graded}
              </div>
            </div>
            <div className="bg-white p-3.5 rounded-xl border border-purple-200 shadow-2xs">
              <div className="text-[11px] font-bold uppercase text-purple-700">Revisi</div>
              <div className="text-2xl font-black font-mono text-purple-700 mt-1">
                {summary.returnedForRevision}
              </div>
            </div>
            <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
              <div className="text-[11px] font-bold uppercase text-slate-500">Dispensasi</div>
              <div className="text-2xl font-black font-mono text-slate-700 mt-1">
                {summary.excused}
              </div>
            </div>
          </div>
        )}

        {/* Analytics & Grade Distribution Panel */}
        {analytics && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-5 bg-white rounded-xl border border-slate-200 p-5 shadow-2xs space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-amber-600" />
                  Indikator Kinerja Pengumpulan & Penilaian
                </h2>
              </div>

              <div className="space-y-3">
                <div>
                  <div className="flex justify-between text-xs font-semibold mb-1">
                    <span className="text-slate-600">Tingkat Pengumpulan Mahasiswa</span>
                    <span className="font-mono font-bold text-emerald-700">
                      {analytics.submissionPercentage}%
                    </span>
                  </div>
                  <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-emerald-600 rounded-full transition-all"
                      style={{ width: `${Math.min(100, analytics.submissionPercentage)}%` }}
                    />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-xs font-semibold mb-1">
                    <span className="text-slate-600">Penyelesaian Penilaian Dosen</span>
                    <span className="font-mono font-bold text-blue-700">
                      {analytics.gradingCompletionPercentage}%
                    </span>
                  </div>
                  <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-600 rounded-full transition-all"
                      style={{ width: `${Math.min(100, analytics.gradingCompletionPercentage)}%` }}
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3 pt-2 border-t border-slate-100">
                <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200/70">
                  <div className="text-[10px] font-bold uppercase text-slate-400">Rata-rata Nilai</div>
                  <div className="text-lg font-black font-mono text-slate-900 mt-0.5">
                    {analytics.averageGrade}
                  </div>
                </div>
                <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200/70">
                  <div className="text-[10px] font-bold uppercase text-slate-400">Nilai Tertinggi</div>
                  <div className="text-lg font-black font-mono text-emerald-700 mt-0.5">
                    {analytics.highestGrade}
                  </div>
                </div>
                <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200/70">
                  <div className="text-[10px] font-bold uppercase text-slate-400">Nilai Terendah</div>
                  <div className="text-lg font-black font-mono text-rose-700 mt-0.5">
                    {analytics.lowestGrade}
                  </div>
                </div>
              </div>
            </div>

            <div className="lg:col-span-7 bg-white rounded-xl border border-slate-200 p-5 shadow-2xs">
              <h2 className="text-sm font-bold text-slate-900 mb-4">
                Distribusi Nilai Mahasiswa (Real-time PostgreSQL)
              </h2>
              <div className="grid grid-cols-5 gap-3">
                {[
                  { label: 'A (85–100)', value: analytics.gradeDistribution?.A_85_100 || 0, color: 'bg-emerald-600' },
                  { label: 'B (70–84)', value: analytics.gradeDistribution?.B_70_84 || 0, color: 'bg-blue-600' },
                  { label: 'C (55–69)', value: analytics.gradeDistribution?.C_55_69 || 0, color: 'bg-amber-500' },
                  { label: 'D (40–54)', value: analytics.gradeDistribution?.D_40_54 || 0, color: 'bg-orange-500' },
                  { label: 'E (< 40)', value: analytics.gradeDistribution?.E_below_40 || 0, color: 'bg-rose-600' },
                ].map((b) => (
                  <div key={b.label} className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-center">
                    <div className="text-2xl font-black font-mono text-slate-900">{b.value}</div>
                    <div className="text-[11px] font-bold text-slate-600 mt-1">{b.label}</div>
                    <div className={`h-1.5 w-full rounded-full mt-2 ${b.color}`} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Filter & Search Bar */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <form onSubmit={handleSearchSubmit} className="relative flex-1 min-w-[240px]">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari Nama Mahasiswa, NIM, atau Email..."
                className="w-full pl-9 pr-4 py-2 rounded-lg border border-slate-300 text-xs focus:outline-none focus:border-amber-600"
              />
            </form>

            <div className="flex flex-wrap items-center gap-2">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-3 py-2 rounded-lg border border-slate-300 text-xs font-medium bg-white"
              >
                <option value="ALL">Semua Status Pengumpulan</option>
                <option value="not_submitted">Belum Mengumpulkan</option>
                <option value="submitted">Terkumpul</option>
                <option value="resubmitted">Dikumpulkan Ulang</option>
                <option value="late">Terlambat</option>
                <option value="graded">Sudah Dinilai</option>
                <option value="returned_for_revision">Revisi Diminta</option>
              </select>

              <select
                value={gradingFilter}
                onChange={(e) => setGradingFilter(e.target.value)}
                className="px-3 py-2 rounded-lg border border-slate-300 text-xs font-medium bg-white"
              >
                <option value="ALL">Semua Status Nilai</option>
                <option value="not_graded">Belum Dinilai</option>
                <option value="draft">Draf Nilai</option>
                <option value="published">Nilai Dipublikasikan</option>
                <option value="returned_for_revision">Dikembalikan Revisi</option>
              </select>

              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="px-3 py-2 rounded-lg border border-slate-300 text-xs font-medium bg-white"
              >
                <option value="student_name">Urutkan: Nama Mahasiswa</option>
                <option value="student_id">Urutkan: NIM</option>
                <option value="submission_time">Urutkan: Waktu Kumpul</option>
                <option value="late_duration">Urutkan: Durasi Terlambat</option>
                <option value="grade">Urutkan: Nilai Tertinggi</option>
                <option value="submission_status">Urutkan: Status Kumpul</option>
              </select>

              <label className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 text-xs font-semibold cursor-pointer">
                <input
                  type="checkbox"
                  checked={missingOnly}
                  onChange={(e) => setMissingOnly(e.target.checked)}
                />
                Hanya Belum Kumpul
              </label>

              <label className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 text-xs font-semibold cursor-pointer">
                <input
                  type="checkbox"
                  checked={lateOnly}
                  onChange={(e) => setLateOnly(e.target.checked)}
                />
                Hanya Terlambat
              </label>
            </div>
          </div>
        </div>

        {/* Participant Table */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold uppercase text-slate-500">
                  <th className="py-3.5 px-4">Mahasiswa</th>
                  <th className="py-3.5 px-4">NIM</th>
                  <th className="py-3.5 px-4">Status Pengumpulan</th>
                  <th className="py-3.5 px-4">Waktu Kumpul</th>
                  <th className="py-3.5 px-4">Keterlambatan</th>
                  <th className="py-3.5 px-4 text-center">Versi</th>
                  <th className="py-3.5 px-4 text-center">Berkas</th>
                  <th className="py-3.5 px-4">Nilai</th>
                  <th className="py-3.5 px-4">Status Nilai</th>
                  <th className="py-3.5 px-4 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-xs">
                {participants.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="py-12 text-center text-slate-400">
                      Tidak ada peserta kelas yang sesuai dengan filter pencarian.
                    </td>
                  </tr>
                ) : (
                  participants.map((p) => (
                    <tr key={p.studentId} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-slate-900">{p.studentName}</div>
                        <div className="text-[11px] text-slate-500">{p.studentEmail}</div>
                      </td>
                      <td className="py-3.5 px-4 font-mono font-semibold text-slate-700">
                        {p.studentNumber}
                      </td>
                      <td className="py-3.5 px-4">
                        {getSubmissionStatusBadge(p.submissionStatus, p.isLate)}
                      </td>
                      <td className="py-3.5 px-4 font-mono text-slate-600">
                        {p.submittedAt
                          ? new Date(p.submittedAt).toLocaleString('id-ID', {
                              day: '2-digit',
                              month: 'short',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })
                          : '—'}
                      </td>
                      <td className="py-3.5 px-4">
                        {p.isLate ? (
                          <span className="font-mono font-bold text-orange-700">
                            +{p.lateMinutes} menit
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-center font-mono font-bold text-slate-700">
                        {p.version > 0 ? `v${p.version}` : '—'}
                      </td>
                      <td className="py-3.5 px-4 text-center font-mono text-slate-700">
                        {p.attachmentCount || 0} file
                      </td>
                      <td className="py-3.5 px-4">
                        {p.grade !== null && p.grade !== undefined ? (
                          <span className="font-mono text-sm font-black text-slate-900">
                            {p.grade}
                            <span className="text-[11px] font-normal text-slate-400">
                              /{assignment?.maxScore || 100}
                            </span>
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4">
                        {getGradingStatusBadge(p.gradingStatus, p.isGradePublished)}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        {p.submissionId ? (
                          <button
                            type="button"
                            onClick={() =>
                              navigate(
                                `/classrooms/${classroomId}/assignments/${assignmentId}/grading/${p.submissionId}`
                              )
                            }
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-900 text-white hover:bg-slate-800"
                          >
                            <FileCheck className="w-3.5 h-3.5 text-amber-400" />
                            Periksa & Nilai
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedStudentIds([p.studentId]);
                              setShowReminderModal(true);
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100"
                          >
                            <Bell className="w-3 h-3" />
                            Ingatkan
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      {/* Reminder Modal */}
      {showReminderModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 max-w-md w-full p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Bell className="w-4 h-4 text-amber-600" />
                Kirim Pengingat Tugas
              </h3>
              <button
                type="button"
                onClick={() => setShowReminderModal(false)}
                className="p-1 text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-slate-600">
              {selectedStudentIds.length > 0
                ? `Mengirim pengingat ke ${selectedStudentIds.length} mahasiswa terpilih.`
                : `Mengirim pengingat otomatis ke seluruh mahasiswa yang belum mengumpulkan tugas (${summary?.notSubmitted || 0} mahasiswa).`}
            </p>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Pesan Pengingat
              </label>
              <textarea
                rows={3}
                value={reminderMessage}
                onChange={(e) => setReminderMessage(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs"
              />
            </div>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowReminderModal(false)}
                className="px-4 py-2 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={sendingReminders}
                onClick={handleSendReminders}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-slate-950 text-xs font-bold"
              >
                <Send className="w-3.5 h-3.5" />
                {sendingReminders ? 'Mengirim...' : 'Kirim Pengingat'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
export default AssignmentMonitoringPage;
