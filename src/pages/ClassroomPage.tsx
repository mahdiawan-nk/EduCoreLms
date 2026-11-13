import React, { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import {
  MessageSquare,
  FileText,
  ClipboardList,
  HelpCircle,
  Download,
  Plus,
  Send,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Settings,
  Users,
  Award,
  BookOpen,
  ArrowLeft,
  Edit3,
  Trash2,
  Eye,
  Film,
  Clock,
  BarChart3,
  History,
  TrendingUp,
  Search,
  Copy,
  Archive,
  RotateCcw,
  ArrowUp,
  ArrowDown,
  Menu,
  MoreHorizontal,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { canPerformMutations, isAuditorUser } from '../lib/authorization';
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
import { apiRequest, apiFetch } from '../lib/api';
import { formatDateTime } from '../lib/utils';
import { ClassroomSettingsCenter } from '../components/classroom/ClassroomSettingsCenter';
import { toast } from 'sonner';
import { useDeleteConfirmation } from '../hooks/useDeleteConfirmation';
import { InstructorAnalyticsDashboard } from '../components/classroom/InstructorAnalyticsDashboard';
import { StudentDashboardOverview } from '../components/classroom/StudentDashboardOverview';
import { QuickNavigationSidebar } from '../components/classroom/QuickNavigationSidebar';
import { LearningProgressTab } from '../components/classroom/LearningProgressTab';
import { ChangeHistoryTab } from '../components/classroom/ChangeHistoryTab';

type ClassroomTab = 'stream' | 'classwork' | 'people' | 'grades' | 'analytics' | 'settings';
type ClassworkSubTab = 'overview' | 'modules' | 'assignments' | 'assessments' | 'progress' | 'history';

export function ClassroomPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<ClassroomTab>('stream');
  const [classworkSubTab, setClassworkSubTab] = useState<ClassworkSubTab>('modules');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);
  const [classroomSearch, setClassroomSearch] = useState('');
  const [editingModule, setEditingModule] = useState<{
    id: string;
    title: string;
    description: string;
    status: string;
  } | null>(null);
  const deleteConfirm = useDeleteConfirmation();

  // Stream comment inputs keyed by announcementId
  const [commentTexts, setCommentTexts] = useState<Record<string, string>>({});

  // Modals in Classwork / Stream / Settings
  const [announceModalOpen, setAnnounceModalOpen] = useState(false);
  const [topicModalOpen, setTopicModalOpen] = useState(false);
  const [assignmentModalOpen, setAssignmentModalOpen] = useState(false);
  const [quizModalOpen, setQuizModalOpen] = useState(false);

  // Student submit assignment modal
  const [activeAssignmentForSubmit, setActiveAssignmentForSubmit] =
    useState<any>(null);

  // Instructor grade submission modal
  const [activeSubmissionForGrade, setActiveSubmissionForGrade] =
    useState<any>(null);

  // Student attempt quiz modal
  const [activeQuizForAttempt, setActiveQuizForAttempt] = useState<any>(null);
  const [selectedQuizAnswers, setSelectedQuizAnswers] = useState<
    Record<string, string>
  >({});

  // Private file viewer modal
  const [downloadedFileModal, setDownloadedFileModal] = useState<{
    originalName: string;
    bucket: string;
    objectKey: string;
    content: string;
  } | null>(null);

  // Confirmation dialogs
  const [enrollmentConfirm, setEnrollmentConfirm] = useState<{
    enrollmentId: string;
    studentName: string;
    status: 'active' | 'rejected' | 'dropped' | 'completed';
  } | null>(null);

  const [joinCodeConfirm, setJoinCodeConfirm] = useState<
    'regenerate' | 'revoke' | null
  >(null);

  const classroomQuery = useQuery({
    queryKey: ['classroom-detail', id],
    queryFn: () => apiRequest<any>(`/classrooms/${id}`),
    enabled: Boolean(id),
    retry: false,
  });

  const analyticsSummaryQuery = useQuery({
    queryKey: ['classroom-analytics', id],
    queryFn: () => apiFetch<any>(`/api/v1/classrooms/${id}/analytics`),
    enabled: Boolean(id && classroomQuery.data?.data?.access?.canManage),
  });

  const searchQuery = useQuery({
    queryKey: ['classroom-search', id, classroomSearch],
    queryFn: () =>
      apiRequest<any>(
        `/classrooms/${id}/search?q=${encodeURIComponent(classroomSearch.trim())}`
      ).then((r) => r.data),
    enabled: Boolean(id && classroomSearch.trim().length >= 2),
  });

  const updateModuleMutation = useMutation({
    mutationFn: (payload: { moduleId: string; data: any }) =>
      apiRequest(`/classrooms/${id}/modules/${payload.moduleId}`, {
        method: 'PATCH',
        body: JSON.stringify(payload.data),
      }),
    onSuccess: () => {
      toast.success('Modul berhasil diperbarui.');
      setEditingModule(null);
      queryClient.invalidateQueries({ queryKey: ['classroom-detail', id] });
      queryClient.invalidateQueries({ queryKey: ['classwork-navigation', id] });
      queryClient.invalidateQueries({ queryKey: ['classroom-change-history', id] });
    },
    onError: (err: any) => toast.error(err?.message || 'Gagal memperbarui modul.'),
  });

  const deleteModuleMutation = useMutation({
    mutationFn: (moduleId: string) =>
      apiRequest(`/classrooms/${id}/modules/${moduleId}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('Modul berhasil dihapus.');
      queryClient.invalidateQueries({ queryKey: ['classroom-detail', id] });
      queryClient.invalidateQueries({ queryKey: ['classwork-navigation', id] });
      queryClient.invalidateQueries({ queryKey: ['classroom-change-history', id] });
    },
    onError: (err: any) => toast.error(err?.message || 'Gagal menghapus modul.'),
  });

  const duplicateModuleMutation = useMutation({
    mutationFn: (moduleId: string) =>
      apiRequest(`/classrooms/${id}/modules/${moduleId}/duplicate`, {
        method: 'POST',
        body: JSON.stringify({}),
      }),
    onSuccess: () => {
      toast.success('Modul berhasil diduplikasi.');
      queryClient.invalidateQueries({ queryKey: ['classroom-detail', id] });
      queryClient.invalidateQueries({ queryKey: ['classwork-navigation', id] });
    },
    onError: (err: any) => toast.error(err?.message || 'Gagal menduplikasi modul.'),
  });

  const reorderModulesMutation = useMutation({
    mutationFn: (moduleIds: string[]) =>
      apiRequest(`/classrooms/${id}/modules/reorder`, {
        method: 'POST',
        body: JSON.stringify({ moduleIds }),
      }),
    onSuccess: () => {
      toast.success('Urutan modul diperbarui.');
      queryClient.invalidateQueries({ queryKey: ['classroom-detail', id] });
      queryClient.invalidateQueries({ queryKey: ['classwork-navigation', id] });
    },
    onError: (err: any) => toast.error(err?.message || 'Gagal mengubah urutan modul.'),
  });

  const duplicateResourceMutation = useMutation({
    mutationFn: (params: { type: 'materials' | 'assignments' | 'assessments'; resourceId: string }) =>
      apiRequest(`/${params.type}/${params.resourceId}/duplicate`, {
        method: 'POST',
        body: JSON.stringify({}),
      }),
    onSuccess: () => {
      toast.success('Item berhasil diduplikasi sebagai draf.');
      queryClient.invalidateQueries({ queryKey: ['classroom-detail', id] });
      queryClient.invalidateQueries({ queryKey: ['classwork-navigation', id] });
    },
    onError: (err: any) => toast.error(err?.message || 'Gagal menduplikasi item.'),
  });

  // Forms
  const announceForm = useForm({
    defaultValues: { title: '', content: '', isPinned: false },
  });

  const topicForm = useForm({
    defaultValues: { title: '', description: '' },
  });

  const assignmentForm = useForm({
    defaultValues: {
      topicId: '',
      title: '',
      instructions: '',
      maxPoints: 100,
      dueDaysFromNow: 7,
    },
  });

  const submitWorkForm = useForm({
    defaultValues: {
      submissionText: '',
      repositoryUrl: 'https://git.poltek-kampar.ac.id/mahasiswa/praktikum-repo',
    },
  });

  const gradeWorkForm = useForm({
    defaultValues: {
      score: 90,
      feedback:
        'Implementasi kode dan laporan praktikum sudah sesuai spesifikasi.',
    },
  });

  const quizCreateForm = useForm({
    defaultValues: {
      topicId: '',
      title: '',
      description: '',
      durationMinutes: 30,
      passingScore: 75,
      q1Text:
        'Apa fungsi utama penggunaan transaksi database (db.transaction) pada persetujuan enrollment?',
      q1OptA: 'Menjaga konsistensi atomik pemeriksaan kapasitas kelas & status pendaftaran',
      q1OptB: 'Menghapus seluruh tabel secara otomatis',
      q2Text:
        'Mengapa kunci jawaban kuis tidak boleh dikirimkan pada payload JSON ke mahasiswa?',
      q2OptA: 'Mencegah kebocoran kunci jawaban melalui inspeksi jaringan browser (DevTools)',
      q2OptB: 'Karena JSON tidak mendukung tipe boolean',
    },
  });

  // Mutations
  const announceMutation = useMutation({
    mutationFn: (values: any) =>
      apiRequest(`/classrooms/${id}/announcements`, {
        method: 'POST',
        body: JSON.stringify(values),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['classroom-detail', id] });
      setAnnounceModalOpen(false);
      announceForm.reset();
      toast.success('Pengumuman kelas berhasil diterbitkan');
    },
    onError: (err: any) => toast.error(err.message),
  });

  const commentMutation = useMutation({
    mutationFn: (payload: { announcementId: string; content: string }) =>
      apiRequest(`/classrooms/${id}/comments`, {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ['classroom-detail', id] });
      setCommentTexts((prev) => ({ ...prev, [vars.announcementId]: '' }));
      toast.success('Komentar diskusi terkirim');
    },
    onError: (err: any) => toast.error(err.message),
  });

  const topicMutation = useMutation({
    mutationFn: (values: any) =>
      apiRequest(`/classrooms/${id}/topics`, {
        method: 'POST',
        body: JSON.stringify(values),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['classroom-detail', id] });
      setTopicModalOpen(false);
      topicForm.reset();
      toast.success('Topik pembelajaran berhasil ditambahkan');
    },
    onError: (err: any) => toast.error(err.message),
  });

  const deleteMaterialMutation = useMutation({
    mutationFn: (materialId: string) =>
      apiRequest(`/materials/${materialId}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['classroom-detail', id] });
      toast.success('Materi pembelajaran berhasil dihapus');
    },
    onError: (err: any) => toast.error(err.message),
  });

  const publishMaterialMutation = useMutation({
    mutationFn: (materialId: string) =>
      apiRequest(`/materials/${materialId}/publish`, {
        method: 'POST',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['classroom-detail', id] });
      toast.success('Materi pembelajaran berhasil diterbitkan');
    },
    onError: (err: any) => toast.error(err.message),
  });

  const assignmentMutation = useMutation({
    mutationFn: (values: any) =>
      apiRequest(`/classrooms/${id}/assignments`, {
        method: 'POST',
        body: JSON.stringify({
          ...values,
          topicId: values.topicId || null,
          maxPoints: Number(values.maxPoints),
          dueDaysFromNow: Number(values.dueDaysFromNow),
        }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['classroom-detail', id] });
      setAssignmentModalOpen(false);
      assignmentForm.reset();
      toast.success('Tugas baru dan item buku nilai berhasil dibuat');
    },
    onError: (err: any) => toast.error(err.message),
  });

  const submitWorkMutation = useMutation({
    mutationFn: (values: any) =>
      apiRequest(`/assignments/${activeAssignmentForSubmit.id}/submit`, {
        method: 'POST',
        body: JSON.stringify(values),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['classroom-detail', id] });
      setActiveAssignmentForSubmit(null);
      submitWorkForm.reset();
      toast.success('Tugas Anda berhasil dikumpulkan dan tercatat di revisi');
    },
    onError: (err: any) => toast.error(err.message),
  });

  const gradeWorkMutation = useMutation({
    mutationFn: (values: any) =>
      apiRequest(`/submissions/${activeSubmissionForGrade.id}/grade`, {
        method: 'POST',
        body: JSON.stringify({
          score: Number(values.score),
          feedback: values.feedback,
        }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['classroom-detail', id] });
      setActiveSubmissionForGrade(null);
      toast.success('Nilai tugas disimpan dan disinkronkan ke Buku Nilai');
    },
    onError: (err: any) => toast.error(err.message),
  });

  const createQuizMutation = useMutation({
    mutationFn: (values: any) =>
      apiRequest(`/classrooms/${id}/quizzes`, {
        method: 'POST',
        body: JSON.stringify({
          topicId: values.topicId || null,
          title: values.title,
          description: values.description,
          durationMinutes: Number(values.durationMinutes),
          passingScore: Number(values.passingScore),
          questions: [
            {
              questionText: values.q1Text,
              points: 50,
              options: [
                {
                  optionLabel: 'A',
                  optionText: values.q1OptA,
                  isCorrect: true,
                },
                {
                  optionLabel: 'B',
                  optionText: values.q1OptB,
                  isCorrect: false,
                },
              ],
            },
            {
              questionText: values.q2Text,
              points: 50,
              options: [
                {
                  optionLabel: 'A',
                  optionText: values.q2OptA,
                  isCorrect: true,
                },
                {
                  optionLabel: 'B',
                  optionText: values.q2OptB,
                  isCorrect: false,
                },
              ],
            },
          ],
        }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['classroom-detail', id] });
      setQuizModalOpen(false);
      quizCreateForm.reset();
      toast.success('Kuis evaluasi baru berhasil diterbitkan');
    },
    onError: (err: any) => toast.error(err.message),
  });

  const submitQuizAttemptMutation = useMutation({
    mutationFn: () =>
      apiRequest<{ totalScore: string; maxScore: number }>(
        `/quizzes/${activeQuizForAttempt.id}/attempt`,
        {
          method: 'POST',
          body: JSON.stringify({ answers: selectedQuizAnswers }),
        }
      ),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['classroom-detail', id] });
      setActiveQuizForAttempt(null);
      setSelectedQuizAnswers({});
      toast.success(
        `Kuis selesai! Skor otomatis Anda: ${res.data.totalScore}/${res.data.maxScore}`
      );
    },
    onError: (err: any) => toast.error(err.message),
  });

  const updateEnrollmentMutation = useMutation({
    mutationFn: (payload: {
      enrollmentId: string;
      status: 'active' | 'rejected' | 'dropped' | 'completed';
    }) =>
      apiRequest(`/classrooms/${id}/enrollments/${payload.enrollmentId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: payload.status }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['classroom-detail', id] });
      setEnrollmentConfirm(null);
      toast.success('Status pendaftaran mahasiswa berhasil diperbarui');
    },
    onError: (err: any) => toast.error(err.message),
  });

  const updateSettingsMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      apiRequest(`/classrooms/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['classroom-detail', id] });
      setJoinCodeConfirm(null);
      toast.success('Pengaturan ruang kelas berhasil diperbarui');
    },
    onError: (err: any) => toast.error(err.message),
  });

  const handleDownloadPrivateFile = async (fileId: string) => {
    try {
      const res = await apiRequest<{
        originalName: string;
        bucket: string;
        objectKey: string;
        content: string;
      }>(`/files/${fileId}/download`);
      setDownloadedFileModal(res.data);
    } catch (err: any) {
      toast.error(err.message || 'Akses unduhan berkas ditolak');
    }
  };

  if (classroomQuery.isLoading) {
    return (
      <AppShell breadcrumb="Memuat Ruang Kelas...">
        <div className="space-y-6">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-96 w-full" />
        </div>
      </AppShell>
    );
  }

  if (classroomQuery.isError || !classroomQuery.data?.data) {
    const errMessage =
      (classroomQuery.error as any)?.message ||
      'Ruang kelas tidak ditemukan atau Anda belum memiliki enrollment aktif.';
    return (
      <AppShell breadcrumb="Akses Ruang Kelas Ditolak">
        <EmptyState
          title="Tidak Dapat Mengakses Ruang Kelas Ini"
          description={errMessage}
          action={
            <Button type="button" onClick={() => navigate('/')}>
              <ArrowLeft className="h-4 w-4" />
              <span>Kembali ke Dashboard</span>
            </Button>
          }
        />
      </AppShell>
    );
  }

  const {
    classroom,
    access,
    instructors,
    enrollments,
    joinCodes,
    announcements,
    topics,
    materials,
    assignments,
    quizzes,
    assessments = [],
    gradebook,
  } = classroomQuery.data.data;

  const isAuditor = isAuditorUser(user);
  const canMutate = canPerformMutations(user);
  const canManage = Boolean(access?.canManage) && canMutate;
  const canInspectAll = canManage || isAuditor;
  const activeJoinCode =
    joinCodes?.find((jc: any) => jc.isActive)?.code || null;
  const activeStudents = enrollments.filter(
    (e: any) => e.status === 'active'
  );
  const pendingStudents = enrollments.filter(
    (e: any) => e.status === 'pending'
  );

  return (
    <AppShell breadcrumb={classroom.name}>
      {/* =====================================================================
          COMPACT ACADEMIC CLASSROOM HEADER & RESPONSIVE 6-TAB NAVIGATION
      ===================================================================== */}
      <div className="rounded-2xl border border-[#E2E8F0] bg-white shadow-xs overflow-hidden">
        {classroom.coverImagePath ? (
          <div className="relative h-24 sm:h-28 w-full bg-[#14213D] overflow-hidden">
            <img
              src={`/api/v1/storage/${classroom.coverImagePath}`}
              alt={classroom.name}
              className="h-full w-full object-cover opacity-80"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#14213D]/70 via-transparent to-transparent" />
          </div>
        ) : (
          <div className="h-1.5 w-full bg-gradient-to-r from-[#14213D] via-[#1E3A5F] to-[#2563EB]" />
        )}

        <div className="p-4 sm:p-6">
          <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
            <div className="min-w-0 space-y-2">
              <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-medium">
                <span className="inline-flex items-center rounded-md bg-[#14213D] px-2 py-0.5 font-mono font-semibold text-white tabular-nums">
                  {classroom.course?.code || 'MK'}
                </span>
                {classroom.course?.studyProgram && (
                  <span className="inline-flex items-center rounded-md bg-[#F7F9FC] border border-[#E2E8F0] px-2 py-0.5 text-[#172033]">
                    {classroom.course.studyProgram}
                  </span>
                )}
                <span className="inline-flex items-center rounded-md bg-[#F7F9FC] border border-[#E2E8F0] px-2 py-0.5 font-mono tabular-nums text-[#64748B]">
                  {classroom.course?.credits || 3} SKS
                </span>
                {classroom.semester?.name && (
                  <span className="inline-flex items-center rounded-md bg-blue-50 border border-blue-200 px-2 py-0.5 text-[#2563EB] font-semibold">
                    {classroom.semester.name}
                  </span>
                )}
                <span
                  className={`inline-flex items-center rounded-md px-2 py-0.5 font-semibold ${
                    classroom.isArchived
                      ? 'bg-amber-50 text-amber-700 border border-amber-200'
                      : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  }`}
                >
                  {classroom.isArchived ? 'Diarsipkan' : 'Aktif'}
                </span>
              </div>

              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#172033] break-words">
                {classroom.name}
              </h1>

              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#64748B]">
                <span>
                  <strong className="font-semibold text-[#172033]">
                    {instructors[0]?.fullName || 'Dosen Pengampu'}
                  </strong>
                  {instructors.length > 1 ? ` (+${instructors.length - 1} lainnya)` : ''}
                </span>
                <span aria-hidden="true">·</span>
                <span>{classroom.section}</span>
                {classroom.roomNumber && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>Ruang {classroom.roomNumber}</span>
                  </>
                )}
                {classroom.scheduleText && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>{classroom.scheduleText}</span>
                  </>
                )}
              </div>

              {classroom.description && (
                <p className="text-xs text-[#64748B] max-w-3xl leading-relaxed line-clamp-2">
                  {classroom.description}
                </p>
              )}
            </div>

            {/* Compact Join Code & Capacity Strip */}
            <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-stretch gap-2.5 shrink-0">
              {canManage && (
                <div className="rounded-xl border border-[#E2E8F0] bg-[#F7F9FC] px-3.5 py-2.5 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[11px] font-medium text-[#64748B]">Kode Kelas</p>
                    <p className="font-mono text-sm sm:text-base font-bold text-[#14213D] tabular-nums truncate">
                      {activeJoinCode || 'DICABUT'}
                    </p>
                  </div>
                  {activeJoinCode && (
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard?.writeText(activeJoinCode);
                        toast.success(`Kode kelas ${activeJoinCode} disalin.`);
                      }}
                      className="p-1.5 rounded-lg border border-[#E2E8F0] bg-white text-[#64748B] hover:text-[#2563EB] hover:border-blue-200 transition-colors cursor-pointer"
                      title="Salin Kode Kelas"
                      aria-label="Salin Kode Kelas"
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              )}
              <div className="rounded-xl border border-[#E2E8F0] bg-[#F7F9FC] px-3.5 py-2.5">
                <p className="text-[11px] font-medium text-[#64748B]">Peserta Aktif</p>
                <p className="font-mono text-sm sm:text-base font-bold text-[#172033] tabular-nums">
                  {activeStudents.length}{' '}
                  <span className="text-xs font-normal text-[#64748B]">
                    / {classroom.capacity}
                  </span>
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Desktop & Tablet Horizontal Tab Navigation */}
        <nav
          aria-label="Navigasi Ruang Kelas"
          className="hidden md:flex items-center gap-1 border-t border-[#E2E8F0] bg-[#F7F9FC]/70 px-4 sm:px-6 overflow-x-auto"
        >
          {(
            [
              { id: 'stream', label: 'Stream', icon: MessageSquare },
              { id: 'classwork', label: 'Classwork', icon: BookOpen },
              {
                id: 'people',
                label: `People (${activeStudents.length})`,
                icon: Users,
              },
              { id: 'grades', label: 'Grades', icon: Award },
              ...(canManage
                ? [
                    { id: 'analytics', label: 'Analytics', icon: BarChart3 },
                    { id: 'settings', label: 'Settings', icon: Settings },
                  ]
                : []),
            ] as const
          ).map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id as ClassroomTab)}
                className={`inline-flex items-center gap-2 px-4 py-3 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  active
                    ? 'border-[#2563EB] text-[#14213D] bg-white'
                    : 'border-transparent text-[#64748B] hover:text-[#172033] hover:bg-white/60'
                }`}
              >
                <Icon className={`h-3.5 w-3.5 ${active ? 'text-[#2563EB]' : ''}`} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Mobile 5-Destination Tab Bar (< 768px) */}
        <div className="md:hidden border-t border-[#E2E8F0] bg-[#F7F9FC]/80">
          <div className={`grid ${canManage ? 'grid-cols-5' : 'grid-cols-4'} gap-0.5 p-1`}>
            {(
              [
                { id: 'stream', label: 'Stream', icon: MessageSquare },
                { id: 'classwork', label: 'Tugas', icon: BookOpen },
                { id: 'people', label: 'Peserta', icon: Users },
                { id: 'grades', label: 'Nilai', icon: Award },
              ] as const
            ).map((tab) => {
              const Icon = tab.icon;
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => {
                    setActiveTab(tab.id as ClassroomTab);
                    setMobileMoreOpen(false);
                  }}
                  className={`flex flex-col items-center justify-center gap-1 py-2 px-1 rounded-lg text-[10px] font-semibold transition-colors cursor-pointer ${
                    active
                      ? 'bg-white text-[#2563EB] shadow-2xs border border-[#E2E8F0]'
                      : 'text-[#64748B] hover:text-[#172033]'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate max-w-full">{tab.label}</span>
                </button>
              );
            })}

            {canManage && (
              <button
                type="button"
                onClick={() => setMobileMoreOpen((prev) => !prev)}
                className={`flex flex-col items-center justify-center gap-1 py-2 px-1 rounded-lg text-[10px] font-semibold transition-colors cursor-pointer ${
                  activeTab === 'analytics' || activeTab === 'settings' || mobileMoreOpen
                    ? 'bg-white text-[#2563EB] shadow-2xs border border-[#E2E8F0]'
                    : 'text-[#64748B] hover:text-[#172033]'
                }`}
              >
                <MoreHorizontal className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate max-w-full">Lainnya</span>
              </button>
            )}
          </div>

          {canManage && mobileMoreOpen && (
            <div className="border-t border-[#E2E8F0] bg-white p-2 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  setActiveTab('analytics');
                  setMobileMoreOpen(false);
                }}
                className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-semibold border cursor-pointer ${
                  activeTab === 'analytics'
                    ? 'bg-[#14213D] text-white border-[#14213D]'
                    : 'bg-[#F7F9FC] text-[#172033] border-[#E2E8F0]'
                }`}
              >
                <BarChart3 className="h-3.5 w-3.5" />
                <span>Analytics</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveTab('settings');
                  setMobileMoreOpen(false);
                }}
                className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-semibold border cursor-pointer ${
                  activeTab === 'settings'
                    ? 'bg-[#14213D] text-white border-[#14213D]'
                    : 'bg-[#F7F9FC] text-[#172033] border-[#E2E8F0]'
                }`}
              >
                <Settings className="h-3.5 w-3.5" />
                <span>Settings</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* =====================================================================
          TAB 1: STREAM (ANNOUNCEMENTS & CLASS DISCUSSION)
      ===================================================================== */}
      {activeTab === 'stream' && (
        <div className="mt-6 space-y-6">
          {!canManage && !isAuditor && id && <StudentDashboardOverview classroomId={id} />}

          {/* Instructor Contextual Real-Time Statistics Strip (4 cols desktop, 2 cols mobile/tablet) */}
          {canManage && (
            <div className="space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-xs font-bold uppercase tracking-wider text-[#64748B] flex items-center gap-1.5">
                  <BarChart3 className="h-3.5 w-3.5 text-[#2563EB]" />
                  <span>Ringkasan Aktivitas Kelas</span>
                </h2>
                <button
                  type="button"
                  onClick={() => setActiveTab('analytics')}
                  className="text-xs font-semibold text-[#2563EB] hover:underline cursor-pointer"
                >
                  Lihat Analitik Lengkap →
                </button>
              </div>
              {analyticsSummaryQuery.isLoading ? (
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  {Array.from({ length: 4 }).map((_, idx) => (
                    <Skeleton key={idx} className="h-20 rounded-xl" />
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  <Card className="p-3.5 sm:p-4 border-[#E2E8F0] bg-white">
                    <div className="flex items-center justify-between text-[#64748B]">
                      <span className="text-[11px] font-semibold">Peserta Aktif</span>
                      <Users className="h-3.5 w-3.5 text-[#2563EB]" />
                    </div>
                    <p className="mt-1.5 font-mono text-lg sm:text-xl font-bold text-[#172033] tabular-nums">
                      {analyticsSummaryQuery.data?.overview?.activeStudents ?? activeStudents.length}{' '}
                      <span className="text-xs font-normal text-[#64748B]">
                        / {classroom.capacity}
                      </span>
                    </p>
                    <p className="mt-0.5 text-[11px] text-[#64748B]">
                      {pendingStudents.length} menunggu persetujuan
                    </p>
                  </Card>

                  <Card className="p-3.5 sm:p-4 border-[#E2E8F0] bg-white">
                    <div className="flex items-center justify-between text-[#64748B]">
                      <span className="text-[11px] font-semibold">Modul & Materi</span>
                      <BookOpen className="h-3.5 w-3.5 text-[#14213D]" />
                    </div>
                    <p className="mt-1.5 font-mono text-lg sm:text-xl font-bold text-[#172033] tabular-nums">
                      {analyticsSummaryQuery.data?.overview?.totalModules ?? topics.length}{' '}
                      <span className="text-xs font-normal text-[#64748B]">Modul</span>
                    </p>
                    <p className="mt-0.5 text-[11px] text-[#64748B]">
                      {analyticsSummaryQuery.data?.overview?.totalMaterials ?? materials.length} materi tersedia
                    </p>
                  </Card>

                  <Card className="p-3.5 sm:p-4 border-[#E2E8F0] bg-white">
                    <div className="flex items-center justify-between text-[#64748B]">
                      <span className="text-[11px] font-semibold">Tugas & Evaluasi</span>
                      <ClipboardList className="h-3.5 w-3.5 text-amber-600" />
                    </div>
                    <p className="mt-1.5 font-mono text-lg sm:text-xl font-bold text-[#172033] tabular-nums">
                      {(analyticsSummaryQuery.data?.overview?.totalAssignments ?? assignments.length) +
                        (analyticsSummaryQuery.data?.overview?.totalAssessments ?? assessments.length)}
                    </p>
                    <p className="mt-0.5 text-[11px] text-[#64748B]">
                      {analyticsSummaryQuery.data?.overview?.pendingGradingAssignmentsCount ?? 0} menunggu penilaian
                    </p>
                  </Card>

                  <Card className="p-3.5 sm:p-4 border-[#E2E8F0] bg-white">
                    <div className="flex items-center justify-between text-[#64748B]">
                      <span className="text-[11px] font-semibold">Rata-rata Kelas</span>
                      <Award className="h-3.5 w-3.5 text-emerald-600" />
                    </div>
                    <p className="mt-1.5 font-mono text-lg sm:text-xl font-bold text-[#172033] tabular-nums">
                      {analyticsSummaryQuery.data?.overview?.classAverageGrade ?? '—'}
                    </p>
                    <p className="mt-0.5 text-[11px] text-[#64748B]">
                      Progres selesai {analyticsSummaryQuery.data?.overview?.learningCompletionRate ?? 0}%
                    </p>
                  </Card>
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: Summary & Upcoming */}
          <div className="lg:col-span-4 space-y-4">
            <Card className="p-5 border-[#E2E8F0] bg-white">
              <h3 className="text-sm font-bold text-[#172033]">
                Informasi Ruang Kelas
              </h3>
              <div className="mt-3 space-y-2.5 text-xs text-[#64748B]">
                <p>
                  <span>Dosen Pengampu: </span>
                  <strong className="text-[#172033]">
                    {instructors.map((i: any) => i.fullName).join(', ')}
                  </strong>
                </p>
                <p>
                  <span>Kebijakan Pendaftaran: </span>
                  <strong className="text-[#172033]">
                    {classroom.enrollmentPolicy === 'AUTO'
                      ? 'Otomatis Aktif'
                      : 'Persetujuan Dosen'}
                  </strong>
                </p>
                <p>
                  <span>Total Tugas & Kuis: </span>
                  <strong className="font-mono tabular-nums text-[#172033]">
                    {assignments.length} Tugas · {quizzes.length} Kuis
                  </strong>
                </p>
                {classroom.cpmk && (
                  <div className="pt-2.5 border-t border-[#E2E8F0]">
                    <span className="text-[#64748B] font-semibold block mb-1.5">
                      Capaian Pembelajaran (CPMK):
                    </span>
                    <p className="text-[#172033] whitespace-pre-line leading-relaxed bg-[#F7F9FC] p-3 rounded-lg text-[11px] border border-[#E2E8F0]">
                      {classroom.cpmk}
                    </p>
                  </div>
                )}
              </div>
              {canManage && (
                <div className="mt-4 pt-4 border-t border-[#E2E8F0]">
                  <Button
                    type="button"
                    size="sm"
                    className="w-full bg-[#2563EB] hover:bg-blue-700 text-white"
                    onClick={() => setAnnounceModalOpen(true)}
                  >
                    <Plus className="h-4 w-4" />
                    <span>Buat Pengumuman Kelas</span>
                  </Button>
                </div>
              )}
            </Card>
          </div>

          {/* Right Column: Announcements Stream */}
          <div className="lg:col-span-8 space-y-4">
            {announcements.length === 0 ? (
              <EmptyState
                title="Belum Ada Pengumuman di Stream"
                description="Dosen pengampu belum menerbitkan pengumuman pada ruang kelas ini."
              />
            ) : (
              announcements.map((ann: any) => (
                <Card key={ann.id} className="p-5 sm:p-6 border-[#E2E8F0] bg-white">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-[#64748B]">
                      <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-[#14213D] text-[11px] font-bold text-white shrink-0">
                        {(ann.authorName || 'D').charAt(0).toUpperCase()}
                      </span>
                      <span className="font-semibold text-[#172033]">
                        {ann.authorName}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono tabular-nums">
                        {formatDateTime(ann.createdAt)}
                      </span>
                      {ann.isPinned && (
                        <span className="inline-flex items-center rounded-md bg-blue-50 border border-blue-200 px-2 py-0.5 text-[10px] font-semibold text-[#2563EB]">
                          Disematkan
                        </span>
                      )}
                    </div>
                  </div>

                  <h3 className="mt-3 text-base font-bold text-[#172033]">
                    {ann.title}
                  </h3>
                  <p className="mt-2 text-sm text-[#172033]/90 leading-relaxed whitespace-pre-line">
                    {ann.content}
                  </p>

                  {/* Comments Thread */}
                  <div className="mt-5 pt-4 border-t border-[#E2E8F0] space-y-3">
                    {ann.comments?.map((c: any) => (
                      <div
                        key={c.id}
                        className="rounded-xl bg-[#F7F9FC] border border-[#E2E8F0] px-3.5 py-2.5 text-xs"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-1 text-[#64748B]">
                          <span className="font-semibold text-[#172033]">
                            {c.authorName}
                          </span>
                          <span className="font-mono tabular-nums text-[11px]">
                            {formatDateTime(c.createdAt)}
                          </span>
                        </div>
                        <p className="mt-1 text-[#172033]">{c.content}</p>
                      </div>
                    ))}

                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        const text = (commentTexts[ann.id] || '').trim();
                        if (!text) return;
                        commentMutation.mutate({
                          announcementId: ann.id,
                          content: text,
                        });
                      }}
                      className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-1"
                    >
                      <Input
                        value={commentTexts[ann.id] || ''}
                        onChange={(e) =>
                          setCommentTexts((prev) => ({
                            ...prev,
                            [ann.id]: e.target.value,
                          }))
                        }
                        placeholder="Tulis tanggapan atau pertanyaan diskusi kelas..."
                        className="h-9 text-xs flex-1 min-w-0"
                      />
                      <Button
                        type="submit"
                        size="sm"
                        variant="outline"
                        disabled={commentMutation.isPending}
                        className="shrink-0"
                      >
                        <Send className="h-3.5 w-3.5" />
                        <span>Kirim</span>
                      </Button>
                    </form>
                  </div>
                </Card>
              ))
            )}
          </div>
        </div>
        </div>
      )}

      {/* =====================================================================
          TAB 2: CLASSWORK (TOPICS, MATERIALS, ASSIGNMENTS, QUIZZES)
      ===================================================================== */}
      {activeTab === 'classwork' && (
        <div className="mt-6 space-y-5">
          {/* Unified Classroom Search + Sub-navigation */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-white border border-[#E2E8F0] rounded-xl p-3">
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0">
              <button
                type="button"
                onClick={() => setMobileNavOpen(true)}
                className="lg:hidden inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[#E2E8F0] text-xs font-semibold text-[#172033] shrink-0 cursor-pointer"
              >
                <Menu className="h-3.5 w-3.5" /> Navigasi
              </button>
              {(
                [
                  { id: 'overview', label: 'Ringkasan', icon: BarChart3 },
                  { id: 'modules', label: 'Modul & Materi', icon: BookOpen },
                  { id: 'assignments', label: 'Tugas', icon: ClipboardList },
                  { id: 'assessments', label: 'Asesmen & Ujian', icon: HelpCircle },
                  { id: 'progress', label: 'Progres Belajar', icon: TrendingUp },
                  ...(canManage
                    ? [{ id: 'history' as const, label: 'Riwayat Perubahan', icon: History }]
                    : []),
                ] as const
              ).map((st) => {
                const SIcon = st.icon;
                const active = classworkSubTab === st.id;
                return (
                  <button
                    key={st.id}
                    type="button"
                    onClick={() => setClassworkSubTab(st.id as ClassworkSubTab)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      active
                        ? 'bg-[#14213D] text-white'
                        : 'text-[#64748B] hover:bg-[#F7F9FC] hover:text-[#172033]'
                    }`}
                  >
                    <SIcon className="h-3.5 w-3.5" />
                    <span>{st.label}</span>
                  </button>
                );
              })}
            </div>

            <div className="relative w-full md:w-72">
              <Search className="h-3.5 w-3.5 text-slate-400 absolute left-3 top-2.5" />
              <Input
                value={classroomSearch}
                onChange={(e) => setClassroomSearch(e.target.value)}
                placeholder="Cari modul, materi, tugas, ujian..."
                className="pl-8 h-8 text-xs"
              />
              {classroomSearch.trim().length >= 2 && searchQuery.data?.results && (
                <div className="absolute right-0 left-0 top-9 z-30 bg-white border border-slate-200 rounded-xl shadow-lg max-h-72 overflow-y-auto p-2 space-y-1">
                  {searchQuery.data.results.length === 0 ? (
                    <p className="text-xs text-slate-500 p-2">Tidak ada hasil.</p>
                  ) : (
                    searchQuery.data.results.map((r: any) => (
                      <button
                        key={`${r.type}-${r.id}`}
                        type="button"
                        onClick={() => {
                          setClassroomSearch('');
                          if (r.type === 'MATERIAL') {
                            navigate(`/classrooms/${id}/materials/${r.id}`);
                          } else if (r.type === 'ASSIGNMENT') {
                            navigate(
                              canManage
                                ? `/classrooms/${id}/assignments/${r.id}/monitoring`
                                : `/classrooms/${id}/assignments/${r.id}`
                            );
                          } else if (r.type === 'ASSESSMENT') {
                            navigate(
                              canManage
                                ? `/classrooms/${id}/assessments/${r.id}/monitoring`
                                : `/classrooms/${id}/assessments/${r.id}/exam`
                            );
                          } else if (r.type === 'MODULE') {
                            setClassworkSubTab('modules');
                          } else {
                            setActiveTab('stream');
                          }
                        }}
                        className="w-full text-left px-2.5 py-2 rounded-lg hover:bg-slate-100 flex items-center justify-between gap-2 text-xs cursor-pointer"
                      >
                        <span className="font-medium text-slate-900 truncate">{r.title}</span>
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 shrink-0">
                          {r.type}
                        </span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Classwork Layout: Quick Navigation Sidebar + Content */}
          <div className="flex gap-6 items-start">
            {id && (
              <QuickNavigationSidebar
                classroomId={id}
                canManage={canManage}
                mobileOpen={mobileNavOpen}
                onMobileClose={() => setMobileNavOpen(false)}
              />
            )}

            <div className="flex-1 min-w-0 space-y-8">
              {classworkSubTab === 'overview' && id && (
                canManage ? (
                  <InstructorAnalyticsDashboard classroomId={id} />
                ) : (
                  <StudentDashboardOverview classroomId={id} />
                )
              )}

              {classworkSubTab === 'progress' && id && (
                <LearningProgressTab classroomId={id} canManage={canManage} />
              )}

              {classworkSubTab === 'history' && canInspectAll && id && (
                <ChangeHistoryTab classroomId={id} />
              )}

              {(classworkSubTab === 'modules' ||
                classworkSubTab === 'assignments' ||
                classworkSubTab === 'assessments') && (
                <>
          {/* Instructor Action Toolbar */}
          {canManage && (
            <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white p-4">
              <div>
                <h2 className="text-sm font-bold text-slate-900">
                  Manajemen Materi, Tugas & Evaluasi Kuis
                </h2>
                <p className="text-xs text-slate-500">
                  Tambahkan topik mingguan, materi ajar dengan berkas privat S3, tugas praktikum, atau kuis pilihan ganda.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setTopicModalOpen(true)}
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Topik Baru</span>
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="accent"
                  onClick={() => {
                    const topicQuery = topics[0] ? `?topicId=${topics[0].id}` : '';
                    navigate(`/classrooms/${id}/materials/new${topicQuery}`);
                  }}
                >
                  <FileText className="h-3.5 w-3.5" />
                  <span>Buka Advanced Material Builder</span>
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    const topicQuery = topics[0] ? `?topicId=${topics[0].id}` : '';
                    navigate(`/classrooms/${id}/assignments/new${topicQuery}`);
                  }}
                >
                  <ClipboardList className="h-3.5 w-3.5" />
                  <span>Buka Advanced Assignment Builder</span>
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => {
                    const topicQuery = topics[0] ? `?topicId=${topics[0].id}` : '';
                    navigate(`/classrooms/${id}/assessments/new${topicQuery}`);
                  }}
                >
                  <HelpCircle className="h-3.5 w-3.5" />
                  <span>Buka Advanced Assessment & Exam Builder</span>
                </Button>
              </div>
            </div>
          )}

          {/* Section A: Learning Materials & Topics */}
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-lg font-bold text-slate-900">
                01. Modul Topik & Materi Pembelajaran Terpadu
              </h2>
              {canManage && (
                <Link
                  to={`/classrooms/${id}/materials/new${topics[0] ? `?topicId=${topics[0].id}` : ''}`}
                  className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-700 hover:underline"
                >
                  <Plus className="h-3.5 w-3.5" /> Buat Materi dengan Rich Editor & S3 Presigned
                </Link>
              )}
            </div>

            {topics.map((t: any, tIdx: number) => {
              const topicMats = materials.filter(
                (m: any) => m.topicId === t.id
              );
              return (
                <Card key={t.id} className="p-6 space-y-4">
                  <div className="border-b border-slate-100 pb-3 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-base font-bold text-slate-900">
                          {t.title}
                        </h3>
                        {t.status && t.status !== 'PUBLISHED' && (
                          <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-800 text-[10px] font-mono font-semibold">
                            {t.status}
                          </span>
                        )}
                      </div>
                      {t.description && (
                        <p className="mt-0.5 text-xs text-slate-500">
                          {t.description}
                        </p>
                      )}
                    </div>
                    {canManage && (
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={tIdx === 0 || reorderModulesMutation.isPending}
                          onClick={() => {
                            const ids = topics.map((x: any) => x.id);
                            [ids[tIdx - 1], ids[tIdx]] = [ids[tIdx], ids[tIdx - 1]];
                            reorderModulesMutation.mutate(ids);
                          }}
                          title="Geser ke atas"
                        >
                          <ArrowUp className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={tIdx === topics.length - 1 || reorderModulesMutation.isPending}
                          onClick={() => {
                            const ids = topics.map((x: any) => x.id);
                            [ids[tIdx], ids[tIdx + 1]] = [ids[tIdx + 1], ids[tIdx]];
                            reorderModulesMutation.mutate(ids);
                          }}
                          title="Geser ke bawah"
                        >
                          <ArrowDown className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            setEditingModule({
                              id: t.id,
                              title: t.title,
                              description: t.description || '',
                              status: t.status || 'PUBLISHED',
                            })
                          }
                          title="Edit Modul"
                        >
                          <Edit3 className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => duplicateModuleMutation.mutate(t.id)}
                          title="Duplikasi Modul"
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            updateModuleMutation.mutate({
                              moduleId: t.id,
                              data: {
                                status: t.status === 'ARCHIVED' ? 'PUBLISHED' : 'ARCHIVED',
                              },
                            })
                          }
                          title={t.status === 'ARCHIVED' ? 'Pulihkan Modul' : 'Arsipkan Modul'}
                        >
                          {t.status === 'ARCHIVED' ? (
                            <RotateCcw className="h-3.5 w-3.5" />
                          ) : (
                            <Archive className="h-3.5 w-3.5" />
                          )}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            deleteConfirm.requestConfirmation({
                              item: t,
                              title: 'Hapus Modul Pembelajaran?',
                              description: 'Apakah Anda yakin ingin menghapus modul pembelajaran ini?',
                              itemName: t.title,
                              warningText:
                                topicMats.length > 0
                                  ? `Terdapat ${topicMats.length} materi di dalam modul ini. Materi dan tugas terkait akan tetap tersimpan tanpa modul (tidak ikut terhapus).`
                                  : 'Modul kosong ini akan dihapus secara permanen dari kelas.',
                              actionLabel: 'Ya, Hapus Modul',
                              onConfirm: async () => {
                                await deleteModuleMutation.mutateAsync(t.id);
                              },
                            })
                          }
                          title="Hapus Modul"
                        >
                          <Trash2 className="h-3.5 w-3.5 text-rose-600" />
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            navigate(`/classrooms/${id}/materials/new?topicId=${t.id}`)
                          }
                        >
                          <Plus className="h-3.5 w-3.5" />
                          <span>Tambah Materi</span>
                        </Button>
                      </div>
                    )}
                  </div>

                  {topicMats.length === 0 ? (
                    <p className="text-xs text-slate-500">
                      Belum ada materi yang diterbitkan pada topik ini.
                    </p>
                  ) : (
                    <div className="divide-y divide-slate-100">
                      {topicMats.map((m: any) => {
                        const attCount = m.attachments?.length || 0;
                        const vidCount = m.videos?.length || 0;
                        const myProg = m.myProgress;

                        return (
                          <div key={m.id} className="py-4 first:pt-0 last:pb-0 space-y-2.5">
                            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                              <div className="space-y-1">
                                <div className="flex flex-wrap items-center gap-2 text-xs font-mono tabular-nums text-slate-500">
                                  <span className="font-bold text-slate-900 uppercase">
                                    Pertemuan #{m.meetingNumber || 1}
                                  </span>
                                  <span>·</span>
                                  <span className="inline-flex items-center gap-1">
                                    <Clock className="h-3 w-3 text-amber-600" />
                                    {m.estimatedDurationMinutes || 45} Menit
                                  </span>
                                  <span>·</span>
                                  <span className="uppercase font-semibold text-slate-700">
                                    Status: {m.status || 'PUBLISHED'}
                                  </span>
                                  {myProg && (
                                    <>
                                      <span>·</span>
                                      <span
                                        className={
                                          myProg.status === 'COMPLETED'
                                            ? 'text-emerald-700 font-bold'
                                            : 'text-amber-700 font-semibold'
                                        }
                                      >
                                        Progres: {myProg.progressPercent || 0}% (
                                        {myProg.status === 'COMPLETED'
                                          ? 'Tuntas'
                                          : 'Sedang Dipelajari'}
                                        )
                                      </span>
                                    </>
                                  )}
                                </div>

                                <Link
                                  to={`/classrooms/${id}/materials/${m.id}`}
                                  className="block text-base font-bold text-slate-900 hover:text-amber-700 transition"
                                >
                                  {m.title}
                                </Link>
                                {m.subtitle && (
                                  <p className="text-xs font-medium text-slate-600">
                                    {m.subtitle}
                                  </p>
                                )}
                                <p className="text-xs text-slate-600 leading-relaxed line-clamp-2">
                                  {m.shortDescription || m.content}
                                </p>

                                <div className="pt-1 flex flex-wrap items-center gap-3 text-xs font-mono tabular-nums text-slate-500">
                                  <span>Oleh: {m.authorName}</span>
                                  <span>·</span>
                                  <span>{attCount} Berkas Lampiran S3</span>
                                  <span>·</span>
                                  <span>{vidCount} Video Terintegrasi</span>
                                </div>
                              </div>

                              <div className="flex flex-wrap items-center gap-2 shrink-0">
                                <Link
                                  to={`/classrooms/${id}/materials/${m.id}`}
                                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition"
                                >
                                  <Eye className="h-3.5 w-3.5 text-amber-400" />
                                  <span>Buka & Pelajari Materi</span>
                                </Link>

                                {canManage && (
                                  <>
                                    <Link
                                      to={`/classrooms/${id}/materials/${m.id}/edit`}
                                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-xs font-semibold transition"
                                    >
                                      <Edit3 className="h-3.5 w-3.5" />
                                      <span>Edit Builder</span>
                                    </Link>

                                    {m.status !== 'PUBLISHED' && (
                                      <Button
                                        type="button"
                                        size="sm"
                                        variant="outline"
                                        onClick={() => publishMaterialMutation.mutate(m.id)}
                                        disabled={publishMaterialMutation.isPending}
                                      >
                                        <Send className="h-3.5 w-3.5" />
                                        <span>Terbitkan</span>
                                      </Button>
                                    )}

                                    <button
                                      type="button"
                                      onClick={() =>
                                        deleteConfirm.requestConfirmation({
                                          item: m,
                                          title: 'Hapus Materi Pembelajaran?',
                                          description: 'Apakah Anda yakin ingin menghapus materi pembelajaran ini?',
                                          itemName: m.title,
                                          warningText:
                                            'Materi pembelajaran beserta lampiran berkas dan catatan progres terkait akan dihapus secara permanen.',
                                          actionLabel: 'Ya, Hapus Materi',
                                          onConfirm: async () => {
                                            await deleteMaterialMutation.mutateAsync(m.id);
                                          },
                                        })
                                      }
                                      disabled={deleteMaterialMutation.isPending}
                                      className="p-2 rounded-lg border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 transition cursor-pointer"
                                      title="Hapus Materi"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </Card>
              );
            })}
          </div>

          {/* Section B: Assignments & Submissions */}
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-lg font-bold text-slate-900">
                02. Tugas Praktikum, Proyek & Pengumpulan Mahasiswa
              </h2>
              {canManage && (
                <Link
                  to={`/classrooms/${id}/assignments/new${topics[0] ? `?topicId=${topics[0].id}` : ''}`}
                  className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-700 hover:underline"
                >
                  <Plus className="h-3.5 w-3.5" /> Buat Tugas dengan Rubrik & Aturan Pengumpulan
                </Link>
              )}
            </div>
            {assignments.length === 0 ? (
              <EmptyState
                title="Belum Ada Tugas"
                description="Belum ada tugas praktikum yang diterbitkan di kelas ini."
              />
            ) : (
              <div className="space-y-4">
                {assignments.map((asg: any) => {
                  const mySub = asg.submissions?.find(
                    (s: any) => s.studentId === user?.id
                  );

                  return (
                    <Card key={asg.id} className="p-6">
                      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                            <span className="font-mono font-bold uppercase text-slate-900">
                              Pertemuan #{asg.meetingNumber || 1}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span className="uppercase font-semibold text-amber-700">
                              {asg.assignmentType || 'INDIVIDUAL'}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span>Batas Waktu:</span>
                            <span className="font-mono font-semibold text-slate-800 tabular-nums">
                              {formatDateTime(asg.dueAt)}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span className="font-mono tabular-nums">
                              Skor Maksimum: {asg.maxScore || asg.maxPoints} Poin
                            </span>
                            {canManage && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span className="font-mono font-bold uppercase text-slate-700">
                                  Status: {asg.status || 'PUBLISHED'}
                                </span>
                              </>
                            )}
                          </div>
                          <Link
                            to={
                              canManage
                                ? `/classrooms/${id}/assignments/${asg.id}/monitoring`
                                : `/classrooms/${id}/assignments/${asg.id}`
                            }
                            className="block text-base font-bold text-slate-900 hover:text-amber-700 transition"
                          >
                            {asg.title}
                          </Link>
                          {asg.subtitle && (
                            <p className="text-xs font-medium text-slate-600">
                              {asg.subtitle}
                            </p>
                          )}
                          <p className="mt-1 text-sm text-slate-600 leading-relaxed line-clamp-2">
                            {asg.shortDescription || asg.instructions}
                          </p>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 shrink-0">
                          {!canManage && !isAuditor ? (
                            <Link
                              to={`/classrooms/${id}/assignments/${asg.id}`}
                              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold transition"
                            >
                              <ClipboardList className="h-3.5 w-3.5" />
                              <span>
                                {mySub
                                  ? 'Buka Workspace & Status Tugas'
                                  : 'Buka Workspace & Kumpulkan Tugas'}
                              </span>
                            </Link>
                          ) : isAuditor ? (
                            <>
                              <Link
                                to={`/classrooms/${id}/assignments/${asg.id}/monitoring`}
                                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition"
                              >
                                <Users className="h-3.5 w-3.5 text-amber-400" />
                                <span>Monitoring & Nilai Peserta</span>
                              </Link>
                              <Link
                                to={`/classrooms/${id}/assignments/${asg.id}`}
                                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-semibold transition"
                              >
                                <Eye className="h-3.5 w-3.5" />
                                <span>Lihat Instruksi</span>
                              </Link>
                            </>
                          ) : (
                            <>
                              <Link
                                to={`/classrooms/${id}/assignments/${asg.id}/monitoring`}
                                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition"
                              >
                                <Users className="h-3.5 w-3.5 text-amber-400" />
                                <span>Monitoring & Nilai Peserta</span>
                              </Link>
                              <Link
                                to={`/classrooms/${id}/assignments/${asg.id}/edit`}
                                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-xs font-semibold transition"
                              >
                                <Edit3 className="h-3.5 w-3.5" />
                                <span>Edit Builder</span>
                              </Link>
                              <Link
                                to={`/classrooms/${id}/assignments/${asg.id}`}
                                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-semibold transition"
                              >
                                <Eye className="h-3.5 w-3.5" />
                                <span>Pratinjau</span>
                              </Link>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Student's own submission status */}
                      {!canManage && mySub && (
                        <div className="mt-4 pt-4 border-t border-slate-100 rounded-lg bg-slate-50 p-4 text-xs space-y-1.5">
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-slate-900">
                              Status Pengumpulan Anda:{' '}
                              <span className="uppercase">{mySub.submissionStatus || mySub.status}</span>
                              {mySub.currentVersion ? ` (Versi #${mySub.currentVersion})` : ''}
                            </span>
                            <span className="font-mono font-bold text-slate-900 tabular-nums">
                              {mySub.isGradePublished && mySub.score !== null && mySub.score !== undefined
                                ? `Nilai Akhir: ${mySub.score} / ${asg.maxScore || asg.maxPoints}`
                                : 'Menunggu Publikasi Nilai Dosen'}
                            </span>
                          </div>
                          {mySub.submissionText && (
                            <p className="text-slate-600 line-clamp-2">
                              {mySub.submissionText}
                            </p>
                          )}
                          {mySub.isGradePublished && mySub.feedback && (
                            <p className="text-emerald-800 font-medium">
                              Umpan Balik Dosen: {mySub.feedback}
                            </p>
                          )}
                        </div>
                      )}

                      {/* Instructor's view of all student submissions */}
                      {canManage && (
                        <div className="mt-5 pt-4 border-t border-slate-100">
                          <div className="flex items-center justify-between mb-3">
                            <p className="text-xs font-semibold text-slate-700">
                              Pengumpulan Masuk ({asg.submissions?.length || 0} dari {activeStudents.length} Mahasiswa Aktif)
                            </p>
                            <Link
                              to={`/classrooms/${id}/assignments/${asg.id}/monitoring`}
                              className="text-xs font-bold text-amber-700 hover:underline"
                            >
                              Lihat Semua Peserta & Mahasiswa Belum Mengumpulkan →
                            </Link>
                          </div>
                          {asg.submissions?.length === 0 ? (
                            <p className="text-xs text-slate-500">
                              Belum ada mahasiswa yang mengumpulkan tugas ini. Klik "Monitoring & Nilai Peserta" untuk melihat daftar lengkap mahasiswa yang belum mengumpulkan.
                            </p>
                          ) : (
                            <div className="space-y-2.5">
                              {asg.submissions.map((sub: any) => (
                                <div
                                  key={sub.id}
                                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg border border-slate-200 p-3.5 text-xs"
                                >
                                  <div className="space-y-1">
                                    <div className="flex items-center gap-2">
                                      <span className="font-semibold text-slate-900">
                                        {sub.studentName}
                                      </span>
                                      <span aria-hidden="true">·</span>
                                      <span className="font-mono text-slate-500 tabular-nums">
                                        {sub.studentNim || 'Mahasiswa'}
                                      </span>
                                      <span aria-hidden="true">·</span>
                                      <span className="font-mono text-slate-500 tabular-nums">
                                        {formatDateTime(sub.submittedAt)}
                                      </span>
                                      {sub.isLate && (
                                        <span className="px-1.5 py-0.5 rounded bg-orange-100 text-orange-800 font-bold text-[10px]">
                                          TERLAMBAT
                                        </span>
                                      )}
                                    </div>
                                    <p className="text-slate-700 line-clamp-1">
                                      {sub.submissionText}
                                    </p>
                                  </div>

                                  <div className="flex items-center gap-3 shrink-0">
                                    <span className="font-mono font-bold text-slate-900 tabular-nums">
                                      {sub.score !== null && sub.score !== undefined
                                        ? `${sub.score} / ${asg.maxScore || asg.maxPoints}`
                                        : 'Belum Dinilai'}
                                    </span>
                                    <Link
                                      to={`/classrooms/${id}/assignments/${asg.id}/grading/${sub.id}`}
                                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition"
                                    >
                                      <span>Periksa & Nilai</span>
                                    </Link>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </Card>
                  );
                })}
              </div>
            )}
          </div>

          {/* Section C: University-Grade Assessments & Examinations (Objective, Essay & Hybrid) */}
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-lg font-bold text-slate-900">
                03. Asesmen & Ujian Terpadu (Mode Objektif, Esai & Hybrid)
              </h2>
              {canManage && (
                <Link
                  to={`/classrooms/${id}/assessments/new${topics[0] ? `?topicId=${topics[0].id}` : ''}`}
                  className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-700 hover:underline"
                >
                  <Plus className="h-3.5 w-3.5" /> Buat Ujian Baru (Bank Soal, Pool Acak & Rubrik Esai)
                </Link>
              )}
            </div>

            {assessments.length > 0 && (
              <div className="space-y-4">
                {assessments.map((asmt: any) => {
                  const myAtts = asmt.myAttempts || [];
                  const latestMyAtt = myAtts[0] || null;

                  return (
                    <Card key={asmt.id} className="p-6">
                      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 font-mono">
                            <span className="font-bold text-slate-900">
                              {asmt.category || 'EXAM'}
                            </span>
                            <span>·</span>
                            <span className="font-semibold text-amber-800">
                              Mode: {asmt.assessmentMode}
                            </span>
                            <span>·</span>
                            <span>Durasi: {asmt.durationMinutes} Menit</span>
                            <span>·</span>
                            <span>Batas Lulus: {asmt.passingGrade}/{asmt.maxScore}</span>
                            <span>·</span>
                            <span>{asmt.questionCount || 0} Butir Soal</span>
                          </div>
                          <Link
                            to={
                              canManage
                                ? `/classrooms/${id}/assessments/${asmt.id}/monitoring`
                                : `/classrooms/${id}/assessments/${asmt.id}`
                            }
                            className="block text-base font-bold text-slate-900 hover:text-amber-700 transition"
                          >
                            {asmt.title}
                          </Link>
                          <p className="text-sm text-slate-600">
                            {asmt.description}
                          </p>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 shrink-0">
                          {!canManage && !isAuditor ? (
                            <Link
                              to={`/classrooms/${id}/assessments/${asmt.id}`}
                              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold transition"
                            >
                              <HelpCircle className="h-3.5 w-3.5" />
                              <span>
                                {latestMyAtt?.status === 'IN_PROGRESS'
                                  ? 'Lanjutkan Sesi Ujian'
                                  : 'Buka Ruang Ujian'}
                              </span>
                            </Link>
                          ) : isAuditor ? (
                            <Link
                              to={`/classrooms/${id}/assessments/${asmt.id}/monitoring`}
                              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition"
                            >
                              <Users className="h-3.5 w-3.5 text-amber-400" />
                              <span>Monitoring & Analitik Ujian</span>
                            </Link>
                          ) : (
                            <>
                              <Link
                                to={`/classrooms/${id}/assessments/${asmt.id}/monitoring`}
                                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition"
                              >
                                <Users className="h-3.5 w-3.5 text-amber-400" />
                                <span>Monitoring, Analitik & Penilaian Esai</span>
                              </Link>
                              <Link
                                to={`/classrooms/${id}/assessments/${asmt.id}/edit`}
                                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-xs font-semibold transition"
                              >
                                <Edit3 className="h-3.5 w-3.5" />
                                <span>Edit Builder</span>
                              </Link>
                              <Link
                                to={`/classrooms/${id}/assessments/${asmt.id}`}
                                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-semibold transition"
                              >
                                <Eye className="h-3.5 w-3.5" />
                                <span>Ruang Ujian</span>
                              </Link>
                            </>
                          )}
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}

            {quizzes.length === 0 && assessments.length === 0 ? (
              <EmptyState
                title="Belum Ada Evaluasi Ujian / Kuis"
                description="Belum ada asesmen atau kuis pada ruang kelas ini."
              />
            ) : (
              <div className="space-y-4">
                {quizzes.map((qz: any) => {
                  const myAttempts =
                    qz.attempts?.filter(
                      (a: any) => a.studentId === user?.id
                    ) || [];

                  return (
                    <Card key={qz.id} className="p-6">
                      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                        <div>
                          <div className="flex items-center gap-2 text-xs text-slate-500">
                            <span className="font-mono tabular-nums">
                              Durasi: {qz.durationMinutes} Menit
                            </span>
                            <span aria-hidden="true">·</span>
                            <span className="font-mono tabular-nums">
                              Batas Lulus: {qz.passingScore}/100
                            </span>
                            <span aria-hidden="true">·</span>
                            <span className="font-mono tabular-nums">
                              {qz.questions?.length || 0} Soal Pilihan Ganda
                            </span>
                          </div>
                          <h3 className="mt-1.5 text-base font-bold text-slate-900">
                            {qz.title}
                          </h3>
                          <p className="mt-1 text-sm text-slate-600">
                            {qz.description}
                          </p>
                        </div>

                        {!canManage && !isAuditor && (
                          <Button
                            type="button"
                            size="sm"
                            variant="accent"
                            onClick={() => {
                              setSelectedQuizAnswers({});
                              setActiveQuizForAttempt(qz);
                            }}
                          >
                            Kerjakan Kuis Sekarang
                          </Button>
                        )}
                      </div>

                      {qz.attempts?.length > 0 && (
                        <div className="mt-4 pt-4 border-t border-slate-100">
                          <p className="text-xs font-semibold text-slate-700 mb-2">
                            Riwayat Percobaan Kuis ({qz.attempts.length})
                          </p>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {qz.attempts.map((att: any) => (
                              <div
                                key={att.id}
                                className="flex items-center justify-between rounded-lg bg-slate-50 px-3.5 py-2 text-xs"
                              >
                                <span>
                                  <strong>{att.studentName}</strong> · Percobaan #{att.attemptNumber}
                                </span>
                                <span className="font-mono font-bold text-slate-900 tabular-nums">
                                  Skor: {att.totalScore} / {att.maxScore}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          TAB 3: PEOPLE (INSTRUCTORS & STUDENT ENROLLMENTS)
      ===================================================================== */}
      {activeTab === 'people' && (
        <div className="mt-6 space-y-6">
          <Card className="p-5 sm:p-6 border-[#E2E8F0] bg-white">
            <h2 className="text-base font-bold text-[#172033]">
              Dosen Pengampu Ruang Kelas ({instructors.length})
            </h2>
            <div className="mt-4 divide-y divide-[#E2E8F0]">
              {instructors.map((inst: any) => (
                <div
                  key={inst.id}
                  className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-sm"
                >
                  <div className="min-w-0">
                    <p className="font-semibold text-[#172033] truncate">
                      {inst.fullName}
                    </p>
                    <p className="text-xs text-[#64748B] truncate">
                      {inst.email} ·{' '}
                      <span className="font-mono tabular-nums">
                        {inst.identityNumber}
                      </span>
                    </p>
                  </div>
                  <span className="inline-flex w-fit items-center rounded-md bg-[#F7F9FC] border border-[#E2E8F0] px-2.5 py-1 text-xs font-medium text-[#14213D]">
                    {inst.isPrimary ? 'Koordinator Utama' : 'Dosen Anggota'}
                  </span>
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-5 sm:p-6 border-[#E2E8F0] bg-white">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-[#E2E8F0]">
              <div>
                <h2 className="text-base font-bold text-[#172033]">
                  Daftar Peserta Mahasiswa ({enrollments.length})
                </h2>
                <p className="text-xs text-[#64748B] mt-0.5">
                  Kapasitas kelas: {activeStudents.length} aktif dari maksimum{' '}
                  {classroom.capacity} kursi ({pendingStudents.length} menunggu persetujuan).
                </p>
              </div>
              {canManage && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => navigate(`/classrooms/${id}/participants`)}
                  className="text-xs text-[#2563EB] border-blue-200 hover:bg-blue-50 flex items-center gap-1.5 shrink-0"
                >
                  <Users className="w-3.5 h-3.5" />
                  <span>Manajemen Peserta & Waitlist</span>
                </Button>
              )}
            </div>

            {/* Mobile Card List (< 768px) */}
            <div className="md:hidden mt-4 space-y-3">
              {enrollments.map((enr: any) => (
                <div
                  key={enr.id}
                  className="rounded-xl border border-[#E2E8F0] bg-[#F7F9FC] p-3.5 space-y-2.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-[#172033] truncate">
                        {enr.fullName}
                      </p>
                      <p className="text-xs text-[#64748B] truncate">{enr.email}</p>
                    </div>
                    <span
                      className={`shrink-0 rounded-md px-2 py-0.5 text-[10px] font-bold uppercase ${
                        enr.status === 'active'
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : enr.status === 'pending'
                            ? 'bg-amber-50 text-amber-700 border border-amber-200'
                            : 'bg-red-50 text-red-700 border border-red-200'
                      }`}
                    >
                      {enr.status}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-[#64748B]">
                    <span className="font-mono tabular-nums">NIM: {enr.identityNumber || '—'}</span>
                    <span className="font-mono tabular-nums">{formatDateTime(enr.enrolledAt)}</span>
                  </div>
                  {canManage && (enr.status === 'pending' || enr.status === 'active') && (
                    <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-[#E2E8F0]">
                      {enr.status === 'pending' && (
                        <>
                          <Button
                            type="button"
                            size="sm"
                            onClick={() =>
                              setEnrollmentConfirm({
                                enrollmentId: enr.id,
                                studentName: enr.fullName,
                                status: 'active',
                              })
                            }
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            <span>Setujui</span>
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="destructive"
                            onClick={() =>
                              setEnrollmentConfirm({
                                enrollmentId: enr.id,
                                studentName: enr.fullName,
                                status: 'rejected',
                              })
                            }
                          >
                            <XCircle className="h-3.5 w-3.5" />
                            <span>Tolak</span>
                          </Button>
                        </>
                      )}
                      {enr.status === 'active' && (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            setEnrollmentConfirm({
                              enrollmentId: enr.id,
                              studentName: enr.fullName,
                              status: 'dropped',
                            })
                          }
                        >
                          Drop Peserta
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Desktop & Tablet Table */}
            <div className="hidden md:block overflow-x-auto mt-4">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-[#E2E8F0] bg-[#F7F9FC] text-xs font-semibold text-[#64748B]">
                    <th className="py-3 px-4">Nama Mahasiswa</th>
                    <th className="py-3 px-4">NIM</th>
                    <th className="py-3 px-4">Status Enrollment</th>
                    <th className="py-3 px-4">Waktu Terdaftar</th>
                    {canManage && (
                      <th className="py-3 px-4 text-right">
                        Otorisasi Transaksional
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2E8F0] text-sm">
                  {enrollments.map((enr: any) => (
                    <tr key={enr.id} className="hover:bg-[#F7F9FC]/70">
                      <td className="py-3 px-4">
                        <p className="font-semibold text-[#172033]">
                          {enr.fullName}
                        </p>
                        <p className="text-xs text-[#64748B]">{enr.email}</p>
                      </td>
                      <td className="py-3 px-4 font-mono text-xs tabular-nums text-[#172033]">
                        {enr.identityNumber || '—'}
                      </td>
                      <td className="py-3 px-4 text-xs font-semibold">
                        <span
                          className={
                            enr.status === 'active'
                              ? 'text-emerald-700'
                              : enr.status === 'pending'
                                ? 'text-amber-700'
                                : 'text-red-700'
                          }
                        >
                          {enr.status.toUpperCase()}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-mono text-xs tabular-nums text-[#64748B]">
                        {formatDateTime(enr.enrolledAt)}
                      </td>
                      {canManage && (
                        <td className="py-3 px-4 text-right">
                          <div className="inline-flex items-center gap-2">
                            {enr.status === 'pending' && (
                              <>
                                <Button
                                  type="button"
                                  size="sm"
                                  onClick={() =>
                                    setEnrollmentConfirm({
                                      enrollmentId: enr.id,
                                      studentName: enr.fullName,
                                      status: 'active',
                                    })
                                  }
                                >
                                  <CheckCircle2 className="h-3.5 w-3.5" />
                                  <span>Setujui</span>
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="destructive"
                                  onClick={() =>
                                    setEnrollmentConfirm({
                                      enrollmentId: enr.id,
                                      studentName: enr.fullName,
                                      status: 'rejected',
                                    })
                                  }
                                >
                                  <XCircle className="h-3.5 w-3.5" />
                                  <span>Tolak</span>
                                </Button>
                              </>
                            )}
                            {enr.status === 'active' && (
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() =>
                                  setEnrollmentConfirm({
                                    enrollmentId: enr.id,
                                    studentName: enr.fullName,
                                    status: 'dropped',
                                  })
                                }
                              >
                                Drop Peserta
                              </Button>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* =====================================================================
          TAB 4: GRADES (WEIGHTED GRADEBOOK & ANALYTICS)
      ===================================================================== */}
      {activeTab === 'grades' && (
        <div className="mt-6 space-y-6">
          {/* Grade Categories Strip */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {(gradebook.categories || []).map((cat: any) => (
              <Card key={cat.id} className="p-4 border-[#E2E8F0] bg-white">
                <p className="text-xs text-[#64748B]">Komponen Penilaian</p>
                <p className="mt-1 text-sm font-bold text-[#172033]">
                  {cat.name}
                </p>
                <p className="mt-1 font-mono text-lg font-bold text-[#2563EB] tabular-nums">
                  Bobot {cat.weightPercent}%
                </p>
              </Card>
            ))}
            <Card className="p-4 border-[#E2E8F0] bg-white">
              <p className="text-xs text-[#64748B]">Total Item Evaluasi</p>
              <p className="mt-1 text-sm font-bold text-[#172033]">
                Tugas & Kuis Terdaftar
              </p>
              <p className="mt-1 font-mono text-lg font-bold text-[#14213D] tabular-nums">
                {gradebook.items?.length || 0} Item Penilaian
              </p>
            </Card>
          </div>

          <Card className="p-5 sm:p-6 border-[#E2E8F0] bg-white">
            <h2 className="text-base font-bold text-[#172033]">
              {canInspectAll
                ? 'Matriks Buku Nilai Seluruh Mahasiswa Aktif'
                : 'Transkrip Nilai Personal Anda pada Kelas Ini'}
            </h2>
            <p className="text-xs text-[#64748B] mt-0.5">
              Nilai mahasiswa dilindungi kebijakan privasi server-side: mahasiswa hanya dapat melihat nilainya sendiri.
            </p>

            {/* Mobile Grade Cards (< 768px) */}
            <div className="md:hidden mt-4 space-y-3">
              {(canInspectAll
                ? activeStudents
                : activeStudents.filter((s: any) => s.studentId === user?.id)
              ).map((stu: any) => {
                const stuRecords = (gradebook.records || []).filter(
                  (r: any) => r.studentId === stu.studentId
                );
                const avg =
                  stuRecords.length > 0
                    ? (
                        stuRecords.reduce(
                          (acc: number, r: any) => acc + Number(r.score),
                          0
                        ) / stuRecords.length
                      ).toFixed(2)
                    : null;

                return (
                  <div
                    key={stu.studentId}
                    className="rounded-xl border border-[#E2E8F0] bg-[#F7F9FC] p-3.5 space-y-2.5"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-[#172033] truncate">
                          {stu.fullName}
                        </p>
                        <p className="font-mono text-xs text-[#64748B] tabular-nums">
                          {stu.identityNumber}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-[10px] uppercase text-[#64748B]">Rata-rata</p>
                        <p className="font-mono text-base font-bold text-emerald-700 tabular-nums">
                          {avg ?? '—'}
                        </p>
                      </div>
                    </div>
                    {(gradebook.items || []).length > 0 && (
                      <div className="pt-2 border-t border-[#E2E8F0] space-y-1.5">
                        {(gradebook.items || []).map((item: any) => {
                          const rec = stuRecords.find(
                            (r: any) => r.gradeItemId === item.id
                          );
                          return (
                            <div
                              key={item.id}
                              className="flex items-center justify-between gap-2 text-xs"
                            >
                              <span className="text-[#64748B] truncate">{item.title}</span>
                              <span className="font-mono tabular-nums shrink-0 font-semibold text-[#172033]">
                                {rec ? `${rec.score} / ${item.maxScore}` : 'Belum ada'}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Desktop & Tablet Gradebook Table */}
            <div className="hidden md:block overflow-x-auto mt-4">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-[#E2E8F0] bg-[#F7F9FC] text-xs font-semibold text-[#64748B]">
                    <th className="py-3 px-4">Mahasiswa</th>
                    {(gradebook.items || []).map((item: any) => (
                      <th key={item.id} className="py-3 px-4 text-right">
                        {item.title}
                      </th>
                    ))}
                    <th className="py-3 px-4 text-right">Rata-Rata Akhir</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2E8F0] text-sm">
                  {(canInspectAll
                    ? activeStudents
                    : activeStudents.filter((s: any) => s.studentId === user?.id)
                  ).map((stu: any) => {
                    const stuRecords = (gradebook.records || []).filter(
                      (r: any) => r.studentId === stu.studentId
                    );
                    const avg =
                      stuRecords.length > 0
                        ? (
                            stuRecords.reduce(
                              (acc: number, r: any) => acc + Number(r.score),
                              0
                            ) / stuRecords.length
                          ).toFixed(2)
                        : null;

                    return (
                      <tr key={stu.studentId} className="hover:bg-[#F7F9FC]/70">
                        <td className="py-3 px-4">
                          <p className="font-semibold text-[#172033]">
                            {stu.fullName}
                          </p>
                          <p className="font-mono text-xs text-[#64748B] tabular-nums">
                            {stu.identityNumber}
                          </p>
                        </td>
                        {(gradebook.items || []).map((item: any) => {
                          const rec = stuRecords.find(
                            (r: any) => r.gradeItemId === item.id
                          );
                          return (
                            <td
                              key={item.id}
                              className="py-3 px-4 text-right font-mono text-xs tabular-nums"
                            >
                              {rec ? (
                                <strong className="text-[#172033]">
                                  {rec.score} / {item.maxScore}
                                </strong>
                              ) : (
                                <span className="text-[#64748B]">Belum ada</span>
                              )}
                            </td>
                          );
                        })}
                        <td className="py-3 px-4 text-right font-mono text-sm font-bold tabular-nums text-emerald-700">
                          {avg ? `${avg}` : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* =====================================================================
          TAB 5: ANALYTICS (INSTRUCTOR DASHBOARD)
      ===================================================================== */}
      {activeTab === 'analytics' && canManage && id && (
        <InstructorAnalyticsDashboard classroomId={id} />
      )}

      {/* =====================================================================
          TAB 6: SETTINGS (ADVANCED CLASSROOM SETTINGS CENTER)
      ===================================================================== */}
      {activeTab === 'settings' && canManage && id && (
        <ClassroomSettingsCenter classroomId={id} />
      )}

      {/* =====================================================================
          CLASSROOM MODALS & CONFIRMATION DIALOGS
      ===================================================================== */}

      {/* Create Announcement Modal */}
      <ModalDialog
        open={announceModalOpen}
        onClose={() => setAnnounceModalOpen(false)}
        title="Terbitkan Pengumuman di Stream Kelas"
      >
        <form
          onSubmit={announceForm.handleSubmit((v) =>
            announceMutation.mutate(v)
          )}
          className="space-y-4"
        >
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Judul Pengumuman
            </label>
            <Input
              placeholder="Contoh: Perubahan Jadwal Praktikum Laboratorium"
              {...announceForm.register('title', { required: true })}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Isi Pengumuman
            </label>
            <Textarea
              placeholder="Tuliskan informasi lengkap untuk seluruh mahasiswa..."
              {...announceForm.register('content', { required: true })}
            />
          </div>
          <label className="flex items-center gap-2 text-xs font-medium text-slate-700">
            <input type="checkbox" {...announceForm.register('isPinned')} />
            <span>Sematkan (Pin) di bagian atas Stream</span>
          </label>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setAnnounceModalOpen(false)}
            >
              Batal
            </Button>
            <Button type="submit" disabled={announceMutation.isPending}>
              Terbitkan
            </Button>
          </div>
        </form>
      </ModalDialog>

      {/* Create Topic Modal */}
      <ModalDialog
        open={topicModalOpen}
        onClose={() => setTopicModalOpen(false)}
        title="Tambah Topik Modul Pembelajaran"
      >
        <form
          onSubmit={topicForm.handleSubmit((v) => topicMutation.mutate(v))}
          className="space-y-4"
        >
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Nama Topik / Modul Mingguan
            </label>
            <Input
              placeholder="Contoh: Modul 03: Keamanan Jaringan & Firewall"
              {...topicForm.register('title', { required: true })}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Deskripsi Singkat
            </label>
            <Textarea {...topicForm.register('description')} />
          </div>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setTopicModalOpen(false)}
            >
              Batal
            </Button>
            <Button type="submit" disabled={topicMutation.isPending}>
              Simpan Topik
            </Button>
          </div>
        </form>
      </ModalDialog>

      {/* Note: Simple Material Modal has been replaced by the full-page Advanced Learning Material Builder (/classrooms/:id/materials/new) */}

      {/* Create Assignment Modal */}
      <ModalDialog
        open={assignmentModalOpen}
        onClose={() => setAssignmentModalOpen(false)}
        title="Buat Tugas Praktikum Baru"
      >
        <form
          onSubmit={assignmentForm.handleSubmit((v) =>
            assignmentMutation.mutate(v)
          )}
          className="space-y-4"
        >
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Judul Tugas
            </label>
            <Input
              placeholder="Contoh: Tugas Praktikum 03: Pengujian Integrasi API"
              {...assignmentForm.register('title', { required: true })}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Instruksi Pengerjaan & Kriteria Penilaian
            </label>
            <Textarea
              {...assignmentForm.register('instructions', { required: true })}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Skor Maksimum
              </label>
              <Input
                type="number"
                {...assignmentForm.register('maxPoints', { required: true })}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Tenggat Waktu (Hari dari Sekarang)
              </label>
              <Input
                type="number"
                {...assignmentForm.register('dueDaysFromNow', {
                  required: true,
                })}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setAssignmentModalOpen(false)}
            >
              Batal
            </Button>
            <Button type="submit" disabled={assignmentMutation.isPending}>
              Terbitkan Tugas
            </Button>
          </div>
        </form>
      </ModalDialog>

      {/* Student Submit Assignment Modal */}
      <ModalDialog
        open={Boolean(activeAssignmentForSubmit)}
        onClose={() => setActiveAssignmentForSubmit(null)}
        title={`Pengumpulan Tugas: ${activeAssignmentForSubmit?.title || ''}`}
        description="Setiap pengiriman akan tersimpan di tabel assignment_submissions dan mencatat riwayat revisi."
      >
        <form
          onSubmit={submitWorkForm.handleSubmit((v) =>
            submitWorkMutation.mutate(v)
          )}
          className="space-y-4"
        >
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Laporan Hasil Praktikum / Jawaban Anda
            </label>
            <Textarea
              placeholder="Jelaskan hasil implementasi dan penyelesaian tugas Anda..."
              {...submitWorkForm.register('submissionText', { required: true })}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Tautan Repositori Kode / Lampiran Proyek
            </label>
            <Input {...submitWorkForm.register('repositoryUrl')} />
          </div>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setActiveAssignmentForSubmit(null)}
            >
              Batal
            </Button>
            <Button
              type="submit"
              variant="accent"
              disabled={submitWorkMutation.isPending}
            >
              {submitWorkMutation.isPending
                ? 'Mengirim...'
                : 'Kirim Pengumpulan Tugas'}
            </Button>
          </div>
        </form>
      </ModalDialog>

      {/* Instructor Grade Submission Modal */}
      <ModalDialog
        open={Boolean(activeSubmissionForGrade)}
        onClose={() => setActiveSubmissionForGrade(null)}
        title={`Penilaian Tugas: ${
          activeSubmissionForGrade?.studentName || ''
        }`}
        description="Nilai akan otomatis disinkronkan ke Buku Nilai (grade_records) dan mengirimkan notifikasi ke mahasiswa."
      >
        <form
          onSubmit={gradeWorkForm.handleSubmit((v) =>
            gradeWorkMutation.mutate(v)
          )}
          className="space-y-4"
        >
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Skor Penilaian (0 - 100)
            </label>
            <Input
              type="number"
              min={0}
              max={100}
              step="0.5"
              {...gradeWorkForm.register('score', { required: true })}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Catatan Evaluasi / Umpan Balik Dosen
            </label>
            <Textarea
              {...gradeWorkForm.register('feedback', { required: true })}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setActiveSubmissionForGrade(null)}
            >
              Batal
            </Button>
            <Button type="submit" disabled={gradeWorkMutation.isPending}>
              Simpan Nilai & Sinkronkan Buku Nilai
            </Button>
          </div>
        </form>
      </ModalDialog>

      {/* Instructor Create Quiz Modal */}
      <ModalDialog
        open={quizModalOpen}
        onClose={() => setQuizModalOpen(false)}
        title="Buat Kuis Evaluasi Pilihan Ganda"
        description="Kunci jawaban disimpan secara aman di PostgreSQL dan tidak pernah dikirim ke browser mahasiswa."
        maxWidth="max-w-xl"
      >
        <form
          onSubmit={quizCreateForm.handleSubmit((v) =>
            createQuizMutation.mutate(v)
          )}
          className="space-y-4"
        >
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Judul Kuis
            </label>
            <Input
              placeholder="Contoh: Kuis Evaluasi 02: Keamanan Sesi & Transaksi"
              {...quizCreateForm.register('title', { required: true })}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Deskripsi Kuis
            </label>
            <Input
              placeholder="Petunjuk pengerjaan kuis..."
              {...quizCreateForm.register('description', { required: true })}
            />
          </div>
          <div className="rounded-lg border border-slate-200 p-3.5 space-y-2">
            <p className="text-xs font-bold text-slate-900">
              Pertanyaan #1 (50 Poin)
            </p>
            <Input {...quizCreateForm.register('q1Text', { required: true })} />
            <Input
              placeholder="Opsi A (Jawaban Benar)"
              {...quizCreateForm.register('q1OptA', { required: true })}
            />
            <Input
              placeholder="Opsi B (Pengecoh)"
              {...quizCreateForm.register('q1OptB', { required: true })}
            />
          </div>
          <div className="rounded-lg border border-slate-200 p-3.5 space-y-2">
            <p className="text-xs font-bold text-slate-900">
              Pertanyaan #2 (50 Poin)
            </p>
            <Input {...quizCreateForm.register('q2Text', { required: true })} />
            <Input
              placeholder="Opsi A (Jawaban Benar)"
              {...quizCreateForm.register('q2OptA', { required: true })}
            />
            <Input
              placeholder="Opsi B (Pengecoh)"
              {...quizCreateForm.register('q2OptB', { required: true })}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setQuizModalOpen(false)}
            >
              Batal
            </Button>
            <Button type="submit" disabled={createQuizMutation.isPending}>
              Terbitkan Kuis
            </Button>
          </div>
        </form>
      </ModalDialog>

      {/* Student Attempt Quiz Modal */}
      <ModalDialog
        open={Boolean(activeQuizForAttempt)}
        onClose={() => setActiveQuizForAttempt(null)}
        title={activeQuizForAttempt?.title || 'Lembar Kerja Kuis'}
        description="Pilih jawaban yang paling tepat. Penilaian dilakukan secara otomatis di sisi server."
        maxWidth="max-w-2xl"
      >
        <div className="space-y-5">
          {(activeQuizForAttempt?.questions || []).map(
            (q: any, idx: number) => (
              <div
                key={q.id}
                className="rounded-lg border border-slate-200 p-4 space-y-3"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-sm font-semibold text-slate-900">
                    {idx + 1}. {q.questionText}
                  </p>
                  <span className="font-mono text-xs text-slate-500 tabular-nums shrink-0">
                    {q.points} Poin
                  </span>
                </div>
                <div className="space-y-2">
                  {(q.options || []).map((opt: any) => {
                    const checked = selectedQuizAnswers[q.id] === opt.id;
                    return (
                      <label
                        key={opt.id}
                        className={`flex items-center gap-3 rounded-lg border p-3 text-xs cursor-pointer transition-colors ${
                          checked
                            ? 'border-slate-900 bg-slate-900 text-white'
                            : 'border-slate-200 bg-white text-slate-800 hover:bg-slate-50'
                        }`}
                      >
                        <input
                          type="radio"
                          name={`q-${q.id}`}
                          checked={checked}
                          onChange={() =>
                            setSelectedQuizAnswers((prev) => ({
                              ...prev,
                              [q.id]: opt.id,
                            }))
                          }
                          className="sr-only"
                        />
                        <span className="font-mono font-bold">
                          {opt.optionLabel}.
                        </span>
                        <span>{opt.optionText}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setActiveQuizForAttempt(null)}
            >
              Batal
            </Button>
            <Button
              type="button"
              variant="accent"
              disabled={submitQuizAttemptMutation.isPending}
              onClick={() => submitQuizAttemptMutation.mutate()}
            >
              {submitQuizAttemptMutation.isPending
                ? 'Menilai Jawaban...'
                : 'Kumpulkan Jawaban Kuis'}
            </Button>
          </div>
        </div>
      </ModalDialog>

      {/* Authorized Private File Download Viewer Modal */}
      <ModalDialog
        open={Boolean(downloadedFileModal)}
        onClose={() => setDownloadedFileModal(null)}
        title={`Berkas Privat Terotorisasi: ${
          downloadedFileModal?.originalName || ''
        }`}
        description={`Bucket S3: ${downloadedFileModal?.bucket} · Object Key: ${downloadedFileModal?.objectKey}`}
      >
        <pre className="rounded-lg bg-slate-950 p-4 text-xs font-mono text-slate-100 whitespace-pre-wrap">
          {downloadedFileModal?.content}
        </pre>
      </ModalDialog>

      {/* Enrollment Status Confirmation Dialog */}
      <ConfirmDialog
        open={Boolean(enrollmentConfirm)}
        onClose={() => setEnrollmentConfirm(null)}
        onConfirm={() => {
          if (!enrollmentConfirm) return;
          updateEnrollmentMutation.mutate({
            enrollmentId: enrollmentConfirm.enrollmentId,
            status: enrollmentConfirm.status,
          });
        }}
        title="Konfirmasi Perubahan Status Pendaftaran"
        description={`Ubah status pendaftaran mahasiswa "${
          enrollmentConfirm?.studentName
        }" menjadi ${enrollmentConfirm?.status.toUpperCase()}? Operasi ini dijalankan di dalam transaksi PostgreSQL dan menyimpan riwayat status.`}
        confirmLabel="Ya, Perbarui Status"
        variant={
          enrollmentConfirm?.status === 'rejected' ||
          enrollmentConfirm?.status === 'dropped'
            ? 'destructive'
            : 'default'
        }
        isLoading={updateEnrollmentMutation.isPending}
      />

      {/* Join Code Governance Confirmation Dialog */}
      <ConfirmDialog
        open={Boolean(joinCodeConfirm)}
        onClose={() => setJoinCodeConfirm(null)}
        onConfirm={() => {
          if (joinCodeConfirm === 'regenerate') {
            updateSettingsMutation.mutate({ regenerateJoinCode: true });
          } else if (joinCodeConfirm === 'revoke') {
            updateSettingsMutation.mutate({ revokeJoinCodes: true });
          }
        }}
        title={
          joinCodeConfirm === 'regenerate'
            ? 'Buat Ulang Kode Kelas Baru'
            : 'Cabut Kode Kelas Aktif'
        }
        description={
          joinCodeConfirm === 'regenerate'
            ? 'Kode kelas lama akan dicabut secara permanen dan digantikan dengan kode baru.'
            : 'Mencabut kode kelas akan mencegah mahasiswa baru bergabung menggunakan kode hingga Anda membuat kode baru.'
        }
        confirmLabel="Ya, Lanjutkan"
        variant={joinCodeConfirm === 'revoke' ? 'destructive' : 'default'}
        isLoading={updateSettingsMutation.isPending}
      />

      {/* Edit Module Modal */}
      <ModalDialog
        open={Boolean(editingModule)}
        onClose={() => setEditingModule(null)}
        title="Edit Modul Pembelajaran"
      >
        {editingModule && (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Judul Modul
              </label>
              <Input
                value={editingModule.title}
                onChange={(e) =>
                  setEditingModule({ ...editingModule, title: e.target.value })
                }
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Deskripsi Modul
              </label>
              <Textarea
                rows={3}
                value={editingModule.description}
                onChange={(e) =>
                  setEditingModule({ ...editingModule, description: e.target.value })
                }
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Status Publikasi
              </label>
              <select
                value={editingModule.status}
                onChange={(e) =>
                  setEditingModule({ ...editingModule, status: e.target.value })
                }
                className="w-full h-9 rounded-lg border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700"
              >
                <option value="PUBLISHED">PUBLISHED (Tampil ke Mahasiswa)</option>
                <option value="DRAFT">DRAFT (Disembunyikan)</option>
                <option value="ARCHIVED">ARCHIVED (Diarsipkan)</option>
              </select>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setEditingModule(null)}>
                Batal
              </Button>
              <Button
                disabled={updateModuleMutation.isPending || !editingModule.title.trim()}
                onClick={() =>
                  updateModuleMutation.mutate({
                    moduleId: editingModule.id,
                    data: {
                      title: editingModule.title.trim(),
                      description: editingModule.description,
                      status: editingModule.status,
                    },
                  })
                }
              >
                {updateModuleMutation.isPending ? 'Menyimpan...' : 'Simpan Perubahan'}
              </Button>
            </div>
          </div>
        )}
      </ModalDialog>

      <ConfirmDialog {...deleteConfirm.dialogProps} />
    </AppShell>
  );
}
