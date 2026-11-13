import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  GraduationCap,
  Users,
  ShieldCheck,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Info,
  Sparkles,
  BookOpen,
  Image as ImageIcon,
  Edit3,
  RotateCcw,
  Search,
  X,
  UserCheck,
} from 'lucide-react';
import { AppShell } from '../components/AppShell';
import { Button, Input, Textarea, Card, ConfirmDialog } from '../components/ui/primitives';
import { apiRequest } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { isSuperadminUser } from '../lib/authorization';
import { toast } from 'sonner';
import { useDeleteConfirmation } from '../hooks/useDeleteConfirmation';
import { LightweightTiptapEditor } from '../components/LightweightTiptapEditor';
import {
  ClassroomCoverUploader,
  CoverMetadata,
} from '../components/ClassroomCoverUploader';

interface AcademicPeriod {
  id: string;
  code: string;
  name: string;
  academicYear: string;
  isDefault: boolean;
  status: string;
}

interface LecturerUser {
  id: string;
  fullName: string;
  email: string;
  identityNumber?: string | null;
  nidn?: string | null;
  nip?: string | null;
  academicTitle?: string | null;
  studyProgram?: string | null;
  organizationalUnit?: string | null;
  avatarUrl?: string | null;
  isActive?: boolean;
  accountStatus?: string;
}

// Exactly 5 Steps as specified
const STEPS = [
  { id: 1, label: 'Identitas Kelas', icon: Info },
  { id: 2, label: 'Konteks Akademik', icon: GraduationCap },
  { id: 3, label: 'Tim Pengajar', icon: Users },
  { id: 4, label: 'Aturan Pendaftaran', icon: ShieldCheck },
  { id: 5, label: 'Review & Publikasi', icon: CheckCircle2 },
];

const DRAFT_STORAGE_KEY = 'pk_lms_classroom_wizard_draft_v2';

