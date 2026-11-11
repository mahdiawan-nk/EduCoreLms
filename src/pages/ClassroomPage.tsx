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

type ClassroomTab = 'stream' | 'classwork' | 'people' | 'grades' | 'settings';

export function ClassroomPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<ClassroomTab>('stream');

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

  const canManage = Boolean(access?.canManage);
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
      {/* Classroom Institutional Banner */}
      <div className="rounded-xl border border-slate-200 bg-slate-900 p-6 sm:p-8 text-white">
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6">
          <div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-amber-400">
              <span className="font-mono font-semibold tabular-nums">
                {classroom.course?.code || 'MK'}
              </span>
              <span aria-hidden="true">·</span>
              <span>{classroom.course?.studyProgram}</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums">
                {classroom.course?.credits || 3} SKS
              </span>
              <span aria-hidden="true">·</span>
              <span>{classroom.semester?.name}</span>
            </div>

            <h1 className="mt-2 text-2xl sm:text-3xl font-bold tracking-tight text-white">
              {classroom.name}
            </h1>
            <p className="mt-1 text-sm text-slate-300">
              {classroom.section} · {classroom.roomNumber} ·{' '}
              {classroom.scheduleText}
            </p>
            {classroom.description && (
              <p className="mt-2 text-xs text-slate-400 max-w-2xl">
                {classroom.description}
              </p>
            )}
          </div>

          {/* Join Code & Capacity Box */}
          <div className="flex flex-wrap items-center gap-6 rounded-lg border border-slate-800 bg-slate-800/80 px-5 py-3.5 shrink-0">
            {canManage && (
              <div>
                <p className="text-xs text-slate-400">Kode Kelas Aktif</p>
                <p className="mt-0.5 font-mono text-lg font-bold text-amber-400 tabular-nums">
                  {activeJoinCode || 'DICABUT'}
                </p>
              </div>
            )}
            <div className={canManage ? 'border-l border-slate-700 pl-6' : ''}>
              <p className="text-xs text-slate-400">Peserta Aktif</p>
              <p className="mt-0.5 font-mono text-lg font-bold text-white tabular-nums">
                {activeStudents.length} / {classroom.capacity}
              </p>
            </div>
          </div>
        </div>

        {/* 5 Required Classroom Navigation Tabs: Stream, Classwork, People, Grades, Settings */}
        <div className="mt-8 pt-4 border-t border-slate-800 flex flex-wrap items-center gap-2">
          {(
            [
              { id: 'stream', label: '1. Stream', icon: MessageSquare },
              { id: 'classwork', label: '2. Classwork', icon: BookOpen },
              {
                id: 'people',
                label: `3. People (${activeStudents.length})`,
                icon: Users,
              },
              { id: 'grades', label: '4. Grades', icon: Award },
              ...(canManage
                ? [{ id: 'settings', label: '5. Settings', icon: Settings }]
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
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  active
                    ? 'bg-amber-500 text-slate-950'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* =====================================================================
          TAB 1: STREAM (ANNOUNCEMENTS & CLASS DISCUSSION)
      ===================================================================== */}
      {activeTab === 'stream' && (
        <div className="mt-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: Summary & Upcoming */}
          <div className="lg:col-span-4 space-y-4">
            <Card className="p-5">
              <h3 className="text-sm font-bold text-slate-900">
                Informasi Ruang Kelas
              </h3>
              <div className="mt-3 space-y-2 text-xs text-slate-600">
                <p>
                  <span className="text-slate-500">Dosen Pengampu: </span>
                  <strong className="text-slate-900">
                    {instructors.map((i: any) => i.fullName).join(', ')}
                  </strong>
                </p>
                <p>
                  <span className="text-slate-500">Kebijakan Pendaftaran: </span>
                  <strong className="text-slate-900">
                    {classroom.enrollmentPolicy === 'AUTO'
                      ? 'Otomatis Aktif'
                      : 'Persetujuan Dosen'}
                  </strong>
                </p>
                <p>
                  <span className="text-slate-500">Total Tugas & Kuis: </span>
                  <strong className="font-mono tabular-nums text-slate-900">
                    {assignments.length} Tugas · {quizzes.length} Kuis
                  </strong>
                </p>
              </div>
              {canManage && (
                <div className="mt-4 pt-4 border-t border-slate-100">
                  <Button
                    type="button"
                    size="sm"
                    className="w-full"
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
                <Card key={ann.id} className="p-6">
                  <div className="flex items-baseline justify-between gap-4">
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <span className="font-semibold text-slate-800">
                        {ann.authorName}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono tabular-nums">
                        {formatDateTime(ann.createdAt)}
                      </span>
                      {ann.isPinned && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="font-semibold text-amber-700">
                            Disematkan
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  <h3 className="mt-2 text-base font-bold text-slate-900">
                    {ann.title}
                  </h3>
                  <p className="mt-2 text-sm text-slate-700 leading-relaxed whitespace-pre-line">
                    {ann.content}
                  </p>

                  {/* Comments Thread */}
                  <div className="mt-5 pt-4 border-t border-slate-100 space-y-3">
                    {ann.comments?.map((c: any) => (
                      <div
                        key={c.id}
                        className="rounded-lg bg-slate-50 px-3.5 py-2.5 text-xs"
                      >
                        <div className="flex items-center justify-between text-slate-500">
                          <span className="font-semibold text-slate-900">
                            {c.authorName}
                          </span>
                          <span className="font-mono tabular-nums">
                            {formatDateTime(c.createdAt)}
                          </span>
                        </div>
                        <p className="mt-1 text-slate-700">{c.content}</p>
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
                      className="flex items-center gap-2 pt-1"
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
                        className="h-9 text-xs"
                      />
                      <Button
                        type="submit"
                        size="sm"
                        variant="outline"
                        disabled={commentMutation.isPending}
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
      )}

      {/* =====================================================================
          TAB 2: CLASSWORK (TOPICS, MATERIALS, ASSIGNMENTS, QUIZZES)
      ===================================================================== */}
      {activeTab === 'classwork' && (
        <div className="mt-6 space-y-8">
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

            {topics.map((t: any) => {
              const topicMats = materials.filter(
                (m: any) => m.topicId === t.id
              );
              return (
                <Card key={t.id} className="p-6 space-y-4">
                  <div className="border-b border-slate-100 pb-3 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h3 className="text-base font-bold text-slate-900">
                        {t.title}
                      </h3>
                      {t.description && (
                        <p className="mt-0.5 text-xs text-slate-500">
                          {t.description}
                        </p>
                      )}
                    </div>
                    {canManage && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          navigate(`/classrooms/${id}/materials/new?topicId=${t.id}`)
                        }
                      >
                        <Plus className="h-3.5 w-3.5" />
                        <span>Tambah Materi di Modul Ini</span>
                      </Button>
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
                                      onClick={() => deleteMaterialMutation.mutate(m.id)}
                                      disabled={deleteMaterialMutation.isPending}
                                      className="p-2 rounded-lg border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 transition"
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
                          {!canManage ? (
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
                          {!canManage ? (
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

                        {!canManage && (
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
        </div>
      )}

      {/* =====================================================================
          TAB 3: PEOPLE (INSTRUCTORS & STUDENT ENROLLMENTS)
      ===================================================================== */}
      {activeTab === 'people' && (
        <div className="mt-6 space-y-6">
          <Card className="p-6">
            <h2 className="text-base font-bold text-slate-900">
              Dosen Pengampu Ruang Kelas ({instructors.length})
            </h2>
            <div className="mt-4 divide-y divide-slate-100">
              {instructors.map((inst: any) => (
                <div
                  key={inst.id}
                  className="py-3 flex items-center justify-between text-sm"
                >
                  <div>
                    <p className="font-semibold text-slate-900">
                      {inst.fullName}
                    </p>
                    <p className="text-xs text-slate-500">
                      {inst.email} ·{' '}
                      <span className="font-mono tabular-nums">
                        {inst.identityNumber}
                      </span>
                    </p>
                  </div>
                  <span className="text-xs font-medium text-slate-600">
                    {inst.isPrimary ? 'Koordinator Utama' : 'Dosen Anggota'}
                  </span>
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b border-slate-100">
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  Daftar Peserta Mahasiswa ({enrollments.length})
                </h2>
                <p className="text-xs text-slate-500">
                  Kapasitas kelas: {activeStudents.length} aktif dari maksimum{' '}
                  {classroom.capacity} kursi ({pendingStudents.length} menunggu persetujuan).
                </p>
              </div>
              {canManage && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => navigate(`/classrooms/${id}/participants`)}
                  className="text-xs text-blue-700 border-blue-200 hover:bg-blue-50 flex items-center gap-1.5"
                >
                  <Users className="w-3.5 h-3.5" />
                  <span>Workspace Manajemen Peserta & Waitlist</span>
                </Button>
              )}
            </div>

            <div className="overflow-x-auto mt-4">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/80 text-xs font-semibold text-slate-600">
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
                <tbody className="divide-y divide-slate-200 text-sm">
                  {enrollments.map((enr: any) => (
                    <tr key={enr.id} className="hover:bg-slate-50/70">
                      <td className="py-3 px-4">
                        <p className="font-semibold text-slate-900">
                          {enr.fullName}
                        </p>
                        <p className="text-xs text-slate-500">{enr.email}</p>
                      </td>
                      <td className="py-3 px-4 font-mono text-xs tabular-nums text-slate-700">
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
                      <td className="py-3 px-4 font-mono text-xs tabular-nums text-slate-500">
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
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {(gradebook.categories || []).map((cat: any) => (
              <Card key={cat.id} className="p-4">
                <p className="text-xs text-slate-500">Komponen Penilaian</p>
                <p className="mt-1 text-sm font-bold text-slate-900">
                  {cat.name}
                </p>
                <p className="mt-1 font-mono text-lg font-bold text-amber-700 tabular-nums">
                  Bobot {cat.weightPercent}%
                </p>
              </Card>
            ))}
            <Card className="p-4">
              <p className="text-xs text-slate-500">Total Item Evaluasi</p>
              <p className="mt-1 text-sm font-bold text-slate-900">
                Tugas & Kuis Terdaftar
              </p>
              <p className="mt-1 font-mono text-lg font-bold text-slate-900 tabular-nums">
                {gradebook.items?.length || 0} Item Penilaian
              </p>
            </Card>
          </div>

          <Card className="p-6 overflow-x-auto">
            <h2 className="text-base font-bold text-slate-900">
              {canManage
                ? 'Matriks Buku Nilai Seluruh Mahasiswa Aktif'
                : 'Transkrip Nilai Personal Anda pada Kelas Ini'}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Nilai mahasiswa dilindungi kebijakan privasi server-side: mahasiswa hanya dapat melihat nilainya sendiri.
            </p>

            <table className="mt-4 w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80 text-xs font-semibold text-slate-600">
                  <th className="py-3 px-4">Mahasiswa</th>
                  {(gradebook.items || []).map((item: any) => (
                    <th key={item.id} className="py-3 px-4 text-right">
                      {item.title}
                    </th>
                  ))}
                  <th className="py-3 px-4 text-right">Rata-Rata Akhir</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-sm">
                {(canManage
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
                    <tr key={stu.studentId} className="hover:bg-slate-50/70">
                      <td className="py-3 px-4">
                        <p className="font-semibold text-slate-900">
                          {stu.fullName}
                        </p>
                        <p className="font-mono text-xs text-slate-500 tabular-nums">
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
                              <strong className="text-slate-900">
                                {rec.score} / {item.maxScore}
                              </strong>
                            ) : (
                              <span className="text-slate-400">Belum ada</span>
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
          </Card>
        </div>
      )}

      {/* =====================================================================
          TAB 5: SETTINGS (CLASSROOM CONFIGURATION & JOIN CODE GOVERNANCE)
      ===================================================================== */}
      {activeTab === 'settings' && canManage && (
        <div className="mt-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
          <Card className="lg:col-span-7 p-6">
            <h2 className="text-base font-bold text-slate-900">
              Konfigurasi Ruang Kelas & Kapasitas
            </h2>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                updateSettingsMutation.mutate({
                  name: String(fd.get('name')),
                  section: String(fd.get('section')),
                  roomNumber: String(fd.get('roomNumber')),
                  scheduleText: String(fd.get('scheduleText')),
                  capacity: Number(fd.get('capacity')),
                  enrollmentPolicy: String(fd.get('enrollmentPolicy')),
                });
              }}
              className="mt-4 space-y-4"
            >
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Nama Ruang Kelas
                </label>
                <Input name="name" defaultValue={classroom.name} required />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Seksi Kelas
                  </label>
                  <Input
                    name="section"
                    defaultValue={classroom.section}
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Ruangan Laboratorium
                  </label>
                  <Input
                    name="roomNumber"
                    defaultValue={classroom.roomNumber}
                    required
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Jadwal Perkuliahan
                  </label>
                  <Input
                    name="scheduleText"
                    defaultValue={classroom.scheduleText}
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Kapasitas Maksimum Kursi
                  </label>
                  <Input
                    name="capacity"
                    type="number"
                    min={5}
                    max={200}
                    defaultValue={classroom.capacity}
                    required
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Kebijakan Pendaftaran Mahasiswa Baru
                </label>
                <select
                  name="enrollmentPolicy"
                  defaultValue={classroom.enrollmentPolicy}
                  className="w-full h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm"
                >
                  <option value="AUTO">
                    Otomatis Aktif (AUTO) — Mahasiswa langsung aktif saat memasukkan kode
                  </option>
                  <option value="APPROVAL_REQUIRED">
                    Wajib Persetujuan Dosen (APPROVAL_REQUIRED) — Status pending hingga disetujui
                  </option>
                </select>
              </div>
              <div className="pt-2">
                <Button
                  type="submit"
                  disabled={updateSettingsMutation.isPending}
                >
                  {updateSettingsMutation.isPending
                    ? 'Menyimpan...'
                    : 'Simpan Pengaturan Kelas'}
                </Button>
              </div>
            </form>
          </Card>

          <Card className="lg:col-span-5 p-6 flex flex-col justify-between">
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Manajemen Kode Gabung Kelas (Join Code)
              </h2>
              <p className="mt-1 text-xs text-slate-600">
                Kode gabung kelas bersifat unik dan dapat diperbarui atau dicabut kapan saja untuk mencegah pendaftaran tanpa izin.
              </p>

              <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs text-slate-500">Kode Aktif Saat Ini</p>
                <p className="mt-1 font-mono text-2xl font-bold text-slate-900 tabular-nums">
                  {activeJoinCode || 'TIDAK ADA (DICABUT)'}
                </p>
              </div>

              <div className="mt-4 space-y-2">
                <Button
                  type="button"
                  variant="outline"
                  className="w-full justify-start"
                  onClick={() => setJoinCodeConfirm('regenerate')}
                >
                  <RefreshCw className="h-4 w-4" />
                  <span>Buat Ulang (Regenerate) Kode Kelas Baru</span>
                </Button>
                {activeJoinCode && (
                  <Button
                    type="button"
                    variant="destructive"
                    className="w-full justify-start"
                    onClick={() => setJoinCodeConfirm('revoke')}
                  >
                    <XCircle className="h-4 w-4" />
                    <span>Cabut (Revoke) Kode Kelas Aktif</span>
                  </Button>
                )}
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-slate-100 text-xs text-slate-500">
              Riwayat Kode Kelas ({joinCodes.length} tercatat di PostgreSQL)
            </div>
          </Card>
        </div>
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
    </AppShell>
  );
}
