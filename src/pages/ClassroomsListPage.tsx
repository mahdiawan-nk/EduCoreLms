import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Presentation,
  Plus,
  Search,
  Users,
  ChevronLeft,
  ChevronRight,
  KeyRound,
  Globe,
  Lock,
  BookOpen,
  SlidersHorizontal,
  LayoutGrid,
  Table as TableIcon,
  CheckCircle2,
  AlertTriangle,
  ArrowUpRight,
  RotateCcw,
} from 'lucide-react';
import { AppShell } from '../components/AppShell';
import {
  Button,
  Input,
  Card,
  Skeleton,
  EmptyState,
  ModalDialog,
} from '../components/ui/primitives';
import {
  ClassroomCard,
  ClassroomDirectoryItem,
} from '../components/classroom/ClassroomCard';
import { apiRequest } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { canPerformMutations, isAuditorUser } from '../lib/authorization';
import { toast } from 'sonner';

interface DirectoryMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  view: string;
  stats: Record<string, number>;
  filters: {
    studyPrograms: string[];
    academicPeriods: string[];
    lecturers: { id: string; fullName: string }[];
  };
}

interface ValidatedJoinPreview {
  valid: boolean;
  code: string;
  classroom: {
    id: string;
    name: string;
    section: string;
    courseCode: string;
    courseTitle: string;
    semesterName: string;
    visibility: 'PUBLIC' | 'PRIVATE';
    enrollmentPolicy: string;
    capacity: number;
    activeStudentCount: number;
    coverThumbnailPath?: string | null;
    description?: string | null;
    instructors: { fullName: string; isPrimary: boolean }[];
  };
}

