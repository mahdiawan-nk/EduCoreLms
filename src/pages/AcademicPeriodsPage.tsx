import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Calendar,
  Clock,
  Plus,
  CheckCircle2,
  Lock,
  Archive,
  Star,
  Layers,
  Search,
  Filter,
  Eye,
  Edit2,
  Trash2,
  History,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
  BookOpen,
  School,
  FileText,
  ShieldAlert,
} from 'lucide-react';
import { AppShell } from '../components/AppShell';
import { Button, Input, Card, ModalDialog } from '../components/ui/primitives';
import { apiRequest } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { canPerformMutations } from '../lib/authorization';
import { formatDate } from '../lib/utils';
import { toast } from 'sonner';

export interface AcademicPeriod {
  id: string;
  code: string;
  name: string;
  academicYear: string;
  semesterType: 'ODD' | 'EVEN' | 'SHORT';
  description?: string;
  preparationStartDate?: string | null;
  startDate: string;
  endDate: string;
  status: 'DRAFT' | 'SCHEDULED' | 'ACTIVE' | 'COMPLETED' | 'ARCHIVED';
  isDefault: boolean;
  administrativeNotes?: string;
  classroomCount?: number;
  courseOfferingCount?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface AuditHistoryEntry {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  metadata: any;
  ipAddress?: string;
  createdAt: string;
  actorId?: string;
  actorName?: string;
  actorEmail?: string;
}

export function AcademicPeriodsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  // RBAC Permission Resolution
  const canMutate = canPerformMutations(user);
  const isSuperadmin = user?.roles.some((r) => r.toUpperCase() === 'SUPERADMIN') ?? false;
  const userPerms = new Set(user?.permissions || []);
  const canCreate = canMutate && (isSuperadmin || userPerms.has('academic_period.create'));
  const canUpdate = canMutate && (isSuperadmin || userPerms.has('academic_period.update'));
  const canDelete = canMutate && (isSuperadmin || userPerms.has('academic_period.delete'));
  const canActivate = canMutate && (isSuperadmin || userPerms.has('academic_period.activate'));
  const canSetDefault = canMutate && (isSuperadmin || userPerms.has('academic_period.set_default'));
  const canComplete = canMutate && (isSuperadmin || userPerms.has('academic_period.complete'));
  const canArchive = canMutate && (isSuperadmin || userPerms.has('academic_period.archive'));
  const canViewHistory = isSuperadmin || userPerms.has('academic_period.view_history');

