import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  ChevronDown,
  ChevronRight,
  Circle,
  CheckCircle2,
  Clock,
  ClipboardList,
  HelpCircle,
  Search,
  PanelLeftClose,
  PanelLeftOpen,
  X,
} from 'lucide-react';
import { apiFetch } from '../../lib/api';
import { Input } from '../ui/primitives';

interface Props {
  classroomId: string;
  activeMaterialId?: string;
  canManage?: boolean;
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

type NavFilter =
  | 'ALL'
  | 'NOT_STARTED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'ASSIGNMENTS'
  | 'ASSESSMENTS';

export function QuickNavigationSidebar({
  classroomId,
  activeMaterialId,
  canManage = false,
  mobileOpen = false,
  onMobileClose,
}: Props) {
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<NavFilter>('ALL');
  const [expandedModules, setExpandedModules] = useState<Record<string, boolean>>({});

  const { data, isLoading } = useQuery({
    queryKey: ['classwork-navigation', classroomId],
    queryFn: () => apiFetch<any>(`/api/v1/classrooms/${classroomId}/classwork-navigation`),
    enabled: Boolean(classroomId),
  });

  const modules: any[] = data?.modules || [];
  const q = search.trim().toLowerCase();

  const toggleModule = (modId: string) => {
    setExpandedModules((prev) => ({
      ...prev,
      [modId]: prev[modId] === undefined ? false : !prev[modId],
    }));
  };

  const renderStatusIcon = (status?: string) => {
    if (status === 'COMPLETED') {
      return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />;
    }
    if (status === 'IN_PROGRESS') {
      return <Clock className="h-3.5 w-3.5 text-amber-500 shrink-0" />;
    }
    return <Circle className="h-3.5 w-3.5 text-slate-300 shrink-0" />;
  };

  const filterLabel: { id: NavFilter; label: string }[] = [
    { id: 'ALL', label: 'Semua' },
    ...(!canManage
      ? [
          { id: 'NOT_STARTED' as const, label: 'Belum' },
          { id: 'IN_PROGRESS' as const, label: 'Proses' },
          { id: 'COMPLETED' as const, label: 'Selesai' },
        ]
      : []),
    { id: 'ASSIGNMENTS', label: 'Tugas' },
    { id: 'ASSESSMENTS', label: 'Asesmen' },
  ];

  const content = (
    <div className="flex flex-col h-full bg-white border border-slate-200 rounded-xl overflow-hidden">
      <div className="p-3 border-b border-slate-200 flex items-center justify-between bg-slate-50">
        <span className="text-xs font-bold text-slate-900 uppercase tracking-wider">
          Navigasi Cepat
        </span>
        <div className="flex items-center gap-1">
          {onMobileClose && (
            <button
              type="button"
              onClick={onMobileClose}
              className="lg:hidden p-1 rounded hover:bg-slate-200 text-slate-600"
              aria-label="Tutup navigasi"
            >
              <X className="h-4 w-4" />
            </button>
          )}
          <button
            type="button"
            onClick={() => setCollapsed(true)}
            className="hidden lg:inline-flex p-1 rounded hover:bg-slate-200 text-slate-600"
            title="Ciutkan panel"
          >
            <PanelLeftClose className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="p-3 space-y-2.5 border-b border-slate-100">
        <div className="relative">
          <Search className="h-3.5 w-3.5 text-slate-400 absolute left-2.5 top-2.5" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari modul / materi..."
            className="pl-8 h-8 text-xs"
          />
        </div>
        <div className="flex flex-wrap gap-1">
          {filterLabel.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors cursor-pointer ${
                filter === f.id
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2.5 space-y-2 max-h-[68vh]">
        {isLoading ? (
          <p className="text-xs text-slate-500 p-2">Memuat navigasi...</p>
        ) : modules.length === 0 ? (
          <p className="text-xs text-slate-500 p-2">Belum ada modul.</p>
        ) : (
          modules.map((mod, idx) => {
            const isExpanded = expandedModules[mod.id] !== false;
            const mats = (mod.materials || []).filter((m: any) => {
              if (filter === 'ASSIGNMENTS' || filter === 'ASSESSMENTS') return false;
              if (filter === 'NOT_STARTED' && m.progressStatus !== 'NOT_STARTED') return false;
              if (filter === 'IN_PROGRESS' && m.progressStatus !== 'IN_PROGRESS') return false;
              if (filter === 'COMPLETED' && m.progressStatus !== 'COMPLETED') return false;
              if (q && !m.title.toLowerCase().includes(q) && !mod.title.toLowerCase().includes(q))
                return false;
              return true;
            });

            const asgs = (mod.assignments || []).filter((a: any) => {
              if (
                filter === 'NOT_STARTED' ||
                filter === 'IN_PROGRESS' ||
                filter === 'COMPLETED' ||
                filter === 'ASSESSMENTS'
              ) {
                return false;
              }
              if (q && !a.title.toLowerCase().includes(q) && !mod.title.toLowerCase().includes(q))
                return false;
              return true;
            });

            const asms = (mod.assessments || []).filter((as: any) => {
              if (
                filter === 'NOT_STARTED' ||
                filter === 'IN_PROGRESS' ||
                filter === 'COMPLETED' ||
                filter === 'ASSIGNMENTS'
              ) {
                return false;
              }
              if (q && !as.title.toLowerCase().includes(q) && !mod.title.toLowerCase().includes(q))
                return false;
              return true;
            });

            if (q && mats.length === 0 && asgs.length === 0 && asms.length === 0 && !mod.title.toLowerCase().includes(q)) {
              return null;
            }

            return (
              <div key={mod.id} className="rounded-lg border border-slate-100 bg-slate-50/50">
                <button
                  type="button"
                  onClick={() => toggleModule(mod.id)}
                  className="w-full px-2.5 py-2 flex items-start justify-between gap-2 text-left hover:bg-slate-100 rounded-lg cursor-pointer"
                >
                  <div className="min-w-0">
                    <p className="text-[10px] font-mono font-semibold text-slate-400 uppercase">
                      MODUL {String(idx + 1).padStart(2, '0')}
                    </p>
                    <p className="text-xs font-bold text-slate-900 truncate">{mod.title}</p>
                    {!canManage && (
                      <p className="text-[10px] font-mono text-blue-700 mt-0.5">
                        {mod.completionPercentage ?? 0}% Selesai
                      </p>
                    )}
                    {canManage && mod.status !== 'PUBLISHED' && (
                      <span className="inline-block mt-0.5 px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 text-[9px] font-mono">
                        {mod.status}
                      </span>
                    )}
                  </div>
                  {isExpanded ? (
                    <ChevronDown className="h-3.5 w-3.5 text-slate-400 shrink-0 mt-1" />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5 text-slate-400 shrink-0 mt-1" />
                  )}
                </button>

                {isExpanded && (
                  <div className="px-2 pb-2 space-y-1">
                    {mats.map((m: any) => {
                      const isActive = activeMaterialId === m.id;
                      return (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => {
                            navigate(`/classrooms/${classroomId}/materials/${m.id}`);
                            onMobileClose?.();
                          }}
                          className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-left text-xs transition-colors cursor-pointer ${
                            isActive
                              ? 'bg-blue-700 text-white font-semibold'
                              : 'text-slate-700 hover:bg-slate-200/70'
                          }`}
                        >
                          {!canManage && renderStatusIcon(m.progressStatus)}
                          <span className="truncate flex-1">{m.title}</span>
                          {canManage && m.status !== 'PUBLISHED' && (
                            <span className="text-[9px] font-mono px-1 rounded bg-slate-200 text-slate-700">
                              {m.status}
                            </span>
                          )}
                        </button>
                      );
                    })}

                    {asgs.map((a: any) => (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => {
                          navigate(
                            canManage
                              ? `/classrooms/${classroomId}/assignments/${a.id}/monitoring`
                              : `/classrooms/${classroomId}/assignments/${a.id}`
                          );
                          onMobileClose?.();
                        }}
                        className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-left text-xs text-indigo-800 hover:bg-indigo-50 cursor-pointer"
                      >
                        <ClipboardList className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate flex-1">{a.title}</span>
                      </button>
                    ))}

                    {asms.map((as: any) => (
                      <button
                        key={as.id}
                        type="button"
                        onClick={() => {
                          navigate(
                            canManage
                              ? `/classrooms/${classroomId}/assessments/${as.id}/monitoring`
                              : `/classrooms/${classroomId}/assessments/${as.id}/exam`
                          );
                          onMobileClose?.();
                        }}
                        className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-left text-xs text-emerald-800 hover:bg-emerald-50 cursor-pointer"
                      >
                        <HelpCircle className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate flex-1">{as.title}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );

  if (collapsed) {
    return (
      <div className="hidden lg:flex flex-col items-center">
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          className="p-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 shadow-xs cursor-pointer"
          title="Buka Navigasi Cepat"
        >
          <PanelLeftOpen className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <>
      {/* Desktop/Tablet Sidebar */}
      <aside className="hidden lg:block w-72 shrink-0">{content}</aside>

      {/* Mobile Slide-Over Drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-900/50"
            onClick={onMobileClose}
          />
          <div className="relative w-80 max-w-[85vw] h-full bg-white p-2 z-10">
            {content}
          </div>
        </div>
      )}
    </>
  );
}
