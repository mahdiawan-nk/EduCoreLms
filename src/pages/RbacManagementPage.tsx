import React, { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ShieldCheck,
  ShieldAlert,
  Check,
  Lock,
  Search,
  ChevronDown,
  ChevronRight,
  Users,
  KeyRound,
  History,
  Eye,
  CheckSquare,
  Square,
} from 'lucide-react';
import { AppShell } from '../components/AppShell';
import { Button, Card, Input, Skeleton } from '../components/ui/primitives';
import { apiRequest } from '../lib/api';
import { formatDateTime } from '../lib/utils';
import { useAuth } from '../context/AuthContext';
import { hasPermission, isAuditorUser } from '../lib/authorization';
import { toast } from 'sonner';

interface RawRoleApiDto {
  id: string;
  code?: string;
  name?: string;
  description?: string;
  isSystem?: boolean;
  userCount?: number;
  accessScope?: string;
  status?: string;
  lastModified?: string;
  createdAt?: string;
  permissionIds?: string[];
}

interface RawPermissionApiDto {
  id: string;
  code?: string;
  name?: string;
  module?: string;
  description?: string;
  actionType?: string;
  riskLevel?: string;
  allowedContext?: string[];
  isProtected?: boolean;
  auditorAllowed?: boolean;
}

interface RawRbacHistoryApiDto {
  id: string;
  timestamp?: string;
  actorName?: string;
  actorEmail?: string | null;
  action?: string;
  roleCode?: string;
  permissionCode?: string;
  previousValue?: boolean;
  newValue?: boolean;
  reason?: string;
  result?: string;
}

interface RawRbacApiResponse {
  roles?: RawRoleApiDto[];
  permissions?: RawPermissionApiDto[];
  stats?: {
    totalRoles?: number;
    totalPermissions?: number;
    totalUsers?: number;
    recentChangesCount?: number;
  };
  history?: RawRbacHistoryApiDto[];
}

interface RoleDto {
  id: string;
  code: string;
  name: string;
  description: string;
  isSystem: boolean;
  userCount: number;
  accessScope: string;
  status: string;
  lastModified: string;
  permissionIds: string[];
}

interface PermissionDto {
  id: string;
  code: string;
  name: string;
  module: string;
  description: string;
  actionType: string;
  riskLevel: string;
  allowedContext: string[];
  isProtected: boolean;
  auditorAllowed: boolean;
}

interface RbacHistoryDto {
  id: string;
  timestamp: string;
  actorName: string;
  actorEmail: string | null;
  action: string;
  roleCode: string;
  permissionCode: string;
  previousValue: boolean;
  newValue: boolean;
  reason: string;
  result: string;
}

interface RbacResponse {
  roles: RoleDto[];
  permissions: PermissionDto[];
  stats: {
    totalRoles: number;
    totalPermissions: number;
    totalUsers: number;
    recentChangesCount: number;
  };
  history: RbacHistoryDto[];
}

function normalizeRole(raw: RawRoleApiDto): RoleDto {
  const code = String(raw.code || 'CUSTOM').toUpperCase();
  return {
    id: raw.id,
    code,
    name: raw.name || code,
    description: raw.description || 'Peran sistem Politeknik Kampar LMS.',
    isSystem: Boolean(raw.isSystem ?? true),
    userCount: typeof raw.userCount === 'number' ? raw.userCount : 0,
    accessScope:
      raw.accessScope ||
      (code === 'SUPERADMIN'
        ? 'GLOBAL'
        : code === 'AUDITOR'
          ? 'INSTITUTION (READ-ONLY)'
          : 'STANDARD'),
    status: raw.status || 'ACTIVE',
    lastModified: raw.lastModified || raw.createdAt || new Date().toISOString(),
    permissionIds: Array.isArray(raw.permissionIds) ? raw.permissionIds : [],
  };
}

function normalizePermission(raw: RawPermissionApiDto): PermissionDto {
  const code = String(raw.code || '');
  return {
    id: raw.id,
    code,
    name: raw.name || code || 'Izin Sistem',
    module: raw.module || 'Umum',
    description: raw.description || 'Tidak ada deskripsi kebijakan.',
    actionType: raw.actionType || 'MANAGE',
    riskLevel: raw.riskLevel || 'MEDIUM',
    allowedContext: Array.isArray(raw.allowedContext) ? raw.allowedContext : [],
    isProtected: Boolean(raw.isProtected),
    auditorAllowed: Boolean(raw.auditorAllowed),
  };
}

