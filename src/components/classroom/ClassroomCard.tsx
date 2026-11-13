import React, { useState, useEffect } from 'react';
import {
  Users,
  BookOpen,
  FileText,
  ClipboardCheck,
  Globe,
  Lock,
  ArrowUpRight,
  Settings,
  KeyRound,
  BarChart3,
  Clock,
  GraduationCap,
  Presentation,
} from 'lucide-react';
import { Button } from '../ui/primitives';
import { formatDateTime } from '../../lib/utils';

const ACADEMIC_GRADIENTS = [
  'from-[#0F172A] via-[#1E3A5F] to-[#1D4ED8]', // Navy to Royal Blue
  'from-[#1E1B4B] via-[#312E81] to-[#6D28D9]', // Indigo to Violet
  'from-[#042F2E] via-[#0F766E] to-[#10B981]', // Teal to Emerald
  'from-[#0F172A] via-[#0369A1] to-[#0891B2]', // Slate Blue to Cyan
  'from-[#2E1065] via-[#4C1D95] to-[#4338CA]', // Deep Purple to Indigo
  'from-[#4C0519] via-[#881337] to-[#BE123C]', // Burgundy to Rose
  'from-[#064E3B] via-[#047857] to-[#0F766E]', // Emerald to Dark Teal
  'from-[#1E293B] via-[#334155] to-[#475569]', // Blue Gray to Slate
] as const;

const COVER_ICONS = [GraduationCap, BookOpen, Presentation] as const;

