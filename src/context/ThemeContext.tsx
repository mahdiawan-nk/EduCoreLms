import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useCallback,
} from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../lib/api';
import {
  AcademicThemePresetKey,
  DEFAULT_THEME_PRESET_KEY,
  ThemeTokens,
  applyThemeTokensToRoot,
  getThemePresetByKey,
} from '../lib/themes';

export interface AppConfig {
  version: number;
  brandingUpdatedAt?: string | null;
  academicYear?: string;
  auth?: {
    googleSsoEnabled: boolean;
  };
  identity: {
    institutionName: string;
    institutionShortName: string;
    institutionEmail: string;
    institutionWebsite: string;
    institutionAddress: string;
    institutionPhone: string;
    institutionDescription: string;
    applicationName: string;
    applicationBrand: string;
    applicationTagline: string;
    copyrightText: string;
  };
  branding: {
    institutionLogoUrl: string;
    institutionLogoVariants: { sm?: string; md?: string; lg?: string };
    applicationLogoUrl: string;
    applicationLogoVariants: { sm?: string; md?: string; lg?: string };
    loginLogoUrl: string;
    loginLogoVariants: { sm?: string; md?: string; lg?: string };
    faviconIcoUrl: string;
    faviconPngUrl: string;
    faviconSvgUrl: string;
    appleTouchIconUrl: string;
    maxLogoSizeKb: number;
  };
  seo: {
    defaultPageTitle: string;
    defaultMetaDescription: string;
    metaKeywords: string;
    canonicalBaseUrl: string;
    ogTitle: string;
    ogDescription: string;
    ogImageUrl: string;
    twitterCardType: string;
    appLocale: string;
    defaultLanguage: string;
    robotsPolicy: string;
  };
  theme: {
    presetKey: string;
    presetName: string;
    tokens: ThemeTokens;
  };
}

const APP_CONFIG_CACHE_KEY = 'educore_app_config_cache_v1';

const FALLBACK_PRESET = getThemePresetByKey(DEFAULT_THEME_PRESET_KEY);

const DEFAULT_APP_CONFIG: AppConfig = {
  version: 1,
  identity: {
    institutionName: 'Politeknik Kampar',
    institutionShortName: 'POLKAM',
    institutionEmail: 'info@poltek-kampar.ac.id',
    institutionWebsite: 'https://poltek-kampar.ac.id',
    institutionAddress: 'Jl. Tengku Muhammad KM 2, Bangkinang, Kampar, Riau',
    institutionPhone: '(0762) 21677',
    institutionDescription:
      'Platform Pembelajaran Digital Akademik Vokasi Politeknik Kampar.',
    applicationName: 'Politeknik Kampar LMS',
    applicationBrand: 'EduCoreLMS',
    applicationTagline: 'Academic Digital Learning Platform',
    copyrightText: '© 2026 Politeknik Kampar — EduCoreLMS',
  },
  branding: {
    institutionLogoUrl: '',
    institutionLogoVariants: {},
    applicationLogoUrl: '',
    applicationLogoVariants: {},
    loginLogoUrl: '',
    loginLogoVariants: {},
    faviconIcoUrl: '/favicon.ico',
    faviconPngUrl: '',
    faviconSvgUrl: '/favicon.svg',
    appleTouchIconUrl: '',
    maxLogoSizeKb: 2048,
  },
  seo: {
    defaultPageTitle: 'EduCoreLMS — Politeknik Kampar',
    defaultMetaDescription:
      'Sistem Manajemen Pembelajaran Digital Politeknik Kampar.',
    metaKeywords: 'EduCoreLMS, Politeknik Kampar, LMS Vokasi',
    canonicalBaseUrl: '',
    ogTitle: 'EduCoreLMS — Politeknik Kampar',
    ogDescription:
      'Platform Pembelajaran Digital Akademik Politeknik Kampar.',
    ogImageUrl: '',
    twitterCardType: 'summary_large_image',
    appLocale: 'id_ID',
    defaultLanguage: 'id',
    robotsPolicy: 'noindex, nofollow',
  },
  theme: {
    presetKey: FALLBACK_PRESET.presetKey,
    presetName: FALLBACK_PRESET.presetName,
    tokens: FALLBACK_PRESET.tokens,
  },
};

function readCachedAppConfig(): AppConfig {
  try {
    const raw = localStorage.getItem(APP_CONFIG_CACHE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as AppConfig;
      if (parsed?.theme?.tokens) {
        applyThemeTokensToRoot(parsed.theme.tokens);
        return parsed;
      }
    }
  } catch {
    // ignore storage errors
  }
  applyThemeTokensToRoot(DEFAULT_APP_CONFIG.theme.tokens);
  return DEFAULT_APP_CONFIG;
}

