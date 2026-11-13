import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Search,
  Users,
  UserPlus,
  ShieldAlert,
  FileSpreadsheet,
  Download,
  ChevronDown,
  ChevronUp,
  Eye,
  Edit3,
  KeyRound,
  Power,
  CheckSquare,
  Square,
  RotateCcw,
  UserCheck,
  UserX,
  Clock,
  GraduationCap,
  BookOpen,
  Shield,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  UserRoundCheck,
} from 'lucide-react';
import { AppShell } from '../components/AppShell';
import { Button, Input, Card, ModalDialog, ConfirmDialog } from '../components/ui/primitives';
import { apiRequest } from '../lib/api';
import { formatDateTime } from '../lib/utils';
import { useAuth } from '../context/AuthContext';
import { hasPermission, canPerformMutations } from '../lib/authorization';
import { UserDetailModal } from '../components/users/UserDetailModal';
import { UserImportWizardModal } from '../components/users/UserImportWizardModal';
import { ResetPasswordModal } from '../components/users/ResetPasswordModal';
import { BulkResetPasswordModal } from '../components/users/BulkResetPasswordModal';
import {
  SwitchAccountModal,
  type SwitchAccountTarget,
} from '../components/users/SwitchAccountModal';
import { toast } from 'sonner';

interface UserRow {
  id: string;
  fullName: string;
  email: string;
  identityNumber: string | null;
  studyProgram: string;
  organizationalUnit: string | null;
  phone: string | null;
  academicTitle: string | null;
  nidn: string | null;
  nip: string | null;
  nim: string | null;
  academicStatus: string | null;
  admissionYear: number | null;
  semesterLevel: number | null;
  auditScope: string | null;
  roles: string[];
  isActive: boolean;
  accountStatus: string;
  mustResetPassword: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

interface UsersMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  stats: {
    totalUsers: number;
    activeUsers: number;
    inactiveUsers: number;
    pendingActivationUsers: number;
    superadminCount: number;
    dosenCount: number;
    mahasiswaCount: number;
    auditorCount: number;
  };
  filters: {
    studyPrograms: string[];
    organizationalUnits: string[];
  };
}

interface UserFormState {
  fullName: string;
  email: string;
  identityNumber: string;
  roleCode: string;
  accountStatus: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED' | 'PENDING_ACTIVATION';
  activationMethod: 'PASSWORD_INIT' | 'INVITATION';
  password: string;
  studyProgram: string;
  organizationalUnit: string;
  phone: string;
  academicTitle: string;
  nidn: string;
  nip: string;
  nim: string;
  academicStatus: string;
  admissionYear: string;
  semesterLevel: string;
  auditScope: string;
  reason: string;
}

const INITIAL_FORM_STATE: UserFormState = {
  fullName: '',
  email: '',
  identityNumber: '',
  roleCode: 'MAHASISWA',
  accountStatus: 'ACTIVE',
  activationMethod: 'PASSWORD_INIT',
  password: '',
  studyProgram: 'Teknik Informatika',
  organizationalUnit: '',
  phone: '',
  academicTitle: '',
  nidn: '',
  nip: '',
  nim: '',
  academicStatus: 'AKTIF',
  admissionYear: '',
  semesterLevel: '1',
  auditScope: '',
  reason: '',
};

const ROLE_BADGE_MAP: Record<string, string> = {
  SUPERADMIN: 'bg-rose-50 text-rose-700 border-rose-200',
  DOSEN: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  MAHASISWA: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  AUDITOR: 'bg-amber-50 text-amber-700 border-amber-200',
};

