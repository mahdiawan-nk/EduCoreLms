import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import {
  Plus,
  Search,
  KeyRound,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Shield,
  Users,
  BookOpen,
  History,
  Check,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { AppShell } from '../components/AppShell';
import {
  Button,
  Input,
  Textarea,
  Card,
  Skeleton,
  EmptyState,
  ModalDialog,
  ConfirmDialog,
} from '../components/ui/primitives';
import { apiRequest } from '../lib/api';
import { formatDateTime } from '../lib/utils';
import { toast } from 'sonner';

interface ClassroomSummary {
  id: string;
  name: string;
  section: string;
  roomNumber: string;
  scheduleText: string;
  capacity: number;
  enrollmentPolicy: 'AUTO' | 'APPROVAL_REQUIRED';
  status: string;
  courseCode: string;
  courseTitle: string;
  studyProgram: string;
  credits: number;
  semesterName: string;
  instructors: { instructorId: string; fullName: string; isPrimary: boolean }[];
  activeStudentCount: number;
  pendingEnrollmentCount: number;
  joinCode: string | null;
  myEnrollmentStatus: string | null;
  isInstructor: boolean;
  canManage: boolean;
  canEnter: boolean;
}

export function DashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const isSuperadmin = user?.roles.includes('SUPERADMIN') ?? false;
  const isDosen = user?.roles.includes('DOSEN') ?? false;

  // Superadmin sub-view tab
  const [adminTab, setAdminTab] = useState<
    'classrooms' | 'users' | 'rbac' | 'academic' | 'audit'
  >('classrooms');

  // Classroom filter & search state
  const [scope, setScope] = useState<'mine' | 'all'>(
    isSuperadmin ? 'all' : 'mine'
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [classPage, setClassPage] = useState(1);

  // Users filter & pagination state (Superadmin)
  const [userSearch, setUserSearch] = useState('');
  const [userRoleFilter, setUserRoleFilter] = useState('');
  const [userPage, setUserPage] = useState(1);
  const [auditPage, setAuditPage] = useState(1);

  // Modals
  const [joinModalOpen, setJoinModalOpen] = useState(false);
  const [joinCodeInput, setJoinCodeInput] = useState('');
  const [createClassModalOpen, setCreateClassModalOpen] = useState(false);
  const [createUserModalOpen, setCreateUserModalOpen] = useState(false);
  const [createCourseModalOpen, setCreateCourseModalOpen] = useState(false);
  const [userStatusConfirm, setUserStatusConfirm] = useState<{
    id: string;
    fullName: string;
    nextActive: boolean;
  } | null>(null);

  // Queries
  const classroomsQuery = useQuery({
    queryKey: ['classrooms', scope, searchQuery, classPage],
    queryFn: () =>
      apiRequest<ClassroomSummary[]>(
        `/classrooms?scope=${scope}&search=${encodeURIComponent(
          searchQuery
        )}&page=${classPage}&limit=9`
      ),
  });

  const academicQuery = useQuery({
    queryKey: ['academic-overview'],
    queryFn: () =>
      apiRequest<{
        academicYears: {
          id: string;
          name: string;
          startDate: string;
          endDate: string;
          isCurrent: boolean;
        }[];
        semesters: {
          id: string;
          name: string;
          termType: string;
          isActive: boolean;
        }[];
        courses: {
          id: string;
          code: string;
          title: string;
          studyProgram: string;
          credits: number;
          semesterNumber: number;
          description: string;
        }[];
      }>('/academic/overview'),
  });

  const usersQuery = useQuery({
    queryKey: ['admin-users', userSearch, userRoleFilter, userPage],
    queryFn: () =>
      apiRequest<
        {
          id: string;
          email: string;
          fullName: string;
          identityNumber: string | null;
          isActive: boolean;
          lastLoginAt: string | null;
          studyProgram: string;
          roles: string[];
        }[]
      >(
        `/users?page=${userPage}&limit=8&search=${encodeURIComponent(
          userSearch
        )}&role=${encodeURIComponent(userRoleFilter)}`
      ),
    enabled: isSuperadmin && adminTab === 'users',
  });

  const rbacQuery = useQuery({
    queryKey: ['admin-rbac'],
    queryFn: () =>
      apiRequest<{
        roles: {
          id: string;
          code: string;
          name: string;
          description: string;
          permissionIds: string[];
        }[];
        permissions: {
          id: string;
          code: string;
          module: string;
          description: string;
        }[];
      }>('/rbac/roles'),
    enabled: isSuperadmin && adminTab === 'rbac',
  });

  const auditQuery = useQuery({
    queryKey: ['admin-audit', auditPage],
    queryFn: () =>
      apiRequest<
        {
          id: string;
          action: string;
          entityType: string;
          entityId: string | null;
          ipAddress: string | null;
          createdAt: string;
          actorName: string | null;
          actorEmail: string | null;
        }[]
      >(`/audit-logs?page=${auditPage}&limit=10`),
    enabled: isSuperadmin && adminTab === 'audit',
  });

  // Mutations
  const joinMutation = useMutation({
    mutationFn: (code: string) =>
      apiRequest<{
        enrollment: { status: string };
        classroom: { id: string; name: string };
      }>('/classrooms/join', {
        method: 'POST',
        body: JSON.stringify({ code }),
      }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['classrooms'] });
      setJoinModalOpen(false);
      setJoinCodeInput('');
      if (res.data.enrollment.status === 'active') {
        toast.success(
          `Berhasil bergabung secara aktif ke ${res.data.classroom.name}`
        );
        navigate(`/classrooms/${res.data.classroom.id}`);
      } else {
        toast.success(
          `Permohonan bergabung ke ${res.data.classroom.name} terkirim dan menunggu persetujuan Dosen.`
        );
      }
    },
    onError: (err: any) => {
      toast.error(err.message || 'Gagal bergabung ke kelas');
    },
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-rbac'] });
      toast.success('Matriks izin RBAC berhasil diperbarui');
    },
    onError: (err: any) => {
      toast.error(err.message || 'Gagal memperbarui izin RBAC');
    },
  });

  const toggleUserStatusMutation = useMutation({
    mutationFn: (payload: { id: string; isActive: boolean }) =>
      apiRequest(`/users/${payload.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: payload.isActive }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      setUserStatusConfirm(null);
      toast.success('Status akun pengguna berhasil diperbarui');
    },
    onError: (err: any) => {
      toast.error(err.message || 'Gagal mengubah status akun');
    },
  });

  // Forms
  const createClassForm = useForm({
    defaultValues: {
      courseId: '',
      semesterId: '',
      name: '',
      section: 'Kelas Reguler A',
      roomNumber: 'Lab Komputer Gd. Utama Lt. 2',
      scheduleText: 'Senin, 08:00 – 10:30 WIB',
      capacity: 30,
      enrollmentPolicy: 'AUTO' as 'AUTO' | 'APPROVAL_REQUIRED',
      description: '',
    },
  });

  const createClassMutation = useMutation({
    mutationFn: (values: any) =>
      apiRequest<{ id: string; name: string; joinCode: string }>(
        '/classrooms',
        {
          method: 'POST',
          body: JSON.stringify({
            ...values,
            capacity: Number(values.capacity),
          }),
        }
      ),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['classrooms'] });
      setCreateClassModalOpen(false);
      createClassForm.reset();
      toast.success(
        `Ruang kelas "${res.data.name}" berhasil dibuat (Kode: ${res.data.joinCode})`
      );
      navigate(`/classrooms/${res.data.id}`);
    },
    onError: (err: any) => {
      toast.error(err.message || 'Gagal membuat ruang kelas baru');
    },
  });

  const createUserForm = useForm({
    defaultValues: {
      fullName: '',
      email: '',
      identityNumber: '',
      password: 'PolkamUser#2026',
      roleCode: 'MAHASISWA' as 'SUPERADMIN' | 'DOSEN' | 'MAHASISWA',
      studyProgram: 'Teknik Informatika',
    },
  });

  const createUserMutation = useMutation({
    mutationFn: (values: any) =>
      apiRequest('/users', {
        method: 'POST',
        body: JSON.stringify(values),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      setCreateUserModalOpen(false);
      createUserForm.reset();
      toast.success('Akun pengguna baru berhasil dibuat dengan Argon2id');
    },
    onError: (err: any) => {
      toast.error(err.message || 'Gagal membuat pengguna baru');
    },
  });

  const createCourseForm = useForm({
    defaultValues: {
      code: '',
      title: '',
      studyProgram: 'Teknik Informatika',
      credits: 3,
      semesterNumber: 3,
      description: '',
    },
  });

  const createCourseMutation = useMutation({
    mutationFn: (values: any) =>
      apiRequest('/academic/courses', {
        method: 'POST',
        body: JSON.stringify({
          ...values,
          credits: Number(values.credits),
          semesterNumber: Number(values.semesterNumber),
        }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['academic-overview'] });
      setCreateCourseModalOpen(false);
      createCourseForm.reset();
      toast.success('Mata kuliah master berhasil ditambahkan');
    },
    onError: (err: any) => {
      toast.error(err.message || 'Gagal menambahkan mata kuliah');
    },
  });

  const classroomsList = classroomsQuery.data?.data || [];
  const classroomsMeta = classroomsQuery.data?.meta;
  const coursesList = academicQuery.data?.data?.courses || [];
  const semestersList = academicQuery.data?.data?.semesters || [];

  const totalActiveStudents = classroomsList.reduce(
    (acc, c) => acc + c.activeStudentCount,
    0
  );
  const totalPendingApprovals = classroomsList.reduce(
    (acc, c) => acc + c.pendingEnrollmentCount,
    0
  );

  // Header Primary Action based on Actor Role
  const primaryAction =
    isSuperadmin || isDosen ? (
      <div className="flex items-center gap-2 flex-wrap">
        {isSuperadmin && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => navigate('/academic-periods')}
            className="flex items-center gap-1.5 text-xs text-blue-700 border-blue-200 hover:bg-blue-50"
          >
            <BookOpen className="h-4 w-4" />
            <span>Master Periode & Kalender</span>
          </Button>
        )}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => navigate('/catalog')}
          className="flex items-center gap-1.5 text-xs text-slate-700"
        >
          <Search className="h-4 w-4" />
          <span>Katalog Perkuliahan</span>
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={() => navigate('/classrooms/new')}
          className="bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-1.5"
        >
          <Plus className="h-4 w-4" />
          <span>Buat Kelas (Wizard)</span>
        </Button>
      </div>
    ) : (
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => navigate('/catalog')}
          className="flex items-center gap-1.5 text-xs"
        >
          <Search className="h-4 w-4" />
          <span>Katalog Kelas (KRS)</span>
        </Button>
        <Button
          type="button"
          variant="accent"
          size="sm"
          onClick={() => setJoinModalOpen(true)}
          className="flex items-center gap-1.5 text-xs"
        >
          <KeyRound className="h-4 w-4" />
          <span>Gabung via Kode</span>
        </Button>
      </div>
    );

  return (
    <AppShell
      breadcrumb={
        isSuperadmin
          ? 'Dashboard Superadmin'
          : isDosen
            ? 'Dashboard Dosen Pengampu'
            : 'Dashboard Mahasiswa'
      }
      primaryAction={primaryAction}
    >
      {/* Role-Specific Hero Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-8 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span>
              {isSuperadmin
                ? 'Otoritas Superadmin Sistem'
                : isDosen
                  ? 'Portal Akademik Dosen Pengampu'
                  : 'Portal Pembelajaran Mahasiswa'}
            </span>
            <span aria-hidden="true">·</span>
            <span>Semester Ganjil 2026/2027</span>
            <span aria-hidden="true">·</span>
            <span>{user?.studyProgram}</span>
          </div>
          <h1 className="mt-2 text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
            Selamat bertugas, {user?.fullName}
          </h1>
          <p className="mt-1.5 text-sm text-slate-600 max-w-2xl">
            {isSuperadmin
              ? 'Kelola seluruh pengguna, matriks izin RBAC, kurikulum mata kuliah master, pemantauan ruang kelas digital, serta log audit keamanan Politeknik Kampar.'
              : isDosen
                ? 'Kelola ruang kelas yang Anda ampu, terbitkan materi & tugas praktikum, verifikasi permohonan pendaftaran mahasiswa, serta kelola buku nilai terpadu.'
                : 'Akses materi perkuliahan, kumpulkan tugas praktikum, kerjakan kuis evaluasi, dan pantau perkembangan nilai akademik Anda secara langsung.'}
          </p>
        </div>

        {/* Summary Metric Strip (Single-Elevation Stat Grid) */}
        <div className="grid grid-cols-3 gap-6 rounded-xl border border-slate-200 bg-white px-6 py-4 shrink-0">
          <div>
            <p className="text-xs text-slate-500">Ruang Kelas</p>
            <p className="mt-1 text-xl font-bold font-mono tabular-nums text-slate-900">
              {classroomsMeta?.total ?? classroomsList.length}
            </p>
          </div>
          <div className="border-l border-slate-200 pl-6">
            <p className="text-xs text-slate-500">
              {isSuperadmin || isDosen ? 'Mahasiswa Aktif' : 'Mata Kuliah'}
            </p>
            <p className="mt-1 text-xl font-bold font-mono tabular-nums text-slate-900">
              {isSuperadmin || isDosen
                ? totalActiveStudents
                : coursesList.length}
            </p>
          </div>
          <div className="border-l border-slate-200 pl-6">
            <p className="text-xs text-slate-500">
              {isSuperadmin || isDosen ? 'Menunggu Approval' : 'Status Sesi'}
            </p>
            <p className="mt-1 text-xl font-bold font-mono tabular-nums text-amber-700">
              {isSuperadmin || isDosen ? totalPendingApprovals : 'Aktif'}
            </p>
          </div>
        </div>
      </div>

      {/* SUPERADMIN MULTI-MODULE SWITCHER */}
      {isSuperadmin && (
        <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-200/70 rounded-lg">
            <button
              type="button"
              onClick={() => setAdminTab('classrooms')}
              className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                adminTab === 'classrooms'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Semua Ruang Kelas
            </button>
            <button
              type="button"
              onClick={() => setAdminTab('users')}
              className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                adminTab === 'users'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Manajemen Pengguna
            </button>
            <button
              type="button"
              onClick={() => setAdminTab('rbac')}
              className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                adminTab === 'rbac'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Matriks Peran & RBAC
            </button>
            <button
              type="button"
              onClick={() => setAdminTab('academic')}
              className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                adminTab === 'academic'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Kurikulum & Mata Kuliah
            </button>
            <button
              type="button"
              onClick={() => setAdminTab('audit')}
              className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                adminTab === 'audit'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Log Audit Keamanan
            </button>
          </div>
        </div>
      )}

      {/* =====================================================================
          VIEW 1: CLASSROOMS WORKSPACE (DEFAULT FOR ALL ACTORS)
      ===================================================================== */}
      {(!isSuperadmin || adminTab === 'classrooms') && (
        <section className="mt-6">
          {/* Filter Bar & Search */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-1 p-1 bg-slate-200/70 rounded-lg self-start">
              <button
                type="button"
                onClick={() => {
                  setScope('mine');
                  setClassPage(1);
                }}
                className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                  scope === 'mine'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {isDosen
                  ? 'Kelas yang Saya Ampu'
                  : isSuperadmin
                    ? 'Kelas Terdaftar'
                    : 'Kelas Saya'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setScope('all');
                  setClassPage(1);
                }}
                className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                  scope === 'all'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Katalog Seluruh Kelas Politeknik Kampar
              </button>
            </div>

            <div className="relative w-full sm:w-80">
              <Search className="h-4 w-4 text-slate-400 absolute left-3 top-3" />
              <Input
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setClassPage(1);
                }}
                placeholder="Cari kode, nama kelas, atau prodi..."
                className="pl-9"
              />
            </div>
          </div>

          {/* Classrooms Grid */}
          {classroomsQuery.isLoading ? (
            <div className="mt-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[1, 2, 3].map((n) => (
                <Skeleton key={n} className="h-64 w-full" />
              ))}
            </div>
          ) : classroomsList.length === 0 ? (
            <div className="mt-6">
              <EmptyState
                title="Tidak Ada Ruang Kelas Ditemukan"
                description={
                  scope === 'mine'
                    ? 'Anda belum terdaftar pada ruang kelas apa pun atau pencarian tidak cocok. Gunakan kode kelas untuk bergabung atau beralih ke Katalog Seluruh Kelas.'
                    : 'Tidak ada ruang kelas yang cocok dengan kata kunci pencarian Anda.'
                }
                action={
                  !isSuperadmin && !isDosen ? (
                    <Button
                      type="button"
                      variant="accent"
                      onClick={() => setJoinModalOpen(true)}
                    >
                      <KeyRound className="h-4 w-4" />
                      <span>Gabung Kelas dengan Kode</span>
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      onClick={() => setCreateClassModalOpen(true)}
                    >
                      <Plus className="h-4 w-4" />
                      <span>Buat Ruang Kelas Baru</span>
                    </Button>
                  )
                }
              />
            </div>
          ) : (
            <div className="mt-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {classroomsList.map((cls) => {
                const primaryInstructor =
                  cls.instructors.find((i) => i.isPrimary) ||
                  cls.instructors[0];

                return (
                  <Card
                    key={cls.id}
                    className="flex flex-col justify-between p-6 hover:border-slate-300 transition-colors"
                  >
                    <div>
                      {/* Unboxed Metadata Kicker (Zero-Pill Discipline) */}
                      <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                        <span className="font-mono font-semibold text-slate-700 tabular-nums">
                          {cls.courseCode}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>{cls.studyProgram}</span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums">
                          {cls.credits} SKS
                        </span>
                      </div>

                      <h3 className="mt-2 text-lg font-bold text-slate-900 leading-snug">
                        {cls.name}
                      </h3>
                      <p className="mt-1 text-xs text-slate-600">
                        {cls.section} · {cls.roomNumber}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        Jadwal: {cls.scheduleText}
                      </p>

                      <div className="mt-4 pt-4 border-t border-slate-100 space-y-1.5 text-xs text-slate-600">
                        <p>
                          <span className="text-slate-500">Pengampu: </span>
                          <span className="font-medium text-slate-800">
                            {primaryInstructor?.fullName || 'Tim Dosen'}
                          </span>
                        </p>
                        <div className="flex items-center justify-between">
                          <span>
                            Kapasitas:{' '}
                            <strong className="font-mono tabular-nums text-slate-900">
                              {cls.activeStudentCount} / {cls.capacity}
                            </strong>{' '}
                            mahasiswa
                          </span>
                          <span>
                            Kebijakan:{' '}
                            <strong className="text-slate-800">
                              {cls.enrollmentPolicy === 'AUTO'
                                ? 'Otomatis'
                                : 'Persetujuan Dosen'}
                            </strong>
                          </span>
                        </div>
                        {cls.joinCode && (
                          <p className="text-xs text-amber-700 font-medium">
                            Kode Gabung Aktif:{' '}
                            <span className="font-mono tabular-nums font-semibold">
                              {cls.joinCode}
                            </span>
                          </p>
                        )}
                        {cls.pendingEnrollmentCount > 0 && (
                          <p className="text-xs font-medium text-amber-700">
                            {cls.pendingEnrollmentCount} mahasiswa menunggu persetujuan
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between gap-3">
                      <span className="text-xs text-slate-500">
                        {cls.canManage
                          ? 'Akses Instruktur Penuh'
                          : cls.myEnrollmentStatus === 'active'
                            ? 'Terdaftar Aktif'
                            : cls.myEnrollmentStatus === 'pending'
                              ? 'Menunggu Persetujuan Dosen'
                              : 'Belum Terdaftar'}
                      </span>

                      {cls.canEnter ? (
                        <div className="flex items-center gap-1.5">
                          {cls.canManage && (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={(e) => {
                                e.stopPropagation();
                                navigate(`/classrooms/${cls.id}/participants`);
                              }}
                              className="text-xs px-2.5 h-8 text-slate-600"
                            >
                              <Users className="h-3.5 w-3.5 mr-1" />
                              <span>Peserta</span>
                            </Button>
                          )}
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => navigate(`/classrooms/${cls.id}`)}
                          >
                            <span>Masuk Kelas</span>
                            <ArrowUpRight className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      ) : cls.myEnrollmentStatus === 'pending' ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled
                        >
                          Menunggu Persetujuan
                        </Button>
                      ) : (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => setJoinModalOpen(true)}
                        >
                          Gabung dengan Kode
                        </Button>
                      )}
                    </div>
                  </Card>
                );
              })}
            </div>
          )}

          {/* Pagination */}
          {classroomsMeta && (classroomsMeta.totalPages || 1) > 1 && (
            <div className="mt-8 flex items-center justify-between border-t border-slate-200 pt-4 text-xs text-slate-600">
              <span>
                Halaman{' '}
                <strong className="font-mono tabular-nums">
                  {classroomsMeta.page}
                </strong>{' '}
                dari{' '}
                <strong className="font-mono tabular-nums">
                  {classroomsMeta.totalPages}
                </strong>{' '}
                ({classroomsMeta.total} ruang kelas)
              </span>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={classPage <= 1}
                  onClick={() => setClassPage((p) => Math.max(1, p - 1))}
                >
                  <ChevronLeft className="h-4 w-4" />
                  <span>Sebelumnya</span>
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={classPage >= (classroomsMeta.totalPages || 1)}
                  onClick={() => setClassPage((p) => p + 1)}
                >
                  <span>Berikutnya</span>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </section>
      )}

      {/* =====================================================================
          VIEW 2: SUPERADMIN USER MANAGEMENT
      ===================================================================== */}
      {isSuperadmin && adminTab === 'users' && (
        <section className="mt-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative w-72">
                <Search className="h-4 w-4 text-slate-400 absolute left-3 top-3" />
                <Input
                  value={userSearch}
                  onChange={(e) => {
                    setUserSearch(e.target.value);
                    setUserPage(1);
                  }}
                  placeholder="Cari nama, email, NIM/NIDN..."
                  className="pl-9"
                />
              </div>
              <div className="flex items-center gap-1 p-1 bg-slate-200/70 rounded-lg">
                {(['', 'SUPERADMIN', 'DOSEN', 'MAHASISWA'] as const).map(
                  (r) => (
                    <button
                      key={r || 'ALL'}
                      type="button"
                      onClick={() => {
                        setUserRoleFilter(r);
                        setUserPage(1);
                      }}
                      className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                        userRoleFilter === r
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {r === '' ? 'Semua Peran' : r}
                    </button>
                  )
                )}
              </div>
            </div>

            <Button
              type="button"
              size="sm"
              onClick={() => setCreateUserModalOpen(true)}
            >
              <Users className="h-4 w-4" />
              <span>Tambah Pengguna Baru</span>
            </Button>
          </div>

          <Card className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80 text-xs font-semibold text-slate-600">
                  <th className="py-3 px-4">Nama Lengkap & Email</th>
                  <th className="py-3 px-4">Identitas (NIM/NIDN/NIP)</th>
                  <th className="py-3 px-4">Program Studi / Unit</th>
                  <th className="py-3 px-4">Peran RBAC</th>
                  <th className="py-3 px-4">Status Akun</th>
                  <th className="py-3 px-4 text-right">Tindakan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-sm">
                {(usersQuery.data?.data || []).map((u) => (
                  <tr key={u.id} className="hover:bg-slate-50/80">
                    <td className="py-3 px-4">
                      <p className="font-semibold text-slate-900">
                        {u.fullName}
                      </p>
                      <p className="text-xs text-slate-500">{u.email}</p>
                    </td>
                    <td className="py-3 px-4 font-mono text-xs tabular-nums text-slate-700">
                      {u.identityNumber || '—'}
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-600">
                      {u.studyProgram}
                    </td>
                    <td className="py-3 px-4 text-xs font-medium text-slate-800">
                      {u.roles.join(' · ')}
                    </td>
                    <td className="py-3 px-4 text-xs">
                      <span
                        className={
                          u.isActive
                            ? 'font-medium text-emerald-700'
                            : 'font-medium text-red-700'
                        }
                      >
                        {u.isActive ? 'Aktif' : 'Nonaktif'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      {u.id !== user?.id && (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            setUserStatusConfirm({
                              id: u.id,
                              fullName: u.fullName,
                              nextActive: !u.isActive,
                            })
                          }
                        >
                          {u.isActive ? 'Nonaktifkan' : 'Aktifkan'}
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </section>
      )}

      {/* =====================================================================
          VIEW 3: SUPERADMIN RBAC PERMISSION REGISTRY & MATRIX
      ===================================================================== */}
      {isSuperadmin && adminTab === 'rbac' && (
        <section className="mt-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-900">
                Matriks Peran & Registri Izin (Deny-by-Default RBAC)
              </h2>
              <p className="text-xs text-slate-600">
                Klik kotak izin pada peran Dosen atau Mahasiswa untuk memperbarui hak akses secara langsung di PostgreSQL.
              </p>
            </div>
          </div>

          <Card className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80 text-xs font-semibold text-slate-600">
                  <th className="py-3 px-4">Kode Izin</th>
                  <th className="py-3 px-4">Modul</th>
                  <th className="py-3 px-4">Deskripsi Kebijakan</th>
                  {(rbacQuery.data?.data?.roles || []).map((role) => (
                    <th key={role.id} className="py-3 px-4 text-center">
                      {role.code}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-xs">
                {(rbacQuery.data?.data?.permissions || []).map((perm) => (
                  <tr key={perm.id} className="hover:bg-slate-50/70">
                    <td className="py-2.5 px-4 font-mono font-semibold text-slate-900">
                      {perm.code}
                    </td>
                    <td className="py-2.5 px-4 text-slate-600">
                      {perm.module}
                    </td>
                    <td className="py-2.5 px-4 text-slate-600">
                      {perm.description}
                    </td>
                    {(rbacQuery.data?.data?.roles || []).map((role) => {
                      const hasPerm = role.permissionIds.includes(perm.id);
                      const isLockedSuperadmin = role.code === 'SUPERADMIN';
                      return (
                        <td
                          key={role.id}
                          className="py-2.5 px-4 text-center"
                        >
                          <button
                            type="button"
                            disabled={
                              isLockedSuperadmin ||
                              togglePermissionMutation.isPending
                            }
                            onClick={() =>
                              togglePermissionMutation.mutate({
                                roleId: role.id,
                                permissionId: perm.id,
                                enabled: !hasPerm,
                              })
                            }
                            className={`inline-flex h-6 w-6 items-center justify-center rounded border transition-colors cursor-pointer ${
                              hasPerm
                                ? 'border-slate-900 bg-slate-900 text-white'
                                : 'border-slate-300 bg-white text-transparent hover:border-slate-500'
                            } ${
                              isLockedSuperadmin
                                ? 'opacity-60 cursor-not-allowed'
                                : ''
                            }`}
                            aria-label={`Toggle ${perm.code} untuk ${role.code}`}
                          >
                            <Check className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </section>
      )}

      {/* =====================================================================
          VIEW 4: SUPERADMIN ACADEMIC YEARS, SEMESTERS & MASTER COURSES
      ===================================================================== */}
      {isSuperadmin && adminTab === 'academic' && (
        <section className="mt-6 space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-900">
                Kurikulum Mata Kuliah Master & Tahun Akademik
              </h2>
              <p className="text-xs text-slate-600">
                Satu mata kuliah master dapat memiliki banyak ruang kelas digital pada setiap semester.
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              onClick={() => setCreateCourseModalOpen(true)}
            >
              <BookOpen className="h-4 w-4" />
              <span>Tambah Mata Kuliah Master</span>
            </Button>
          </div>

          <Card className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80 text-xs font-semibold text-slate-600">
                  <th className="py-3 px-4">Kode MK</th>
                  <th className="py-3 px-4">Nama Mata Kuliah Master</th>
                  <th className="py-3 px-4">Program Studi</th>
                  <th className="py-3 px-4 text-right">Beban SKS</th>
                  <th className="py-3 px-4 text-right">Semester</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-sm">
                {coursesList.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50/80">
                    <td className="py-3 px-4 font-mono text-xs font-semibold text-slate-900 tabular-nums">
                      {c.code}
                    </td>
                    <td className="py-3 px-4">
                      <p className="font-semibold text-slate-900">{c.title}</p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {c.description}
                      </p>
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-600">
                      {c.studyProgram}
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-xs tabular-nums">
                      {c.credits} SKS
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-xs tabular-nums">
                      Semester {c.semesterNumber}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </section>
      )}

      {/* =====================================================================
          VIEW 5: SUPERADMIN SECURITY AUDIT LOGS
      ===================================================================== */}
      {isSuperadmin && adminTab === 'audit' && (
        <section className="mt-6 space-y-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              Rekam Jejak Audit Keamanan (Audit Logs)
            </h2>
            <p className="text-xs text-slate-600">
              Catatan permanen setiap tindakan autentikasi, perubahan RBAC, pembuatan kelas, persetujuan pendaftaran, dan unduhan berkas privat.
            </p>
          </div>

          <Card className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80 text-xs font-semibold text-slate-600">
                  <th className="py-3 px-4">Waktu Kejadian</th>
                  <th className="py-3 px-4">Aktor Pengguna</th>
                  <th className="py-3 px-4">Tindakan (Action)</th>
                  <th className="py-3 px-4">Entitas</th>
                  <th className="py-3 px-4">Alamat IP</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-xs">
                {(auditQuery.data?.data || []).map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50/80">
                    <td className="py-3 px-4 font-mono tabular-nums text-slate-600">
                      {formatDateTime(log.createdAt)}
                    </td>
                    <td className="py-3 px-4">
                      <span className="font-medium text-slate-900">
                        {log.actorName || 'Sistem'}
                      </span>
                      {log.actorEmail && (
                        <span className="text-slate-500">
                          {' '}
                          · {log.actorEmail}
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 font-mono font-semibold text-slate-900">
                      {log.action}
                    </td>
                    <td className="py-3 px-4 text-slate-600">
                      {log.entityType}
                    </td>
                    <td className="py-3 px-4 font-mono tabular-nums text-slate-500">
                      {log.ipAddress || '127.0.0.1'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </section>
      )}

      {/* =====================================================================
          MODALS & CONFIRMATION DIALOGS
      ===================================================================== */}

      {/* Join Classroom by Code Modal */}
      <ModalDialog
        open={joinModalOpen}
        onClose={() => setJoinModalOpen(false)}
        title="Gabung Ruang Kelas Digital"
        description="Masukkan kode kelas unik dari Dosen Pengampu Anda."
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!joinCodeInput.trim()) return;
            joinMutation.mutate(joinCodeInput.trim());
          }}
          className="space-y-4"
        >
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Kode Ruang Kelas
            </label>
            <Input
              value={joinCodeInput}
              onChange={(e) => setJoinCodeInput(e.target.value.toUpperCase())}
              placeholder="Contoh: PKM-RPL5A"
              className="font-mono uppercase"
              required
            />
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600 space-y-1.5">
            <p className="font-semibold text-slate-800">
              Kode Kelas Tersedia untuk Pengujian:
            </p>
            <div className="flex flex-wrap gap-2">
              {['PKM-RPL5A', 'PKM-SEC5B', 'PKM-TPS3A'].map((code) => (
                <button
                  key={code}
                  type="button"
                  onClick={() => setJoinCodeInput(code)}
                  className="rounded border border-slate-300 bg-white px-2.5 py-1 font-mono text-xs font-medium text-slate-800 hover:bg-slate-100 cursor-pointer"
                >
                  {code}
                </button>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setJoinModalOpen(false)}
            >
              Batal
            </Button>
            <Button
              type="submit"
              variant="accent"
              disabled={joinMutation.isPending}
            >
              {joinMutation.isPending ? 'Memproses...' : 'Gabung Sekarang'}
            </Button>
          </div>
        </form>
      </ModalDialog>

      {/* Create Classroom Modal (Dosen / Superadmin) */}
      <ModalDialog
        open={createClassModalOpen}
        onClose={() => setCreateClassModalOpen(false)}
        title="Buat Ruang Kelas Digital Baru"
        description="Ruang kelas baru akan dibuat di dalam transaksi PostgreSQL lengkap dengan kode gabung unik dan kategori nilai standar."
      >
        <form
          onSubmit={createClassForm.handleSubmit((v) =>
            createClassMutation.mutate(v)
          )}
          className="space-y-4"
        >
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Mata Kuliah Master
            </label>
            <select
              {...createClassForm.register('courseId', { required: true })}
              className="w-full h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900"
            >
              {coursesList.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code} — {c.title} ({c.credits} SKS)
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Semester Akademik
            </label>
            <select
              {...createClassForm.register('semesterId', { required: true })}
              className="w-full h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900"
            >
              {semestersList.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} {s.isActive ? '(Aktif)' : ''}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Nama Ruang Kelas
              </label>
              <Input
                placeholder="Contoh: TIF-5C Praktikum Malam"
                {...createClassForm.register('name', { required: true })}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Seksi / Kelompok
              </label>
              <Input
                placeholder="Kelas Reguler C"
                {...createClassForm.register('section', { required: true })}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Ruang Laboratorium / Gedung
              </label>
              <Input
                {...createClassForm.register('roomNumber', { required: true })}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Jadwal Perkuliahan
              </label>
              <Input
                {...createClassForm.register('scheduleText', { required: true })}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Kapasitas Maksimum Mahasiswa
              </label>
              <Input
                type="number"
                min={5}
                max={200}
                {...createClassForm.register('capacity', { required: true })}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Kebijakan Pendaftaran (Enrollment)
              </label>
              <select
                {...createClassForm.register('enrollmentPolicy')}
                className="w-full h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900"
              >
                <option value="AUTO">Otomatis Aktif (AUTO)</option>
                <option value="APPROVAL_REQUIRED">
                  Wajib Persetujuan Dosen (APPROVAL_REQUIRED)
                </option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Deskripsi Kelas
            </label>
            <Textarea
              placeholder="Deskripsi singkat kontrak perkuliahan dan target capaian..."
              {...createClassForm.register('description')}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setCreateClassModalOpen(false)}
            >
              Batal
            </Button>
            <Button type="submit" disabled={createClassMutation.isPending}>
              {createClassMutation.isPending
                ? 'Menyimpan...'
                : 'Terbitkan Ruang Kelas'}
            </Button>
          </div>
        </form>
      </ModalDialog>

      {/* Create User Modal (Superadmin) */}
      <ModalDialog
        open={createUserModalOpen}
        onClose={() => setCreateUserModalOpen(false)}
        title="Tambah Pengguna Baru (Argon2id + RBAC)"
        description="Buat akun Superadmin, Dosen Pengampu, atau Mahasiswa di PostgreSQL."
      >
        <form
          onSubmit={createUserForm.handleSubmit((v) =>
            createUserMutation.mutate(v)
          )}
          className="space-y-4"
        >
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Nama Lengkap beserta Gelar
            </label>
            <Input
              placeholder="Contoh: Budi Santoso, S.T., M.Kom."
              {...createUserForm.register('fullName', { required: true })}
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Email Institusi
              </label>
              <Input
                type="email"
                placeholder="budi@poltek-kampar.ac.id"
                {...createUserForm.register('email', { required: true })}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Nomor Identitas (NIM / NIDN / NIP)
              </label>
              <Input
                placeholder="NIDN-10293847"
                {...createUserForm.register('identityNumber', {
                  required: true,
                })}
              />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Peran Utama (RBAC Role)
              </label>
              <select
                {...createUserForm.register('roleCode')}
                className="w-full h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm"
              >
                <option value="MAHASISWA">MAHASISWA</option>
                <option value="DOSEN">DOSEN</option>
                <option value="SUPERADMIN">SUPERADMIN</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Program Studi
              </label>
              <select
                {...createUserForm.register('studyProgram')}
                className="w-full h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm"
              >
                <option value="Teknik Informatika">Teknik Informatika</option>
                <option value="Teknik Pengolahan Sawit">
                  Teknik Pengolahan Sawit
                </option>
                <option value="Perawatan & Perbaikan Mesin">
                  Perawatan & Perbaikan Mesin
                </option>
                <option value="Administrasi Bisnis Internasional">
                  Administrasi Bisnis Internasional
                </option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Kata Sandi Awal (Akan di-hash dengan Argon2id)
            </label>
            <Input
              type="text"
              {...createUserForm.register('password', { required: true })}
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setCreateUserModalOpen(false)}
            >
              Batal
            </Button>
            <Button type="submit" disabled={createUserMutation.isPending}>
              {createUserMutation.isPending ? 'Menyimpan...' : 'Simpan Pengguna'}
            </Button>
          </div>
        </form>
      </ModalDialog>

      {/* Create Master Course Modal (Superadmin) */}
      <ModalDialog
        open={createCourseModalOpen}
        onClose={() => setCreateCourseModalOpen(false)}
        title="Tambah Mata Kuliah Master"
        description="Daftarkan mata kuliah baru ke dalam katalog akademik Politeknik Kampar."
      >
        <form
          onSubmit={createCourseForm.handleSubmit((v) =>
            createCourseMutation.mutate(v)
          )}
          className="space-y-4"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Kode Mata Kuliah
              </label>
              <Input
                placeholder="Contoh: TIF-602"
                {...createCourseForm.register('code', { required: true })}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Program Studi
              </label>
              <select
                {...createCourseForm.register('studyProgram')}
                className="w-full h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm"
              >
                <option value="Teknik Informatika">Teknik Informatika</option>
                <option value="Teknik Pengolahan Sawit">
                  Teknik Pengolahan Sawit
                </option>
                <option value="Perawatan & Perbaikan Mesin">
                  Perawatan & Perbaikan Mesin
                </option>
                <option value="Administrasi Bisnis Internasional">
                  Administrasi Bisnis Internasional
                </option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Nama Mata Kuliah
            </label>
            <Input
              placeholder="Contoh: Pemrograman Cloud & DevOps Terapan"
              {...createCourseForm.register('title', { required: true })}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Beban SKS
              </label>
              <Input
                type="number"
                min={1}
                max={6}
                {...createCourseForm.register('credits', { required: true })}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Semester Kurikulum
              </label>
              <Input
                type="number"
                min={1}
                max={8}
                {...createCourseForm.register('semesterNumber', {
                  required: true,
                })}
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Deskripsi Capaian Pembelajaran
            </label>
            <Textarea
              placeholder="Uraikan capaian pembelajaran mata kuliah..."
              {...createCourseForm.register('description', { required: true })}
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setCreateCourseModalOpen(false)}
            >
              Batal
            </Button>
            <Button type="submit" disabled={createCourseMutation.isPending}>
              {createCourseMutation.isPending
                ? 'Menyimpan...'
                : 'Simpan Mata Kuliah'}
            </Button>
          </div>
        </form>
      </ModalDialog>

      {/* User Status Confirmation Dialog */}
      <ConfirmDialog
        open={Boolean(userStatusConfirm)}
        onClose={() => setUserStatusConfirm(null)}
        onConfirm={() => {
          if (!userStatusConfirm) return;
          toggleUserStatusMutation.mutate({
            id: userStatusConfirm.id,
            isActive: userStatusConfirm.nextActive,
          });
        }}
        title={
          userStatusConfirm?.nextActive
            ? 'Aktifkan Kembali Akun Pengguna'
            : 'Nonaktifkan Akses Akun Pengguna'
        }
        description={`Apakah Anda yakin ingin ${
          userStatusConfirm?.nextActive ? 'mengaktifkan' : 'menonaktifkan'
        } akun "${userStatusConfirm?.fullName}"? Perubahan ini akan langsung dicatat pada log audit keamanan.`}
        confirmLabel={
          userStatusConfirm?.nextActive ? 'Ya, Aktifkan' : 'Ya, Nonaktifkan'
        }
        variant={userStatusConfirm?.nextActive ? 'default' : 'destructive'}
        isLoading={toggleUserStatusMutation.isPending}
      />
    </AppShell>
  );
}