export function ClassroomBuilderWizardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(1);
  const [hasRestoredDraft, setHasRestoredDraft] = useState(false);

  // Form State — completely decoupled from schedules & room allocations
  const [formData, setFormData] = useState({
    // Step 1: Classroom Identity
    name: '',
    classroomCode: '',
    subjectName: '',
    subjectCode: '',
    cpmk: '',
    description: '',
    coverMetadata: null as CoverMetadata | null,

    // Step 2: Academic Context
    academicPeriodId: '',
    academicYear: '2025/2026',
    semesterName: '',
    section: 'A',
    cohort: '2026',
    classroomType: 'REGULAR' as
      | 'REGULAR'
      | 'PRACTICAL'
      | 'HYBRID'
      | 'SHORT_SEMESTER'
      | 'REMEDIAL',
    minCapacity: 10,
    maxCapacity: 35,
    category: 'REGULAR',
    language: 'id',
    visibility: 'PRIVATE' as
      | 'PUBLIC'
      | 'PRIVATE'
      | 'PUBLIC_ENROLLED'
      | 'CAMPUS_WIDE'
      | 'PRIVATE_RESTRICTED',

    // Step 3: Teaching Team
    instructors: [] as Array<{
      instructorId: string;
      role:
        | 'PRIMARY_INSTRUCTOR'
        | 'CO_INSTRUCTOR'
        | 'TEACHING_ASSISTANT'
        | 'GUEST_INSTRUCTOR';
      permissionScopes: string[];
    }>,

    // Step 4: Enrollment Rules & Policies
    policy: {
      enrollmentMode: 'AUTO' as 'AUTO' | 'APPROVAL_REQUIRED' | 'JOIN_CODE',
      minParticipants: 10,
      maxParticipants: 35,
      allowedStudyPrograms: [] as string[],
      allowedCohorts: [] as string[],
      allowLateEnrollment: false,
      waitingListEnabled: true,
      maxWaitingList: 15,
      joinCodeMaxUses: 50,
    },

    // Step 5: Publication
    lifecycleStatus: 'active' as 'draft' | 'active',
    submitForApproval: false,
  });

  // Restore draft from localStorage on initial load
  useEffect(() => {
    try {
      const savedDraft = localStorage.getItem(DRAFT_STORAGE_KEY);
      if (savedDraft && !hasRestoredDraft) {
        const parsed = JSON.parse(savedDraft);
        setFormData((prev) => ({
          ...prev,
          ...parsed,
        }));
        setHasRestoredDraft(true);
      }
    } catch {
      // Ignore corrupted draft
    }
  }, [hasRestoredDraft]);

  // Persist draft to localStorage on change
  useEffect(() => {
    try {
      localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(formData));
    } catch {
      // Ignore quota errors
    }
  }, [formData]);

  // Fetch Academic Periods
  const { data: academicPeriods = [] } = useQuery({
    queryKey: ['academic-periods-list'],
    queryFn: async () => {
      const res = await apiRequest<AcademicPeriod[]>('/api/v1/academic-periods');
      return res.data || [];
    },
  });

  const { data: defaultPeriod } = useQuery({
    queryKey: ['default-academic-period'],
    queryFn: async () => {
      const res = await apiRequest<AcademicPeriod>(
        '/api/v1/academic-periods/default'
      );
      return res.data;
    },
  });

  const isSuperadmin = isSuperadminUser(user);
  const [primarySearch, setPrimarySearch] = useState('');
  const [primaryProdi, setPrimaryProdi] = useState('ALL');
  const [coSearch, setCoSearch] = useState('');

  // Fetch active DOSEN candidates from eligible-instructors endpoint
  const { data: eligibleInstructorsRes, isLoading: isLoadingLecturers } = useQuery({
    queryKey: ['eligible-instructors'],
    queryFn: async () => {
      const res = await apiRequest<LecturerUser[]>(
        '/api/v1/classrooms/eligible-instructors?status=ACTIVE&limit=100'
      );
      return res;
    },
  });
  const lecturers = eligibleInstructorsRes?.data || [];
  const studyPrograms: string[] = (eligibleInstructorsRes as any)?.meta?.studyPrograms || [];

  // Pre-fill primary instructor ONLY for DOSEN (self-service); Superadmin must explicitly choose
  useEffect(() => {
    if (!user?.id) return;
    if (!isSuperadmin) {
      const hasPrimary = formData.instructors.some((i) => i.role === 'PRIMARY_INSTRUCTOR');
      if (!hasPrimary) {
        setFormData((prev) => ({
          ...prev,
          instructors: [
            {
              instructorId: user.id,
              role: 'PRIMARY_INSTRUCTOR',
              permissionScopes: ['all'],
            },
            ...prev.instructors.filter((i) => i.instructorId !== user.id),
          ],
        }));
      }
    } else {
      // Guard: never allow Superadmin to remain as PRIMARY_INSTRUCTOR
      const superadminPrimary = formData.instructors.some(
        (i) => i.role === 'PRIMARY_INSTRUCTOR' && i.instructorId === user.id
      );
      if (superadminPrimary) {
        setFormData((prev) => ({
          ...prev,
          instructors: prev.instructors.filter(
            (i) => !(i.role === 'PRIMARY_INSTRUCTOR' && i.instructorId === user.id)
          ),
        }));
      }
    }
  }, [user?.id, isSuperadmin, formData.instructors]);

  // Pre-fill default academic period and year
  useEffect(() => {
    if (defaultPeriod?.id && !formData.academicPeriodId) {
      setFormData((prev) => ({
        ...prev,
        academicPeriodId: defaultPeriod.id,
        academicYear: defaultPeriod.academicYear || prev.academicYear,
        semesterName: defaultPeriod.name || prev.semesterName,
      }));
    }
  }, [defaultPeriod, formData.academicPeriodId]);

  // Auto-generate code suggestion when course name or section changes
  const handleAutoSuggestCode = () => {
    const base = (formData.subjectCode || formData.subjectName || formData.name)
      .trim()
      .replace(/[^a-zA-Z0-9\s]/g, '')
      .split(/\s+/)
      .map((w) => w[0]?.toUpperCase() || '')
      .join('')
      .slice(0, 4);

    const sec = formData.section.trim().toUpperCase().replace(/[^A-Z0-9]/g, '') || 'A';
    const rand = Math.random().toString(36).substring(2, 5).toUpperCase();
    const suggested = `PKM-${base || 'CLS'}${sec}-${rand}`;
    setFormData((prev) => ({ ...prev, classroomCode: suggested }));
  };

  // Mutation to submit classroom builder
  const createClassMutation = useMutation({
    mutationFn: async (payload: typeof formData) => {
      return apiRequest('/api/v1/classrooms/builder', {
        method: 'POST',
        body: JSON.stringify({
          name: payload.name,
          classroomCode: payload.classroomCode,
          subjectName: payload.subjectName,
          subjectCode: payload.subjectCode,
          cpmk: payload.cpmk,
          description: payload.description,
          learningObjectives: payload.cpmk,
          coverImagePath: payload.coverMetadata?.coverImagePath || null,
          coverThumbnailPath: payload.coverMetadata?.coverThumbnailPath || null,
          coverMimeType: payload.coverMetadata?.coverMimeType || null,
          coverFileSize: payload.coverMetadata?.coverFileSize || null,
          coverWidth: payload.coverMetadata?.coverWidth || null,
          coverHeight: payload.coverMetadata?.coverHeight || null,

          academicPeriodId: payload.academicPeriodId,
          academicYear: payload.academicYear,
          semesterName: payload.semesterName,
          section: payload.section,
          cohort: payload.cohort,
          classroomType: payload.classroomType,
          minCapacity: payload.minCapacity,
          maxCapacity: payload.maxCapacity,
          category: payload.category,
          language: payload.language,
          visibility: payload.visibility,

          primaryInstructorId:
            payload.instructors.find((i) => i.role === 'PRIMARY_INSTRUCTOR')?.instructorId ||
            (!isSuperadmin ? user?.id : undefined),
          coInstructorIds: payload.instructors
            .filter((i) => i.role === 'CO_INSTRUCTOR')
            .map((i) => i.instructorId),
          instructors: payload.instructors,
          policy: payload.policy,
          lifecycleStatus: payload.lifecycleStatus,
          submitForApproval: payload.submitForApproval,
        }),
      });
    },
    onSuccess: (res: any) => {
      // Clear draft storage
      localStorage.removeItem(DRAFT_STORAGE_KEY);
      toast.success('Ruang Kelas Digital berhasil diterbitkan!');
      navigate(`/classrooms/${res.data.id}`);
    },
    onError: (err: any) => {
      toast.error(err.message || 'Gagal menerbitkan ruang kelas.');
    },
  });

  const handleValidateStep = (step: number): boolean => {
    if (step === 1) {
      if (!formData.name.trim()) {
        toast.error('Silakan isi Nama Ruang Kelas terlebih dahulu.');
        return false;
      }
      if (formData.name.trim().length < 3) {
        toast.error('Nama Ruang Kelas minimal 3 karakter.');
        return false;
      }
      if (!formData.subjectName.trim()) {
        toast.error('Silakan isi Nama Mata Kuliah.');
        return false;
      }
    }
    if (step === 2) {
      if (!formData.academicPeriodId) {
        toast.error('Silakan pilih Periode Semester Resmi.');
        return false;
      }
      if (formData.maxCapacity < 1) {
        toast.error('Kapasitas maksimal minimal 1 mahasiswa.');
        return false;
      }
    }
    if (step === 3) {
      const primary = formData.instructors.find((i) => i.role === 'PRIMARY_INSTRUCTOR');
      if (isSuperadmin && !primary?.instructorId) {
        toast.error('Silakan pilih Dosen Pengampu Utama terlebih dahulu.');
        return false;
      }
    }
    return true;
  };

  const handleNext = () => {
    if (!handleValidateStep(currentStep)) return;
    setCurrentStep((prev) => Math.min(5, prev + 1));
  };

  const handleSubmit = (status: 'draft' | 'active', approval = false) => {
    if (!handleValidateStep(1) || !handleValidateStep(2)) {
      return;
    }

    createClassMutation.mutate({
      ...formData,
      lifecycleStatus: status,
      submitForApproval: approval,
    });
  };

  const deleteConfirm = useDeleteConfirmation();

  const handleResetDraft = () => {
    deleteConfirm.requestConfirmation({
      item: null,
      title: 'Reset Formulir Draf Kelas?',
      description: 'Apakah Anda yakin ingin mereset seluruh formulir draf ruang kelas ini?',
      itemName: formData.name || 'Draf Ruang Kelas Baru',
      warningText: 'Seluruh isian yang belum disimpan ke server akan dihapus dari penyimpanan lokal.',
      actionLabel: 'Ya, Reset Draf',
      onConfirm: () => {
        localStorage.removeItem(DRAFT_STORAGE_KEY);
        window.location.reload();
      },
    });
  };

  const selectedPeriod =
    academicPeriods.find((p) => p.id === formData.academicPeriodId) ||
    defaultPeriod;

  return (
    <AppShell>
      <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
        {/* Header */}
        <div className="border-b border-slate-200 pb-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold text-blue-600 mb-1">
              <span>Politeknik Kampar</span>
              <span>•</span>
              <span>Ruang Kelas Digital</span>
            </div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
              Pembuatan Ruang Kelas Digital
            </h1>
            <p className="text-xs text-slate-500 mt-1">
              Konfigurasi 5-langkah: Identitas kelas, konteks akademik, tim pengajar, aturan pendaftaran, dan review publikasi.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={handleResetDraft}
              className="text-xs text-slate-600 hover:text-slate-900 cursor-pointer flex items-center gap-1.5"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Reset Form
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleSubmit('draft')}
              disabled={createClassMutation.isPending}
              className="text-xs border-slate-300 text-slate-700 hover:bg-slate-50 cursor-pointer"
            >
              Simpan Draft
            </Button>
          </div>
        </div>

        {/* 5-Step Stepper Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          {STEPS.map((s) => {
            const Icon = s.icon;
            const isActive = currentStep === s.id;
            const isCompleted = currentStep > s.id;

            return (
              <button
                key={s.id}
                type="button"
                onClick={() => {
                  if (s.id < currentStep || handleValidateStep(currentStep)) {
                    setCurrentStep(s.id);
                  }
                }}
                className={`p-3 rounded-lg border text-left transition-all flex flex-col justify-between cursor-pointer ${
                  isActive
                    ? 'border-blue-600 bg-blue-50 text-blue-900 ring-2 ring-blue-500/20 shadow-2xs'
                    : isCompleted
                    ? 'border-emerald-300 bg-emerald-50/50 text-emerald-900 hover:bg-emerald-50'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span
                    className={`text-[11px] font-bold px-1.5 py-0.5 rounded border ${
                      isActive
                        ? 'bg-blue-600 text-white border-blue-600'
                        : isCompleted
                        ? 'bg-emerald-600 text-white border-emerald-600'
                        : 'bg-slate-100 text-slate-600 border-slate-200'
                    }`}
                  >
                    0{s.id}
                  </span>
                  <Icon
                    className={`w-4 h-4 ${
                      isActive
                        ? 'text-blue-600'
                        : isCompleted
                        ? 'text-emerald-600'
                        : 'text-slate-400'
                    }`}
                  />
                </div>
                <span className="text-xs font-semibold leading-tight line-clamp-1">
                  {s.label}
                </span>
              </button>
            );
          })}
        </div>

        {/* STEP CONTENT CONTAINER */}
        <Card className="p-6 border border-slate-200 shadow-xs min-h-[460px]">
          {/* ====================================================================
              STEP 1: IDENTITAS KELAS
          ==================================================================== */}
          {currentStep === 1 && (
            <div className="space-y-6">
              <div className="border-b border-slate-100 pb-3">
                <h3 className="text-base font-bold text-slate-900">
                  Langkah 1: Identitas Ruang Kelas
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Lengkapi informasi dasar ruang kelas digital, identitas mata kuliah, capaian pembelajaran, dan tampilan kelas.
                </p>
              </div>

              {/* FORM SECTION A: IDENTITAS UTAMA */}
              <div className="space-y-4">
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-600" />
                  Bagian A: Identitas Utama
                </h4>

                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">
                    Nama Ruang Kelas <span className="text-red-500">*</span>
                  </label>
                  <Input
                    value={formData.name}
                    onChange={(e) =>
                      setFormData({ ...formData, name: e.target.value })
                    }
                    placeholder="Contoh: Pemrograman Web Lanjut — Kelas 3A"
                    required
                  />
                  <p className="text-[11px] text-slate-400 mt-1">
                    Direkomendasikan 5–150 karakter. Nama ini akan tampil pada kartu kelas mahasiswa.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-semibold text-slate-700">
                        Kode Ruang Kelas <span className="text-red-500">*</span>
                      </label>
                      <button
                        type="button"
                        onClick={handleAutoSuggestCode}
                        className="text-[11px] text-blue-600 hover:text-blue-800 font-medium cursor-pointer"
                      >
                        Saran Kode Otomatis
                      </button>
                    </div>
                    <Input
                      value={formData.classroomCode}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          classroomCode: e.target.value.toUpperCase(),
                        })
                      }
                      placeholder="Contoh: PKM-PWL3A"
                      className="font-mono uppercase"
                    />
                    <p className="text-[11px] text-slate-400 mt-1">
                      Kode identifikasi unik ruang kelas di sistem.
                    </p>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-slate-700 block mb-1">
                      Seksi / Kelompok (Opsional)
                    </label>
                    <Input
                      value={formData.section}
                      onChange={(e) =>
                        setFormData({ ...formData, section: e.target.value })
                      }
                      placeholder="Contoh: Kelas A, Kelas B, Praktikum A"
                    />
                    <p className="text-[11px] text-slate-400 mt-1">
                      Pengelompokan rombongan belajar mahasiswa.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-semibold text-slate-700 block mb-1">
                      Nama Mata Kuliah <span className="text-red-500">*</span>
                    </label>
                    <Input
                      value={formData.subjectName}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          subjectName: e.target.value,
                        })
                      }
                      placeholder="Contoh: Pemrograman Web Lanjut"
                      required
                    />
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-slate-700 block mb-1">
                      Kode Mata Kuliah (Opsional)
                    </label>
                    <Input
                      value={formData.subjectCode}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          subjectCode: e.target.value.toUpperCase(),
                        })
                      }
                      placeholder="Contoh: TI-304"
                      className="font-mono uppercase"
                    />
                  </div>
                </div>
              </div>

              {/* FORM SECTION B: CAPAIAN PEMBELAJARAN (CPMK) */}
              <div className="space-y-2 pt-3 border-t border-slate-100">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                    <BookOpen className="w-4 h-4 text-blue-600" />
                    Bagian B: Capaian Pembelajaran (CPMK) / Silabus Ringkas
                  </h4>
                  <span className="text-[11px] text-slate-400">
                    Tampil pada informasi kelas mahasiswa
                  </span>
                </div>
                <p className="text-xs text-slate-500">
                  Uraikan kompetensi akhir dan capaian pembelajaran yang diharapkan dikuasai mahasiswa setelah menyelesaikan perkuliahan di kelas ini.
                </p>
                <Textarea
                  placeholder={`1. Mampu merancang arsitektur aplikasi web modern berbasis RESTful API.\n2. Mampu mengimplementasikan state management dan otentikasi JWT.\n3. Mampu melakukan deployment cloud dan containerisasi.`}
                  value={formData.cpmk}
                  onChange={(e) =>
                    setFormData({ ...formData, cpmk: e.target.value })
                  }
                  className="min-h-[110px] text-xs leading-relaxed font-sans"
                />
              </div>

              {/* FORM SECTION C: DESKRIPSI TAMBAHAN (RICH TEXT) */}
              <div className="space-y-2 pt-3 border-t border-slate-100">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                    <Edit3 className="w-4 h-4 text-emerald-600" />
                    Bagian C: Deskripsi Tambahan Ruang Kelas
                  </h4>
                  <span className="text-[11px] text-slate-400">
                    Editor Teks Terformat Ringan
                  </span>
                </div>
                <p className="text-xs text-slate-500">
                  Tambahkan informasi pendukung mengenai tata tertib perkuliahan, buku rujukan utama, atau pengantar awal dosen pengampu.
                </p>
                <LightweightTiptapEditor
                  value={formData.description}
                  onChange={(html) =>
                    setFormData({ ...formData, description: html })
                  }
                  placeholder="Tambahkan informasi pendukung mengenai mata kuliah, metode pembelajaran, ketentuan kelas, dan informasi penting lainnya..."
                  minHeight="140px"
                />
              </div>

              {/* FORM SECTION D: COVER IMAGE KELAS */}
              <div className="space-y-2 pt-3 border-t border-slate-100">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                    <ImageIcon className="w-4 h-4 text-purple-600" />
                    Bagian D: Cover Image Ruang Kelas (Opsional)
                  </h4>
                  <span className="text-[11px] text-slate-400">
                    Maks. 5 MB • Rasio 16:9
                  </span>
                </div>
                <p className="text-xs text-slate-500">
                  Unggah gambar sampul untuk mempercantik tampilan ruang kelas digital. Gambar akan otomatis dioptimasi ke format WebP modern. Jika tidak diunggah, sistem menggunakan cover default.
                </p>
                <ClassroomCoverUploader
                  value={formData.coverMetadata}
                  onChange={(meta) =>
                    setFormData({ ...formData, coverMetadata: meta })
                  }
                />
              </div>
            </div>
          )}

          {/* ====================================================================
              STEP 2: KONTEKS AKADEMIK
          ==================================================================== */}
          {currentStep === 2 && (
            <div className="space-y-5">
              <div className="border-b border-slate-100 pb-3">
                <h3 className="text-base font-bold text-slate-900">
                  Langkah 2: Konteks & Parameter Akademik
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Tentukan periode semester resmi, tahun akademik, angkatan, tipe kelas, dan kuota kapasitas mahasiswa.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">
                    Periode Semester Resmi <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={formData.academicPeriodId}
                    onChange={(e) => {
                      const p = academicPeriods.find((x) => x.id === e.target.value);
                      setFormData({
                        ...formData,
                        academicPeriodId: e.target.value,
                        academicYear: p?.academicYear || formData.academicYear,
                        semesterName: p?.name || formData.semesterName,
                      });
                    }}
                    className="w-full text-xs border border-slate-300 rounded-lg p-2.5 bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
                    required
                  >
                    <option value="">-- Pilih Periode Semester --</option>
                    {academicPeriods.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.code}) — {p.academicYear}{' '}
                        {p.isDefault ? '[DEFAULT AKTIF]' : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">
                    Tahun Akademik
                  </label>
                  <Input
                    value={formData.academicYear}
                    onChange={(e) =>
                      setFormData({ ...formData, academicYear: e.target.value })
                    }
                    placeholder="Contoh: 2025/2026"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">
                    Angkatan / Cohort Mahasiswa
                  </label>
                  <Input
                    value={formData.cohort}
                    onChange={(e) =>
                      setFormData({ ...formData, cohort: e.target.value })
                    }
                    placeholder="Contoh: 2026"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">
                    Tipe Ruang Kelas
                  </label>
                  <select
                    value={formData.classroomType}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        classroomType: e.target.value as any,
                      })
                    }
                    className="w-full text-xs border border-slate-300 rounded-lg p-2.5 bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
                  >
                    <option value="REGULAR">Kelas Reguler Teori & Praktik</option>
                    <option value="PRACTICAL">Kelas Khusus Praktikum Laboratorium</option>
                    <option value="HYBRID">Kelas Pembelajaran Campuran (Hybrid)</option>
                    <option value="SHORT_SEMESTER">Kelas Semester Pendek / Antara</option>
                    <option value="REMEDIAL">Kelas Pengayaan / Remedial</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-100">
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">
                    Kapasitas Minimum Kelas
                  </label>
                  <Input
                    type="number"
                    min={1}
                    value={formData.minCapacity}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        minCapacity: parseInt(e.target.value, 10) || 5,
                      })
                    }
                  />
                  <p className="text-[11px] text-slate-400 mt-1">
                    Batas minimum peserta kelas agar kelas layak diselenggarakan.
                  </p>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">
                    Kapasitas Maksimum Kelas <span className="text-red-500">*</span>
                  </label>
                  <Input
                    type="number"
                    min={1}
                    max={250}
                    value={formData.maxCapacity}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        maxCapacity: parseInt(e.target.value, 10) || 35,
                        policy: {
                          ...formData.policy,
                          maxParticipants: parseInt(e.target.value, 10) || 35,
                        },
                      })
                    }
                  />
                  <p className="text-[11px] text-slate-400 mt-1">
                    Batas kursi maksimal sebelum pendaftar dialihkan ke waiting list.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* ====================================================================
              STEP 3: TIM PENGAJAR
          ==================================================================== */}
          {currentStep === 3 && (() => {
            const selectedPrimaryEntry = formData.instructors.find(
              (i) => i.role === 'PRIMARY_INSTRUCTOR'
            );
            const selectedPrimaryId = isSuperadmin
              ? selectedPrimaryEntry?.instructorId || null
              : user?.id || null;
            const selectedPrimaryLecturer = isSuperadmin
              ? lecturers.find((l) => l.id === selectedPrimaryId) || null
              : null;
            const coInstructorEntries = formData.instructors.filter(
              (i) => i.role === 'CO_INSTRUCTOR'
            );

            const filteredPrimaryCandidates = lecturers.filter((lec) => {
              if (primaryProdi !== 'ALL' && lec.studyProgram !== primaryProdi) {
                return false;
              }
              if (primarySearch.trim()) {
                const q = primarySearch.trim().toLowerCase();
                const haystack = [
                  lec.fullName,
                  lec.email,
                  lec.identityNumber,
                  lec.nidn,
                  lec.nip,
                  lec.studyProgram,
                ]
                  .filter(Boolean)
                  .join(' ')
                  .toLowerCase();
                if (!haystack.includes(q)) return false;
              }
              return true;
            });

            const filteredCoCandidates = lecturers.filter((lec) => {
              if (lec.id === selectedPrimaryId) return false;
              if (coSearch.trim()) {
                const q = coSearch.trim().toLowerCase();
                const haystack = [
                  lec.fullName,
                  lec.email,
                  lec.identityNumber,
                  lec.nidn,
                  lec.nip,
                  lec.studyProgram,
                ]
                  .filter(Boolean)
                  .join(' ')
                  .toLowerCase();
                if (!haystack.includes(q)) return false;
              }
              return true;
            });

            return (
              <div className="space-y-5">
                <div className="border-b border-slate-100 pb-3">
                  <h3 className="text-base font-bold text-slate-900">
                    Langkah 3: Tim Dosen Pengampu & Asisten
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Tentukan dosen penanggung jawab utama dan dosen pendamping/asisten yang bertugas di kelas ini.
                  </p>
                </div>

                {/* Section 1: Creation Context */}
                <div
                  className={`p-3.5 rounded-xl border text-xs flex items-start gap-3 ${
                    isSuperadmin
                      ? 'bg-indigo-50/70 border-indigo-200 text-indigo-950'
                      : 'bg-slate-50 border-slate-200 text-slate-800'
                  }`}
                >
                  <UserCheck
                    className={`w-4 h-4 mt-0.5 shrink-0 ${
                      isSuperadmin ? 'text-indigo-600' : 'text-emerald-600'
                    }`}
                  />
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold uppercase tracking-wider text-[11px]">
                        Konteks Pembuatan Kelas:
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[11px] font-semibold border ${
                          isSuperadmin
                            ? 'bg-indigo-100 text-indigo-800 border-indigo-300'
                            : 'bg-emerald-100 text-emerald-800 border-emerald-300'
                        }`}
                      >
                        {isSuperadmin
                          ? 'Delegated Creation (Superadmin)'
                          : 'Self-Service (Dosen Pengampu)'}
                      </span>
                    </div>
                    <p className="text-slate-600 leading-relaxed">
                      {isSuperadmin ? (
                        <>
                          Anda membuat kelas atas nama dosen pengampu. Anda (
                          <span className="font-semibold text-slate-800">
                            {user?.fullName}
                          </span>
                          ) tercatat sebagai pembuat administratif, sedangkan dosen yang dipilih di bawah menjadi{' '}
                          <span className="font-semibold text-indigo-900">
                            Dosen Pengampu Utama & Pemilik Akademik
                          </span>
                          .
                        </>
                      ) : (
                        <>
                          Anda otomatis ditetapkan sebagai{' '}
                          <span className="font-semibold text-emerald-900">
                            Dosen Pengampu Utama
                          </span>{' '}
                          untuk kelas ini dan dapat menambahkan dosen pendamping secara opsional.
                        </>
                      )}
                    </p>
                  </div>
                </div>

                {/* Section 2: Primary Instructor */}
                {!isSuperadmin ? (
                  <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-3.5">
                    <div className="w-10 h-10 rounded-full bg-emerald-600 text-white flex items-center justify-center font-bold text-xs shrink-0 shadow-xs">
                      UTAMA
                    </div>
                    <div>
                      <p className="text-xs font-bold text-emerald-950 uppercase tracking-wider">
                        Dosen Pengampu Utama (Primary Instructor)
                      </p>
                      <p className="text-sm font-semibold text-emerald-900 mt-0.5">
                        {user?.fullName}
                      </p>
                      <p className="text-xs text-emerald-700">
                        {user?.identityNumber ? `NIDN/NIP: ${user.identityNumber}` : user?.email}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="border border-slate-200 rounded-xl p-4 space-y-3 bg-white">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                          Dosen Pengampu Utama <span className="text-red-500">*</span>
                        </p>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          Wajib pilih satu dosen aktif sebagai penanggung jawab akademik kelas.
                        </p>
                      </div>
                      {selectedPrimaryLecturer && (
                        <button
                          type="button"
                          onClick={() =>
                            setFormData((prev) => ({
                              ...prev,
                              instructors: prev.instructors.filter(
                                (i) => i.role !== 'PRIMARY_INSTRUCTOR'
                              ),
                            }))
                          }
                          className="text-xs font-semibold text-slate-500 hover:text-red-600 flex items-center gap-1 cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" /> Ganti / Hapus
                        </button>
                      )}
                    </div>

                    {selectedPrimaryLecturer ? (
                      <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-10 h-10 rounded-full bg-emerald-600 text-white flex items-center justify-center font-bold text-xs shrink-0">
                            UTAMA
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-emerald-950 truncate">
                              {selectedPrimaryLecturer.fullName}
                            </p>
                            <p className="text-xs text-emerald-800 truncate">
                              {selectedPrimaryLecturer.nidn ||
                              selectedPrimaryLecturer.identityNumber
                                ? `NIDN/NIP: ${
                                    selectedPrimaryLecturer.nidn ||
                                    selectedPrimaryLecturer.identityNumber
                                  }`
                                : selectedPrimaryLecturer.email}
                              {selectedPrimaryLecturer.studyProgram
                                ? ` • ${selectedPrimaryLecturer.studyProgram}`
                                : ''}
                            </p>
                          </div>
                        </div>
                        <span className="px-2.5 py-1 text-[11px] font-bold bg-emerald-600 text-white rounded-full shrink-0">
                          Terpilih
                        </span>
                      </div>
                    ) : (
                      <div className="space-y-2.5">
                        <div className="flex flex-col sm:flex-row gap-2">
                          <div className="relative flex-1">
                            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                            <input
                              type="text"
                              value={primarySearch}
                              onChange={(e) => setPrimarySearch(e.target.value)}
                              placeholder="Cari nama dosen, NIDN/NIP, atau email..."
                              className="w-full pl-8 pr-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                            />
                          </div>
                          {studyPrograms.length > 0 && (
                            <select
                              value={primaryProdi}
                              onChange={(e) => setPrimaryProdi(e.target.value)}
                              className="px-3 py-2 text-xs border border-slate-200 rounded-lg bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                            >
                              <option value="ALL">Semua Program Studi</option>
                              {studyPrograms.map((sp) => (
                                <option key={sp} value={sp}>
                                  {sp}
                                </option>
                              ))}
                            </select>
                          )}
                        </div>

                        {isLoadingLecturers ? (
                          <div className="text-xs text-slate-500 py-4 text-center">
                            Memuat daftar dosen aktif...
                          </div>
                        ) : filteredPrimaryCandidates.length === 0 ? (
                          <div className="text-xs text-slate-500 py-4 text-center border border-dashed border-slate-200 rounded-lg">
                            Tidak ada dosen aktif yang cocok dengan pencarian.
                          </div>
                        ) : (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-60 overflow-y-auto pr-1">
                            {filteredPrimaryCandidates.map((lec) => (
                              <button
                                key={lec.id}
                                type="button"
                                onClick={() => {
                                  setFormData((prev) => ({
                                    ...prev,
                                    instructors: [
                                      {
                                        instructorId: lec.id,
                                        role: 'PRIMARY_INSTRUCTOR',
                                        permissionScopes: ['all'],
                                      },
                                      ...prev.instructors.filter(
                                        (i) =>
                                          i.role !== 'PRIMARY_INSTRUCTOR' &&
                                          i.instructorId !== lec.id
                                      ),
                                    ],
                                  }));
                                }}
                                className="p-3 rounded-lg border border-slate-200 bg-white hover:border-emerald-400 hover:bg-emerald-50/50 text-left transition-all cursor-pointer"
                              >
                                <p className="text-xs font-semibold text-slate-900">
                                  {lec.fullName}
                                </p>
                                <p className="text-[11px] text-slate-500 mt-0.5 truncate">
                                  {lec.nidn || lec.identityNumber
                                    ? `NIDN: ${lec.nidn || lec.identityNumber}`
                                    : lec.email}
                                </p>
                                {lec.studyProgram && (
                                  <p className="text-[10px] text-slate-400 mt-0.5 truncate">
                                    {lec.studyProgram}
                                  </p>
                                )}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Section 3: Co-Instructors Selection */}
                <div className="border border-slate-200 rounded-xl p-4 space-y-3 bg-white">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                      Pilih Dosen Pendamping / Co-Instructor (Opsional)
                    </p>
                    <span className="text-xs font-medium text-slate-500">
                      {coInstructorEntries.length} dosen terpilih
                    </span>
                  </div>

                  {/* Selected Co-Instructor Chips */}
                  {coInstructorEntries.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {coInstructorEntries.map((entry) => {
                        const lec = lecturers.find((l) => l.id === entry.instructorId);
                        return (
                          <span
                            key={entry.instructorId}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-50 border border-blue-200 text-blue-900 text-xs font-medium"
                          >
                            {lec?.fullName || 'Dosen Pendamping'}
                            <button
                              type="button"
                              onClick={() =>
                                setFormData((prev) => ({
                                  ...prev,
                                  instructors: prev.instructors.filter(
                                    (i) => i.instructorId !== entry.instructorId
                                  ),
                                }))
                              }
                              className="text-blue-600 hover:text-red-600 cursor-pointer"
                              aria-label="Hapus dosen pendamping"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </span>
                        );
                      })}
                    </div>
                  )}

                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={coSearch}
                      onChange={(e) => setCoSearch(e.target.value)}
                      placeholder="Cari dosen pendamping berdasarkan nama atau NIDN..."
                      className="w-full pl-8 pr-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                    />
                  </div>

                  {filteredCoCandidates.length === 0 ? (
                    <div className="text-xs text-slate-400 py-3 text-center">
                      Tidak ada kandidat dosen pendamping lainnya.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-60 overflow-y-auto pr-1">
                      {filteredCoCandidates.map((lec) => {
                        const isAssigned = formData.instructors.some(
                          (i) => i.instructorId === lec.id && i.role === 'CO_INSTRUCTOR'
                        );
                        return (
                          <div
                            key={lec.id}
                            onClick={() => {
                              if (isAssigned) {
                                setFormData((prev) => ({
                                  ...prev,
                                  instructors: prev.instructors.filter(
                                    (i) => i.instructorId !== lec.id
                                  ),
                                }));
                              } else {
                                setFormData((prev) => ({
                                  ...prev,
                                  instructors: [
                                    ...prev.instructors,
                                    {
                                      instructorId: lec.id,
                                      role: 'CO_INSTRUCTOR',
                                      permissionScopes: [
                                        'grading',
                                        'materials',
                                        'announcements',
                                      ],
                                    },
                                  ],
                                }));
                              }
                            }}
                            className={`p-3 rounded-lg border text-xs cursor-pointer transition-all flex items-center justify-between ${
                              isAssigned
                                ? 'border-blue-500 bg-blue-50/80 text-blue-900 ring-1 ring-blue-500/20'
                                : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50/60'
                            }`}
                          >
                            <div className="min-w-0 pr-2">
                              <p className="font-semibold text-slate-900 truncate">
                                {lec.fullName}
                              </p>
                              <p className="text-slate-400 text-[11px] mt-0.5 truncate">
                                {lec.nidn || lec.identityNumber
                                  ? `NIDN: ${lec.nidn || lec.identityNumber}`
                                  : lec.email}
                              </p>
                            </div>
                            <input
                              type="checkbox"
                              readOnly
                              checked={isAssigned}
                              className="w-4 h-4 text-blue-600 rounded cursor-pointer shrink-0"
                            />
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            );
          })()}

          {/* ====================================================================
              STEP 4: ATURAN PENDAFTARAN
          ==================================================================== */}
          {currentStep === 4 && (
            <div className="space-y-5">
              <div className="border-b border-slate-100 pb-3">
                <h3 className="text-base font-bold text-slate-900">
                  Langkah 4: Aturan Pendaftaran & Waiting List
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Aturan mahasiswa bergabung ke ruang kelas, persetujuan dosen pengampu, dan kuota antrean cadangan.
                </p>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-2">
                  Moda Pendaftaran Mahasiswa <span className="text-red-500">*</span>
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {[
                    {
                      mode: 'AUTO',
                      title: 'Pendaftaran Otomatis',
                      desc: 'Mahasiswa langsung terdaftar aktif selama kuota kursi kelas masih tersedia.',
                    },
                    {
                      mode: 'APPROVAL_REQUIRED',
                      title: 'Persetujuan Dosen',
                      desc: 'Mahasiswa berstatus PENDING hingga diverifikasi dan disetujui dosen pengampu.',
                    },
                    {
                      mode: 'JOIN_CODE',
                      title: 'Kode Gabung Mandiri',
                      desc: 'Hanya mahasiswa dengan kode unik resmi yang dapat bergabung ke kelas.',
                    },
                  ].map((m) => (
                    <div
                      key={m.mode}
                      onClick={() =>
                        setFormData({
                          ...formData,
                          policy: {
                            ...formData.policy,
                            enrollmentMode: m.mode as any,
                          },
                        })
                      }
                      className={`p-3.5 rounded-xl border text-xs cursor-pointer transition-all ${
                        formData.policy.enrollmentMode === m.mode
                          ? 'border-blue-600 bg-blue-50 text-blue-900 ring-2 ring-blue-500/20 shadow-2xs'
                          : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      <p className="font-bold text-sm mb-1">{m.title}</p>
                      <p className="text-slate-500 leading-relaxed">{m.desc}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="border border-slate-200 rounded-xl p-4 space-y-3 bg-white">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                      Fitur Waiting List (Antrean Cadangan)
                    </h4>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Jika kuota {formData.maxCapacity} mahasiswa penuh, mahasiswa otomatis dimasukkan ke antrean cadangan.
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={formData.policy.waitingListEnabled}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        policy: {
                          ...formData.policy,
                          waitingListEnabled: e.target.checked,
                        },
                      })
                    }
                    className="w-4 h-4 text-blue-600 rounded cursor-pointer"
                  />
                </div>

                {formData.policy.waitingListEnabled && (
                  <div className="pt-3 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-semibold text-slate-700 block mb-1">
                        Maksimal Kuota Waiting List
                      </label>
                      <Input
                        type="number"
                        min={1}
                        value={formData.policy.maxWaitingList}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            policy: {
                              ...formData.policy,
                              maxWaitingList: parseInt(e.target.value, 10) || 15,
                            },
                          })
                        }
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-slate-700 block mb-1">
                        Maksimal Penggunaan Kode Gabung
                      </label>
                      <Input
                        type="number"
                        min={1}
                        value={formData.policy.joinCodeMaxUses}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            policy: {
                              ...formData.policy,
                              joinCodeMaxUses: parseInt(e.target.value, 10) || 50,
                            },
                          })
                        }
                      />
                    </div>
                  </div>
                )}
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Visibilitas Ruang Kelas
                </label>
                <select
                  value={
                    formData.visibility === 'CAMPUS_WIDE' || formData.visibility === 'PUBLIC'
                      ? 'PUBLIC'
                      : 'PRIVATE'
                  }
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      visibility: e.target.value as any,
                    })
                  }
                  className="w-full text-xs border border-slate-300 rounded-lg p-2.5 bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
                >
                  <option value="PUBLIC">
                    Publik — Terlihat oleh Seluruh Mahasiswa (Tetap membutuhkan kode undangan untuk bergabung)
                  </option>
                  <option value="PRIVATE">
                    Private — Akses Terbatas (Hanya mahasiswa terdaftar atau yang memiliki kode undangan)
                  </option>
                </select>
              </div>
            </div>
          )}

          {/* ====================================================================
              STEP 5: REVIEW & PUBLIKASI (NO SCHEDULE/LOCATION)
          ==================================================================== */}
          {currentStep === 5 && (
            <div className="space-y-6">
              <div className="border-b border-slate-100 pb-3 flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    Langkah 5: Review & Publikasi Ruang Kelas
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Periksa seluruh ringkasan konfigurasi sebelum menerbitkan ruang kelas digital resmi.
                  </p>
                </div>
              </div>

              {/* Review Section A: Identitas Kelas */}
              <div className="p-4 border border-slate-200 rounded-xl space-y-3 bg-white shadow-2xs">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wider flex items-center gap-1.5">
                    <Info className="w-4 h-4 text-blue-600" /> Bagian A: Identitas Ruang Kelas
                  </h4>
                  <button
                    type="button"
                    onClick={() => setCurrentStep(1)}
                    className="text-xs font-semibold text-blue-600 hover:text-blue-800 cursor-pointer"
                  >
                    Ubah
                  </button>
                </div>

                {formData.coverMetadata && (
                  <div className="aspect-16/9 max-w-sm rounded-lg overflow-hidden border border-slate-200 shadow-2xs">
                    <img
                      src={formData.coverMetadata.coverUrl}
                      alt="Cover Preview"
                      className="w-full h-full object-cover"
                    />
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="text-slate-400 block">Nama Ruang Kelas:</span>
                    <span className="font-bold text-slate-900 text-sm">{formData.name}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Kode Ruang Kelas:</span>
                    <span className="font-mono font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                      {formData.classroomCode || 'Otomatis'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Mata Kuliah:</span>
                    <span className="font-medium text-slate-800">
                      {formData.subjectName} {formData.subjectCode ? `(${formData.subjectCode})` : ''}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Seksi / Kelompok:</span>
                    <span className="font-medium text-slate-800">
                      {formData.section || 'Kelas A'}
                    </span>
                  </div>
                </div>

                {formData.cpmk && (
                  <div className="pt-2 border-t border-slate-100">
                    <span className="text-slate-400 block text-xs font-semibold mb-1">
                      Capaian Pembelajaran (CPMK):
                    </span>
                    <p className="text-xs text-slate-700 bg-slate-50 p-3 rounded-lg whitespace-pre-line leading-relaxed">
                      {formData.cpmk}
                    </p>
                  </div>
                )}

                {formData.description && (
                  <div className="pt-2 border-t border-slate-100">
                    <span className="text-slate-400 block text-xs font-semibold mb-1">
                      Deskripsi Tambahan:
                    </span>
                    <div
                      className="prose prose-xs max-w-none text-xs text-slate-700 bg-slate-50 p-3 rounded-lg"
                      dangerouslySetInnerHTML={{ __html: formData.description }}
                    />
                  </div>
                )}
              </div>

              {/* Review Section B: Konteks Akademik */}
              <div className="p-4 border border-slate-200 rounded-xl space-y-3 bg-white shadow-2xs">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wider flex items-center gap-1.5">
                    <GraduationCap className="w-4 h-4 text-emerald-600" /> Bagian B: Konteks Akademik
                  </h4>
                  <button
                    type="button"
                    onClick={() => setCurrentStep(2)}
                    className="text-xs font-semibold text-blue-600 hover:text-blue-800 cursor-pointer"
                  >
                    Ubah
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                  <div>
                    <span className="text-slate-400 block">Periode Semester:</span>
                    <span className="font-semibold text-slate-800">
                      {selectedPeriod?.name || 'Semester Aktif'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Tahun Akademik:</span>
                    <span className="font-semibold text-slate-800">
                      {formData.academicYear}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Tipe Kelas:</span>
                    <span className="font-semibold text-slate-800">
                      {formData.classroomType}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Angkatan / Cohort:</span>
                    <span className="font-semibold text-slate-800">
                      {formData.cohort}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Kapasitas Maksimal:</span>
                    <span className="font-semibold text-slate-800">
                      {formData.maxCapacity} Mahasiswa
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Kapasitas Minimum:</span>
                    <span className="font-semibold text-slate-800">
                      {formData.minCapacity} Mahasiswa
                    </span>
                  </div>
                </div>
              </div>

              {/* Review Section C: Tim Pengajar */}
              {(() => {
                const primaryEntry = formData.instructors.find(
                  (i) => i.role === 'PRIMARY_INSTRUCTOR'
                );
                const primaryLecturer = isSuperadmin
                  ? lecturers.find((l) => l.id === primaryEntry?.instructorId)
                  : null;
                const primaryDisplayName = isSuperadmin
                  ? primaryLecturer?.fullName || 'Belum dipilih'
                  : user?.fullName || 'Dosen Pengampu';
                const coEntries = formData.instructors.filter(
                  (i) => i.role === 'CO_INSTRUCTOR'
                );

                return (
                  <div className="p-4 border border-slate-200 rounded-xl space-y-3 bg-white shadow-2xs">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                      <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wider flex items-center gap-1.5">
                        <Users className="w-4 h-4 text-purple-600" /> Bagian C: Tim Pengajar
                      </h4>
                      <button
                        type="button"
                        onClick={() => setCurrentStep(3)}
                        className="text-xs font-semibold text-blue-600 hover:text-blue-800 cursor-pointer"
                      >
                        Ubah
                      </button>
                    </div>

                    <div className="space-y-2 text-xs">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                          Dosen Pengampu Utama
                        </span>
                        <span className="font-semibold text-slate-800">
                          {primaryDisplayName}
                        </span>
                        {isSuperadmin && (primaryLecturer?.nidn || primaryLecturer?.identityNumber) && (
                          <span className="text-slate-400">
                            (NIDN: {primaryLecturer.nidn || primaryLecturer.identityNumber})
                          </span>
                        )}
                      </div>

                      {coEntries.map((inst, idx) => {
                        const lec = lecturers.find((l) => l.id === inst.instructorId);
                        return (
                          <div key={idx} className="flex items-center gap-2">
                            <span className="font-medium text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                              Dosen Pendamping
                            </span>
                            <span className="text-slate-700">
                              {lec?.fullName || 'Dosen Pendamping'}
                            </span>
                          </div>
                        );
                      })}

                      {isSuperadmin && (
                        <div className="flex items-center gap-2 pt-1 border-t border-slate-100">
                          <span className="font-medium text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
                            Creator Administratif
                          </span>
                          <span className="text-slate-700">
                            {user?.fullName} (Superadmin)
                          </span>
                        </div>
                      )}

                      <p className="text-[11px] text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-2 mt-1">
                        {isSuperadmin
                          ? 'Kelas ini dibuat atas nama dosen pengampu utama (Delegated Creation). Superadmin tidak ditambahkan sebagai dosen pengampu.'
                          : 'Anda tercatat sebagai Pemilik Akademik & Dosen Pengampu Utama kelas ini.'}
                      </p>
                    </div>
                  </div>
                );
              })()}

              {/* Review Section D: Aturan Pendaftaran */}
              <div className="p-4 border border-slate-200 rounded-xl space-y-3 bg-white shadow-2xs">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wider flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-amber-600" /> Bagian D: Aturan Pendaftaran
                  </h4>
                  <button
                    type="button"
                    onClick={() => setCurrentStep(4)}
                    className="text-xs font-semibold text-blue-600 hover:text-blue-800 cursor-pointer"
                  >
                    Ubah
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                  <div>
                    <span className="text-slate-400 block">Moda Pendaftaran:</span>
                    <span className="font-bold text-slate-800">
                      {formData.policy.enrollmentMode === 'AUTO'
                        ? 'Otomatis'
                        : formData.policy.enrollmentMode === 'APPROVAL_REQUIRED'
                        ? 'Persetujuan Dosen'
                        : 'Kode Gabung'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Waiting List:</span>
                    <span className="font-medium text-slate-800">
                      {formData.policy.waitingListEnabled
                        ? `Aktif (${formData.policy.maxWaitingList} Kuota)`
                        : 'Nonaktif'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Visibilitas:</span>
                    <span className="font-medium text-slate-800">
                      {formData.visibility}
                    </span>
                  </div>
                </div>
              </div>

              {/* Publication Actions */}
              <div className="p-4 border border-blue-200 rounded-xl bg-blue-50/60 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-0.5">
                  <p className="text-xs font-bold text-blue-900">
                    Konfirmasi Penerbitan Ruang Kelas
                  </p>
                  <p className="text-xs text-blue-700">
                    Pilih untuk langsung menerbitkan kelas aktif ke mahasiswa atau menyimpannya sebagai draf terlebih dahulu.
                  </p>
                </div>

                <div className="flex items-center gap-2.5 shrink-0">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => handleSubmit('draft')}
                    disabled={createClassMutation.isPending}
                    className="text-xs cursor-pointer"
                  >
                    Simpan Draf
                  </Button>
                  <Button
                    type="button"
                    onClick={() => handleSubmit('active')}
                    disabled={createClassMutation.isPending}
                    className="bg-blue-600 hover:bg-blue-700 text-white text-xs flex items-center gap-1.5 cursor-pointer shadow-sm"
                  >
                    <Sparkles className="w-4 h-4" /> Terbitkan Ruang Kelas Sekarang
                  </Button>
                </div>
              </div>
            </div>
          )}
        </Card>

        {/* Wizard Bottom Navigation Buttons */}
        <div className="flex items-center justify-between pt-2">
          <Button
            type="button"
            variant="outline"
            disabled={currentStep === 1}
            onClick={() => setCurrentStep((prev) => Math.max(1, prev - 1))}
            className="flex items-center gap-1.5 cursor-pointer text-xs"
          >
            <ChevronLeft className="w-4 h-4" /> Sebelumnya
          </Button>

          {currentStep < 5 && (
            <Button
              type="button"
              onClick={handleNext}
              className="flex items-center gap-1.5 cursor-pointer text-xs bg-blue-600 hover:bg-blue-700 text-white"
            >
              Lanjutkan <ChevronRight className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>
      <ConfirmDialog {...deleteConfirm.dialogProps} />
    </AppShell>
  );
}