function normalizeHistoryItem(raw: RawRbacHistoryApiDto): RbacHistoryDto {
  return {
    id: raw.id,
    timestamp: raw.timestamp || new Date().toISOString(),
    actorName: raw.actorName || 'Sistem',
    actorEmail: raw.actorEmail ?? null,
    action: raw.action || 'RBAC_PERMISSION_UPDATED',
    roleCode: raw.roleCode || 'UNKNOWN',
    permissionCode: raw.permissionCode || '—',
    previousValue: Boolean(raw.previousValue),
    newValue: Boolean(raw.newValue),
    reason: raw.reason || 'Pembaruan matriks otorisasi RBAC',
    result: raw.result || 'SUCCESS',
  };
}

function normalizeRbacPayload(raw?: RawRbacApiResponse): RbacResponse {
  const roles = Array.isArray(raw?.roles) ? raw.roles.map(normalizeRole) : [];
  const permissions = Array.isArray(raw?.permissions)
    ? raw.permissions.map(normalizePermission)
    : [];
  const history = Array.isArray(raw?.history)
    ? raw.history.map(normalizeHistoryItem)
    : [];

  return {
    roles,
    permissions,
    stats: {
      totalRoles: raw?.stats?.totalRoles ?? roles.length,
      totalPermissions: raw?.stats?.totalPermissions ?? permissions.length,
      totalUsers: raw?.stats?.totalUsers ?? 0,
      recentChangesCount: raw?.stats?.recentChangesCount ?? history.length,
    },
    history,
  };
}

const CANONICAL_ORDER = ['SUPERADMIN', 'DOSEN', 'MAHASISWA', 'AUDITOR'];

