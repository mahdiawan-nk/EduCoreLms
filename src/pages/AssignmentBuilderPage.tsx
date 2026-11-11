import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Save,
  Send,
  Calendar,
  Eye,
  Edit3,
  Upload,
  FileText,
  Trash2,
  Plus,
  CheckCircle2,
  AlertCircle,
  Clock,
  Sliders,
  Award,
  Download,
} from 'lucide-react';
import { toast } from 'sonner';
import { apiFetch } from '../lib/api';
import { uploadAssignmentAttachmentToS3 } from '../lib/s3Upload';
import {
  TiptapMaterialEditor,
  TiptapReadOnlyRenderer,
} from '../components/TiptapMaterialEditor';
import { DocumentPreviewModal } from '../components/DocumentPreviewModal';
import { Button, Input, Textarea } from '../components/ui/primitives';

const ALL_EXTENSION_OPTIONS = [
  'pdf',
  'doc',
  'docx',
  'xls',
  'xlsx',
  'ppt',
  'pptx',
  'jpg',
  'jpeg',
  'png',
  'webp',
];

const ASSIGNMENT_TYPES = [
  { value: 'Individual', label: 'Individu (Individual)' },
  { value: 'Group', label: 'Kelompok (Group)' },
  { value: 'Practical', label: 'Praktikum Laboratorium (Practical)' },
  { value: 'Project', label: 'Proyek Rekayasa (Project)' },
  { value: 'Report', label: 'Laporan Teknis (Report)' },
  { value: 'Essay', label: 'Esai Analitis (Essay)' },
  { value: 'Portfolio', label: 'Portofolio Karya (Portfolio)' },
];

export interface RubricCriterionForm {
  id?: string;
  criterionName: string;
  description: string;
  maxScore: number;
  weight: number;
}

