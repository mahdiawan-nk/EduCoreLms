import fs from 'node:fs';
import path from 'node:path';
import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { desc, eq, sql } from 'drizzle-orm';
import { db, createPool } from '../db/index.ts';
import {
  systemSettings,
  applicationThemes,
  systemSettingsHistory,
  academicPeriods,
  users,
  roles,
  permissions,
  rolePermissions,
} from '../db/schema.ts';
import {
  authenticateRequest,
  sendSuccess,
  sendError,
  recordAuditLog,
  PERMISSION_REGISTRY,
} from './security.ts';
import {
  ACADEMIC_THEME_PRESETS,
  DEFAULT_THEME_PRESET_KEY,
  getThemePresetByKey,
  isValidThemePresetKey,
} from '../lib/themes.ts';
import {
  processBrandingUpload,
  readBrandingObject,
  BrandingAssetKind,
} from './brandingStorage.ts';

export interface PublicAppConfig {
  version: number;
  brandingUpdatedAt: string | null;
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
    tokens: Record<string, string>;
  };
}

interface DefaultSettingSeed {
  group: 'identity' | 'branding' | 'favicon' | 'seo' | 'general';
  key: string;
  value: string;
  valueType: 'string' | 'number' | 'boolean' | 'json' | 'url';
  isPublic: boolean;
}

const DEFAULT_SETTINGS_SEEDS: DefaultSettingSeed[] = [
  // Identity
  { group: 'identity', key: 'institution_name', value: 'Politeknik Kampar', valueType: 'string', isPublic: true },
  { group: 'identity', key: 'institution_short_name', value: 'POLKAM', valueType: 'string', isPublic: true },
  { group: 'identity', key: 'institution_email', value: 'info@poltek-kampar.ac.id', valueType: 'string', isPublic: true },
  { group: 'identity', key: 'institution_website', value: 'https://poltek-kampar.ac.id', valueType: 'url', isPublic: true },
  { group: 'identity', key: 'institution_address', value: 'Jl. Tengku Muhammad KM 2, Bangkinang, Kampar, Riau', valueType: 'string', isPublic: true },
  { group: 'identity', key: 'institution_phone', value: '(0762) 21677', valueType: 'string', isPublic: true },
  { group: 'identity', key: 'institution_description', value: 'Platform Pembelajaran Digital Akademik Vokasi Politeknik Kampar berbasis Capaian Pembelajaran dan Evaluasi Terpadu.', valueType: 'string', isPublic: true },
  { group: 'identity', key: 'application_name', value: 'Politeknik Kampar LMS', valueType: 'string', isPublic: true },
  { group: 'identity', key: 'application_brand', value: 'EduCoreLMS', valueType: 'string', isPublic: true },
  { group: 'identity', key: 'application_tagline', value: 'Academic Digital Learning Platform', valueType: 'string', isPublic: true },
  { group: 'identity', key: 'copyright_text', value: '© 2026 Politeknik Kampar — EduCoreLMS', valueType: 'string', isPublic: true },

  // Branding
  { group: 'branding', key: 'institution_logo_url', value: '', valueType: 'url', isPublic: true },
  { group: 'branding', key: 'institution_logo_variants', value: '{}', valueType: 'json', isPublic: true },
  { group: 'branding', key: 'application_logo_url', value: '', valueType: 'url', isPublic: true },
  { group: 'branding', key: 'application_logo_variants', value: '{}', valueType: 'json', isPublic: true },
  { group: 'branding', key: 'login_logo_url', value: '', valueType: 'url', isPublic: true },
  { group: 'branding', key: 'login_logo_variants', value: '{}', valueType: 'json', isPublic: true },
  { group: 'branding', key: 'max_logo_size_kb', value: '2048', valueType: 'number', isPublic: true },

  // Favicon
  { group: 'favicon', key: 'favicon_ico_url', value: '/favicon.ico', valueType: 'url', isPublic: true },
  { group: 'favicon', key: 'favicon_png_url', value: '', valueType: 'url', isPublic: true },
  { group: 'favicon', key: 'favicon_svg_url', value: '/favicon.svg', valueType: 'url', isPublic: true },
  { group: 'favicon', key: 'apple_touch_icon_url', value: '', valueType: 'url', isPublic: true },

  // SEO
  { group: 'seo', key: 'default_page_title', value: 'EduCoreLMS — Politeknik Kampar', valueType: 'string', isPublic: true },
  { group: 'seo', key: 'default_meta_description', value: 'Sistem Manajemen Pembelajaran Digital Politeknik Kampar untuk manajemen kelas, materi, tugas, asesmen, dan evaluasi akademik.', valueType: 'string', isPublic: true },
  { group: 'seo', key: 'meta_keywords', value: 'EduCoreLMS, Politeknik Kampar, LMS Vokasi, Ruang Kelas Digital', valueType: 'string', isPublic: true },
  { group: 'seo', key: 'canonical_base_url', value: '', valueType: 'url', isPublic: true },
  { group: 'seo', key: 'og_title', value: 'EduCoreLMS — Politeknik Kampar', valueType: 'string', isPublic: true },
  { group: 'seo', key: 'og_description', value: 'Platform Pembelajaran Digital Akademik Politeknik Kampar.', valueType: 'string', isPublic: true },
  { group: 'seo', key: 'og_image_url', value: '', valueType: 'url', isPublic: true },
  { group: 'seo', key: 'twitter_card_type', value: 'summary_large_image', valueType: 'string', isPublic: true },
  { group: 'seo', key: 'app_locale', value: 'id_ID', valueType: 'string', isPublic: true },
  { group: 'seo', key: 'default_language', value: 'id', valueType: 'string', isPublic: true },
  { group: 'seo', key: 'robots_policy', value: 'noindex, nofollow', valueType: 'string', isPublic: true },

  // General
  { group: 'general', key: 'config_version', value: '1', valueType: 'number', isPublic: true },
];

