import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { GraduationCap } from 'lucide-react';
import { useAppConfig } from '../../context/ThemeContext';

interface ApplicationBrandProps {
  variant?: 'sidebar' | 'topbar' | 'login';
  compact?: boolean;
  onClick?: () => void;
  linkTo?: string;
}

export function ApplicationBrand({
  variant = 'sidebar',
  compact = false,
  onClick,
  linkTo = '/',
}: ApplicationBrandProps) {
  const { config } = useAppConfig();
  const [imgFailed, setImgFailed] = useState(false);

  const logoSrc =
    variant === 'login'
      ? config.branding.loginLogoVariants?.md ||
        config.branding.loginLogoUrl ||
        config.branding.applicationLogoVariants?.sm ||
        config.branding.applicationLogoUrl ||
        config.branding.institutionLogoVariants?.sm ||
        config.branding.institutionLogoUrl
      : config.branding.applicationLogoVariants?.sm ||
        config.branding.applicationLogoUrl ||
        config.branding.institutionLogoVariants?.sm ||
        config.branding.institutionLogoUrl;

  useEffect(() => {
    setImgFailed(false);
  }, [logoSrc]);

  const brandName = 'EduCoreLMS';
  const institutionName = config.identity.institutionName || 'Politeknik Kampar';

  const isSidebar = variant === 'sidebar';
  const isTopbar = variant === 'topbar';
  const isLogin = variant === 'login';

  const renderLogo = () => {
    if (logoSrc && !imgFailed) {
      return (
        <div
          className={`flex items-center justify-center rounded-lg overflow-hidden shrink-0 ${
            isLogin ? 'h-9 w-auto max-w-[120px]' : 'h-8 w-8'
          } ${isSidebar ? 'bg-white/10 p-0.5' : 'bg-slate-100/70 p-0.5'}`}
        >
          <img
            src={logoSrc}
            alt={`${brandName} — ${institutionName}`}
            loading="lazy"
            onError={() => setImgFailed(true)}
            className="h-full w-full object-contain"
          />
        </div>
      );
    }

    return (
      <div
        className="flex h-8 w-8 items-center justify-center rounded-lg shrink-0"
        style={{
          backgroundColor: isSidebar
            ? 'var(--theme-sidebar-active-bg)'
            : 'var(--theme-primary)',
          color: isSidebar ? 'var(--theme-sidebar-active-text)' : '#FFFFFF',
        }}
      >
        <GraduationCap className="h-4 w-4" />
      </div>
    );
  };

  const content = (
    <div className="flex items-center gap-2.5 min-w-0 overflow-hidden">
      {renderLogo()}
      {!compact && (
        <div className="min-w-0 leading-tight">
          <p
            className={`font-bold tracking-tight truncate ${
              isLogin ? 'text-base sm:text-lg' : 'text-sm'
            }`}
            style={{
              color: isSidebar
                ? 'var(--theme-sidebar-active-text)'
                : isTopbar
                ? 'var(--theme-topbar-text)'
                : 'var(--theme-text-primary)',
            }}
          >
            {brandName}
          </p>
          <p
            className={`truncate ${
              isTopbar ? 'text-[10px]' : 'text-[11px]'
            } ${isSidebar ? 'opacity-75' : 'opacity-70'}`}
            style={{
              color: isSidebar
                ? 'var(--theme-sidebar-text)'
                : 'var(--theme-text-secondary)',
            }}
          >
            {institutionName}
          </p>
        </div>
      )}
    </div>
  );

  if (linkTo) {
    return (
      <Link
        to={linkTo}
        onClick={onClick}
        className="flex items-center min-w-0 overflow-hidden"
        title={`${brandName} — ${institutionName}`}
      >
        {content}
      </Link>
    );
  }

  return content;
}