export function stableHash(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function getClassroomGradient(classroomId: string): {
  gradientClass: string;
  Icon: React.ComponentType<{ className?: string }>;
} {
  const hash = stableHash(classroomId || 'default-classroom');
  return {
    gradientClass: ACADEMIC_GRADIENTS[hash % ACADEMIC_GRADIENTS.length],
    Icon: COVER_ICONS[hash % COVER_ICONS.length],
  };
}

export interface ClassroomDirectoryItem {
  id: string;
  name: string;
  section: string;
  capacity: number;
  enrollmentPolicy: string;
  status: string;
  lifecycleStatus: string;
  effectiveStatus: 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';
  visibility: 'PUBLIC' | 'PRIVATE';
  description?: string | null;
  coverImagePath?: string | null;
  coverThumbnailPath?: string | null;
  courseCode: string;
  courseTitle: string;
  studyProgram: string;
  credits: number;
  semesterName: string;
  createdById: string;
  creatorName: string;
  createdAt: string;
  instructors: {
    instructorId: string;
    fullName: string;
    isPrimary: boolean;
    role: string;
  }[];
  activeStudentCount: number;
  pendingEnrollmentCount: number;
  publishedMaterialsCount: number;
  joinCode: string | null;
  myEnrollmentStatus: string | null;
  isOwner: boolean;
  isCoInstructor: boolean;
  isInstructor: boolean;
  canManage: boolean;
  canEditSettings: boolean;
  canEnter: boolean;
  studentProgress: {
    totalRequiredItems: number;
    completedItems: number;
    progressPercent: number;
    progressStatus: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED';
    materialsCount: number;
    assignmentsCount: number;
    assessmentsCount: number;
    lastActivityAt: string | null;
  } | null;
}

interface ClassroomCardProps {
  item: ClassroomDirectoryItem;
  mode: 'SUPERADMIN' | 'DOSEN' | 'MAHASISWA_ENROLLED' | 'MAHASISWA_PUBLIC';
  onOpenClassroom: (id: string) => void;
  onOpenParticipants?: (id: string) => void;
  onOpenSettings?: (id: string) => void;
  onOpenAnalytics?: (id: string) => void;
  onPromptJoinCode?: (item: ClassroomDirectoryItem) => void;
}

export function ClassroomCard({
  item,
  mode,
  onOpenClassroom,
  onOpenParticipants,
  onOpenSettings,
  onOpenAnalytics,
  onPromptJoinCode,
}: ClassroomCardProps) {
  const coverSrc = item.coverThumbnailPath || item.coverImagePath || null;
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    setImgError(false);
  }, [coverSrc]);

  const { gradientClass, Icon: CoverIcon } = getClassroomGradient(item.id);
  const showCoverImage = Boolean(coverSrc && !imgError);
  const primaryLecturer =
    item.instructors.find((i) => i.isPrimary)?.fullName ||
    item.instructors[0]?.fullName ||
    item.creatorName;

  const visibilityBadge =
    item.visibility === 'PUBLIC' ? (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-sky-50 text-sky-700 border border-sky-200">
        <Globe className="w-3 h-3" />
        Publik
      </span>
    ) : (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 text-slate-700 border border-slate-200">
        <Lock className="w-3 h-3" />
        Private
      </span>
    );

  const statusBadge =
    item.effectiveStatus === 'ACTIVE' ? (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
        Aktif
      </span>
    ) : item.effectiveStatus === 'ARCHIVED' ? (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-50 text-amber-700 border border-amber-200">
        Diarsipkan
      </span>
    ) : (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 text-slate-600 border border-slate-200">
        Nonaktif
      </span>
    );

  const progress = item.studentProgress;
  const progressBarColor =
    progress?.progressStatus === 'COMPLETED'
      ? 'bg-emerald-600'
      : progress?.progressStatus === 'IN_PROGRESS'
        ? 'bg-blue-600'
        : 'bg-slate-300';

  const progressLabel =
    progress?.progressStatus === 'COMPLETED'
      ? 'Selesai'
      : progress?.progressStatus === 'IN_PROGRESS'
        ? 'Sedang Berlangsung'
        : 'Belum Dimulai';

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col hover:border-slate-300 hover:shadow-sm transition-all">
      {/* Cover Area (16:9): Optimized Cover Image or Deterministic Academic Gradient */}
      <div
        className={`relative aspect-video w-full overflow-hidden ${
          showCoverImage
            ? 'bg-slate-100'
            : `bg-gradient-to-br ${gradientClass}`
        }`}
      >
        {showCoverImage ? (
          <>
            <img
              src={coverSrc!}
              alt={item.name}
              loading="lazy"
              decoding="async"
              onError={() => setImgError(true)}
              className="w-full h-full object-cover object-center"
            />
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/25 via-transparent to-transparent" />
          </>
        ) : (
          <div className="absolute inset-0 flex items-center justify-end pr-6 pointer-events-none select-none">
            <CoverIcon className="w-20 h-20 text-white/15" />
          </div>
        )}

        <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5">
          <span className="px-2.5 py-0.5 rounded-md bg-white/95 text-[#14213D] font-mono text-[11px] font-bold shadow-xs">
            {item.courseCode} • {item.credits} SKS
          </span>
        </div>
        <div className="absolute top-2.5 right-2.5 flex items-center gap-1.5">
          {visibilityBadge}
        </div>
      </div>

      {/* Body */}
      <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
        <div className="space-y-2">
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-bold text-slate-900 text-sm leading-snug line-clamp-2">
              {item.name}
            </h3>
            {mode !== 'MAHASISWA_PUBLIC' && statusBadge}
          </div>

          <div className="text-xs text-slate-500 space-y-1">
            <p className="truncate font-medium text-slate-700">{item.studyProgram}</p>
            <p className="truncate">
              Dosen: <span className="text-slate-700">{primaryLecturer}</span>
            </p>
            <p className="truncate">
              {item.semesterName} • Kelas {item.section}
            </p>
            {mode === 'SUPERADMIN' && (
              <p className="truncate text-[11px] text-slate-500">
                Pembuat: <span className="font-medium text-slate-700">{item.creatorName}</span>
              </p>
            )}
          </div>

          {/* Role-specific Metadata */}
          {mode === 'DOSEN' && (
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              <span
                className={`px-2 py-0.5 rounded-full text-[11px] font-medium border ${
                  item.isOwner
                    ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                    : 'bg-amber-50 text-amber-700 border-amber-200'
                }`}
              >
                {item.isOwner ? 'Pemilik Kelas' : 'Co-Dosen'}
              </span>
              {item.joinCode && (
                <span className="px-2 py-0.5 rounded-full text-[11px] font-mono bg-slate-100 text-slate-700 border border-slate-200">
                  Kode: {item.joinCode}
                </span>
              )}
            </div>
          )}

          {mode === 'MAHASISWA_PUBLIC' && item.description && (
            <p className="text-xs text-slate-600 line-clamp-2 pt-1">{item.description}</p>
          )}
        </div>

        {/* Metrics & Progress */}
        <div className="space-y-3 pt-2 border-t border-slate-100">
          {(mode === 'SUPERADMIN' || mode === 'DOSEN') && (
            <div className="flex items-center justify-between text-xs text-slate-600">
              <span className="inline-flex items-center gap-1">
                <Users className="w-3.5 h-3.5 text-slate-400" />
                {item.activeStudentCount} / {item.capacity} Mahasiswa
              </span>
              <span className="inline-flex items-center gap-1">
                <BookOpen className="w-3.5 h-3.5 text-slate-400" />
                {item.publishedMaterialsCount} Materi
              </span>
            </div>
          )}

          {mode === 'MAHASISWA_ENROLLED' && progress && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-[11px] text-slate-500">
                <span className="inline-flex items-center gap-1">
                  <BookOpen className="w-3 h-3" /> {progress.materialsCount} Materi
                </span>
                <span className="inline-flex items-center gap-1">
                  <FileText className="w-3 h-3" /> {progress.assignmentsCount} Tugas
                </span>
                <span className="inline-flex items-center gap-1">
                  <ClipboardCheck className="w-3 h-3" /> {progress.assessmentsCount} Ujian
                </span>
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-700">
                    Progress Pembelajaran ({progressLabel})
                  </span>
                  <span className="font-bold text-[#14213D]">{progress.progressPercent}%</span>
                </div>
                <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all duration-300 ${progressBarColor}`}
                    style={{ width: `${progress.progressPercent}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-[11px] text-slate-500">
                  <span>
                    {progress.completedItems} dari {progress.totalRequiredItems} aktivitas pembelajaran
                  </span>
                  {progress.lastActivityAt && (
                    <span className="inline-flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {formatDateTime(progress.lastActivityAt)}
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Contextual Actions */}
          {mode === 'SUPERADMIN' && (
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                onClick={() => onOpenClassroom(item.id)}
                className="flex-1 bg-[#14213D] hover:bg-[#1d2f54] text-xs gap-1"
              >
                Masuk Kelas
                <ArrowUpRight className="w-3.5 h-3.5" />
              </Button>
              {onOpenParticipants && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onOpenParticipants(item.id)}
                  className="text-xs"
                >
                  Peserta
                </Button>
              )}
            </div>
          )}

          {mode === 'DOSEN' && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  onClick={() => onOpenClassroom(item.id)}
                  className="flex-1 bg-[#14213D] hover:bg-[#1d2f54] text-xs gap-1"
                >
                  Masuk Kelas
                  <ArrowUpRight className="w-3.5 h-3.5" />
                </Button>
                {onOpenParticipants && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onOpenParticipants(item.id)}
                    className="text-xs gap-1"
                  >
                    <Users className="w-3.5 h-3.5" />
                    Peserta
                  </Button>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {item.canEditSettings && onOpenSettings && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => onOpenSettings(item.id)}
                    className="text-[11px] h-7 px-2 gap-1 text-slate-600"
                  >
                    <Settings className="w-3 h-3" />
                    Pengaturan
                  </Button>
                )}
                {item.canEditSettings && onOpenSettings && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => onOpenSettings(item.id)}
                    className="text-[11px] h-7 px-2 gap-1 text-slate-600"
                  >
                    <KeyRound className="w-3 h-3" />
                    Undangan
                  </Button>
                )}
                {onOpenAnalytics && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => onOpenAnalytics(item.id)}
                    className="text-[11px] h-7 px-2 gap-1 text-slate-600"
                  >
                    <BarChart3 className="w-3 h-3" />
                    Analitik
                  </Button>
                )}
              </div>
            </div>
          )}

          {mode === 'MAHASISWA_ENROLLED' && (
            <div>
              {item.myEnrollmentStatus === 'pending' ? (
                <div className="w-full py-2 px-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs font-medium text-center">
                  Menunggu Persetujuan Dosen
                </div>
              ) : (
                <Button
                  size="sm"
                  onClick={() => onOpenClassroom(item.id)}
                  className="w-full bg-[#14213D] hover:bg-[#1d2f54] text-xs gap-1.5"
                >
                  Lanjutkan Pembelajaran
                  <ArrowUpRight className="w-3.5 h-3.5" />
                </Button>
              )}
            </div>
          )}

          {mode === 'MAHASISWA_PUBLIC' && (
            <div>
              {item.myEnrollmentStatus === 'active' || item.myEnrollmentStatus === 'completed' ? (
                <Button
                  size="sm"
                  onClick={() => onOpenClassroom(item.id)}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-xs gap-1.5"
                >
                  Sudah Terdaftar • Masuk Kelas
                  <ArrowUpRight className="w-3.5 h-3.5" />
                </Button>
              ) : item.myEnrollmentStatus === 'pending' ? (
                <div className="w-full py-2 px-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs font-medium text-center">
                  Menunggu Persetujuan
                </div>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onPromptJoinCode?.(item)}
                  className="w-full text-xs gap-1.5 border-[#14213D]/30 text-[#14213D] hover:bg-[#14213D]/5"
                >
                  <KeyRound className="w-3.5 h-3.5" />
                  Masukkan Kode Undangan
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
