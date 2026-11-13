import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { History, Search, ChevronDown, ChevronRight } from 'lucide-react';
import { apiFetch } from '../../lib/api';
import { Button, Card, Input, Skeleton } from '../ui/primitives';
import { formatDateTime } from '../../lib/utils';

interface Props {
  classroomId: string;
}

export function ChangeHistoryTab({ classroomId }: Props) {
  const [page, setPage] = useState(1);
  const [resourceType, setResourceType] = useState('ALL');
  const [action, setAction] = useState('ALL');
  const [search, setSearch] = useState('');
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});

  const { data, isLoading } = useQuery({
    queryKey: ['classroom-change-history', classroomId, page, resourceType, action, search],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), limit: '20' });
      if (resourceType !== 'ALL') params.set('resourceType', resourceType);
      if (action !== 'ALL') params.set('action', action);
      if (search.trim()) params.set('search', search.trim());
      return apiFetch<any>(`/api/v1/classrooms/${classroomId}/change-history?${params.toString()}`);
    },
    enabled: Boolean(classroomId),
  });

  const items: any[] = data?.items || [];
  const pagination = data?.pagination || { page: 1, totalPages: 1, total: 0 };

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div className="space-y-4">
      <Card className="p-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="h-3.5 w-3.5 text-slate-400 absolute left-3 top-3" />
          <Input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Cari judul modul, materi, tugas, atau asesmen..."
            className="pl-8"
          />
        </div>
        <select
          value={resourceType}
          onChange={(e) => {
            setResourceType(e.target.value);
            setPage(1);
          }}
          className="h-9 rounded-lg border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700"
        >
          <option value="ALL">Semua Resource</option>
          <option value="MODULE">Modul</option>
          <option value="MATERIAL">Materi</option>
          <option value="ASSIGNMENT">Tugas</option>
          <option value="ASSESSMENT">Asesmen</option>
        </select>
        <select
          value={action}
          onChange={(e) => {
            setAction(e.target.value);
            setPage(1);
          }}
          className="h-9 rounded-lg border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700"
        >
          <option value="ALL">Semua Aksi</option>
          <option value="CREATED">CREATED</option>
          <option value="UPDATED">UPDATED</option>
          <option value="DELETED">DELETED</option>
          <option value="PUBLISHED">PUBLISHED</option>
          <option value="UNPUBLISHED">UNPUBLISHED</option>
          <option value="ARCHIVED">ARCHIVED</option>
          <option value="RESTORED">RESTORED</option>
          <option value="REORDERED">REORDERED</option>
          <option value="DUPLICATED">DUPLICATED</option>
        </select>
      </Card>

      {isLoading ? (
        <Skeleton className="h-64 rounded-xl" />
      ) : items.length === 0 ? (
        <Card className="p-10 text-center text-xs text-slate-500">
          <History className="h-8 w-8 mx-auto text-slate-300 mb-2" />
          Belum ada riwayat perubahan yang tercatat.
        </Card>
      ) : (
        <div className="space-y-2.5">
          {items.map((log) => {
            const expanded = Boolean(expandedIds[log.id]);
            const initials = (log.actorName || 'S')
              .split(' ')
              .slice(0, 2)
              .map((w: string) => w[0])
              .join('')
              .toUpperCase();

            return (
              <Card key={log.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="h-8 w-8 rounded-full bg-slate-900 text-white text-xs font-bold flex items-center justify-center shrink-0">
                      {initials}
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-bold text-slate-900">
                          {log.actorName || 'Sistem'}
                        </span>
                        <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 text-[10px] font-mono">
                          {log.actorRole}
                        </span>
                        <span className="px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 text-[10px] font-mono font-semibold">
                          {log.action}
                        </span>
                        <span className="px-1.5 py-0.5 rounded bg-slate-200 text-slate-700 text-[10px] font-mono">
                          {log.resourceType}
                        </span>
                      </div>
                      <p className="text-xs text-slate-700 mt-1">{log.changeSummary}</p>
                      <p className="text-[11px] font-mono text-slate-400 mt-0.5">
                        {log.resourceTitle} · {formatDateTime(log.createdAt)}
                      </p>
                    </div>
                  </div>

                  {(log.beforeValue || log.afterValue) && (
                    <button
                      type="button"
                      onClick={() => toggleExpand(log.id)}
                      className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 hover:underline shrink-0 cursor-pointer"
                    >
                      {expanded ? (
                        <>
                          <ChevronDown className="h-3.5 w-3.5" /> Tutup Detail
                        </>
                      ) : (
                        <>
                          <ChevronRight className="h-3.5 w-3.5" /> Detail Diff
                        </>
                      )}
                    </button>
                  )}
                </div>

                {expanded && (log.beforeValue || log.afterValue) && (
                  <div className="mt-3 pt-3 border-t border-slate-100 grid grid-cols-1 md:grid-cols-2 gap-3 text-[11px] font-mono">
                    <div className="p-2.5 rounded-lg bg-rose-50/70 border border-rose-200 overflow-x-auto">
                      <p className="font-bold text-rose-800 mb-1">Sebelum</p>
                      <pre className="whitespace-pre-wrap text-rose-950">
                        {log.beforeValue ? JSON.stringify(log.beforeValue, null, 2) : '—'}
                      </pre>
                    </div>
                    <div className="p-2.5 rounded-lg bg-emerald-50/70 border border-emerald-200 overflow-x-auto">
                      <p className="font-bold text-emerald-800 mb-1">Sesudah</p>
                      <pre className="whitespace-pre-wrap text-emerald-950">
                        {log.afterValue ? JSON.stringify(log.afterValue, null, 2) : '—'}
                      </pre>
                    </div>
                  </div>
                )}
              </Card>
            );
          })}

          {pagination.totalPages > 1 && (
            <div className="flex items-center justify-between pt-2">
              <span className="text-xs text-slate-500">
                Halaman {pagination.page} dari {pagination.totalPages} ({pagination.total} catatan)
              </span>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Sebelumnya
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={page >= pagination.totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Berikutnya
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
