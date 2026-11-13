import React from 'react';
import { Link } from 'react-router-dom';
import {
  ChevronDown,
  ChevronRight,
  PanelLeftClose,
  PanelLeftOpen,
  X,
} from 'lucide-react';
import { useAppConfig } from '../../context/ThemeContext';
import { ApplicationBrand } from './ApplicationBrand';

export interface NavItem {
  label: string;
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  exact?: boolean;
  isAction?: boolean;
  badge?: string | number;
  visible?: boolean;
}

export interface NavGroup {
  id: string;
  label: string;
  items: NavItem[];
}

interface GlobalSidebarProps {
  groups: NavGroup[];
  isCompact: boolean;
  onToggleCompact: () => void;
  collapsedGroups: Record<string, boolean>;
  onToggleGroup: (groupId: string) => void;
  mobileMenuOpen: boolean;
  onCloseMobileMenu: () => void;
  isRouteActive: (item: NavItem) => boolean;
  onActionItem: (item: NavItem) => void;
}

export function GlobalSidebar({
  groups,
  isCompact,
  onToggleCompact,
  collapsedGroups,
  onToggleGroup,
  mobileMenuOpen,
  onCloseMobileMenu,
  isRouteActive,
  onActionItem,
}: GlobalSidebarProps) {
  const { config } = useAppConfig();
  const brandName = 'EduCoreLMS';
  const institutionName = config.identity.institutionName || 'Politeknik Kampar';

  const renderNavGroups = (compactMode: boolean, closeOnNav: boolean) => (
    <nav className="flex-1 px-2.5 py-4 space-y-4 overflow-y-auto">
      {groups.map((group) => {
        const isGroupCollapsed = !compactMode && !!collapsedGroups[group.id];
        return (
          <div key={group.id} className="space-y-1">
            {!compactMode && (
              <button
                type="button"
                onClick={() => onToggleGroup(group.id)}
                className="flex w-full items-center justify-between px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider opacity-65 hover:opacity-100 transition-opacity cursor-pointer"
                style={{ color: 'var(--theme-sidebar-text)' }}
              >
                <span className="truncate">{group.label}</span>
                {isGroupCollapsed ? (
                  <ChevronRight className="h-3 w-3 shrink-0" />
                ) : (
                  <ChevronDown className="h-3 w-3 shrink-0" />
                )}
              </button>
            )}

            {!isGroupCollapsed && (
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const active = isRouteActive(item);
                  const baseStyle: React.CSSProperties = active
                    ? {
                        backgroundColor: 'var(--theme-sidebar-active-bg)',
                        color: 'var(--theme-sidebar-active-text)',
                      }
                    : {
                        color: 'var(--theme-sidebar-text)',
                      };

                  const itemClass = `group relative flex items-center ${
                    compactMode ? 'justify-center px-2 py-2.5' : 'gap-2.5 px-3 py-2'
                  } rounded-lg text-[13px] font-medium transition-all duration-150 ${
                    active ? 'shadow-xs font-semibold' : 'hover:bg-white/10'
                  }`;

                  if (item.isAction) {
                    return (
                      <button
                        key={item.label}
                        type="button"
                        onClick={() => {
                          onActionItem(item);
                          if (closeOnNav) onCloseMobileMenu();
                        }}
                        title={compactMode ? item.label : undefined}
                        className={`${itemClass} w-full text-left cursor-pointer`}
                        style={baseStyle}
                      >
                        <Icon className="h-4 w-4 shrink-0" />
                        {!compactMode && <span className="truncate">{item.label}</span>}
                      </button>
                    );
                  }

                  return (
                    <Link
                      key={item.to + item.label}
                      to={item.to}
                      onClick={() => {
                        if (closeOnNav) onCloseMobileMenu();
                      }}
                      title={compactMode ? item.label : undefined}
                      className={itemClass}
                      style={baseStyle}
                    >
                      {active && !compactMode && (
                        <span
                          aria-hidden="true"
                          className="absolute left-0 top-1.5 bottom-1.5 w-1 rounded-r-full"
                          style={{ backgroundColor: 'var(--theme-accent)' }}
                        />
                      )}
                      <Icon className="h-4 w-4 shrink-0" />
                      {!compactMode && (
                        <span className="truncate flex-1">{item.label}</span>
                      )}
                      {!compactMode && item.badge !== undefined && (
                        <span className="rounded-full bg-white/15 px-1.5 py-0.5 text-[10px] font-semibold">
                          {item.badge}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );

  const sidebarWidthClass = isCompact ? 'lg:w-[72px]' : 'lg:w-[264px]';

  return (
    <>
      {/* Desktop Fixed Sidebar */}
      <aside
        className={`hidden lg:flex ${sidebarWidthClass} lg:flex-col lg:fixed lg:inset-y-0 border-r transition-all duration-200 z-40`}
        style={{
          backgroundColor: 'var(--theme-sidebar-bg)',
          color: 'var(--theme-sidebar-text)',
          borderColor: 'var(--theme-border)',
        }}
      >
        <div
          className="flex items-center justify-between px-3.5 h-16 border-b shrink-0"
          style={{ borderColor: 'rgba(148, 163, 184, 0.18)' }}
        >
          <ApplicationBrand variant="sidebar" compact={isCompact} />

          <button
            type="button"
            onClick={onToggleCompact}
            className="p-1.5 rounded-md opacity-75 hover:opacity-100 hover:bg-white/10 transition-colors shrink-0 cursor-pointer"
            title={isCompact ? 'Perluas Sidebar' : 'Ciutkan Sidebar'}
            aria-label="Toggle compact sidebar"
          >
            {isCompact ? (
              <PanelLeftOpen className="h-4 w-4" />
            ) : (
              <PanelLeftClose className="h-4 w-4" />
            )}
          </button>
        </div>

        {renderNavGroups(isCompact, false)}

        {!isCompact && (
          <div
            className="px-4 py-3 border-t text-[11px] opacity-65 truncate"
            style={{ borderColor: 'rgba(148, 163, 184, 0.18)' }}
          >
            {config.identity.copyrightText || `${brandName} · ${institutionName}`}
          </div>
        )}
      </aside>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-950/55 backdrop-blur-xs"
            onClick={onCloseMobileMenu}
          />
          <aside
            className="relative w-72 max-w-[84vw] h-full flex flex-col shadow-2xl z-10"
            style={{
              backgroundColor: 'var(--theme-sidebar-bg)',
              color: 'var(--theme-sidebar-text)',
            }}
          >
            <div
              className="flex items-center justify-between px-4 h-16 border-b shrink-0"
              style={{ borderColor: 'rgba(148, 163, 184, 0.18)' }}
            >
              <ApplicationBrand
                variant="sidebar"
                compact={false}
                onClick={onCloseMobileMenu}
              />
              <button
                type="button"
                onClick={onCloseMobileMenu}
                className="p-1.5 rounded-lg opacity-80 hover:opacity-100 hover:bg-white/10"
                aria-label="Tutup navigasi"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {renderNavGroups(false, true)}
          </aside>
        </div>
      )}
    </>
  );
}