const STATUS_BADGE_MAP: Record<string, { label: string; className: string }> = {
  ACTIVE: { label: 'Aktif', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  INACTIVE: { label: 'Nonaktif', className: 'bg-slate-100 text-slate-600 border-slate-200' },
  SUSPENDED: { label: 'Ditangguhkan', className: 'bg-rose-50 text-rose-700 border-rose-200' },
  PENDING_ACTIVATION: {
    label: 'Menunggu Aktivasi',
    className: 'bg-amber-50 text-amber-700 border-amber-200',
  },
};

export function UserManagementPage() {
  const { user, impersonation, startImpersonation } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const canManageUsers = hasPermission(user, 'user:manage') && canPerformMutations(user);
  const isSuperadmin = Boolean(user?.roles?.includes('SUPERADMIN'));
  const canImpersonate =
    isSuperadmin && !impersonation?.isImpersonating && hasPermission(user, 'users.impersonate');
  const [switchTarget, setSwitchTarget] = useState<SwitchAccountTarget | null>(null);
  const [isSwitchingAccount, setIsSwitchingAccount] = useState(false);

  // Search & filter state
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [studyProgramFilter, setStudyProgramFilter] = useState('ALL');
  const [orgUnitFilter, setOrgUnitFilter] = useState('ALL');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);

  // Sorting & pagination
  const [sortBy, setSortBy] = useState<'fullName' | 'createdAt' | 'accountStatus'>('createdAt');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);

  // Selection & bulk actions
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkRoleCode, setBulkRoleCode] = useState('MAHASISWA');
  const [bulkConfirm, setBulkConfirm] = useState<{
    action: 'ACTIVATE' | 'DEACTIVATE' | 'ASSIGN_ROLE';
    title: string;
    description: string;
  } | null>(null);

  // Modals & menus
  const [templateMenuOpen, setTemplateMenuOpen] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [detailUserId, setDetailUserId] = useState<string | null>(null);

  // Create/Edit modal
  const [formModalMode, setFormModalMode] = useState<'create' | 'edit' | null>(null);
  const [editingUser, setEditingUser] = useState<UserRow | null>(null);
  const [formState, setFormState] = useState<UserFormState>(INITIAL_FORM_STATE);
  const [createdInvitationLink, setCreatedInvitationLink] = useState<string | null>(null);

  // Status toggle confirm
  const [statusTarget, setStatusTarget] = useState<{
    user: UserRow;
    nextStatus: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
  } | null>(null);

  // Password reset modal & bulk reset modal
  const [resetTarget, setResetTarget] = useState<UserRow | null>(null);
  const [bulkResetOpen, setBulkResetOpen] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const queryParams = new URLSearchParams({
    page: String(page),
    limit: String(limit),
    sortBy,
    sortDir,
  });
  if (debouncedSearch) queryParams.set('search', debouncedSearch);
  if (roleFilter !== 'ALL') queryParams.set('role', roleFilter);
  if (statusFilter !== 'ALL') queryParams.set('status', statusFilter);
  if (studyProgramFilter !== 'ALL') queryParams.set('studyProgram', studyProgramFilter);
  if (orgUnitFilter !== 'ALL') queryParams.set('organizationalUnit', orgUnitFilter);
  if (dateFrom) queryParams.set('dateFrom', dateFrom);
  if (dateTo) queryParams.set('dateTo', dateTo);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['users-admin', queryParams.toString()],
    queryFn: () => apiRequest<UserRow[]>(`/api/v1/users?${queryParams.toString()}`),
  });

  const users = data?.data || [];
  const meta = (data?.meta || null) as UsersMeta | null;
  const stats = meta?.stats;

  const invalidateUsers = () => {
    queryClient.invalidateQueries({ queryKey: ['users-admin'] });
  };

  const createUserMutation = useMutation({
    mutationFn: (payload: UserFormState) =>
      apiRequest<{ data: UserRow; invitationLink?: string | null }>('/api/v1/users', {
        method: 'POST',
        body: JSON.stringify({
          fullName: payload.fullName.trim(),
          email: payload.email.trim(),
          identityNumber: payload.identityNumber.trim() || undefined,
          roleCode: payload.roleCode,
          accountStatus: payload.accountStatus,
          activationMethod: payload.activationMethod,
          password: payload.activationMethod === 'PASSWORD_INIT' ? payload.password : undefined,
          studyProgram: payload.studyProgram.trim(),
          organizationalUnit: payload.organizationalUnit.trim() || undefined,
          phone: payload.phone.trim() || undefined,
          academicTitle: payload.academicTitle.trim() || undefined,
          nidn: payload.nidn.trim() || undefined,
          nip: payload.nip.trim() || undefined,
          nim: payload.nim.trim() || undefined,
          academicStatus: payload.academicStatus.trim() || undefined,
          admissionYear: payload.admissionYear ? Number(payload.admissionYear) : undefined,
          semesterLevel: payload.semesterLevel ? Number(payload.semesterLevel) : undefined,
          auditScope: payload.auditScope.trim() || undefined,
        }),
      }),
    onSuccess: (res) => {
      toast.success('Pengguna baru berhasil dibuat');
      invalidateUsers();
      const invLink = (res as any)?.invitationLink || (res?.data as any)?.invitationLink;
      if (invLink) {
        setCreatedInvitationLink(invLink);
      } else {
        setFormModalMode(null);
      }
    },
    onError: (err: any) => toast.error(err?.message || 'Gagal membuat pengguna'),
  });

  const editUserMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UserFormState }) =>
      apiRequest(`/api/v1/users/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          fullName: payload.fullName.trim(),
          email: payload.email.trim(),
          identityNumber: payload.identityNumber.trim() || null,
          roleCode: payload.roleCode,
          accountStatus: payload.accountStatus,
          studyProgram: payload.studyProgram.trim(),
          organizationalUnit: payload.organizationalUnit.trim() || null,
          phone: payload.phone.trim() || null,
          academicTitle: payload.academicTitle.trim() || null,
          nidn: payload.nidn.trim() || null,
          nip: payload.nip.trim() || null,
          nim: payload.nim.trim() || null,
          academicStatus: payload.academicStatus.trim() || null,
          admissionYear: payload.admissionYear ? Number(payload.admissionYear) : null,
          semesterLevel: payload.semesterLevel ? Number(payload.semesterLevel) : null,
          auditScope: payload.auditScope.trim() || null,
          reason: payload.reason.trim() || undefined,
        }),
      }),
    onSuccess: () => {
      toast.success('Data pengguna berhasil diperbarui');
      invalidateUsers();
      setFormModalMode(null);
      setEditingUser(null);
    },
    onError: (err: any) => toast.error(err?.message || 'Gagal memperbarui pengguna'),
  });

  const statusMutation = useMutation({
    mutationFn: ({
      userId,
      nextStatus,
    }: {
      userId: string;
      nextStatus: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
    }) =>
      apiRequest(`/api/v1/users/${userId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({
          accountStatus: nextStatus,
          isActive: nextStatus === 'ACTIVE',
        }),
      }),
    onSuccess: () => {
      toast.success('Status akun pengguna berhasil diperbarui');
      setStatusTarget(null);
      invalidateUsers();
    },
    onError: (err: any) => toast.error(err?.message || 'Gagal mengubah status akun'),
  });

  const bulkMutation = useMutation({
    mutationFn: (payload: {
      action: 'ACTIVATE' | 'DEACTIVATE' | 'ASSIGN_ROLE';
      userIds: string[];
      roleCode?: string;
    }) =>
      apiRequest<{ message: string }>('/api/v1/users/bulk', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    onSuccess: (res) => {
      const msg = (res as any)?.message || (res?.data as any)?.message;
      toast.success(msg || 'Aksi massal berhasil dijalankan');
      setSelectedIds([]);
      setBulkConfirm(null);
      invalidateUsers();
    },
    onError: (err: any) => toast.error(err?.message || 'Gagal menjalankan aksi massal'),
  });

  const openCreateModal = () => {
    setEditingUser(null);
    setCreatedInvitationLink(null);
    setFormState(INITIAL_FORM_STATE);
    setFormModalMode('create');
  };

  const openEditModal = (u: UserRow) => {
    setEditingUser(u);
    setCreatedInvitationLink(null);
    setFormState({
      fullName: u.fullName || '',
      email: u.email || '',
      identityNumber: u.identityNumber || '',
      roleCode: u.roles?.[0] || 'MAHASISWA',
      accountStatus:
        (u.accountStatus as UserFormState['accountStatus']) ||
        (u.isActive ? 'ACTIVE' : 'INACTIVE'),
      activationMethod: 'PASSWORD_INIT',
      password: '',
      studyProgram: u.studyProgram || 'Teknik Informatika',
      organizationalUnit: u.organizationalUnit || '',
      phone: u.phone || '',
      academicTitle: u.academicTitle || '',
      nidn: u.nidn || '',
      nip: u.nip || '',
      nim: u.nim || '',
      academicStatus: u.academicStatus || 'AKTIF',
      admissionYear: u.admissionYear ? String(u.admissionYear) : '',
      semesterLevel: u.semesterLevel ? String(u.semesterLevel) : '1',
      auditScope: u.auditScope || '',
      reason: '',
    });
    setFormModalMode('edit');
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formState.fullName.trim() || !formState.email.trim() || !formState.studyProgram.trim()) {
      toast.error('Nama lengkap, email, dan program studi wajib diisi');
      return;
    }
    if (
      formModalMode === 'create' &&
      formState.activationMethod === 'PASSWORD_INIT' &&
      formState.password.length < 8
    ) {
      toast.error('Password awal minimal 8 karakter');
      return;
    }
    if (formModalMode === 'create') {
      createUserMutation.mutate(formState);
    } else if (formModalMode === 'edit' && editingUser) {
      editUserMutation.mutate({ id: editingUser.id, payload: formState });
    }
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === users.length && users.length > 0) {
      setSelectedIds([]);
    } else {
      setSelectedIds(users.map((u) => u.id));
    }
  };

  const toggleSelectOne = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const toggleSort = (col: 'fullName' | 'createdAt' | 'accountStatus') => {
    if (sortBy === col) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(col);
      setSortDir('asc');
    }
    setPage(1);
  };

  const resetAllFilters = () => {
    setSearchInput('');
    setDebouncedSearch('');
    setRoleFilter('ALL');
    setStatusFilter('ALL');
    setStudyProgramFilter('ALL');
    setOrgUnitFilter('ALL');
    setDateFrom('');
    setDateTo('');
    setPage(1);
  };

  const downloadTemplate = (type: 'dosen-xlsx' | 'mahasiswa-xlsx' | 'general-xlsx' | 'general-csv') => {
    setTemplateMenuOpen(false);
    window.open(`/api/v1/users/import/templates/${type}`, '_blank', 'noopener,noreferrer');
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Tautan disalin ke clipboard');
  };

  return (
    <AppShell>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-700 text-xs font-medium mb-2">
              <Users className="w-3.5 h-3.5" />
              Academic Identity & User Administration Center
            </div>
            <h1 className="text-2xl font-bold text-slate-900">Manajemen Pengguna</h1>
            <p className="text-sm text-slate-500 mt-0.5">
              Pusat administrasi identitas akademik, peran RBAC, keamanan sesi, dan impor massal Politeknik Kampar.
            </p>
          </div>

          {canManageUsers && (
            <div className="flex flex-wrap items-center gap-2.5">
              <div className="relative">
                <Button
                  variant="outline"
                  onClick={() => setTemplateMenuOpen((v) => !v)}
                  className="gap-1.5"
                >
                  <Download className="w-4 h-4" />
                  Download Template
                  <ChevronDown className="w-3.5 h-3.5" />
                </Button>
                {templateMenuOpen && (
                  <div className="absolute right-0 mt-1.5 w-60 bg-white border border-slate-200 rounded-xl shadow-lg py-1.5 z-30">
                    <button
                      type="button"
                      onClick={() => downloadTemplate('dosen-xlsx')}
                      className="w-full text-left px-3.5 py-2 text-xs text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                    >
                      <FileSpreadsheet className="w-4 h-4 text-indigo-600" />
                      Template Dosen (.xlsx)
                    </button>
                    <button
                      type="button"
                      onClick={() => downloadTemplate('mahasiswa-xlsx')}
                      className="w-full text-left px-3.5 py-2 text-xs text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                    >
                      <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                      Template Mahasiswa (.xlsx)
                    </button>
                    <button
                      type="button"
                      onClick={() => downloadTemplate('general-xlsx')}
                      className="w-full text-left px-3.5 py-2 text-xs text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                    >
                      <FileSpreadsheet className="w-4 h-4 text-slate-600" />
                      Template Umum (.xlsx)
                    </button>
                    <button
                      type="button"
                      onClick={() => downloadTemplate('general-csv')}
                      className="w-full text-left px-3.5 py-2 text-xs text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                    >
                      <FileSpreadsheet className="w-4 h-4 text-amber-600" />
                      Template Umum (.csv)
                    </button>
                  </div>
                )}
              </div>

              <Button
                variant="outline"
                onClick={() => setImportModalOpen(true)}
                className="gap-1.5"
              >
                <FileSpreadsheet className="w-4 h-4" />
                Import Data
              </Button>

              <Button onClick={openCreateModal} className="gap-1.5">
                <UserPlus className="w-4 h-4" />
                Tambah Pengguna
              </Button>
            </div>
          )}
        </div>

        {/* Clickable Real-DB Statistics Dashboard */}
        <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-8 gap-3">
          {[
            {
              label: 'Total Akun',
              value: stats?.totalUsers ?? 0,
              icon: Users,
              color: 'text-slate-700 bg-slate-100',
              active: roleFilter === 'ALL' && statusFilter === 'ALL',
              onClick: resetAllFilters,
            },
            {
              label: 'Aktif',
              value: stats?.activeUsers ?? 0,
              icon: UserCheck,
              color: 'text-emerald-700 bg-emerald-50',
              active: statusFilter === 'ACTIVE',
              onClick: () => {
                setStatusFilter('ACTIVE');
                setPage(1);
              },
            },
            {
              label: 'Nonaktif',
              value: stats?.inactiveUsers ?? 0,
              icon: UserX,
              color: 'text-rose-700 bg-rose-50',
              active: statusFilter === 'INACTIVE',
              onClick: () => {
                setStatusFilter('INACTIVE');
                setPage(1);
              },
            },
            {
              label: 'Menunggu Aktivasi',
              value: stats?.pendingActivationUsers ?? 0,
              icon: Clock,
              color: 'text-amber-700 bg-amber-50',
              active: statusFilter === 'PENDING_ACTIVATION',
              onClick: () => {
                setStatusFilter('PENDING_ACTIVATION');
                setPage(1);
              },
            },
            {
              label: 'Superadmin',
              value: stats?.superadminCount ?? 0,
              icon: ShieldAlert,
              color: 'text-rose-700 bg-rose-50',
              active: roleFilter === 'SUPERADMIN',
              onClick: () => {
                setRoleFilter('SUPERADMIN');
                setPage(1);
              },
            },
            {
              label: 'Dosen',
              value: stats?.dosenCount ?? 0,
              icon: BookOpen,
              color: 'text-indigo-700 bg-indigo-50',
              active: roleFilter === 'DOSEN',
              onClick: () => {
                setRoleFilter('DOSEN');
                setPage(1);
              },
            },
            {
              label: 'Mahasiswa',
              value: stats?.mahasiswaCount ?? 0,
              icon: GraduationCap,
              color: 'text-emerald-700 bg-emerald-50',
              active: roleFilter === 'MAHASISWA',
              onClick: () => {
                setRoleFilter('MAHASISWA');
                setPage(1);
              },
            },
            {
              label: 'Auditor',
              value: stats?.auditorCount ?? 0,
              icon: Shield,
              color: 'text-amber-700 bg-amber-50',
              active: roleFilter === 'AUDITOR',
              onClick: () => {
                setRoleFilter('AUDITOR');
                setPage(1);
              },
            },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.label}
                type="button"
                onClick={item.onClick}
                className={`text-left p-3.5 rounded-xl border transition-all ${
                  item.active
                    ? 'border-indigo-400 bg-indigo-50/40 ring-2 ring-indigo-500/15'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className={`p-1.5 rounded-lg ${item.color}`}>
                    <Icon className="w-3.5 h-3.5" />
                  </span>
                </div>
                <p className="text-xl font-bold text-slate-900">{item.value}</p>
                <p className="text-[11px] font-medium text-slate-500 truncate">{item.label}</p>
              </button>
            );
          })}
        </div>

        {/* Search & Filter Bar */}
        <Card className="p-4 space-y-3">
          <div className="flex flex-col md:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Cari nama, email, NIM, NIDN, NIP, atau nomor identitas..."
                className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <select
                value={roleFilter}
                onChange={(e) => {
                  setRoleFilter(e.target.value);
                  setPage(1);
                }}
                className="px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white text-slate-700"
              >
                <option value="ALL">Semua Peran</option>
                <option value="SUPERADMIN">SUPERADMIN</option>
                <option value="DOSEN">DOSEN</option>
                <option value="MAHASISWA">MAHASISWA</option>
                <option value="AUDITOR">AUDITOR</option>
              </select>

              <select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setPage(1);
                }}
                className="px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white text-slate-700"
              >
                <option value="ALL">Semua Status</option>
                <option value="ACTIVE">Aktif</option>
                <option value="INACTIVE">Nonaktif</option>
                <option value="SUSPENDED">Ditangguhkan</option>
                <option value="PENDING_ACTIVATION">Menunggu Aktivasi</option>
              </select>

              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowAdvancedFilters((v) => !v)}
                className="gap-1"
              >
                Filter Lanjutan
                {showAdvancedFilters ? (
                  <ChevronUp className="w-3.5 h-3.5" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5" />
                )}
              </Button>

              <Button
                variant="ghost"
                size="sm"
                onClick={resetAllFilters}
                title="Reset semua filter"
                className="gap-1 text-slate-500"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Reset
              </Button>
            </div>
          </div>

          {showAdvancedFilters && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-3 border-t border-slate-100">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Program Studi</label>
                <select
                  value={studyProgramFilter}
                  onChange={(e) => {
                    setStudyProgramFilter(e.target.value);
                    setPage(1);
                  }}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white text-slate-700"
                >
                  <option value="ALL">Semua Program Studi</option>
                  {(meta?.filters?.studyPrograms || []).map((sp) => (
                    <option key={sp} value={sp}>
                      {sp}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Unit Organisasi</label>
                <select
                  value={orgUnitFilter}
                  onChange={(e) => {
                    setOrgUnitFilter(e.target.value);
                    setPage(1);
                  }}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white text-slate-700"
                >
                  <option value="ALL">Semua Unit</option>
                  {(meta?.filters?.organizationalUnits || []).map((unit) => (
                    <option key={unit} value={unit}>
                      {unit}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Dibuat Dari</label>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => {
                    setDateFrom(e.target.value);
                    setPage(1);
                  }}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white text-slate-700"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Dibuat Sampai</label>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => {
                    setDateTo(e.target.value);
                    setPage(1);
                  }}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white text-slate-700"
                />
              </div>
            </div>
          )}
        </Card>

        {/* Bulk Action Bar */}
        {canManageUsers && selectedIds.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 bg-indigo-50 border border-indigo-200 rounded-xl">
            <div className="text-sm font-medium text-indigo-900">
              {selectedIds.length} pengguna dipilih
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  setBulkConfirm({
                    action: 'ACTIVATE',
                    title: 'Aktifkan Pengguna Terpilih',
                    description: `Aktifkan ${selectedIds.length} akun pengguna yang dipilih?`,
                  })
                }
              >
                Aktifkan
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  setBulkConfirm({
                    action: 'DEACTIVATE',
                    title: 'Nonaktifkan Pengguna Terpilih',
                    description: `Nonaktifkan ${selectedIds.length} akun pengguna yang dipilih dan cabut sesi aktifnya?`,
                  })
                }
              >
                Nonaktifkan
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => setBulkResetOpen(true)}
                className="gap-1"
              >
                <KeyRound className="w-3.5 h-3.5" />
                Reset Password Massal
              </Button>
              <div className="flex items-center gap-1.5 ml-2 pl-2 border-l border-indigo-200">
                <select
                  value={bulkRoleCode}
                  onChange={(e) => setBulkRoleCode(e.target.value)}
                  className="px-2.5 py-1.5 text-xs border border-indigo-200 rounded-lg bg-white"
                >
                  <option value="MAHASISWA">MAHASISWA</option>
                  <option value="DOSEN">DOSEN</option>
                  <option value="AUDITOR">AUDITOR</option>
                  {isSuperadmin && <option value="SUPERADMIN">SUPERADMIN</option>}
                </select>
                <Button
                  size="sm"
                  onClick={() =>
                    setBulkConfirm({
                      action: 'ASSIGN_ROLE',
                      title: 'Tetapkan Peran Massal',
                      description: `Ubah peran ${selectedIds.length} pengguna terpilih menjadi ${bulkRoleCode}? Sesi aktif mereka akan dicabut.`,
                    })
                  }
                >
                  Terapkan Peran
                </Button>
              </div>
              <Button size="sm" variant="ghost" onClick={() => setSelectedIds([])}>
                Batal
              </Button>
            </div>
          </div>
        )}

        {/* User List: Desktop Table & Mobile Cards */}
        <Card className="overflow-hidden">
          {isLoading ? (
            <div className="p-10 text-center text-sm text-slate-500">
              Memuat direktori pengguna...
            </div>
          ) : users.length === 0 ? (
            <div className="p-10 text-center space-y-2">
              <Users className="w-10 h-10 text-slate-300 mx-auto" />
              <p className="text-sm font-medium text-slate-700">Tidak ada pengguna ditemukan</p>
              <p className="text-xs text-slate-500">
                Coba ubah kata kunci pencarian atau reset filter aktif.
              </p>
            </div>
          ) : (
            <>
              {/* Desktop Table */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    <tr>
                      {canManageUsers && (
                        <th className="py-3 pl-4 pr-2 w-10">
                          <button
                            type="button"
                            onClick={toggleSelectAll}
                            className="text-slate-500 hover:text-indigo-600"
                            title="Pilih semua di halaman ini"
                          >
                            {selectedIds.length === users.length && users.length > 0 ? (
                              <CheckSquare className="w-4 h-4 text-indigo-600" />
                            ) : (
                              <Square className="w-4 h-4" />
                            )}
                          </button>
                        </th>
                      )}
                      <th className="py-3 px-4">
                        <button
                          type="button"
                          onClick={() => toggleSort('fullName')}
                          className="inline-flex items-center gap-1 hover:text-slate-800"
                        >
                          Pengguna
                          <ArrowUpDown className="w-3 h-3" />
                        </button>
                      </th>
                      <th className="py-3 px-4">Identitas Akademik</th>
                      <th className="py-3 px-4">Peran</th>
                      <th className="py-3 px-4">
                        <button
                          type="button"
                          onClick={() => toggleSort('accountStatus')}
                          className="inline-flex items-center gap-1 hover:text-slate-800"
                        >
                          Status
                          <ArrowUpDown className="w-3 h-3" />
                        </button>
                      </th>
                      <th className="py-3 px-4">
                        <button
                          type="button"
                          onClick={() => toggleSort('createdAt')}
                          className="inline-flex items-center gap-1 hover:text-slate-800"
                        >
                          Login / Terdaftar
                          <ArrowUpDown className="w-3 h-3" />
                        </button>
                      </th>
                      <th className="py-3 px-4 text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-sm">
                    {users.map((u) => {
                      const statusMeta = STATUS_BADGE_MAP[u.accountStatus] || {
                        label: u.isActive ? 'Aktif' : 'Nonaktif',
                        className: u.isActive
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : 'bg-slate-100 text-slate-600 border-slate-200',
                      };
                      const isSelected = selectedIds.includes(u.id);
                      const primaryRole = u.roles?.[0] || 'MAHASISWA';
                      const canEditThisUser =
                        canManageUsers && (!u.roles?.includes('SUPERADMIN') || isSuperadmin);

                      return (
                        <tr
                          key={u.id}
                          className={`hover:bg-slate-50/70 transition-colors ${
                            isSelected ? 'bg-indigo-50/30' : ''
                          }`}
                        >
                          {canManageUsers && (
                            <td className="py-3 pl-4 pr-2">
                              <button
                                type="button"
                                onClick={() => toggleSelectOne(u.id)}
                                className="text-slate-400 hover:text-indigo-600"
                              >
                                {isSelected ? (
                                  <CheckSquare className="w-4 h-4 text-indigo-600" />
                                ) : (
                                  <Square className="w-4 h-4" />
                                )}
                              </button>
                            </td>
                          )}
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="w-9 h-9 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-semibold text-xs shrink-0">
                                {(u.fullName || u.email || 'U').slice(0, 2).toUpperCase()}
                              </div>
                              <div className="min-w-0">
                                <button
                                  type="button"
                                  onClick={() => setDetailUserId(u.id)}
                                  className="font-semibold text-slate-900 hover:text-indigo-600 truncate block text-left"
                                >
                                  {u.fullName}
                                </button>
                                <p className="text-xs text-slate-500 truncate">{u.email}</p>
                              </div>
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <div className="text-xs space-y-0.5">
                              <p className="font-medium text-slate-700">
                                {u.nim
                                  ? `NIM: ${u.nim}`
                                  : u.nidn
                                    ? `NIDN: ${u.nidn}`
                                    : u.nip
                                      ? `NIP: ${u.nip}`
                                      : u.identityNumber || '-'}
                              </p>
                              <p className="text-slate-500 truncate max-w-[200px]">
                                {u.studyProgram}
                                {u.organizationalUnit ? ` • ${u.organizationalUnit}` : ''}
                              </p>
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${
                                ROLE_BADGE_MAP[primaryRole] || 'bg-slate-100 text-slate-700 border-slate-200'
                              }`}
                            >
                              {primaryRole}
                            </span>
                          </td>
                          <td className="py-3 px-4">
                            <div className="space-y-1">
                              <span
                                className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${statusMeta.className}`}
                              >
                                {statusMeta.label}
                              </span>
                              {u.mustResetPassword && (
                                <p className="text-[10px] text-amber-700 font-medium">
                                  Wajib ganti password
                                </p>
                              )}
                            </div>
                          </td>
                          <td className="py-3 px-4 text-xs text-slate-500">
                            <p>{u.lastLoginAt ? `Login: ${formatDateTime(u.lastLoginAt)}` : 'Belum pernah login'}</p>
                            <p className="text-[11px] text-slate-400">
                              Daftar: {formatDateTime(u.createdAt)}
                            </p>
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                type="button"
                                onClick={() => setDetailUserId(u.id)}
                                title="Lihat Detail 5-Tab"
                                className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg"
                              >
                                <Eye className="w-4 h-4" />
                              </button>
                              {canEditThisUser && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => openEditModal(u)}
                                    title="Edit Pengguna"
                                    className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg"
                                  >
                                    <Edit3 className="w-4 h-4" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setResetTarget(u)}
                                    title="Reset Password & Sesi"
                                    className="p-1.5 text-slate-500 hover:text-amber-600 hover:bg-amber-50 rounded-lg"
                                  >
                                    <KeyRound className="w-4 h-4" />
                                  </button>
                                  {canImpersonate &&
                                    u.id !== user?.id &&
                                    u.isActive &&
                                    u.accountStatus === 'ACTIVE' &&
                                    !u.roles?.includes('SUPERADMIN') && (
                                      <button
                                        type="button"
                                        onClick={() => setSwitchTarget(u)}
                                        title="Switch Account"
                                        className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg"
                                      >
                                        <UserRoundCheck className="w-4 h-4" />
                                      </button>
                                    )}
                                  {u.id !== user?.id && (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setStatusTarget({
                                          user: u,
                                          nextStatus: u.accountStatus === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE',
                                        })
                                      }
                                      title={
                                        u.accountStatus === 'ACTIVE'
                                          ? 'Nonaktifkan Akun'
                                          : 'Aktifkan Akun'
                                      }
                                      className={`p-1.5 rounded-lg ${
                                        u.accountStatus === 'ACTIVE'
                                          ? 'text-slate-500 hover:text-rose-600 hover:bg-rose-50'
                                          : 'text-emerald-600 hover:bg-emerald-50'
                                      }`}
                                    >
                                      <Power className="w-4 h-4" />
                                    </button>
                                  )}
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Mobile Compact User Cards */}
              <div className="md:hidden divide-y divide-slate-100">
                {users.map((u) => {
                  const statusMeta = STATUS_BADGE_MAP[u.accountStatus] || {
                    label: u.isActive ? 'Aktif' : 'Nonaktif',
                    className: u.isActive
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : 'bg-slate-100 text-slate-600 border-slate-200',
                  };
                  const primaryRole = u.roles?.[0] || 'MAHASISWA';
                  const canEditThisUser =
                    canManageUsers && (!u.roles?.includes('SUPERADMIN') || isSuperadmin);

                  return (
                    <div key={u.id} className="p-4 space-y-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <button
                            type="button"
                            onClick={() => setDetailUserId(u.id)}
                            className="font-semibold text-sm text-slate-900 hover:text-indigo-600 text-left truncate block"
                          >
                            {u.fullName}
                          </button>
                          <p className="text-xs text-slate-500 truncate">{u.email}</p>
                        </div>
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border shrink-0 ${
                            ROLE_BADGE_MAP[primaryRole] || 'bg-slate-100 text-slate-700 border-slate-200'
                          }`}
                        >
                          {primaryRole}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border ${statusMeta.className}`}
                        >
                          {statusMeta.label}
                        </span>
                        <span>• {u.nim || u.nidn || u.nip || u.identityNumber || '-'}</span>
                        <span>• {u.studyProgram}</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        <Button size="sm" variant="outline" onClick={() => setDetailUserId(u.id)}>
                          Detail
                        </Button>
                        {canEditThisUser && (
                          <>
                            <Button size="sm" variant="outline" onClick={() => openEditModal(u)}>
                              Edit
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setResetTarget(u)}
                            >
                              Reset Password
                            </Button>
                            {canImpersonate &&
                              u.id !== user?.id &&
                              u.isActive &&
                              u.accountStatus === 'ACTIVE' &&
                              !u.roles?.includes('SUPERADMIN') && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => setSwitchTarget(u)}
                                >
                                  Switch Account
                                </Button>
                              )}
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {/* Pagination Footer */}
          {meta && meta.total > 0 && (
            <div className="px-4 py-3 border-t border-slate-200 bg-slate-50/70 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-slate-600">
              <div className="flex items-center gap-2">
                <span>
                  Menampilkan halaman <strong>{meta.page}</strong> dari{' '}
                  <strong>{meta.totalPages}</strong> ({meta.total} total pengguna)
                </span>
                {isFetching && <span className="text-indigo-600">Memperbarui...</span>}
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={limit}
                  onChange={(e) => {
                    setLimit(Number(e.target.value));
                    setPage(1);
                  }}
                  className="px-2 py-1 border border-slate-200 rounded bg-white"
                >
                  <option value={10}>10 / hal</option>
                  <option value={20}>20 / hal</option>
                  <option value={50}>50 / hal</option>
                </select>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={page >= meta.totalPages}
                  onClick={() => setPage((p) => Math.min(meta.totalPages, p + 1))}
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </Card>
      </div>

      {/* Create / Edit User Modal */}
      <ModalDialog
        open={formModalMode !== null}
        onClose={() => {
          setFormModalMode(null);
          setEditingUser(null);
          setCreatedInvitationLink(null);
        }}
        title={formModalMode === 'create' ? 'Tambah Pengguna Baru' : 'Edit Data Pengguna'}
        description={
          formModalMode === 'create'
            ? 'Buat akun akademik baru beserta identitas peran dan metode aktivasi.'
            : 'Perbarui profil akademik, peran, dan status akun pengguna.'
        }
        maxWidth="max-w-2xl"
      >
        {createdInvitationLink ? (
          <div className="space-y-4">
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl space-y-2">
              <p className="text-sm font-semibold text-emerald-900">
                Akun berhasil dibuat dengan tautan aktivasi!
              </p>
              <p className="text-xs text-emerald-700">
                Kirimkan tautan aktivasi sekali pakai berikut kepada pengguna untuk mengatur kata sandi:
              </p>
              <div className="flex items-center gap-2">
                <input
                  readOnly
                  value={createdInvitationLink}
                  className="flex-1 px-3 py-2 text-xs font-mono bg-white border border-emerald-300 rounded-lg"
                />
                <Button
                  size="sm"
                  onClick={() => copyToClipboard(createdInvitationLink)}
                  className="gap-1"
                >
                  <Copy className="w-3.5 h-3.5" />
                  Salin
                </Button>
              </div>
            </div>
            <div className="flex justify-end">
              <Button
                onClick={() => {
                  setFormModalMode(null);
                  setCreatedInvitationLink(null);
                }}
              >
                Selesai
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleFormSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Nama Lengkap *
                </label>
                <Input
                  value={formState.fullName}
                  onChange={(e) => setFormState((s) => ({ ...s, fullName: e.target.value }))}
                  placeholder="Dr. Ahmad Fauzi, M.Kom"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Email Institusi *
                </label>
                <Input
                  type="email"
                  value={formState.email}
                  onChange={(e) => setFormState((s) => ({ ...s, email: e.target.value }))}
                  placeholder="nama@poltek-kampar.ac.id"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Peran RBAC *</label>
                <select
                  value={formState.roleCode}
                  onChange={(e) => setFormState((s) => ({ ...s, roleCode: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
                >
                  <option value="MAHASISWA">MAHASISWA</option>
                  <option value="DOSEN">DOSEN</option>
                  <option value="AUDITOR">AUDITOR</option>
                  {isSuperadmin && <option value="SUPERADMIN">SUPERADMIN</option>}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Status Akun</label>
                <select
                  value={formState.accountStatus}
                  onChange={(e) =>
                    setFormState((s) => ({
                      ...s,
                      accountStatus: e.target.value as UserFormState['accountStatus'],
                    }))
                  }
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
                >
                  <option value="ACTIVE">ACTIVE (Aktif)</option>
                  <option value="INACTIVE">INACTIVE (Nonaktif)</option>
                  <option value="SUSPENDED">SUSPENDED (Ditangguhkan)</option>
                  <option value="PENDING_ACTIVATION">PENDING_ACTIVATION (Menunggu Aktivasi)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Program Studi *
                </label>
                <Input
                  value={formState.studyProgram}
                  onChange={(e) => setFormState((s) => ({ ...s, studyProgram: e.target.value }))}
                  placeholder="Teknik Informatika"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Unit Organisasi / Bagian
                </label>
                <Input
                  value={formState.organizationalUnit}
                  onChange={(e) =>
                    setFormState((s) => ({ ...s, organizationalUnit: e.target.value }))
                  }
                  placeholder="Jurusan Teknik Informatika"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Nomor Identitas Utama
                </label>
                <Input
                  value={formState.identityNumber}
                  onChange={(e) => setFormState((s) => ({ ...s, identityNumber: e.target.value }))}
                  placeholder="NIM / NIDN / NIP"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Nomor Telepon</label>
                <Input
                  value={formState.phone}
                  onChange={(e) => setFormState((s) => ({ ...s, phone: e.target.value }))}
                  placeholder="0812..."
                />
              </div>
            </div>

            {/* Role-specific academic identity fields */}
            {formState.roleCode === 'DOSEN' && (
              <div className="p-3.5 bg-indigo-50/60 border border-indigo-100 rounded-xl grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-indigo-900 mb-1">NIDN</label>
                  <Input
                    value={formState.nidn}
                    onChange={(e) => setFormState((s) => ({ ...s, nidn: e.target.value }))}
                    placeholder="1012058801"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-indigo-900 mb-1">NIP</label>
                  <Input
                    value={formState.nip}
                    onChange={(e) => setFormState((s) => ({ ...s, nip: e.target.value }))}
                    placeholder="19880512..."
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-indigo-900 mb-1">
                    Gelar Akademik
                  </label>
                  <Input
                    value={formState.academicTitle}
                    onChange={(e) => setFormState((s) => ({ ...s, academicTitle: e.target.value }))}
                    placeholder="M.Kom / Ph.D"
                  />
                </div>
              </div>
            )}

            {formState.roleCode === 'MAHASISWA' && (
              <div className="p-3.5 bg-emerald-50/60 border border-emerald-100 rounded-xl grid grid-cols-1 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs font-medium text-emerald-900 mb-1">NIM</label>
                  <Input
                    value={formState.nim}
                    onChange={(e) => setFormState((s) => ({ ...s, nim: e.target.value }))}
                    placeholder="202401001"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-emerald-900 mb-1">Angkatan</label>
                  <Input
                    type="number"
                    value={formState.admissionYear}
                    onChange={(e) => setFormState((s) => ({ ...s, admissionYear: e.target.value }))}
                    placeholder="2024"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-emerald-900 mb-1">Semester</label>
                  <Input
                    type="number"
                    min={1}
                    max={14}
                    value={formState.semesterLevel}
                    onChange={(e) => setFormState((s) => ({ ...s, semesterLevel: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-emerald-900 mb-1">
                    Status Akademik
                  </label>
                  <select
                    value={formState.academicStatus}
                    onChange={(e) =>
                      setFormState((s) => ({ ...s, academicStatus: e.target.value }))
                    }
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
                  >
                    <option value="AKTIF">AKTIF</option>
                    <option value="CUTI">CUTI</option>
                    <option value="LULUS">LULUS</option>
                    <option value="NONAKTIF">NONAKTIF</option>
                  </select>
                </div>
              </div>
            )}

            {formState.roleCode === 'AUDITOR' && (
              <div className="p-3.5 bg-amber-50/60 border border-amber-100 rounded-xl">
                <label className="block text-xs font-medium text-amber-900 mb-1">
                  Ruang Lingkup Audit (Audit Scope)
                </label>
                <Input
                  value={formState.auditScope}
                  onChange={(e) => setFormState((s) => ({ ...s, auditScope: e.target.value }))}
                  placeholder="Contoh: SPMI Akademik & Evaluasi Perkuliahan 2026"
                />
              </div>
            )}

            {formModalMode === 'create' && (
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                <label className="block text-xs font-semibold text-slate-700">
                  Metode Aktivasi Kredensial
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <label className="flex items-start gap-2 p-2.5 rounded-lg border border-slate-200 bg-white cursor-pointer">
                    <input
                      type="radio"
                      name="activationMethod"
                      checked={formState.activationMethod === 'PASSWORD_INIT'}
                      onChange={() =>
                        setFormState((s) => ({ ...s, activationMethod: 'PASSWORD_INIT' }))
                      }
                      className="mt-0.5"
                    />
                    <div className="text-xs">
                      <p className="font-semibold text-slate-800">Set Password Awal</p>
                      <p className="text-slate-500">Admin menetapkan password awal langsung.</p>
                    </div>
                  </label>
                  <label className="flex items-start gap-2 p-2.5 rounded-lg border border-slate-200 bg-white cursor-pointer">
                    <input
                      type="radio"
                      name="activationMethod"
                      checked={formState.activationMethod === 'INVITATION'}
                      onChange={() =>
                        setFormState((s) => ({ ...s, activationMethod: 'INVITATION' }))
                      }
                      className="mt-0.5"
                    />
                    <div className="text-xs">
                      <p className="font-semibold text-slate-800">Tautan Undangan Aktivasi</p>
                      <p className="text-slate-500">Buat tautan aktivasi aman 24 jam.</p>
                    </div>
                  </label>
                </div>

                {formState.activationMethod === 'PASSWORD_INIT' && (
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Password Awal (min. 8 karakter) *
                    </label>
                    <Input
                      type="password"
                      value={formState.password}
                      onChange={(e) => setFormState((s) => ({ ...s, password: e.target.value }))}
                      placeholder="Minimal 8 karakter"
                      required
                    />
                  </div>
                )}
              </div>
            )}

            {formModalMode === 'edit' && (
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Catatan / Alasan Perubahan (Audit Log)
                </label>
                <Input
                  value={formState.reason}
                  onChange={(e) => setFormState((s) => ({ ...s, reason: e.target.value }))}
                  placeholder="Contoh: Pembaruan program studi / mutasi peran"
                />
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setFormModalMode(null);
                  setEditingUser(null);
                }}
              >
                Batal
              </Button>
              <Button
                type="submit"
                disabled={createUserMutation.isPending || editUserMutation.isPending}
              >
                {formModalMode === 'create'
                  ? createUserMutation.isPending
                    ? 'Menyimpan...'
                    : 'Buat Pengguna'
                  : editUserMutation.isPending
                    ? 'Memperbarui...'
                    : 'Simpan Perubahan'}
              </Button>
            </div>
          </form>
        )}
      </ModalDialog>

      {/* Advanced Reset Password Modal */}
      <ResetPasswordModal
        user={resetTarget}
        onClose={() => setResetTarget(null)}
        onSuccessRefresh={invalidateUsers}
      />

      {/* Bulk Reset Password Modal */}
      <BulkResetPasswordModal
        userIds={selectedIds}
        open={bulkResetOpen}
        onClose={() => setBulkResetOpen(false)}
        onSuccessRefresh={() => {
          setSelectedIds([]);
          invalidateUsers();
        }}
      />

      {/* Confirmations */}

      <ConfirmDialog
        open={statusTarget !== null}
        onClose={() => setStatusTarget(null)}
        onConfirm={() => {
          if (statusTarget) {
            statusMutation.mutate({
              userId: statusTarget.user.id,
              nextStatus: statusTarget.nextStatus,
            });
          }
        }}
        title={
          statusTarget?.nextStatus === 'ACTIVE' ? 'Aktifkan Akun Pengguna' : 'Nonaktifkan Akun Pengguna'
        }
        description={
          statusTarget?.nextStatus === 'ACTIVE'
            ? `Aktifkan kembali akun ${statusTarget?.user.fullName}?`
            : `Nonaktifkan akun ${statusTarget?.user.fullName} dan cabut semua sesi aktifnya?`
        }
        confirmLabel={statusTarget?.nextStatus === 'ACTIVE' ? 'Aktifkan' : 'Nonaktifkan'}
        variant={statusTarget?.nextStatus === 'ACTIVE' ? 'default' : 'destructive'}
        isLoading={statusMutation.isPending}
      />

      <ConfirmDialog
        open={bulkConfirm !== null}
        onClose={() => setBulkConfirm(null)}
        onConfirm={() => {
          if (bulkConfirm) {
            bulkMutation.mutate({
              action: bulkConfirm.action,
              userIds: selectedIds,
              roleCode: bulkConfirm.action === 'ASSIGN_ROLE' ? bulkRoleCode : undefined,
            });
          }
        }}
        title={bulkConfirm?.title || 'Konfirmasi Aksi Massal'}
        description={bulkConfirm?.description || ''}
        confirmLabel="Jalankan Aksi"
        variant={bulkConfirm?.action === 'DEACTIVATE' ? 'destructive' : 'default'}
        isLoading={bulkMutation.isPending}
      />

      {/* 5-Tab Detail Modal */}
      <UserDetailModal
        userId={detailUserId}
        onClose={() => setDetailUserId(null)}
        canManageUsers={canManageUsers}
        canImpersonate={canImpersonate}
        currentUserId={user?.id}
        onSwitchAccount={(target) => setSwitchTarget(target)}
      />

      {/* Switch Account / Impersonation Modal */}
      <SwitchAccountModal
        target={switchTarget}
        isSubmitting={isSwitchingAccount}
        onClose={() => setSwitchTarget(null)}
        onConfirm={async (reason) => {
          if (!switchTarget) return;
          setIsSwitchingAccount(true);
          try {
            const switchedUser = await startImpersonation(switchTarget.id, reason);
            setSwitchTarget(null);
            toast.success(`Berhasil beralih ke akun ${switchedUser.fullName}.`);
            navigate('/');
          } catch (err: any) {
            toast.error(err?.message || 'Gagal melakukan Switch Account.');
          } finally {
            setIsSwitchingAccount(false);
          }
        }}
      />

      {/* Import Wizard Modal */}
      <UserImportWizardModal
        open={importModalOpen}
        onClose={() => setImportModalOpen(false)}
        onSuccessRefresh={invalidateUsers}
      />
    </AppShell>
  );
}
