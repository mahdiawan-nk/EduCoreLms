import React, { useEffect, useState } from 'react';
import { Palette, Check, Eye, RotateCcw, Save } from 'lucide-react';
import { toast } from 'sonner';
import { AppConfig, useAppConfig } from '../../context/ThemeContext';
import {
  ACADEMIC_THEME_PRESETS,
  AcademicThemePresetKey,
  getThemePresetByKey,
} from '../../lib/themes';
import { apiFetch } from '../../lib/api';
import { Button, Card } from '../ui/primitives';

interface Props {
  config: AppConfig;
  canManage: boolean;
  onSaved: () => Promise<void>;
}

export function ThemeSettings({ config, canManage, onSaved }: Props) {
  const { setPreviewPresetKey } = useAppConfig();
  const [selectedPresetKey, setSelectedPresetKey] =
    useState<AcademicThemePresetKey>(
      (config.theme.presetKey as AcademicThemePresetKey) || 'academic_modern'
    );
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);

  useEffect(() => {
    setSelectedPresetKey(
      (config.theme.presetKey as AcademicThemePresetKey) || 'academic_modern'
    );
  }, [config.theme.presetKey]);

  // Clear temporary live preview on unmount if unsaved
  useEffect(() => {
    return () => {
      setPreviewPresetKey(null);
    };
  }, [setPreviewPresetKey]);

  const selectedPreset = getThemePresetByKey(selectedPresetKey);
  const t = selectedPreset.tokens;

  const handleApplyLivePreview = () => {
    setPreviewPresetKey(selectedPresetKey);
    toast.info(`Pratinjau langsung tema "${selectedPreset.presetName}" diterapkan.`);
  };

  const handleSaveTheme = async () => {
    if (!canManage) return;
    try {
      setSaving(true);
      await apiFetch('/api/v1/admin/system-settings/theme', {
        method: 'PUT',
        body: JSON.stringify({ presetKey: selectedPresetKey }),
      });
      setPreviewPresetKey(null);
      await onSaved();
      toast.success(`Tema "${selectedPreset.presetName}" berhasil disimpan ke database.`);
    } catch (err: any) {
      toast.error(err?.message || 'Gagal menyimpan tema.');
    } finally {
      setSaving(false);
    }
  };

  const handleResetDefault = async () => {
    if (!canManage) return;
    try {
      setResetting(true);
      await apiFetch('/api/v1/admin/system-settings/theme/reset', {
        method: 'POST',
        body: JSON.stringify({}),
      });
      setPreviewPresetKey(null);
      setSelectedPresetKey('academic_modern');
      await onSaved();
      toast.success('Tema dikembalikan ke preset bawaan (Academic Modern).');
    } catch (err: any) {
      toast.error(err?.message || 'Gagal mereset tema.');
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Preset Selector */}
      <Card className="p-5 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-4 mb-5">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-50 text-indigo-700 shrink-0">
              <Palette className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Academic Color Preset Engine
              </h2>
              <p className="text-xs text-slate-600 mt-0.5">
                Pilih salah satu dari 6 preset warna akademik resmi (Fixed Preset Policy). Seluruh design token diperbarui secara konsisten di database.
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {ACADEMIC_THEME_PRESETS.map((preset) => {
            const isSelected = selectedPresetKey === preset.presetKey;
            const isCurrentlyActive = config.theme.presetKey === preset.presetKey;

            return (
              <button
                key={preset.presetKey}
                type="button"
                onClick={() => setSelectedPresetKey(preset.presetKey)}
                className={`text-left rounded-xl border p-4 transition-all cursor-pointer ${
                  isSelected
                    ? 'border-blue-600 ring-2 ring-blue-600/20 bg-blue-50/30'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-slate-900">
                      {preset.presetName}
                    </span>
                    <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">
                      {preset.badge}
                    </span>
                  </div>
                  {isSelected && (
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-white">
                      <Check className="h-3 w-3" />
                    </span>
                  )}
                </div>

                <p className="text-xs text-slate-600 leading-relaxed mb-3">
                  {preset.description}
                </p>

                {/* Color Swatches */}
                <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100">
                  <div className="flex items-center gap-1.5">
                    {[
                      preset.tokens.sidebarBg,
                      preset.tokens.sidebarActiveBg,
                      preset.tokens.primaryColor,
                      preset.tokens.accentColor,
                      preset.tokens.contentBg,
                    ].map((hex, i) => (
                      <span
                        key={i}
                        className="h-5 w-5 rounded-md border border-slate-300/70"
                        style={{ backgroundColor: hex }}
                        title={hex}
                      />
                    ))}
                  </div>
                  {isCurrentlyActive && (
                    <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">
                      Aktif di DB
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-5 mt-5 border-t border-slate-200">
          <Button
            type="button"
            variant="outline"
            onClick={handleResetDefault}
            disabled={!canManage || resetting}
            className="w-full sm:w-auto"
          >
            <RotateCcw className="h-4 w-4" />
            <span>{resetting ? 'Mereset...' : 'Reset ke Default'}</span>
          </Button>

          <div className="flex flex-col sm:flex-row gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={handleApplyLivePreview}
              className="w-full sm:w-auto"
            >
              <Eye className="h-4 w-4" />
              <span>Terapkan Tema (Preview)</span>
            </Button>
            <Button
              type="button"
              onClick={handleSaveTheme}
              disabled={!canManage || saving}
              className="w-full sm:w-auto"
            >
              <Save className="h-4 w-4" />
              <span>{saving ? 'Menyimpan...' : 'Simpan Pengaturan'}</span>
            </Button>
          </div>
        </div>
      </Card>

      {/* Comprehensive Live Theme Preview */}
      <Card className="p-5 sm:p-6">
        <div className="mb-4">
          <h3 className="text-sm font-bold text-slate-900">
            Live Preview — {selectedPreset.presetName}
          </h3>
          <p className="text-xs text-slate-600 mt-0.5">
            Simulasi langsung Sidebar, Topbar, Breadcrumb, Dashboard Cards, Form Controls, Buttons, dan Tabel.
          </p>
        </div>

        <div
          className="rounded-xl border overflow-hidden shadow-xs"
          style={{
            borderColor: t.borderColor,
            backgroundColor: t.contentBg,
            color: t.textPrimary,
          }}
        >
          <div className="grid grid-cols-1 md:grid-cols-[210px_1fr] min-h-[340px]">
            {/* Preview Sidebar */}
            <div
              className="p-3 flex flex-col justify-between border-b md:border-b-0 md:border-r"
              style={{
                backgroundColor: t.sidebarBg,
                color: t.sidebarText,
                borderColor: t.borderColor,
              }}
            >
              <div className="space-y-3">
                <div className="flex items-center gap-2 px-2 py-1.5">
                  <div
                    className="h-6 w-6 rounded-md flex items-center justify-center text-[10px] font-bold"
                    style={{
                      backgroundColor: t.sidebarActiveBg,
                      color: t.sidebarActiveText,
                    }}
                  >
                    EC
                  </div>
                  <div className="min-w-0">
                    <p
                      className="text-xs font-bold truncate"
                      style={{ color: t.sidebarActiveText }}
                    >
                      {config.identity.applicationBrand}
                    </p>
                    <p className="text-[10px] opacity-75 truncate">
                      {config.identity.institutionShortName}
                    </p>
                  </div>
                </div>

                <div className="space-y-1 text-xs">
                  <div
                    className="rounded-md px-2.5 py-1.5 font-semibold flex items-center justify-between"
                    style={{
                      backgroundColor: t.sidebarActiveBg,
                      color: t.sidebarActiveText,
                    }}
                  >
                    <span>Dashboard</span>
                    <span
                      className="h-1.5 w-1.5 rounded-full"
                      style={{ backgroundColor: t.accentColor }}
                    />
                  </div>
                  <div className="rounded-md px-2.5 py-1.5 opacity-85">
                    Ruang Kelas
                  </div>
                  <div className="rounded-md px-2.5 py-1.5 opacity-85">
                    Periode Akademik
                  </div>
                  <div className="rounded-md px-2.5 py-1.5 opacity-85">
                    Pengaturan Sistem
                  </div>
                </div>
              </div>
              <div className="px-2 pt-3 text-[10px] opacity-65">
                Token: {selectedPreset.presetKey}
              </div>
            </div>

            {/* Preview Main Area */}
            <div className="flex flex-col min-w-0">
              {/* Preview Topbar & Breadcrumb */}
              <div
                className="flex items-center justify-between px-4 h-12 border-b text-xs"
                style={{
                  backgroundColor: t.topbarBg,
                  color: t.topbarText,
                  borderColor: t.borderColor,
                }}
              >
                <div className="flex items-center gap-1.5 font-medium truncate">
                  <span className="font-bold">{config.identity.applicationBrand}</span>
                  <span className="opacity-40">/</span>
                  <span style={{ color: t.textSecondary }}>Dashboard Akademik</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span
                    className="rounded-md px-2 py-0.5 text-[10px] font-bold text-white"
                    style={{ backgroundColor: t.primaryColor }}
                  >
                    Superadmin
                  </span>
                </div>
              </div>

              {/* Preview Content */}
              <div className="p-4 space-y-4">
                {/* Dashboard Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {[
                    { label: 'Kelas Aktif', value: '24', color: t.primaryColor },
                    { label: 'Tingkat Kehadiran', value: '94%', color: t.successColor },
                    { label: 'Perlu Evaluasi', value: '3', color: t.warningColor },
                  ].map((kpi) => (
                    <div
                      key={kpi.label}
                      className="rounded-lg border p-3"
                      style={{
                        backgroundColor: t.cardBg,
                        borderColor: t.borderColor,
                      }}
                    >
                      <p
                        className="text-[11px] font-medium"
                        style={{ color: t.textSecondary }}
                      >
                        {kpi.label}
                      </p>
                      <p
                        className="text-lg font-bold mt-0.5"
                        style={{ color: kpi.color }}
                      >
                        {kpi.value}
                      </p>
                    </div>
                  ))}
                </div>

                {/* Buttons & Form Controls */}
                <div
                  className="rounded-lg border p-3 flex flex-wrap items-center gap-2.5"
                  style={{
                    backgroundColor: t.cardBg,
                    borderColor: t.borderColor,
                  }}
                >
                  <input
                    type="text"
                    readOnly
                    value="Contoh Input Akademik"
                    className="rounded-md border px-2.5 py-1 text-xs outline-none flex-1 min-w-[140px]"
                    style={{
                      backgroundColor: t.surfaceBg,
                      borderColor: t.borderColor,
                      color: t.textPrimary,
                      boxShadow: `0 0 0 2px ${t.focusRing}`,
                    }}
                  />
                  <span
                    className="rounded-md px-3 py-1.5 text-xs font-semibold text-white"
                    style={{ backgroundColor: t.primaryColor }}
                  >
                    Tombol Utama
                  </span>
                  <span
                    className="rounded-md px-3 py-1.5 text-xs font-semibold text-white"
                    style={{ backgroundColor: t.accentColor }}
                  >
                    Aksen
                  </span>
                  <span
                    className="rounded-md px-3 py-1.5 text-xs font-semibold text-white"
                    style={{ backgroundColor: t.dangerColor }}
                  >
                    Hapus
                  </span>
                </div>

                {/* Table Preview */}
                <div
                  className="rounded-lg border overflow-hidden"
                  style={{
                    backgroundColor: t.cardBg,
                    borderColor: t.borderColor,
                  }}
                >
                  <table className="w-full text-left text-xs">
                    <thead style={{ backgroundColor: t.surfaceBg }}>
                      <tr>
                        <th className="px-3 py-2 font-semibold">Mata Kuliah</th>
                        <th className="px-3 py-2 font-semibold">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-t" style={{ borderColor: t.borderColor }}>
                        <td className="px-3 py-2">Pemrograman Web Lanjut</td>
                        <td className="px-3 py-2 font-semibold" style={{ color: t.successColor }}>
                          Aktif
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
