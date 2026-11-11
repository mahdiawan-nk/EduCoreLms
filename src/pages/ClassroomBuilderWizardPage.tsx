import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  GraduationCap,
  Calendar,
  Users,
  Clock,
  ShieldCheck,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  Building,
  Plus,
  Trash2,
  Sparkles,
  Info,
} from 'lucide-react';
import { AppShell } from '../components/AppShell';
import { Button, Input, Textarea, Card } from '../components/ui/primitives';
import { apiRequest } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { toast } from 'sonner';

interface Course {
  id: string;
  code: string;
  title: string;
  credits: number;
  studyProgram: string;
}

interface AcademicPeriod {
  id: string;
  code: string;
  name: string;
  isDefault: boolean;
  status: string;
}

interface Building {
  id: string;
  code: string;
  name: string;
}

interface Room {
  id: string;
  buildingId: string;
  roomNumber: string;
  name: string;
  capacity: number;
}

interface LecturerUser {
  id: string;
  fullName: string;
  email: string;
  identityNumber: string;
}

const STEPS = [
  { id: 1, label: 'Info Akademik', icon: GraduationCap },
  { id: 2, label: 'Profil Kelas', icon: Info },
  { id: 3, label: 'Tim Pengajar', icon: Users },
  { id: 4, label: 'Jadwal & Ruang', icon: Clock },
  { id: 5, label: 'Aturan Pendaftaran', icon: ShieldCheck },
  { id: 6, label: 'Review & Publikasi', icon: CheckCircle2 },
];

