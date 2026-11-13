import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  Info,
  UserPlus,
  Users,
  Shield,
  Bell,
  History,
  Archive,
  Save,
  Copy,
  RefreshCw,
  Ban,
  CheckCircle2,
  XCircle,
  Search,
  Trash2,
  RotateCcw,
  KeyRound,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  Eye,
  Lock,
  Sparkles,
  Calendar,
  User as UserIcon,
} from 'lucide-react';
import { apiFetch } from '../../lib/api';
import { Button, Input, Textarea, Card, Skeleton, ConfirmDialog } from '../ui/primitives';
import { LightweightTiptapEditor } from '../LightweightTiptapEditor';
import { ClassroomCoverUploader, CoverMetadata } from '../ClassroomCoverUploader';
import { useDeleteConfirmation } from '../../hooks/useDeleteConfirmation';

type SettingsSectionId =
  | 'identity'
  | 'enrollment'
  | 'instructors'
  | 'privacy'
  | 'notifications'
  | 'history'
  | 'lifecycle';

interface SettingsPayload {
  classroom: {
    id: string;
    name: string;
    classroomCode: string | null;
    subjectName: string | null;
    subjectCode: string | null;
    section: string;
    cohort: string | null;
    academicYear: string;
    semesterName: string;
    description: string | null;
    cpmk: string | null;
    capacity: number;
    minCapacity: number;
    maxCapacity: number;
    enrollmentPolicy: 'AUTO' | 'APPROVAL_REQUIRED' | 'INVITATION_ONLY' | 'INSTRUCTOR_MANAGED';
    visibility: string;
    lifecycleStatus: string;
    status: string;
    coverImagePath: string | null;
    coverThumbnailPath: string | null;
    coverMimeType?: string | null;
    coverWidth: number | null;
    coverHeight: number | null;
    coverFileSize: number | null;
    privacyConfig: Record<string, unknown> | null;
    notificationConfig: Record<string, unknown> | null;
    createdAt: string;
    updatedAt: string;
    archivedAt: string | null;
    creator: { id: string; fullName: string; email: string } | null;
    academicPeriod: { id: string; name: string; academicYear: string; semesterType: string } | null;
  };
  dashboardStats: {
    totalEnrolledStudents: number;
    maxCapacity: number;
    availableCapacity: number;
    pendingRequests: number;
    instructorCount: number;
    joinCodeActive: boolean;
    activeJoinCode: string | null;
    lifecycleStatus: string;
  };
  enrollmentPolicy: {
    enrollmentMode: string;
    maxParticipants: number;
    allowLateEnrollment: boolean;
    waitingListEnabled: boolean;
  } | null;
  joinCodes: {
    active: JoinCodeItem | null;
    history: JoinCodeItem[];
  };
  instructors: InstructorItem[];
  enrollments: EnrollmentItem[];
  actorRole: {
    role: string;
    isCreator: boolean;
    canManageAll: boolean;
  };
}

interface JoinCodeItem {
  id: string;
  code: string;
  isActive: boolean;
  maxUses: number | null;
  usesCount: number;
  revokedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
}

interface InstructorItem {
  id: string;
  instructorId: string;
  isPrimary: boolean;
  role: string;
  permissionScopes: string[];
  status: string;
  assignedAt: string;
  fullName: string;
  email: string;
  identityNumber: string | null;
  academicTitle: string | null;
}

interface EnrollmentItem {
  id: string;
  studentId: string;
  status: string;
  joinCodeUsed: string | null;
  enrollmentSource: string;
  rejectionReason: string | null;
  enrolledAt: string;
  fullName: string;
  email: string;
  identityNumber: string | null;
}

interface SettingsHistoryResponse {
  items: Array<{
    id: string;
    action: string;
    resourceType: string;
    resourceTitle: string | null;
    actorRole: string;
    beforeValue: Record<string, unknown> | null;
    afterValue: Record<string, unknown> | null;
    changeSummary: string | null;
    createdAt: string;
    actorName: string | null;
  }>;
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

interface DeletionImpact {
  enrolledStudents: number;
  materials: number;
  assignments: number;
  submissions: number;
  publishedGrades: number;
  assessments: number;
  assessmentAttempts: number;
  hasAcademicHistory: boolean;
}

const PERMISSION_SCOPES = [
  { key: 'manage_modules', label: 'Kelola Modul' },
  { key: 'manage_materials', label: 'Kelola Materi' },
  { key: 'manage_assignments', label: 'Kelola Tugas' },
  { key: 'manage_assessments', label: 'Kelola Kuis & Ujian' },
  { key: 'grade_submissions', label: 'Nilai & Evaluasi' },
  { key: 'manage_students', label: 'Kelola Peserta' },
  { key: 'manage_settings', label: 'Ubah Pengaturan' },
];

const NAV_ITEMS: Array<{
  id: SettingsSectionId;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: 'identity', label: 'Informasi Kelas', description: 'Identitas, CPMK & sampul', icon: Info },
  { id: 'enrollment', label: 'Pendaftaran & Akses', description: 'Kebijakan, join code & antrean', icon: UserPlus },
  { id: 'instructors', label: 'Tim Pengajar', description: 'Dosen & Co-Instructor', icon: Users },
  { id: 'privacy', label: 'Keamanan & Privasi', description: 'Visibilitas & pembatasan', icon: Shield },
  { id: 'notifications', label: 'Notifikasi', description: 'Preferensi pemberitahuan', icon: Bell },
  { id: 'history', label: 'Riwayat Aktivitas', description: 'Log audit perubahan kelas', icon: History },
  { id: 'lifecycle', label: 'Status & Arsip', description: 'Arsip, pulihkan & hapus', icon: Archive },
];

const POLICY_OPTIONS: Array<{
  value: 'AUTO' | 'APPROVAL_REQUIRED' | 'INVITATION_ONLY' | 'INSTRUCTOR_MANAGED';
  title: string;
  desc: string;
}> = [
  {
    value: 'AUTO',
    title: 'Otomatis (Auto Enrollment)',
    desc: 'Mahasiswa langsung aktif saat bergabung menggunakan Join Code yang valid.',
  },
  {
    value: 'APPROVAL_REQUIRED',
    title: 'Butuh Persetujuan (Approval Required)',
    desc: 'Mahasiswa masuk antrean persetujuan dan harus disetujui dosen terlebih dahulu.',
  },
  {
    value: 'INVITATION_ONLY',
    title: 'Hanya Undangan (Invitation Only)',
    desc: 'Pendaftaran mandiri ditutup; hanya mahasiswa yang diundang pengajar yang dapat masuk.',
  },
  {
    value: 'INSTRUCTOR_MANAGED',
    title: 'Dikelola Pengajar (Instructor Managed)',
    desc: 'Hanya dosen atau admin yang dapat mendaftarkan dan mengeluarkan peserta secara langsung.',
  },
];

const NOTIFICATION_EVENTS = [
  { key: 'onStudentEnroll', label: 'Mahasiswa baru bergabung ke kelas' },
  { key: 'onJoinRequest', label: 'Permintaan pendaftaran baru masuk' },
  { key: 'onAssignmentSubmit', label: 'Mahasiswa mengumpulkan tugas' },
  { key: 'onLateSubmission', label: 'Pengumpulan tugas terlambat' },
  { key: 'onMaterialComplete', label: 'Mahasiswa menyelesaikan materi pembelajaran' },
  { key: 'onAssessmentComplete', label: 'Mahasiswa menyelesaikan kuis atau ujian' },
  { key: 'onNewComment', label: 'Komentar baru pada forum atau materi' },
  { key: 'onNewAnnouncement', label: 'Pengumuman baru diterbitkan' },
];

