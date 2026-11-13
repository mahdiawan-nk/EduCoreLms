import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Users,
  GraduationCap,
  BookOpen,
  Shield,
  CalendarDays,
  Layers,
  FileText,
  ClipboardCheck,
  Award,
  AlertTriangle,
  ArrowUpRight,
  UserPlus,
  Upload,
  ShieldCheck,
  Activity,
  Lock,
  Globe,
  TrendingUp,
} from 'lucide-react';
import { Card, Button, Skeleton, Input } from '../ui/primitives';
import { StatKpiCard, DashboardErrorState } from './DashboardSharedWidgets';
import { apiRequest } from '../../lib/api';
import { formatDate, formatDateTime } from '../../lib/utils';
import { hasPermission, hasAnyPermission } from '../../lib/authorization';
import type { LmsUser } from '../../context/AuthContext';

export const SUPERADMIN_WIDGETS = [
  { id: 'overview', label: 'Ringkasan Institusi' },
  { id: 'quick_actions', label: 'Aksi Cepat Administrator' },
  { id: 'period_overview', label: 'Periode Akademik Aktif' },
  { id: 'classroom_overview', label: 'Distribusi & Monitoring Ruang Kelas' },
  { id: 'audit_feed', label: 'Aktivitas Sistem & Audit Keamanan' },
];

