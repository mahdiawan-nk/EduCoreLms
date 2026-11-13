import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  PlayCircle,
  BookOpen,
  CheckCircle2,
  ClipboardList,
  Award,
  Clock,
  ArrowRight,
  Megaphone,
} from 'lucide-react';
import { apiFetch } from '../../lib/api';
import { Button, Card, Skeleton } from '../ui/primitives';
import { formatDateTime } from '../../lib/utils';

interface Props {
  classroomId: string;
}

export function StudentDashboardOverview({ classroomId }: Props) {
  const navigate = useNavigate();

  const { data, isLoading } = useQuery({
    queryKey: ['classroom-analytics', classroomId],
    queryFn: () => apiFetch<any>(`/api/v1/classrooms/${classroomId}/analytics`),
    enabled: Boolean(classroomId),
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 rounded-xl" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  const sd = data?.studentDashboard;
  if (!sd) return null;

  const stats = [
    { label: 'Total Modul', value: sd.totalModules, icon: BookOpen },
    {
      label: 'Materi Selesai',
      value: `${sd.completedMaterialsCount} / ${sd.completedMaterialsCount + sd.incompleteMaterialsCount}`,
      icon: CheckCircle2,
    },
    {
      label: 'Tugas Belum Dikumpulkan',
      value: sd.unsubmittedAssignmentsCount,
      icon: ClipboardList,
    },
    {
      label: 'Evaluasi Belum Dikerjakan',
      value: sd.pendingAssessmentsCount,
      icon: Clock,
    },
  ];

  return (
    <div className="space-y-5">
      {/* Prominent Continue Learning Banner */}
      <Card className="p-5 bg-[#14213D] text-white border-[#14213D] shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5 min-w-0">
            <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-blue-300">
              <PlayCircle className="h-3.5 w-3.5 shrink-0" />
              Lanjutkan Pembelajaran
            </span>
            {sd.continueLearning ? (
              <>
                <h3 className="text-base sm:text-lg font-bold text-white truncate">
                  {sd.continueLearning.materialTitle}
                </h3>
                <p className="text-xs text-slate-300">
                  Modul: {sd.continueLearning.moduleTitle} · Progres Keseluruhan:{' '}
                  <strong className="font-mono text-blue-200">{sd.overallProgress}%</strong>
                </p>
              </>
            ) : (
              <>
                <h3 className="text-lg font-bold text-white">
                  Semua Materi Telah Diselesaikan
                </h3>
                <p className="text-xs text-slate-300">
                  Progres belajar Anda saat ini{' '}
                  <strong className="font-mono text-emerald-400">{sd.overallProgress}%</strong>.
                </p>
              </>
            )}
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {sd.averageGrade !== null && (
              <div className="px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-center">
                <p className="text-[10px] text-slate-400 uppercase">Rata-rata Nilai</p>
                <p className="font-mono text-lg font-bold text-emerald-400">
                  {sd.averageGrade}
                </p>
              </div>
            )}
            {sd.continueLearning && (
              <Button
                className="bg-[#2563EB] hover:bg-blue-500 text-white font-semibold"
                onClick={() =>
                  navigate(
                    `/classrooms/${classroomId}/materials/${sd.continueLearning.materialId}`
                  )
                }
              >
                Buka Materi
                <ArrowRight className="h-4 w-4 ml-1.5" />
              </Button>
            )}
          </div>
        </div>

        {/* Overall Progress Bar */}
        <div className="mt-4 h-2 w-full bg-white/15 rounded-full overflow-hidden">
          <div
            className="h-full bg-[#2563EB] rounded-full transition-all"
            style={{ width: `${sd.overallProgress}%` }}
          />
        </div>
      </Card>

      {/* 8-metric compact summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {stats.map((s) => {
          const Icon = s.icon;
          return (
            <Card key={s.label} className="p-3.5">
              <div className="flex items-center justify-between text-slate-500">
                <span className="text-[11px] font-semibold">{s.label}</span>
                <Icon className="h-3.5 w-3.5" />
              </div>
              <p className="mt-1.5 font-mono text-xl font-bold text-slate-900 tabular-nums">
                {s.value}
              </p>
            </Card>
          );
        })}
      </div>

      {/* Module Progress & Deadlines / Graded */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card className="p-4">
          <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-3">
            Progres per Modul
          </h4>
          {sd.moduleProgress?.length === 0 ? (
            <p className="text-xs text-slate-500">Belum ada modul yang diterbitkan.</p>
          ) : (
            <div className="space-y-2.5">
              {sd.moduleProgress?.map((mod: any) => (
                <div key={mod.id} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-slate-800 truncate">{mod.title}</span>
                    <span className="font-mono text-slate-600 tabular-nums">
                      {mod.percentage}% ({mod.completedMaterials}/{mod.totalMaterials})
                    </span>
                  </div>
                  <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-700 rounded-full"
                      style={{ width: `${mod.percentage}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <div className="space-y-4">
          <Card className="p-4">
            <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 text-amber-600" />
              Tenggat Tugas Mendatang
            </h4>
            {sd.upcomingDeadlines?.length === 0 ? (
              <p className="text-xs text-slate-500">Tidak ada tenggat tugas mendatang.</p>
            ) : (
              <div className="space-y-2">
                {sd.upcomingDeadlines?.map((d: any) => (
                  <div
                    key={d.id}
                    className="flex items-center justify-between text-xs p-2 rounded-lg bg-slate-50 border border-slate-100 cursor-pointer hover:bg-slate-100"
                    onClick={() => navigate(`/classrooms/${classroomId}/assignments/${d.id}`)}
                  >
                    <span className="font-medium text-slate-800 truncate">{d.title}</span>
                    <span className="font-mono text-[11px] text-amber-700 shrink-0 ml-2">
                      {formatDateTime(d.dueDate)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {sd.recentlyGraded?.length > 0 && (
            <Card className="p-4">
              <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                <Award className="h-3.5 w-3.5 text-emerald-600" />
                Nilai Tugas Terbaru
              </h4>
              <div className="space-y-2">
                {sd.recentlyGraded.slice(0, 3).map((g: any) => (
                  <div
                    key={g.assignmentId}
                    className="flex items-center justify-between text-xs p-2 rounded-lg bg-emerald-50/60 border border-emerald-100"
                  >
                    <span className="font-medium text-slate-800 truncate">
                      {g.assignmentTitle}
                    </span>
                    <span className="font-mono font-bold text-emerald-700">
                      {g.score} / {g.maxPoints}
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