function formatDate(iso?: string | null): string {
  if (!iso) return '-';
  try {
    return new Date(iso).toLocaleString('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '-';
  }
}

export function ClassroomSettingsCenter({ classroomId }: { classroomId: string }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [activeSection, setActiveSection] = useState<SettingsSectionId>('identity');

  const { data, isLoading, isError, refetch } = useQuery<SettingsPayload>({
    queryKey: ['classroom-settings', classroomId],
    queryFn: () => apiFetch<SettingsPayload>(`/api/v1/classrooms/${classroomId}/settings`),
  });

  if (isLoading) {
    return (
      <div className="mt-6 space-y-4">
        <Skeleton className="h-24 w-full rounded-xl" />
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <Skeleton className="lg:col-span-3 h-72 rounded-xl" />
          <Skeleton className="lg:col-span-9 h-96 rounded-xl" />
        </div>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <Card className="mt-6 p-8 text-center">
        <AlertTriangle className="h-8 w-8 text-amber-500 mx-auto mb-2" />
        <p className="text-sm font-semibold text-slate-800">
          Gagal memuat pengaturan ruang kelas.
        </p>
        <Button variant="outline" size="sm" className="mt-3" onClick={() => refetch()}>
          Coba Lagi
        </Button>
      </Card>
    );
  }

  const { classroom, dashboardStats, actorRole } = data;
  const isArchived = classroom.lifecycleStatus === 'archived';
  const isCreatorOrAdmin = actorRole.isCreator || actorRole.role === 'SUPERADMIN';

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['classroom-settings', classroomId] });
    queryClient.invalidateQueries({ queryKey: ['classroom', classroomId] });
    queryClient.invalidateQueries({ queryKey: ['classroom-workspace', classroomId] });
    queryClient.invalidateQueries({ queryKey: ['classroom-settings-history', classroomId] });
  };

  return (
    <div className="mt-6 space-y-6">
      {/* Compact Settings Overview Dashboard */}
      <Card className="p-4 bg-white border-slate-200">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-slate-900">
                Pusat Pengaturan Ruang Kelas
              </h2>
              <span
                className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                  isArchived
                    ? 'bg-amber-100 text-amber-800'
                    : 'bg-emerald-100 text-emerald-800'
                }`}
              >
                {isArchived ? 'Diarsipkan' : 'Aktif'}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Kelola identitas, kebijakan pendaftaran, tim pengajar, privasi, notifikasi, dan siklus hidup kelas.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {dashboardStats.activeJoinCode && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  navigator.clipboard.writeText(dashboardStats.activeJoinCode || '');
                  toast.success(`Kode bergabung ${dashboardStats.activeJoinCode} disalin.`);
                }}
              >
                <Copy className="h-3.5 w-3.5 mr-1.5" />
                Salin Kode: {dashboardStats.activeJoinCode}
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setActiveSection('enrollment')}
            >
              <KeyRound className="h-3.5 w-3.5 mr-1.5" />
              Kelola Akses
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 pt-3">
          <StatBox label="Total Peserta" value={dashboardStats.totalEnrolledStudents} />
          <StatBox label="Sisa Kapasitas" value={dashboardStats.availableCapacity} />
          <StatBox
            label="Antrean Pending"
            value={dashboardStats.pendingRequests}
            highlight={dashboardStats.pendingRequests > 0 ? 'amber' : undefined}
          />
          <StatBox label="Tim Pengajar" value={dashboardStats.instructorCount} />
          <StatBox
            label="Join Code"
            value={dashboardStats.joinCodeActive ? 'Aktif' : 'Nonaktif'}
            highlight={dashboardStats.joinCodeActive ? 'emerald' : 'slate'}
          />
          <StatBox
            label="Status Kelas"
            value={isArchived ? 'Arsip' : 'Aktif'}
            highlight={isArchived ? 'amber' : 'emerald'}
          />
        </div>
      </Card>

      {/* 7-Section Navigation + Content Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Desktop Left Navigation / Mobile Scrollable Tabs */}
        <aside className="lg:col-span-3">
          <Card className="p-2">
            <nav
              aria-label="Navigasi Pengaturan Kelas"
              className="flex lg:flex-col gap-1 overflow-x-auto lg:overflow-visible pb-1 lg:pb-0"
            >
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const active = activeSection === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setActiveSection(item.id)}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors shrink-0 lg:shrink ${
                      active
                        ? 'bg-emerald-50 text-emerald-900 border border-emerald-200'
                        : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 border border-transparent'
                    }`}
                  >
                    <Icon
                      className={`h-4 w-4 shrink-0 ${
                        active ? 'text-emerald-700' : 'text-slate-400'
                      }`}
                    />
                    <div className="min-w-0">
                      <div className="text-xs font-semibold truncate">{item.label}</div>
                      <div className="hidden lg:block text-[11px] text-slate-400 truncate">
                        {item.description}
                      </div>
                    </div>
                  </button>
                );
              })}
            </nav>
          </Card>
        </aside>

        {/* Right Content Panel */}
        <main className="lg:col-span-9 space-y-6">
          {activeSection === 'identity' && (
            <IdentitySection
              classroomId={classroomId}
              data={data}
              onSaved={invalidateAll}
            />
          )}
          {activeSection === 'enrollment' && (
            <EnrollmentSection
              classroomId={classroomId}
              data={data}
              onSaved={invalidateAll}
            />
          )}
          {activeSection === 'instructors' && (
            <InstructorsSection
              classroomId={classroomId}
              data={data}
              isCreatorOrAdmin={isCreatorOrAdmin}
              onSaved={invalidateAll}
            />
          )}
          {activeSection === 'privacy' && (
            <PrivacySection
              classroomId={classroomId}
              data={data}
              onSaved={invalidateAll}
            />
          )}
          {activeSection === 'notifications' && (
            <NotificationsSection
              classroomId={classroomId}
              data={data}
              onSaved={invalidateAll}
            />
          )}
          {activeSection === 'history' && (
            <ActivityHistorySection classroomId={classroomId} />
          )}
          {activeSection === 'lifecycle' && (
            <LifecycleSection
              classroomId={classroomId}
              data={data}
              isCreatorOrAdmin={isCreatorOrAdmin}
              onSaved={invalidateAll}
              onDeleted={() => navigate('/classrooms')}
            />
          )}
        </main>
      </div>
    </div>
  );
}

function StatBox({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string | number;
  highlight?: 'emerald' | 'amber' | 'slate';
}) {
  const colorClass =
    highlight === 'emerald'
      ? 'text-emerald-700'
      : highlight === 'amber'
      ? 'text-amber-700'
      : 'text-slate-900';
  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50/70 px-3 py-2">
      <div className="text-[11px] font-medium text-slate-500">{label}</div>
      <div className={`text-base font-bold mt-0.5 ${colorClass}`}>{value}</div>
    </div>
  );
}

/* ============================================================================
 * SECTION 1: INFORMASI KELAS
 * ============================================================================ */