export function ClassroomBuilderWizardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(1);

  // Form State
  const [formData, setFormData] = useState({
    // Step 1: Academic
    courseId: '',
    academicPeriodId: '',
    section: 'A',
    cohort: '2026',
    classroomType: 'REGULAR' as 'REGULAR' | 'PRACTICAL' | 'HYBRID' | 'SHORT_SEMESTER' | 'REMEDIAL',

    // Step 2: Classroom Profile
    name: '',
    classroomCode: '',
    minCapacity: 10,
    maxCapacity: 35,
    category: 'REGULAR',
    language: 'id',
    visibility: 'PUBLIC_ENROLLED' as 'PUBLIC_ENROLLED' | 'CAMPUS_WIDE' | 'PRIVATE_RESTRICTED',
    learningObjectives: '',
    description: '',

    // Step 3: Teaching Team
    instructors: [] as Array<{
      instructorId: string;
      role: 'PRIMARY_INSTRUCTOR' | 'CO_INSTRUCTOR' | 'TEACHING_ASSISTANT' | 'GUEST_INSTRUCTOR';
      permissionScopes: string[];
    }>,

    // Step 4: Schedules
    schedules: [] as Array<{
      dayOfWeek: number;
      startTime: string;
      endTime: string;
      scheduleType: 'THEORY' | 'PRACTICAL' | 'TUTORIAL' | 'SEMINAR' | 'EXAM';
      buildingId: string;
      roomId: string;
      meetingType: 'OFFLINE' | 'ONLINE' | 'HYBRID';
      onlineLink: string;
    }>,

    // Step 5: Enrollment Rules
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

    // Step 6: Publication
    lifecycleStatus: 'active' as 'draft' | 'active',
    submitForApproval: false,
  });

  // Schedule conflict detection warning state
  const [conflictWarning, setConflictWarning] = useState<string | null>(null);

  // Fetch Master Data
  const { data: courses = [] } = useQuery({
    queryKey: ['courses'],
    queryFn: async () => {
      const res = await apiRequest<Course[]>('/api/v1/courses');
      return res.data || [];
    },
  });

  const { data: defaultPeriod } = useQuery({
    queryKey: ['default-academic-period'],
    queryFn: async () => {
      const res = await apiRequest<AcademicPeriod>('/api/v1/academic-periods/default');
      return res.data;
    },
  });

  const { data: buildings = [] } = useQuery({
    queryKey: ['campus-buildings'],
    queryFn: async () => {
      const res = await apiRequest<Building[]>('/api/v1/campus/buildings');
      return res.data || [];
    },
  });

  const { data: rooms = [] } = useQuery({
    queryKey: ['campus-rooms'],
    queryFn: async () => {
      const res = await apiRequest<Room[]>('/api/v1/campus/rooms');
      return res.data || [];
    },
  });

  const { data: lecturers = [] } = useQuery({
    queryKey: ['lecturers-list'],
    queryFn: async () => {
      const res = await apiRequest<any[]>('/api/v1/users?role=DOSEN');
      return res.data || [];
    },
  });

  // Pre-fill default academic period and primary instructor
  useEffect(() => {
    if (defaultPeriod?.id && !formData.academicPeriodId) {
      setFormData((prev) => ({ ...prev, academicPeriodId: defaultPeriod.id }));
    }
  }, [defaultPeriod]);

  useEffect(() => {
    if (user?.id && formData.instructors.length === 0) {
      setFormData((prev) => ({
        ...prev,
        instructors: [
          {
            instructorId: user.id,
            role: 'PRIMARY_INSTRUCTOR',
            permissionScopes: ['all'],
          },
        ],
      }));
    }
  }, [user]);

  // When course changes, pre-fill classroom name
  const handleCourseSelect = (courseId: string) => {
    const c = courses.find((item) => item.id === courseId);
    setFormData((prev) => ({
      ...prev,
      courseId,
      name: c ? `${c.title} — Kelas ${prev.section}` : prev.name,
      classroomCode: c ? `PKM-${c.code.replace(/[^A-Z0-9]/gi, '')}-${prev.section}` : prev.classroomCode,
    }));
  };

  const handleSectionChange = (section: string) => {
    const c = courses.find((item) => item.id === formData.courseId);
    setFormData((prev) => ({
      ...prev,
      section,
      name: c ? `${c.title} — Kelas ${section}` : prev.name,
      classroomCode: c ? `PKM-${c.code.replace(/[^A-Z0-9]/gi, '')}-${section}` : prev.classroomCode,
    }));
  };

  // Add schedule handler
  const handleAddSchedule = () => {
    setFormData((prev) => ({
      ...prev,
      schedules: [
        ...prev.schedules,
        {
          dayOfWeek: 1,
          startTime: '08:00',
          endTime: '10:30',
          scheduleType: 'THEORY',
          buildingId: buildings[0]?.id || '',
          roomId: rooms[0]?.id || '',
          meetingType: 'OFFLINE',
          onlineLink: '',
        },
      ],
    }));
  };

  const handleRemoveSchedule = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      schedules: prev.schedules.filter((_, idx) => idx !== index),
    }));
  };

  // Check schedule conflict
  const checkScheduleConflict = async (schedule: typeof formData.schedules[0]) => {
    try {
      const res = await apiRequest<{ hasConflict: boolean; conflicts: any[] }>('/api/v1/schedules/conflicts', {
        method: 'POST',
        body: JSON.stringify({
          dayOfWeek: schedule.dayOfWeek,
          startTime: schedule.startTime,
          endTime: schedule.endTime,
          instructorId: user?.id,
          roomId: schedule.roomId || null,
        }),
      });

      if (res.data?.hasConflict && res.data.conflicts.length > 0) {
        setConflictWarning(res.data.conflicts[0].message);
        toast.warning(res.data.conflicts[0].message);
      } else {
        setConflictWarning(null);
      }
    } catch {
      // Non-blocking
    }
  };

  // Mutation to submit classroom builder
  const createClassMutation = useMutation({
    mutationFn: async (payload: typeof formData) => {
      return apiRequest('/api/v1/classrooms/builder', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    },
    onSuccess: (res: any) => {
      toast.success('Ruang Kelas Akademik berhasil diterbitkan!');
      navigate(`/classrooms/${res.data.id}`);
    },
    onError: (err: any) => {
      toast.error(err.message || 'Gagal menerbitkan ruang kelas.');
    },
  });

  const handleSubmit = (status: 'draft' | 'active', approval = false) => {
    if (!formData.courseId) {
      toast.error('Silakan pilih Mata Kuliah master terlebih dahulu.');
      setCurrentStep(1);
      return;
    }
    if (!formData.name) {
      toast.error('Silakan isi Nama Kelas.');
      setCurrentStep(2);
      return;
    }

    createClassMutation.mutate({
      ...formData,
      lifecycleStatus: status,
      submitForApproval: approval,
    });
  };

  const selectedCourse = courses.find((c) => c.id === formData.courseId);

  return (
    <AppShell>
      <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
        {/* Header */}
        <div className="border-b border-slate-200 pb-5">
          <div className="flex items-center gap-2 text-xs font-semibold text-blue-600 mb-1">
            <span>Politeknik Kampar</span>
            <span>•</span>
            <span>Academic Classroom Builder</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900">
            Wizard Pembuatan Ruang Kelas Digital Terpadu
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Konfigurasi lengkap 6-langkah: Master kurikulum, tim dosen pengampu, jadwal terintegrasi, dan kebijakan kuota KRS.
          </p>
        </div>

        {/* Stepper Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
          {STEPS.map((s) => {
            const Icon = s.icon;
            const isActive = currentStep === s.id;
            const isCompleted = currentStep > s.id;

            return (
              <button
                key={s.id}
                onClick={() => setCurrentStep(s.id)}
                className={`p-3 rounded-lg border text-left transition-all flex flex-col justify-between ${
                  isActive
                    ? 'border-blue-600 bg-blue-50 text-blue-900 ring-2 ring-blue-500/20'
                    : isCompleted
                    ? 'border-emerald-300 bg-emerald-50/50 text-emerald-900'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold px-1.5 py-0.5 rounded bg-white border border-slate-200">
                    0{s.id}
                  </span>
                  <Icon className={`w-4 h-4 ${isActive ? 'text-blue-600' : isCompleted ? 'text-emerald-600' : 'text-slate-400'}`} />
                </div>
                <span className="text-xs font-semibold leading-tight">{s.label}</span>
              </button>
            );
          })}
        </div>

        {/* STEP CONTENT CONTAINER */}
        <Card className="p-6 border border-slate-200 shadow-sm min-h-[420px]">
          {/* STEP 1: Academic Info */}
          {currentStep === 1 && (
            <div className="space-y-4">
              <div className="border-b border-slate-100 pb-3">
                <h3 className="text-base font-bold text-slate-900">Langkah 1: Informasi Akademik & Master Kurikulum</h3>
                <p className="text-xs text-slate-500">Pilih mata kuliah dari kurikulum resmi dan periode semester aktif.</p>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Pilih Mata Kuliah Master *
                </label>
                <select
                  value={formData.courseId}
                  onChange={(e) => handleCourseSelect(e.target.value)}
                  className="w-full text-sm border border-slate-300 rounded-lg p-2.5 bg-white"
                >
                  <option value="">-- Pilih Mata Kuliah --</option>
                  {courses.map((c) => (
                    <option key={c.id} value={c.id}>
                      [{c.code}] {c.title} ({c.credits} SKS) — {c.studyProgram}
                    </option>
                  ))}
                </select>
              </div>

              {selectedCourse && (
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs space-y-1">
                  <p className="font-bold text-blue-900">{selectedCourse.title} ({selectedCourse.code})</p>
                  <p className="text-blue-700">Program Studi: {selectedCourse.studyProgram} • Bobot: {selectedCourse.credits} SKS</p>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">Periode Akademik</label>
                  <Input
                    disabled
                    value={defaultPeriod ? `${defaultPeriod.name} (${defaultPeriod.code})` : 'Semester Aktif'}
                    className="bg-slate-50 text-slate-500"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">Seksi / Paralel Kelas</label>
                  <Input
                    placeholder="A, B, C, atau TI-2A"
                    value={formData.section}
                    onChange={(e) => handleSectionChange(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">Angkatan / Cohort</label>
                  <Input
                    value={formData.cohort}
                    onChange={(e) => setFormData({ ...formData, cohort: e.target.value })}
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Tipe Ruang Kelas</label>
                <select
                  value={formData.classroomType}
                  onChange={(e) => setFormData({ ...formData, classroomType: e.target.value as any })}
                  className="w-full text-sm border border-slate-300 rounded-lg p-2.5 bg-white"
                >
                  <option value="REGULAR">Kelas Reguler Teori & Praktik</option>
                  <option value="PRACTICAL">Kelas Khusus Praktikum Laboratorium</option>
                  <option value="HYBRID">Kelas Pembelajaran Campuran (Hybrid / Blended)</option>
                  <option value="SHORT_SEMESTER">Kelas Semester Antara / Pendek</option>
                  <option value="REMEDIAL">Kelas Pengayaan / Remedial</option>
                </select>
              </div>
            </div>
          )}

          {/* STEP 2: Classroom Profile */}
          {currentStep === 2 && (
            <div className="space-y-4">
              <div className="border-b border-slate-100 pb-3">
                <h3 className="text-base font-bold text-slate-900">Langkah 2: Profil & Identitas Ruang Kelas</h3>
                <p className="text-xs text-slate-500">Nama kelas, kode kelas unik, dan deskripsi silabus pembelajaran.</p>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Nama Lengkap Kelas *</label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Contoh: Pemrograman Web Lanjut — Kelas A"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">Kode Unik Kelas</label>
                  <Input
                    value={formData.classroomCode}
                    onChange={(e) => setFormData({ ...formData, classroomCode: e.target.value })}
                    placeholder="PKM-RPL-A"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">Kapasitas Minimum</label>
                  <Input
                    type="number"
                    value={formData.minCapacity}
                    onChange={(e) => setFormData({ ...formData, minCapacity: parseInt(e.target.value, 10) || 5 })}
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">Kapasitas Maksimum *</label>
                  <Input
                    type="number"
                    value={formData.maxCapacity}
                    onChange={(e) => setFormData({ ...formData, maxCapacity: parseInt(e.target.value, 10) || 35 })}
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Capaian Pembelajaran Mata Kuliah (CPMK) / Silabus</label>
                <Textarea
                  placeholder="Deskripsikan kompetensi utama yang akan dicapai mahasiswa setelah menyelesaikan kelas ini..."
                  value={formData.learningObjectives}
                  onChange={(e) => setFormData({ ...formData, learningObjectives: e.target.value })}
                  className="min-h-[90px]"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Deskripsi Tambahan</label>
                <Textarea
                  placeholder="Petunjuk perkuliahan, buku rujukan, atau pengantar kelas..."
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="min-h-[70px]"
                />
              </div>
            </div>
          )}

          {/* STEP 3: Teaching Team */}
          {currentStep === 3 && (
            <div className="space-y-4">
              <div className="border-b border-slate-100 pb-3">
                <h3 className="text-base font-bold text-slate-900">Langkah 3: Tim Dosen Pengampu & Asisten Praktikum</h3>
                <p className="text-xs text-slate-500">Tentukan dosen penanggung jawab utama dan tim pengajar.</p>
              </div>

              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-emerald-600 text-white flex items-center justify-center font-bold text-xs shrink-0">
                  UTAMA
                </div>
                <div>
                  <p className="text-xs font-bold text-emerald-950">Dosen Pengampu Utama (Primary Instructor):</p>
                  <p className="text-xs text-emerald-800">{user?.fullName} ({user?.identityNumber || user?.email})</p>
                </div>
              </div>

              <div className="border border-slate-200 rounded-lg p-3 space-y-3">
                <p className="text-xs font-semibold text-slate-700">Dosen Pendamping / Co-Instructor (Opsional):</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {lecturers
                    .filter((l) => l.id !== user?.id)
                    .map((lec) => {
                      const isAssigned = formData.instructors.some((i) => i.instructorId === lec.id);
                      return (
                        <div
                          key={lec.id}
                          onClick={() => {
                            if (isAssigned) {
                              setFormData({
                                ...formData,
                                instructors: formData.instructors.filter((i) => i.instructorId !== lec.id),
                              });
                            } else {
                              setFormData({
                                ...formData,
                                instructors: [
                                  ...formData.instructors,
                                  {
                                    instructorId: lec.id,
                                    role: 'CO_INSTRUCTOR',
                                    permissionScopes: ['grading', 'materials', 'announcements'],
                                  },
                                ],
                              });
                            }
                          }}
                          className={`p-2.5 rounded border text-xs cursor-pointer transition-colors flex items-center justify-between ${
                            isAssigned
                              ? 'border-blue-500 bg-blue-50 text-blue-900 font-medium'
                              : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          <div>
                            <p className="font-semibold">{lec.fullName}</p>
                            <p className="text-slate-400 text-[11px]">{lec.identityNumber || lec.email}</p>
                          </div>
                          <input type="checkbox" readOnly checked={isAssigned} />
                        </div>
                      );
                    })}
                </div>
              </div>
            </div>
          )}

          {/* STEP 4: Class Schedules & Facilities */}
          {currentStep === 4 && (
            <div className="space-y-4">
              <div className="border-b border-slate-100 pb-3 flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-slate-900">Langkah 4: Jadwal Perkuliahan & Fasilitas Kampus</h3>
                  <p className="text-xs text-slate-500">Alokasikan gedung, ruang kelas, dan deteksi bentrok jadwal otomatis.</p>
                </div>
                <Button size="sm" onClick={handleAddSchedule} className="flex items-center gap-1.5">
                  <Plus className="w-3.5 h-3.5" /> Tambah Sesi Jadwal
                </Button>
              </div>

              {conflictWarning && (
                <div className="p-3 bg-amber-50 border border-amber-300 rounded-lg flex items-start gap-2.5 text-xs text-amber-900">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold">Peringatan Bentrok Jadwal Terdeteksi:</span>
                    <p className="mt-0.5">{conflictWarning}</p>
                  </div>
                </div>
              )}

              {formData.schedules.length === 0 ? (
                <div className="p-8 border border-dashed border-slate-200 rounded-lg text-center text-xs text-slate-500">
                  Belum ada jadwal perkuliahan teralokasi. Klik tombol "Tambah Sesi Jadwal" di atas.
                </div>
              ) : (
                <div className="space-y-3">
                  {formData.schedules.map((sched, idx) => (
                    <div key={idx} className="p-4 border border-slate-200 rounded-lg bg-slate-50/50 space-y-3">
                      <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                        <span className="text-xs font-bold text-slate-800">Sesi Jadwal #{idx + 1}</span>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleRemoveSchedule(idx)}
                          className="text-red-600 hover:bg-red-50 text-xs h-7 px-2"
                        >
                          <Trash2 className="w-3.5 h-3.5 mr-1" /> Hapus
                        </Button>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        <div>
                          <label className="text-[11px] font-semibold text-slate-600 block mb-1">Hari</label>
                          <select
                            value={sched.dayOfWeek}
                            onChange={(e) => {
                              const updated = [...formData.schedules];
                              updated[idx].dayOfWeek = parseInt(e.target.value, 10);
                              setFormData({ ...formData, schedules: updated });
                              checkScheduleConflict(updated[idx]);
                            }}
                            className="w-full text-xs border border-slate-300 rounded p-1.5 bg-white"
                          >
                            <option value={1}>Senin</option>
                            <option value={2}>Selasa</option>
                            <option value={3}>Rabu</option>
                            <option value={4}>Kamis</option>
                            <option value={5}>Jumat</option>
                            <option value={6}>Sabtu</option>
                          </select>
                        </div>

                        <div>
                          <label className="text-[11px] font-semibold text-slate-600 block mb-1">Jam Mulai</label>
                          <Input
                            type="time"
                            value={sched.startTime}
                            onChange={(e) => {
                              const updated = [...formData.schedules];
                              updated[idx].startTime = e.target.value;
                              setFormData({ ...formData, schedules: updated });
                              checkScheduleConflict(updated[idx]);
                            }}
                            className="h-8 text-xs"
                          />
                        </div>

                        <div>
                          <label className="text-[11px] font-semibold text-slate-600 block mb-1">Jam Selesai</label>
                          <Input
                            type="time"
                            value={sched.endTime}
                            onChange={(e) => {
                              const updated = [...formData.schedules];
                              updated[idx].endTime = e.target.value;
                              setFormData({ ...formData, schedules: updated });
                              checkScheduleConflict(updated[idx]);
                            }}
                            className="h-8 text-xs"
                          />
                        </div>

                        <div>
                          <label className="text-[11px] font-semibold text-slate-600 block mb-1">Tipe Sesi</label>
                          <select
                            value={sched.scheduleType}
                            onChange={(e) => {
                              const updated = [...formData.schedules];
                              updated[idx].scheduleType = e.target.value as any;
                              setFormData({ ...formData, schedules: updated });
                            }}
                            className="w-full text-xs border border-slate-300 rounded p-1.5 bg-white"
                          >
                            <option value="THEORY">Teori (Tatap Muka)</option>
                            <option value="PRACTICAL">Praktikum Mandiri/Lab</option>
                            <option value="TUTORIAL">Tutorial / Responsi</option>
                          </select>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <div>
                          <label className="text-[11px] font-semibold text-slate-600 block mb-1">Gedung Kampus</label>
                          <select
                            value={sched.buildingId}
                            onChange={(e) => {
                              const updated = [...formData.schedules];
                              updated[idx].buildingId = e.target.value;
                              setFormData({ ...formData, schedules: updated });
                            }}
                            className="w-full text-xs border border-slate-300 rounded p-1.5 bg-white"
                          >
                            <option value="">Pilih Gedung</option>
                            {buildings.map((b) => (
                              <option key={b.id} value={b.id}>{b.name} ({b.code})</option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="text-[11px] font-semibold text-slate-600 block mb-1">Ruangan Kampus</label>
                          <select
                            value={sched.roomId}
                            onChange={(e) => {
                              const updated = [...formData.schedules];
                              updated[idx].roomId = e.target.value;
                              setFormData({ ...formData, schedules: updated });
                              checkScheduleConflict(updated[idx]);
                            }}
                            className="w-full text-xs border border-slate-300 rounded p-1.5 bg-white"
                          >
                            <option value="">Pilih Ruangan</option>
                            {rooms
                              .filter((r) => !sched.buildingId || r.buildingId === sched.buildingId)
                              .map((r) => (
                                <option key={r.id} value={r.id}>
                                  {r.roomNumber} — {r.name} (Kapasitas: {r.capacity})
                                </option>
                              ))}
                          </select>
                        </div>

                        <div>
                          <label className="text-[11px] font-semibold text-slate-600 block mb-1">Moda Pertemuan</label>
                          <select
                            value={sched.meetingType}
                            onChange={(e) => {
                              const updated = [...formData.schedules];
                              updated[idx].meetingType = e.target.value as any;
                              setFormData({ ...formData, schedules: updated });
                            }}
                            className="w-full text-xs border border-slate-300 rounded p-1.5 bg-white"
                          >
                            <option value="OFFLINE">Tatap Muka Fisik (Offline)</option>
                            <option value="ONLINE">Pembelajaran Daring (Online)</option>
                            <option value="HYBRID">Gabungan (Hybrid)</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* STEP 5: Enrollment Rules */}
          {currentStep === 5 && (
            <div className="space-y-4">
              <div className="border-b border-slate-100 pb-3">
                <h3 className="text-base font-bold text-slate-900">Langkah 5: Kebijakan Pendaftaran & Waiting List</h3>
                <p className="text-xs text-slate-500">Aturan pendaftaran mahasiswa mandiri, persetujuan dosen, dan kuota antrean.</p>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Moda Pendaftaran Mahasiswa *</label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {[
                    {
                      mode: 'AUTO',
                      title: 'Pendaftaran Otomatis',
                      desc: 'Mahasiswa dapat langsung terdaftar aktif selama kuota kelas masih tersedia.',
                    },
                    {
                      mode: 'APPROVAL_REQUIRED',
                      title: 'Persetujuan Dosen',
                      desc: 'Mahasiswa berstatus PENDING hingga diverifikasi dan disetujui dosen pengampu.',
                    },
                    {
                      mode: 'JOIN_CODE',
                      title: 'Kode Gabung Tertutup',
                      desc: 'Hanya mahasiswa dengan kode 6-karakter yang dapat bergabung ke dalam kelas.',
                    },
                  ].map((m) => (
                    <div
                      key={m.mode}
                      onClick={() =>
                        setFormData({
                          ...formData,
                          policy: { ...formData.policy, enrollmentMode: m.mode as any },
                        })
                      }
                      className={`p-3 rounded-lg border text-xs cursor-pointer transition-all ${
                        formData.policy.enrollmentMode === m.mode
                          ? 'border-blue-600 bg-blue-50 text-blue-900 ring-2 ring-blue-500/20'
                          : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                      }`}
                    >
                      <p className="font-bold text-sm mb-1">{m.title}</p>
                      <p className="text-slate-500">{m.desc}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="border border-slate-200 rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-bold text-slate-900">Fitur Waiting List (Antrean Cadangan)</h4>
                    <p className="text-xs text-slate-500">
                      Jika kuota {formData.maxCapacity} kursi penuh, mahasiswa otomatis masuk antrean waiting list.
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={formData.policy.waitingListEnabled}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        policy: { ...formData.policy, waitingListEnabled: e.target.checked },
                      })
                    }
                    className="w-4 h-4 text-blue-600"
                  />
                </div>

                {formData.policy.waitingListEnabled && (
                  <div className="pt-2 border-t border-slate-200 grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-semibold text-slate-700 block mb-1">Maksimal Kuota Waiting List</label>
                      <Input
                        type="number"
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
                      <label className="text-xs font-semibold text-slate-700 block mb-1">Maksimal Penggunaan Kode Gabung</label>
                      <Input
                        type="number"
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
            </div>
          )}

          {/* STEP 6: Review & Finalize */}
          {currentStep === 6 && (
            <div className="space-y-4">
              <div className="border-b border-slate-100 pb-3">
                <h3 className="text-base font-bold text-slate-900">Langkah 6: Review & Publikasi Ruang Kelas</h3>
                <p className="text-xs text-slate-500">Periksa seluruh konfigurasi sebelum menerbitkan kelas digital.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 border border-slate-200 rounded-lg space-y-2 bg-slate-50/50 text-xs">
                  <h4 className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
                    <GraduationCap className="w-4 h-4 text-blue-600" /> Ringkasan Akademik
                  </h4>
                  <p><span className="text-slate-400">Mata Kuliah:</span> {selectedCourse?.title} ({selectedCourse?.code})</p>
                  <p><span className="text-slate-400">Nama Kelas:</span> {formData.name}</p>
                  <p><span className="text-slate-400">Kode Unik:</span> {formData.classroomCode || 'Otomatis'}</p>
                  <p><span className="text-slate-400">Seksi / Cohort:</span> Kelas {formData.section} (Angkatan {formData.cohort})</p>
                  <p><span className="text-slate-400">Tipe Kelas:</span> {formData.classroomType}</p>
                </div>

                <div className="p-4 border border-slate-200 rounded-lg space-y-2 bg-slate-50/50 text-xs">
                  <h4 className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
                    <Clock className="w-4 h-4 text-emerald-600" /> Jadwal & Kapasitas
                  </h4>
                  <p><span className="text-slate-400">Kapasitas Maksimal:</span> {formData.maxCapacity} Mahasiswa</p>
                  <p><span className="text-slate-400">Moda Pendaftaran:</span> {formData.policy.enrollmentMode}</p>
                  <p><span className="text-slate-400">Waiting List:</span> {formData.policy.waitingListEnabled ? `Aktif (${formData.policy.maxWaitingList} kuota)` : 'Nonaktif'}</p>
                  <p><span className="text-slate-400">Alokasi Sesi:</span> {formData.schedules.length} Sesi Terjadwal</p>
                </div>
              </div>

              <div className="p-4 border border-slate-200 rounded-lg bg-blue-50/50 space-y-2 text-xs text-blue-900">
                <p className="font-bold">Opsi Penerbitan Kelas:</p>
                <p className="text-blue-700">
                  Anda dapat langsung menerbitkan ruang kelas ke status <b>ACTIVE</b> agar dapat dilihat oleh mahasiswa pada katalog pendaftaran, atau menyimpannya sebagai <b>DRAFT</b>.
                </p>
              </div>

              <div className="flex flex-wrap items-center justify-end gap-3 pt-4 border-t border-slate-200">
                <Button
                  variant="outline"
                  onClick={() => handleSubmit('draft')}
                  disabled={createClassMutation.isPending}
                >
                  Simpan sebagai Draft
                </Button>
                <Button
                  onClick={() => handleSubmit('active')}
                  disabled={createClassMutation.isPending}
                  className="bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-2"
                >
                  <Sparkles className="w-4 h-4" /> Terbitkan Ruang Kelas Sekarang
                </Button>
              </div>
            </div>
          )}
        </Card>

        {/* Navigation Buttons */}
        <div className="flex items-center justify-between pt-2">
          <Button
            variant="outline"
            disabled={currentStep === 1}
            onClick={() => setCurrentStep((prev) => Math.max(1, prev - 1))}
            className="flex items-center gap-1.5"
          >
            <ChevronLeft className="w-4 h-4" /> Sebelumnya
          </Button>

          {currentStep < 6 ? (
            <Button
              onClick={() => setCurrentStep((prev) => Math.min(6, prev + 1))}
              className="flex items-center gap-1.5"
            >
              Lanjutkan <ChevronRight className="w-4 h-4" />
            </Button>
          ) : null}
        </div>
      </div>
    </AppShell>
  );
}
