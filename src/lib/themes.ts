export type AcademicThemePresetKey =
  | 'academic_modern'
  | 'academic_classic'
  | 'academic_teal'
  | 'academic_indigo'
  | 'academic_slate'
  | 'academic_minimal';

export interface ThemeTokens {
  sidebarBg: string;
  sidebarText: string;
  sidebarActiveBg: string;
  sidebarActiveText: string;
  topbarBg: string;
  topbarText: string;
  contentBg: string;
  surfaceBg: string;
  cardBg: string;
  borderColor: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  textPrimary: string;
  textSecondary: string;
  successColor: string;
  warningColor: string;
  dangerColor: string;
  focusRing: string;
}

export interface AcademicThemePreset {
  presetKey: AcademicThemePresetKey;
  presetName: string;
  description: string;
  badge: string;
  tokens: ThemeTokens;
}

export const DEFAULT_THEME_PRESET_KEY: AcademicThemePresetKey = 'academic_modern';

export const ACADEMIC_THEME_PRESETS: AcademicThemePreset[] = [
  {
    presetKey: 'academic_modern',
    presetName: 'Academic Modern',
    description: 'Desain akademik kontemporer dengan sidebar navy gelap, kontras tinggi, dan aksen biru modern.',
    badge: 'Default',
    tokens: {
      sidebarBg: '#0F172A',
      sidebarText: '#CBD5E1',
      sidebarActiveBg: '#1D4ED8',
      sidebarActiveText: '#FFFFFF',
      topbarBg: '#FFFFFF',
      topbarText: '#0F172A',
      contentBg: '#F7F9FC',
      surfaceBg: '#F1F5F9',
      cardBg: '#FFFFFF',
      borderColor: '#E2E8F0',
      primaryColor: '#1D4ED8',
      secondaryColor: '#334155',
      accentColor: '#D97706',
      textPrimary: '#0F172A',
      textSecondary: '#475569',
      successColor: '#15803D',
      warningColor: '#B45309',
      dangerColor: '#B91C1C',
      focusRing: 'rgba(29, 78, 216, 0.25)',
    },
  },
  {
    presetKey: 'academic_classic',
    presetName: 'Academic Classic',
    description: 'Palet institusional klasik Oxford Navy & Gold yang berwibawa untuk perguruan tinggi.',
    badge: 'Klasik',
    tokens: {
      sidebarBg: '#14213D',
      sidebarText: '#E2E8F0',
      sidebarActiveBg: '#FCA311',
      sidebarActiveText: '#0F172A',
      topbarBg: '#FFFFFF',
      topbarText: '#14213D',
      contentBg: '#F8FAFC',
      surfaceBg: '#F1F5F9',
      cardBg: '#FFFFFF',
      borderColor: '#CBD5E1',
      primaryColor: '#1E3A8A',
      secondaryColor: '#475569',
      accentColor: '#B45309',
      textPrimary: '#0F172A',
      textSecondary: '#475569',
      successColor: '#166534',
      warningColor: '#D97706',
      dangerColor: '#991B1B',
      focusRing: 'rgba(30, 58, 138, 0.25)',
    },
  },
  {
    presetKey: 'academic_teal',
    presetName: 'Academic Teal',
    description: 'Nuansa hijau-teal profesional yang tenang dan fokus untuk pembelajaran teknik dan sains.',
    badge: 'Vokasi',
    tokens: {
      sidebarBg: '#0B2E2E',
      sidebarText: '#CCFBF1',
      sidebarActiveBg: '#0D9488',
      sidebarActiveText: '#FFFFFF',
      topbarBg: '#FFFFFF',
      topbarText: '#0F172A',
      contentBg: '#F4F9F9',
      surfaceBg: '#E6F4F1',
      cardBg: '#FFFFFF',
      borderColor: '#CBE5E0',
      primaryColor: '#0F766E',
      secondaryColor: '#334155',
      accentColor: '#D97706',
      textPrimary: '#0F172A',
      textSecondary: '#475569',
      successColor: '#15803D',
      warningColor: '#B45309',
      dangerColor: '#DC2626',
      focusRing: 'rgba(15, 118, 110, 0.25)',
    },
  },
  {
    presetKey: 'academic_indigo',
    presetName: 'Academic Indigo',
    description: 'Kombinasi indigo akademik dan aksen biru elektrik untuk produktivitas riset dan evaluasi.',
    badge: 'Riset',
    tokens: {
      sidebarBg: '#1E1B4B',
      sidebarText: '#C7D2FE',
      sidebarActiveBg: '#4F46E5',
      sidebarActiveText: '#FFFFFF',
      topbarBg: '#FFFFFF',
      topbarText: '#1E1B4B',
      contentBg: '#F6F7FB',
      surfaceBg: '#EEF2FF',
      cardBg: '#FFFFFF',
      borderColor: '#E0E7FF',
      primaryColor: '#4338CA',
      secondaryColor: '#475569',
      accentColor: '#0284C7',
      textPrimary: '#0F172A',
      textSecondary: '#475569',
      successColor: '#15803D',
      warningColor: '#B45309',
      dangerColor: '#B91C1C',
      focusRing: 'rgba(67, 56, 202, 0.25)',
    },
  },
  {
    presetKey: 'academic_slate',
    presetName: 'Academic Slate',
    description: 'Abu-abu grafit netral yang ergonomis dan nyaman untuk penggunaan durasi panjang.',
    badge: 'Netral',
    tokens: {
      sidebarBg: '#1E293B',
      sidebarText: '#CBD5E1',
      sidebarActiveBg: '#334155',
      sidebarActiveText: '#FFFFFF',
      topbarBg: '#FFFFFF',
      topbarText: '#0F172A',
      contentBg: '#F8FAFC',
      surfaceBg: '#F1F5F9',
      cardBg: '#FFFFFF',
      borderColor: '#E2E8F0',
      primaryColor: '#2563EB',
      secondaryColor: '#475569',
      accentColor: '#0EA5E9',
      textPrimary: '#0F172A',
      textSecondary: '#475569',
      successColor: '#15803D',
      warningColor: '#B45309',
      dangerColor: '#B91C1C',
      focusRing: 'rgba(37, 99, 235, 0.25)',
    },
  },
  {
    presetKey: 'academic_minimal',
    presetName: 'Academic Minimal',
    description: 'Tampilan terang serba bersih dengan sidebar putih dan garis batas tipis yang presisi.',
    badge: 'Minimalis',
    tokens: {
      sidebarBg: '#FFFFFF',
      sidebarText: '#475569',
      sidebarActiveBg: '#0F172A',
      sidebarActiveText: '#FFFFFF',
      topbarBg: '#FFFFFF',
      topbarText: '#0F172A',
      contentBg: '#FAFAFA',
      surfaceBg: '#F4F4F5',
      cardBg: '#FFFFFF',
      borderColor: '#E4E4E7',
      primaryColor: '#18181B',
      secondaryColor: '#52525B',
      accentColor: '#2563EB',
      textPrimary: '#18181B',
      textSecondary: '#52525B',
      successColor: '#15803D',
      warningColor: '#B45309',
      dangerColor: '#DC2626',
      focusRing: 'rgba(24, 24, 27, 0.20)',
    },
  },
];