export function ClassroomsListPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  const isSuperadmin = Boolean(
    user?.roles.some((r) => r.toUpperCase() === 'SUPERADMIN')
  );
  const isAuditor = isAuditorUser(user);
  const isDosen =
    !isSuperadmin &&
    !isAuditor &&
    Boolean(user?.roles.some((r) => r.toUpperCase() === 'DOSEN'));
  const isMahasiswa = !isSuperadmin && !isAuditor && !isDosen;
  const canMutate = canPerformMutations(user);

  // Role-specific view tabs
  const [dosenTab, setDosenTab] = useState<'owned' | 'co_taught'>('owned');
  const [layoutMode, setLayoutMode] = useState<'grid' | 'table'>('grid');
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  // Search & filters
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [studyProgramFilter, setStudyProgramFilter] = useState('ALL');
  const [academicPeriodFilter, setAcademicPeriodFilter] = useState('ALL');
  const [instructorFilter, setInstructorFilter] = useState('ALL');
  const [visibilityFilter, setVisibilityFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [page, setPage] = useState(1);

  // Public discovery search/page for Mahasiswa
  const [publicSearchInput, setPublicSearchInput] = useState('');
  const [debouncedPublicSearch, setDebouncedPublicSearch] = useState('');
  const [publicProgramFilter, setPublicProgramFilter] = useState('ALL');
  const [publicPage, setPublicPage] = useState(1);

  // Join flow state (2-step: validate -> preview -> confirm)
  const [joinModalOpen, setJoinModalOpen] = useState(false);
  const [joinCodeInput, setJoinCodeInput] = useState('');
  const [joinTargetHint, setJoinTargetHint] = useState<string | null>(null);
  const [validatingCode, setValidatingCode] = useState(false);
  const [joiningClass, setJoiningClass] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [validatedPreview, setValidatedPreview] =
    useState<ValidatedJoinPreview | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedPublicSearch(publicSearchInput.trim());
      setPublicPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [publicSearchInput]);

  // Handle ?joinCode=XYZ invitation links
  useEffect(() => {
    const codeParam = searchParams.get('joinCode');
    if (codeParam && isMahasiswa && canMutate) {
      setJoinCodeInput(codeParam.toUpperCase());
      setJoinModalOpen(true);
      void handleValidateCode(codeParam.toUpperCase());
      searchParams.delete('joinCode');
      setSearchParams(searchParams, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMahasiswa]);

  const primaryView =
    isSuperadmin || isAuditor
      ? 'superadmin'
      : isDosen
        ? dosenTab
        : 'enrolled';

  const primaryQueryParams = new URLSearchParams({
    view: primaryView,
    page: String(page),
    limit: '12',
  });
  if (debouncedSearch) primaryQueryParams.set('search', debouncedSearch);
  if (studyProgramFilter !== 'ALL')
    primaryQueryParams.set('studyProgram', studyProgramFilter);
  if (academicPeriodFilter !== 'ALL')
    primaryQueryParams.set('academicPeriod', academicPeriodFilter);
  if (instructorFilter !== 'ALL')
    primaryQueryParams.set('instructorId', instructorFilter);
  if (visibilityFilter !== 'ALL')
    primaryQueryParams.set('visibility', visibilityFilter);
  if (statusFilter !== 'ALL') primaryQueryParams.set('status', statusFilter);

  const primaryQuery = useQuery({
    queryKey: ['classrooms-directory', primaryQueryParams.toString()],
    queryFn: () =>
      apiRequest<ClassroomDirectoryItem[]>(
        `/classrooms?${primaryQueryParams.toString()}`
      ),
    enabled: !!user,
  });

  // Public Discovery Query (Mahasiswa only)
  const publicQueryParams = new URLSearchParams({
    view: 'public_discovery',
    page: String(publicPage),
    limit: '6',
  });
  if (debouncedPublicSearch)
    publicQueryParams.set('search', debouncedPublicSearch);
  if (publicProgramFilter !== 'ALL')
    publicQueryParams.set('studyProgram', publicProgramFilter);

  const publicDiscoveryQuery = useQuery({
    queryKey: ['classrooms-public-discovery', publicQueryParams.toString()],
    queryFn: () =>
      apiRequest<ClassroomDirectoryItem[]>(
        `/classrooms?${publicQueryParams.toString()}`
      ),
    enabled: !!user && isMahasiswa,
  });

  const primaryList = primaryQuery.data?.data || [];
  const primaryMeta = primaryQuery.data?.meta as DirectoryMeta | undefined;
  const stats = primaryMeta?.stats || {};
  const filterOpts = primaryMeta?.filters;

  const publicList = publicDiscoveryQuery.data?.data || [];
  const publicMeta = publicDiscoveryQuery.data?.meta as
    | DirectoryMeta
    | undefined;

  const resetFilters = () => {
    setSearchInput('');
    setDebouncedSearch('');
    setStudyProgramFilter('ALL');
    setAcademicPeriodFilter('ALL');
    setInstructorFilter('ALL');
    setVisibilityFilter('ALL');
    setStatusFilter('ALL');
    setPage(1);
  };

  const handleValidateCode = async (overrideCode?: string) => {
    const code = (overrideCode ?? joinCodeInput).trim().toUpperCase();
    if (!code) {
      setJoinError('Masukkan kode undangan terlebih dahulu.');
      return;
    }
    setJoinError(null);
    setValidatedPreview(null);
    try {
      setValidatingCode(true);
      const res = await apiRequest<ValidatedJoinPreview>(
        '/classrooms/join/validate',
        {
          method: 'POST',
          body: JSON.stringify({ code }),
        }
      );
      setValidatedPreview(res.data);
    } catch (err: any) {
      const msg = err?.message || 'Kode undangan tidak valid.';
      setJoinError(msg);
    } finally {
      setValidatingCode(false);
    }
  };

  const handleConfirmJoin = async () => {
    const code = (validatedPreview?.code || joinCodeInput).trim().toUpperCase();
    if (!code) return;
    try {
      setJoiningClass(true);
      const res = await apiRequest<{
        enrollment: { status: string };
        classroom: { id: string; name: string };
      }>('/classrooms/join', {
        method: 'POST',
        body: JSON.stringify({ code }),
      });

      queryClient.invalidateQueries({ queryKey: ['classrooms-directory'] });
      queryClient.invalidateQueries({
        queryKey: ['classrooms-public-discovery'],
      });

      setJoinModalOpen(false);
      setJoinCodeInput('');
      setValidatedPreview(null);
      setJoinError(null);

      if (res.data.enrollment.status === 'active') {
        toast.success(`Berhasil bergabung ke ${res.data.classroom.name}`);
        navigate(`/classrooms/${res.data.classroom.id}`);
      } else {
        toast.success(
          `Permintaan bergabung ke ${res.data.classroom.name} dikirim untuk persetujuan dosen.`
        );
      }
    } catch (err: any) {
      const msg = err?.message || 'Gagal bergabung ke ruang kelas.';
      setJoinError(msg);
      toast.error(msg);
    } finally {
      setJoiningClass(false);
    }
  };

  const openJoinModalForClassroom = (hintName?: string) => {
    setJoinTargetHint(hintName || null);
    setJoinCodeInput('');
    setJoinError(null);
    setValidatedPreview(null);
    setJoinModalOpen(true);
  };

  const headerActions = !canMutate ? null : isSuperadmin || isDosen ? (
    <Button
      type="button"
      onClick={() => navigate('/classrooms/new')}
      className="bg-[#14213D] hover:bg-[#1d2f54] text-white flex items-center gap-1.5 text-xs shadow-xs"
    >
      <Plus className="w-4 h-4" />
      Buat Ruang Kelas
    </Button>
  ) : (
    <Button
      type="button"
      onClick={() => openJoinModalForClassroom()}
      className="bg-[#14213D] hover:bg-[#1d2f54] text-white flex items-center gap-1.5 text-xs shadow-xs"
    >
      <KeyRound className="w-4 h-4" />
      Masukkan Kode Undangan
    </Button>
  );

  return (
    <AppShell
      breadcrumb="Ruang Kelas Digital"
      primaryAction={headerActions}
    >
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Ruang Kelas Digital</h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
              Kelola dan akses ruang kelas pembelajaran digital Politeknik Kampar.
            </p>
          </div>
        </div>
        {/* ================================================================= */}
        {/* ROLE-SPECIFIC HEADER & REAL POSTGRESQL STATISTICS                 */}
        {/* ================================================================= */}
        {(isSuperadmin || isAuditor) && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {[
              { label: 'Total Ruang Kelas', value: stats.totalClassrooms ?? 0, icon: Presentation, tone: 'bg-slate-100 text-slate-700' },
              { label: 'Kelas Aktif', value: stats.activeClassrooms ?? 0, icon: CheckCircle2, tone: 'bg-emerald-50 text-emerald-700' },
              { label: 'Kelas Publik', value: stats.publicClassrooms ?? 0, icon: Globe, tone: 'bg-sky-50 text-sky-700' },
              { label: 'Kelas Private', value: stats.privateClassrooms ?? 0, icon: Lock, tone: 'bg-indigo-50 text-indigo-700' },
              { label: 'Total Dosen Pengampu', value: stats.totalLecturers ?? 0, icon: BookOpen, tone: 'bg-amber-50 text-amber-700' },
              { label: 'Total Mahasiswa Terdaftar', value: stats.totalEnrolledStudents ?? 0, icon: Users, tone: 'bg-blue-50 text-blue-700' },
            ].map((kpi) => {
              const Icon = kpi.icon;
              return (
                <Card key={kpi.label} className="p-3.5 bg-white border-slate-200">
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center mb-2 ${kpi.tone}`}>
                    <Icon className="w-3.5 h-3.5" />
                  </div>
                  <p className="text-xl font-bold text-slate-900">{kpi.value}</p>
                  <p className="text-[11px] text-slate-500 font-medium truncate">{kpi.label}</p>
                </Card>
              );
            })}
          </div>
        )}

        {isDosen && (
          <>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h2 className="text-lg font-bold text-slate-900">
                  Ruang Kelas yang Saya Kelola
                </h2>
                <p className="text-xs text-slate-500">
                  Daftar ruang kelas digital yang dibuat dan dikelola oleh Anda.
                </p>
              </div>
              <div className="inline-flex p-1 bg-slate-100 rounded-lg border border-slate-200 self-start">
                <button
                  type="button"
                  onClick={() => {
                    setDosenTab('owned');
                    setPage(1);
                  }}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                    dosenTab === 'owned'
                      ? 'bg-white text-[#14213D] shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Dibuat oleh Saya ({stats.totalOwned ?? 0})
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDosenTab('co_taught');
                    setPage(1);
                  }}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                    dosenTab === 'co_taught'
                      ? 'bg-white text-[#14213D] shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Ditugaskan sebagai Co-Dosen ({stats.coTaughtCount ?? 0})
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {[
                { label: 'Total Kelas Saya', value: stats.totalOwned ?? 0, icon: Presentation, tone: 'bg-slate-100 text-slate-700' },
                { label: 'Kelas Aktif', value: stats.activeOwned ?? 0, icon: CheckCircle2, tone: 'bg-emerald-50 text-emerald-700' },
                { label: 'Kelas Publik', value: stats.publicOwned ?? 0, icon: Globe, tone: 'bg-sky-50 text-sky-700' },
                { label: 'Kelas Private', value: stats.privateOwned ?? 0, icon: Lock, tone: 'bg-indigo-50 text-indigo-700' },
                { label: 'Total Mahasiswa', value: stats.totalStudentsOwned ?? 0, icon: Users, tone: 'bg-blue-50 text-blue-700' },
                { label: 'Total Materi Terbit', value: stats.totalPublishedMaterialsOwned ?? 0, icon: BookOpen, tone: 'bg-amber-50 text-amber-700' },
              ].map((kpi) => {
                const Icon = kpi.icon;
                return (
                  <Card key={kpi.label} className="p-3.5 bg-white border-slate-200">
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center mb-2 ${kpi.tone}`}>
                      <Icon className="w-3.5 h-3.5" />
                    </div>
                    <p className="text-xl font-bold text-slate-900">{kpi.value}</p>
                    <p className="text-[11px] text-slate-500 font-medium truncate">{kpi.label}</p>
                  </Card>
                );
              })}
            </div>
          </>
        )}

        {isMahasiswa && (
          <div>
            <h2 className="text-lg font-bold text-slate-900">Pembelajaran Saya</h2>
            <p className="text-xs text-slate-500">
              Akses ruang kelas, pantau kemajuan belajar, dan lanjutkan aktivitas perkuliahan.
            </p>
          </div>
        )}

        {/* ================================================================= */}
        {/* SEARCH & FILTER TOOLBAR (PRIMARY SECTION)                         */}
        {/* ================================================================= */}
        <Card className="p-4 bg-white border-slate-200 space-y-3">
          <div className="flex flex-col sm:flex-row gap-2.5">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder={
                  isMahasiswa
                    ? 'Cari kelas yang Anda ikuti...'
                    : 'Cari nama kelas, kode mata kuliah, dosen, atau program studi...'
                }
                className="w-full pl-9 pr-3 py-2 text-xs sm:text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              />
            </div>

            <div className="flex items-center gap-2">
              {!isMahasiswa && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setMobileFiltersOpen((v) => !v)}
                  className="gap-1.5 text-xs sm:hidden"
                >
                  <SlidersHorizontal className="w-3.5 h-3.5" />
                  Filter
                </Button>
              )}

              {(isSuperadmin || isAuditor) && (
                <div className="hidden lg:inline-flex p-0.5 bg-slate-100 rounded-lg border border-slate-200">
                  <button
                    type="button"
                    onClick={() => setLayoutMode('grid')}
                    className={`p-1.5 rounded-md ${
                      layoutMode === 'grid'
                        ? 'bg-white text-[#14213D] shadow-xs'
                        : 'text-slate-500'
                    }`}
                    title="Tampilan Kartu"
                  >
                    <LayoutGrid className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setLayoutMode('table')}
                    className={`p-1.5 rounded-md ${
                      layoutMode === 'table'
                        ? 'bg-white text-[#14213D] shadow-xs'
                        : 'text-slate-500'
                    }`}
                    title="Tampilan Tabel"
                  >
                    <TableIcon className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          </div>

          {!isMahasiswa && (
            <div
              className={`${
                mobileFiltersOpen ? 'grid' : 'hidden sm:grid'
              } grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5 pt-2 border-t border-slate-100`}
            >
              {(isSuperadmin || isAuditor) && (
                <select
                  value={studyProgramFilter}
                  onChange={(e) => {
                    setStudyProgramFilter(e.target.value);
                    setPage(1);
                  }}
                  className="px-2.5 py-2 text-xs border border-slate-200 rounded-lg bg-white text-slate-700"
                >
                  <option value="ALL">Semua Program Studi</option>
                  {(filterOpts?.studyPrograms || []).map((sp) => (
                    <option key={sp} value={sp}>
                      {sp}
                    </option>
                  ))}
                </select>
              )}

              {(isSuperadmin || isAuditor) && (
                <select
                  value={instructorFilter}
                  onChange={(e) => {
                    setInstructorFilter(e.target.value);
                    setPage(1);
                  }}
                  className="px-2.5 py-2 text-xs border border-slate-200 rounded-lg bg-white text-slate-700"
                >
                  <option value="ALL">Semua Dosen</option>
                  {(filterOpts?.lecturers || []).map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.fullName}
                    </option>
                  ))}
                </select>
              )}

              <select
                value={academicPeriodFilter}
                onChange={(e) => {
                  setAcademicPeriodFilter(e.target.value);
                  setPage(1);
                }}
                className="px-2.5 py-2 text-xs border border-slate-200 rounded-lg bg-white text-slate-700"
              >
                <option value="ALL">Semua Periode Akademik</option>
                {(filterOpts?.academicPeriods || []).map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>

              <select
                value={visibilityFilter}
                onChange={(e) => {
                  setVisibilityFilter(e.target.value);
                  setPage(1);
                }}
                className="px-2.5 py-2 text-xs border border-slate-200 rounded-lg bg-white text-slate-700"
              >
                <option value="ALL">Semua Visibilitas</option>
                <option value="PUBLIC">Publik</option>
                <option value="PRIVATE">Private</option>
              </select>

              <div className="flex items-center gap-2">
                <select
                  value={statusFilter}
                  onChange={(e) => {
                    setStatusFilter(e.target.value);
                    setPage(1);
                  }}
                  className="flex-1 px-2.5 py-2 text-xs border border-slate-200 rounded-lg bg-white text-slate-700"
                >
                  <option value="ALL">Semua Status</option>
                  <option value="ACTIVE">Aktif</option>
                  <option value="INACTIVE">Nonaktif</option>
                  <option value="ARCHIVED">Diarsipkan</option>
                </select>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={resetFilters}
                  title="Reset Filter"
                  className="px-2"
                >
                  <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
                </Button>
              </div>
            </div>
          )}
        </Card>

        {/* ================================================================= */}
        {/* PRIMARY CLASSROOM LISTING (ENROLLED / OWNED / INSTITUTIONAL)      */}
        {/* ================================================================= */}
        {isMahasiswa && (
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
              Kelas Saya ({primaryMeta?.total ?? primaryList.length})
            </h3>
          </div>
        )}

        {primaryQuery.isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Skeleton key={i} className="h-64 rounded-xl" />
            ))}
          </div>
        ) : primaryQuery.isError ? (
          <Card className="p-8 text-center space-y-2 border-rose-200 bg-rose-50/40">
            <AlertTriangle className="w-8 h-8 text-rose-500 mx-auto" />
            <p className="text-sm font-semibold text-rose-900">
              Gagal memuat daftar ruang kelas
            </p>
            <Button
              size="sm"
              variant="outline"
              onClick={() => primaryQuery.refetch()}
            >
              Coba Lagi
            </Button>
          </Card>
        ) : primaryList.length === 0 ? (
          <EmptyState
            title={
              isMahasiswa
                ? 'Belum ada kelas yang diikuti'
                : isDosen && dosenTab === 'co_taught'
                  ? 'Belum ditugaskan sebagai Co-Dosen'
                  : 'Tidak ada ruang kelas ditemukan'
            }
            description={
              isMahasiswa
                ? 'Gunakan kode undangan dari dosen pengampu atau jelajahi kelas publik di bawah.'
                : 'Coba ubah filter pencarian atau buat ruang kelas digital baru.'
            }
            action={headerActions}
          />
        ) : (isSuperadmin || isAuditor) && layoutMode === 'table' ? (
          <Card className="overflow-hidden border-slate-200">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase font-semibold">
                  <tr>
                    <th className="py-3 px-4">Ruang Kelas</th>
                    <th className="py-3 px-4">Program Studi & Periode</th>
                    <th className="py-3 px-4">Pembuat & Pengampu</th>
                    <th className="py-3 px-4">Visibilitas & Status</th>
                    <th className="py-3 px-4">Kapasitas</th>
                    <th className="py-3 px-4 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {primaryList.map((cls) => (
                    <tr key={cls.id} className="hover:bg-slate-50/70">
                      <td className="py-3 px-4">
                        <p className="font-bold text-slate-900">{cls.name}</p>
                        <p className="text-slate-500 font-mono">
                          {cls.courseCode} • Kelas {cls.section}
                        </p>
                      </td>
                      <td className="py-3 px-4">
                        <p className="font-medium text-slate-800">{cls.studyProgram}</p>
                        <p className="text-slate-500">{cls.semesterName}</p>
                      </td>
                      <td className="py-3 px-4">
                        <p className="text-slate-800">Pembuat: {cls.creatorName}</p>
                        <p className="text-slate-500">
                          Pengampu: {cls.instructors.map((i) => i.fullName).join(', ') || '-'}
                        </p>
                      </td>
                      <td className="py-3 px-4 space-x-1.5">
                        <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 font-medium">
                          {cls.visibility}
                        </span>
                        <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-medium">
                          {cls.effectiveStatus}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-medium text-slate-700">
                        {cls.activeStudentCount} / {cls.capacity}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <Button
                          size="sm"
                          onClick={() => navigate(`/classrooms/${cls.id}`)}
                          className="bg-[#14213D] hover:bg-[#1d2f54] text-xs gap-1"
                        >
                          Masuk
                          <ArrowUpRight className="w-3.5 h-3.5" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {primaryList.map((cls) => (
              <ClassroomCard
                key={cls.id}
                item={cls}
                mode={
                  isSuperadmin || isAuditor
                    ? 'SUPERADMIN'
                    : isDosen
                      ? 'DOSEN'
                      : 'MAHASISWA_ENROLLED'
                }
                onOpenClassroom={(id) => navigate(`/classrooms/${id}`)}
                onOpenParticipants={(id) =>
                  navigate(`/classrooms/${id}/participants`)
                }
                onOpenSettings={(id) => navigate(`/classrooms/${id}?tab=settings`)}
                onOpenAnalytics={(id) =>
                  navigate(`/classrooms/${id}?tab=analytics`)
                }
              />
            ))}
          </div>
        )}

        {/* Primary Pagination */}
        {primaryMeta && primaryMeta.totalPages > 1 && (
          <div className="flex items-center justify-between text-xs text-slate-600 pt-2">
            <span>
              Halaman <strong>{primaryMeta.page}</strong> dari{' '}
              <strong>{primaryMeta.totalPages}</strong> ({primaryMeta.total} kelas)
            </span>
            <div className="flex items-center gap-2">
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
                disabled={page >= primaryMeta.totalPages}
                onClick={() =>
                  setPage((p) => Math.min(primaryMeta.totalPages, p + 1))
                }
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}

        {/* ================================================================= */}
        {/* MAHASISWA SECTION 2 & 3: PUBLIC DISCOVERY & JOIN BY INVITATION    */}
        {/* ================================================================= */}
        {isMahasiswa && (
          <div className="space-y-6 pt-4 border-t border-slate-200">
            {/* Section 3: Gabung Kelas Card */}
            {canMutate && (
              <Card className="p-5 bg-white border-slate-200">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                      <KeyRound className="w-4 h-4 text-[#14213D]" />
                      Gabung Kelas dengan Kode Undangan
                    </h3>
                    <p className="text-xs text-slate-500">
                      Masukkan kode undangan resmi dari dosen untuk mendaftar ke kelas Publik maupun Private.
                    </p>
                  </div>
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 md:w-96">
                    <Input
                      value={joinCodeInput}
                      onChange={(e) =>
                        setJoinCodeInput(e.target.value.toUpperCase())
                      }
                      placeholder="Contoh: PK-9X42"
                      className="font-mono uppercase"
                    />
                    <Button
                      type="button"
                      disabled={validatingCode}
                      onClick={() => {
                        setJoinModalOpen(true);
                        void handleValidateCode();
                      }}
                      className="bg-[#14213D] hover:bg-[#1d2f54] text-xs shrink-0"
                    >
                      {validatingCode ? 'Memeriksa...' : 'Verifikasi dan Gabung Kelas'}
                    </Button>
                  </div>
                </div>
              </Card>
            )}

            {/* Section 2: Temukan Kelas Publik */}
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <Globe className="w-4 h-4 text-sky-600" />
                    Temukan Kelas Publik ({publicMeta?.total ?? publicList.length})
                  </h3>
                  <p className="text-xs text-slate-500">
                    Daftar kelas berstatus Publik di Politeknik Kampar. Pendaftaran tetap memerlukan kode undangan.
                  </p>
                </div>
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={publicSearchInput}
                      onChange={(e) => setPublicSearchInput(e.target.value)}
                      placeholder="Cari kelas publik..."
                      className="pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg bg-white"
                    />
                  </div>
                  <select
                    value={publicProgramFilter}
                    onChange={(e) => {
                      setPublicProgramFilter(e.target.value);
                      setPublicPage(1);
                    }}
                    className="px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg bg-white text-slate-700"
                  >
                    <option value="ALL">Semua Program Studi</option>
                    {(publicMeta?.filters?.studyPrograms || []).map((sp) => (
                      <option key={sp} value={sp}>
                        {sp}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {publicDiscoveryQuery.isLoading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-56 rounded-xl" />
                  ))}
                </div>
              ) : publicList.length === 0 ? (
                <Card className="p-6 text-center text-xs text-slate-500">
                  Belum ada kelas publik yang tersedia saat ini.
                </Card>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {publicList.map((cls) => (
                    <ClassroomCard
                      key={cls.id}
                      item={cls}
                      mode="MAHASISWA_PUBLIC"
                      onOpenClassroom={(id) => navigate(`/classrooms/${id}`)}
                      onPromptJoinCode={(item) =>
                        openJoinModalForClassroom(item.name)
                      }
                    />
                  ))}
                </div>
              )}

              {publicMeta && publicMeta.totalPages > 1 && (
                <div className="flex items-center justify-end gap-2 text-xs">
                  <span>
                    Halaman {publicMeta.page} / {publicMeta.totalPages}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={publicPage <= 1}
                    onClick={() => setPublicPage((p) => Math.max(1, p - 1))}
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={publicPage >= publicMeta.totalPages}
                    onClick={() =>
                      setPublicPage((p) =>
                        Math.min(publicMeta.totalPages, p + 1)
                      )
                    }
                  >
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* =================================================================== */}
      {/* 2-STEP INVITATION CODE VALIDATION & CONFIRMATION MODAL              */}
      {/* =================================================================== */}
      <ModalDialog
        open={joinModalOpen}
        onClose={() => {
          setJoinModalOpen(false);
          setValidatedPreview(null);
          setJoinError(null);
        }}
        title="Gabung Ruang Kelas dengan Kode Undangan"
        description={
          joinTargetHint
            ? `Masukkan kode undangan resmi untuk bergabung ke ${joinTargetHint}.`
            : 'Masukkan kode undangan yang diberikan oleh Dosen Pengampu.'
        }
      >
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Input
              value={joinCodeInput}
              onChange={(e) => {
                setJoinCodeInput(e.target.value.toUpperCase());
                setJoinError(null);
              }}
              placeholder="Kode Undangan (misal: PK-9X42)"
              className="font-mono uppercase flex-1"
            />
            <Button
              type="button"
              variant="outline"
              disabled={validatingCode || !joinCodeInput.trim()}
              onClick={() => void handleValidateCode()}
            >
              {validatingCode ? 'Memeriksa...' : 'Validasi'}
            </Button>
          </div>

          {joinError && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-2 text-xs text-rose-800">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{joinError}</span>
            </div>
          )}

          {validatedPreview && (
            <div className="p-4 bg-emerald-50/70 border border-emerald-200 rounded-xl space-y-2.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5 font-bold text-emerald-900">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  Kode Undangan Valid
                </span>
                <span className="px-2 py-0.5 rounded-full bg-white border border-emerald-200 text-emerald-800 font-medium">
                  {validatedPreview.classroom.visibility}
                </span>
              </div>
              <div>
                <p className="text-sm font-bold text-slate-900">
                  {validatedPreview.classroom.name}
                </p>
                <p className="text-slate-600">
                  {validatedPreview.classroom.courseCode} • Kelas{' '}
                  {validatedPreview.classroom.section} •{' '}
                  {validatedPreview.classroom.semesterName}
                </p>
                <p className="text-slate-600 mt-0.5">
                  Dosen:{' '}
                  {validatedPreview.classroom.instructors
                    .map((i) => i.fullName)
                    .join(', ') || '-'}
                </p>
                <p className="text-slate-600">
                  Kapasitas: {validatedPreview.classroom.activeStudentCount} /{' '}
                  {validatedPreview.classroom.capacity} Mahasiswa
                </p>
              </div>
              <div className="pt-2 flex justify-end gap-2">
                <Button
                  type="button"
                  disabled={joiningClass}
                  onClick={handleConfirmJoin}
                  className="bg-[#14213D] hover:bg-[#1d2f54] text-xs"
                >
                  {joiningClass
                    ? 'Memproses Pendaftaran...'
                    : validatedPreview.classroom.enrollmentPolicy === 'AUTO'
                      ? 'Konfirmasi & Masuk Kelas'
                      : 'Konfirmasi Ajukan Pendaftaran'}
                </Button>
              </div>
            </div>
          )}

          <div className="flex justify-end pt-1">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setJoinModalOpen(false)}
            >
              Tutup
            </Button>
          </div>
        </div>
      </ModalDialog>
    </AppShell>
  );
}
