import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  Search,
  Download,
  CheckCircle2,
  Clock,
  Circle,
  Bookmark,
  FileText,
  ArrowRight,
  Users,
} from 'lucide-react';
import { apiFetch } from '../../lib/api';
import { Button, Card, Input, ModalDialog, Skeleton } from '../ui/primitives';
import { formatDateTime } from '../../lib/utils';
import { useAuth } from '../../context/AuthContext';

interface Props {
  classroomId: string;
  canManage: boolean;
}

export function LearningProgressTab({ classroomId, canManage }: Props) {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'COMPLETED' | 'IN_PROGRESS' | 'NOT_STARTED'>('ALL');
  const [sortDir, setSortDir] = useState<'desc' | 'asc'>('desc');
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);

  // Instructor: classroom-wide progress table
  const instructorQuery = useQuery({
    queryKey: ['classroom-learning-progress', classroomId, search, statusFilter],
    queryFn: () => {
      const params = new URLSearchParams();
      if (search.trim()) params.set('search', search.trim());
      if (statusFilter !== 'ALL') params.set('status', statusFilter);
      return apiFetch<any>(`/api/v1/classrooms/${classroomId}/learning-progress?${params.toString()}`);
    },
    enabled: Boolean(classroomId && canManage),
  });

  // Student: own progress report + bookmarks
  const studentReportQuery = useQuery({
    queryKey: ['student-progress-report', classroomId, user?.id],
    queryFn: () =>
      apiFetch<any>(`/api/v1/classrooms/${classroomId}/students/${user?.id}/progress`),
    enabled: Boolean(classroomId && !canManage && user?.id),
  });

  const bookmarksQuery = useQuery({
    queryKey: ['classroom-bookmarks', classroomId],
    queryFn: () => apiFetch<any>(`/api/v1/classrooms/${classroomId}/bookmarks`),
    enabled: Boolean(classroomId && !canManage),
  });

  // Instructor modal: individual student progress report
  const modalReportQuery = useQuery({
    queryKey: ['student-progress-report', classroomId, selectedStudentId],
    queryFn: () =>
      apiFetch<any>(`/api/v1/classrooms/${classroomId}/students/${selectedStudentId}/progress`),
    enabled: Boolean(classroomId && selectedStudentId),
  });

  if (!canManage) {
    if (studentReportQuery.isLoading) {
      return <Skeleton className="h-64 rounded-xl" />;
    }
    const report = studentReportQuery.data;
    const modules: any[] = report?.modules || [];
    const summary = report?.summary || { overallProgressPercent: 0, completedMaterialsCount: 0, totalMaterials: 0 };
    const bookmarks: any[] = bookmarksQuery.data?.bookmarks || [];

    const completedModules = modules.filter((m) => m.percentage === 100).length;
    const inProgressModules = modules.filter((m) => m.percentage > 0 && m.percentage < 100).length;
    const incompleteModules = modules.filter((m) => m.percentage === 0).length;

    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="p-4">
            <p className="text-xs text-slate-500 font-semibold">Progres Keseluruhan</p>
            <p className="mt-1 font-mono text-2xl font-bold text-blue-700">
              {summary.overallProgressPercent}%
            </p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-slate-500 font-semibold">Modul Selesai</p>
            <p className="mt-1 font-mono text-2xl font-bold text-emerald-700">
              {completedModules} / {modules.length}
            </p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-slate-500 font-semibold">Sedang Dipelajari</p>
            <p className="mt-1 font-mono text-2xl font-bold text-amber-600">
              {inProgressModules} Modul
            </p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-slate-500 font-semibold">Materi Selesai</p>
            <p className="mt-1 font-mono text-2xl font-bold text-slate-900">
              {summary.completedMaterialsCount} / {summary.totalMaterials}
            </p>
            <p className="text-[11px] text-slate-400">{incompleteModules} modul belum dimulai</p>
          </Card>
        </div>

        {/* Bookmarks */}
        {bookmarks.length > 0 && (
          <Card className="p-5">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2 mb-3">
              <Bookmark className="h-4 w-4 text-amber-500" />
              Materi yang Ditandai (Bookmark)
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {bookmarks.map((b: any) => (
                <div
                  key={b.id}
                  onClick={() => navigate(`/classrooms/${classroomId}/materials/${b.materialId}`)}
                  className="p-3 rounded-lg border border-slate-200 hover:bg-slate-50 flex items-center justify-between cursor-pointer"
                >
                  <span className="text-xs font-semibold text-slate-800 truncate">{b.title}</span>
                  <ArrowRight className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Module & Material Checklist */}
        <div className="space-y-4">
          {modules.map((mod: any) => (
            <Card key={mod.id} className="p-5">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h4 className="text-sm font-bold text-slate-900">{mod.title}</h4>
                  <p className="text-xs text-slate-500">
                    {mod.completedCount} dari {mod.totalCount} materi selesai
                  </p>
                </div>
                <span className="font-mono text-sm font-bold text-blue-700">
                  {mod.percentage}%
                </span>
              </div>
              <div className="space-y-2">
                {(mod.materials || []).map((m: any) => (
                  <div
                    key={m.id}
                    onClick={() => navigate(`/classrooms/${classroomId}/materials/${m.id}`)}
                    className="flex items-center justify-between p-2.5 rounded-lg border border-slate-100 hover:bg-slate-50 cursor-pointer"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      {m.status === 'COMPLETED' ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                      ) : m.status === 'IN_PROGRESS' ? (
                        <Clock className="h-4 w-4 text-amber-500 shrink-0" />
                      ) : (
                        <Circle className="h-4 w-4 text-slate-300 shrink-0" />
                      )}
                      <span className="text-xs font-medium text-slate-800 truncate">{m.title}</span>
                      {!m.isRequired && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">
                          Opsional
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] font-mono text-slate-500 shrink-0 ml-2">
                      {m.status === 'COMPLETED'
                        ? 'Selesai'
                        : m.status === 'IN_PROGRESS'
                          ? 'Sedang Dipelajari'
                          : 'Belum Dimulai'}
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  // INSTRUCTOR VIEW
  const studentsRaw: any[] = instructorQuery.data?.students || [];
  const students = [...studentsRaw].sort((a, b) =>
    sortDir === 'desc'
      ? b.overallProgressPercent - a.overallProgressPercent
      : a.overallProgressPercent - b.overallProgressPercent
  );

  return (
    <div className="space-y-4">
      <Card className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5 flex-1">
          <div className="relative w-full sm:w-64">
            <Search className="h-3.5 w-3.5 text-slate-400 absolute left-3 top-3" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari nama atau NIM mahasiswa..."
              className="pl-8"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="h-9 rounded-lg border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700"
          >
            <option value="ALL">Semua Status</option>
            <option value="COMPLETED">Selesai (100%)</option>
            <option value="IN_PROGRESS">Sedang Berjalan</option>
            <option value="NOT_STARTED">Belum Mulai (0%)</option>
          </select>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'))}
          >
            Urut Progres: {sortDir === 'desc' ? 'Tertinggi' : 'Terendah'}
          </Button>
        </div>

        <a
          href={`/api/v1/classrooms/${classroomId}/learning-progress?format=csv`}
          target="_blank"
          rel="noreferrer"
        >
          <Button size="sm" variant="outline">
            <Download className="h-3.5 w-3.5 mr-1.5" />
            Ekspor CSV
          </Button>
        </a>
      </Card>

      <Card className="overflow-hidden">
        {instructorQuery.isLoading ? (
          <div className="p-6">
            <Skeleton className="h-40 rounded-lg" />
          </div>
        ) : students.length === 0 ? (
          <div className="p-10 text-center text-xs text-slate-500">
            <Users className="h-8 w-8 mx-auto text-slate-300 mb-2" />
            Belum ada data progres mahasiswa yang cocok dengan filter.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold text-slate-600 uppercase">
                  <th className="py-3 px-4">Mahasiswa</th>
                  <th className="py-3 px-4">Modul Selesai</th>
                  <th className="py-3 px-4">Materi Selesai</th>
                  <th className="py-3 px-4">Progres</th>
                  <th className="py-3 px-4 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {students.map((s) => (
                  <tr key={s.studentId} className="hover:bg-slate-50">
                    <td className="py-3 px-4">
                      <p className="font-semibold text-slate-900">{s.fullName}</p>
                      <p className="text-[11px] font-mono text-slate-500">
                        {s.identityNumber || s.email}
                      </p>
                    </td>
                    <td className="py-3 px-4 font-mono">
                      {s.completedModulesCount} / {s.totalModules}
                    </td>
                    <td className="py-3 px-4 font-mono">
                      {s.completedMaterialsCount} / {s.totalMaterials}
                    </td>
                    <td className="py-3 px-4 w-48">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-blue-700 rounded-full"
                            style={{ width: `${s.overallProgressPercent}%` }}
                          />
                        </div>
                        <span className="font-mono font-semibold text-slate-800 w-10 text-right">
                          {s.overallProgressPercent}%
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setSelectedStudentId(s.studentId)}
                      >
                        <FileText className="h-3.5 w-3.5 mr-1" />
                        Rapor
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Individual Student Report Modal */}
      <ModalDialog
        open={Boolean(selectedStudentId)}
        onClose={() => setSelectedStudentId(null)}
        title="Rapor Progres Belajar Mahasiswa"
      >
        {modalReportQuery.isLoading ? (
          <Skeleton className="h-48 rounded-lg" />
        ) : modalReportQuery.data ? (
          <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-between">
              <div>
                <p className="text-sm font-bold text-slate-900">
                  {modalReportQuery.data.student?.fullName}
                </p>
                <p className="text-xs font-mono text-slate-500">
                  {modalReportQuery.data.student?.identityNumber || modalReportQuery.data.student?.email}
                </p>
              </div>
              <span className="font-mono text-lg font-bold text-blue-700">
                {modalReportQuery.data.summary?.overallProgressPercent ?? 0}%
              </span>
            </div>

            {(modalReportQuery.data.modules || []).map((m: any) => (
              <div key={m.id} className="border border-slate-200 rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between text-xs font-bold text-slate-800">
                  <span>{m.title}</span>
                  <span className="font-mono text-blue-700">{m.percentage}%</span>
                </div>
                {(m.materials || []).map((mat: any) => (
                  <div key={mat.id} className="flex items-center justify-between text-xs text-slate-600 pl-2">
                    <span className="truncate">{mat.title}</span>
                    <span className="font-mono text-[11px] shrink-0 ml-2">
                      {mat.status === 'COMPLETED'
                        ? `Selesai (${mat.completedAt ? formatDateTime(mat.completedAt) : ''})`
                        : mat.status === 'IN_PROGRESS'
                          ? 'Sedang Dipelajari'
                          : 'Belum Dimulai'}
                    </span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        ) : null}
      </ModalDialog>
    </div>
  );
}