export const ALLOWED_THEME_PRESET_KEYS: AcademicThemePresetKey[] =
  ACADEMIC_THEME_PRESETS.map((p) => p.presetKey);

export function getThemePresetByKey(key?: string | null): AcademicThemePreset {
  return (
    ACADEMIC_THEME_PRESETS.find((p) => p.presetKey === key) ||
    ACADEMIC_THEME_PRESETS[0]
  );
}

export function isValidThemePresetKey(key: string): key is AcademicThemePresetKey {
  return ALLOWED_THEME_PRESET_KEYS.includes(key as AcademicThemePresetKey);
}

export function applyThemeTokensToRoot(tokens: ThemeTokens, root?: HTMLElement): void {
  const target = root || (typeof document !== 'undefined' ? document.documentElement : null);
  if (!target) return;

  target.style.setProperty('--theme-sidebar-bg', tokens.sidebarBg);
  target.style.setProperty('--theme-sidebar-text', tokens.sidebarText);
  target.style.setProperty('--theme-sidebar-active-bg', tokens.sidebarActiveBg);
  target.style.setProperty('--theme-sidebar-active-text', tokens.sidebarActiveText);
  target.style.setProperty('--theme-topbar-bg', tokens.topbarBg);
  target.style.setProperty('--theme-topbar-text', tokens.topbarText);
  target.style.setProperty('--theme-content-bg', tokens.contentBg);
  target.style.setProperty('--theme-surface-bg', tokens.surfaceBg);
  target.style.setProperty('--theme-card-bg', tokens.cardBg);
  target.style.setProperty('--theme-border', tokens.borderColor);
  target.style.setProperty('--theme-primary', tokens.primaryColor);
  target.style.setProperty('--theme-secondary', tokens.secondaryColor);
  target.style.setProperty('--theme-accent', tokens.accentColor);
  target.style.setProperty('--theme-text-primary', tokens.textPrimary);
  target.style.setProperty('--theme-text-secondary', tokens.textSecondary);
  target.style.setProperty('--theme-success', tokens.successColor);
  target.style.setProperty('--theme-warning', tokens.warningColor);
  target.style.setProperty('--theme-danger', tokens.dangerColor);
  target.style.setProperty('--theme-focus-ring', tokens.focusRing);

  // Semantic Global Branding & Layout Token Aliases
  target.style.setProperty('--brand-primary', tokens.primaryColor);
  target.style.setProperty('--brand-secondary', tokens.secondaryColor);
  target.style.setProperty('--sidebar-bg', tokens.sidebarBg);
  target.style.setProperty('--sidebar-text', tokens.sidebarText);
  target.style.setProperty('--sidebar-active-bg', tokens.sidebarActiveBg);
  target.style.setProperty('--sidebar-active-text', tokens.sidebarActiveText);
  target.style.setProperty('--topbar-bg', tokens.topbarBg);
  target.style.setProperty('--topbar-text', tokens.topbarText);
  target.style.setProperty('--content-bg', tokens.contentBg);
  target.style.setProperty('--surface-bg', tokens.surfaceBg);
  target.style.setProperty('--border-color', tokens.borderColor);
  target.style.setProperty('--primary-button-bg', tokens.primaryColor);
  target.style.setProperty('--primary-button-text', '#FFFFFF');
}
