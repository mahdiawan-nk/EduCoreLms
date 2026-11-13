import React, { useEffect, useState } from 'react';
import { Image as ImageIcon, Upload, Trash2, Save, Globe } from 'lucide-react';
import { toast } from 'sonner';
import { AppConfig } from '../../context/ThemeContext';
import { apiFetch } from '../../lib/api';
import { Button, Card, Input } from '../ui/primitives';

type AssetSlotKey =
  | 'institutionLogo'
  | 'applicationLogo'
  | 'loginLogo'
  | 'faviconIco'
  | 'faviconPng'
  | 'faviconSvg'
  | 'appleTouchIcon';

interface SlotConfig {
  key: AssetSlotKey;
  title: string;
  description: string;
  accept: string;
  currentUrl: string;
  previewBoxClass: string;
}

interface Props {
  config: AppConfig;
  canManage: boolean;
  onSaved: () => Promise<void>;
}

function readCsrfCookie(): string {
  const match = document.cookie.match(/(^| )pk_lms_csrf=([^;]+)/);
  return match ? decodeURIComponent(match[2]) : '';
}

export function BrandingSettings({ config, canManage, onSaved }: Props) {
  const [maxLogoSizeKb, setMaxLogoSizeKb] = useState<number>(
    config.branding.maxLogoSizeKb || 2048
  );
  const [pendingFiles, setPendingFiles] = useState<
    Partial<Record<AssetSlotKey, { file: File; previewUrl: string }>>
  >({});
  const [uploadingKey, setUploadingKey] = useState<AssetSlotKey | null>(null);
  const [savingPolicy, setSavingPolicy] = useState(false);

  useEffect(() => {
    setMaxLogoSizeKb(config.branding.maxLogoSizeKb || 2048);
  }, [config.branding.maxLogoSizeKb]);

  // Revoke object URLs on unmount
  useEffect(() => {
    return () => {
      Object.values(pendingFiles).forEach((entry) => {
        if (entry?.previewUrl) URL.revokeObjectURL(entry.previewUrl);
      });
    };
  }, [pendingFiles]);

  const logoSlots: SlotConfig[] = [
    {
      key: 'institutionLogo',
      title: 'Logo Institusi Akademik',
      description: 'Logo resmi perguruan tinggi (PNG, JPG, WebP, atau SVG tersanitasi).',
      accept: '.png,.jpg,.jpeg,.webp,.svg',
      currentUrl: config.branding.institutionLogoUrl,
      previewBoxClass: 'h-16 w-16',
    },
    {
      key: 'applicationLogo',
      title: 'Logo Aplikasi (EduCoreLMS)',
      description: 'Tampil di sidebar utama dan header navigasi aplikasi.',
      accept: '.png,.jpg,.jpeg,.webp,.svg',
      currentUrl: config.branding.applicationLogoUrl,
      previewBoxClass: 'h-16 w-16',
    },
    {
      key: 'loginLogo',
      title: 'Logo Halaman Login',
      description: 'Logo khusus yang ditampilkan pada portal autentikasi pengguna.',
      accept: '.png,.jpg,.jpeg,.webp,.svg',
      currentUrl: config.branding.loginLogoUrl,
      previewBoxClass: 'h-16 w-28',
    },
  ];

  const faviconSlots: SlotConfig[] = [
    {
      key: 'faviconIco',
      title: 'Favicon ICO',
      description: 'Format .ico standar atau PNG 32×32 untuk kompatibilitas browser.',
      accept: '.ico,.png,.webp',
      currentUrl: config.branding.faviconIcoUrl,
      previewBoxClass: 'h-12 w-12',
    },
    {
      key: 'faviconPng',
      title: 'Favicon PNG',
      description: 'Ikon PNG resolusi tinggi (64×64 otomatis dioptimasi).',
      accept: '.png,.jpg,.jpeg,.webp',
      currentUrl: config.branding.faviconPngUrl,
      previewBoxClass: 'h-12 w-12',
    },
    {
      key: 'faviconSvg',
      title: 'Favicon SVG',
      description: 'Ikon vektor modern dengan sanitasi keamanan ketat.',
      accept: '.svg',
      currentUrl: config.branding.faviconSvgUrl,
      previewBoxClass: 'h-12 w-12',
    },
    {
      key: 'appleTouchIcon',
      title: 'Apple Touch Icon',
      description: 'Ikon 180×180 PNG untuk perangkat iOS dan manifest aplikasi.',
      accept: '.png,.jpg,.jpeg,.webp',
      currentUrl: config.branding.appleTouchIconUrl,
      previewBoxClass: 'h-14 w-14',
    },
  ];

  const handleSelectFile = (key: AssetSlotKey, file: File | null) => {
    if (!file) return;
    if (file.size > maxLogoSizeKb * 1024) {
      toast.error(`Ukuran file melebihi batas maksimum ${maxLogoSizeKb} KB.`);
      return;
    }
    const previewUrl = URL.createObjectURL(file);
    setPendingFiles((prev) => {
      if (prev[key]?.previewUrl) {
        URL.revokeObjectURL(prev[key]!.previewUrl);
      }
      return { ...prev, [key]: { file, previewUrl } };
    });
  };

  const handleUploadSlot = async (key: AssetSlotKey) => {
    const pending = pendingFiles[key];
    if (!pending || !canManage) return;

    try {
      setUploadingKey(key);
      const formData = new FormData();
      formData.append('file', pending.file);

      const csrf = readCsrfCookie();
      const res = await fetch(
        `/api/v1/admin/system-settings/branding/upload?assetKind=${encodeURIComponent(key)}`,
        {
          method: 'POST',
          credentials: 'include',
          headers: csrf ? { 'X-CSRF-Token': csrf } : {},
          body: formData,
        }
      );

      const payload = await res.json();
      if (!res.ok || !payload?.success) {
        throw new Error(payload?.error?.message || 'Gagal mengunggah aset branding.');
      }

      setPendingFiles((prev) => {
        const next = { ...prev };
        if (next[key]?.previewUrl) URL.revokeObjectURL(next[key]!.previewUrl);
        delete next[key];
        return next;
      });
      await onSaved();
      toast.success('Aset branding berhasil diunggah dan dioptimasi.');
    } catch (err: any) {
      toast.error(err?.message || 'Gagal mengunggah aset branding.');
    } finally {
      setUploadingKey(null);
    }
  };

  const handleClearSlot = async (key: AssetSlotKey) => {
    if (!canManage) return;
    const bodyMap: Record<AssetSlotKey, Record<string, string>> = {
      institutionLogo: { institutionLogoUrl: '' },
      applicationLogo: { applicationLogoUrl: '' },
      loginLogo: { loginLogoUrl: '' },
      faviconIco: { faviconIcoUrl: '/favicon.ico' },
      faviconPng: { faviconPngUrl: '' },
      faviconSvg: { faviconSvgUrl: '/favicon.svg' },
      appleTouchIcon: { appleTouchIconUrl: '' },
    };
    try {
      await apiFetch('/api/v1/admin/system-settings/branding', {
        method: 'PUT',
        body: JSON.stringify(bodyMap[key]),
      });
      await onSaved();
      toast.success('Aset dikembalikan ke bawaan.');
    } catch (err: any) {
      toast.error(err?.message || 'Gagal mereset aset.');
    }
  };

  const handleSaveSizePolicy = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManage) return;
    try {
      setSavingPolicy(true);
      await apiFetch('/api/v1/admin/system-settings/branding', {
        method: 'PUT',
        body: JSON.stringify({ maxLogoSizeKb: Number(maxLogoSizeKb) }),
      });
      await onSaved();
      toast.success('Batas ukuran file branding berhasil disimpan.');
    } catch (err: any) {
      toast.error(err?.message || 'Gagal menyimpan batas ukuran file.');
    } finally {
      setSavingPolicy(false);
    }
  };

  const renderSlotCard = (slot: SlotConfig) => {
    const pending = pendingFiles[slot.key];
    const displayUrl = pending?.previewUrl || slot.currentUrl;
    const isUploading = uploadingKey === slot.key;

    return (
      <div
        key={slot.key}
        className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 flex flex-col justify-between gap-4"
      >
        <div className="flex items-start gap-3.5">
          <div
            className={`${slot.previewBoxClass} rounded-lg border border-slate-200 bg-white flex items-center justify-center overflow-hidden p-1.5 shrink-0`}
          >
            {displayUrl ? (
              <img
                src={displayUrl}
                alt={slot.title}
                loading="lazy"
                className="max-h-full max-w-full object-contain"
              />
            ) : (
              <ImageIcon className="h-5 w-5 text-slate-400" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h4 className="text-sm font-bold text-slate-900">{slot.title}</h4>
            <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">
              {slot.description}
            </p>
            {pending && (
              <p className="mt-1 text-[11px] font-semibold text-amber-700">
                Pratinjau lokal siap diunggah: {pending.file.name}
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-200">
          <label className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer">
            <Upload className="h-3.5 w-3.5" />
            <span>Pilih Berkas</span>
            <input
              type="file"
              accept={slot.accept}
              disabled={!canManage || isUploading}
              className="hidden"
              onChange={(e) => {
                handleSelectFile(slot.key, e.target.files?.[0] || null);
                e.currentTarget.value = '';
              }}
            />
          </label>

          {pending && (
            <Button
              type="button"
              size="sm"
              disabled={!canManage || isUploading}
              onClick={() => handleUploadSlot(slot.key)}
            >
              <Save className="h-3.5 w-3.5" />
              <span>{isUploading ? 'Mengunggah...' : 'Simpan & Optimasi'}</span>
            </Button>
          )}

          {slot.currentUrl && !pending && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={!canManage}
              onClick={() => handleClearSlot(slot.key)}
              className="text-slate-500 hover:text-red-600"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>Reset</span>
            </Button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <Card className="p-5 sm:p-6">
        <div className="flex items-start gap-3 border-b border-slate-200 pb-4 mb-5">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-700 shrink-0">
            <ImageIcon className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900">
              Logo Institusi & Branding Aplikasi
            </h2>
            <p className="text-xs text-slate-600 mt-0.5">
              Unggah logo terpisah untuk institusi, navigasi aplikasi, dan portal login. Gambar raster otomatis dioptimasi ke WebP multi-ukuran tanpa pembesaran paksa.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-5">
          {logoSlots.map(renderSlotCard)}
        </div>

        <form
          onSubmit={handleSaveSizePolicy}
          className="flex flex-col sm:flex-row sm:items-end gap-3 pt-4 border-t border-slate-200"
        >
          <div className="w-full sm:w-64">
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Batas Maksimum File Logo (KB)
            </label>
            <Input
              type="number"
              min={128}
              max={10240}
              value={maxLogoSizeKb}
              onChange={(e) => setMaxLogoSizeKb(Number(e.target.value))}
              disabled={!canManage}
            />
          </div>
          <Button
            type="submit"
            variant="outline"
            disabled={!canManage || savingPolicy}
            className="w-full sm:w-auto"
          >
            <Save className="h-4 w-4" />
            <span>{savingPolicy ? 'Menyimpan...' : 'Simpan Batas Ukuran'}</span>
          </Button>
        </form>
      </Card>

      <Card className="p-5 sm:p-6">
        <div className="flex items-start gap-3 border-b border-slate-200 pb-4 mb-5">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-50 text-amber-700 shrink-0">
            <Globe className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900">
              Manajemen Favicon & Web App Icons
            </h2>
            <p className="text-xs text-slate-600 mt-0.5">
              Pembaruan favicon otomatis memperbarui metadata HTML dan manifest aplikasi dengan parameter versi anti-cache.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {faviconSlots.map(renderSlotCard)}
        </div>
      </Card>
    </div>
  );
}