export function SuperadminDashboardView({
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

  // Audit filter states (with debounced date/category/module)
  const [auditCategory, setAuditCategory] = useState('');
  const [auditModule, setAuditModule] = useState('');
  const [auditFrom, setAuditFrom] = useState('');
  const [auditTo, setAuditTo] = useState('');
  const [auditPage, setAuditPage] = useState(1);
  const [debouncedFilters, setDebouncedFilters] = useState({
    category: '',
    module: '',
    from: '',
    to: '',
  });

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedFilters({
        category: auditCategory,
        module: auditModule,
        from: auditFrom,
        to: auditTo,
      });
      setAuditPage(1);
    }, 250);
    return () => clearTimeout(t);
  }, [auditCategory, auditModule, auditFrom, auditTo]);

  const query = useQuery({
    queryKey: [
      'dashboard-superadmin',
      selectedPeriodId,
      debouncedFilters.category,
      debouncedFilters.module,
      debouncedFilters.from,
      debouncedFilters.to,
      auditPage,
    ],
    queryFn: () => {
      const params = new URLSearchParams();
      if (selectedPeriodId) params.set('periodId', selectedPeriodId);
      if (debouncedFilters.category) params.set('auditCategory', debouncedFilters.category);
      if (debouncedFilters.module) params.set('auditModule', debouncedFilters.module);
      if (debouncedFilters.from) params.set('auditFrom', debouncedFilters.from);
      if (debouncedFilters.to) params.set('auditTo', debouncedFilters.to);
      params.set('auditPage', String(auditPage));
      params.set('auditLimit', '8');
      return apiRequest<any>(`/dashboards/superadmin?${params.toString()}`);
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
        title="Gagal memuat dashboard institusi"
        message={(query.error as Error)?.message}
        onRetry={() => query.refetch()}
        retrying={query.isFetching}
      />
    );
  }

  const data = query.data.data;
  const ov = data.overview;
  const po = data.periodOverview;
  const pc = data.periodComparison;
  const co = data.classroomOverview;
  const auditFeed = data.auditFeed;

  const isVisible = (id: string) => !hiddenWidgets.includes(id);

  // Permission-gated quick actions
  const quickActions = [
    {
      label: 'Tambah Pengguna',
      icon: UserPlus,
      onClick: () => navigate('/admin/users'),
      allowed: hasPermission(user, 'users:manage'),
    },
    {
      label: 'Import Pengguna',
      icon: Upload,
      onClick: () => navigate('/admin/users'),
      allowed: hasPermission(user, 'users:manage'),
    },
    {
      label: 'Periode Akademik',
      icon: CalendarDays,
      onClick: () => navigate('/academic-periods'),
      allowed: hasAnyPermission(user, ['academic_period.view', 'academic_period.create']),
    },
    {
      label: 'Manajemen Kelas',
      icon: Layers,
      onClick: () => navigate('/classrooms'),
      allowed: hasAnyPermission(user, ['classrooms:manage_all', 'classrooms:view']),
    },
    {
      label: 'Manajemen RBAC',
      icon: ShieldCheck,
      onClick: () => navigate('/admin/rbac'),
      allowed: hasAnyPermission(user, ['rbac:manage', 'rbac:view']),
    },
    {
      label: 'Audit Keamanan',
      icon: Activity,
      onClick: () => navigate('/admin/audit-logs'),
      allowed: hasPermission(user, 'audit:view'),
    },
  ].filter((a) => a.allowed);

  const maxStudyCount = Math.max(
    1,
    ...(co.byStudyProgram || []).map((s: any) => s.count)
  );

  const sections: Record<string, React.ReactNode> = {
    overview: (
      <section key="overview" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wide">
            Ringkasan Akademik Institusi
          </h2>
          {pc?.hasPreviousPeriod && (
            <span className="inline-flex items-center gap-1.5 text-xs text-slate-600 bg-white border border-slate-200 px-2.5 py-1 rounded-full">
              <TrendingUp className="h-3.5 w-3.5 text-blue-600" />
              Perbandingan {pc.currentPeriodName} vs {pc.previousPeriodName}:{' '}
              <strong>
                {pc.currentClassrooms} vs {pc.previousClassrooms} kelas
              </strong>{' '}
              ({pc.currentEnrollments} vs {pc.previousEnrollments} peserta)
            </span>
          )}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
          <StatKpiCard
            compact={compact}
            label="Total Pengguna"
            value={ov.totalUsers}
            sublabel={`${ov.totalAuditors} auditor`}
            icon={Users}
            tone="navy"
            onClick={() => navigate('/admin/users')}
          />
          <StatKpiCard
            compact={compact}
            label="Mahasiswa Aktif"
            value={ov.activeStudents}
            sublabel={`${ov.totalActiveEnrollments} enrollment aktif`}
            icon={GraduationCap}
            tone="blue"
          />
          <StatKpiCard
            compact={compact}
            label="Dosen Aktif"
            value={ov.activeLecturers}
            sublabel="Pengampu & Co-Dosen"
            icon={BookOpen}
            tone="green"
          />
          <StatKpiCard
            compact={compact}
            label="Ruang Kelas"
            value={ov.totalClassrooms}
            sublabel={`${ov.activeClassrooms} aktif · ${ov.archivedClassrooms} arsip`}
            icon={Layers}
            tone="blue"
            onClick={() => navigate('/classrooms')}
          />
          <StatKpiCard
            compact={compact}
            label="Konten Akademik"
            value={ov.totalMaterials + ov.totalAssignments + ov.totalAssessments}
            sublabel={`${ov.totalMaterials} materi · ${ov.totalAssignments} tugas · ${ov.totalAssessments} ujian`}
            icon={FileText}
            tone="slate"
          />
          <StatKpiCard
            compact={compact}
            label="Perlu Persetujuan"
            value={ov.pendingApprovalsCount}
            sublabel={`${ov.classesWithoutLecturers} kelas tanpa dosen`}
            icon={AlertTriangle}
            tone={ov.pendingApprovalsCount > 0 ? 'orange' : 'green'}
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
            Aksi Cepat Administrator
          </h3>
          <span className="text-[11px] text-slate-400">
            Disesuaikan dengan permission RBAC
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

    period_overview: (
      <div
        key="period_overview"
        className="grid grid-cols-1 lg:grid-cols-3 gap-4"
      >
        <Card className="lg:col-span-2 bg-white border border-slate-200 shadow-xs p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-2 pb-3 border-b border-slate-100">
            <div>
              <span className="text-[11px] font-semibold uppercase tracking-wider text-blue-600">
                Periode Akademik
              </span>
              <h3 className="text-base font-bold text-slate-900 mt-0.5">
                {po ? po.name : 'Belum Ada Periode Aktif'}
              </h3>
              {po && (
                <p className="text-xs text-slate-500 mt-0.5">
                  Kode: {po.code} · Tahun Akademik {po.academicYear} · Semester{' '}
                  {po.semesterType}
                </p>
              )}
            </div>
            {hasPermission(user, 'academic_period.view') && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => navigate('/academic-periods')}
                className="text-xs h-8"
              >
                Kelola Periode
                <ArrowUpRight className="h-3.5 w-3.5 ml-1" />
              </Button>
            )}
          </div>

          {po ? (
            <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-100">
                <p className="text-[11px] text-slate-500">Rentang Tanggal</p>
                <p className="text-xs font-semibold text-slate-800 mt-1">
                  {formatDate(po.startDate)} – {formatDate(po.endDate)}
                </p>
              </div>
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-100">
                <p className="text-[11px] text-slate-500">Status Periode</p>
                <p className="text-xs font-semibold text-emerald-700 mt-1">
                  {po.status}
                </p>
              </div>
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-100">
                <p className="text-[11px] text-slate-500">Kelas & Peserta</p>
                <p className="text-xs font-semibold text-slate-800 mt-1">
                  {po.classroomsInPeriod} kelas · {po.enrollmentsInPeriod} mhs
                </p>
              </div>
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-100">
                <p className="text-[11px] text-slate-500">Aktivitas Semester</p>
                <p className="text-xs font-semibold text-slate-800 mt-1">
                  {po.materialsInPeriod} materi · {po.assignmentsInPeriod} tugas ·{' '}
                  {po.assessmentsInPeriod} ujian
                </p>
              </div>
            </div>
          ) : (
            <p className="mt-4 text-xs text-slate-500">
              Silakan buat atau aktifkan periode akademik terlebih dahulu.
            </p>
          )}
        </Card>

        <div>{notificationSlot}</div>
      </div>
    ),

    classroom_overview: (
      <div
        key="classroom_overview"
        className="grid grid-cols-1 lg:grid-cols-2 gap-4"
      >
        <Card className="bg-white border border-slate-200 shadow-xs p-4 sm:p-5">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">
                Distribusi Kelas per Program Studi
              </h3>
              <p className="text-xs text-slate-500">
                Total {co.totalClassrooms} kelas ({co.publicClassrooms} Publik ·{' '}
                {co.privateClassrooms} Private)
              </p>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 font-medium">
                <Globe className="h-3 w-3" /> {co.publicClassrooms}
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-medium">
                <Lock className="h-3 w-3" /> {co.privateClassrooms}
              </span>
            </div>
          </div>

          <div className="mt-4 space-y-3">
            {(co.byStudyProgram || []).map((sp: any) => {
              const widthPct = Math.max(8, Math.round((sp.count / maxStudyCount) * 100));
              return (
                <div key={sp.studyProgram} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-slate-800 truncate">
                      {sp.studyProgram}
                    </span>
                    <span className="text-slate-600 shrink-0">
                      {sp.count} kelas ({sp.activeCount} aktif) ·{' '}
                      {sp.enrolledStudents} mhs
                    </span>
                  </div>
                  <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-600 rounded-full"
                      style={{ width: `${widthPct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        <Card className="bg-white border border-slate-200 shadow-xs p-4 sm:p-5">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">
                Distribusi Kelas per Dosen Pengampu
              </h3>
              <p className="text-xs text-slate-500">
                Beban pengajaran dosen aktif pada LMS
              </p>
            </div>
          </div>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-slate-100 text-slate-500">
                  <th className="py-2 font-medium">Nama Dosen</th>
                  <th className="py-2 font-medium text-right">Jumlah Kelas</th>
                  <th className="py-2 font-medium text-right">Mahasiswa</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(co.byLecturer || []).map((lec: any) => (
                  <tr key={lec.instructorId}>
                    <td className="py-2 font-medium text-slate-800">
                      {lec.fullName}
                    </td>
                    <td className="py-2 text-right text-slate-700">
                      {lec.classroomCount}
                    </td>
                    <td className="py-2 text-right text-slate-700">
                      {lec.studentCount}
                    </td>
                  </tr>
                ))}
                {(co.byLecturer || []).length === 0 && (
                  <tr>
                    <td colSpan={3} className="py-4 text-center text-slate-400">
                      Belum ada data penugasan dosen.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    ),

    audit_feed: auditFeed?.canViewAudit && (
      <Card
        key="audit_feed"
        className="bg-white border border-slate-200 shadow-xs p-4 sm:p-5"
      >
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-slate-100">
          <div>
            <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
              <Shield className="h-4 w-4 text-slate-700" />
              Aktivitas Sistem & Audit Keamanan
            </h3>
            <p className="text-xs text-slate-500">
              Catatan aktivitas login, RBAC, reset password, dan pengelolaan kelas
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => navigate('/admin/audit-logs')}
            className="text-xs h-8 self-start sm:self-auto"
          >
            Lihat Log Lengkap
            <ArrowUpRight className="h-3.5 w-3.5 ml-1" />
          </Button>
        </div>

        {/* Filters */}
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
          <select
            value={auditCategory}
            onChange={(e) => setAuditCategory(e.target.value)}
            className="h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-700"
          >
            <option value="">Semua Kategori Aktivitas</option>
            <option value="AUTHENTICATION_SECURITY">Autentikasi & Keamanan</option>
            <option value="RBAC_PERMISSION">Perubahan RBAC</option>
            <option value="ACADEMIC_MANAGEMENT">Manajemen Kelas & Periode</option>
            <option value="ACADEMIC_CONTENT">Materi, Tugas & Ujian</option>
            <option value="ADMINISTRATION">Administrasi Pengguna</option>
          </select>
          <select
            value={auditModule}
            onChange={(e) => setAuditModule(e.target.value)}
            className="h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-700"
          >
            <option value="">Semua Modul</option>
            <option value="USER">USER</option>
            <option value="CLASSROOM">CLASSROOM</option>
            <option value="ROLE">ROLE</option>
            <option value="ACADEMIC_PERIOD">ACADEMIC_PERIOD</option>
            <option value="MATERIAL">MATERIAL</option>
            <option value="ASSIGNMENT">ASSIGNMENT</option>
            <option value="ASSESSMENT">ASSESSMENT</option>
          </select>
          <Input
            type="date"
            value={auditFrom}
            onChange={(e) => setAuditFrom(e.target.value)}
            className="h-9 text-xs"
            aria-label="Dari tanggal"
          />
          <Input
            type="date"
            value={auditTo}
            onChange={(e) => setAuditTo(e.target.value)}
            className="h-9 text-xs"
            aria-label="Sampai tanggal"
          />
        </div>

        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="border-b border-slate-100 text-slate-500">
                <th className="py-2 pr-3 font-medium">Waktu</th>
                <th className="py-2 pr-3 font-medium">Aktor</th>
                <th className="py-2 pr-3 font-medium">Aksi</th>
                <th className="py-2 pr-3 font-medium">Modul</th>
                <th className="py-2 font-medium">IP</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(auditFeed.items || []).map((log: any) => (
                <tr key={log.id} className="hover:bg-slate-50/70">
                  <td className="py-2 pr-3 text-slate-500 whitespace-nowrap">
                    {formatDateTime(log.createdAt)}
                  </td>
                  <td className="py-2 pr-3 font-medium text-slate-800">
                    {log.actorName || 'Sistem'}
                  </td>
                  <td className="py-2 pr-3">
                    <span className="inline-flex px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-mono text-[11px]">
                      {log.action}
                    </span>
                  </td>
                  <td className="py-2 pr-3 text-slate-600">{log.entityType}</td>
                  <td className="py-2 text-slate-400 font-mono">
                    {log.ipAddress || '-'}
                  </td>
                </tr>
              ))}
              {(auditFeed.items || []).length === 0 && (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-slate-400">
                    Tidak ada catatan aktivitas sesuai filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {auditFeed.totalPages > 1 && (
          <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span>
              Halaman {auditFeed.page} dari {auditFeed.totalPages} ({auditFeed.total}{' '}
              event)
            </span>
            <div className="flex items-center gap-1.5">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={auditPage <= 1}
                onClick={() => setAuditPage((p) => Math.max(1, p - 1))}
                className="h-7 text-xs"
              >
                Sebelumnya
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={auditPage >= auditFeed.totalPages}
                onClick={() => setAuditPage((p) => p + 1)}
                className="h-7 text-xs"
              >
                Berikutnya
              </Button>
            </div>
          </div>
        )}
      </Card>
    ),
  };

  const orderedIds = widgetOrder.length
    ? widgetOrder
    : SUPERADMIN_WIDGETS.map((w) => w.id);

  return (
    <div className="space-y-5">
      {orderedIds.map((id) => (isVisible(id) ? sections[id] : null))}
    </div>
  );
}
