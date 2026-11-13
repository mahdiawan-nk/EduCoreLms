import React, { useEffect, useState } from 'react';
import { Building2, Save } from 'lucide-react';
import { toast } from 'sonner';
import { AppConfig } from '../../context/ThemeContext';
import { apiFetch } from '../../lib/api';
import { Button, Card, Input, Textarea } from '../ui/primitives';

interface Props {
  config: AppConfig;
  canManage: boolean;
  onSaved: () => Promise<void>;
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
      {children}
    </label>
  );
}

export function InstitutionIdentitySettings({ config, canManage, onSaved }: Props) {
  const [form, setForm] = useState(config.identity);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setForm(config.identity);
  }, [config.identity]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManage) return;
    try {
      setSaving(true);
      await apiFetch('/api/v1/admin/system-settings/identity', {
        method: 'PUT',
        body: JSON.stringify(form),
      });
      await onSaved();
      toast.success('Identitas institusi dan brand aplikasi berhasil disimpan.');
    } catch (err: any) {
      toast.error(err?.message || 'Gagal menyimpan identitas institusi.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="p-5 sm:p-6">
      <div className="flex items-start gap-3 border-b border-slate-200 pb-4 mb-5">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-700 shrink-0">
          <Building2 className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-base font-bold text-slate-900">
            Identitas Institusi & Brand Aplikasi
          </h2>
          <p className="text-xs text-slate-600 mt-0.5">
            Atur informasi resmi perguruan tinggi dan nama platform pembelajaran yang tampil di seluruh aplikasi.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <FieldLabel>Nama Institusi *</FieldLabel>
            <Input
              value={form.institutionName}
              onChange={(e) => setForm({ ...form, institutionName: e.target.value })}
              disabled={!canManage}
              required
            />
          </div>
          <div>
            <FieldLabel>Singkatan Institusi *</FieldLabel>
            <Input
              value={form.institutionShortName}
              onChange={(e) => setForm({ ...form, institutionShortName: e.target.value })}
              disabled={!canManage}
              required
            />
          </div>
          <div>
            <FieldLabel>Email Resmi Institusi</FieldLabel>
            <Input
              type="email"
              value={form.institutionEmail}
              onChange={(e) => setForm({ ...form, institutionEmail: e.target.value })}
              disabled={!canManage}
            />
          </div>
          <div>
            <FieldLabel>Website Resmi Institusi</FieldLabel>
            <Input
              type="url"
              placeholder="https://poltek-kampar.ac.id"
              value={form.institutionWebsite}
              onChange={(e) => setForm({ ...form, institutionWebsite: e.target.value })}
              disabled={!canManage}
            />
          </div>
          <div>
            <FieldLabel>Nomor Telepon Institusi</FieldLabel>
            <Input
              value={form.institutionPhone}
              onChange={(e) => setForm({ ...form, institutionPhone: e.target.value })}
              disabled={!canManage}
            />
          </div>
          <div>
            <FieldLabel>Alamat Institusi</FieldLabel>
            <Input
              value={form.institutionAddress}
              onChange={(e) => setForm({ ...form, institutionAddress: e.target.value })}
              disabled={!canManage}
            />
          </div>
        </div>

        <div>
          <FieldLabel>Deskripsi Institusi</FieldLabel>
          <Textarea
            rows={3}
            value={form.institutionDescription}
            onChange={(e) => setForm({ ...form, institutionDescription: e.target.value })}
            disabled={!canManage}
          />
        </div>

        <div className="border-t border-slate-200 pt-5">
          <h3 className="text-sm font-bold text-slate-900 mb-3">
            Identitas Aplikasi LMS
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <FieldLabel>Nama Aplikasi *</FieldLabel>
              <Input
                value={form.applicationName}
                onChange={(e) => setForm({ ...form, applicationName: e.target.value })}
                disabled={!canManage}
                required
              />
            </div>
            <div>
              <FieldLabel>Brand Aplikasi (Tetap / Immutable)</FieldLabel>
              <Input
                value="EduCoreLMS"
                disabled
                readOnly
                title="Nama brand utama EduCoreLMS bersifat permanen"
              />
            </div>
            <div>
              <FieldLabel>Tagline Aplikasi</FieldLabel>
              <Input
                value={form.applicationTagline}
                onChange={(e) => setForm({ ...form, applicationTagline: e.target.value })}
                disabled={!canManage}
              />
            </div>
            <div>
              <FieldLabel>Teks Hak Cipta (Copyright)</FieldLabel>
              <Input
                value={form.copyrightText}
                onChange={(e) => setForm({ ...form, copyrightText: e.target.value })}
                disabled={!canManage}
              />
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
            <span>{saving ? 'Menyimpan...' : 'Simpan Identitas Institusi'}</span>
          </Button>
        </div>
      </form>
    </Card>
  );
}
