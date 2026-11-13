import React from 'react';
import { Server, Database, History } from 'lucide-react';
import { Card } from '../ui/primitives';
import { formatDateTime } from '../../lib/utils';

export interface SystemInfoPayload {
  applicationName: string;
  applicationBrand: string;
  applicationVersion: string;
  environment: string;
  databaseStatus: 'CONNECTED' | 'DEGRADED';
  applicationUrl: string;
  lastUpdatedAt: string | null;
  lastUpdatedBy: string;
}

export interface SettingsHistoryItem {
  id: string;
  settingGroup: string;
  settingKey: string;
  previousValue: string | null;
  newValue: string | null;
  changedAt: string;
  changedByName: string | null;
}

interface Props {
  systemInfo: SystemInfoPayload;
  history: SettingsHistoryItem[];
}

export function SystemInformation({ systemInfo, history }: Props) {
  const infoItems = [
    { label: 'Nama Aplikasi', value: systemInfo.applicationName },
    { label: 'Brand Platform', value: systemInfo.applicationBrand },
    { label: 'Versi Aplikasi', value: `v${systemInfo.applicationVersion}` },
    { label: 'Environment', value: systemInfo.environment },
    { label: 'URL Aplikasi', value: systemInfo.applicationUrl },
    {
      label: 'Pembaruan Terakhir',
      value: systemInfo.lastUpdatedAt
        ? formatDateTime(systemInfo.lastUpdatedAt)
        : 'Konfigurasi Awal',
    },
    { label: 'Diperbarui Oleh', value: systemInfo.lastUpdatedBy || 'System' },
  ];

  return (
    <div className="space-y-6">
      <Card className="p-5 sm:p-6">
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 pb-4 mb-5">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 text-slate-700 shrink-0">
              <Server className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Informasi Sistem & Status Runtime
              </h2>
              <p className="text-xs text-slate-600 mt-0.5">
                Ringkasan status operasional aplikasi tanpa menampilkan kredensial atau konfigurasi sensitif.
              </p>
            </div>
          </div>

          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold shrink-0 ${
              systemInfo.databaseStatus === 'CONNECTED'
                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                : 'bg-red-50 text-red-700 border border-red-200'
            }`}
          >
            <Database className="h-3.5 w-3.5" />
            <span>DB: {systemInfo.databaseStatus}</span>
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {infoItems.map((item) => (
            <div
              key={item.label}
              className="rounded-lg border border-slate-200 bg-slate-50/70 p-3.5"
            >
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                {item.label}
              </p>
              <p className="mt-1 text-sm font-semibold text-slate-900 break-all">
                {item.value}
              </p>
            </div>
          ))}
        </div>
      </Card>

      <Card className="p-5 sm:p-6">
        <div className="flex items-center gap-2.5 border-b border-slate-200 pb-4 mb-4">
          <History className="h-4 w-4 text-slate-600" />
          <h3 className="text-sm font-bold text-slate-900">
            Riwayat Perubahan Pengaturan Terbaru
          </h3>
        </div>

        {history.length === 0 ? (
          <p className="text-xs text-slate-500 py-6 text-center">
            Belum ada perubahan pengaturan yang tercatat.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-3 py-2.5 font-semibold">Waktu</th>
                  <th className="px-3 py-2.5 font-semibold">Grup</th>
                  <th className="px-3 py-2.5 font-semibold">Key</th>
                  <th className="px-3 py-2.5 font-semibold">Nilai Baru</th>
                  <th className="px-3 py-2.5 font-semibold">Diubah Oleh</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {history.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-50/60">
                    <td className="px-3 py-2.5 font-mono text-slate-500 whitespace-nowrap">
                      {formatDateTime(row.changedAt)}
                    </td>
                    <td className="px-3 py-2.5 font-semibold uppercase text-slate-700">
                      {row.settingGroup}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-slate-800">
                      {row.settingKey}
                    </td>
                    <td className="px-3 py-2.5 text-slate-700 max-w-[240px] truncate">
                      {row.newValue || '—'}
                    </td>
                    <td className="px-3 py-2.5 text-slate-700 whitespace-nowrap">
                      {row.changedByName || 'Superadmin'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