function upsertMetaTag(
  attr: 'name' | 'property',
  key: string,
  content: string
) {
  if (typeof document === 'undefined') return;
  let el = document.querySelector(`meta[${attr}="${key}"]`) as HTMLMetaElement | null;
  if (!content) {
    if (el) el.remove();
    return;
  }
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function upsertLinkTag(
  rel: string,
  href: string,
  extra?: { type?: string; sizes?: string }
) {
  if (typeof document === 'undefined') return;
  const selector = extra?.type
    ? `link[rel="${rel}"][type="${extra.type}"]`
    : `link[rel="${rel}"]`;
  let el = document.querySelector(selector) as HTMLLinkElement | null;
  if (!href) {
    if (el) el.remove();
    return;
  }
  if (!el) {
    el = document.createElement('link');
    el.rel = rel;
    if (extra?.type) el.type = extra.type;
    if (extra?.sizes) el.setAttribute('sizes', extra.sizes);
    document.head.appendChild(el);
  }
  el.href = href;
}

interface ThemeContextValue {
  config: AppConfig;
  isLoading: boolean;
  previewPresetKey: AcademicThemePresetKey | null;
  setPreviewPresetKey: (key: AcademicThemePresetKey | null) => void;
  activeTokens: ThemeTokens;
  invalidateConfig: () => Promise<void>;
  applyPageSeo: (opts: {
    pageTitle?: string;
    description?: string;
    isAuthenticatedPage?: boolean;
    pathname?: string;
  }) => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const [initialCache] = useState<AppConfig>(() => readCachedAppConfig());
  const [previewPresetKey, setPreviewPresetKey] =
    useState<AcademicThemePresetKey | null>(null);

  const { data, isLoading } = useQuery<AppConfig>({
    queryKey: ['app-config'],
    queryFn: () => apiFetch<AppConfig>('/api/v1/app/config'),
    initialData: initialCache,
    initialDataUpdatedAt: 0,
    staleTime: 15_000,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
  });

  const config = data || initialCache;

  const activeTokens = useMemo(() => {
    if (previewPresetKey) {
      return getThemePresetByKey(previewPresetKey).tokens;
    }
    return config.theme?.tokens || DEFAULT_APP_CONFIG.theme.tokens;
  }, [config.theme?.tokens, previewPresetKey]);

  // Persist anti-FOUC cache & hydrate CSS variables
  useEffect(() => {
    applyThemeTokensToRoot(activeTokens);
  }, [activeTokens]);

  useEffect(() => {
    if (data) {
      try {
        localStorage.setItem(APP_CONFIG_CACHE_KEY, JSON.stringify(data));
      } catch {
        // ignore
      }
    }
  }, [data]);

  // Cross-tab synchronization when Superadmin updates branding/theme in another tab
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === APP_CONFIG_CACHE_KEY && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue) as AppConfig;
          if (parsed?.theme?.tokens) {
            queryClient.setQueryData(['app-config'], parsed);
            applyThemeTokensToRoot(parsed.theme.tokens);
          }
        } catch {
          // ignore
        }
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [queryClient]);

  // Sync favicons, manifest, language, and default SEO tags
  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.documentElement.lang = config.seo.defaultLanguage || 'id';

    const vSuffix = `?v=${config.version || 1}`;
    const appendVer = (url: string) =>
      !url ? '' : url.includes('?') ? url : `${url}${vSuffix}`;

    upsertLinkTag('icon', appendVer(config.branding.faviconSvgUrl), {
      type: 'image/svg+xml',
    });
    upsertLinkTag(
      'alternate icon',
      appendVer(config.branding.faviconPngUrl || config.branding.faviconIcoUrl)
    );
    upsertLinkTag('apple-touch-icon', appendVer(config.branding.appleTouchIconUrl), {
      sizes: '180x180',
    });
    upsertLinkTag('manifest', `/api/v1/app/manifest.webmanifest${vSuffix}`);

    upsertMetaTag('name', 'keywords', config.seo.metaKeywords);
    upsertMetaTag('property', 'og:locale', config.seo.appLocale);
    upsertMetaTag('property', 'og:image', config.seo.ogImageUrl);
    upsertMetaTag('name', 'twitter:card', config.seo.twitterCardType);
  }, [config]);

  const applyPageSeo = useCallback(
    (opts: {
      pageTitle?: string;
      description?: string;
      isAuthenticatedPage?: boolean;
      pathname?: string;
    }) => {
      if (typeof document === 'undefined') return;
      const baseTitle =
        config.seo.defaultPageTitle ||
        `${config.identity.applicationBrand} — ${config.identity.institutionName}`;
      document.title = opts.pageTitle ? `${opts.pageTitle} | ${baseTitle}` : baseTitle;

      const desc = opts.description || config.seo.defaultMetaDescription;
      upsertMetaTag('name', 'description', desc);
      upsertMetaTag('property', 'og:title', opts.pageTitle || config.seo.ogTitle || baseTitle);
      upsertMetaTag('property', 'og:description', desc || config.seo.ogDescription);

      // Authenticated pages must NEVER be indexed by search engines
      const robots = opts.isAuthenticatedPage
        ? 'noindex, nofollow'
        : config.seo.robotsPolicy || 'noindex, nofollow';
      upsertMetaTag('name', 'robots', robots);

      if (config.seo.canonicalBaseUrl) {
        const cleanBase = config.seo.canonicalBaseUrl.replace(/\/+$/, '');
        const cleanPath = opts.pathname || '/';
        upsertLinkTag('canonical', `${cleanBase}${cleanPath}`);
      } else {
        upsertLinkTag('canonical', '');
      }
    },
    [config]
  );

  const invalidateConfig = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ['app-config'] });
  }, [queryClient]);

  return (
    <ThemeContext.Provider
      value={{
        config,
        isLoading,
        previewPresetKey,
        setPreviewPresetKey,
        activeTokens,
        invalidateConfig,
        applyPageSeo,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useAppConfig() {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useAppConfig must be used inside ThemeProvider');
  }
  return ctx;
}