export function AssignmentBuilderPage() {
  const { classroomId, assignmentId } = useParams<{
    classroomId: string;
    assignmentId?: string;
  }>();
  const [searchParams] = useSearchParams();
  const initialTopicId = searchParams.get('topicId') || '';
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isEditing = Boolean(assignmentId);

  const [activeMode, setActiveMode] = useState<'EDIT' | 'PREVIEW'>('EDIT');
  const [currentAssignmentId, setCurrentAssignmentId] = useState<string | null>(
    assignmentId || null
  );

  // Section A: General Information
  const [selectedClassroomId, setSelectedClassroomId] = useState(
    classroomId || ''
  );
  const [topicId, setTopicId] = useState(initialTopicId);
  const [meetingNumber, setMeetingNumber] = useState(1);
  const [sequenceOrder, setSequenceOrder] = useState(1);
  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [shortDescription, setShortDescription] = useState('');
  const [assignmentType, setAssignmentType] = useState('Practical');
  const [learningObjectives, setLearningObjectives] = useState('');
  const [maxPoints, setMaxPoints] = useState(100);
  const [estimatedCompletionMinutes, setEstimatedCompletionMinutes] =
    useState(120);

  // Section B: Tiptap Rich Instruction Editor
  const [instructionsJson, setInstructionsJson] = useState<Record<string, any>>({
    type: 'doc',
    content: [
      {
        type: 'heading',
        attrs: { level: 2 },
        content: [{ type: 'text', text: 'Instruksi Pengerjaan Tugas' }],
      },
      {
        type: 'paragraph',
        content: [
          {
            type: 'text',
            text: 'Tuliskan langkah pengerjaan praktikum, spesifikasi laporan, dan standar pengumpulan berkas di sini.',
          },
        ],
      },
    ],
  });
  const [instructionsHtml, setInstructionsHtml] = useState('');
  const [instructionsText, setInstructionsText] = useState('');

  // Section C: Instructor S3 Attachments
  const [attachments, setAttachments] = useState<any[]>([]);
  const [uploadingFileName, setUploadingFileName] = useState<string | null>(
    null
  );
  const [uploadProgress, setUploadProgress] = useState(0);
  const [previewTarget, setPreviewTarget] = useState<any | null>(null);

  // Section D: Submission Configuration
  const [allowFileUpload, setAllowFileUpload] = useState(true);
  const [allowTextResponse, setAllowTextResponse] = useState(true);
  const [allowExternalLinks, setAllowExternalLinks] = useState(true);
  const [allowedExtensions, setAllowedExtensions] = useState<string[]>(
    ALL_EXTENSION_OPTIONS
  );
  const [maxFileSizeMb, setMaxFileSizeMb] = useState(25);
  const [maxFiles, setMaxFiles] = useState(5);
  const [maxLinks, setMaxLinks] = useState(5);
  const [requireAttachment, setRequireAttachment] = useState(false);
  const [requireLink, setRequireLink] = useState(false);
  const [allowMultipleVersions, setAllowMultipleVersions] = useState(true);
  const [maxRevisions, setMaxRevisions] = useState(5);
  const [allowLateSubmission, setAllowLateSubmission] = useState(true);
  const [gracePeriodMinutes, setGracePeriodMinutes] = useState(15);
  const [allowAfterDeadline, setAllowAfterDeadline] = useState(true);
  const [allowEditBeforeDeadline, setAllowEditBeforeDeadline] = useState(true);
  const [allowReturnForRevision, setAllowReturnForRevision] = useState(true);
  const [gradingMethod, setGradingMethod] = useState<
    'DIRECT' | 'RUBRIC' | 'COMBINED'
  >('COMBINED');

  // Section E: Rubric Builder
  const [useRubric, setUseRubric] = useState(true);
  const [rubricTitle, setRubricTitle] = useState(
    'Rubrik Evaluasi Kompetensi Praktikum'
  );
  const [rubricDescription, setRubricDescription] = useState(
    'Penilaian terstruktur berbasis indikator capaian pembelajaran Politeknik Kampar.'
  );
  const [criteria, setCriteria] = useState<RubricCriterionForm[]>([
    {
      criterionName: 'Ketepatan Implementasi & Arsitektur Teknis',
      description: 'Kesesuaian kode dan skema database terhadap spesifikasi.',
      maxScore: 100,
      weight: 40,
    },
    {
      criterionName: 'Validasi Keamanan & Penanganan Kasus Uji',
      description: 'Kelengkapan validasi input dan bukti pengujian.',
      maxScore: 100,
      weight: 35,
    },
    {
      criterionName: 'Kualitas Dokumentasi Laporan Praktikum',
      description: 'Sistematika penulisan laporan dan kejelasan analisis.',
      maxScore: 100,
      weight: 25,
    },
  ]);

  // Section F: Scheduling & Publication
  const [status, setStatus] = useState<
    'DRAFT' | 'SCHEDULED' | 'PUBLISHED' | 'ARCHIVED'
  >('PUBLISHED');
  const [dueAt, setDueAt] = useState(() => {
    const d = new Date(Date.now() + 7 * 86400_000);
    return d.toISOString().slice(0, 16);
  });
  const [scheduledAt, setScheduledAt] = useState('');
  const [availableFrom, setAvailableFrom] = useState('');
  const [availableUntil, setAvailableUntil] = useState('');
  const [timezone, setTimezone] = useState('Asia/Jakarta');
  const [lateSubmissionPolicy, setLateSubmissionPolicy] = useState(
    'ACCEPT_WITH_LATE_FLAG'
  );
  const [gradePublicationPolicy, setGradePublicationPolicy] =
    useState('MANUAL_PUBLISH');

  // Load instructor classrooms
  const classroomsQuery = useQuery({
    queryKey: ['instructor-classrooms'],
    queryFn: () => apiFetch<any[]>('/api/v1/classrooms?scope=mine'),
  });

  // Load topics for selected classroom
  const topicsQuery = useQuery({
    queryKey: ['classroom-topics', selectedClassroomId],
    queryFn: () =>
      apiFetch<any[]>(`/api/v1/classrooms/${selectedClassroomId}/topics`),
    enabled: Boolean(selectedClassroomId),
  });

  // Load existing assignment if editing
  const assignmentDetailQuery = useQuery({
    queryKey: ['assignment-detail', currentAssignmentId],
    queryFn: () => apiFetch<any>(`/api/v1/assignments/${currentAssignmentId}`),
    enabled: Boolean(currentAssignmentId),
  });

  useEffect(() => {
    const d = assignmentDetailQuery.data;
    if (!d) return;
    setSelectedClassroomId(d.classroomId);
    setTopicId(d.topicId || '');
    setMeetingNumber(d.meetingNumber || 1);
    setSequenceOrder(d.sequenceOrder || 1);
    setTitle(d.title || '');
    setSubtitle(d.subtitle || '');
    setShortDescription(d.shortDescription || '');
    setAssignmentType(d.assignmentType || 'Practical');
    setLearningObjectives(d.learningObjectives || '');
    setMaxPoints(d.maxPoints || 100);
    setEstimatedCompletionMinutes(d.estimatedCompletionMinutes || 120);
    if (d.instructionsJson) setInstructionsJson(d.instructionsJson);
    if (d.instructions) setInstructionsText(d.instructions);
    if (d.attachments) setAttachments(d.attachments);

    if (d.submissionConfig) {
      const c = d.submissionConfig;
      setAllowFileUpload(c.allowFileUpload ?? true);
      setAllowTextResponse(c.allowTextResponse ?? true);
      setAllowExternalLinks(c.allowExternalLinks ?? true);
      setAllowedExtensions(c.allowedExtensions || ALL_EXTENSION_OPTIONS);
      setMaxFileSizeMb(c.maxFileSizeMb || 25);
      setMaxFiles(c.maxFiles || 5);
      setMaxLinks(c.maxLinks || 5);
      setRequireAttachment(Boolean(c.requireAttachment));
      setRequireLink(Boolean(c.requireLink));
      setAllowMultipleVersions(c.allowMultipleVersions ?? true);
      setMaxRevisions(c.maxRevisions || 5);
      setAllowLateSubmission(c.allowLateSubmission ?? true);
      setGracePeriodMinutes(c.gracePeriodMinutes ?? 15);
      setAllowAfterDeadline(c.allowAfterDeadline ?? true);
      setAllowEditBeforeDeadline(c.allowEditBeforeDeadline ?? true);
      setAllowReturnForRevision(c.allowReturnForRevision ?? true);
      setGradingMethod(c.gradingMethod || 'COMBINED');
    }

    if (d.rubric && Array.isArray(d.rubric.criteria) && d.rubric.criteria.length > 0) {
      setUseRubric(true);
      setRubricTitle(d.rubric.title || 'Rubrik Evaluasi');
      setRubricDescription(d.rubric.description || '');
      setCriteria(
        d.rubric.criteria.map((cr: any) => ({
          id: cr.id,
          criterionName: cr.criterionName,
          description: cr.description || '',
          maxScore: cr.maxScore || 100,
          weight: cr.weight || 25,
        }))
      );
    }

    setStatus(d.status || 'PUBLISHED');
    if (d.dueAt) setDueAt(new Date(d.dueAt).toISOString().slice(0, 16));
    if (d.scheduledAt)
      setScheduledAt(new Date(d.scheduledAt).toISOString().slice(0, 16));
    if (d.availableFrom)
      setAvailableFrom(new Date(d.availableFrom).toISOString().slice(0, 16));
    if (d.availableUntil)
      setAvailableUntil(new Date(d.availableUntil).toISOString().slice(0, 16));
    if (d.timezone) setTimezone(d.timezone);
    if (d.lateSubmissionPolicy)
      setLateSubmissionPolicy(d.lateSubmissionPolicy);
    if (d.gradePublicationPolicy)
      setGradePublicationPolicy(d.gradePublicationPolicy);
  }, [assignmentDetailQuery.data]);

  const totalRubricWeight = criteria.reduce(
    (sum, c) => sum + Number(c.weight || 0),
    0
  );

  const buildPayload = (targetStatus = status) => ({
    topicId: topicId || null,
    meetingNumber: Number(meetingNumber),
    sequenceOrder: Number(sequenceOrder),
    title: title.trim(),
    subtitle: subtitle.trim(),
    shortDescription: shortDescription.trim(),
    assignmentType,
    learningObjectives: learningObjectives.trim(),
    instructions:
      instructionsText.trim() ||
      shortDescription.trim() ||
      title.trim() ||
      'Kerjakan sesuai instruksi.',
    instructionsJson,
    instructionsHtml,
    maxPoints: Number(maxPoints),
    estimatedCompletionMinutes: Number(estimatedCompletionMinutes),
    submissionConfig: {
      submissionMethods: [
        ...(allowFileUpload ? (['FILE_UPLOAD'] as const) : []),
        ...(allowTextResponse ? (['TEXT_RESPONSE'] as const) : []),
        ...(allowExternalLinks ? (['EXTERNAL_URL'] as const) : []),
      ],
      allowFileUpload,
      allowTextResponse,
      allowExternalLinks,
      allowedExtensions,
      maxFileSizeMb: Number(maxFileSizeMb),
      maxFiles: Number(maxFiles),
      maxLinks: Number(maxLinks),
      requireAttachment,
      requireLink,
      allowMultipleVersions,
      maxRevisions: Number(maxRevisions),
      allowLateSubmission,
      gracePeriodMinutes: Number(gracePeriodMinutes),
      allowAfterDeadline,
      allowEditBeforeDeadline,
      allowReturnForRevision,
      gradingMethod,
    },
    status: targetStatus,
    dueAt: new Date(dueAt).toISOString(),
    scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : null,
    availableFrom: availableFrom ? new Date(availableFrom).toISOString() : null,
    availableUntil: availableUntil
      ? new Date(availableUntil).toISOString()
      : null,
    timezone,
    lateSubmissionPolicy,
    gradePublicationPolicy,
    allowLateSubmission,
    rubric:
      useRubric && criteria.length > 0
        ? {
            title: rubricTitle,
            description: rubricDescription,
            criteria: criteria.map((c, idx) => ({
              criterionName: c.criterionName,
              description: c.description,
              maxScore: Number(c.maxScore),
              weight: Number(c.weight),
              sortOrder: idx + 1,
            })),
          }
        : null,
  });

  const saveMutation = useMutation({
    mutationFn: async (targetStatus: 'DRAFT' | 'SCHEDULED' | 'PUBLISHED' | 'ARCHIVED') => {
      if (!title.trim() || title.trim().length < 3) {
        throw new Error('Judul tugas minimal 3 karakter.');
      }
      if (useRubric && totalRubricWeight !== 100) {
        throw new Error(
          `Total bobot kriteria rubrik harus tepat 100% (saat ini ${totalRubricWeight}%).`
        );
      }

      const payload = buildPayload(targetStatus);
      if (currentAssignmentId) {
        return apiFetch<any>(`/api/v1/assignments/${currentAssignmentId}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
      } else {
        return apiFetch<any>(
          `/api/v1/classrooms/${selectedClassroomId}/assignments`,
          {
            method: 'POST',
            body: JSON.stringify(payload),
          }
        );
      }
    },
    onSuccess: (saved, targetStatus) => {
      setCurrentAssignmentId(saved.id);
      setStatus(targetStatus);
      queryClient.invalidateQueries({
        queryKey: ['classroom-assignments', selectedClassroomId],
      });
      queryClient.invalidateQueries({
        queryKey: ['classroom', selectedClassroomId],
      });
      toast.success(
        targetStatus === 'DRAFT'
          ? 'Draf tugas berhasil disimpan.'
          : targetStatus === 'SCHEDULED'
            ? 'Publikasi tugas berhasil dijadwalkan.'
            : 'Tugas berhasil diterbitkan ke ruang kelas!'
      );
    },
    onError: (err: any) => {
      toast.error(err.message || 'Gagal menyimpan tugas.');
    },
  });

  // Upload instructor attachment (creates draft assignment automatically if not yet saved)
  const handleFileUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    let activeId = currentAssignmentId;

    try {
      if (!activeId) {
        if (!title.trim()) {
          toast.error('Isi judul tugas terlebih dahulu sebelum mengunggah berkas.');
          return;
        }
        const created = await apiFetch<any>(
          `/api/v1/classrooms/${selectedClassroomId}/assignments`,
          {
            method: 'POST',
            body: JSON.stringify(buildPayload('DRAFT')),
          }
        );
        activeId = created.id;
        setCurrentAssignmentId(created.id);
      }

      for (const file of Array.from(files)) {
        setUploadingFileName(file.name);
        setUploadProgress(5);
        const uploaded = await uploadAssignmentAttachmentToS3({
          assignmentId: activeId!,
          file,
          description: `Lampiran instruksi: ${file.name}`,
          sortOrder: attachments.length + 1,
          onProgress: (pct) => setUploadProgress(pct),
        });
        setAttachments((prev) => [...prev, uploaded]);
        toast.success(`Berkas "${file.name}" berhasil diunggah ke S3 Privat.`);
      }
    } catch (err: any) {
      toast.error(err.message || 'Gagal mengunggah lampiran.');
    } finally {
      setUploadingFileName(null);
      setUploadProgress(0);
    }
  };

  const handleOpenPreview = async (att: any) => {
    if (!currentAssignmentId) return;
    try {
      const res = await apiFetch<any>(
        `/api/v1/assignments/${currentAssignmentId}/preview?attachmentId=${att.id}`
      );
      setPreviewTarget({
        attachment: res.attachment,
        preview: res.preview,
      });
    } catch (err: any) {
      toast.error(err.message || 'Gagal memuat pratinjau dokumen.');
    }
  };

  const handleRemoveAttachment = async (attachmentId: string) => {
    try {
      await apiFetch(`/api/v1/assignment-attachments/${attachmentId}`, {
        method: 'DELETE',
      });
      setAttachments((prev) => prev.filter((a) => a.id !== attachmentId));
      toast.success('Berkas lampiran dihapus.');
    } catch (err: any) {
      toast.error(err.message || 'Gagal menghapus lampiran.');
    }
  };

  const toggleExtension = (ext: string) => {
    setAllowedExtensions((prev) =>
      prev.includes(ext) ? prev.filter((e) => e !== ext) : [...prev, ext]
    );
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {/* Top Bar Contract */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1380px] items-center justify-between gap-8 px-6 py-3.5">
          <div className="flex items-center gap-3">
            <Link
              to={`/classrooms/${selectedClassroomId || classroomId}`}
              className="inline-flex items-center gap-2 text-xs font-semibold text-slate-600 hover:text-slate-900 whitespace-nowrap shrink-0"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Kembali ke Kelas</span>
            </Link>
            <span className="text-slate-300">/</span>
            <span className="text-sm font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0">
              {isEditing
                ? 'Edit Tugas & Rubrik Penilaian'
                : 'Advanced Assignment Builder'}
            </span>
          </div>

          <div className="hidden md:flex items-center gap-1 rounded-lg bg-slate-100 p-1">
            <button
              type="button"
              onClick={() => setActiveMode('EDIT')}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition cursor-pointer whitespace-nowrap shrink-0 ${
                activeMode === 'EDIT'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Edit3 className="h-3.5 w-3.5" />
              <span>Workspace Konfigurasi</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveMode('PREVIEW')}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition cursor-pointer whitespace-nowrap shrink-0 ${
                activeMode === 'PREVIEW'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Eye className="h-3.5 w-3.5" />
              <span>Pratinjau Tampilan Mahasiswa</span>
            </button>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => saveMutation.mutate('DRAFT')}
              disabled={saveMutation.isPending}
            >
              <Save className="h-3.5 w-3.5" />
              <span>Simpan Draf</span>
            </Button>
            <Button
              type="button"
              size="sm"
              variant="accent"
              onClick={() => saveMutation.mutate('PUBLISHED')}
              disabled={saveMutation.isPending}
            >
              <Send className="h-3.5 w-3.5" />
              <span>Terbitkan Tugas</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1380px] px-6 py-8">
        {activeMode === 'PREVIEW' ? (
          /* STUDENT PREVIEW MODE */
          <div className="mx-auto max-w-4xl space-y-6 rounded-xl border border-slate-200 bg-white p-8">
            <div className="border-b border-slate-100 pb-5 space-y-2">
              <div className="flex flex-wrap items-center gap-2 text-xs font-mono tabular-nums text-slate-500">
                <span>Pertemuan #{meetingNumber}</span>
                <span>·</span>
                <span>Tipe: {assignmentType}</span>
                <span>·</span>
                <span>Skor Maksimum: {maxPoints} Poin</span>
                <span>·</span>
                <span>Estimasi: {estimatedCompletionMinutes} Menit</span>
                <span>·</span>
                <span>
                  Tenggat: {new Date(dueAt).toLocaleString('id-ID')}
                </span>
              </div>
              <h1 className="text-2xl font-bold text-slate-900">
                {title || 'Judul Tugas Belum Diisi'}
              </h1>
              {subtitle && (
                <p className="text-sm font-medium text-slate-600">{subtitle}</p>
              )}
            </div>

            {learningObjectives && (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-xs space-y-1">
                <p className="font-bold text-slate-900">
                  Capaian Pembelajaran (Learning Objectives):
                </p>
                <p className="text-slate-600 leading-relaxed">
                  {learningObjectives}
                </p>
              </div>
            )}

            <div className="space-y-3">
              <h2 className="text-sm font-bold text-slate-900">
                Instruksi Lengkap Tugas
              </h2>
              <div className="rounded-xl border border-slate-200 p-6">
                <TiptapReadOnlyRenderer
                  contentJson={instructionsJson}
                  fallbackHtml={instructionsHtml}
                />
              </div>
            </div>

            {attachments.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-sm font-bold text-slate-900">
                  Lampiran Dokumen Instruktur ({attachments.length})
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {attachments.map((att) => (
                    <div
                      key={att.id}
                      className="flex items-center justify-between rounded-lg border border-slate-200 p-3 text-xs"
                    >
                      <div className="truncate pr-3">
                        <p className="font-semibold text-slate-900 truncate">
                          {att.originalName || att.fileName}
                        </p>
                        <p className="text-slate-500 font-mono tabular-nums">
                          .{att.fileExtension} ·{' '}
                          {Math.round((att.fileSize || 0) / 1024)} KB
                        </p>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => handleOpenPreview(att)}
                      >
                        <Eye className="h-3.5 w-3.5" />
                        <span>Pratinjau</span>
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {useRubric && criteria.length > 0 && (
              <div className="space-y-3 pt-4 border-t border-slate-100">
                <h3 className="text-sm font-bold text-slate-900">
                  Matriks Rubrik Penilaian ({rubricTitle})
                </h3>
                <div className="divide-y divide-slate-200 rounded-lg border border-slate-200">
                  {criteria.map((cr, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between p-3.5 text-xs"
                    >
                      <div>
                        <p className="font-semibold text-slate-900">
                          {idx + 1}. {cr.criterionName}
                        </p>
                        <p className="text-slate-500">{cr.description}</p>
                      </div>
                      <div className="text-right font-mono tabular-nums">
                        <span className="font-bold text-slate-900">
                          Bobot {cr.weight}%
                        </span>
                        <span className="mx-1.5 text-slate-300">·</span>
                        <span className="text-slate-600">
                          Maks {cr.maxScore} Poin
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          /* BUILDER WORKSPACE */
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            <div className="lg:col-span-8 space-y-8">
              {/* SECTION A: GENERAL INFORMATION */}
              <section className="rounded-xl border border-slate-200 bg-white p-6 space-y-5">
                <div className="border-b border-slate-100 pb-4">
                  <h2 className="text-base font-bold text-slate-900">
                    01. Informasi Umum & Identitas Tugas
                  </h2>
                  <p className="text-xs text-slate-500">
                    Tentukan kelas, modul topik, tipe tugas, capaian pembelajaran, dan bobot skor maksimum.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Ruang Kelas Digital
                    </label>
                    <select
                      value={selectedClassroomId}
                      onChange={(e) => setSelectedClassroomId(e.target.value)}
                      className="w-full h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm"
                    >
                      {(classroomsQuery.data || [])
                        .filter((c: any) => c.canManage)
                        .map((c: any) => (
                          <option key={c.id} value={c.id}>
                            {c.courseCode} — {c.name} ({c.section})
                          </option>
                        ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Topik / Modul Perkuliahan
                    </label>
                    <select
                      value={topicId}
                      onChange={(e) => setTopicId(e.target.value)}
                      className="w-full h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm"
                    >
                      <option value="">-- Tanpa Topik Spesifik --</option>
                      {(topicsQuery.data || []).map((t: any) => (
                        <option key={t.id} value={t.id}>
                          {t.title}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Tipe Tugas
                    </label>
                    <select
                      value={assignmentType}
                      onChange={(e) => setAssignmentType(e.target.value)}
                      className="w-full h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm"
                    >
                      {ASSIGNMENT_TYPES.map((t) => (
                        <option key={t.value} value={t.value}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Pertemuan Ke-
                    </label>
                    <Input
                      type="number"
                      min={1}
                      max={32}
                      value={meetingNumber}
                      onChange={(e) =>
                        setMeetingNumber(Number(e.target.value || 1))
                      }
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Urutan Tugas (Sequence)
                    </label>
                    <Input
                      type="number"
                      min={1}
                      max={100}
                      value={sequenceOrder}
                      onChange={(e) =>
                        setSequenceOrder(Number(e.target.value || 1))
                      }
                    />
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Judul Tugas *
                    </label>
                    <Input
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="Contoh: Praktikum 03 — Implementasi REST API Terotentikasi & S3 Presigned"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Subjudul Tugas
                    </label>
                    <Input
                      value={subtitle}
                      onChange={(e) => setSubtitle(e.target.value)}
                      placeholder="Contoh: Studi Kasus Sistem Manajemen Akademik Politeknik Kampar"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Skor Maksimum (Poin)
                      </label>
                      <Input
                        type="number"
                        min={10}
                        max={1000}
                        value={maxPoints}
                        onChange={(e) =>
                          setMaxPoints(Number(e.target.value || 100))
                        }
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Estimasi Waktu Pengerjaan (Menit)
                      </label>
                      <Input
                        type="number"
                        min={15}
                        max={10080}
                        value={estimatedCompletionMinutes}
                        onChange={(e) =>
                          setEstimatedCompletionMinutes(
                            Number(e.target.value || 120)
                          )
                        }
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Ringkasan Singkat Tugas
                    </label>
                    <Textarea
                      rows={2}
                      value={shortDescription}
                      onChange={(e) => setShortDescription(e.target.value)}
                      placeholder="Deskripsi ringkas yang tampil pada kartu daftar tugas di ruang kelas..."
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Capaian Pembelajaran (Learning Objectives)
                    </label>
                    <Textarea
                      rows={2}
                      value={learningObjectives}
                      onChange={(e) => setLearningObjectives(e.target.value)}
                      placeholder="Kompetensi teknis yang diukur melalui penyelesaian tugas ini..."
                    />
                  </div>
                </div>
              </section>

              {/* SECTION B: TIPTAP RICH INSTRUCTION EDITOR */}
              <section className="rounded-xl border border-slate-200 bg-white p-6 space-y-4">
                <div className="border-b border-slate-100 pb-4">
                  <h2 className="text-base font-bold text-slate-900">
                    02. Editor Instruksi Tugas Terstruktur (Tiptap JSONB)
                  </h2>
                  <p className="text-xs text-slate-500">
                    Gunakan pemformatan lengkap, tabel spesifikasi, blok kode, daftar periksa, atau sematkan video demonstrasi.
                  </p>
                </div>

                <TiptapMaterialEditor
                  initialJson={instructionsJson}
                  onChange={(json, html, text) => {
                    setInstructionsJson(json);
                    setInstructionsHtml(html);
                    setInstructionsText(text);
                  }}
                />
              </section>

              {/* SECTION C: INSTRUCTOR S3 ATTACHMENTS */}
              <section className="rounded-xl border border-slate-200 bg-white p-6 space-y-5">
                <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                  <div>
                    <h2 className="text-base font-bold text-slate-900">
                      03. Berkas Lampiran Instruktur (Penyimpanan S3 Privat)
                    </h2>
                    <p className="text-xs text-slate-500">
                      Lampirkan soal PDF, template laporan DOCX, dataset XLSX, slide PPTX, gambar, atau video panduan.
                    </p>
                  </div>
                  <span className="text-xs font-mono tabular-nums font-bold text-slate-700">
                    {attachments.length} Berkas
                  </span>
                </div>

                <div className="rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 p-6 text-center space-y-3">
                  <Upload className="h-7 w-7 mx-auto text-slate-500" />
                  <div className="space-y-1">
                    <p className="text-xs font-semibold text-slate-800">
                      Seret berkas ke sini atau klik untuk memilih berkas
                    </p>
                    <p className="text-xs text-slate-500">
                      Mendukung PDF, DOC, DOCX, XLS, XLSX, PPT, PPTX, JPG, PNG, WEBP, MP4, WEBM
                    </p>
                  </div>
                  <div>
                    <label className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 cursor-pointer">
                      <Upload className="h-3.5 w-3.5" />
                      <span>Pilih Berkas Lampiran</span>
                      <input
                        type="file"
                        multiple
                        className="hidden"
                        onChange={(e) => handleFileUpload(e.target.files)}
                      />
                    </label>
                  </div>

                  {uploadingFileName && (
                    <div className="mx-auto max-w-md space-y-1 pt-2">
                      <div className="flex justify-between text-xs font-mono tabular-nums text-slate-600">
                        <span className="truncate">{uploadingFileName}</span>
                        <span>{uploadProgress}%</span>
                      </div>
                      <div className="h-2 w-full rounded-full bg-slate-200 overflow-hidden">
                        <div
                          className="h-full bg-amber-500 transition-all"
                          style={{ width: `${uploadProgress}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>

                {attachments.length > 0 && (
                  <div className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                    {attachments.map((att) => (
                      <div
                        key={att.id || att.objectKey}
                        className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 text-xs"
                      >
                        <div className="space-y-0.5">
                          <p className="font-bold text-slate-900">
                            {att.originalName || att.fileName}
                          </p>
                          <p className="font-mono tabular-nums text-slate-500">
                            .{att.fileExtension} ·{' '}
                            {Math.max(1, Math.round((att.fileSize || 0) / 1024))}{' '}
                            KB · SHA-256 Terverifikasi
                          </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {att.id && (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => handleOpenPreview(att)}
                            >
                              <Eye className="h-3.5 w-3.5" />
                              <span>Pratinjau</span>
                            </Button>
                          )}
                          {att.downloadUrl && (
                            <a
                              href={att.downloadUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 font-semibold text-slate-700 hover:bg-slate-50"
                            >
                              <Download className="h-3.5 w-3.5" />
                              <span>Unduh</span>
                            </a>
                          )}
                          {att.id && (
                            <button
                              type="button"
                              onClick={() => handleRemoveAttachment(att.id)}
                              className="p-1.5 rounded-lg border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 cursor-pointer"
                              title="Hapus Lampiran"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* SECTION E: CONFIGURABLE RUBRIC BUILDER */}
              <section className="rounded-xl border border-slate-200 bg-white p-6 space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-4">
                  <div>
                    <h2 className="text-base font-bold text-slate-900">
                      04. Rubrik Penilaian Terstruktur (Rubric Builder)
                    </h2>
                    <p className="text-xs text-slate-500">
                      Susun kriteria evaluasi dengan bobot total wajib 100% untuk perhitungan nilai otomatis di backend.
                    </p>
                  </div>
                  <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-800 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={useRubric}
                      onChange={(e) => setUseRubric(e.target.checked)}
                      className="rounded border-slate-300"
                    />
                    <span>Aktifkan Rubrik pada Tugas Ini</span>
                  </label>
                </div>

                {useRubric && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          Judul Rubrik
                        </label>
                        <Input
                          value={rubricTitle}
                          onChange={(e) => setRubricTitle(e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          Deskripsi Rubrik
                        </label>
                        <Input
                          value={rubricDescription}
                          onChange={(e) => setRubricDescription(e.target.value)}
                        />
                      </div>
                    </div>

                    <div className="space-y-3">
                      {criteria.map((cr, idx) => (
                        <div
                          key={idx}
                          className="rounded-lg border border-slate-200 bg-slate-50/60 p-4 space-y-3"
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-slate-900">
                              Kriteria #{idx + 1}
                            </span>
                            {criteria.length > 1 && (
                              <button
                                type="button"
                                onClick={() =>
                                  setCriteria((prev) =>
                                    prev.filter((_, i) => i !== idx)
                                  )
                                }
                                className="text-xs font-semibold text-rose-600 hover:underline cursor-pointer"
                              >
                                Hapus Kriteria
                              </button>
                            )}
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                            <div className="sm:col-span-6">
                              <label className="block text-xs font-medium text-slate-600 mb-1">
                                Nama Kriteria Penilaian
                              </label>
                              <Input
                                value={cr.criterionName}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setCriteria((prev) =>
                                    prev.map((item, i) =>
                                      i === idx
                                        ? { ...item, criterionName: val }
                                        : item
                                    )
                                  );
                                }}
                              />
                            </div>
                            <div className="sm:col-span-3">
                              <label className="block text-xs font-medium text-slate-600 mb-1">
                                Skor Maks Kriteria
                              </label>
                              <Input
                                type="number"
                                min={10}
                                max={1000}
                                value={cr.maxScore}
                                onChange={(e) => {
                                  const val = Number(e.target.value || 100);
                                  setCriteria((prev) =>
                                    prev.map((item, i) =>
                                      i === idx
                                        ? { ...item, maxScore: val }
                                        : item
                                    )
                                  );
                                }}
                              />
                            </div>
                            <div className="sm:col-span-3">
                              <label className="block text-xs font-medium text-slate-600 mb-1">
                                Bobot (%)
                              </label>
                              <Input
                                type="number"
                                min={1}
                                max={100}
                                value={cr.weight}
                                onChange={(e) => {
                                  const val = Number(e.target.value || 0);
                                  setCriteria((prev) =>
                                    prev.map((item, i) =>
                                      i === idx
                                        ? { ...item, weight: val }
                                        : item
                                    )
                                  );
                                }}
                              />
                            </div>
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-slate-600 mb-1">
                              Indikator / Deskripsi Evaluasi
                            </label>
                            <Input
                              value={cr.description}
                              onChange={(e) => {
                                const val = e.target.value;
                                setCriteria((prev) =>
                                  prev.map((item, i) =>
                                    i === idx
                                      ? { ...item, description: val }
                                      : item
                                  )
                                );
                              }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          setCriteria((prev) => [
                            ...prev,
                            {
                              criterionName: `Kriteria Evaluasi ${prev.length + 1}`,
                              description: 'Deskripsi capaian indikator',
                              maxScore: 100,
                              weight: 10,
                            },
                          ])
                        }
                      >
                        <Plus className="h-3.5 w-3.5" />
                        <span>Tambah Kriteria Rubrik</span>
                      </Button>

                      <div className="text-xs font-mono tabular-nums">
                        <span>Total Bobot Rubrik: </span>
                        <span
                          className={`font-bold ${
                            totalRubricWeight === 100
                              ? 'text-emerald-700'
                              : 'text-rose-600'
                          }`}
                        >
                          {totalRubricWeight}% / 100%
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </section>
            </div>

            {/* RIGHT COLUMN: SUBMISSION RULES & SCHEDULING */}
            <div className="lg:col-span-4 space-y-8">
              {/* SECTION D: SUBMISSION CONFIGURATION */}
              <section className="rounded-xl border border-slate-200 bg-white p-6 space-y-5">
                <div className="border-b border-slate-100 pb-3">
                  <h2 className="text-base font-bold text-slate-900">
                    05. Aturan Pengumpulan Mahasiswa
                  </h2>
                  <p className="text-xs text-slate-500">
                    Semua batasan divalidasi secara ketat di sisi server (backend).
                  </p>
                </div>

                <div className="space-y-2.5 text-xs">
                  <p className="font-semibold text-slate-800">
                    Metode Pengumpulan yang Diizinkan:
                  </p>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={allowFileUpload}
                      onChange={(e) => setAllowFileUpload(e.target.checked)}
                    />
                    <span>Unggah Berkas Dokumen / Media (S3 Privat)</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={allowTextResponse}
                      onChange={(e) => setAllowTextResponse(e.target.checked)}
                    />
                    <span>Jawaban Teks Terformat (Rich Text Tiptap)</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={allowExternalLinks}
                      onChange={(e) => setAllowExternalLinks(e.target.checked)}
                    />
                    <span>Tautan Eksternal HTTPS (GitHub, Drive, Figma, dll.)</span>
                  </label>
                </div>

                {allowFileUpload && (
                  <div className="space-y-2 pt-2 border-t border-slate-100">
                    <p className="text-xs font-semibold text-slate-800">
                      Ekstensi Berkas yang Diizinkan:
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {ALL_EXTENSION_OPTIONS.map((ext) => {
                        const active = allowedExtensions.includes(ext);
                        return (
                          <button
                            key={ext}
                            type="button"
                            onClick={() => toggleExtension(ext)}
                            className={`px-2.5 py-1 rounded text-xs font-mono uppercase border transition cursor-pointer ${
                              active
                                ? 'bg-slate-900 text-white border-slate-900'
                                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                            }`}
                          >
                            .{ext}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-100">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Maks Ukuran (MB)
                    </label>
                    <Input
                      type="number"
                      min={1}
                      max={250}
                      value={maxFileSizeMb}
                      onChange={(e) =>
                        setMaxFileSizeMb(Number(e.target.value || 25))
                      }
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Maks Jumlah Berkas
                    </label>
                    <Input
                      type="number"
                      min={1}
                      max={20}
                      value={maxFiles}
                      onChange={(e) => setMaxFiles(Number(e.target.value || 5))}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Maks Tautan HTTPS
                    </label>
                    <Input
                      type="number"
                      min={1}
                      max={20}
                      value={maxLinks}
                      onChange={(e) => setMaxLinks(Number(e.target.value || 5))}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Maks Versi Revisi
                    </label>
                    <Input
                      type="number"
                      min={1}
                      max={30}
                      value={maxRevisions}
                      onChange={(e) =>
                        setMaxRevisions(Number(e.target.value || 5))
                      }
                    />
                  </div>
                </div>

                <div className="space-y-2 pt-2 border-t border-slate-100 text-xs">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={requireAttachment}
                      onChange={(e) => setRequireAttachment(e.target.checked)}
                    />
                    <span>Wajibkan minimal 1 berkas lampiran</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={requireLink}
                      onChange={(e) => setRequireLink(e.target.checked)}
                    />
                    <span>Wajibkan minimal 1 tautan eksternal HTTPS</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={allowMultipleVersions}
                      onChange={(e) =>
                        setAllowMultipleVersions(e.target.checked)
                      }
                    />
                    <span>Izinkan pengiriman ulang multi-versi (riwayat terjaga)</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={allowEditBeforeDeadline}
                      onChange={(e) =>
                        setAllowEditBeforeDeadline(e.target.checked)
                      }
                    />
                    <span>Izinkan mahasiswa memperbarui sebelum tenggat</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={allowReturnForRevision}
                      onChange={(e) =>
                        setAllowReturnForRevision(e.target.checked)
                      }
                    />
                    <span>Izinkan Dosen mengembalikan tugas untuk revisi</span>
                  </label>
                </div>

                <div className="pt-2 border-t border-slate-100">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Metode Penilaian Utama
                  </label>
                  <select
                    value={gradingMethod}
                    onChange={(e) =>
                      setGradingMethod(
                        e.target.value as 'DIRECT' | 'RUBRIC' | 'COMBINED'
                      )
                    }
                    className="w-full h-10 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold"
                  >
                    <option value="COMBINED">
                      Kombinasi Rubrik & Nilai Numerik (Combined)
                    </option>
                    <option value="RUBRIC">
                      Kalkulasi Otomatis Berbasis Rubrik (Rubric-Based)
                    </option>
                    <option value="DIRECT">
                      Penilaian Numerik Langsung (Direct Numeric)
                    </option>
                  </select>
                </div>
              </section>

              {/* SECTION F: SCHEDULING & PUBLICATION */}
              <section className="rounded-xl border border-slate-200 bg-white p-6 space-y-4">
                <div className="border-b border-slate-100 pb-3">
                  <h2 className="text-base font-bold text-slate-900">
                    06. Penjadwalan, Tenggat & Publikasi
                  </h2>
                  <p className="text-xs text-slate-500">
                    Zona waktu institusi: {timezone} (WIB).
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Status Publikasi
                  </label>
                  <select
                    value={status}
                    onChange={(e) =>
                      setStatus(
                        e.target.value as
                          | 'DRAFT'
                          | 'SCHEDULED'
                          | 'PUBLISHED'
                          | 'ARCHIVED'
                      )
                    }
                    className="w-full h-10 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold"
                  >
                    <option value="PUBLISHED">PUBLISHED (Terbit Langsung)</option>
                    <option value="DRAFT">DRAFT (Disimpan sebagai Draf)</option>
                    <option value="SCHEDULED">
                      SCHEDULED (Terjadwal Otomatis)
                    </option>
                    <option value="ARCHIVED">ARCHIVED (Diarsipkan)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Tenggat Waktu Pengumpulan (Deadline) *
                  </label>
                  <Input
                    type="datetime-local"
                    value={dueAt}
                    onChange={(e) => setDueAt(e.target.value)}
                  />
                </div>

                {status === 'SCHEDULED' && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Jadwal Terbit Otomatis
                    </label>
                    <Input
                      type="datetime-local"
                      value={scheduledAt}
                      onChange={(e) => setScheduledAt(e.target.value)}
                    />
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Masa Tenggang (Menit)
                    </label>
                    <Input
                      type="number"
                      min={0}
                      max={1440}
                      value={gracePeriodMinutes}
                      onChange={(e) =>
                        setGracePeriodMinutes(Number(e.target.value || 0))
                      }
                    />
                  </div>
                  <div className="flex flex-col justify-end pb-1">
                    <label className="flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={allowLateSubmission}
                        onChange={(e) => {
                          setAllowLateSubmission(e.target.checked);
                          setAllowAfterDeadline(e.target.checked);
                        }}
                      />
                      <span>Terima Kumpul Terlambat</span>
                    </label>
                  </div>
                </div>
              </section>
            </div>
          </div>
        )}
      </main>

      <DocumentPreviewModal
        open={Boolean(previewTarget)}
        onClose={() => setPreviewTarget(null)}
        attachment={previewTarget?.attachment || null}
        preview={previewTarget?.preview || null}
      />
    </div>
  );
}