export function RbacManagementPage() {
  const { user, refreshSession } = useAuth();
  const queryClient = useQueryClient();

  const canManageRbac = hasPermission(user, 'rbac:manage') && !isAuditorUser(user);
  const canViewRbac = hasPermission(user, 'rbac:view') || canManageRbac;

  const [selectedRoleCode, setSelectedRoleCode] = useState<string>('DOSEN');
  const [searchTerm, setSearchTerm] = useState('');
  const [moduleFilter, setModuleFilter] = useState('ALL');
  const [actionFilter, setActionFilter] = useState('ALL');
  const [collapsedModules, setCollapsedModules] = useState<Record<string, boolean>>({});
  const [historySearch, setHistorySearch] = useState('');
  const [historyPage, setHistoryPage] = useState(1);
  const historyPageSize = 8;

  const rbacQuery = useQuery({
    queryKey: ['admin-rbac'],
    queryFn: async () => {
      const res = await apiRequest<RawRbacApiResponse>('/rbac/roles');
      return normalizeRbacPayload(res.data);
    },
    enabled: canViewRbac,
  });

  const togglePermissionMutation = useMutation({
    mutationFn: (payload: {
      roleId: string;
      permissionId: string;
      enabled: boolean;
    }) =>
      apiRequest('/rbac/roles/permissions', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin-rbac'] });
      await refreshSession();
      toast.success('Izin RBAC berhasil diperbarui.');
    },
    onError: (err: any) => {
      toast.error(err?.message || 'Gagal memperbarui izin RBAC.');
    },
  });

  const bulkPermissionMutation = useMutation({
    mutationFn: (payload: {
      roleId: string;
      permissionIds: string[];
      enabled: boolean;
    }) =>
      apiRequest('/rbac/roles/permissions/bulk', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin-rbac'] });
      await refreshSession();
      toast.success('Pembaruan izin modul berhasil disimpan.');
    },
    onError: (err: any) => {
      toast.error(err?.message || 'Gagal memperbarui izin modul.');
    },
  });

  const data = rbacQuery.data;
  const roles = useMemo(() => {
    const raw = data?.roles || [];
    return [...raw].sort((a, b) => {
      const idxA = CANONICAL_ORDER.indexOf(a.code.toUpperCase());
      const idxB = CANONICAL_ORDER.indexOf(b.code.toUpperCase());
      return (idxA === -1 ? 99 : idxA) - (idxB === -1 ? 99 : idxB);
    });
  }, [data?.roles]);

  const permissions = useMemo(() => data?.permissions || [], [data?.permissions]);
  const stats = data?.stats;
  const history = useMemo(() => data?.history || [], [data?.history]);

  const activeRole = useMemo(
    () =>
      roles.find((r) => r.code.toUpperCase() === selectedRoleCode) ||
      roles[0] ||
      null,
    [roles, selectedRoleCode]
  );

  const modules = useMemo(
    () => Array.from(new Set(permissions.map((p) => p.module))),
    [permissions]
  );

  const actions = useMemo(
    () => Array.from(new Set(permissions.map((p) => p.actionType))),
    [permissions]
  );

  const filteredPermissions = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return permissions.filter((p) => {
      if (moduleFilter !== 'ALL' && p.module !== moduleFilter) return false;
      if (actionFilter !== 'ALL' && p.actionType !== actionFilter) return false;
      if (!q) return true;
      return (
        p.code.toLowerCase().includes(q) ||
        p.name.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        p.module.toLowerCase().includes(q)
      );
    });
  }, [permissions, moduleFilter, actionFilter, searchTerm]);

  const groupedPermissions = useMemo(() => {
    const map = new Map<string, PermissionDto[]>();
    for (const p of filteredPermissions) {
      const list = map.get(p.module) || [];
      list.push(p);
      map.set(p.module, list);
    }
    return Array.from(map.entries());
  }, [filteredPermissions]);

  const filteredHistory = useMemo(() => {
    const q = historySearch.trim().toLowerCase();
    if (!q) return history;
    return history.filter(
      (h) =>
        h.actorName.toLowerCase().includes(q) ||
        h.roleCode.toLowerCase().includes(q) ||
        h.permissionCode.toLowerCase().includes(q) ||
        h.reason.toLowerCase().includes(q)
    );
  }, [history, historySearch]);

  const totalHistoryPages = Math.max(
    1,
    Math.ceil(filteredHistory.length / historyPageSize)
  );
  const pagedHistory = filteredHistory.slice(
    (historyPage - 1) * historyPageSize,
    historyPage * historyPageSize
  );

  if (!canViewRbac) {
    return (
      <AppShell breadcrumb="Akses Ditolak">
        <div className="max-w-xl mx-auto py-12 px-4 text-center">
          <ShieldAlert className="w-12 h-12 text-amber-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-[#172033]">Akses Dibatasi</h2>
          <p className="text-sm text-[#64748B] mt-2">
            Anda tidak memiliki izin untuk melihat Academic Access Control Center (RBAC).
          </p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell breadcrumb="Sistem & Keamanan / Academic Access Control Center">
      <div className="space-y-6">
        {/* Header */}
        <div className="rounded-2xl border border-[#E2E8F0] bg-white p-5 sm:p-6 shadow-xs">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-md bg-[#14213D] px-2.5 py-0.5 text-[11px] font-semibold text-white">
                  <ShieldCheck className="h-3.5 w-3.5 text-blue-300" />
                  Academic Access Control Center
                </span>
                {!canManageRbac && (
                  <span className="inline-flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
                    <Eye className="h-3 w-3" />
                    Mode Hanya-Baca (Read-Only)
                  </span>
                )}
              </div>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#172033]">
                Manajemen Peran, Izin & Kebijakan Akses (RBAC)
              </h1>
              <p className="text-xs text-[#64748B] max-w-3xl leading-relaxed">
                Otorisasi terpusat berbasis Deny-by-Default dan kontrol kontekstual kepemilikan sumber daya. Izin esensial Superadmin dilindungi sistem, dan peran Auditor bersifat hanya-baca secara permanen.
              </p>
            </div>
          </div>
        </div>

        {/* A. RBAC Overview Statistics */}
        {rbacQuery.isLoading ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-24 rounded-xl" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Card className="p-4 border-[#E2E8F0] bg-white">
              <div className="flex items-center justify-between text-[#64748B]">
                <span className="text-xs font-semibold">Total Peran</span>
                <ShieldCheck className="h-4 w-4 text-[#14213D]" />
              </div>
              <p className="mt-2 font-mono text-2xl font-bold text-[#172033] tabular-nums">
                {stats?.totalRoles ?? roles.length}
              </p>
              <p className="mt-0.5 text-[11px] text-[#64748B]">Peran kanonik aktif</p>
            </Card>

            <Card className="p-4 border-[#E2E8F0] bg-white">
              <div className="flex items-center justify-between text-[#64748B]">
                <span className="text-xs font-semibold">Registri Izin</span>
                <KeyRound className="h-4 w-4 text-[#2563EB]" />
              </div>
              <p className="mt-2 font-mono text-2xl font-bold text-[#172033] tabular-nums">
                {stats?.totalPermissions ?? permissions.length}
              </p>
              <p className="mt-0.5 text-[11px] text-[#64748B]">Kebijakan terverifikasi</p>
            </Card>

            <Card className="p-4 border-[#E2E8F0] bg-white">
              <div className="flex items-center justify-between text-[#64748B]">
                <span className="text-xs font-semibold">Total Pengguna</span>
                <Users className="h-4 w-4 text-emerald-600" />
              </div>
              <p className="mt-2 font-mono text-2xl font-bold text-[#172033] tabular-nums">
                {stats?.totalUsers ?? 0}
              </p>
              <p className="mt-0.5 text-[11px] text-[#64748B]">Terikat peran PostgreSQL</p>
            </Card>

            <Card className="p-4 border-[#E2E8F0] bg-white">
              <div className="flex items-center justify-between text-[#64748B]">
                <span className="text-xs font-semibold">Riwayat Perubahan</span>
                <History className="h-4 w-4 text-amber-600" />
              </div>
              <p className="mt-2 font-mono text-2xl font-bold text-[#172033] tabular-nums">
                {stats?.recentChangesCount ?? history.length}
              </p>
              <p className="mt-0.5 text-[11px] text-[#64748B]">Tercatat di log audit</p>
            </Card>
          </div>
        )}

        {/* B. Role Management Cards */}
        <div>
          <h2 className="text-xs font-bold uppercase tracking-wider text-[#64748B] mb-3">
            Peran Kanonik Institusi
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3.5">
            {roles.map((role) => {
              const isSelected = activeRole?.id === role.id;
              const isAuditorRole = role.code.toUpperCase() === 'AUDITOR';
              const isSuperadminRole = role.code.toUpperCase() === 'SUPERADMIN';
              return (
                <button
                  key={role.id}
                  type="button"
                  onClick={() => setSelectedRoleCode(role.code.toUpperCase())}
                  className={`text-left rounded-xl border p-4 transition-all cursor-pointer ${
                    isSelected
                      ? 'border-[#2563EB] bg-blue-50/40 ring-1 ring-[#2563EB]'
                      : 'border-[#E2E8F0] bg-white hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-[#14213D] text-white">
                      {role.code}
                    </span>
                    <span
                      className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                        isAuditorRole
                          ? 'bg-amber-50 text-amber-800 border border-amber-200'
                          : isSuperadminRole
                            ? 'bg-blue-50 text-[#2563EB] border border-blue-200'
                            : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      }`}
                    >
                      {isAuditorRole ? 'READ-ONLY' : role.status}
                    </span>
                  </div>
                  <p className="mt-2.5 text-sm font-bold text-[#172033]">{role.name}</p>
                  <p className="mt-1 text-xs text-[#64748B] line-clamp-2 leading-relaxed">
                    {role.description}
                  </p>
                  <div className="mt-3 pt-3 border-t border-[#E2E8F0] grid grid-cols-2 gap-2 text-[11px]">
                    <div>
                      <span className="text-[#64748B] block">Pengguna</span>
                      <strong className="font-mono text-[#172033] tabular-nums">
                        {role.userCount}
                      </strong>
                    </div>
                    <div>
                      <span className="text-[#64748B] block">Izin Aktif</span>
                      <strong className="font-mono text-[#172033] tabular-nums">
                        {role.permissionIds.length}
                      </strong>
                    </div>
                    <div className="col-span-2 flex items-center justify-between text-[#64748B] pt-1">
                      <span>Scope: {role.accessScope}</span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* C. Permission Management Workspace */}
        <Card className="border-[#E2E8F0] bg-white overflow-hidden">
          {/* Role Tabs (Desktop/Tablet) & Selector (Mobile) */}
          <div className="border-b border-[#E2E8F0] bg-[#F7F9FC]/70 px-4 sm:px-6 pt-3">
            <div className="hidden sm:flex items-center gap-1 overflow-x-auto">
              {roles.map((role) => {
                const active = activeRole?.id === role.id;
                return (
                  <button
                    key={role.id}
                    type="button"
                    onClick={() => setSelectedRoleCode(role.code.toUpperCase())}
                    className={`px-4 py-2.5 text-xs font-bold border-b-2 transition-colors whitespace-nowrap cursor-pointer ${
                      active
                        ? 'border-[#2563EB] text-[#14213D] bg-white rounded-t-lg'
                        : 'border-transparent text-[#64748B] hover:text-[#172033]'
                    }`}
                  >
                    {role.code} ({role.permissionIds.length})
                  </button>
                );
              })}
            </div>
            <div className="sm:hidden pb-3">
              <label className="block text-[11px] font-semibold text-[#64748B] mb-1">
                Pilih Peran
              </label>
              <select
                value={activeRole?.code.toUpperCase() || ''}
                onChange={(e) => setSelectedRoleCode(e.target.value)}
                className="w-full h-9 rounded-lg border border-[#E2E8F0] bg-white px-3 text-xs font-semibold text-[#172033]"
              >
                {roles.map((r) => (
                  <option key={r.id} value={r.code.toUpperCase()}>
                    {r.code} — {r.name} ({r.permissionIds.length} izin)
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Filters Bar */}
          <div className="p-4 sm:p-6 border-b border-[#E2E8F0] flex flex-col md:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="h-3.5 w-3.5 text-[#64748B] absolute left-3 top-2.5" />
              <Input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Cari kode izin, nama, atau deskripsi..."
                className="pl-8 h-9 text-xs"
              />
            </div>
            <div className="grid grid-cols-2 sm:flex gap-2">
              <select
                value={moduleFilter}
                onChange={(e) => setModuleFilter(e.target.value)}
                className="h-9 rounded-lg border border-[#E2E8F0] bg-white px-3 text-xs font-medium text-[#172033]"
              >
                <option value="ALL">Semua Modul</option>
                {modules.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
              <select
                value={actionFilter}
                onChange={(e) => setActionFilter(e.target.value)}
                className="h-9 rounded-lg border border-[#E2E8F0] bg-white px-3 text-xs font-medium text-[#172033]"
              >
                <option value="ALL">Semua Aksi</option>
                {actions.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Role Policy Callout */}
          {activeRole && (
            <div className="px-4 sm:px-6 pt-4">
              {activeRole.code.toUpperCase() === 'SUPERADMIN' && (
                <div className="flex items-center gap-2.5 rounded-xl border border-blue-200 bg-blue-50/70 px-4 py-3 text-xs text-[#14213D]">
                  <Lock className="h-4 w-4 text-[#2563EB] shrink-0" />
                  <span>
                    Izin <strong>SUPERADMIN</strong> dilindungi sistem dan tidak dapat dinonaktifkan untuk mencegah penguncian akses administratif.
                  </span>
                </div>
              )}
              {activeRole.code.toUpperCase() === 'AUDITOR' && (
                <div className="flex items-center gap-2.5 rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-3 text-xs text-amber-900">
                  <Eye className="h-4 w-4 text-amber-600 shrink-0" />
                  <span>
                    Peran <strong>AUDITOR</strong> dibatasi pada izin baca (<code>VIEW</code>). Semua izin mutasi dan ekspor dikunci secara permanen oleh backend.
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Grouped Permission Modules */}
          <div className="p-4 sm:p-6 space-y-4">
            {groupedPermissions.length === 0 ? (
              <p className="text-xs text-[#64748B] text-center py-8">
                Tidak ada izin yang cocok dengan filter pencarian.
              </p>
            ) : (
              groupedPermissions.map(([moduleName, perms]) => {
                const isCollapsed = collapsedModules[moduleName] ?? false;
                const rolePermSet = new Set(activeRole?.permissionIds || []);
                const enabledInModule = perms.filter((p) => rolePermSet.has(p.id)).length;
                const isSuperadminRole = activeRole?.code.toUpperCase() === 'SUPERADMIN';
                const isAuditorRole = activeRole?.code.toUpperCase() === 'AUDITOR';

                const eligibleForBulk = perms.filter((p) =>
                  isAuditorRole ? p.auditorAllowed : true
                );
                const allEligibleEnabled =
                  eligibleForBulk.length > 0 &&
                  eligibleForBulk.every((p) => rolePermSet.has(p.id));

                return (
                  <div
                    key={moduleName}
                    className="rounded-xl border border-[#E2E8F0] overflow-hidden"
                  >
                    <div className="bg-[#F7F9FC] px-4 py-3 flex flex-wrap items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          setCollapsedModules((prev) => ({
                            ...prev,
                            [moduleName]: !isCollapsed,
                          }))
                        }
                        className="flex items-center gap-2 text-left cursor-pointer"
                      >
                        {isCollapsed ? (
                          <ChevronRight className="h-4 w-4 text-[#64748B]" />
                        ) : (
                          <ChevronDown className="h-4 w-4 text-[#64748B]" />
                        )}
                        <span className="text-xs font-bold text-[#172033]">
                          {moduleName}
                        </span>
                        <span className="font-mono text-[11px] text-[#64748B]">
                          ({enabledInModule}/{perms.length})
                        </span>
                      </button>

                      {canManageRbac &&
                        activeRole &&
                        !isSuperadminRole &&
                        eligibleForBulk.length > 0 && (
                          <button
                            type="button"
                            disabled={bulkPermissionMutation.isPending}
                            onClick={() =>
                              bulkPermissionMutation.mutate({
                                roleId: activeRole.id,
                                permissionIds: eligibleForBulk.map((p) => p.id),
                                enabled: !allEligibleEnabled,
                              })
                            }
                            className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-[#2563EB] hover:underline cursor-pointer"
                          >
                            {allEligibleEnabled ? (
                              <>
                                <CheckSquare className="h-3.5 w-3.5" />
                                <span>Cabut Semua di Modul</span>
                              </>
                            ) : (
                              <>
                                <Square className="h-3.5 w-3.5" />
                                <span>Pilih Semua di Modul</span>
                              </>
                            )}
                          </button>
                        )}
                    </div>

                    {!isCollapsed && (
                      <div className="divide-y divide-[#E2E8F0] bg-white">
                        {perms.map((perm) => {
                          const hasPerm = rolePermSet.has(perm.id);
                          const lockedBySuperadmin = isSuperadminRole;
                          const lockedByAuditor = isAuditorRole && !perm.auditorAllowed;
                          const isDisabled =
                            !canManageRbac ||
                            lockedBySuperadmin ||
                            lockedByAuditor ||
                            togglePermissionMutation.isPending;

                          return (
                            <div
                              key={perm.id}
                              className="px-4 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-[#F7F9FC]/50"
                            >
                              <div className="min-w-0 space-y-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="text-xs font-bold text-[#172033]">
                                    {perm.name}
                                  </span>
                                  <code className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-[#F7F9FC] border border-[#E2E8F0] text-[#14213D]">
                                    {perm.code}
                                  </code>
                                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-blue-50 text-[#2563EB] border border-blue-200">
                                    {perm.actionType}
                                  </span>
                                  {perm.isProtected && (
                                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-slate-100 text-[#14213D]">
                                      <Lock className="h-2.5 w-2.5" />
                                      Dilindungi
                                    </span>
                                  )}
                                  {isAuditorRole && perm.auditorAllowed && (
                                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                                      Read-Only Eligible
                                    </span>
                                  )}
                                </div>
                                <p className="text-xs text-[#64748B]">{perm.description}</p>
                                <p className="text-[11px] text-[#64748B]">
                                  Konteks:{' '}
                                  <span className="font-mono text-[#172033]">
                                    {Array.isArray(perm.allowedContext) && perm.allowedContext.length > 0
                                      ? perm.allowedContext.join(', ')
                                      : 'Belum ditentukan'}
                                  </span>{' '}
                                  · Risiko:{' '}
                                  <span className="font-semibold">{perm.riskLevel}</span>
                                </p>
                              </div>

                              <div className="flex items-center gap-2 shrink-0">
                                <button
                                  type="button"
                                  disabled={isDisabled}
                                  onClick={() => {
                                    if (!activeRole) return;
                                    togglePermissionMutation.mutate({
                                      roleId: activeRole.id,
                                      permissionId: perm.id,
                                      enabled: !hasPerm,
                                    });
                                  }}
                                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors ${
                                    hasPerm
                                      ? 'border-[#2563EB] bg-[#2563EB] text-white'
                                      : 'border-[#E2E8F0] bg-white text-[#64748B] hover:border-slate-300'
                                  } ${
                                    isDisabled
                                      ? 'opacity-60 cursor-not-allowed'
                                      : 'cursor-pointer'
                                  }`}
                                  aria-label={`Toggle ${perm.code} untuk ${activeRole?.code}`}
                                >
                                  {hasPerm ? (
                                    <>
                                      <Check className="h-3.5 w-3.5" />
                                      <span>Aktif</span>
                                    </>
                                  ) : (
                                    <span>Nonaktif</span>
                                  )}
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </Card>

        {/* D. Permission Change History */}
        <Card className="p-5 sm:p-6 border-[#E2E8F0] bg-white space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-[#172033] flex items-center gap-2">
                <History className="h-4 w-4 text-[#2563EB]" />
                <span>Riwayat Perubahan Izin (Audit Trail)</span>
              </h2>
              <p className="text-xs text-[#64748B] mt-0.5">
                Rekaman perubahan otorisasi peran pada PostgreSQL.
              </p>
            </div>
            <div className="relative w-full sm:w-64">
              <Search className="h-3.5 w-3.5 text-[#64748B] absolute left-3 top-2.5" />
              <Input
                value={historySearch}
                onChange={(e) => {
                  setHistorySearch(e.target.value);
                  setHistoryPage(1);
                }}
                placeholder="Cari aktor, peran, izin..."
                className="pl-8 h-8 text-xs"
              />
            </div>
          </div>

          {pagedHistory.length === 0 ? (
            <p className="text-xs text-[#64748B] py-6 text-center">
              Belum ada riwayat perubahan izin yang tercatat.
            </p>
          ) : (
            <>
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-[#E2E8F0] bg-[#F7F9FC] text-[#64748B] font-semibold">
                      <th className="py-2.5 px-3">Waktu</th>
                      <th className="py-2.5 px-3">Aktor</th>
                      <th className="py-2.5 px-3">Peran</th>
                      <th className="py-2.5 px-3">Izin</th>
                      <th className="py-2.5 px-3">Perubahan</th>
                      <th className="py-2.5 px-3">Alasan</th>
                      <th className="py-2.5 px-3 text-right">Hasil</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E2E8F0]">
                    {pagedHistory.map((h) => (
                      <tr key={h.id} className="hover:bg-[#F7F9FC]/60">
                        <td className="py-2.5 px-3 font-mono text-[11px] text-[#64748B] whitespace-nowrap">
                          {formatDateTime(h.timestamp)}
                        </td>
                        <td className="py-2.5 px-3 font-medium text-[#172033]">
                          {h.actorName}
                        </td>
                        <td className="py-2.5 px-3 font-mono font-semibold text-[#14213D]">
                          {h.roleCode}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-[#172033] max-w-[220px] truncate">
                          {h.permissionCode}
                        </td>
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          <span className="text-[#64748B]">
                            {h.previousValue ? 'Aktif' : 'Nonaktif'}
                          </span>
                          {' → '}
                          <strong className={h.newValue ? 'text-emerald-700' : 'text-red-700'}>
                            {h.newValue ? 'Aktif' : 'Nonaktif'}
                          </strong>
                        </td>
                        <td className="py-2.5 px-3 text-[#64748B] max-w-[200px] truncate">
                          {h.reason}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-semibold text-emerald-700">
                          {h.result}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="md:hidden space-y-2.5">
                {pagedHistory.map((h) => (
                  <div
                    key={h.id}
                    className="rounded-xl border border-[#E2E8F0] bg-[#F7F9FC] p-3 text-xs space-y-1.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono font-bold text-[#14213D]">{h.roleCode}</span>
                      <span className="font-mono text-[10px] text-[#64748B]">
                        {formatDateTime(h.timestamp)}
                      </span>
                    </div>
                    <p className="font-mono text-[11px] text-[#172033] break-all">
                      {h.permissionCode}
                    </p>
                    <p className="text-[#64748B]">
                      {h.actorName} · {h.previousValue ? 'Aktif' : 'Nonaktif'} →{' '}
                      <strong>{h.newValue ? 'Aktif' : 'Nonaktif'}</strong>
                    </p>
                  </div>
                ))}
              </div>

              {totalHistoryPages > 1 && (
                <div className="flex items-center justify-between pt-2 text-xs text-[#64748B]">
                  <span>
                    Halaman {historyPage} dari {totalHistoryPages}
                  </span>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={historyPage <= 1}
                      onClick={() => setHistoryPage((p) => Math.max(1, p - 1))}
                    >
                      Sebelumnya
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={historyPage >= totalHistoryPages}
                      onClick={() =>
                        setHistoryPage((p) => Math.min(totalHistoryPages, p + 1))
                      }
                    >
                      Berikutnya
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </Card>
      </div>
    </AppShell>
  );
}
