import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Building2,
  Image as ImageIcon,
  Search,
  Palette,
  Server,
  ShieldCheck,
} from 'lucide-react';
import { AppShell } from '../components/AppShell';
import { useAuth } from '../context/AuthContext';
import { AppConfig, useAppConfig } from '../context/ThemeContext';
import { apiFetch } from '../lib/api';
import { canPerformMutations, hasPermission } from '../lib/authorization';
import { InstitutionIdentitySettings } from '../components/settings/InstitutionIdentitySettings';
import { BrandingSettings } from '../components/settings/BrandingSettings';
import { SeoSettings } from '../components/settings/SeoSettings';
import { ThemeSettings } from '../components/settings/ThemeSettings';
import {
  SettingsHistoryItem,
  SystemInfoPayload,
  SystemInformation,
} from '../components/settings/SystemInformation';

type SettingsSection = 'identity' | 'branding' | 'seo' | 'theme' | 'system';

interface AdminSettingsResponse {
  config: AppConfig;
  systemInfo: SystemInfoPayload;
  history: SettingsHistoryItem[];
}

export function SystemSettingsPage() {
  const { user } = useAuth();
  const { invalidateConfig } = useAppConfig();
  const queryClient = useQueryClient();
  const [activeSection, setActiveSection] = useState<SettingsSection>('identity');

  const { data, isLoading, error } = useQuery<AdminSettingsResponse>({
    queryKey: ['admin-system-settings'],
    queryFn: () => apiFetch<AdminSettingsResponse>('/api/v1/admin/system-settings'),
  });

  const handleSaved = async () => {
    await Promise.all([
      invalidateConfig(),
      queryClient.invalidateQueries({ queryKey: ['admin-system-settings'] }),
    ]);
  };

  const canMutate = canPerformMutations(user);
  const canManageIdentity =
    canMutate && hasPermission(user, 'system_settings.manage_identity');
  const canManageBranding =
    canMutate && hasPermission(user, 'system_settings.manage_branding');
  const canManageSeo =
    canMutate && hasPermission(user, 'system_settings.manage_seo');
  const canManageTheme =
    canMutate && hasPermission(user, 'system_settings.manage_theme');

  const navItems: Array<{
    id: SettingsSection;
    label: string;
    subtitle: string;
    icon: React.ComponentType<{ className?: string }>;
  }> = [
    {
      id: 'identity',
      label: 'Identitas Institusi',
      subtitle: 'Profil kampus & brand LMS',
      icon: Building2,
    },
    {
      id: 'branding',
      label: 'Logo & Favicon',
      subtitle: 'Aset visual & ikon browser',
      icon: ImageIcon,
    },
    {
      id: 'seo',
      label: 'SEO & Metadata',
      subtitle: 'Title, Open Graph & robots',
      icon: Search,
    },
    {
      id: 'theme',
      label: 'Appearance & Theme',
      subtitle: 'Preset warna akademik',
      icon: Palette,
    },
    {
      id: 'system',
      label: 'Informasi Sistem',
      subtitle: 'Runtime & riwayat audit',
      icon: Server,
    },
  ];

  return (
    <AppShell breadcrumb="Pengaturan Sistem">
      <div className="space-y-6">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-4">
          <div>
            <div className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 border border-blue-200 px-2.5 py-0.5 text-[11px] font-semibold text-blue-700 mb-2">
              <ShieldCheck className="h-3.5 w-3.5" />
              <span>Konfigurasi Global · Superadmin Only</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
              System Settings & Institutional Branding
            </h1>
            <p className="text-sm text-slate-600 mt-1">
              Pusat konfigurasi identitas institusi, logo, favicon, SEO metadata, dan tema warna akademik platform.
            </p>
          </div>
        </div>

        {isLoading ? (
          <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
            Memuat konfigurasi sistem...
          </div>
        ) : error || !data ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
            {(error as any)?.message || 'Gagal memuat pengaturan sistem.'}
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-[250px_1fr] gap-6 items-start">
            {/* Settings Navigation Sidebar */}
            <aside className="rounded-xl border border-slate-200 bg-white p-2 flex lg:flex-col gap-1 overflow-x-auto">
              {navItems.map((item) => {
                const Icon = item.icon;
                const active = activeSection === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setActiveSection(item.id)}
                    className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors shrink-0 lg:w-full cursor-pointer ${
                      active
                        ? 'bg-slate-900 text-white shadow-xs'
                        : 'text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs font-bold whitespace-nowrap">{item.label}</p>
                      <p
                        className={`hidden lg:block text-[11px] truncate ${
                          active ? 'text-slate-300' : 'text-slate-500'
                        }`}
                      >
                        {item.subtitle}
                      </p>
                    </div>
                  </button>
                );
              })}
            </aside>

            {/* Main Content */}
            <div className="min-w-0">
              {activeSection === 'identity' && (
                <InstitutionIdentitySettings
                  config={data.config}
                  canManage={canManageIdentity}
                  onSaved={handleSaved}
                />
              )}
              {activeSection === 'branding' && (
                <BrandingSettings
                  config={data.config}
                  canManage={canManageBranding}
                  onSaved={handleSaved}
                />
              )}
              {activeSection === 'seo' && (
                <SeoSettings
                  config={data.config}
                  canManage={canManageSeo}
                  onSaved={handleSaved}
                />
              )}
              {activeSection === 'theme' && (
                <ThemeSettings
                  config={data.config}
                  canManage={canManageTheme}
                  onSaved={handleSaved}
                />
              )}
              {activeSection === 'system' && (
                <SystemInformation
                  systemInfo={data.systemInfo}
                  history={data.history}
                />
              )}
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
