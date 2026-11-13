import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ShieldAlert,
  Users,
  Layers,
  Activity,
  FileSpreadsheet,
  KeyRound,
  ShieldCheck,
  BookOpen,
  Download,
  Eye,
  Database,
} from 'lucide-react';
import {
  Card,
  Button,
  Skeleton,
  Input,
  ModalDialog,
} from '../ui/primitives';
import { StatKpiCard, DashboardErrorState } from './DashboardSharedWidgets';
import { apiRequest } from '../../lib/api';
import { formatDateTime } from '../../lib/utils';

export const AUDITOR_WIDGETS = [
  { id: 'compliance_banner', label: 'Status Kepatuhan Read-Only' },
  { id: 'overview', label: 'Statistik Audit & Kepatuhan' },
  { id: 'audit_timeline', label: 'Timeline Aktivitas & Detail Perubahan' },
];

export function AuditorDashboardView({
  hiddenWidgets,
  widgetOrder,
  compact,
  notificationSlot,
}: {
  hiddenWidgets: string[];
  widgetOrder: string[];
  compact: boolean;
  notificationSlot: React.ReactNode;
}) {
  const [actorId, setActorId] = useState('');
  const [moduleFilter, setModuleFilter] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [page, setPage] = useState(1);
  const [selectedLog, setSelectedLog] = useState<any>(null);

  const [debounced, setDebounced] = useState({
    actorId: '',
    module: '',
    action: '',
    from: '',
    to: '',
  });

  useEffect(() => {
    const t = setTimeout(() => {
      setDebounced({
        actorId,
        module: moduleFilter,
        action: actionFilter,
        from: fromDate,
        to: toDate,
      });
      setPage(1);
    }, 250);
    return () => clearTimeout(t);
  }, [actorId, moduleFilter, actionFilter, fromDate, toDate]);

  const query = useQuery({
    queryKey: [
      'dashboard-auditor',
      debounced.actorId,
      debounced.module,
      debounced.action,
      debounced.from,
      debounced.to,
      page,
    ],
    queryFn: () => {
      const params = new URLSearchParams();
      if (debounced.actorId) params.set('actorId', debounced.actorId);
      if (debounced.module) params.set('module', debounced.module);
      if (debounced.action) params.set('action', debounced.action);
      if (debounced.from) params.set('from', debounced.from);
      if (debounced.to) params.set('to', debounced.to);
      params.set('page', String(page));
      params.set('limit', '12');
      return apiRequest<any>(`/dashboards/auditor?${params.toString()}`);
    },
    retry: false,
  });

  if (query.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-16 w-full rounded-xl" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-72 w-full rounded-xl" />
      </div>
    );
  }

  if (query.isError || !query.data?.data) {
    return (
      <DashboardErrorState
        title="Gagal memuat dashboard audit"
        message={(query.error as Error)?.message}
        onRetry={() => query.refetch()}
        retrying={query.isFetching}
      />
    );
  }

  const data = query.data.data;
  const meta = query.data.meta || { page: 1, totalPages: 1, total: 0 };
  const ov = data.overview;
  const timeline: any[] = data.timeline || [];
  const filters = data.filters || { modules: [], actions: [], actors: [] };

  const isVisible = (id: string) => !hiddenWidgets.includes(id);

  const handleExportCsv = () => {
    const header = ['Waktu', 'Aktor', 'Email', 'Aksi', 'Modul', 'Entity ID', 'IP Address'];
    const rows = timeline.map((row) => [
      new Date(row.createdAt).toISOString(),
      row.actorName || 'Sistem',
      row.actorEmail || '-',
      row.action,
      row.entityType,
      row.entityId || '-',
      row.ipAddress || '-',
    ]);
    const csv = [header, ...rows]
      .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit-report-polkam-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const sections: Record<string, React.ReactNode> = {
    compliance_banner: (
      <Card
        key="compliance_banner"
        className="bg-amber-50/70 border border-amber-200 p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
      >
        <div className="flex items-start gap-3">
          <div className="h-9 w-9 rounded-lg bg-amber-100 text-amber-800 flex items-center justify-center shrink-0">
            <ShieldAlert className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-amber-950">
              Mode Auditor Internal — Akses Hanya-Baca (Read-Only)
            </h2>
            <p className="text-xs text-amber-800 mt-0.5">
              Seluruh operasi perubahan data, penghapusan, pengelolaan RBAC, dan reset password dinonaktifkan secara ketat di backend dan UI.
            </p>
          </div>
        </div>
        {data.canExport && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleExportCsv}
            className="h-8 text-xs border-amber-300 bg-white text-amber-900 hover:bg-amber-100 shrink-0"
          >
            <Download className="h-3.5 w-3.5 mr-1.5" />
            Export Laporan Audit (CSV)
          </Button>
        )}
      </Card>
    ),

    overview: (
      <section key="overview" className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatKpiCard
            compact={compact}
            label="Total Pengguna"
            value={ov.totalUsers}
            sublabel="Entitas akun tercatat"
            icon={Users}
            tone="navy"
          />
          <StatKpiCard
            compact={compact}
            label="Total Ruang Kelas"
            value={ov.totalClassrooms}
            sublabel="Objek akademik"
            icon={Layers}
            tone="blue"
          />
          <StatKpiCard
            compact={compact}
            label="Total Event Audit"
            value={ov.totalAuditEvents}
            sublabel={`${ov.academicDataChangesCount} data akademik`}
            icon={Activity}
            tone="green"
          />
          <StatKpiCard
            compact={compact}
            label="Aktivitas Administrasi"
            value={ov.adminActionsCount}
            sublabel="User, RBAC & Sistem"
            icon={Database}
            tone="slate"
          />
          <StatKpiCard
            compact={compact}
            label="Perubahan Permission"
            value={ov.rbacChangesCount}
            sublabel="Audit matriks RBAC"
            icon={ShieldCheck}
            tone={ov.rbacChangesCount > 0 ? 'orange' : 'green'}
          />
          <StatKpiCard
            compact={compact}
            label="Reset Password"
            value={ov.passwordResetsCount}
            sublabel="Kejadian kredensial"
            icon={KeyRound}
            tone={ov.passwordResetsCount > 0 ? 'red' : 'green'}
          />
          <StatKpiCard
            compact={compact}
            label="Event Autentikasi"
            value={ov.authEventsCount}
            sublabel="Login & sesi"
            icon={FileSpreadsheet}
            tone="blue"
          />
          <StatKpiCard
            compact={compact}
            label="Publikasi Konten"
            value={ov.contentPublishEventsCount}
            sublabel="Materi & asesmen"
            icon={BookOpen}
            tone="green"
          />
        </div>
        <div>{notificationSlot}</div>
      </section>
    ),

    audit_timeline: (
      <Card
        key="audit_timeline"
        className="bg-white border border-slate-200 shadow-xs p-4 sm:p-5"
      >
        <div className="pb-3 border-b border-slate-100">
          <h3 className="text-sm font-semibold text-slate-900">
            Timeline Audit & Kepatuhan Sistem
          </h3>
          <p className="text-xs text-slate-500">
            Filter berdasarkan tanggal, pengguna, modul, atau jenis aktivitas serta inspeksi metadata sebelum/sesudah
          </p>
        </div>

        {/* Filters */}
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
          <select
            value={actorId}
            onChange={(e) => setActorId(e.target.value)}
            className="h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-700"
          >
            <option value="">Semua Pengguna</option>
            {(filters.actors || []).map((a: any) => (
              <option key={a.id} value={a.id}>
                {a.fullName}
              </option>
            ))}
          </select>

          <select
            value={moduleFilter}
            onChange={(e) => setModuleFilter(e.target.value)}
            className="h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-700"
          >
            <option value="">Semua Modul</option>
            {(filters.modules || []).map((m: string) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>

          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-700"
          >
            <option value="">Semua Jenis Aktivitas</option>
            {(filters.actions || []).map((act: string) => (
              <option key={act} value={act}>
                {act}
              </option>
            ))}
          </select>

          <Input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="h-9 text-xs"
            aria-label="Dari tanggal"
          />
          <Input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="h-9 text-xs"
            aria-label="Sampai tanggal"
          />
        </div>

        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="border-b border-slate-100 text-slate-500">
                <th className="py-2 pr-3 font-medium">Waktu</th>
                <th className="py-2 pr-3 font-medium">Pengguna</th>
                <th className="py-2 pr-3 font-medium">Aksi</th>
                <th className="py-2 pr-3 font-medium">Modul</th>
                <th className="py-2 pr-3 font-medium">IP</th>
                <th className="py-2 font-medium text-right">Detail</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {timeline.map((log) => (
                <tr key={log.id} className="hover:bg-slate-50/70">
                  <td className="py-2 pr-3 text-slate-500 whitespace-nowrap">
                    {formatDateTime(log.createdAt)}
                  </td>
                  <td className="py-2 pr-3">
                    <p className="font-medium text-slate-800">
                      {log.actorName || 'Sistem'}
                    </p>
                    <p className="text-[11px] text-slate-400">
                      {log.actorEmail || '-'}
                    </p>
                  </td>
                  <td className="py-2 pr-3">
                    <span className="inline-flex px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-mono text-[11px]">
                      {log.action}
                    </span>
                  </td>
                  <td className="py-2 pr-3 text-slate-700">{log.entityType}</td>
                  <td className="py-2 pr-3 font-mono text-slate-400">
                    {log.ipAddress || '-'}
                  </td>
                  <td className="py-2 text-right">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setSelectedLog(log)}
                      className="h-7 text-[11px]"
                    >
                      <Eye className="h-3 w-3 mr-1" />
                      Inspeksi
                    </Button>
                  </td>
                </tr>
              ))}
              {timeline.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-slate-400">
                    Tidak ada catatan audit sesuai filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {(meta.totalPages ?? 1) > 1 && (
          <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span>
              Halaman {meta.page ?? 1} dari {meta.totalPages ?? 1} ({meta.total ?? 0} entri)
            </span>
            <div className="flex items-center gap-1.5">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="h-7 text-xs"
              >
                Sebelumnya
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={page >= (meta.totalPages ?? 1)}
                onClick={() => setPage((p) => p + 1)}
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
    : AUDITOR_WIDGETS.map((w) => w.id);

  return (
    <div className="space-y-5">
      {orderedIds.map((id) => (isVisible(id) ? sections[id] : null))}

      {/* Before / After Metadata Detail Modal */}
      <ModalDialog
        open={!!selectedLog}
        onClose={() => setSelectedLog(null)}
        title="Detail Catatan Audit (Read-Only)"
        description={
          selectedLog
            ? `${selectedLog.action} · ${selectedLog.entityType} (${formatDateTime(
                selectedLog.createdAt
              )})`
            : ''
        }
      >
        {selectedLog && (
          <div className="space-y-3 text-xs">
            <div className="grid grid-cols-2 gap-2 p-3 rounded-lg bg-slate-50 border border-slate-200">
              <div>
                <p className="text-slate-400">Aktor</p>
                <p className="font-semibold text-slate-800">
                  {selectedLog.actorName || 'Sistem'}
                </p>
              </div>
              <div>
                <p className="text-slate-400">Entity ID</p>
                <p className="font-mono text-slate-800 truncate">
                  {selectedLog.entityId || '-'}
                </p>
              </div>
            </div>

            <div>
              <p className="font-semibold text-slate-700 mb-1">
                Metadata Perubahan (Sebelum / Sesudah / Konteks)
              </p>
              <pre className="p-3 rounded-lg bg-slate-900 text-slate-100 text-[11px] overflow-x-auto max-h-72">
                {JSON.stringify(selectedLog.metadata || {}, null, 2)}
              </pre>
            </div>
          </div>
        )}
      </ModalDialog>
    </div>
  );
}
