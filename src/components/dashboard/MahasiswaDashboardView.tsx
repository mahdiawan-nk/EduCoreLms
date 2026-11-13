import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  useQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import {
  BookOpen,
  Layers,
  Clock,
  ClipboardList,
  Award,
  CheckCircle2,
  KeyRound,
  Calendar,
  ArrowUpRight,
  GraduationCap,
  Megaphone,
  AlertTriangle,
  PlayCircle,
  Lock,
  Globe,
} from 'lucide-react';
import {
  Card,
  Button,
  Skeleton,
  EmptyState,
  ModalDialog,
  Input,
} from '../ui/primitives';
import { StatKpiCard, DashboardErrorState } from './DashboardSharedWidgets';
import { getClassroomGradient } from '../classroom/ClassroomCard';
import { apiRequest } from '../../lib/api';
import { formatDateTime } from '../../lib/utils';
import { hasPermission } from '../../lib/authorization';
import type { LmsUser } from '../../context/AuthContext';
import { toast } from 'sonner';

export const MAHASISWA_WIDGETS = [
  { id: 'overview', label: 'Ringkasan Akademik Mahasiswa' },
  { id: 'quick_actions', label: 'Aksi Cepat Belajar' },
  { id: 'priorities_and_activities', label: 'Prioritas Hari Ini & Aktivitas Akademik' },
  { id: 'learning_progress', label: 'Progres Pembelajaran per Kelas' },
  { id: 'my_classrooms', label: 'Kelas Saya' },
];

