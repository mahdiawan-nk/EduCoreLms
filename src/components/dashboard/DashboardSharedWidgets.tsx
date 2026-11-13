import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bell,
  CheckCheck,
  ArrowUp,
  ArrowDown,
  Eye,
  EyeOff,
  SlidersHorizontal,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react';
import { Card, Button, ModalDialog } from '../ui/primitives';
import { formatDateTime } from '../../lib/utils';
import type {
  CategorizedNotification,
  DashboardPreferences,
  AcademicPeriodItem,
  PrimaryRole,
} from './types';

export type KpiTone = 'navy' | 'blue' | 'green' | 'orange' | 'red' | 'slate';

const TONE_MAP: Record<
  KpiTone,
  { iconBg: string; iconText: string; accentBorder: string }
> = {
  navy: {
    iconBg: 'bg-slate-900 text-white',
    iconText: 'text-slate-900',
    accentBorder: 'border-t-slate-900',
  },
  blue: {
    iconBg: 'bg-blue-50 text-blue-700 border border-blue-100',
    iconText: 'text-blue-700',
    accentBorder: 'border-t-blue-600',
  },
  green: {
    iconBg: 'bg-emerald-50 text-emerald-700 border border-emerald-100',
    iconText: 'text-emerald-700',
    accentBorder: 'border-t-emerald-600',
  },
  orange: {
    iconBg: 'bg-amber-50 text-amber-700 border border-amber-100',
    iconText: 'text-amber-700',
    accentBorder: 'border-t-amber-500',
  },
  red: {
    iconBg: 'bg-rose-50 text-rose-700 border border-rose-100',
    iconText: 'text-rose-700',
    accentBorder: 'border-t-rose-600',
  },
  slate: {
    iconBg: 'bg-slate-100 text-slate-700 border border-slate-200',
    iconText: 'text-slate-700',
    accentBorder: 'border-t-slate-400',
  },
};

