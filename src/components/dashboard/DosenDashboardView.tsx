import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Presentation,
  Users,
  BookOpen,
  ClipboardList,
  Award,
  AlertCircle,
  Clock,
  CheckCircle2,
  Plus,
  ArrowUpRight,
  MessageSquare,
  BarChart3,
  FileCheck2,
  PenLine,
} from 'lucide-react';
import { Card, Button, Skeleton, EmptyState } from '../ui/primitives';
import { StatKpiCard, DashboardErrorState } from './DashboardSharedWidgets';
import { apiRequest } from '../../lib/api';
import { formatDateTime } from '../../lib/utils';
import { hasPermission } from '../../lib/authorization';
import type { LmsUser } from '../../context/AuthContext';

export const DOSEN_WIDGETS = [
  { id: 'overview', label: 'Ringkasan Pengajaran' },
  { id: 'quick_actions', label: 'Aksi Cepat Dosen' },
  { id: 'my_classrooms', label: 'Kelas yang Diampu' },
  { id: 'teaching_activity', label: 'Aktivitas Pengajaran & Penilaian' },
  { id: 'student_monitoring', label: 'Monitoring Progres Mahasiswa' },
];

export function DosenDashboardView({
  user,
  selectedPeriodId,
  hiddenWidgets,
  widgetOrder,
  compact,
  notificationSlot,
}: {
  user: LmsUser;
  selectedPeriodId: string;
  hiddenWidgets: string[];
  widgetOrder: string[];
  compact: boolean;
  notificationSlot: React.ReactNode;
}) {
  const navigate = useNavigate();
  const [activityTab, setActivityTab] = useState<
    'submissions' | 'materials' | 'assignments' | 'assessments' | 'discussions'
  >('submissions');

  const query = useQuery({
    queryKey: ['dashboard-lecturer', user.id, selectedPeriodId],
    queryFn: () => {
      const qs = selectedPeriodId ? `?periodId=${selectedPeriodId}` : '';
      return apiRequest<any>(`/dashboards/lecturer${qs}`);
    },
    retry: false,
  });

  if (query.isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  if (query.isError || !query.data?.data) {
    return (
      <DashboardErrorState
        title="Gagal memuat dashboard pengajaran"
        message={(query.error as Error)?.message}
        onRetry={() => query.refetch()}
        retrying={query.isFetching}
      />
    );
  }

  const data = query.data.data;
  const ov = data.overview;
  const myClassrooms: any[] = data.classrooms || [];
  const ta = data.teachingActivity || {};
  const sm = data.studentMonitoring || {};
  const primaryClassroomId = myClassrooms[0]?.id;

  const isVisible = (id: string) => !hiddenWidgets.includes(id);

  const quickActions = [
    {
      label: 'Buat Ruang Kelas',
      icon: Plus,
      onClick: () => navigate('/classrooms/new'),
      allowed: hasPermission(user, 'classrooms:create'),
    },
    {
      label: 'Buat Materi',
      icon: BookOpen,
      onClick: () =>
        navigate(
          primaryClassroomId
            ? `/classrooms/${primaryClassroomId}/materials/new`
            : '/classrooms'
        ),
      allowed: hasPermission(user, 'content:publish'),
    },
    {
      label: 'Buat Tugas',
      icon: ClipboardList,
      onClick: () =>
        navigate(
          primaryClassroomId
            ? `/classrooms/${primaryClassroomId}/assignments/new`
            : '/classrooms'
        ),
      allowed: hasPermission(user, 'assignments:manage'),
    },
    {
      label: 'Buat Asesmen',
      icon: Award,
      onClick: () =>
        navigate(
          primaryClassroomId
            ? `/classrooms/${primaryClassroomId}/assessments/new`
            : '/classrooms'
        ),
      allowed: hasPermission(user, 'quizzes:manage'),
    },
    {
      label: 'Periksa Tugas & Nilai',
      icon: PenLine,
      onClick: () =>
        navigate(
          primaryClassroomId ? `/classrooms/${primaryClassroomId}` : '/classrooms'
        ),
      allowed: hasPermission(user, 'grades:manage'),
    },
    {
      label: 'Analitik Kelas',
      icon: BarChart3,
      onClick: () =>
        navigate(
          primaryClassroomId ? `/classrooms/${primaryClassroomId}` : '/classrooms'
        ),
      allowed: hasPermission(user, 'classrooms:view'),
    },
  ].filter((a) => a.allowed);

  const sections: Record<string, React.ReactNode> = {
    overview: (
      <section key="overview" className="space-y-3">
        <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wide">
          Ringkasan Aktivitas Pengajaran
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <StatKpiCard
            compact={compact}
            label="Kelas Diampu"
            value={ov.totalClassrooms}
            sublabel={`${ov.activeClassrooms} kelas aktif`}
            icon={Presentation}
            tone="navy"
            onClick={() => navigate('/classrooms')}
          />
          <StatKpiCard
            compact={compact}
            label="Total Mahasiswa"
            value={ov.totalStudents}
            sublabel={`${ov.pendingEnrollmentsCount || 0} pending persetujuan`}
            icon={Users}
            tone="blue"
          />
          <StatKpiCard
            compact={compact}
            label="Materi & Tugas"
            value={ov.publishedMaterialsCount + ov.activeAssignmentsCount}
            sublabel={`${ov.publishedMaterialsCount} materi · ${ov.activeAssignmentsCount} tugas · ${ov.activeAssessmentsCount} ujian`}
            icon={BookOpen}
            tone="green"
          />
          <StatKpiCard
            compact={compact}
            label="Perlu Dinilai"
            value={ov.ungradedSubmissionsCount + ov.pendingEssayGradingCount}
            sublabel={`${ov.ungradedSubmissionsCount} tugas · ${ov.pendingEssayGradingCount} esai ujian`}
            icon={FileCheck2}
            tone={
              ov.ungradedSubmissionsCount + ov.pendingEssayGradingCount > 0
                ? 'orange'
                : 'green'
            }
          />
          <StatKpiCard
            compact={compact}
            label="Progres Rendah"
            value={ov.lowProgressStudentsCount}
            sublabel="Mahasiswa < 40% materi"
            icon={AlertCircle}
            tone={ov.lowProgressStudentsCount > 0 ? 'red' : 'green'}
          />
        </div>
      </section>
    ),

    quick_actions: quickActions.length > 0 && (
      <Card
        key="quick_actions"
        className="bg-white border border-slate-200 shadow-xs p-4"
      >
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-slate-900">
            Aksi Cepat Dosen
          </h3>
          <span className="text-[11px] text-slate-400">
            Berdasarkan kepemilikan kelas & hak co-dosen
          </span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
          {quickActions.map((qa) => (
            <Button
              key={qa.label}
              type="button"
              variant="outline"
              onClick={qa.onClick}
              className="h-auto py-2.5 px-3 justify-start gap-2 text-xs font-medium border-slate-200 hover:border-blue-300 hover:bg-blue-50/40 text-slate-800"
            >
              <qa.icon className="h-4 w-4 text-blue-600 shrink-0" />
              <span className="truncate">{qa.label}</span>
            </Button>
          ))}
        </div>
      </Card>
    ),

    my_classrooms: (
      <Card
        key="my_classrooms"
        className="bg-white border border-slate-200 shadow-xs p-4 sm:p-5"
      >
        <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-100">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">
              Ruang Kelas Saya ({myClassrooms.length})
            </h3>
            <p className="text-xs text-slate-500">
              Kelas yang Anda buat atau ditugaskan sebagai dosen / co-dosen
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => navigate('/classrooms')}
            className="text-xs h-8"
          >
            Semua Kelas
            <ArrowUpRight className="h-3.5 w-3.5 ml-1" />
          </Button>
        </div>

        {myClassrooms.length === 0 ? (
          <div className="py-8">
            <EmptyState
              title="Belum ada kelas yang diampu"
              description="Buat ruang kelas baru atau tunggu penugasan sebagai co-dosen."
            />
          </div>
        ) : (
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {myClassrooms.map((cls) => (
              <div
                key={cls.id}
                onClick={() => navigate(`/classrooms/${cls.id}`)}
                className="p-4 rounded-xl border border-slate-200 hover:border-blue-300 bg-white cursor-pointer transition-colors flex flex-col justify-between gap-3"
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-mono font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                      {cls.courseCode} · {cls.section}
                    </span>
                    <span
                      className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${
                        cls.isOwner
                          ? 'bg-blue-50 text-blue-700'
                          : 'bg-amber-50 text-amber-700'
                      }`}
                    >
                      {cls.isOwner ? 'Pengampu Utama' : 'Co-Dosen'}
                    </span>
                  </div>
                  <h4 className="mt-2 text-sm font-bold text-slate-900 line-clamp-1">
                    {cls.courseTitle}
                  </h4>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {cls.studyProgram} · {cls.semesterLabel}
                  </p>
                  {cls.coLecturers?.length > 0 && (
                    <p className="text-[11px] text-slate-500 mt-1 truncate">
                      Co-Dosen:{' '}
                      {cls.coLecturers.map((c: any) => c.fullName).join(', ')}
                    </p>
                  )}
                </div>

                <div className="space-y-1.5 pt-2 border-t border-slate-100">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-600">
                      {cls.studentCount} mahasiswa
                    </span>
                    <span className="font-semibold text-slate-800">
                      Progres {cls.activityProgressPercent}%
                    </span>
                  </div>
                  <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-600 rounded-full"
                      style={{ width: `${cls.activityProgressPercent}%` }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    ),

    teaching_activity: (
      <div
        key="teaching_activity"
        className="grid grid-cols-1 lg:grid-cols-3 gap-4"
      >
        <Card className="lg:col-span-2 bg-white border border-slate-200 shadow-xs p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100">
            <h3 className="text-sm font-semibold text-slate-900">
              Aktivitas Pengajaran Terbaru
            </h3>
            <div className="flex flex-wrap gap-1">
              {(
                [
                  ['submissions', 'Pengumpulan'],
                  ['materials', 'Materi'],
                  ['assignments', 'Tugas'],
                  ['assessments', 'Asesmen'],
                  ['discussions', 'Diskusi'],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setActivityTab(key)}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                    activityTab === key
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-3 divide-y divide-slate-100">
            {activityTab === 'submissions' &&
              ((ta.recentSubmissions || []).length === 0 ? (
                <p className="py-6 text-center text-xs text-slate-400">
                  Belum ada pengumpulan tugas terbaru.
                </p>
              ) : (
                ta.recentSubmissions.map((s: any) => (
                  <div
                    key={s.id}
                    className="py-2.5 flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-slate-800 truncate">
                        {s.studentName} — {s.assignmentTitle}
                      </p>
                      <p className="text-[11px] text-slate-500">
                        {s.classroomName} · {formatDateTime(s.submittedAt)}
                      </p>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        navigate(
                          `/classrooms/${s.classroomId}/assignments/${s.assignmentId}/grading/${s.id}`
                        )
                      }
                      className="h-7 text-[11px] shrink-0"
                    >
                      {s.gradingStatus === 'SUBMITTED' ? 'Periksa' : s.gradingStatus}
                    </Button>
                  </div>
                ))
              ))}

            {activityTab === 'materials' &&
              ((ta.recentMaterials || []).length === 0 ? (
                <p className="py-6 text-center text-xs text-slate-400">
                  Belum ada materi diterbitkan.
                </p>
              ) : (
                ta.recentMaterials.map((m: any) => (
                  <div
                    key={m.id}
                    className="py-2.5 flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-slate-800 truncate">
                        {m.title}
                      </p>
                      <p className="text-[11px] text-slate-500">
                        {m.classroomName} · {formatDateTime(m.publishedAt)}
                      </p>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        navigate(`/classrooms/${m.classroomId}/materials/${m.id}`)
                      }
                      className="h-7 text-[11px] shrink-0"
                    >
                      Buka
                    </Button>
                  </div>
                ))
              ))}

            {activityTab === 'assignments' &&
              ((ta.recentAssignments || []).length === 0 ? (
                <p className="py-6 text-center text-xs text-slate-400">
                  Belum ada tugas dibuat.
                </p>
              ) : (
                ta.recentAssignments.map((a: any) => (
                  <div
                    key={a.id}
                    className="py-2.5 flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-slate-800 truncate">
                        {a.title}
                      </p>
                      <p className="text-[11px] text-slate-500">
                        {a.classroomName} · Status: {a.status}
                      </p>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        navigate(
                          `/classrooms/${a.classroomId}/assignments/${a.id}/monitoring`
                        )
                      }
                      className="h-7 text-[11px] shrink-0"
                    >
                      Monitoring
                    </Button>
                  </div>
                ))
              ))}

            {activityTab === 'assessments' &&
              ((ta.recentAssessments || []).length === 0 ? (
                <p className="py-6 text-center text-xs text-slate-400">
                  Belum ada asesmen dibuat.
                </p>
              ) : (
                ta.recentAssessments.map((a: any) => (
                  <div
                    key={a.id}
                    className="py-2.5 flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-slate-800 truncate">
                        {a.title}
                      </p>
                      <p className="text-[11px] text-slate-500">
                        {a.classroomName} · {a.category} · {a.status}
                      </p>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        navigate(
                          `/classrooms/${a.classroomId}/assessments/${a.id}/monitoring`
                        )
                      }
                      className="h-7 text-[11px] shrink-0"
                    >
                      Monitoring
                    </Button>
                  </div>
                ))
              ))}

            {activityTab === 'discussions' &&
              ((ta.recentDiscussions || []).length === 0 ? (
                <p className="py-6 text-center text-xs text-slate-400">
                  Belum ada aktivitas diskusi kelas.
                </p>
              ) : (
                ta.recentDiscussions.map((d: any) => (
                  <div
                    key={d.id}
                    onClick={() => navigate(`/classrooms/${d.classroomId}`)}
                    className="py-2.5 cursor-pointer hover:bg-slate-50 px-1 rounded"
                  >
                    <div className="flex items-center justify-between text-[11px] text-slate-500">
                      <span className="font-semibold text-slate-700 flex items-center gap-1">
                        <MessageSquare className="h-3 w-3" /> {d.authorName} (
                        {d.classroomName})
                      </span>
                      <span>{formatDateTime(d.createdAt)}</span>
                    </div>
                    <p className="mt-1 text-xs text-slate-700 line-clamp-2">
                      {d.content}
                    </p>
                  </div>
                ))
              ))}
          </div>
        </Card>

        <div>{notificationSlot}</div>
      </div>
    ),

    student_monitoring: (
      <Card
        key="student_monitoring"
        className="bg-white border border-slate-200 shadow-xs p-4 sm:p-5"
      >
        <div className="pb-3 border-b border-slate-100">
          <h3 className="text-sm font-semibold text-slate-900">
            Monitoring Pembelajaran Mahasiswa (Data Aktual)
          </h3>
          <p className="text-xs text-slate-500">
            Ringkasan ketercapaian materi, pengumpulan tugas, dan nilai di bawah ambang batas
          </p>
        </div>

        <div className="mt-4 grid grid-cols-2 sm:grid-cols-5 gap-3">
          <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
            <p className="text-[11px] text-slate-500">Belum Memulai</p>
            <p className="text-lg font-bold text-slate-800 mt-0.5">
              {sm.notStartedCount || 0}
            </p>
          </div>
          <div className="p-3 rounded-lg bg-blue-50/70 border border-blue-100">
            <p className="text-[11px] text-blue-700">Sedang Belajar</p>
            <p className="text-lg font-bold text-blue-800 mt-0.5">
              {sm.inProgressCount || 0}
            </p>
          </div>
          <div className="p-3 rounded-lg bg-emerald-50/70 border border-emerald-100">
            <p className="text-[11px] text-emerald-700">Selesai Materi</p>
            <p className="text-lg font-bold text-emerald-800 mt-0.5">
              {sm.completedCount || 0}
            </p>
          </div>
          <div className="p-3 rounded-lg bg-amber-50/70 border border-amber-100">
            <p className="text-[11px] text-amber-700">Belum Kumpul Tugas</p>
            <p className="text-lg font-bold text-amber-800 mt-0.5">
              {sm.notSubmittedAssignmentsCount || 0}
            </p>
          </div>
          <div className="p-3 rounded-lg bg-rose-50/70 border border-rose-100">
            <p className="text-[11px] text-rose-700">Nilai &lt; 60</p>
            <p className="text-lg font-bold text-rose-800 mt-0.5">
              {sm.belowThresholdGradesCount || 0}
            </p>
          </div>
        </div>

        {(sm.studentsNeedingAttention || []).length > 0 && (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-slate-100 text-slate-500">
                  <th className="py-2 pr-3 font-medium">Mahasiswa</th>
                  <th className="py-2 pr-3 font-medium">NIM</th>
                  <th className="py-2 pr-3 font-medium">Kelas</th>
                  <th className="py-2 pr-3 font-medium">Progres Materi</th>
                  <th className="py-2 font-medium text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sm.studentsNeedingAttention.map((st: any, idx: number) => (
                  <tr key={`${st.studentId}-${st.classroomId}-${idx}`}>
                    <td className="py-2 pr-3 font-medium text-slate-800">
                      {st.fullName}
                    </td>
                    <td className="py-2 pr-3 font-mono text-slate-500">
                      {st.nim}
                    </td>
                    <td className="py-2 pr-3 text-slate-700">
                      {st.classroomName}
                    </td>
                    <td className="py-2 pr-3">
                      <span className="inline-flex items-center gap-1 text-rose-700 font-semibold">
                        <Clock className="h-3 w-3" /> {st.progressPercent}%
                      </span>
                    </td>
                    <td className="py-2 text-right">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          navigate(`/classrooms/${st.classroomId}/participants`)
                        }
                        className="h-7 text-[11px]"
                      >
                        Lihat Peserta
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    ),
  };

  const orderedIds = widgetOrder.length
    ? widgetOrder
    : DOSEN_WIDGETS.map((w) => w.id);

  return (
    <div className="space-y-5">
      {orderedIds.map((id) => (isVisible(id) ? sections[id] : null))}
    </div>
  );
}