function IdentitySection({
  classroomId,
  data,
  onSaved,
}: {
  classroomId: string;
  data: SettingsPayload;
  onSaved: () => void;
}) {
  const { classroom } = data;
  const [name, setName] = useState(classroom.name);
  const [classroomCode, setClassroomCode] = useState(classroom.classroomCode || '');
  const [subjectName, setSubjectName] = useState(classroom.subjectName || '');
  const [section, setSection] = useState(classroom.section);
  const [description, setDescription] = useState(classroom.description || '');
  const [cpmk, setCpmk] = useState(classroom.cpmk || '');
  const [showPreview, setShowPreview] = useState(false);

  const initialCover: CoverMetadata | null = classroom.coverImagePath
    ? {
        coverImagePath: classroom.coverImagePath,
        coverThumbnailPath: classroom.coverThumbnailPath || classroom.coverImagePath,
        coverMimeType: classroom.coverMimeType || 'image/webp',
        coverFileSize: classroom.coverFileSize || 0,
        coverWidth: classroom.coverWidth || 1200,
        coverHeight: classroom.coverHeight || 400,
        coverUrl: `/api/v1/classrooms/${classroom.id}/cover-image`,
        thumbnailUrl: `/api/v1/classrooms/${classroom.id}/cover-image?variant=thumb`,
      }
    : null;

  const [cover, setCover] = useState<CoverMetadata | null>(initialCover);

  const saveMutation = useMutation({
    mutationFn: async () => {
      return apiFetch(`/api/v1/classrooms/${classroomId}/settings`, {
        method: 'PATCH',
        body: JSON.stringify({
          section: 'identity',
          payload: {
            name: name.trim(),
            classroomCode: classroomCode.trim() || null,
            subjectName: subjectName.trim() || null,
            section: section.trim(),
            description,
            cpmk: cpmk.trim() || null,
            coverImagePath: cover ? cover.coverImagePath : null,
            coverThumbnailPath: cover ? cover.coverThumbnailPath : null,
            coverMimeType: cover ? cover.coverMimeType : null,
            coverFileSize: cover ? cover.coverFileSize : null,
            coverWidth: cover ? cover.coverWidth : null,
            coverHeight: cover ? cover.coverHeight : null,
          },
        }),
      });
    },
    onSuccess: () => {
      toast.success('Informasi kelas berhasil diperbarui.');
      onSaved();
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Gagal menyimpan informasi kelas.');
    },
  });

  return (
    <div className="space-y-6">
      <Card className="p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b border-slate-100">
          <div>
            <h3 className="text-base font-bold text-slate-900">Informasi & Identitas Kelas</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Perbarui identitas akademik, deskripsi pembelajaran, CPMK, dan gambar sampul ruang kelas.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setShowPreview((v) => !v)}
          >
            <Eye className="h-3.5 w-3.5 mr-1.5" />
            {showPreview ? 'Tutup Pratinjau' : 'Pratinjau Tampilan'}
          </Button>
        </div>

        {showPreview && (
          <div className="rounded-xl border border-slate-200 overflow-hidden bg-slate-900 text-white">
            <div className="relative h-36 bg-gradient-to-r from-emerald-800 to-teal-700 flex items-end p-5">
              {cover?.coverUrl && (
                <img
                  src={cover.coverUrl}
                  alt="Pratinjau sampul kelas"
                  className="absolute inset-0 w-full h-full object-cover opacity-50"
                />
              )}
              <div className="relative z-10">
                <span className="inline-block px-2 py-0.5 rounded bg-white/20 text-[11px] font-semibold mb-1">
                  {classroomCode || classroom.subjectCode || 'KODE-KELAS'} • Seksi {section}
                </span>
                <h4 className="text-lg font-bold">{name || 'Nama Ruang Kelas'}</h4>
                <p className="text-xs text-emerald-100">{subjectName || 'Nama Mata Kuliah'}</p>
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Nama Ruang Kelas <span className="text-rose-500">*</span>
            </label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Contoh: Pemrograman Web Lanjut — TIF 3A"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Kode Kelas
            </label>
            <Input
              value={classroomCode}
              onChange={(e) => setClassroomCode(e.target.value)}
              placeholder="Contoh: TIF301-A"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Nama Mata Kuliah
            </label>
            <Input
              value={subjectName}
              onChange={(e) => setSubjectName(e.target.value)}
              placeholder="Contoh: Pemrograman Web Lanjut"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Seksi / Kelompok <span className="text-rose-500">*</span>
            </label>
            <Input
              value={section}
              onChange={(e) => setSection(e.target.value)}
              placeholder="Contoh: A / Reguler 1"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1.5">
            Deskripsi Kelas
          </label>
          <LightweightTiptapEditor
            value={description}
            onChange={setDescription}
            minHeight="140px"
            placeholder="Tuliskan deskripsi ringkas kelas, tujuan perkuliahan, dan tata tertib digital..."
          />
          <p className="text-[11px] text-slate-400 mt-1">
            Editor difokuskan untuk teks terstruktur (tanpa unggahan gambar atau tabel).
          </p>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">
            CPMK / Silabus Ringkas
          </label>
          <Textarea
            rows={4}
            value={cpmk}
            onChange={(e) => setCpmk(e.target.value)}
            placeholder="Capaian Pembelajaran Mata Kuliah (CPMK) atau ringkasan topik mingguan..."
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1.5">
            Gambar Sampul Kelas
          </label>
          <ClassroomCoverUploader value={cover} onChange={setCover} />
        </div>

        <div className="flex justify-end pt-3 border-t border-slate-100">
          <Button
            type="button"
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending || !name.trim() || !section.trim()}
          >
            <Save className="h-4 w-4 mr-1.5" />
            {saveMutation.isPending ? 'Menyimpan...' : 'Simpan Informasi Kelas'}
          </Button>
        </div>
      </Card>

      {/* Classroom Metadata (Read-Only) */}
      <Card className="p-5 bg-slate-50/70">
        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">
          Metadata Ruang Kelas
        </h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 text-xs">
          <div className="flex items-start gap-2">
            <UserIcon className="h-4 w-4 text-slate-400 mt-0.5 shrink-0" />
            <div>
              <div className="text-slate-500">Pembuat Kelas</div>
              <div className="font-semibold text-slate-900">
                {classroom.creator?.fullName || 'Administrator'}
              </div>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <Calendar className="h-4 w-4 text-slate-400 mt-0.5 shrink-0" />
            <div>
              <div className="text-slate-500">Tanggal Dibuat</div>
              <div className="font-semibold text-slate-900">{formatDate(classroom.createdAt)}</div>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <Calendar className="h-4 w-4 text-slate-400 mt-0.5 shrink-0" />
            <div>
              <div className="text-slate-500">Terakhir Diperbarui</div>
              <div className="font-semibold text-slate-900">{formatDate(classroom.updatedAt)}</div>
            </div>
          </div>
          <div>
            <div className="text-slate-500">Periode Akademik</div>
            <div className="font-semibold text-slate-900">
              {classroom.academicPeriod?.name ||
                `${classroom.academicYear} • ${classroom.semesterName}`}
            </div>
          </div>
          <div>
            <div className="text-slate-500">Status Kelas</div>
            <div className="font-semibold text-slate-900">
              {classroom.lifecycleStatus === 'archived' ? 'Diarsipkan' : 'Aktif'}
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}

/* ============================================================================
 * SECTION 2: PENDAFTARAN & AKSES
 * ============================================================================ */
function EnrollmentSection({
  classroomId,
  data,
  onSaved,
}: {
  classroomId: string;
  data: SettingsPayload;
  onSaved: () => void;
}) {
  const { classroom, enrollmentPolicy, joinCodes, enrollments } = data;
  const [policyMode, setPolicyMode] = useState(classroom.enrollmentPolicy);
  const [capacity, setCapacity] = useState<number>(classroom.capacity || 40);
  const [allowLate, setAllowLate] = useState<boolean>(
    enrollmentPolicy?.allowLateEnrollment ?? true
  );
  const [waitingList, setWaitingList] = useState<boolean>(
    enrollmentPolicy?.waitingListEnabled ?? false
  );

  // Join code controls
  const [maxUses, setMaxUses] = useState<string>('');
  const [expiresAt, setExpiresAt] = useState<string>('');
  const [reqSearch, setReqSearch] = useState('');
  const [reqStatusFilter, setReqStatusFilter] = useState<string>('ALL');

  const revokeConfirm = useDeleteConfirmation<{ code: string }>();

  const savePolicyMutation = useMutation({
    mutationFn: () =>
      apiFetch(`/api/v1/classrooms/${classroomId}/settings`, {
        method: 'PATCH',
        body: JSON.stringify({
          section: 'enrollment',
          payload: {
            enrollmentPolicy: policyMode,
            capacity: Number(capacity),
            allowLateEnrollment: allowLate,
            waitingListEnabled: waitingList,
          },
        }),
      }),
    onSuccess: () => {
      toast.success('Kebijakan pendaftaran berhasil disimpan.');
      onSaved();
    },
    onError: (err: Error) => toast.error(err.message || 'Gagal menyimpan kebijakan.'),
  });

  const regenerateMutation = useMutation({
    mutationFn: () =>
      apiFetch(`/api/v1/classrooms/${classroomId}/join-codes/regenerate`, {
        method: 'POST',
        body: JSON.stringify({
          maxUses: maxUses ? Number(maxUses) : null,
          expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
        }),
      }),
    onSuccess: () => {
      toast.success('Join Code baru berhasil dibuat.');
      setMaxUses('');
      setExpiresAt('');
      onSaved();
    },
    onError: (err: Error) => toast.error(err.message || 'Gagal membuat Join Code.'),
  });

  const revokeMutation = useMutation({
    mutationFn: () =>
      apiFetch(`/api/v1/classrooms/${classroomId}/join-codes/revoke`, {
        method: 'POST',
        body: JSON.stringify({}),
      }),
    onSuccess: () => {
      toast.success('Join Code aktif telah dicabut.');
      onSaved();
    },
    onError: (err: Error) => toast.error(err.message || 'Gagal mencabut Join Code.'),
  });

  const toggleCodeMutation = useMutation({
    mutationFn: ({ codeId, isActive }: { codeId: string; isActive: boolean }) =>
      apiFetch(`/api/v1/classrooms/${classroomId}/join-codes/${codeId}`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive }),
      }),
    onSuccess: () => {
      toast.success('Status Join Code diperbarui.');
      onSaved();
    },
    onError: (err: Error) => toast.error(err.message || 'Gagal memperbarui Join Code.'),
  });

  const approveMutation = useMutation({
    mutationFn: (requestId: string) =>
      apiFetch(`/api/v1/classrooms/${classroomId}/enrollment-requests/${requestId}/approve`, {
        method: 'POST',
        body: JSON.stringify({}),
      }),
    onSuccess: () => {
      toast.success('Pendaftaran mahasiswa disetujui.');
      onSaved();
    },
    onError: (err: Error) => toast.error(err.message || 'Gagal menyetujui pendaftaran.'),
  });

  const rejectMutation = useMutation({
    mutationFn: (requestId: string) =>
      apiFetch(`/api/v1/classrooms/${classroomId}/enrollment-requests/${requestId}/reject`, {
        method: 'POST',
        body: JSON.stringify({ reason: 'Ditolak oleh pengajar melalui pengaturan kelas.' }),
      }),
    onSuccess: () => {
      toast.success('Permintaan pendaftaran ditolak.');
      onSaved();
    },
    onError: (err: Error) => toast.error(err.message || 'Gagal menolak permintaan.'),
  });

  const filteredEnrollments = enrollments.filter((e) => {
    const matchesStatus = reqStatusFilter === 'ALL' || e.status === reqStatusFilter;
    const q = reqSearch.trim().toLowerCase();
    const matchesSearch =
      !q ||
      e.fullName.toLowerCase().includes(q) ||
      e.email.toLowerCase().includes(q) ||
      (e.identityNumber || '').toLowerCase().includes(q);
    return matchesStatus && matchesSearch;
  });

  return (
    <div className="space-y-6">
      {/* A. Kebijakan Pendaftaran & Kapasitas */}
      <Card className="p-6 space-y-5">
        <div className="pb-3 border-b border-slate-100">
          <h3 className="text-base font-bold text-slate-900">Kebijakan Pendaftaran & Kapasitas</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Tentukan cara mahasiswa bergabung ke ruang kelas ini serta batas maksimal peserta.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {POLICY_OPTIONS.map((opt) => {
            const selected = policyMode === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setPolicyMode(opt.value)}
                className={`p-3.5 rounded-xl border text-left transition-all ${
                  selected
                    ? 'border-emerald-500 bg-emerald-50/70 ring-1 ring-emerald-500'
                    : 'border-slate-200 hover:border-slate-300 bg-white'
                }`}
              >
                <div className="text-xs font-bold text-slate-900">{opt.title}</div>
                <div className="text-[11px] text-slate-500 mt-1 leading-relaxed">{opt.desc}</div>
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Kapasitas Maksimal Peserta
            </label>
            <Input
              type="number"
              min={1}
              max={1000}
              value={capacity}
              onChange={(e) => setCapacity(Number(e.target.value) || 1)}
            />
          </div>
          <label className="flex items-center gap-2.5 p-3 rounded-lg border border-slate-200 cursor-pointer">
            <input
              type="checkbox"
              checked={allowLate}
              onChange={(e) => setAllowLate(e.target.checked)}
              className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
            />
            <div>
              <div className="text-xs font-semibold text-slate-800">Izinkan Pendaftaran Susulan</div>
              <div className="text-[11px] text-slate-500">Setelah masa perkuliahan dimulai</div>
            </div>
          </label>
          <label className="flex items-center gap-2.5 p-3 rounded-lg border border-slate-200 cursor-pointer">
            <input
              type="checkbox"
              checked={waitingList}
              onChange={(e) => setWaitingList(e.target.checked)}
              className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
            />
            <div>
              <div className="text-xs font-semibold text-slate-800">Aktifkan Daftar Tunggu</div>
              <div className="text-[11px] text-slate-500">Saat kuota kelas penuh</div>
            </div>
          </label>
        </div>

        <div className="flex justify-end pt-3 border-t border-slate-100">
          <Button
            type="button"
            onClick={() => savePolicyMutation.mutate()}
            disabled={savePolicyMutation.isPending}
          >
            <Save className="h-4 w-4 mr-1.5" />
            {savePolicyMutation.isPending ? 'Menyimpan...' : 'Simpan Kebijakan'}
          </Button>
        </div>
      </Card>

      {/* B. Tata Kelola Join Code */}
      <Card className="p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100">
          <div>
            <h3 className="text-base font-bold text-slate-900">Tata Kelola Join Code</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Buat, salin, nonaktifkan sementara, atau cabut kode bergabung kelas.
            </p>
          </div>
          {joinCodes.active && (
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={() =>
                revokeConfirm.requestConfirmation({
                  item: { code: joinCodes.active!.code },
                  title: 'Cabut Join Code Aktif?',
                  description:
                    'Mahasiswa tidak akan dapat bergabung menggunakan kode ini lagi setelah dicabut.',
                  itemName: joinCodes.active!.code,
                  warningText:
                    'Kode yang sudah dicabut tidak dapat diaktifkan kembali. Anda harus membuat kode baru.',
                  actionLabel: 'Ya, Cabut Kode',
                  variant: 'destructive',
                  onConfirm: async () => {
                    await revokeMutation.mutateAsync();
                  },
                })
              }
            >
              <Ban className="h-3.5 w-3.5 mr-1.5" />
              Cabut Kode Aktif
            </Button>
          )}
        </div>

        <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Join Code Aktif Saat Ini
            </div>
            {joinCodes.active ? (
              <div className="flex items-center gap-3 mt-1">
                <span className="text-2xl font-mono font-bold tracking-widest text-emerald-700">
                  {joinCodes.active.code}
                </span>
                <span className="text-xs text-slate-500">
                  Digunakan {joinCodes.active.usesCount}
                  {joinCodes.active.maxUses ? ` / ${joinCodes.active.maxUses}` : ''} kali
                </span>
              </div>
            ) : (
              <div className="text-sm font-medium text-slate-500 mt-1">
                Belum ada Join Code aktif. Buat kode baru di bawah ini.
              </div>
            )}
          </div>
          {joinCodes.active && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                navigator.clipboard.writeText(joinCodes.active!.code);
                toast.success('Join Code berhasil disalin.');
              }}
            >
              <Copy className="h-3.5 w-3.5 mr-1.5" />
              Salin Kode
            </Button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Batas Pemakaian (Opsional)
            </label>
            <Input
              type="number"
              min={1}
              placeholder="Tak terbatas"
              value={maxUses}
              onChange={(e) => setMaxUses(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Kedaluwarsa Pada (Opsional)
            </label>
            <Input
              type="datetime-local"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
            />
          </div>
          <Button
            type="button"
            onClick={() => regenerateMutation.mutate()}
            disabled={regenerateMutation.isPending}
          >
            <RefreshCw className="h-4 w-4 mr-1.5" />
            {regenerateMutation.isPending ? 'Memproses...' : 'Buat / Regenerasi Kode'}
          </Button>
        </div>

        {joinCodes.history.length > 0 && (
          <div className="pt-2">
            <h4 className="text-xs font-bold text-slate-700 mb-2">Riwayat Join Code</h4>
            <div className="overflow-x-auto border border-slate-200 rounded-lg">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                  <tr>
                    <th className="px-3 py-2 font-semibold">Kode</th>
                    <th className="px-3 py-2 font-semibold">Status</th>
                    <th className="px-3 py-2 font-semibold">Pemakaian</th>
                    <th className="px-3 py-2 font-semibold">Kedaluwarsa</th>
                    <th className="px-3 py-2 font-semibold text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {joinCodes.history.map((jc) => (
                    <tr key={jc.id}>
                      <td className="px-3 py-2 font-mono font-semibold text-slate-900">{jc.code}</td>
                      <td className="px-3 py-2">
                        {jc.revokedAt ? (
                          <span className="px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 text-[11px] font-semibold">
                            Dicabut
                          </span>
                        ) : jc.isActive ? (
                          <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-[11px] font-semibold">
                            Aktif
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[11px] font-semibold">
                            Nonaktif
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-slate-600">
                        {jc.usesCount}
                        {jc.maxUses ? ` / ${jc.maxUses}` : ''}
                      </td>
                      <td className="px-3 py-2 text-slate-500">{formatDate(jc.expiresAt)}</td>
                      <td className="px-3 py-2 text-right">
                        {!jc.revokedAt && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              toggleCodeMutation.mutate({ codeId: jc.id, isActive: !jc.isActive })
                            }
                          >
                            {jc.isActive ? 'Nonaktifkan' : 'Aktifkan'}
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Card>

      {/* C. Antrean Persetujuan & Daftar Pendaftaran */}
      <Card className="p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div>
            <h3 className="text-base font-bold text-slate-900">
              Permintaan Pendaftaran & Status Peserta
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Setujui atau tolak mahasiswa yang mengajukan pendaftaran ke kelas ini.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <div className="relative">
              <Search className="h-3.5 w-3.5 text-slate-400 absolute left-2.5 top-2.5" />
              <Input
                value={reqSearch}
                onChange={(e) => setReqSearch(e.target.value)}
                placeholder="Cari nama atau NIM..."
                className="pl-8 h-8 text-xs w-48"
              />
            </div>
            <select
              value={reqStatusFilter}
              onChange={(e) => setReqStatusFilter(e.target.value)}
              className="h-8 rounded-lg border border-slate-300 bg-white px-2.5 text-xs text-slate-700"
            >
              <option value="ALL">Semua Status</option>
              <option value="pending_approval">Menunggu Persetujuan</option>
              <option value="active">Aktif</option>
              <option value="rejected">Ditolak</option>
            </select>
          </div>
        </div>

        {filteredEnrollments.length === 0 ? (
          <div className="py-8 text-center text-xs text-slate-500">
            Tidak ada data pendaftaran yang sesuai filter.
          </div>
        ) : (
          <div className="overflow-x-auto border border-slate-200 rounded-lg">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                <tr>
                  <th className="px-3 py-2 font-semibold">Mahasiswa</th>
                  <th className="px-3 py-2 font-semibold">NIM</th>
                  <th className="px-3 py-2 font-semibold">Sumber</th>
                  <th className="px-3 py-2 font-semibold">Status</th>
                  <th className="px-3 py-2 font-semibold text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredEnrollments.map((enr) => (
                  <tr key={enr.id}>
                    <td className="px-3 py-2.5">
                      <div className="font-semibold text-slate-900">{enr.fullName}</div>
                      <div className="text-[11px] text-slate-500">{enr.email}</div>
                    </td>
                    <td className="px-3 py-2.5 text-slate-600">{enr.identityNumber || '-'}</td>
                    <td className="px-3 py-2.5 text-slate-500">{enr.enrollmentSource}</td>
                    <td className="px-3 py-2.5">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                          enr.status === 'active'
                            ? 'bg-emerald-100 text-emerald-700'
                            : enr.status === 'pending_approval'
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-rose-100 text-rose-700'
                        }`}
                      >
                        {enr.status === 'pending_approval'
                          ? 'Menunggu'
                          : enr.status === 'active'
                          ? 'Aktif'
                          : enr.status}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right space-x-1.5">
                      {enr.status === 'pending_approval' && (
                        <>
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => approveMutation.mutate(enr.id)}
                            disabled={approveMutation.isPending}
                          >
                            <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                            Setujui
                          </Button>
                          <Button
                            type="button"
                            variant="destructive"
                            size="sm"
                            onClick={() => rejectMutation.mutate(enr.id)}
                            disabled={rejectMutation.isPending}
                          >
                            <XCircle className="h-3.5 w-3.5 mr-1" />
                            Tolak
                          </Button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <ConfirmDialog {...revokeConfirm.dialogProps} />
    </div>
  );
}

/* ============================================================================
 * SECTION 3: TIM PENGAJAR
 * ============================================================================ */
function InstructorsSection({
  classroomId,
  data,
  isCreatorOrAdmin,
  onSaved,
}: {
  classroomId: string;
  data: SettingsPayload;
  isCreatorOrAdmin: boolean;
  onSaved: () => void;
}) {
  const [email, setEmail] = useState('');
  const [selectedScopes, setSelectedScopes] = useState<string[]>([
    'manage_modules',
    'manage_materials',
  ]);
  const removeConfirm = useDeleteConfirmation<InstructorItem>();

  const addMutation = useMutation({
    mutationFn: () =>
      apiFetch(`/api/v1/classrooms/${classroomId}/instructors`, {
        method: 'POST',
        body: JSON.stringify({
          email: email.trim(),
          permissionScopes: selectedScopes,
        }),
      }),
    onSuccess: () => {
      toast.success('Co-Instructor berhasil ditambahkan.');
      setEmail('');
      onSaved();
    },
    onError: (err: Error) => toast.error(err.message || 'Gagal menambahkan pengajar.'),
  });

  const updatePermsMutation = useMutation({
    mutationFn: ({ instructorId, scopes }: { instructorId: string; scopes: string[] }) =>
      apiFetch(`/api/v1/classrooms/${classroomId}/instructors/${instructorId}`, {
        method: 'PATCH',
        body: JSON.stringify({ permissionScopes: scopes }),
      }),
    onSuccess: () => {
      toast.success('Izin Co-Instructor diperbarui.');
      onSaved();
    },
    onError: (err: Error) => toast.error(err.message || 'Gagal memperbarui izin.'),
  });

  const removeMutation = useMutation({
    mutationFn: (instructorId: string) =>
      apiFetch(`/api/v1/classrooms/${classroomId}/instructors/${instructorId}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      toast.success('Co-Instructor berhasil dihapus dari kelas.');
      onSaved();
    },
    onError: (err: Error) => toast.error(err.message || 'Gagal menghapus Co-Instructor.'),
  });

  return (
    <div className="space-y-6">
      {isCreatorOrAdmin && (
        <Card className="p-6 space-y-4">
          <div className="pb-3 border-b border-slate-100">
            <h3 className="text-base font-bold text-slate-900">Tambah Co-Instructor</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Undang dosen pendamping menggunakan alamat email terdaftar dan tentukan hak aksesnya.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="dosen.pendamping@poltek-kampar.ac.id"
              className="flex-1"
            />
            <Button
              type="button"
              onClick={() => addMutation.mutate()}
              disabled={addMutation.isPending || !email.trim()}
            >
              <UserPlus className="h-4 w-4 mr-1.5" />
              {addMutation.isPending ? 'Menambahkan...' : 'Tambah Co-Instructor'}
            </Button>
          </div>

          <div className="flex flex-wrap gap-2 pt-1">
            {PERMISSION_SCOPES.map((scope) => {
              const checked = selectedScopes.includes(scope.key);
              return (
                <label
                  key={scope.key}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs cursor-pointer ${
                    checked
                      ? 'bg-emerald-50 border-emerald-300 text-emerald-900 font-medium'
                      : 'bg-white border-slate-200 text-slate-600'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() =>
                      setSelectedScopes((prev) =>
                        prev.includes(scope.key)
                          ? prev.filter((k) => k !== scope.key)
                          : [...prev, scope.key]
                      )
                    }
                    className="rounded border-slate-300 text-emerald-600"
                  />
                  {scope.label}
                </label>
              );
            })}
          </div>
        </Card>
      )}

      <Card className="p-6 space-y-4">
        <div className="pb-3 border-b border-slate-100">
          <h3 className="text-base font-bold text-slate-900">Daftar Tim Pengajar</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Pembuat kelas memiliki akses penuh permanen dan tidak dapat dihapus.
          </p>
        </div>

        <div className="space-y-3">
          {data.instructors.map((inst) => {
            const isCreator =
              inst.isPrimary || inst.instructorId === data.classroom.creator?.id || inst.role === 'CLASSROOM_CREATOR';
            const scopes = Array.isArray(inst.permissionScopes) ? inst.permissionScopes : [];

            return (
              <div
                key={inst.id}
                className="p-4 rounded-xl border border-slate-200 bg-white space-y-3"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-slate-900">{inst.fullName}</span>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                          isCreator
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-sky-100 text-sky-800'
                        }`}
                      >
                        {isCreator ? 'Pembuat Kelas' : 'Co-Instructor'}
                      </span>
                    </div>
                    <div className="text-xs text-slate-500">{inst.email}</div>
                  </div>
                  {!isCreator && isCreatorOrAdmin && (
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      onClick={() =>
                        removeConfirm.requestConfirmation({
                          item: inst,
                          title: 'Hapus Co-Instructor?',
                          description:
                            'Pengajar ini tidak lagi memiliki akses untuk mengelola ruang kelas ini.',
                          itemName: inst.fullName,
                          actionLabel: 'Hapus Pengajar',
                          variant: 'destructive',
                          onConfirm: async (target) => {
                            await removeMutation.mutateAsync(target.instructorId);
                          },
                        })
                      }
                    >
                      <Trash2 className="h-3.5 w-3.5 mr-1" />
                      Hapus
                    </Button>
                  )}
                </div>

                {!isCreator && (
                  <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-100">
                    {PERMISSION_SCOPES.map((scope) => {
                      const hasScope = scopes.includes(scope.key) || scopes.includes('all');
                      return (
                        <label
                          key={scope.key}
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-[11px] ${
                            isCreatorOrAdmin ? 'cursor-pointer' : 'opacity-70'
                          } ${
                            hasScope
                              ? 'bg-emerald-50 border-emerald-200 text-emerald-800 font-medium'
                              : 'bg-slate-50 border-slate-200 text-slate-500'
                          }`}
                        >
                          <input
                            type="checkbox"
                            disabled={!isCreatorOrAdmin || updatePermsMutation.isPending}
                            checked={hasScope}
                            onChange={() => {
                              const next = hasScope
                                ? scopes.filter((s) => s !== scope.key && s !== 'all')
                                : [...scopes, scope.key];
                              updatePermsMutation.mutate({
                                instructorId: inst.instructorId,
                                scopes: next,
                              });
                            }}
                            className="rounded border-slate-300 text-emerald-600"
                          />
                          {scope.label}
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      <ConfirmDialog {...removeConfirm.dialogProps} />
    </div>
  );
}

/* ============================================================================
 * SECTION 4: KEAMANAN & PRIVASI
 * ============================================================================ */
function PrivacySection({
  classroomId,
  data,
  onSaved,
}: {
  classroomId: string;
  data: SettingsPayload;
  onSaved: () => void;
}) {
  const pc = (data.classroom.privacyConfig || {}) as Record<string, unknown>;
  const [discoverability, setDiscoverability] = useState<string>(
    (pc.discoverability as string) || 'CAMPUS_DIRECTORY'
  );
  const [contentVisibility, setContentVisibility] = useState<string>(
    data.classroom.visibility || 'enrolled_only'
  );
  const [rosterVisibility, setRosterVisibility] = useState<string>(
    (pc.rosterVisibility as string) || 'ENROLLED_STUDENTS'
  );
  const [joinCodeRestriction, setJoinCodeRestriction] = useState<string>(
    (pc.joinCodeRestriction as string) || 'ANY_AUTHENTICATED_STUDENT'
  );
  const [hideGradesFromPeers, setHideGradesFromPeers] = useState<boolean>(
    pc.hideGradesFromPeers !== false
  );

  const saveMutation = useMutation({
    mutationFn: () =>
      apiFetch(`/api/v1/classrooms/${classroomId}/settings`, {
        method: 'PATCH',
        body: JSON.stringify({
          section: 'privacy',
          payload: {
            discoverability,
            contentVisibility,
            rosterVisibility,
            joinCodeRestriction,
            hideGradesFromPeers,
          },
        }),
      }),
    onSuccess: () => {
      toast.success('Pengaturan keamanan & privasi disimpan.');
      onSaved();
    },
    onError: (err: Error) => toast.error(err.message || 'Gagal menyimpan pengaturan privasi.'),
  });

  return (
    <Card className="p-6 space-y-5">
      <div className="pb-3 border-b border-slate-100">
        <h3 className="text-base font-bold text-slate-900">Keamanan & Privasi Ruang Kelas</h3>
        <p className="text-xs text-slate-500 mt-0.5">
          Atur keterlihatan kelas di direktori kampus, akses materi, dan daftar peserta.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">
            Visibilitas Direktori Kelas
          </label>
          <select
            value={discoverability}
            onChange={(e) => setDiscoverability(e.target.value)}
            className="w-full h-9 rounded-lg border border-slate-300 bg-white px-3 text-xs text-slate-800"
          >
            <option value="CAMPUS_DIRECTORY">Terlihat di Direktori Kampus</option>
            <option value="LINK_OR_CODE_ONLY">Hanya via Join Code / Tautan</option>
            <option value="HIDDEN">Tersembunyi (Privat)</option>
          </select>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">
            Visibilitas Konten & Materi
          </label>
          <select
            value={contentVisibility}
            onChange={(e) => setContentVisibility(e.target.value)}
            className="w-full h-9 rounded-lg border border-slate-300 bg-white px-3 text-xs text-slate-800"
          >
            <option value="enrolled_only">Hanya Peserta Terdaftar</option>
            <option value="public_campus">Civitas Kampus (Pratinjau)</option>
            <option value="private">Hanya Tim Pengajar</option>
          </select>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">
            Visibilitas Daftar Peserta (People)
          </label>
          <select
            value={rosterVisibility}
            onChange={(e) => setRosterVisibility(e.target.value)}
            className="w-full h-9 rounded-lg border border-slate-300 bg-white px-3 text-xs text-slate-800"
          >
            <option value="ENROLLED_STUDENTS">Sesama Peserta & Pengajar</option>
            <option value="INSTRUCTORS_ONLY">Hanya Tim Pengajar</option>
          </select>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">
            Pembatasan Join Code
          </label>
          <select
            value={joinCodeRestriction}
            onChange={(e) => setJoinCodeRestriction(e.target.value)}
            className="w-full h-9 rounded-lg border border-slate-300 bg-white px-3 text-xs text-slate-800"
          >
            <option value="ANY_AUTHENTICATED_STUDENT">Semua Mahasiswa Terautentikasi</option>
            <option value="DOMAIN_RESTRICTED">Hanya Email Mahasiswa Kampus</option>
          </select>
        </div>
      </div>

      <label className="flex items-center gap-3 p-3.5 rounded-xl border border-slate-200 bg-slate-50/70 cursor-pointer">
        <input
          type="checkbox"
          checked={hideGradesFromPeers}
          onChange={(e) => setHideGradesFromPeers(e.target.checked)}
          className="rounded border-slate-300 text-emerald-600"
        />
        <div>
          <div className="text-xs font-semibold text-slate-900">
            Jaga Kerahasiaan Nilai Individu (FERPA / Privasi Akademik)
          </div>
          <div className="text-[11px] text-slate-500">
            Mahasiswa hanya dapat melihat nilai dan progres belajarnya sendiri.
          </div>
        </div>
      </label>

      <div className="flex justify-end pt-3 border-t border-slate-100">
        <Button
          type="button"
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending}
        >
          <Save className="h-4 w-4 mr-1.5" />
          {saveMutation.isPending ? 'Menyimpan...' : 'Simpan Pengaturan Privasi'}
        </Button>
      </div>
    </Card>
  );
}

/* ============================================================================
 * SECTION 5: NOTIFIKASI
 * ============================================================================ */
function NotificationsSection({
  classroomId,
  data,
  onSaved,
}: {
  classroomId: string;
  data: SettingsPayload;
  onSaved: () => void;
}) {
  const nc = (data.classroom.notificationConfig || {}) as Record<string, boolean>;
  const [prefs, setPrefs] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {
      channelInApp: nc.channelInApp !== false,
      channelEmail: Boolean(nc.channelEmail),
    };
    for (const ev of NOTIFICATION_EVENTS) {
      initial[ev.key] = nc[ev.key] !== false;
    }
    return initial;
  });

  const saveMutation = useMutation({
    mutationFn: () =>
      apiFetch(`/api/v1/classrooms/${classroomId}/settings`, {
        method: 'PATCH',
        body: JSON.stringify({
          section: 'notifications',
          payload: prefs,
        }),
      }),
    onSuccess: () => {
      toast.success('Preferensi notifikasi berhasil disimpan.');
      onSaved();
    },
    onError: (err: Error) => toast.error(err.message || 'Gagal menyimpan notifikasi.'),
  });

  return (
    <Card className="p-6 space-y-5">
      <div className="pb-3 border-b border-slate-100">
        <h3 className="text-base font-bold text-slate-900">Preferensi Notifikasi Kelas</h3>
        <p className="text-xs text-slate-500 mt-0.5">
          Pilih aktivitas akademik yang memicu pemberitahuan untuk ruang kelas ini.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pb-2">
        <label className="flex items-center justify-between p-3.5 rounded-xl border border-slate-200 cursor-pointer">
          <div>
            <div className="text-xs font-bold text-slate-900">Notifikasi Dalam Aplikasi</div>
            <div className="text-[11px] text-slate-500">Tampilkan di lonceng notifikasi LMS</div>
          </div>
          <input
            type="checkbox"
            checked={prefs.channelInApp}
            onChange={(e) => setPrefs((p) => ({ ...p, channelInApp: e.target.checked }))}
            className="rounded border-slate-300 text-emerald-600 h-4 w-4"
          />
        </label>
        <label className="flex items-center justify-between p-3.5 rounded-xl border border-slate-200 cursor-pointer">
          <div>
            <div className="text-xs font-bold text-slate-900">Notifikasi Email</div>
            <div className="text-[11px] text-slate-500">Kirim ringkasan aktivitas ke email</div>
          </div>
          <input
            type="checkbox"
            checked={prefs.channelEmail}
            onChange={(e) => setPrefs((p) => ({ ...p, channelEmail: e.target.checked }))}
            className="rounded border-slate-300 text-emerald-600 h-4 w-4"
          />
        </label>
      </div>

      <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
        {NOTIFICATION_EVENTS.map((ev) => (
          <label
            key={ev.key}
            className="flex items-center justify-between px-4 py-3 bg-white hover:bg-slate-50 cursor-pointer"
          >
            <span className="text-xs font-medium text-slate-800">{ev.label}</span>
            <input
              type="checkbox"
              checked={Boolean(prefs[ev.key])}
              onChange={(e) => setPrefs((p) => ({ ...p, [ev.key]: e.target.checked }))}
              className="rounded border-slate-300 text-emerald-600 h-4 w-4"
            />
          </label>
        ))}
      </div>

      <div className="flex justify-end pt-3 border-t border-slate-100">
        <Button
          type="button"
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending}
        >
          <Save className="h-4 w-4 mr-1.5" />
          {saveMutation.isPending ? 'Menyimpan...' : 'Simpan Preferensi Notifikasi'}
        </Button>
      </div>
    </Card>
  );
}

/* ============================================================================
 * SECTION 6: RIWAYAT AKTIVITAS
 * ============================================================================ */
function ActivityHistorySection({ classroomId }: { classroomId: string }) {
  const [page, setPage] = useState(1);
  const [actionFilter, setActionFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data, isLoading } = useQuery<SettingsHistoryResponse>({
    queryKey: ['classroom-settings-history', classroomId, page, actionFilter, search],
    queryFn: () => {
      const params = new URLSearchParams({
        page: String(page),
        limit: '15',
        action: actionFilter,
      });
      if (search.trim()) params.set('search', search.trim());
      return apiFetch<SettingsHistoryResponse>(
        `/api/v1/classrooms/${classroomId}/settings-history?${params.toString()}`
      );
    },
  });

  return (
    <Card className="p-6 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
        <div>
          <h3 className="text-base font-bold text-slate-900">Riwayat Aktivitas & Audit Pengaturan</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Catatan kronologis setiap perubahan pengaturan ruang kelas yang tidak dapat dihapus.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="relative">
            <Search className="h-3.5 w-3.5 text-slate-400 absolute left-2.5 top-2.5" />
            <Input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Cari aktivitas..."
              className="pl-8 h-8 text-xs w-44"
            />
          </div>
          <select
            value={actionFilter}
            onChange={(e) => {
              setActionFilter(e.target.value);
              setPage(1);
            }}
            className="h-8 rounded-lg border border-slate-300 bg-white px-2.5 text-xs text-slate-700"
          >
            <option value="ALL">Semua Aksi</option>
            <option value="UPDATED">Diperbarui</option>
            <option value="CREATED">Dibuat</option>
            <option value="ARCHIVED">Diarsipkan</option>
            <option value="RESTORED">Dipulihkan</option>
            <option value="DELETED">Dihapus</option>
          </select>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      ) : !data || data.items.length === 0 ? (
        <div className="py-8 text-center text-xs text-slate-500">
          Belum ada riwayat perubahan pengaturan.
        </div>
      ) : (
        <div className="space-y-2">
          {data.items.map((item) => {
            const isExpanded = expandedId === item.id;
            return (
              <div
                key={item.id}
                className="rounded-lg border border-slate-200 bg-white p-3.5 text-xs"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-semibold text-[10px]">
                        {item.action}
                      </span>
                      <span className="font-semibold text-slate-900">
                        {item.changeSummary || item.resourceTitle || 'Perubahan pengaturan'}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-500 mt-1">
                      Oleh <span className="font-medium text-slate-700">{item.actorName || 'Sistem'}</span>{' '}
                      ({item.actorRole}) • {formatDate(item.createdAt)}
                    </div>
                  </div>
                  {(item.beforeValue || item.afterValue) && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setExpandedId(isExpanded ? null : item.id)}
                    >
                      {isExpanded ? (
                        <ChevronUp className="h-3.5 w-3.5" />
                      ) : (
                        <ChevronDown className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  )}
                </div>

                {isExpanded && (
                  <div className="mt-3 pt-3 border-t border-slate-100 grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <div className="text-[11px] font-semibold text-slate-500 mb-1">Sebelum</div>
                      <pre className="p-2 rounded bg-slate-50 text-[11px] text-slate-700 overflow-x-auto">
                        {JSON.stringify(item.beforeValue || {}, null, 2)}
                      </pre>
                    </div>
                    <div>
                      <div className="text-[11px] font-semibold text-slate-500 mb-1">Sesudah</div>
                      <pre className="p-2 rounded bg-emerald-50/50 text-[11px] text-slate-700 overflow-x-auto">
                        {JSON.stringify(item.afterValue || {}, null, 2)}
                      </pre>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {data.pagination.totalPages > 1 && (
            <div className="flex items-center justify-between pt-2">
              <span className="text-xs text-slate-500">
                Halaman {data.pagination.page} dari {data.pagination.totalPages} ({data.pagination.total} entri)
              </span>
              <div className="flex gap-1.5">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={page >= data.pagination.totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

/* ============================================================================
 * SECTION 7: STATUS & ARSIP
 * ============================================================================ */
function LifecycleSection({
  classroomId,
  data,
  isCreatorOrAdmin,
  onSaved,
  onDeleted,
}: {
  classroomId: string;
  data: SettingsPayload;
  isCreatorOrAdmin: boolean;
  onSaved: () => void;
  onDeleted: () => void;
}) {
  const isArchived = data.classroom.lifecycleStatus === 'archived';
  const [confirmPhrase, setConfirmPhrase] = useState('');

  const archiveConfirm = useDeleteConfirmation<{ name: string }>();
  const deleteConfirm = useDeleteConfirmation<{ name: string }>();

  const { data: impact } = useQuery<DeletionImpact>({
    queryKey: ['classroom-deletion-impact', classroomId],
    queryFn: () =>
      apiFetch<DeletionImpact>(`/api/v1/classrooms/${classroomId}/deletion-impact`),
    enabled: isCreatorOrAdmin,
  });

  const archiveMutation = useMutation({
    mutationFn: () =>
      apiFetch(`/api/v1/classrooms/${classroomId}/archive`, {
        method: 'POST',
        body: JSON.stringify({}),
      }),
    onSuccess: () => {
      toast.success('Ruang kelas berhasil diarsipkan.');
      onSaved();
    },
    onError: (err: Error) => toast.error(err.message || 'Gagal mengarsipkan kelas.'),
  });

  const restoreMutation = useMutation({
    mutationFn: () =>
      apiFetch(`/api/v1/classrooms/${classroomId}/restore`, {
        method: 'POST',
        body: JSON.stringify({}),
      }),
    onSuccess: () => {
      toast.success('Ruang kelas berhasil dipulihkan menjadi aktif.');
      onSaved();
    },
    onError: (err: Error) => toast.error(err.message || 'Gagal memulihkan kelas.'),
  });

  const deleteMutation = useMutation({
    mutationFn: () =>
      apiFetch(`/api/v1/classrooms/${classroomId}?confirmForce=true`, {
        method: 'DELETE',
        body: JSON.stringify({ confirmText: confirmPhrase }),
      }),
    onSuccess: () => {
      toast.success('Ruang kelas telah dihapus secara permanen.');
      onDeleted();
    },
    onError: (err: Error) => toast.error(err.message || 'Gagal menghapus ruang kelas.'),
  });

  return (
    <div className="space-y-6">
      {/* Archive / Restore */}
      <Card className="p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-base font-bold text-slate-900">
              {isArchived ? 'Pulihkan Ruang Kelas dari Arsip' : 'Arsipkan Ruang Kelas'}
            </h3>
            <p className="text-xs text-slate-500 mt-1 max-w-xl">
              {isArchived
                ? 'Kelas ini sedang diarsipkan (read-only). Memulihkan kelas akan mengaktifkan kembali akses pembelajaran, pengumpulan tugas, dan kuis.'
                : 'Mengarsipkan kelas akan membekukan perubahan materi dan pengumpulan tugas sambil tetap menjaga seluruh data akademik, nilai, dan riwayat mahasiswa.'}
            </p>
          </div>
          {isCreatorOrAdmin && (
            isArchived ? (
              <Button
                type="button"
                onClick={() => restoreMutation.mutate()}
                disabled={restoreMutation.isPending}
              >
                <RotateCcw className="h-4 w-4 mr-1.5" />
                {restoreMutation.isPending ? 'Memulihkan...' : 'Pulihkan Kelas'}
              </Button>
            ) : (
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  archiveConfirm.requestConfirmation({
                    item: { name: data.classroom.name },
                    title: 'Arsipkan Ruang Kelas?',
                    description:
                      'Kelas akan dipindahkan ke status arsip. Mahasiswa dan pengajar tetap dapat melihat riwayat materi dan nilai.',
                    itemName: data.classroom.name,
                    actionLabel: 'Ya, Arsipkan Kelas',
                    variant: 'default',
                    onConfirm: async () => {
                      await archiveMutation.mutateAsync();
                    },
                  })
                }
              >
                <Archive className="h-4 w-4 mr-1.5" />
                Arsipkan Kelas
              </Button>
            )
          )}
        </div>
      </Card>

      {/* Controlled Deletion */}
      <Card className="p-6 border-rose-200 bg-rose-50/30 space-y-4">
        <div className="pb-3 border-b border-rose-100">
          <div className="flex items-center gap-2 text-rose-800">
            <AlertTriangle className="h-4 w-4" />
            <h3 className="text-base font-bold">Zona Berbahaya: Penghapusan Permanen</h3>
          </div>
          <p className="text-xs text-rose-700 mt-1">
            Penghapusan ruang kelas bersifat permanen dan hanya diizinkan oleh Pembuat Kelas atau Superadmin.
          </p>
        </div>

        {impact && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div className="p-3 rounded-lg bg-white border border-rose-100">
              <div className="text-slate-500">Peserta Terdaftar</div>
              <div className="text-base font-bold text-slate-900">{impact.enrolledStudents}</div>
            </div>
            <div className="p-3 rounded-lg bg-white border border-rose-100">
              <div className="text-slate-500">Materi & Tugas</div>
              <div className="text-base font-bold text-slate-900">
                {impact.materials + impact.assignments}
              </div>
            </div>
            <div className="p-3 rounded-lg bg-white border border-rose-100">
              <div className="text-slate-500">Pengumpulan & Nilai</div>
              <div className="text-base font-bold text-slate-900">
                {impact.submissions} ({impact.publishedGrades} dinilai)
              </div>
            </div>
            <div className="p-3 rounded-lg bg-white border border-rose-100">
              <div className="text-slate-500">Percobaan Kuis/Ujian</div>
              <div className="text-base font-bold text-slate-900">{impact.assessmentAttempts}</div>
            </div>
          </div>
        )}

        {isCreatorOrAdmin ? (
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 pt-2">
            <div className="flex-1 max-w-sm">
              <label className="block text-xs font-semibold text-rose-900 mb-1">
                Ketik <span className="font-mono bg-rose-100 px-1.5 py-0.5 rounded">HAPUS</span> untuk konfirmasi penghapusan
              </label>
              <Input
                value={confirmPhrase}
                onChange={(e) => setConfirmPhrase(e.target.value)}
                placeholder="HAPUS"
                className="border-rose-300 focus:border-rose-500"
              />
            </div>
            <Button
              type="button"
              variant="destructive"
              disabled={confirmPhrase.trim() !== 'HAPUS' || deleteMutation.isPending}
              onClick={() =>
                deleteConfirm.requestConfirmation({
                  item: { name: data.classroom.name },
                  title: 'Hapus Ruang Kelas Permanen?',
                  description:
                    'Seluruh modul, materi, tugas, penilaian, dan keanggotaan di ruang kelas ini akan dihapus permanen.',
                  itemName: data.classroom.name,
                  warningText:
                    'Tindakan ini tidak dapat dibatalkan. Pertimbangkan untuk mengarsipkan kelas jika masih membutuhkan riwayat nilai.',
                  actionLabel: 'Hapus Permanen',
                  variant: 'destructive',
                  onConfirm: async () => {
                    await deleteMutation.mutateAsync();
                  },
                })
              }
            >
              <Trash2 className="h-4 w-4 mr-1.5" />
              Hapus Ruang Kelas Permanen
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-xs text-slate-600">
            <Lock className="h-4 w-4 text-slate-400" />
            Hanya Pembuat Kelas atau Superadmin yang dapat menghapus ruang kelas.
          </div>
        )}
      </Card>

      <ConfirmDialog {...archiveConfirm.dialogProps} />

      <ConfirmDialog {...deleteConfirm.dialogProps} />
    </div>
  );
}