export function StatKpiCard({
  label,
  value,
  sublabel,
  icon: Icon,
  tone = 'blue',
  onClick,
  compact = false,
}: {
  label: string;
  value: string | number;
  sublabel?: string;
  icon: React.ComponentType<{ className?: string }>;
  tone?: KpiTone;
  onClick?: () => void;
  compact?: boolean;
}) {
  const style = TONE_MAP[tone];
  return (
    <Card
      onClick={onClick}
      className={`bg-white border border-slate-200 border-t-2 ${style.accentBorder} shadow-xs ${
        compact ? 'p-3.5' : 'p-4'
      } ${onClick ? 'cursor-pointer hover:border-blue-300 transition-colors' : ''}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-slate-500 truncate">{label}</p>
          <p className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
            {value}
          </p>
          {sublabel && (
            <p className="mt-1 text-xs text-slate-500 truncate">{sublabel}</p>
          )}
        </div>
        <div
          className={`shrink-0 h-9 w-9 rounded-lg flex items-center justify-center ${style.iconBg}`}
        >
          <Icon className="h-4 w-4" />
        </div>
      </div>
    </Card>
  );
}

const CATEGORY_LABEL: Record<string, { label: string; cls: string }> = {
  SYSTEM: { label: 'Sistem', cls: 'bg-slate-100 text-slate-700' },
  RBAC: { label: 'RBAC', cls: 'bg-indigo-50 text-indigo-700' },
  SECURITY: { label: 'Keamanan', cls: 'bg-rose-50 text-rose-700' },
  ASSIGNMENT: { label: 'Tugas', cls: 'bg-blue-50 text-blue-700' },
  ASSESSMENT: { label: 'Ujian', cls: 'bg-amber-50 text-amber-700' },
  MATERIAL: { label: 'Materi', cls: 'bg-emerald-50 text-emerald-700' },
  GRADE: { label: 'Nilai', cls: 'bg-teal-50 text-teal-700' },
  ANNOUNCEMENT: { label: 'Pengumuman', cls: 'bg-slate-100 text-slate-800' },
};

export function NotificationCenterPanel({
  notifications,
  unreadCount,
  isAuditor,
  onMarkAllRead,
}: {
  notifications: CategorizedNotification[];
  unreadCount: number;
  isAuditor: boolean;
  onMarkAllRead: () => void;
}) {
  const navigate = useNavigate();

  return (
    <Card className="bg-white border border-slate-200 shadow-xs p-4">
      <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-slate-100 text-slate-800 flex items-center justify-center">
            <Bell className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-900">
              Pusat Notifikasi
            </h3>
            <p className="text-xs text-slate-500">
              {unreadCount > 0
                ? `${unreadCount} notifikasi belum dibaca`
                : 'Semua notifikasi telah dibaca'}
            </p>
          </div>
        </div>
        {!isAuditor && unreadCount > 0 && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onMarkAllRead}
            className="text-xs h-8"
          >
            <CheckCheck className="h-3.5 w-3.5 mr-1" />
            Tandai Dibaca
          </Button>
        )}
      </div>

      {notifications.length === 0 ? (
        <div className="py-6 text-center text-xs text-slate-500">
          Belum ada notifikasi akademik atau sistem.
        </div>
      ) : (
        <div className="divide-y divide-slate-100 max-h-80 overflow-y-auto">
          {notifications.map((n) => {
            const cat = CATEGORY_LABEL[n.category] || CATEGORY_LABEL.SYSTEM;
            return (
              <div
                key={n.id}
                onClick={() => {
                  if (n.linkUrl) navigate(n.linkUrl);
                }}
                className={`py-2.5 px-2 rounded-md transition-colors ${
                  n.linkUrl ? 'cursor-pointer hover:bg-slate-50' : ''
                } ${!n.isRead ? 'bg-blue-50/40' : ''}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${cat.cls}`}
                  >
                    {cat.label}
                  </span>
                  <span className="text-[11px] text-slate-400">
                    {formatDateTime(n.createdAt)}
                  </span>
                </div>
                <p className="mt-1 text-xs font-semibold text-slate-800">
                  {n.title}
                </p>
                <p className="text-xs text-slate-600 line-clamp-2">
                  {n.message}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

export interface WidgetMeta {
  id: string;
  label: string;
}

export function PersonalizationModal({
  open,
  onClose,
  role,
  widgets,
  preferences,
  availablePeriods,
  onSave,
  saving,
}: {
  open: boolean;
  onClose: () => void;
  role: PrimaryRole;
  widgets: WidgetMeta[];
  preferences: DashboardPreferences;
  availablePeriods: AcademicPeriodItem[];
  onSave: (next: DashboardPreferences) => void;
  saving?: boolean;
}) {
  const [hiddenWidgets, setHiddenWidgets] = React.useState<string[]>(
    preferences.hiddenWidgets || []
  );
  const [widgetOrder, setWidgetOrder] = React.useState<string[]>(
    preferences.widgetOrder?.length
      ? preferences.widgetOrder
      : widgets.map((w) => w.id)
  );
  const [selectedPeriodId, setSelectedPeriodId] = React.useState<string>(
    preferences.selectedPeriodId || ''
  );
  const [viewDensity, setViewDensity] = React.useState<'comfortable' | 'compact'>(
    preferences.viewDensity || 'comfortable'
  );

  React.useEffect(() => {
    if (open) {
      setHiddenWidgets(preferences.hiddenWidgets || []);
      const defaultIds = widgets.map((w) => w.id);
      const existing = (preferences.widgetOrder || []).filter((id) =>
        defaultIds.includes(id)
      );
      const missing = defaultIds.filter((id) => !existing.includes(id));
      setWidgetOrder([...existing, ...missing]);
      setSelectedPeriodId(preferences.selectedPeriodId || '');
      setViewDensity(preferences.viewDensity || 'comfortable');
    }
  }, [open, preferences, widgets]);

  const toggleWidget = (id: string) => {
    setHiddenWidgets((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const moveWidget = (index: number, dir: -1 | 1) => {
    const nextIdx = index + dir;
    if (nextIdx < 0 || nextIdx >= widgetOrder.length) return;
    const copy = [...widgetOrder];
    const [item] = copy.splice(index, 1);
    copy.splice(nextIdx, 0, item);
    setWidgetOrder(copy);
  };

  const widgetMap = new Map(widgets.map((w) => [w.id, w.label]));

  return (
    <ModalDialog
      open={open}
      onClose={onClose}
      title="Personalisasi Dashboard Akademik"
      description="Atur urutan widget, visibilitas panel, periode default, dan kepadatan tampilan sesuai kebutuhan Anda."
    >
      <div className="space-y-4">
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1.5">
            Kepadatan Tampilan
          </label>
          <div className="grid grid-cols-2 gap-2">
            {(['comfortable', 'compact'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setViewDensity(mode)}
                className={`px-3 py-2 rounded-lg border text-xs font-medium text-left transition-colors ${
                  viewDensity === mode
                    ? 'border-blue-600 bg-blue-50 text-blue-700'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                {mode === 'comfortable' ? 'Nyaman (Standar)' : 'Ringkas (Compact)'}
              </button>
            ))}
          </div>
        </div>

        {availablePeriods.length > 0 && (
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Periode Akademik Default
            </label>
            <select
              value={selectedPeriodId}
              onChange={(e) => setSelectedPeriodId(e.target.value)}
              className="w-full h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Otomatis (Periode Aktif Saat Ini)</option>
              {availablePeriods.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.code})
                </option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1.5">
            Urutan & Visibilitas Widget ({role})
          </label>
          <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg bg-slate-50/50">
            {widgetOrder.map((id, idx) => {
              const hidden = hiddenWidgets.includes(id);
              return (
                <div
                  key={id}
                  className="flex items-center justify-between gap-2 px-3 py-2"
                >
                  <span
                    className={`text-xs font-medium ${
                      hidden ? 'text-slate-400 line-through' : 'text-slate-800'
                    }`}
                  >
                    {widgetMap.get(id) || id}
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => moveWidget(idx, -1)}
                      disabled={idx === 0}
                      className="p-1 rounded hover:bg-slate-200 disabled:opacity-30 text-slate-600"
                      title="Naikkan"
                    >
                      <ArrowUp className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => moveWidget(idx, 1)}
                      disabled={idx === widgetOrder.length - 1}
                      className="p-1 rounded hover:bg-slate-200 disabled:opacity-30 text-slate-600"
                      title="Turunkan"
                    >
                      <ArrowDown className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleWidget(id)}
                      className={`p-1 rounded hover:bg-slate-200 ${
                        hidden ? 'text-slate-400' : 'text-blue-600'
                      }`}
                      title={hidden ? 'Tampilkan' : 'Sembunyikan'}
                    >
                      {hidden ? (
                        <EyeOff className="h-3.5 w-3.5" />
                      ) : (
                        <Eye className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
          <Button type="button" variant="outline" size="sm" onClick={onClose}>
            Batal
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={saving}
            onClick={() =>
              onSave({
                hiddenWidgets,
                widgetOrder,
                selectedPeriodId: selectedPeriodId || null,
                viewDensity,
              })
            }
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            <SlidersHorizontal className="h-3.5 w-3.5 mr-1.5" />
            {saving ? 'Menyimpan...' : 'Simpan Preferensi'}
          </Button>
        </div>
      </div>
    </ModalDialog>
  );
}

export function DashboardErrorState({
  title = 'Gagal memuat data dashboard',
  message,
  onRetry,
  retrying = false,
}: {
  title?: string;
  message?: string;
  onRetry: () => void;
  retrying?: boolean;
}) {
  return (
    <Card className="p-6 bg-white border border-rose-200 shadow-xs">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="h-9 w-9 rounded-lg bg-rose-50 text-rose-700 border border-rose-100 flex items-center justify-center shrink-0">
            <AlertTriangle className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-rose-900">{title}</h3>
            <p className="text-xs text-rose-700 mt-0.5">
              {message || 'Terjadi gangguan saat mengambil data dari server. Silakan coba lagi.'}
            </p>
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={retrying}
          onClick={onRetry}
          className="h-8 text-xs border-rose-300 text-rose-800 hover:bg-rose-50 shrink-0"
        >
          <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${retrying ? 'animate-spin' : ''}`} />
          {retrying ? 'Memuat...' : 'Coba Lagi'}
        </Button>
      </div>
    </Card>
  );
}
