import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  Users,
  BookOpen,
  ClipboardList,
  Award,
  Clock,
  AlertTriangle,
  CheckCircle2,
  TrendingUp,
  Bell,
  ExternalLink,
  FileText,
  Activity,
  BarChart3,
  Send,
} from 'lucide-react';
import { apiFetch } from '../../lib/api';
import { Button, Card, Input, Textarea, ModalDialog, Skeleton } from '../ui/primitives';
import { formatDateTime } from '../../lib/utils';
import { toast } from 'sonner';

interface Props {
  classroomId: string;
  onOpenStudentReport?: (studentId: string) => void;
}

export function InstructorAnalyticsDashboard({ classroomId, onOpenStudentReport }: Props) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [notifyTarget, setNotifyTarget] = useState<{
    studentId: string;
    fullName: string;
    issueDescription: string;
  } | null>(null);
  const [notifyTitle, setNotifyTitle] = useState('Pengingat Pembelajaran');
  const [notifyMessage, setNotifyMessage] = useState('');

  const { data, isLoading, error } = useQuery({
    queryKey: ['classroom-analytics', classroomId],
    queryFn: () => apiFetch<any>(`/api/v1/classrooms/${classroomId}/analytics`),
    enabled: Boolean(classroomId),
  });

  const notifyMutation = useMutation({
    mutationFn: (payload: { studentId: string; title: string; message: string }) =>
      apiFetch(`/api/v1/classrooms/${classroomId}/notify-student`, {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      toast.success('Notifikasi individual berhasil dikirim ke mahasiswa.');
      setNotifyTarget(null);
      setNotifyMessage('');
      queryClient.invalidateQueries({ queryKey: ['classroom-analytics', classroomId] });
    },
    onError: (err: any) => {
      toast.error(err?.message || 'Gagal mengirim notifikasi.');
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-4 mt-6">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  if (error || !data?.overview) {
    return (
      <Card className="p-8 text-center mt-6">
        <p className="text-sm text-slate-600">
          Data analitik kelas belum tersedia atau gagal dimuat.
        </p>
      </Card>
    );
  }

  const ov = data.overview;
  const analytics = data.learningProgressAnalytics || {};
  const modules: any[] = analytics.modules || [];
  const dist = analytics.studentProgressDistribution || {
    '0-25': 0,
    '26-50': 0,
    '51-75': 0,
    '76-100': 0,
  };
  const totalDistStudents =
    (dist['0-25'] || 0) + (dist['26-50'] || 0) + (dist['51-75'] || 0) + (dist['76-100'] || 0);
  const attentionList: any[] = data.studentAttentionCenter || [];
  const recentActivity: any[] = data.recentActivity || [];

  const summaryCards = [
    {
      label: 'Total Peserta',
      value: `${ov.activeStudents} / ${ov.totalEnrolledStudents}`,
      sub: 'Aktif / Terdaftar',
      icon: Users,
      accent: 'text-slate-900 bg-slate-100',
    },
    {
      label: 'Modul Pembelajaran',
      value: ov.totalModules,
      sub: `${ov.totalMaterials} Materi (${ov.unviewedMaterialsCount} belum dipelajari)`,
      icon: BookOpen,
      accent: 'text-blue-700 bg-blue-50',
    },
    {
      label: 'Tugas Aktif',
      value: ov.totalAssignments,
      sub: `${ov.submittedAssignmentsCount} dikumpulkan · ${ov.unsubmittedAssignmentsCount} belum`,
      icon: ClipboardList,
      accent: 'text-indigo-700 bg-indigo-50',
    },
    {
      label: 'Evaluasi Aktif',
      value: ov.totalAssessments,
      sub: `${ov.completedAssessmentsCount} selesai · ${ov.studentsIncompleteAssessmentsCount} belum`,
      icon: CheckCircle2,
      accent: 'text-emerald-700 bg-emerald-50',
    },
    {
      label: 'Menunggu Penilaian',
      value: ov.pendingGradingAssignmentsCount,
      sub: `${ov.gradedAssignmentsCount} tugas sudah dinilai`,
      icon: Clock,
      accent: 'text-amber-700 bg-amber-50',
    },
    {
      label: 'Rata-rata Nilai',
      value: ov.classAverageGrade !== null ? ov.classAverageGrade : '—',
      sub: `Tingkat selesai ${ov.learningCompletionRate}%`,
      icon: Award,
      accent: 'text-sky-700 bg-sky-50',
    },
  ];

  // Donut chart math for learningCompletionRate
  const completionPct = Math.min(100, Math.max(0, ov.learningCompletionRate || 0));
  const radius = 38;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (completionPct / 100) * circumference;

  return (
    <div className="mt-6 space-y-6">
      {/* SECTION A: CLASS OVERVIEW */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-blue-700" />
            Ringkasan Kelas (Real-Time PostgreSQL)
          </h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
          {summaryCards.map((c) => {
            const Icon = c.icon;
            return (
              <Card key={c.label} className="p-4 border-slate-200">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-500">{c.label}</span>
                  <div className={`p-1.5 rounded-lg ${c.accent}`}>
                    <Icon className="h-4 w-4" />
                  </div>
                </div>
                <p className="mt-2 font-mono text-2xl font-bold text-slate-900 tabular-nums">
                  {c.value}
                </p>
                <p className="mt-1 text-[11px] text-slate-500 leading-snug">{c.sub}</p>
              </Card>
            );
          })}
        </div>
      </div>

      {/* SECTION B: LEARNING PROGRESS ANALYTICS */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Bar Chart: Completion Rate by Module */}
        <Card className="lg:col-span-7 p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                Tingkat Penyelesaian per Modul
              </h3>
              <p className="text-xs text-slate-500">
                Persentase penyelesaian materi wajib oleh mahasiswa aktif
              </p>
            </div>
            <TrendingUp className="h-4 w-4 text-blue-600" />
          </div>
          {modules.length === 0 ? (
            <p className="text-xs text-slate-500 py-8 text-center">
              Belum ada modul pembelajaran di kelas ini.
            </p>
          ) : (
            <div className="space-y-3">
              {modules.map((m) => (
                <div key={m.moduleId} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-slate-800 truncate pr-3">
                      {m.moduleTitle}
                    </span>
                    <span className="font-mono text-slate-600 tabular-nums shrink-0">
                      {m.moduleCompletionPercentage}% ({m.totalMaterials} materi)
                    </span>
                  </div>
                  <div className="h-2.5 w-full bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-700 rounded-full transition-all"
                      style={{ width: `${m.moduleCompletionPercentage}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Donut + Key Rates */}
        <Card className="lg:col-span-5 p-5 flex flex-col justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-900">
              Distribusi & Metrik Ketercapaian
            </h3>
            <p className="text-xs text-slate-500">
              Ringkasan progres materi, pengumpulan tugas, dan kuis
            </p>
          </div>

          <div className="my-4 flex items-center gap-6">
            <div className="relative h-24 w-24 shrink-0 flex items-center justify-center">
              <svg className="h-24 w-24 -rotate-90" viewBox="0 0 96 96">
                <circle
                  cx="48"
                  cy="48"
                  r={radius}
                  fill="none"
                  stroke="#e2e8f0"
                  strokeWidth="10"
                />
                <circle
                  cx="48"
                  cy="48"
                  r={radius}
                  fill="none"
                  stroke="#1d4ed8"
                  strokeWidth="10"
                  strokeDasharray={circumference}
                  strokeDashoffset={strokeDashoffset}
                  strokeLinecap="round"
                />
              </svg>
              <span className="absolute font-mono text-base font-bold text-slate-900">
                {completionPct}%
              </span>
            </div>

            <div className="flex-1 space-y-2.5 text-xs">
              <div>
                <div className="flex justify-between mb-1">
                  <span className="text-slate-600">Pengumpulan Tugas</span>
                  <span className="font-mono font-semibold text-slate-900">
                    {analytics.submissionRate ?? 0}%
                  </span>
                </div>
                <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-indigo-600 rounded-full"
                    style={{ width: `${analytics.submissionRate ?? 0}%` }}
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between mb-1">
                  <span className="text-slate-600">Progres Penilaian Tugas</span>
                  <span className="font-mono font-semibold text-slate-900">
                    {analytics.gradingProgress ?? 0}%
                  </span>
                </div>
                <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-600 rounded-full"
                    style={{ width: `${analytics.gradingProgress ?? 0}%` }}
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between mb-1">
                  <span className="text-slate-600">Penyelesaian Kuis/Ujian</span>
                  <span className="font-mono font-semibold text-slate-900">
                    {analytics.quizCompletionRate ?? 0}%
                  </span>
                </div>
                <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-sky-600 rounded-full"
                    style={{ width: `${analytics.quizCompletionRate ?? 0}%` }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Student Progress Distribution Buckets */}
          <div className="pt-3 border-t border-slate-100">
            <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-2">
              Distribusi Progres Mahasiswa ({totalDistStudents} Aktif)
            </p>
            <div className="grid grid-cols-4 gap-2 text-center">
              {[
                { label: '0-25%', count: dist['0-25'] || 0, cls: 'bg-rose-50 text-rose-800 border-rose-200' },
                { label: '26-50%', count: dist['26-50'] || 0, cls: 'bg-amber-50 text-amber-800 border-amber-200' },
                { label: '51-75%', count: dist['51-75'] || 0, cls: 'bg-blue-50 text-blue-800 border-blue-200' },
                { label: '76-100%', count: dist['76-100'] || 0, cls: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
              ].map((b) => (
                <div key={b.label} className={`rounded-lg border p-2 ${b.cls}`}>
                  <p className="font-mono text-sm font-bold">{b.count}</p>
                  <p className="text-[10px] font-medium">{b.label}</p>
                </div>
              ))}
            </div>
          </div>
        </Card>
      </div>

      {/* SECTION C & D: STUDENT ATTENTION CENTER & RECENT CLASS ACTIVITY */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* SECTION C: Perlu Perhatian Dosen */}
        <Card className="lg:col-span-7 p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                Perlu Perhatian Dosen
              </h3>
              <p className="text-xs text-slate-500">
                Mahasiswa dengan materi tertunda, tugas terlewat, atau nilai di bawah batas ketuntasan
              </p>
            </div>
            <span className="px-2 py-0.5 rounded-full text-xs font-mono font-semibold bg-amber-100 text-amber-800">
              {attentionList.length}
            </span>
          </div>

          {attentionList.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-500">
              Seluruh mahasiswa berada pada jalur pembelajaran yang baik.
            </div>
          ) : (
            <div className="divide-y divide-slate-100 max-h-96 overflow-y-auto pr-1">
              {attentionList.map((item, idx) => (
                <div
                  key={`${item.studentId}-${item.issueType}-${idx}`}
                  className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-900 truncate">
                        {item.fullName}
                      </span>
                      {item.identityNumber && (
                        <span className="text-[11px] font-mono text-slate-500">
                          {item.identityNumber}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-rose-700 mt-0.5">{item.issueDescription}</p>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {onOpenStudentReport && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onOpenStudentReport(item.studentId)}
                        title="Lihat Rapor Progres Mahasiswa"
                      >
                        <FileText className="h-3.5 w-3.5 mr-1" />
                        Progres
                      </Button>
                    )}
                    {item.actionableResourceId && item.issueType === 'UNSUBMITTED_ASSIGNMENT' && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          navigate(
                            `/classrooms/${classroomId}/assignments/${item.actionableResourceId}/monitoring`
                          )
                        }
                      >
                        <ExternalLink className="h-3.5 w-3.5 mr-1" />
                        Tugas
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="accent"
                      onClick={() => {
                        setNotifyTarget({
                          studentId: item.studentId,
                          fullName: item.fullName,
                          issueDescription: item.issueDescription,
                        });
                        setNotifyMessage(
                          `Halo ${item.fullName}, mohon segera menindaklanjuti: ${item.issueDescription}.`
                        );
                      }}
                    >
                      <Bell className="h-3.5 w-3.5 mr-1" />
                      Ingatkan
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* SECTION D: Recent Class Activity */}
        <Card className="lg:col-span-5 p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Activity className="h-4 w-4 text-blue-700" />
                Aktivitas Kelas Terbaru
              </h3>
              <p className="text-xs text-slate-500">
                Kronologi perubahan materi, tugas, penilaian, dan aktivitas kelas
              </p>
            </div>
          </div>

          {recentActivity.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-500">
              Belum ada catatan aktivitas tercatat.
            </div>
          ) : (
            <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
              {recentActivity.map((act) => (
                <div
                  key={act.id}
                  className="p-3 rounded-lg border border-slate-100 bg-slate-50/70 text-xs"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-slate-900">
                      {act.actorName || 'Sistem'}
                    </span>
                    <span className="text-[10px] font-mono text-slate-500">
                      {formatDateTime(act.createdAt)}
                    </span>
                  </div>
                  <p className="text-slate-700 mt-1">{act.changeSummary}</p>
                  <div className="mt-1.5 flex items-center gap-2">
                    <span className="px-1.5 py-0.5 rounded bg-slate-200 text-slate-700 text-[10px] font-mono">
                      {act.resourceType}
                    </span>
                    <span className="px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 text-[10px] font-mono">
                      {act.action}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Individual Notification Modal */}
      <ModalDialog
        open={Boolean(notifyTarget)}
        onClose={() => setNotifyTarget(null)}
        title={`Kirim Notifikasi ke ${notifyTarget?.fullName || ''}`}
      >
        <div className="space-y-4">
          <p className="text-xs text-slate-600 bg-amber-50 border border-amber-200 rounded-lg p-3">
            Kondisi terdeteksi: <strong>{notifyTarget?.issueDescription}</strong>
          </p>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Judul Notifikasi
            </label>
            <Input
              value={notifyTitle}
              onChange={(e) => setNotifyTitle(e.target.value)}
              placeholder="Pengingat Pembelajaran"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Pesan
            </label>
            <Textarea
              rows={4}
              value={notifyMessage}
              onChange={(e) => setNotifyMessage(e.target.value)}
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setNotifyTarget(null)}>
              Batal
            </Button>
            <Button
              disabled={notifyMutation.isPending || !notifyTitle.trim() || !notifyMessage.trim()}
              onClick={() => {
                if (!notifyTarget) return;
                notifyMutation.mutate({
                  studentId: notifyTarget.studentId,
                  title: notifyTitle.trim(),
                  message: notifyMessage.trim(),
                });
              }}
            >
              <Send className="h-3.5 w-3.5 mr-1.5" />
              {notifyMutation.isPending ? 'Mengirim...' : 'Kirim Notifikasi'}
            </Button>
          </div>
        </div>
      </ModalDialog>
    </div>
  );
}
