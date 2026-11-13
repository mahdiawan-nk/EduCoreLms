import React, { useEffect, useState } from 'react';
import { Search, Save, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { AppConfig } from '../../context/ThemeContext';
import { apiFetch } from '../../lib/api';
import { Button, Card, Input, Textarea } from '../ui/primitives';

interface Props {
  config: AppConfig;
  canManage: boolean;
  onSaved: () => Promise<void>;
}

function readCsrfCookie(): string {
  const match = document.cookie.match(/(^| )pk_lms_csrf=([^;]+)/);
  return match ? decodeURIComponent(match[2]) : '';
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
      {children}
    </label>
  );
}

const selectClassName =
  'flex h-10 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 disabled:cursor-not-allowed disabled:opacity-50';

export function SeoSettings({ config, canManage, onSaved }: Props) {
  const [form, setForm] = useState(config.seo);
  const [saving, setSaving] = useState(false);
  const [uploadingOg, setUploadingOg] = useState(false);

  useEffect(() => {
    setForm(config.seo);
  }, [config.seo]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManage) return;
    try {
      setSaving(true);
      await apiFetch('/api/v1/admin/system-settings/seo', {
        method: 'PUT',
        body: JSON.stringify(form),
      });
      await onSaved();
      toast.success('Pengaturan SEO dan metadata aplikasi berhasil disimpan.');
    } catch (err: any) {
      toast.error(err?.message || 'Gagal menyimpan pengaturan SEO.');
    } finally {
      setSaving(false);
    }
  };

  const handleUploadOgImage = async (file: File | null) => {
    if (!file || !canManage) return;
    try {
      setUploadingOg(true);
      const fd = new FormData();
      fd.append('file', file);
      const csrf = readCsrfCookie();
      const res = await fetch(
        '/api/v1/admin/system-settings/branding/upload?assetKind=ogImage',
        {
          method: 'POST',
          credentials: 'include',
          headers: csrf ? { 'X-CSRF-Token': csrf } : {},
          body: fd,
        }
      );
      const payload = await res.json();
      if (!res.ok || !payload?.success) {
        throw new Error(payload?.error?.message || 'Gagal mengunggah gambar Open Graph.');
      }
      setForm((prev) => ({ ...prev, ogImageUrl: payload.data.asset.url }));
      await onSaved();
      toast.success('Gambar Open Graph berhasil diunggah.');
    } catch (err: any) {
      toast.error(err?.message || 'Gagal mengunggah gambar Open Graph.');
    } finally {
      setUploadingOg(false);
    }
  };

  return (
    <Card className="p-5 sm:p-6">
      <div className="flex items-start gap-3 border-b border-slate-200 pb-4 mb-5">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700 shrink-0">
          <Search className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-base font-bold text-slate-900">
            SEO & Metadata Aplikasi
          </h2>
          <p className="text-xs text-slate-600 mt-0.5">
            Konfigurasi metadata global sebagai fallback halaman publik. Halaman dashboard terautentikasi otomatis menerapkan kebijakan <code>noindex, nofollow</code>.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <FieldLabel>Default Page Title *</FieldLabel>
            <Input
              value={form.defaultPageTitle}
              onChange={(e) =>
                setForm({ ...form, defaultPageTitle: e.target.value })
              }
              disabled={!canManage}
              required
            />
          </div>
          <div>
            <FieldLabel>Canonical Base URL</FieldLabel>
            <Input
              type="url"
              placeholder="https://lms.poltek-kampar.ac.id"
              value={form.canonicalBaseUrl}
              onChange={(e) =>
                setForm({ ...form, canonicalBaseUrl: e.target.value })
              }
              disabled={!canManage}
            />
          </div>
        </div>

        <div>
          <FieldLabel>Default Meta Description</FieldLabel>
          <Textarea
            rows={2}
            value={form.defaultMetaDescription}
            onChange={(e) =>
              setForm({ ...form, defaultMetaDescription: e.target.value })
            }
            disabled={!canManage}
          />
        </div>

        <div>
          <FieldLabel>Meta Keywords (secukupnya, dipisah koma)</FieldLabel>
          <Input
            value={form.metaKeywords}
            onChange={(e) => setForm({ ...form, metaKeywords: e.target.value })}
            disabled={!canManage}
          />
        </div>

        <div className="border-t border-slate-200 pt-5 space-y-4">
          <h3 className="text-sm font-bold text-slate-900">
            Open Graph, Twitter Card & Lokalisasi
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <FieldLabel>Open Graph Title</FieldLabel>
              <Input
                value={form.ogTitle}
                onChange={(e) => setForm({ ...form, ogTitle: e.target.value })}
                disabled={!canManage}
              />
            </div>
            <div>
              <FieldLabel>Twitter Card Type</FieldLabel>
              <select
                className={selectClassName}
                value={form.twitterCardType}
                onChange={(e) =>
                  setForm({ ...form, twitterCardType: e.target.value })
                }
                disabled={!canManage}
              >
                <option value="summary_large_image">Summary Large Image</option>
                <option value="summary">Summary Standard</option>
              </select>
            </div>
          </div>

          <div>
            <FieldLabel>Open Graph Description</FieldLabel>
            <Textarea
              rows={2}
              value={form.ogDescription}
              onChange={(e) =>
                setForm({ ...form, ogDescription: e.target.value })
              }
              disabled={!canManage}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
            <div>
              <FieldLabel>Open Graph Image URL</FieldLabel>
              <Input
                placeholder="https://... atau unggah gambar"
                value={form.ogImageUrl}
                onChange={(e) => setForm({ ...form, ogImageUrl: e.target.value })}
                disabled={!canManage}
              />
            </div>
            <div>
              <label className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer">
                <Upload className="h-3.5 w-3.5" />
                <span>{uploadingOg ? 'Mengunggah...' : 'Unggah OG Image (1200×630)'}</span>
                <input
                  type="file"
                  accept=".png,.jpg,.jpeg,.webp"
                  disabled={!canManage || uploadingOg}
                  className="hidden"
                  onChange={(e) => {
                    handleUploadOgImage(e.target.files?.[0] || null);
                    e.currentTarget.value = '';
                  }}
                />
              </label>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <FieldLabel>Application Locale</FieldLabel>
              <Input
                value={form.appLocale}
                onChange={(e) => setForm({ ...form, appLocale: e.target.value })}
                disabled={!canManage}
              />
            </div>
            <div>
              <FieldLabel>Default Language</FieldLabel>
              <select
                className={selectClassName}
                value={form.defaultLanguage}
                onChange={(e) =>
                  setForm({ ...form, defaultLanguage: e.target.value })
                }
                disabled={!canManage}
              >
                <option value="id">Bahasa Indonesia (id)</option>
                <option value="en">English (en)</option>
              </select>
            </div>
            <div>
              <FieldLabel>Robots Indexing Policy (Public)</FieldLabel>
              <select
                className={selectClassName}
                value={form.robotsPolicy}
                onChange={(e) => setForm({ ...form, robotsPolicy: e.target.value })}
                disabled={!canManage}
              >
                <option value="noindex, nofollow">noindex, nofollow (Tertutup)</option>
                <option value="index, follow">index, follow (Publik)</option>
                <option value="noindex, follow">noindex, follow</option>
                <option value="index, nofollow">index, nofollow</option>
              </select>
            </div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row justify-end gap-2 pt-2 border-t border-slate-200">
          <Button
            type="submit"
            disabled={!canManage || saving}
            className="w-full sm:w-auto"
          >
            <Save className="h-4 w-4" />
            <span>{saving ? 'Menyimpan...' : 'Simpan SEO & Metadata'}</span>
          </Button>
        </div>
      </form>
    </Card>
  );
}