let initialized = false;
let initPromise: Promise<void> | null = null;
let cachedPublicConfig: PublicAppConfig | null = null;

export function invalidateAppConfigCache(): void {
  cachedPublicConfig = null;
}

export async function ensureSystemSettingsInitialized(): Promise<void> {
  if (initialized) return;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const pool = createPool();
    await pool.query(`
      CREATE TABLE IF NOT EXISTS "system_settings" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "setting_group" text NOT NULL,
        "setting_key" text NOT NULL UNIQUE,
        "setting_value" text,
        "value_type" text DEFAULT 'string' NOT NULL,
        "is_public" boolean DEFAULT true NOT NULL,
        "updated_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL,
        "updated_at" timestamp with time zone DEFAULT now() NOT NULL
      );
      CREATE INDEX IF NOT EXISTS "idx_system_settings_group" ON "system_settings" ("setting_group");
      CREATE INDEX IF NOT EXISTS "idx_system_settings_key" ON "system_settings" ("setting_key");

      CREATE TABLE IF NOT EXISTS "application_themes" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "preset_key" text NOT NULL UNIQUE,
        "preset_name" text NOT NULL,
        "description" text DEFAULT '' NOT NULL,
        "token_configuration" jsonb NOT NULL,
        "is_active" boolean DEFAULT false NOT NULL,
        "updated_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL,
        "updated_at" timestamp with time zone DEFAULT now() NOT NULL
      );
      CREATE INDEX IF NOT EXISTS "idx_application_themes_active" ON "application_themes" ("is_active");

      CREATE TABLE IF NOT EXISTS "system_settings_history" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "setting_group" text NOT NULL,
        "setting_key" text NOT NULL,
        "previous_value" text,
        "new_value" text,
        "changed_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
        "changed_at" timestamp with time zone DEFAULT now() NOT NULL
      );
      CREATE INDEX IF NOT EXISTS "idx_system_settings_history_group" ON "system_settings_history" ("setting_group");
      CREATE INDEX IF NOT EXISTS "idx_system_settings_history_changed_at" ON "system_settings_history" ("changed_at");
    `);

    // Seed default settings idempotently
    for (const seed of DEFAULT_SETTINGS_SEEDS) {
      await db
        .insert(systemSettings)
        .values({
          settingGroup: seed.group,
          settingKey: seed.key,
          settingValue: seed.value,
          valueType: seed.valueType,
          isPublic: seed.isPublic,
        })
        .onConflictDoNothing({ target: systemSettings.settingKey });
    }

    // Seed 6 fixed academic presets idempotently
    const existingThemes = await db.select().from(applicationThemes);
    const hasActiveTheme = existingThemes.some((t) => t.isActive);
    for (const preset of ACADEMIC_THEME_PRESETS) {
      await db
        .insert(applicationThemes)
        .values({
          presetKey: preset.presetKey,
          presetName: preset.presetName,
          description: preset.description,
          tokenConfiguration: preset.tokens as unknown as Record<string, string>,
          isActive: !hasActiveTheme && preset.presetKey === DEFAULT_THEME_PRESET_KEY,
        })
        .onConflictDoNothing({ target: applicationThemes.presetKey });
    }

    // Ensure system_settings.* permissions exist and are granted to SUPERADMIN
    const sysPerms = PERMISSION_REGISTRY.filter((p) =>
      p.code.startsWith('system_settings.')
    );
    const [superRole] = await db
      .select()
      .from(roles)
      .where(eq(roles.code, 'SUPERADMIN'));

    for (const perm of sysPerms) {
      await db
        .insert(permissions)
        .values({
          code: perm.code,
          module: perm.module,
          description: perm.description,
        })
        .onConflictDoNothing({ target: permissions.code });

      if (superRole) {
        const [permRow] = await db
          .select()
          .from(permissions)
          .where(eq(permissions.code, perm.code));
        if (permRow) {
          await db
            .insert(rolePermissions)
            .values({
              roleId: superRole.id,
              permissionId: permRow.id,
            })
            .onConflictDoNothing();
        }
      }
    }

    initialized = true;
  })().finally(() => {
    initPromise = null;
  });

  return initPromise;
}