  // Search, Filters, Sorting & Pagination State
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedYear, setSelectedYear] = useState('all');
  const [selectedType, setSelectedType] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [sortBy, setSortBy] = useState<'startDate' | 'code' | 'name' | 'status'>('startDate');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  // Modals State
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [selectedPeriod, setSelectedPeriod] = useState<AcademicPeriod | null>(null);

  // Form state for Create
  const [createForm, setCreateForm] = useState({
    academic_code: '',
    name: '',
    academic_year: '2026/2027',
    semester_type: 'ODD' as 'ODD' | 'EVEN' | 'SHORT',
    description: '',
    preparation_start_date: '',
    lecture_start_date: '2026-09-01',
    lecture_end_date: '2027-01-31',
    status: 'DRAFT' as 'DRAFT' | 'SCHEDULED' | 'ACTIVE' | 'COMPLETED' | 'ARCHIVED',
    is_default: false,
    administrative_notes: '',
  });

  // Form state for Edit
  const [editForm, setEditForm] = useState({
    academic_code: '',
    name: '',
    academic_year: '',
    semester_type: 'ODD' as 'ODD' | 'EVEN' | 'SHORT',
    description: '',
    preparation_start_date: '',
    lecture_start_date: '',
    lecture_end_date: '',
    status: 'DRAFT' as 'DRAFT' | 'SCHEDULED' | 'ACTIVE' | 'COMPLETED' | 'ARCHIVED',
    is_default: false,
    administrative_notes: '',
  });

  // Auto-open create modal if query param is set
  useEffect(() => {
    if (searchParams.get('action') === 'new' && canCreate) {
      setCreateModalOpen(true);
    }
  }, [searchParams, canCreate]);

  // 1. Fetch Academic Periods
  const {
    data: periodsResponse,
    isLoading: periodsLoading,
    isError: periodsError,
    refetch: refetchPeriods,
  } = useQuery({
    queryKey: ['academic-periods-list'],
    queryFn: async () => {
      const res = await apiRequest<AcademicPeriod[]>('/api/v1/admin/academic-periods');
      return res.data || [];
    },
  });

  const periods = periodsResponse || [];

  // 2. Fetch Period History when Detail Modal is opened
  const { data: periodHistoryResponse, isLoading: historyLoading } = useQuery({
    queryKey: ['academic-period-history', selectedPeriod?.id],
    queryFn: async () => {
      if (!selectedPeriod?.id) return [];
      const res = await apiRequest<{ period: any; history: AuditHistoryEntry[] }>(
        `/api/v1/admin/academic-periods/${selectedPeriod.id}/history`
      );
      return res.data?.history || [];
    },
    enabled: !!selectedPeriod?.id && detailModalOpen && canViewHistory,
  });

  const periodHistory = periodHistoryResponse || [];

  // Summary Metrics
  const summaryMetrics = useMemo(() => {
    const total = periods.length;
    const activePeriod = periods.find((p) => p.status?.toUpperCase() === 'ACTIVE' || p.isDefault);
    const scheduledCount = periods.filter(
      (p) => p.status?.toUpperCase() === 'SCHEDULED' || p.status?.toUpperCase() === 'DRAFT'
    ).length;
    const completedCount = periods.filter(
      (p) => p.status?.toUpperCase() === 'COMPLETED' || p.status?.toUpperCase() === 'ARCHIVED'
    ).length;

    return {
      total,
      activeName: activePeriod ? `${activePeriod.name} (${activePeriod.code})` : 'Belum Ditentukan',
      activePeriod,
      scheduledCount,
      completedCount,
    };
  }, [periods]);

  // Unique Academic Years for filtering
  const availableYears = useMemo(() => {
    const years = new Set<string>();
    periods.forEach((p) => {
      if (p.academicYear) years.add(p.academicYear);
    });
    return Array.from(years).sort().reverse();
  }, [periods]);

  // Filtered and Sorted Periods
  const filteredPeriods = useMemo(() => {
    let result = [...periods];

    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase().trim();
      result = result.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.code.toLowerCase().includes(q) ||
          p.academicYear.toLowerCase().includes(q)
      );
    }

    if (selectedYear !== 'all') {
      result = result.filter((p) => p.academicYear === selectedYear);
    }

    if (selectedType !== 'all') {
      result = result.filter((p) => p.semesterType.toUpperCase() === selectedType.toUpperCase());
    }

    if (selectedStatus !== 'all') {
      result = result.filter((p) => p.status.toUpperCase() === selectedStatus.toUpperCase());
    }

    // Sort
    result.sort((a, b) => {
      let valA: any = a[sortBy];
      let valB: any = b[sortBy];
      if (sortBy === 'startDate') {
        valA = new Date(a.startDate).getTime();
        valB = new Date(b.startDate).getTime();
      } else if (typeof valA === 'string') {
        valA = valA.toLowerCase();
        valB = (valB || '').toLowerCase();
      }

      if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
      if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });

    return result;
  }, [periods, searchTerm, selectedYear, selectedType, selectedStatus, sortBy, sortOrder]);

  // Paginated Periods
  const totalPages = Math.max(1, Math.ceil(filteredPeriods.length / pageSize));
  const paginatedPeriods = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredPeriods.slice(start, start + pageSize);
  }, [filteredPeriods, currentPage, pageSize]);

  // Mutation: Create Academic Period
  const createMutation = useMutation({
    mutationFn: async (payload: typeof createForm) => {
      return apiRequest('/api/v1/admin/academic-periods', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['academic-periods-list'] });
      setCreateModalOpen(false);
      setCreateForm({
        academic_code: '',
        name: '',
        academic_year: '2026/2027',
        semester_type: 'ODD',
        description: '',
        preparation_start_date: '',
        lecture_start_date: '2026-09-01',
        lecture_end_date: '2027-01-31',
        status: 'DRAFT',
        is_default: false,
        administrative_notes: '',
      });
      toast.success('Periode akademik baru berhasil dibuka dan disimpan.');
    },
    onError: (err: any) => {
      toast.error(err.message || 'Gagal membuat periode akademik.');
    },
  });

  // Mutation: Update Academic Period
  const updateMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: typeof editForm }) => {
      return apiRequest(`/api/v1/admin/academic-periods/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['academic-periods-list'] });
      setEditModalOpen(false);
      toast.success('Periode akademik berhasil diperbarui.');
    },
    onError: (err: any) => {
      toast.error(err.message || 'Gagal memperbarui periode akademik.');
    },
  });

  // Mutation: Delete Academic Period
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest(`/api/v1/admin/academic-periods/${id}`, {
        method: 'DELETE',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['academic-periods-list'] });
      setDeleteModalOpen(false);
      setSelectedPeriod(null);
      toast.success('Periode akademik berhasil dihapus.');
    },
    onError: (err: any) => {
      toast.error(err.message || 'Gagal menghapus periode akademik.');
    },
  });

  // Mutation: Lifecycle Transitions (activate, complete, archive, set-default)
  const transitionMutation = useMutation({
    mutationFn: async ({ id, action }: { id: string; action: string }) => {
      return apiRequest(`/api/v1/admin/academic-periods/${id}/${action}`, {
        method: 'POST',
      });
    },
    onSuccess: (_, { action }) => {
      queryClient.invalidateQueries({ queryKey: ['academic-periods-list'] });
      const actionName =
        action === 'activate'
          ? 'diaktifkan'
          : action === 'set-default'
          ? 'ditetapkan sebagai default'
          : action === 'complete'
          ? 'diselesaikan'
          : 'diarsipkan';
      toast.success(`Semester berhasil ${actionName}.`);
    },
    onError: (err: any) => {
      toast.error(err.message || 'Gagal memproses transisi semester.');
    },
  });

  // Helper to open Edit modal
  const handleOpenEdit = (period: AcademicPeriod) => {
    setSelectedPeriod(period);
    setEditForm({
      academic_code: period.code,
      name: period.name,
      academic_year: period.academicYear,
      semester_type: period.semesterType,
      description: period.description || '',
      preparation_start_date: period.preparationStartDate
        ? new Date(period.preparationStartDate).toISOString().split('T')[0]
        : '',
      lecture_start_date: new Date(period.startDate).toISOString().split('T')[0],
      lecture_end_date: new Date(period.endDate).toISOString().split('T')[0],
      status: period.status,
      is_default: period.isDefault,
      administrative_notes: period.administrativeNotes || '',
    });
    setEditModalOpen(true);
  };

  // Status Badge Component
  const renderStatusBadge = (status: string) => {
    const s = status.toUpperCase();
    switch (s) {
      case 'ACTIVE':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse" />
            ACTIVE
          </span>
        );
      case 'SCHEDULED':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-100 text-blue-800 border border-blue-200">
            SCHEDULED
          </span>
        );
      case 'DRAFT':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-200">
            DRAFT
          </span>
        );
      case 'COMPLETED':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-100 text-indigo-800 border border-indigo-200">
            COMPLETED
          </span>
        );
      case 'ARCHIVED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-700 border border-slate-300">
            <Archive className="w-3 h-3 text-slate-500" />
            ARCHIVED
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-700">
            {s}
          </span>
        );
    }
  };

  // Semester Type Badge
  const renderSemesterTypeBadge = (type: string) => {
    const t = type.toUpperCase();
    switch (t) {
      case 'ODD':
        return (
          <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-sky-50 text-sky-800 border border-sky-200">
            Ganjil (ODD)
          </span>
        );
      case 'EVEN':
        return (
          <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-violet-50 text-violet-800 border border-violet-200">
            Genap (EVEN)
          </span>
        );
      case 'SHORT':
        return (
          <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-50 text-amber-800 border border-amber-200">
            Pendek (SHORT)
          </span>
        );
      default:
        return <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-100 text-slate-700">{t}</span>;
    }
  };

  return (
    <AppShell breadcrumb="Manajemen Periode Akademik">
      <div className="space-y-6">
        {/* =====================================================================
            HEADER (Section 4 Requirement)
        ===================================================================== */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-6">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800">
                Administrasi Semester Resmi
              </span>
              {summaryMetrics.activePeriod && (
                <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 flex items-center gap-1">
                  <Star className="w-3 h-3 fill-emerald-600" /> Default: {summaryMetrics.activePeriod.name}
                </span>
              )}
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 mt-2">
              Manajemen Periode Akademik
            </h1>
            <p className="text-sm text-slate-600 mt-1 max-w-3xl">
              Pengelolaan semester dan tahun akademik resmi Politeknik Kampar.
            </p>
          </div>

          {canCreate && (
            <div className="flex items-center gap-3 shrink-0">
              <Button
                onClick={() => setCreateModalOpen(true)}
                className="bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-2 shadow-xs cursor-pointer"
              >
                <Plus className="w-4 h-4" /> Buka Semester Baru
              </Button>
            </div>
          )}
        </div>

        {/* =====================================================================
            SUMMARY CARDS (Section 4 Requirement)
        ===================================================================== */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: Total Periode Akademik */}
          <Card className="p-4 border-slate-200 bg-white">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">
              Total Periode Akademik
            </p>
            <p className="mt-1 text-2xl font-bold font-mono text-slate-900 tabular-nums">
              {summaryMetrics.total}{' '}
              <span className="text-xs font-normal text-slate-500">Semester</span>
            </p>
            <p className="mt-1 text-xs text-slate-500">Semua riwayat semester terdaftar</p>
          </Card>

          {/* Card 2: Semester Aktif */}
          <Card className="p-4 border-slate-200 bg-white">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">
              Semester Aktif
            </p>
            <p className="mt-1 text-base font-bold text-emerald-700 truncate" title={summaryMetrics.activeName}>
              {summaryMetrics.activeName}
            </p>
            <p className="mt-1 text-xs font-mono text-slate-500">
              {summaryMetrics.activePeriod
                ? `Masa Kuliah: ${formatDate(summaryMetrics.activePeriod.startDate)}`
                : 'Belum ada semester aktif'}
            </p>
          </Card>

          {/* Card 3: Semester Terjadwal */}
          <Card className="p-4 border-slate-200 bg-white">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">
              Semester Terjadwal
            </p>
            <p className="mt-1 text-2xl font-bold font-mono text-blue-700 tabular-nums">
              {summaryMetrics.scheduledCount}{' '}
              <span className="text-xs font-normal text-slate-500">Draft / Scheduled</span>
            </p>
            <p className="mt-1 text-xs text-slate-500">Persiapan kurikulum semester mendatang</p>
          </Card>

          {/* Card 4: Semester Selesai */}
          <Card className="p-4 border-slate-200 bg-white">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">
              Semester Selesai
            </p>
            <p className="mt-1 text-2xl font-bold font-mono text-indigo-700 tabular-nums">
              {summaryMetrics.completedCount}{' '}
              <span className="text-xs font-normal text-slate-500">Completed / Archived</span>
            </p>
            <p className="mt-1 text-xs text-slate-500">Arsip nilai & riwayat perkuliahan</p>
          </Card>
        </div>

        {/* =====================================================================
            MAIN SECTION: DAFTAR PERIODE AKADEMIK (Section 4 Requirement)
        ===================================================================== */}
        <div className="space-y-4">
          {/* Section Header & Filters Bar */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-3">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Layers className="w-4 h-4 text-blue-600" />
                Daftar Periode Akademik ({filteredPeriods.length})
              </h2>

              {/* Search Bar */}
              <div className="relative w-full md:w-80">
                <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Cari nama semester atau kode..."
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
              </div>
            </div>

            {/* Filters Row */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-slate-100 text-xs">
              <div>
                <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                  Tahun Akademik
                </label>
                <select
                  value={selectedYear}
                  onChange={(e) => {
                    setSelectedYear(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="w-full px-2 py-1.5 rounded-md border border-slate-200 bg-white text-slate-800 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="all">Semua Tahun Akademik</option>
                  {availableYears.map((yr) => (
                    <option key={yr} value={yr}>
                      {yr}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                  Tipe Semester
                </label>
                <select
                  value={selectedType}
                  onChange={(e) => {
                    setSelectedType(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="w-full px-2 py-1.5 rounded-md border border-slate-200 bg-white text-slate-800 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="all">Semua Tipe</option>
                  <option value="ODD">Ganjil (ODD)</option>
                  <option value="EVEN">Genap (EVEN)</option>
                  <option value="SHORT">Pendek (SHORT)</option>
                </select>
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                  Status Siklus
                </label>
                <select
                  value={selectedStatus}
                  onChange={(e) => {
                    setSelectedStatus(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="w-full px-2 py-1.5 rounded-md border border-slate-200 bg-white text-slate-800 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="all">Semua Status</option>
                  <option value="DRAFT">DRAFT</option>
                  <option value="SCHEDULED">SCHEDULED</option>
                  <option value="ACTIVE">ACTIVE</option>
                  <option value="COMPLETED">COMPLETED</option>
                  <option value="ARCHIVED">ARCHIVED</option>
                </select>
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                  Urutkan Berdasarkan
                </label>
                <div className="flex gap-1">
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as any)}
                    className="w-full px-2 py-1.5 rounded-md border border-slate-200 bg-white text-slate-800 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="startDate">Tgl Mulai Kuliah</option>
                    <option value="code">Kode Semester</option>
                    <option value="name">Nama Semester</option>
                    <option value="status">Status</option>
                  </select>
                  <button
                    type="button"
                    onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
                    className="px-2 py-1.5 rounded-md border border-slate-200 hover:bg-slate-50 text-slate-600 cursor-pointer"
                    title={`Urutan: ${sortOrder.toUpperCase()}`}
                  >
                    <ArrowUpDown className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Period Listing / Loading / Empty / Error States */}
          {periodsLoading ? (
            <div className="p-12 text-center text-sm text-slate-500 bg-white rounded-xl border border-slate-200">
              <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              Memuat data master periode akademik...
            </div>
          ) : periodsError ? (
            <div className="p-8 text-center bg-red-50 border border-red-200 rounded-xl text-red-700">
              <AlertCircle className="w-8 h-8 text-red-600 mx-auto mb-2" />
              <p className="font-bold text-sm">Gagal memuat data periode akademik</p>
              <Button
                variant="outline"
                onClick={() => refetchPeriods()}
                className="mt-3 text-xs"
              >
                Coba Lagi
              </Button>
            </div>
          ) : paginatedPeriods.length === 0 ? (
            <Card className="p-12 text-center text-slate-500 bg-white">
              <Calendar className="w-10 h-10 text-slate-300 mx-auto mb-3" />
              <p className="font-semibold text-slate-800 text-base">Tidak Ada Periode Akademik</p>
              <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                {searchTerm || selectedYear !== 'all' || selectedType !== 'all' || selectedStatus !== 'all'
                  ? 'Tidak ada periode akademik yang sesuai dengan filter pencarian.'
                  : 'Belum ada periode akademik resmi yang terdaftar.'}
              </p>
              {canCreate && (
                <Button
                  onClick={() => setCreateModalOpen(true)}
                  className="mt-4 bg-blue-600 hover:bg-blue-700 text-white text-xs cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5 mr-1" /> Buka Semester Baru
                </Button>
              )}
            </Card>
          ) : (
            <div className="grid grid-cols-1 gap-3.5">
              {paginatedPeriods.map((period) => (
                <Card
                  key={period.id}
                  className="p-5 border border-slate-200 bg-white shadow-xs hover:border-slate-300 transition-all"
                >
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    {/* Main Info */}
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-xs font-bold px-2 py-0.5 bg-slate-100 text-slate-800 rounded border border-slate-200">
                          {period.code}
                        </span>
                        <h3 className="text-base sm:text-lg font-bold text-slate-900">
                          {period.name}
                        </h3>
                        {period.isDefault && (
                          <span className="inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded-full border border-emerald-200">
                            <Star className="w-3 h-3 fill-emerald-600" /> Default Semester
                          </span>
                        )}
                        {renderStatusBadge(period.status)}
                        {renderSemesterTypeBadge(period.semesterType)}
                      </div>

                      {/* Details row: Academic Year, Dates, Classrooms, Offerings */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-1.5 text-xs text-slate-600 pt-1">
                        <div>
                          <span className="text-slate-400">Tahun Akademik:</span>{' '}
                          <strong className="text-slate-800 font-mono">{period.academicYear}</strong>
                        </div>
                        <div>
                          <span className="text-slate-400">Masa Kuliah:</span>{' '}
                          <span className="font-medium text-slate-800">
                            {formatDate(period.startDate)} - {formatDate(period.endDate)}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-400">Ruang Kelas Aktif:</span>{' '}
                          <span className="font-semibold text-blue-700">
                            {period.classroomCount ?? 0} Kelas
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-400">Penawaran MK:</span>{' '}
                          <span className="font-semibold text-purple-700">
                            {period.courseOfferingCount ?? 0} Matakuliah
                          </span>
                        </div>
                      </div>

                      {period.description && (
                        <p className="text-xs text-slate-500 line-clamp-1 italic">
                          {period.description}
                        </p>
                      )}
                    </div>

                    {/* Actions Panel based on RBAC */}
                    <div className="flex items-center gap-1.5 flex-wrap shrink-0 border-t lg:border-t-0 pt-3 lg:pt-0">
                      {/* Detail Button: Visible to all authorized roles */}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setSelectedPeriod(period);
                          setDetailModalOpen(true);
                        }}
                        className="text-xs flex items-center gap-1 cursor-pointer"
                        title="Lihat Detail Periode & Histori Audit"
                      >
                        <Eye className="w-3.5 h-3.5 text-slate-600" /> Detail
                      </Button>

                      {/* Superadmin Administrative Actions */}
                      {canUpdate && period.status.toUpperCase() !== 'ARCHIVED' && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleOpenEdit(period)}
                          className="text-xs flex items-center gap-1 cursor-pointer"
                          title="Edit Periode Akademik"
                        >
                          <Edit2 className="w-3.5 h-3.5 text-blue-600" /> Edit
                        </Button>
                      )}

                      {/* Activate: When DRAFT or SCHEDULED */}
                      {canActivate &&
                        (period.status.toUpperCase() === 'DRAFT' ||
                          period.status.toUpperCase() === 'SCHEDULED') && (
                          <Button
                            size="sm"
                            onClick={() =>
                              transitionMutation.mutate({ id: period.id, action: 'activate' })
                            }
                            className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-1 cursor-pointer shadow-xs"
                            title="Aktifkan Semester"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" /> Aktifkan
                          </Button>
                        )}

                      {/* Set Default: When not already default and not ARCHIVED */}
                      {canSetDefault &&
                        !period.isDefault &&
                        period.status.toUpperCase() !== 'ARCHIVED' && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              transitionMutation.mutate({ id: period.id, action: 'set-default' })
                            }
                            className="text-xs border-amber-300 bg-amber-50/60 hover:bg-amber-100 text-amber-900 flex items-center gap-1 cursor-pointer"
                            title="Tetapkan sebagai Semester Default"
                          >
                            <Star className="w-3.5 h-3.5 text-amber-600" /> Set Default
                          </Button>
                        )}

                      {/* Complete: When ACTIVE */}
                      {canComplete && period.status.toUpperCase() === 'ACTIVE' && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            transitionMutation.mutate({ id: period.id, action: 'complete' })
                          }
                          className="text-xs border-indigo-200 bg-indigo-50/60 hover:bg-indigo-100 text-indigo-900 flex items-center gap-1 cursor-pointer"
                          title="Selesaikan Semester Perkuliahan"
                        >
                          <Lock className="w-3.5 h-3.5 text-indigo-600" /> Selesaikan
                        </Button>
                      )}

                      {/* Archive: When COMPLETED */}
                      {canArchive && period.status.toUpperCase() === 'COMPLETED' && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            transitionMutation.mutate({ id: period.id, action: 'archive' })
                          }
                          className="text-xs border-slate-300 hover:bg-slate-100 text-slate-800 flex items-center gap-1 cursor-pointer"
                          title="Arsipkan Semester (Read-only)"
                        >
                          <Archive className="w-3.5 h-3.5 text-slate-600" /> Arsipkan
                        </Button>
                      )}

                      {/* Delete: When eligible (DRAFT/SCHEDULED, zero classrooms, zero offerings) */}
                      {canDelete && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setSelectedPeriod(period);
                            setDeleteModalOpen(true);
                          }}
                          className="text-xs text-red-600 hover:bg-red-50 hover:text-red-700 cursor-pointer p-1.5"
                          title="Hapus Periode Akademik"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between bg-white px-4 py-3 rounded-xl border border-slate-200 text-xs">
              <span className="text-slate-500">
                Halaman <strong>{currentPage}</strong> dari <strong>{totalPages}</strong> (
                {filteredPeriods.length} total semester)
              </span>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  className="cursor-pointer"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  className="cursor-pointer"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* =====================================================================
            MODAL 1: BUKA SEMESTER BARU (CREATE - Section 5)
        ===================================================================== */}
        {createModalOpen && (
          <ModalDialog
            open={createModalOpen}
            onClose={() => setCreateModalOpen(false)}
            title="Buka Semester Baru (Create Academic Period)"
          >
            <form
              onSubmit={(e) => {
                e.preventDefault();
                createMutation.mutate(createForm);
              }}
              className="space-y-4 text-xs"
            >
              {/* Section A: Informasi Dasar */}
              <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 space-y-3">
                <h4 className="font-bold text-slate-800 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                  <School className="w-3.5 h-3.5 text-blue-600" /> A. Informasi Dasar Semester
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-slate-700 font-semibold block mb-1">
                      Kode Semester (Academic Code) *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Contoh: 20261 atau 20262"
                      value={createForm.academic_code}
                      onChange={(e) =>
                        setCreateForm({ ...createForm, academic_code: e.target.value })
                      }
                      className="w-full px-3 py-1.5 border border-slate-300 rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono text-xs"
                    />
                  </div>

                  <div>
                    <label className="text-slate-700 font-semibold block mb-1">
                      Tahun Akademik *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Contoh: 2026/2027"
                      value={createForm.academic_year}
                      onChange={(e) =>
                        setCreateForm({ ...createForm, academic_year: e.target.value })
                      }
                      className="w-full px-3 py-1.5 border border-slate-300 rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 text-xs"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-slate-700 font-semibold block mb-1">
                      Nama Resmi Semester *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Contoh: Semester Ganjil 2026/2027"
                      value={createForm.name}
                      onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                      className="w-full px-3 py-1.5 border border-slate-300 rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 text-xs"
                    />
                  </div>

                  <div>
                    <label className="text-slate-700 font-semibold block mb-1">
                      Tipe Semester *
                    </label>
                    <select
                      value={createForm.semester_type}
                      onChange={(e) =>
                        setCreateForm({
                          ...createForm,
                          semester_type: e.target.value as 'ODD' | 'EVEN' | 'SHORT',
                        })
                      }
                      className="w-full px-3 py-1.5 border border-slate-300 rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 text-xs"
                    >
                      <option value="ODD">Ganjil (ODD)</option>
                      <option value="EVEN">Genap (EVEN)</option>
                      <option value="SHORT">Pendek (SHORT)</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="text-slate-700 font-semibold block mb-1">Deskripsi</label>
                  <textarea
                    rows={2}
                    placeholder="Deskripsi singkat kebijakan semester ini..."
                    value={createForm.description}
                    onChange={(e) =>
                      setCreateForm({ ...createForm, description: e.target.value })
                    }
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 text-xs"
                  />
                </div>
              </div>

              {/* Section B: Tanggal Akademik */}
              <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 space-y-3">
                <h4 className="font-bold text-slate-800 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-blue-600" /> B. Tanggal Perkuliahan Resmi
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="text-slate-700 font-semibold block mb-1">
                      Mulai Persiapan (Opsional)
                    </label>
                    <input
                      type="date"
                      value={createForm.preparation_start_date}
                      onChange={(e) =>
                        setCreateForm({ ...createForm, preparation_start_date: e.target.value })
                      }
                      className="w-full px-3 py-1.5 border border-slate-300 rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 text-xs"
                    />
                  </div>

                  <div>
                    <label className="text-slate-700 font-semibold block mb-1">
                      Mulai Kuliah (Lecture Start) *
                    </label>
                    <input
                      type="date"
                      required
                      value={createForm.lecture_start_date}
                      onChange={(e) =>
                        setCreateForm({ ...createForm, lecture_start_date: e.target.value })
                      }
                      className="w-full px-3 py-1.5 border border-slate-300 rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 text-xs"
                    />
                  </div>

                  <div>
                    <label className="text-slate-700 font-semibold block mb-1">
                      Selesai Kuliah (Lecture End) *
                    </label>
                    <input
                      type="date"
                      required
                      value={createForm.lecture_end_date}
                      onChange={(e) =>
                        setCreateForm({ ...createForm, lecture_end_date: e.target.value })
                      }
                      className="w-full px-3 py-1.5 border border-slate-300 rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 text-xs"
                    />
                  </div>
                </div>
              </div>

              {/* Section C: Konfigurasi & Catatan */}
              <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 space-y-3">
                <h4 className="font-bold text-slate-800 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 text-blue-600" /> C. Konfigurasi Semester
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
                  <div>
                    <label className="text-slate-700 font-semibold block mb-1">Status Awal</label>
                    <select
                      value={createForm.status}
                      onChange={(e) =>
                        setCreateForm({
                          ...createForm,
                          status: e.target.value as any,
                        })
                      }
                      className="w-full px-3 py-1.5 border border-slate-300 rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 text-xs"
                    >
                      <option value="DRAFT">DRAFT (Penyusunan)</option>
                      <option value="SCHEDULED">SCHEDULED (Terjadwal)</option>
                      <option value="ACTIVE">ACTIVE (Aktif)</option>
                    </select>
                  </div>

                  <div className="pt-4">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={createForm.is_default}
                        onChange={(e) =>
                          setCreateForm({ ...createForm, is_default: e.target.checked })
                        }
                        className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="font-medium text-slate-700">
                        Jadikan Semester Default Sistem
                      </span>
                    </label>
                  </div>
                </div>

                <div>
                  <label className="text-slate-700 font-semibold block mb-1">
                    Catatan Administratif
                  </label>
                  <input
                    type="text"
                    placeholder="Catatan SK Direktur atau nomor edaran..."
                    value={createForm.administrative_notes}
                    onChange={(e) =>
                      setCreateForm({ ...createForm, administrative_notes: e.target.value })
                    }
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 text-xs"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setCreateModalOpen(false)}
                  className="cursor-pointer text-xs"
                >
                  Batal
                </Button>
                <Button
                  type="submit"
                  disabled={createMutation.isPending}
                  className="bg-blue-600 hover:bg-blue-700 text-white cursor-pointer text-xs"
                >
                  {createMutation.isPending ? 'Menyimpan...' : 'Buka Semester'}
                </Button>
              </div>
            </form>
          </ModalDialog>
        )}

        {/* =====================================================================
            MODAL 2: EDIT PERIODE AKADEMIK (EDIT - Section 5)
        ===================================================================== */}
        {editModalOpen && selectedPeriod && (
          <ModalDialog
            open={editModalOpen}
            onClose={() => setEditModalOpen(false)}
            title={`Edit Periode: ${selectedPeriod.name}`}
          >
            <form
              onSubmit={(e) => {
                e.preventDefault();
                updateMutation.mutate({
                  id: selectedPeriod.id,
                  payload: editForm,
                });
              }}
              className="space-y-4 text-xs"
            >
              <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-slate-700 font-semibold block mb-1">Kode Semester</label>
                    <input
                      type="text"
                      required
                      value={editForm.academic_code}
                      onChange={(e) =>
                        setEditForm({ ...editForm, academic_code: e.target.value })
                      }
                      className="w-full px-3 py-1.5 border border-slate-300 rounded-md bg-white font-mono text-xs"
                    />
                  </div>

                  <div>
                    <label className="text-slate-700 font-semibold block mb-1">Tahun Akademik</label>
                    <input
                      type="text"
                      required
                      value={editForm.academic_year}
                      onChange={(e) =>
                        setEditForm({ ...editForm, academic_year: e.target.value })
                      }
                      className="w-full px-3 py-1.5 border border-slate-300 rounded-md bg-white text-xs"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-slate-700 font-semibold block mb-1">Nama Semester</label>
                    <input
                      type="text"
                      required
                      value={editForm.name}
                      onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                      className="w-full px-3 py-1.5 border border-slate-300 rounded-md bg-white text-xs"
                    />
                  </div>

                  <div>
                    <label className="text-slate-700 font-semibold block mb-1">Tipe Semester</label>
                    <select
                      value={editForm.semester_type}
                      onChange={(e) =>
                        setEditForm({
                          ...editForm,
                          semester_type: e.target.value as any,
                        })
                      }
                      className="w-full px-3 py-1.5 border border-slate-300 rounded-md bg-white text-xs"
                    >
                      <option value="ODD">Ganjil (ODD)</option>
                      <option value="EVEN">Genap (EVEN)</option>
                      <option value="SHORT">Pendek (SHORT)</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="text-slate-700 font-semibold block mb-1">Deskripsi</label>
                  <textarea
                    rows={2}
                    value={editForm.description}
                    onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-md bg-white text-xs"
                  />
                </div>
              </div>

              {/* Tanggal Perkuliahan */}
              <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 space-y-3">
                <h4 className="font-bold text-slate-800 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-blue-600" /> Tanggal Perkuliahan
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="text-slate-700 font-semibold block mb-1">Mulai Persiapan</label>
                    <input
                      type="date"
                      value={editForm.preparation_start_date}
                      onChange={(e) =>
                        setEditForm({ ...editForm, preparation_start_date: e.target.value })
                      }
                      className="w-full px-3 py-1.5 border border-slate-300 rounded-md bg-white text-xs"
                    />
                  </div>

                  <div>
                    <label className="text-slate-700 font-semibold block mb-1">Mulai Kuliah *</label>
                    <input
                      type="date"
                      required
                      value={editForm.lecture_start_date}
                      onChange={(e) =>
                        setEditForm({ ...editForm, lecture_start_date: e.target.value })
                      }
                      className="w-full px-3 py-1.5 border border-slate-300 rounded-md bg-white text-xs"
                    />
                  </div>

                  <div>
                    <label className="text-slate-700 font-semibold block mb-1">Selesai Kuliah *</label>
                    <input
                      type="date"
                      required
                      value={editForm.lecture_end_date}
                      onChange={(e) =>
                        setEditForm({ ...editForm, lecture_end_date: e.target.value })
                      }
                      className="w-full px-3 py-1.5 border border-slate-300 rounded-md bg-white text-xs"
                    />
                  </div>
                </div>
              </div>

              {/* Konfigurasi */}
              <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
                  <div>
                    <label className="text-slate-700 font-semibold block mb-1">Status Siklus</label>
                    <select
                      value={editForm.status}
                      onChange={(e) => setEditForm({ ...editForm, status: e.target.value as any })}
                      className="w-full px-3 py-1.5 border border-slate-300 rounded-md bg-white text-xs font-semibold"
                    >
                      <option value="DRAFT">DRAFT</option>
                      <option value="SCHEDULED">SCHEDULED</option>
                      <option value="ACTIVE">ACTIVE</option>
                      <option value="COMPLETED">COMPLETED</option>
                      <option value="ARCHIVED">ARCHIVED</option>
                    </select>
                  </div>

                  <div className="pt-4">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={editForm.is_default}
                        onChange={(e) => setEditForm({ ...editForm, is_default: e.target.checked })}
                        className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="font-medium text-slate-700">Semester Default Sistem</span>
                    </label>
                  </div>
                </div>

                <div>
                  <label className="text-slate-700 font-semibold block mb-1">
                    Catatan Administratif
                  </label>
                  <input
                    type="text"
                    value={editForm.administrative_notes}
                    onChange={(e) =>
                      setEditForm({ ...editForm, administrative_notes: e.target.value })
                    }
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-md bg-white text-xs"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setEditModalOpen(false)}
                  className="cursor-pointer text-xs"
                >
                  Batal
                </Button>
                <Button
                  type="submit"
                  disabled={updateMutation.isPending}
                  className="bg-blue-600 hover:bg-blue-700 text-white cursor-pointer text-xs"
                >
                  {updateMutation.isPending ? 'Menyimpan...' : 'Simpan Perubahan'}
                </Button>
              </div>
            </form>
          </ModalDialog>
        )}

        {/* =====================================================================
            MODAL 3: DETAIL & HISTORI AUDIT (READ - Section 5 & 11)
        ===================================================================== */}
        {detailModalOpen && selectedPeriod && (
          <ModalDialog
            open={detailModalOpen}
            onClose={() => setDetailModalOpen(false)}
            title={`Detail Periode: ${selectedPeriod.name}`}
          >
            <div className="space-y-4 text-xs">
              {/* Semester Card */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-sm font-bold px-2 py-0.5 bg-white text-slate-800 rounded border border-slate-200">
                    {selectedPeriod.code}
                  </span>
                  <div className="flex items-center gap-1.5">
                    {selectedPeriod.isDefault && (
                      <span className="inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded-full border border-emerald-200">
                        <Star className="w-3 h-3 fill-emerald-600" /> Default
                      </span>
                    )}
                    {renderStatusBadge(selectedPeriod.status)}
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-slate-200">
                  <div>
                    <span className="text-slate-400 block text-[11px]">Tahun Akademik</span>
                    <strong className="text-slate-800 font-mono">{selectedPeriod.academicYear}</strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[11px]">Tipe Semester</span>
                    <strong className="text-slate-800">{selectedPeriod.semesterType}</strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[11px]">Ruang Kelas Terkait</span>
                    <strong className="text-blue-700 font-mono">{selectedPeriod.classroomCount ?? 0} Kelas</strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[11px]">Penawaran Mata Kuliah</span>
                    <strong className="text-purple-700 font-mono">{selectedPeriod.courseOfferingCount ?? 0} MK</strong>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-200">
                  <div>
                    <span className="text-slate-400 block text-[11px]">Masa Perkuliahan</span>
                    <span className="font-semibold text-slate-800">
                      {formatDate(selectedPeriod.startDate)} s/d {formatDate(selectedPeriod.endDate)}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[11px]">Masa Persiapan</span>
                    <span className="text-slate-700">
                      {selectedPeriod.preparationStartDate
                        ? formatDate(selectedPeriod.preparationStartDate)
                        : '—'}
                    </span>
                  </div>
                </div>

                {selectedPeriod.administrativeNotes && (
                  <div className="pt-2 border-t border-slate-200">
                    <span className="text-slate-400 block text-[11px]">Catatan Administratif</span>
                    <p className="text-slate-700 mt-0.5">{selectedPeriod.administrativeNotes}</p>
                  </div>
                )}
              </div>

              {/* Section Audit History */}
              <div className="space-y-2">
                <h4 className="font-bold text-slate-800 text-xs flex items-center gap-1.5">
                  <History className="w-3.5 h-3.5 text-blue-600" /> Histori Audit & Perubahan Siklus
                </h4>

                {historyLoading ? (
                  <div className="p-4 text-center text-slate-400">Memuat riwayat audit...</div>
                ) : periodHistory.length === 0 ? (
                  <p className="p-4 text-center text-slate-400 italic bg-slate-50 rounded-lg border border-slate-100">
                    Belum ada catatan log audit tercatat untuk periode ini.
                  </p>
                ) : (
                  <div className="max-h-56 overflow-y-auto space-y-2 pr-1">
                    {periodHistory.map((log) => (
                      <div
                        key={log.id}
                        className="p-2.5 rounded-lg border border-slate-200 bg-white space-y-1"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-mono font-bold text-blue-700 text-[11px]">
                            {log.action}
                          </span>
                          <span className="text-[10px] text-slate-400 font-mono">
                            {new Date(log.createdAt).toLocaleString('id-ID')}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-[11px] text-slate-600">
                          <span>
                            Aktor: <strong>{log.actorName || log.actorEmail || 'Sistem'}</strong>
                          </span>
                          {log.ipAddress && (
                            <span className="font-mono text-[10px] text-slate-400">
                              IP: {log.ipAddress}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex justify-end pt-2 border-t border-slate-200">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setDetailModalOpen(false)}
                  className="cursor-pointer text-xs"
                >
                  Tutup
                </Button>
              </div>
            </div>
          </ModalDialog>
        )}

        {/* =====================================================================
            MODAL 4: HAPUS PERIODE AKADEMIK (DELETE - Section 5 Eligibility)
        ===================================================================== */}
        {deleteModalOpen && selectedPeriod && (
          <ModalDialog
            open={deleteModalOpen}
            onClose={() => setDeleteModalOpen(false)}
            title="Konfirmasi Hapus Periode Akademik"
          >
            <div className="space-y-4 text-xs">
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-800 flex items-start gap-2.5">
                <ShieldAlert className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold">Apakah Anda yakin ingin menghapus periode ini?</p>
                  <p className="text-[11px] text-red-700 mt-1">
                    Periode: <strong>{selectedPeriod.name}</strong> ({selectedPeriod.code})
                  </p>
                </div>
              </div>

              {/* Eligibility Check Display */}
              <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 space-y-2 text-xs">
                <p className="font-bold text-slate-800">Syarat Penghapusan Periode Akademik:</p>
                <ul className="space-y-1.5 text-slate-600">
                  <li className="flex items-center gap-1.5">
                    {(selectedPeriod.classroomCount ?? 0) === 0 ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-red-600" />
                    )}
                    <span>Tidak memiliki ruang kelas ({selectedPeriod.classroomCount ?? 0} kelas)</span>
                  </li>
                  <li className="flex items-center gap-1.5">
                    {(selectedPeriod.courseOfferingCount ?? 0) === 0 ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-red-600" />
                    )}
                    <span>
                      Tidak memiliki penawaran mata kuliah ({selectedPeriod.courseOfferingCount ?? 0} MK)
                    </span>
                  </li>
                  <li className="flex items-center gap-1.5">
                    {selectedPeriod.status.toUpperCase() === 'DRAFT' ||
                    selectedPeriod.status.toUpperCase() === 'SCHEDULED' ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-red-600" />
                    )}
                    <span>
                      Belum pernah aktif dalam perkuliahan (Status saat ini: {selectedPeriod.status})
                    </span>
                  </li>
                </ul>
              </div>

              {((selectedPeriod.classroomCount ?? 0) > 0 ||
                (selectedPeriod.courseOfferingCount ?? 0) > 0 ||
                ['ACTIVE', 'COMPLETED', 'ARCHIVED'].includes(selectedPeriod.status.toUpperCase())) && (
                <p className="text-amber-800 bg-amber-50 p-2.5 rounded border border-amber-200 text-[11px]">
                  <strong>Catatan Integritas Data:</strong> Periode ini memiliki dependensi historis
                  atau telah aktif. Penghapusan tidak diperkenankan demi menjaga integritas data akademik Politeknik Kampar.
                </p>
              )}

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setDeleteModalOpen(false)}
                  className="cursor-pointer text-xs"
                >
                  Batal
                </Button>
                <Button
                  size="sm"
                  disabled={
                    deleteMutation.isPending ||
                    (selectedPeriod.classroomCount ?? 0) > 0 ||
                    (selectedPeriod.courseOfferingCount ?? 0) > 0 ||
                    ['ACTIVE', 'COMPLETED', 'ARCHIVED'].includes(selectedPeriod.status.toUpperCase())
                  }
                  onClick={() => deleteMutation.mutate(selectedPeriod.id)}
                  className="bg-red-600 hover:bg-red-700 text-white cursor-pointer text-xs disabled:opacity-50"
                >
                  {deleteMutation.isPending ? 'Menghapus...' : 'Ya, Hapus Periode'}
                </Button>
              </div>
            </div>
          </ModalDialog>
        )}
      </div>
    </AppShell>
  );
}
export default AcademicPeriodsPage;