const DAY_NAMES = ['', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'];

const PROGRESS_BADGE: Record<string, { label: string; cls: string }> = {
  NOT_STARTED: { label: 'NOT_STARTED', cls: 'bg-slate-100 text-slate-600' },
  IN_PROGRESS: { label: 'IN_PROGRESS', cls: 'bg-blue-50 text-blue-700' },
  COMPLETED: { label: 'COMPLETED', cls: 'bg-emerald-50 text-emerald-700' },
};

export function MahasiswaDashboardView({
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
  const queryClient = useQueryClient();

  const [activityTab, setActivityTab] = useState<
    'priorities' | 'timetable' | 'grades' | 'announcements' | 'materials'
  >('priorities');

  // 2-Step Join by Code Modal
  const [joinOpen, setJoinOpen] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [validatedPreview, setValidatedPreview] = useState<any>(null);

  const query = useQuery({
    queryKey: ['dashboard-student', user.id, selectedPeriodId],
    queryFn: () => {
      const qs = selectedPeriodId ? `?periodId=${selectedPeriodId}` : '';
      return apiRequest<any>(`/dashboards/student${qs}`);
    },
    retry: false,
  });

  const validateCodeMutation = useMutation({
    mutationFn: (code: string) =>
      apiRequest<any>('/classrooms/join/validate', {
        method: 'POST',
        body: JSON.stringify({ code }),
      }),
    onSuccess: (res) => {
      setValidatedPreview(res.data);
    },
    onError: (err: any) => {
      setValidatedPreview(null);
      toast.error(err.message || 'Kode undangan tidak valid');
    },
  });

  const joinMutation = useMutation({
    mutationFn: (code: string) =>
      apiRequest<any>('/classrooms/join', {
        method: 'POST',
        body: JSON.stringify({ code }),
      }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['dashboard-student'] });
      queryClient.invalidateQueries({ queryKey: ['classrooms'] });
      setJoinOpen(false);
      setJoinCode('');
      setValidatedPreview(null);
      toast.success(`Berhasil bergabung ke ${res.data.classroom.name}`);
      navigate(`/classrooms/${res.data.classroom.id}`);
    },
    onError: (err: any) => {
      toast.error(err.message || 'Gagal bergabung ke kelas');
    },
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
        title="Gagal memuat dashboard pembelajaran"
        message={(query.error as Error)?.message}
        onRetry={() => query.refetch()}
        retrying={query.isFetching}
      />
    );
  }

  const data = query.data.data;
  const ov = data.overview;
  const learningProgress: any[] = data.learningProgress || [];
  const myClassrooms: any[] = data.classrooms || [];
  const timetable: any[] = data.timetable || [];
  const aa = data.academicActivities || {};

  const isVisible = (id: string) => !hiddenWidgets.includes(id);

  const latestMaterial = (aa.recentMaterials || []).find((m: any) => !m.completed) || aa.recentMaterials?.[0];

  const quickActions = [
    {
      label: 'Lihat Semua Kelas',
      icon: Layers,
      onClick: () => navigate('/classrooms'),
      allowed: hasPermission(user, 'classrooms:view'),
    },
    {
      label: 'Gabung Kode Undangan',
      icon: KeyRound,
      onClick: () => setJoinOpen(true),
      allowed: hasPermission(user, 'enrollments:join'),
    },
    {
      label: 'Lanjutkan Materi Terakhir',
      icon: PlayCircle,
      onClick: () =>
        navigate(
          latestMaterial
            ? `/classrooms/${latestMaterial.classroomId}/materials/${latestMaterial.id}`
            : '/classrooms'
        ),
      allowed: hasPermission(user, 'materials:view'),
    },
    {
      label: 'Lihat Tugas',
      icon: ClipboardList,
      onClick: () => {
        const firstDue = aa.upcomingDeadlines?.[0];
        navigate(
          firstDue
            ? `/classrooms/${firstDue.classroomId}/assignments/${firstDue.id}`
            : '/classrooms'
        );
      },
      allowed: hasPermission(user, 'assignments:view'),
    },
    {
      label: 'Lihat Nilai',
      icon: Award,
      onClick: () => setActivityTab('grades'),
      allowed: hasPermission(user, 'grades:view_own'),
    },
    {
      label: 'Lihat Jadwal',
      icon: Calendar,
      onClick: () => setActivityTab('timetable'),
      allowed: true,
    },
  ].filter((a) => a.allowed);

  const sections: Record<string, React.ReactNode> = {
    overview: (
      <section key="overview" className="space-y-3">
        <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wide">
          Ringkasan Pembelajaran Saya
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatKpiCard
            compact={compact}
            label="Kelas Terdaftar"
            value={ov.enrolledCount}
            sublabel={`${ov.activeClassroomsCount} kelas aktif · ${ov.totalCredits} SKS`}
            icon={GraduationCap}
            tone="navy"
            onClick={() => navigate('/classrooms')}
          />
          <StatKpiCard
            compact={compact}
            label="Materi Belum Selesai"
            value={ov.incompleteMaterialsCount}
            sublabel="Berdasarkan status selesai"
            icon={BookOpen}
            tone={ov.incompleteMaterialsCount > 0 ? 'blue' : 'green'}
          />
          <StatKpiCard
            compact={compact}
            label="Tugas & Penilaian"
            value={ov.unsubmittedAssignmentsCount}
            sublabel={`${ov.pendingGradingAssignmentsCount} menunggu penilaian`}
            icon={ClipboardList}
            tone={ov.unsubmittedAssignmentsCount > 0 ? 'orange' : 'green'}
          />
          <StatKpiCard
            compact={compact}
            label="Ujian & Nilai"
            value={
              ov.latestGradeScore !== null ? `${ov.latestGradeScore}` : `${ov.upcomingExamsCount} Ujian`
            }
            sublabel={`${ov.upcomingExamsCount} ujian mendatang`}
            icon={Award}
            tone="green"
          />
        </div>
      </section>
    ),

    quick_actions: quickActions.length > 0 && (
      <Card
        key="quick_actions"
        className="bg-white border border-slate-200 shadow-xs p-4"
      >
        <h3 className="text-sm font-semibold text-slate-900 mb-3">
          Aksi Cepat Mahasiswa
        </h3>
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

    priorities_and_activities: (
      <div
        key="priorities_and_activities"
        className="grid grid-cols-1 lg:grid-cols-3 gap-4"
      >
        <Card className="lg:col-span-2 bg-white border border-slate-200 shadow-xs p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100">
            <h3 className="text-sm font-semibold text-slate-900">
              Prioritas Hari Ini & Aktivitas Akademik
            </h3>
            <div className="flex flex-wrap gap-1">
              {(
                [
                  ['priorities', 'Prioritas'],
                  ['timetable', 'Jadwal'],
                  ['materials', 'Materi Baru'],
                  ['announcements', 'Pengumuman'],
                  ['grades', 'Nilai Terbaru'],
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
            {activityTab === 'priorities' &&
              ((aa.prioritiesToday || []).length === 0 ? (
                <div className="py-6 text-center text-xs text-slate-500">
                  Tidak ada deadline tugas atau ujian mendesak saat ini.
                </div>
              ) : (
                aa.prioritiesToday.map((item: any) => (
                  <div
                    key={`${item.type}-${item.id}`}
                    className="py-2.5 flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span
                          className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                            item.urgency === 'HIGH'
                              ? 'bg-rose-50 text-rose-700'
                              : 'bg-amber-50 text-amber-700'
                          }`}
                        >
                          <AlertTriangle className="h-3 w-3" />
                          {item.type === 'ASSESSMENT' ? 'UJIAN' : 'TUGAS'}
                        </span>
                        <span className="text-xs font-semibold text-slate-800 truncate">
                          {item.title}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        {item.classroomName}
                        {item.dueAt ? ` · Batas: ${formatDateTime(item.dueAt)}` : ''}
                      </p>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => navigate(item.actionUrl)}
                      className="h-7 text-[11px] shrink-0"
                    >
                      Kerjakan
                    </Button>
                  </div>
                ))
              ))}

            {activityTab === 'timetable' &&
              (timetable.length === 0 ? (
                <div className="py-6 text-center text-xs text-slate-500">
                  Belum ada jadwal perkuliahan terjadwal.
                </div>
              ) : (
                timetable.map((s: any, idx: number) => (
                  <div
                    key={`${s.classroomId}-${idx}`}
                    className="py-2.5 flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-slate-800 truncate">
                        {s.classroomName}
                      </p>
                      <p className="text-[11px] text-slate-500">
                        {DAY_NAMES[s.dayOfWeek] || `Hari ${s.dayOfWeek}`} · {s.startTime} –{' '}
                        {s.endTime} · {s.buildingCode ? `${s.buildingCode} ` : ''}
                        {s.roomNumber}
                      </p>
                    </div>
                    <span className="text-[11px] px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-medium">
                      {s.meetingType}
                    </span>
                  </div>
                ))
              ))}

            {activityTab === 'materials' &&
              ((aa.recentMaterials || []).length === 0 ? (
                <div className="py-6 text-center text-xs text-slate-500">
                  Belum ada materi terbaru pada kelas Anda.
                </div>
              ) : (
                aa.recentMaterials.map((m: any) => (
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
                      {m.completed ? 'Selesai' : 'Pelajari'}
                    </Button>
                  </div>
                ))
              ))}

            {activityTab === 'announcements' &&
              ((aa.recentAnnouncements || []).length === 0 ? (
                <div className="py-6 text-center text-xs text-slate-500">
                  Belum ada pengumuman dosen.
                </div>
              ) : (
                aa.recentAnnouncements.map((an: any) => (
                  <div
                    key={an.id}
                    onClick={() => navigate(`/classrooms/${an.classroomId}`)}
                    className="py-2.5 cursor-pointer hover:bg-slate-50 px-1 rounded"
                  >
                    <p className="text-xs font-semibold text-slate-800 flex items-center gap-1.5">
                      <Megaphone className="h-3.5 w-3.5 text-blue-600 shrink-0" />
                      {an.title}
                    </p>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      {an.classroomName} · {an.authorName} · {formatDateTime(an.createdAt)}
                    </p>
                  </div>
                ))
              ))}

            {activityTab === 'grades' &&
              ((aa.latestGrades || []).length === 0 ? (
                <div className="py-6 text-center text-xs text-slate-500">
                  Belum ada nilai yang dipublikasikan.
                </div>
              ) : (
                aa.latestGrades.map((g: any) => (
                  <div
                    key={g.id}
                    className="py-2.5 flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-slate-800 truncate">
                        {g.title}
                      </p>
                      <p className="text-[11px] text-slate-500">
                        {g.classroomName} · {g.sourceType}
                      </p>
                    </div>
                    <span className="text-sm font-bold text-emerald-700">
                      {g.score}/{g.maxScore}
                    </span>
                  </div>
                ))
              ))}
          </div>
        </Card>

        <div>{notificationSlot}</div>
      </div>
    ),

    learning_progress: (
      <Card
        key="learning_progress"
        className="bg-white border border-slate-200 shadow-xs p-4 sm:p-5"
      >
        <div className="pb-3 border-b border-slate-100">
          <h3 className="text-sm font-semibold text-slate-900">
            Progres Pembelajaran per Kelas
          </h3>
          <p className="text-xs text-slate-500">
            Dihitung berdasarkan penyelesaian materi aktual (bukan sekadar membuka materi)
          </p>
        </div>

        {learningProgress.length === 0 ? (
          <div className="py-6 text-center text-xs text-slate-500">
            Anda belum terdaftar pada kelas di periode ini.
          </div>
        ) : (
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
            {learningProgress.map((lp) => {
              const badge = PROGRESS_BADGE[lp.progressStatus] || PROGRESS_BADGE.NOT_STARTED;
              return (
                <div
                  key={lp.classroomId}
                  onClick={() => navigate(`/classrooms/${lp.classroomId}`)}
                  className="p-3.5 rounded-xl border border-slate-200 hover:border-blue-300 cursor-pointer transition-colors space-y-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-slate-900 truncate">
                        {lp.classroomName}
                      </p>
                      <p className="text-[11px] text-slate-500">{lp.courseCode}</p>
                    </div>
                    <span
                      className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${badge.cls}`}
                    >
                      {badge.label}
                    </span>
                  </div>

                  <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${
                        lp.progressStatus === 'COMPLETED'
                          ? 'bg-emerald-600'
                          : 'bg-blue-600'
                      }`}
                      style={{ width: `${lp.progressPercent}%` }}
                    />
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-600">
                    <span>
                      Modul: {lp.completedModulesCount}/{lp.totalModulesCount} · Materi:{' '}
                      {lp.completedMaterialsCount}/{lp.totalMaterialsCount}
                    </span>
                    <span>
                      Tugas: {lp.submittedAssignmentsCount}/{lp.totalAssignmentsCount} · Ujian:{' '}
                      {lp.completedAssessmentsCount}/{lp.totalAssessmentsCount}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
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
              Kelas yang Anda ikuti pada periode akademik terpilih
            </p>
          </div>
          <div className="flex items-center gap-2">
            {hasPermission(user, 'enrollments:join') && (
              <Button
                type="button"
                size="sm"
                onClick={() => setJoinOpen(true)}
                className="bg-blue-600 hover:bg-blue-700 text-white text-xs h-8"
              >
                <KeyRound className="h-3.5 w-3.5 mr-1" />
                Gabung Kelas
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => navigate('/classrooms')}
              className="text-xs h-8"
            >
              Jelajahi Kelas
              <ArrowUpRight className="h-3.5 w-3.5 ml-1" />
            </Button>
          </div>
        </div>

        {myClassrooms.length === 0 ? (
          <div className="py-8">
            <EmptyState
              title="Belum terdaftar di kelas"
              description="Gunakan kode undangan dari dosen untuk bergabung ke ruang kelas."
            />
          </div>
        ) : (
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {myClassrooms.map((cls) => {
              const { gradientClass, Icon: CoverIcon } = getClassroomGradient(cls.id);
              return (
              <div
                key={cls.id}
                className="rounded-xl border border-slate-200 bg-white overflow-hidden flex flex-col justify-between hover:border-blue-300 transition-colors"
              >
                <div>
                  <div className={`aspect-video w-full bg-gradient-to-br ${gradientClass} relative overflow-hidden`}>
                    {cls.coverImageUrl ? (
                      <img
                        src={cls.coverImageUrl}
                        alt={cls.courseTitle}
                        loading="lazy"
                        decoding="async"
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                        }}
                        className="h-full w-full object-cover object-center"
                      />
                    ) : (
                      <div className="h-full w-full flex items-center justify-end pr-5 text-white/15 pointer-events-none select-none">
                        <CoverIcon className="h-16 w-16" />
                      </div>
                    )}
                    <span className="absolute top-2 left-2 px-2 py-0.5 rounded bg-white/95 text-[#14213D] font-mono text-[10px] font-bold">
                      {cls.courseCode}
                    </span>
                    <span className="absolute top-2 right-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-white/95 text-slate-800">
                      {cls.visibility === 'PUBLIC' ? (
                        <Globe className="h-3 w-3 text-emerald-600" />
                      ) : (
                        <Lock className="h-3 w-3 text-slate-600" />
                      )}
                      {cls.visibility}
                    </span>
                  </div>

                  <div className="p-4 space-y-2">
                    <h4 className="text-sm font-bold text-slate-900 line-clamp-1">
                      {cls.courseTitle}
                    </h4>
                    <p className="text-xs text-slate-600">
                      {cls.instructorName} · {cls.studyProgram}
                    </p>
                    <p className="text-[11px] text-slate-500">
                      Kode: {cls.code} · {cls.semesterLabel}
                    </p>

                    <div className="pt-1 space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-500">Progres Belajar</span>
                        <span className="font-semibold text-slate-800">
                          {cls.progressPercent}%
                        </span>
                      </div>
                      <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-blue-600 rounded-full"
                          style={{ width: `${cls.progressPercent}%` }}
                        />
                      </div>
                    </div>

                    {cls.nearestAssignment && (
                      <p className="text-[11px] text-amber-700 bg-amber-50 px-2 py-1 rounded truncate">
                        Tugas terdekat: {cls.nearestAssignment.title}
                      </p>
                    )}
                  </div>
                </div>

                <div className="px-4 pb-4">
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => navigate(`/classrooms/${cls.id}`)}
                    className="w-full bg-slate-900 hover:bg-slate-800 text-white text-xs"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
                    Masuk Kelas
                  </Button>
                </div>
              </div>
              );
            })}
          </div>
        )}
      </Card>
    ),
  };

  const orderedIds = widgetOrder.length
    ? widgetOrder
    : MAHASISWA_WIDGETS.map((w) => w.id);

  return (
    <div className="space-y-5">
      {orderedIds.map((id) => (isVisible(id) ? sections[id] : null))}

      {/* 2-Step Join by Invitation Code Modal */}
      <ModalDialog
        open={joinOpen}
        onClose={() => {
          setJoinOpen(false);
          setValidatedPreview(null);
        }}
        title="Gabung Kelas via Kode Undangan"
        description="Masukkan kode undangan resmi dari dosen pengampu (berlaku untuk kelas Publik maupun Private)."
      >
        <div className="space-y-3">
          <div className="flex gap-2">
            <Input
              value={joinCode}
              onChange={(e) => {
                setJoinCode(e.target.value.toUpperCase());
                setValidatedPreview(null);
              }}
              placeholder="Contoh: PK-2026-XYZ"
              className="text-xs font-mono uppercase"
            />
            <Button
              type="button"
              variant="outline"
              disabled={!joinCode.trim() || validateCodeMutation.isPending}
              onClick={() => validateCodeMutation.mutate(joinCode.trim())}
              className="text-xs shrink-0"
            >
              {validateCodeMutation.isPending ? 'Memeriksa...' : 'Validasi'}
            </Button>
          </div>

          {validatedPreview && (
            <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 space-y-1 text-xs">
              <p className="font-bold text-emerald-900">
                {validatedPreview.classroom?.name}
              </p>
              <p className="text-emerald-800">
                Dosen: {validatedPreview.classroom?.instructorName || '-'} · Kapasitas:{' '}
                {validatedPreview.classroom?.enrolledCount ?? 0}/
                {validatedPreview.classroom?.capacity ?? '-'}
              </p>
              {validatedPreview.alreadyEnrolled ? (
                <p className="text-blue-700 font-semibold pt-1">
                  Anda sudah terdaftar di kelas ini.
                </p>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  disabled={joinMutation.isPending}
                  onClick={() => joinMutation.mutate(joinCode.trim())}
                  className="mt-2 bg-emerald-700 hover:bg-emerald-800 text-white text-xs"
                >
                  {joinMutation.isPending ? 'Bergabung...' : 'Konfirmasi Gabung Kelas'}
                </Button>
              )}
            </div>
          )}
        </div>
      </ModalDialog>
    </div>
  );
}
