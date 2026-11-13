import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ShieldAlert, ShieldCheck, ChevronLeft, ChevronRight, Activity } from 'lucide-react';
import { AppShell } from '../components/AppShell';
import { Button, Card } from '../components/ui/primitives';
import { apiRequest } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { formatDateTime } from '../lib/utils';

interface AuditLogRecord {
  id: string;
  actorId: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  ipAddress: string | null;
  createdAt: string;
  actorName: string | null;
  actorEmail: string | null;
}

export function AuditLogsPage() {
  const { user } = useAuth();
  const isSuperadmin = user?.roles.some((r) => r.toUpperCase() === 'SUPERADMIN');
  const [auditPage, setAuditPage] = useState(1);

  const auditQuery = useQuery({
    queryKey: ['admin-audit-logs', auditPage],
    queryFn: () =>
      apiRequest<AuditLogRecord[]>(`/audit-logs?page=${auditPage}&limit=15`),
    enabled: isSuperadmin,
  });

  if (!isSuperadmin) {
    return (
      <AppShell>
        <div className="max-w-4xl mx-auto py-12 px-4 text-center">
          <ShieldAlert className="w-12 h-12 text-amber-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-slate-900">Akses Dibatasi</h2>
          <p className="text-sm text-slate-600 mt-2">
            Log Audit Keamanan hanya dapat diakses oleh Superadmin Politeknik Kampar.
          </p>
        </div>
      </AppShell>
    );
  }

  const logsList = auditQuery.data?.data || [];
  const meta = auditQuery.data?.meta;

  return (
    <AppShell breadcrumb="Manajemen Sistem / Log Audit Keamanan">
      <div className="space-y-6">
        {/* Header */}
        <div className="border-b border-slate-200 pb-5">
          <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700">
            Sistem & Keamanan
          </span>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 mt-2 flex items-center gap-2">
            <Activity className="w-6 h-6 text-blue-600" />
            Rekam Jejak Audit Keamanan (Security Audit Trail)
          </h1>
          <p className="text-xs text-slate-600 mt-1 max-w-3xl">
            Catatan permanen dan terisolasi dari setiap tindakan autentikasi, mutasi RBAC, pembuatan dan persetujuan ruang kelas, serta akses terhadap dokumen privat di lingkungan Politeknik Kampar LMS.
          </p>
        </div>

        {/* Logs Table */}
        <Card className="overflow-x-auto border-slate-200 bg-white shadow-xs">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80 text-xs font-semibold text-slate-600">
                <th className="py-3 px-4">Waktu Kejadian</th>
                <th className="py-3 px-4">Aktor Pengguna</th>
                <th className="py-3 px-4">Tindakan (Action)</th>
                <th className="py-3 px-4">Entitas Terkait</th>
                <th className="py-3 px-4 font-mono">Alamat IP</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-xs">
              {auditQuery.isLoading ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-slate-500">
                    Memuat catatan log audit...
                  </td>
                </tr>
              ) : logsList.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-slate-500">
                    Belum ada catatan log audit yang terekam.
                  </td>
                </tr>
              ) : (
                logsList.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50/80">
                    <td className="py-3 px-4 font-mono tabular-nums text-slate-600">
                      {formatDateTime(log.createdAt)}
                    </td>
                    <td className="py-3 px-4">
                      <span className="font-semibold text-slate-900">
                        {log.actorName || 'Sistem Otomatis'}
                      </span>
                      {log.actorEmail && (
                        <span className="text-slate-500 block text-[11px]">
                          {log.actorEmail}
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <span className="font-mono font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-900 text-[11px]">
                        {log.action}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-slate-600 font-medium">
                      {log.entityType}
                      {log.entityId && (
                        <span className="font-mono text-[10px] text-slate-400 block truncate max-w-[120px]">
                          {log.entityId}
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 font-mono tabular-nums text-slate-500">
                      {log.ipAddress || '127.0.0.1'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </Card>

        {/* Pagination */}
        {meta && (meta.totalPages || 1) > 1 && (
          <div className="flex items-center justify-between border-t border-slate-200 pt-4 text-xs text-slate-600">
            <span>
              Halaman{' '}
              <strong className="font-mono tabular-nums">{meta.page}</strong> dari{' '}
              <strong className="font-mono tabular-nums">{meta.totalPages}</strong> ({meta.total} rekaman audit)
            </span>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={auditPage <= 1}
                onClick={() => setAuditPage((p) => Math.max(1, p - 1))}
              >
                <ChevronLeft className="h-4 w-4" />
                <span>Sebelumnya</span>
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={auditPage >= (meta.totalPages || 1)}
                onClick={() => setAuditPage((p) => p + 1)}
              >
                <span>Berikutnya</span>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