function parseJsonSafe(raw?: string | null): Record<string, string> {
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

export async function buildPublicAppConfig(): Promise<PublicAppConfig> {
  await ensureSystemSettingsInitialized();
  if (cachedPublicConfig) return cachedPublicConfig;

  const rows = await db
    .select()
    .from(systemSettings)
    .where(eq(systemSettings.isPublic, true));
  const map = new Map(rows.map((r) => [r.settingKey, r.settingValue ?? '']));

  const [activeTheme] = await db
    .select()
    .from(applicationThemes)
    .where(eq(applicationThemes.isActive, true));

  const fallbackPreset = getThemePresetByKey(DEFAULT_THEME_PRESET_KEY);
  const themePreset = activeTheme
    ? getThemePresetByKey(activeTheme.presetKey)
    : fallbackPreset;

  const version = Number(map.get('config_version') || '1') || 1;
  const latestUpdatedAt = rows.reduce<Date | null>((max, row) => {
    if (!row.updatedAt) return max;
    return !max || row.updatedAt > max ? row.updatedAt : max;
  }, null);

  let academicYear = '';
  try {
    const [defaultPeriod] = await db
      .select({
        name: academicPeriods.name,
        academicYear: academicPeriods.academicYear,
      })
      .from(academicPeriods)
      .where(eq(academicPeriods.isDefault, true));
    academicYear =
      defaultPeriod?.academicYear || defaultPeriod?.name || '';
  } catch {
    academicYear = '';
  }

  let googleSsoEnabled = false;
  try {
    const firebaseCfgPath = path.resolve(
      process.cwd(),
      'firebase-applet-config.json'
    );
    if (fs.existsSync(firebaseCfgPath)) {
      const fb = JSON.parse(fs.readFileSync(firebaseCfgPath, 'utf-8'));
      googleSsoEnabled = Boolean(
        fb?.apiKey && fb?.authDomain && fb?.projectId
      );
    }
  } catch {
    googleSsoEnabled = false;
  }

  const config: PublicAppConfig = {
    version,
    brandingUpdatedAt: latestUpdatedAt ? latestUpdatedAt.toISOString() : null,
    academicYear,
    auth: {
      googleSsoEnabled,
    },
    identity: {
      institutionName: map.get('institution_name') || 'Politeknik Kampar',
      institutionShortName: map.get('institution_short_name') || 'POLKAM',
      institutionEmail: map.get('institution_email') || '',
      institutionWebsite: map.get('institution_website') || '',
      institutionAddress: map.get('institution_address') || '',
      institutionPhone: map.get('institution_phone') || '',
      institutionDescription: map.get('institution_description') || '',
      applicationName: map.get('application_name') || 'Politeknik Kampar LMS',
      applicationBrand: 'EduCoreLMS',
      applicationTagline:
        map.get('application_tagline') || 'Academic Digital Learning Platform',
      copyrightText:
        map.get('copyright_text') || '© 2026 Politeknik Kampar — EduCoreLMS',
    },
    branding: {
      institutionLogoUrl: map.get('institution_logo_url') || '',
      institutionLogoVariants: parseJsonSafe(
        map.get('institution_logo_variants')
      ),
      applicationLogoUrl: map.get('application_logo_url') || '',
      applicationLogoVariants: parseJsonSafe(
        map.get('application_logo_variants')
      ),
      loginLogoUrl: map.get('login_logo_url') || '',
      loginLogoVariants: parseJsonSafe(map.get('login_logo_variants')),
      faviconIcoUrl: map.get('favicon_ico_url') || '/favicon.ico',
      faviconPngUrl: map.get('favicon_png_url') || '',
      faviconSvgUrl: map.get('favicon_svg_url') || '/favicon.svg',
      appleTouchIconUrl: map.get('apple_touch_icon_url') || '',
      maxLogoSizeKb: Number(map.get('max_logo_size_kb') || '2048') || 2048,
    },
    seo: {
      defaultPageTitle:
        map.get('default_page_title') || 'EduCoreLMS — Politeknik Kampar',
      defaultMetaDescription: map.get('default_meta_description') || '',
      metaKeywords: map.get('meta_keywords') || '',
      canonicalBaseUrl: map.get('canonical_base_url') || '',
      ogTitle: map.get('og_title') || 'EduCoreLMS — Politeknik Kampar',
      ogDescription: map.get('og_description') || '',
      ogImageUrl: map.get('og_image_url') || '',
      twitterCardType: map.get('twitter_card_type') || 'summary_large_image',
      appLocale: map.get('app_locale') || 'id_ID',
      defaultLanguage: map.get('default_language') || 'id',
      robotsPolicy: map.get('robots_policy') || 'noindex, nofollow',
    },
    theme: {
      presetKey: themePreset.presetKey,
      presetName: themePreset.presetName,
      tokens: (themePreset.tokens as unknown) as Record<string, string>,
    },
  };

  cachedPublicConfig = config;
  return config;
}

async function upsertSettingKeys(params: {
  tx: any;
  group: string;
  entries: Array<{ key: string; value: string; valueType?: string }>;
  userId: string;
}) {
  const { tx, group, entries, userId } = params;
  for (const entry of entries) {
    const [existing] = await tx
      .select()
      .from(systemSettings)
      .where(eq(systemSettings.settingKey, entry.key));

    const prevValue = existing?.settingValue ?? null;
    if (prevValue === entry.value) continue;

    if (existing) {
      await tx
        .update(systemSettings)
        .set({
          settingValue: entry.value,
          updatedBy: userId,
          updatedAt: new Date(),
        })
        .where(eq(systemSettings.settingKey, entry.key));
    } else {
      await tx.insert(systemSettings).values({
        settingGroup: group,
        settingKey: entry.key,
        settingValue: entry.value,
        valueType: entry.valueType || 'string',
        isPublic: true,
        updatedBy: userId,
      });
    }

    await tx.insert(systemSettingsHistory).values({
      settingGroup: group,
      settingKey: entry.key,
      previousValue: prevValue,
      newValue: entry.value,
      changedBy: userId,
    });
  }

  // Bump config_version
  const [verRow] = await tx
    .select()
    .from(systemSettings)
    .where(eq(systemSettings.settingKey, 'config_version'));
  const nextVer = String((Number(verRow?.settingValue || '1') || 1) + 1);
  if (verRow) {
    await tx
      .update(systemSettings)
      .set({ settingValue: nextVer, updatedBy: userId, updatedAt: new Date() })
      .where(eq(systemSettings.settingKey, 'config_version'));
  }
}

function isSuperadminWithPerm(
  user: NonNullable<Awaited<ReturnType<typeof authenticateRequest>>>,
  requiredPerm: string
): boolean {
  const isSuper = user.roles.includes('SUPERADMIN');
  return isSuper && user.permissions.includes(requiredPerm);
}

const identitySchema = z.object({
  institutionName: z.string().trim().min(2).max(160),
  institutionShortName: z.string().trim().min(1).max(32),
  institutionEmail: z.union([z.string().trim().email().max(160), z.literal('')]),
  institutionWebsite: z.union([
    z.string().trim().url().max(255),
    z.literal(''),
  ]),
  institutionAddress: z.string().trim().max(400),
  institutionPhone: z.string().trim().max(50),
  institutionDescription: z.string().trim().max(600),
  applicationName: z.string().trim().min(2).max(120),
  applicationBrand: z.string().trim().min(2).max(80),
  applicationTagline: z.string().trim().max(160),
  copyrightText: z.string().trim().max(200),
});

const brandingSchema = z.object({
  institutionLogoUrl: z.string().trim().max(500).optional(),
  applicationLogoUrl: z.string().trim().max(500).optional(),
  loginLogoUrl: z.string().trim().max(500).optional(),
  faviconIcoUrl: z.string().trim().max(500).optional(),
  faviconPngUrl: z.string().trim().max(500).optional(),
  faviconSvgUrl: z.string().trim().max(500).optional(),
  appleTouchIconUrl: z.string().trim().max(500).optional(),
  maxLogoSizeKb: z.number().int().min(128).max(10240).optional(),
});

const seoSchema = z.object({
  defaultPageTitle: z.string().trim().min(2).max(140),
  defaultMetaDescription: z.string().trim().max(320),
  metaKeywords: z.string().trim().max(320),
  canonicalBaseUrl: z.union([
    z.string().trim().url().max(255),
    z.literal(''),
  ]),
  ogTitle: z.string().trim().max(140),
  ogDescription: z.string().trim().max(320),
  ogImageUrl: z.union([
    z.string().trim().url().max(500),
    z.string().trim().regex(/^\/api\/v1\/storage\/branding\/[a-zA-Z0-9_.-]+(\?v=\d+)?$/),
    z.literal(''),
  ]),
  twitterCardType: z.enum(['summary', 'summary_large_image']),
  appLocale: z.string().trim().min(2).max(20),
  defaultLanguage: z.enum(['id', 'en']),
  robotsPolicy: z.enum([
    'index, follow',
    'noindex, nofollow',
    'noindex, follow',
    'index, nofollow',
  ]),
});

export async function registerSystemSettingsRoutes(
  fastify: FastifyInstance
): Promise<void> {
  // 1. Public App Config (used by ThemeProvider, SeoHead, LoginPage, AppShell)
  fastify.get('/api/v1/app/config', async (_req, reply) => {
    const config = await buildPublicAppConfig();
    reply.header('Cache-Control', 'no-store, no-cache, must-revalidate');
    return sendSuccess(reply, config);
  });

  // 2. Dynamic Web App Manifest with current branding & cache-busted icons
  fastify.get('/api/v1/app/manifest.webmanifest', async (_req, reply) => {
    const config = await buildPublicAppConfig();
    const icons: Array<{ src: string; sizes: string; type: string }> = [];
    if (config.branding.faviconPngUrl) {
      icons.push({
        src: config.branding.faviconPngUrl,
        sizes: '64x64',
        type: 'image/png',
      });
    }
    if (config.branding.appleTouchIconUrl) {
      icons.push({
        src: config.branding.appleTouchIconUrl,
        sizes: '180x180',
        type: 'image/png',
      });
    }
    if (config.branding.faviconSvgUrl) {
      icons.push({
        src: config.branding.faviconSvgUrl,
        sizes: 'any',
        type: 'image/svg+xml',
      });
    }

    reply.header('Content-Type', 'application/manifest+json; charset=utf-8');
    reply.header('Cache-Control', 'no-cache');
    return reply.send({
      name: config.identity.applicationName,
      short_name: config.identity.applicationBrand,
      description: config.identity.institutionDescription,
      start_url: '/',
      display: 'standalone',
      background_color: config.theme.tokens.contentBg,
      theme_color: config.theme.tokens.primaryColor,
      icons,
    });
  });

  // 3. Public Branding Storage Endpoint
  fastify.get('/api/v1/storage/branding/:filename', async (req, reply) => {
    const { filename } = req.params as { filename: string };
    const found = readBrandingObject(filename);
    if (!found) {
      return sendError(reply, 404, 'NOT_FOUND', 'Berkas branding tidak ditemukan.');
    }
    reply.header('Content-Type', found.contentType);
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('Cache-Control', 'public, max-age=31536000, immutable');
    return reply.send(found.buffer);
  });

  // 4. GET /api/v1/admin/system-settings (Superadmin Only)
  fastify.get('/api/v1/admin/system-settings', async (req, reply) => {
    const user = await authenticateRequest(req, reply, { requireCsrf: false });
    if (!user) return;
    if (!isSuperadminWithPerm(user, 'system_settings.view')) {
      return sendError(
        reply,
        403,
        'FORBIDDEN',
        'Akses ditolak. Hanya Superadmin dengan izin system_settings.view yang dapat mengakses pengaturan sistem.'
      );
    }

    const config = await buildPublicAppConfig();

    // Check DB connectivity safely without exposing credentials
    let dbStatus: 'CONNECTED' | 'DEGRADED' = 'CONNECTED';
    try {
      await db.execute(sql`SELECT 1`);
    } catch {
      dbStatus = 'DEGRADED';
    }

    const [latestSetting] = await db
      .select({
        updatedAt: systemSettings.updatedAt,
        updatedByName: users.fullName,
      })
      .from(systemSettings)
      .leftJoin(users, eq(systemSettings.updatedBy, users.id))
      .orderBy(desc(systemSettings.updatedAt))
      .limit(1);

    const historyRows = await db
      .select({
        id: systemSettingsHistory.id,
        settingGroup: systemSettingsHistory.settingGroup,
        settingKey: systemSettingsHistory.settingKey,
        previousValue: systemSettingsHistory.previousValue,
        newValue: systemSettingsHistory.newValue,
        changedAt: systemSettingsHistory.changedAt,
        changedByName: users.fullName,
      })
      .from(systemSettingsHistory)
      .leftJoin(users, eq(systemSettingsHistory.changedBy, users.id))
      .orderBy(desc(systemSettingsHistory.changedAt))
      .limit(25);

    const hostHeader = req.headers.host || 'localhost:3000';
    const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http';

    return sendSuccess(reply, {
      config,
      presets: ACADEMIC_THEME_PRESETS,
      systemInfo: {
        applicationName: config.identity.applicationName,
        applicationBrand: config.identity.applicationBrand,
        applicationVersion: process.env.npm_package_version || '2.0.0',
        environment: process.env.NODE_ENV || 'development',
        databaseStatus: dbStatus,
        applicationUrl: config.seo.canonicalBaseUrl || `${protocol}://${hostHeader}`,
        lastUpdatedAt: latestSetting?.updatedAt || null,
        lastUpdatedBy: latestSetting?.updatedByName || 'System Seed',
      },
      history: historyRows,
    });
  });

  // 5. PUT /api/v1/admin/system-settings/identity
  fastify.put('/api/v1/admin/system-settings/identity', async (req, reply) => {
    const user = await authenticateRequest(req, reply);
    if (!user) return;
    if (!isSuperadminWithPerm(user, 'system_settings.manage_identity')) {
      return sendError(
        reply,
        403,
        'FORBIDDEN',
        'Hanya Superadmin dengan izin system_settings.manage_identity yang dapat mengubah identitas institusi.'
      );
    }

    const parsed = identitySchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(
        reply,
        400,
        'VALIDATION_ERROR',
        'Data identitas institusi tidak valid.',
        parsed.error.issues
      );
    }

    const d = parsed.data;
    await db.transaction(async (tx) => {
      await upsertSettingKeys({
        tx,
        group: 'identity',
        userId: user.id,
        entries: [
          { key: 'institution_name', value: d.institutionName },
          { key: 'institution_short_name', value: d.institutionShortName },
          { key: 'institution_email', value: d.institutionEmail },
          { key: 'institution_website', value: d.institutionWebsite, valueType: 'url' },
          { key: 'institution_address', value: d.institutionAddress },
          { key: 'institution_phone', value: d.institutionPhone },
          { key: 'institution_description', value: d.institutionDescription },
          { key: 'application_name', value: d.applicationName },
          { key: 'application_brand', value: 'EduCoreLMS' },
          { key: 'application_tagline', value: d.applicationTagline },
          { key: 'copyright_text', value: d.copyrightText },
        ],
      });
    });

    await recordAuditLog({
      actorId: user.id,
      action: 'SYSTEM_SETTINGS_IDENTITY_UPDATED',
      entityType: 'system_settings',
      entityId: 'identity',
      ipAddress: req.ip,
      metadata: {
        institutionName: d.institutionName,
        applicationBrand: d.applicationBrand,
      },
    });

    invalidateAppConfigCache();
    const updated = await buildPublicAppConfig();
    return sendSuccess(reply, updated);
  });

  // 6. PUT /api/v1/admin/system-settings/branding
  fastify.put('/api/v1/admin/system-settings/branding', async (req, reply) => {
    const user = await authenticateRequest(req, reply);
    if (!user) return;
    if (!isSuperadminWithPerm(user, 'system_settings.manage_branding')) {
      return sendError(
        reply,
        403,
        'FORBIDDEN',
        'Hanya Superadmin dengan izin system_settings.manage_branding yang dapat mengubah branding.'
      );
    }

    const parsed = brandingSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(
        reply,
        400,
        'VALIDATION_ERROR',
        'Konfigurasi branding tidak valid.',
        parsed.error.issues
      );
    }

    const d = parsed.data;
    const entries: Array<{ key: string; value: string; valueType?: string }> = [];
    if (d.institutionLogoUrl !== undefined) {
      entries.push({ key: 'institution_logo_url', value: d.institutionLogoUrl, valueType: 'url' });
      if (!d.institutionLogoUrl) entries.push({ key: 'institution_logo_variants', value: '{}', valueType: 'json' });
    }
    if (d.applicationLogoUrl !== undefined) {
      entries.push({ key: 'application_logo_url', value: d.applicationLogoUrl, valueType: 'url' });
      if (!d.applicationLogoUrl) entries.push({ key: 'application_logo_variants', value: '{}', valueType: 'json' });
    }
    if (d.loginLogoUrl !== undefined) {
      entries.push({ key: 'login_logo_url', value: d.loginLogoUrl, valueType: 'url' });
      if (!d.loginLogoUrl) entries.push({ key: 'login_logo_variants', value: '{}', valueType: 'json' });
    }
    if (d.faviconIcoUrl !== undefined) {
      entries.push({ key: 'favicon_ico_url', value: d.faviconIcoUrl, valueType: 'url' });
    }
    if (d.faviconPngUrl !== undefined) {
      entries.push({ key: 'favicon_png_url', value: d.faviconPngUrl, valueType: 'url' });
    }
    if (d.faviconSvgUrl !== undefined) {
      entries.push({ key: 'favicon_svg_url', value: d.faviconSvgUrl, valueType: 'url' });
    }
    if (d.appleTouchIconUrl !== undefined) {
      entries.push({ key: 'apple_touch_icon_url', value: d.appleTouchIconUrl, valueType: 'url' });
    }
    if (d.maxLogoSizeKb !== undefined) {
      entries.push({ key: 'max_logo_size_kb', value: String(d.maxLogoSizeKb), valueType: 'number' });
    }

    await db.transaction(async (tx) => {
      await upsertSettingKeys({
        tx,
        group: 'branding',
        userId: user.id,
        entries,
      });
    });

    await recordAuditLog({
      actorId: user.id,
      action: 'SYSTEM_SETTINGS_BRANDING_UPDATED',
      entityType: 'system_settings',
      entityId: 'branding',
      ipAddress: req.ip,
      metadata: { updatedKeys: entries.map((e) => e.key) },
    });

    invalidateAppConfigCache();
    const updated = await buildPublicAppConfig();
    return sendSuccess(reply, updated);
  });

  // 7. POST /api/v1/admin/system-settings/branding/upload
  fastify.post('/api/v1/admin/system-settings/branding/upload', async (req, reply) => {
    const user = await authenticateRequest(req, reply);
    if (!user) return;
    if (
      !isSuperadminWithPerm(user, 'system_settings.manage_branding') &&
      !isSuperadminWithPerm(user, 'system_settings.manage_seo')
    ) {
      return sendError(
        reply,
        403,
        'FORBIDDEN',
        'Hanya Superadmin yang dapat mengunggah aset branding.'
      );
    }

    const query = (req.query || {}) as { assetKind?: string };
    const assetKind = query.assetKind as BrandingAssetKind;
    const validKinds: BrandingAssetKind[] = [
      'institutionLogo',
      'applicationLogo',
      'loginLogo',
      'faviconIco',
      'faviconPng',
      'faviconSvg',
      'appleTouchIcon',
      'ogImage',
    ];
    if (!assetKind || !validKinds.includes(assetKind)) {
      return sendError(
        reply,
        400,
        'INVALID_ASSET_KIND',
        'Jenis aset branding tidak valid.'
      );
    }

    const filePart = await req.file();
    if (!filePart) {
      return sendError(reply, 400, 'NO_FILE', 'Berkas gambar tidak ditemukan.');
    }

    const currentConfig = await buildPublicAppConfig();
    const maxBytes = (currentConfig.branding.maxLogoSizeKb || 2048) * 1024;
    const buffer = await filePart.toBuffer();

    try {
      const processed = await processBrandingUpload({
        assetKind,
        buffer,
        filename: filePart.filename,
        maxBytes,
      });

      const keyMap: Record<BrandingAssetKind, { group: string; urlKey: string; variantsKey?: string }> = {
        institutionLogo: { group: 'branding', urlKey: 'institution_logo_url', variantsKey: 'institution_logo_variants' },
        applicationLogo: { group: 'branding', urlKey: 'application_logo_url', variantsKey: 'application_logo_variants' },
        loginLogo: { group: 'branding', urlKey: 'login_logo_url', variantsKey: 'login_logo_variants' },
        faviconIco: { group: 'favicon', urlKey: 'favicon_ico_url' },
        faviconPng: { group: 'favicon', urlKey: 'favicon_png_url' },
        faviconSvg: { group: 'favicon', urlKey: 'favicon_svg_url' },
        appleTouchIcon: { group: 'favicon', urlKey: 'apple_touch_icon_url' },
        ogImage: { group: 'seo', urlKey: 'og_image_url' },
      };

      const target = keyMap[assetKind];
      const entries: Array<{ key: string; value: string; valueType?: string }> = [
        { key: target.urlKey, value: processed.url, valueType: 'url' },
      ];
      if (target.variantsKey) {
        entries.push({
          key: target.variantsKey,
          value: JSON.stringify(processed.variants || {}),
          valueType: 'json',
        });
      }

      await db.transaction(async (tx) => {
        await upsertSettingKeys({
          tx,
          group: target.group,
          userId: user.id,
          entries,
        });
      });

      await recordAuditLog({
        actorId: user.id,
        action: 'SYSTEM_SETTINGS_ASSET_UPLOADED',
        entityType: 'system_settings',
        entityId: assetKind,
        ipAddress: req.ip,
        metadata: {
          assetKind,
          mimeType: processed.mimeType,
          fileSize: processed.fileSize,
          url: processed.url,
        },
      });

      invalidateAppConfigCache();
      const updated = await buildPublicAppConfig();
      return sendSuccess(reply, { asset: processed, config: updated });
    } catch (err: any) {
      return sendError(
        reply,
        400,
        'BRANDING_UPLOAD_FAILED',
        err?.message || 'Gagal memproses berkas branding.'
      );
    }
  });

  // 8. PUT /api/v1/admin/system-settings/seo
  fastify.put('/api/v1/admin/system-settings/seo', async (req, reply) => {
    const user = await authenticateRequest(req, reply);
    if (!user) return;
    if (!isSuperadminWithPerm(user, 'system_settings.manage_seo')) {
      return sendError(
        reply,
        403,
        'FORBIDDEN',
        'Hanya Superadmin dengan izin system_settings.manage_seo yang dapat mengubah konfigurasi SEO.'
      );
    }

    const parsed = seoSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(
        reply,
        400,
        'VALIDATION_ERROR',
        'Data SEO dan metadata tidak valid.',
        parsed.error.issues
      );
    }

    const d = parsed.data;
    await db.transaction(async (tx) => {
      await upsertSettingKeys({
        tx,
        group: 'seo',
        userId: user.id,
        entries: [
          { key: 'default_page_title', value: d.defaultPageTitle },
          { key: 'default_meta_description', value: d.defaultMetaDescription },
          { key: 'meta_keywords', value: d.metaKeywords },
          { key: 'canonical_base_url', value: d.canonicalBaseUrl, valueType: 'url' },
          { key: 'og_title', value: d.ogTitle },
          { key: 'og_description', value: d.ogDescription },
          { key: 'og_image_url', value: d.ogImageUrl, valueType: 'url' },
          { key: 'twitter_card_type', value: d.twitterCardType },
          { key: 'app_locale', value: d.appLocale },
          { key: 'default_language', value: d.defaultLanguage },
          { key: 'robots_policy', value: d.robotsPolicy },
        ],
      });
    });

    await recordAuditLog({
      actorId: user.id,
      action: 'SYSTEM_SETTINGS_SEO_UPDATED',
      entityType: 'system_settings',
      entityId: 'seo',
      ipAddress: req.ip,
      metadata: {
        defaultPageTitle: d.defaultPageTitle,
        robotsPolicy: d.robotsPolicy,
      },
    });

    invalidateAppConfigCache();
    const updated = await buildPublicAppConfig();
    return sendSuccess(reply, updated);
  });

  // 9. PUT /api/v1/admin/system-settings/theme (Fixed Preset Policy Enforced)
  fastify.put('/api/v1/admin/system-settings/theme', async (req, reply) => {
    const user = await authenticateRequest(req, reply);
    if (!user) return;
    if (!isSuperadminWithPerm(user, 'system_settings.manage_theme')) {
      return sendError(
        reply,
        403,
        'FORBIDDEN',
        'Hanya Superadmin dengan izin system_settings.manage_theme yang dapat mengubah tema aplikasi.'
      );
    }

    const body = (req.body || {}) as { presetKey?: unknown; customTokens?: unknown };
    if (body.customTokens !== undefined) {
      return sendError(
        reply,
        400,
        'CUSTOM_THEME_FORBIDDEN',
        'Kebijakan Fixed Preset aktif: tema kustom bebas tidak diizinkan.'
      );
    }

    const presetKey = typeof body.presetKey === 'string' ? body.presetKey : '';
    if (!isValidThemePresetKey(presetKey)) {
      return sendError(
        reply,
        400,
        'INVALID_THEME_PRESET',
        'Preset warna akademik tidak valid atau tidak terdaftar.'
      );
    }

    const preset = getThemePresetByKey(presetKey);
    const [previousActive] = await db
      .select()
      .from(applicationThemes)
      .where(eq(applicationThemes.isActive, true));

    await db.transaction(async (tx) => {
      await tx.update(applicationThemes).set({ isActive: false });
      await tx
        .update(applicationThemes)
        .set({
          isActive: true,
          updatedBy: user.id,
          updatedAt: new Date(),
        })
        .where(eq(applicationThemes.presetKey, presetKey));

      await tx.insert(systemSettingsHistory).values({
        settingGroup: 'theme',
        settingKey: 'active_theme_preset',
        previousValue: previousActive?.presetKey || DEFAULT_THEME_PRESET_KEY,
        newValue: presetKey,
        changedBy: user.id,
      });

      const [verRow] = await tx
        .select()
        .from(systemSettings)
        .where(eq(systemSettings.settingKey, 'config_version'));
      if (verRow) {
        const nextVer = String((Number(verRow.settingValue || '1') || 1) + 1);
        await tx
          .update(systemSettings)
          .set({ settingValue: nextVer, updatedBy: user.id, updatedAt: new Date() })
          .where(eq(systemSettings.settingKey, 'config_version'));
      }
    });

    await recordAuditLog({
      actorId: user.id,
      action: 'SYSTEM_SETTINGS_THEME_UPDATED',
      entityType: 'application_themes',
      entityId: presetKey,
      ipAddress: req.ip,
      metadata: {
        previousPreset: previousActive?.presetKey || null,
        newPreset: presetKey,
        presetName: preset.presetName,
      },
    });

    invalidateAppConfigCache();
    const updated = await buildPublicAppConfig();
    return sendSuccess(reply, updated);
  });

  // 10. POST /api/v1/admin/system-settings/theme/reset
  fastify.post('/api/v1/admin/system-settings/theme/reset', async (req, reply) => {
    const user = await authenticateRequest(req, reply);
    if (!user) return;
    if (!isSuperadminWithPerm(user, 'system_settings.manage_theme')) {
      return sendError(
        reply,
        403,
        'FORBIDDEN',
        'Hanya Superadmin dengan izin system_settings.manage_theme yang dapat mereset tema.'
      );
    }

    const [previousActive] = await db
      .select()
      .from(applicationThemes)
      .where(eq(applicationThemes.isActive, true));

    await db.transaction(async (tx) => {
      await tx.update(applicationThemes).set({ isActive: false });
      await tx
        .update(applicationThemes)
        .set({
          isActive: true,
          updatedBy: user.id,
          updatedAt: new Date(),
        })
        .where(eq(applicationThemes.presetKey, DEFAULT_THEME_PRESET_KEY));

      await tx.insert(systemSettingsHistory).values({
        settingGroup: 'theme',
        settingKey: 'active_theme_preset',
        previousValue: previousActive?.presetKey || DEFAULT_THEME_PRESET_KEY,
        newValue: DEFAULT_THEME_PRESET_KEY,
        changedBy: user.id,
      });
    });

    await recordAuditLog({
      actorId: user.id,
      action: 'SYSTEM_SETTINGS_THEME_RESET',
      entityType: 'application_themes',
      entityId: DEFAULT_THEME_PRESET_KEY,
      ipAddress: req.ip,
      metadata: {
        previousPreset: previousActive?.presetKey || null,
        resetTo: DEFAULT_THEME_PRESET_KEY,
      },
    });

    invalidateAppConfigCache();
    const updated = await buildPublicAppConfig();
    return sendSuccess(reply, updated);
  });
}
