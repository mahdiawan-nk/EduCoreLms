import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Clock,
  Upload,
  Link as LinkIcon,
  Send,
  Save,
  Eye,
  Download,
  Trash2,
  Plus,
  History,
  MessageSquare,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
  Edit3,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';
import { apiFetch } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { canPerformMutations, isAuditorUser } from '../lib/authorization';
import { uploadSubmissionAttachmentToS3 } from '../lib/s3Upload';
import {
  TiptapMaterialEditor,
  TiptapReadOnlyRenderer,
} from '../components/TiptapMaterialEditor';
import { DocumentPreviewModal } from '../components/DocumentPreviewModal';
import {
  Button,
  Input,
  Textarea,
  ModalDialog,
} from '../components/ui/primitives';

export function AssignmentWorkspacePage() {
  const { classroomId, assignmentId } = useParams<{
    classroomId: string;
    assignmentId: string;
  }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [submissionJson, setSubmissionJson] = useState<Record<string, any>>({
    type: 'doc',
    content: [{ type: 'paragraph' }],
  });
  const [submissionHtml, setSubmissionHtml] = useState('');
  const [submissionText, setSubmissionText] = useState('');
  const [uploadedFiles, setUploadedFiles] = useState<any[]>([]);
  const [externalLinks, setExternalLinks] = useState<
    { url: string; title: string; description: string }[]
  >([]);

  const [newLinkUrl, setNewLinkUrl] = useState('');
  const [newLinkTitle, setNewLinkTitle] = useState('');
  const [newLinkDesc, setNewLinkDesc] = useState('');

  const [uploadingFile, setUploadingFile] = useState<string | null>(null);
  const [uploadPct, setUploadPct] = useState(0);

  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState(() =>
    crypto.randomUUID()
  );
  const [previewTarget, setPreviewTarget] = useState<any | null>(null);

  const [commentText, setCommentText] = useState('');
  const [initialized, setInitialized] = useState(false);

  const assignmentQuery = useQuery({
    queryKey: ['assignment-detail', assignmentId],
    queryFn: () => apiFetch<any>(`/api/v1/assignments/${assignmentId}`),
    enabled: Boolean(assignmentId),
  });

  const { user } = useAuth();
  const isAuditor = isAuditorUser(user);
  const canMutate = canPerformMutations(user);
  const asg = assignmentQuery.data;
  const mySub = asg?.mySubmission;
  const cfg = asg?.submissionConfig || {};
  const canManage = Boolean(asg?.access?.canManage) && canMutate;

  useEffect(() => {
    if (!mySub || initialized) return;
    if (mySub.submissionJson && Object.keys(mySub.submissionJson).length > 0) {
      setSubmissionJson(mySub.submissionJson);
    }
    if (mySub.submissionText) {
      setSubmissionText(mySub.submissionText);
    }
    if (Array.isArray(mySub.attachments)) {
      setUploadedFiles(mySub.attachments);
    }
    if (Array.isArray(mySub.links)) {
      setExternalLinks(
        mySub.links.map((l: any) => ({
          url: l.url,
          title: l.title || '',
          description: l.description || '',
        }))
      );
    }
    setInitialized(true);
  }, [mySub, initialized]);

  const handleUploadStudentFiles = async (files: FileList | null) => {
    if (!files || !assignmentId) return;
    try {
      for (const file of Array.from(files)) {
        setUploadingFile(file.name);
        setUploadPct(10);
        const confirmed = await uploadSubmissionAttachmentToS3({
          assignmentId,
          file,
          description: `Jawaban Mahasiswa: ${file.name}`,
          onProgress: (p) => setUploadPct(p),
        });
        setUploadedFiles((prev) => [...prev, confirmed]);
        toast.success(`Berkas "${file.name}" berhasil diunggah dan diverifikasi.`);
      }
    } catch (err: any) {
      toast.error(err.message || 'Gagal mengunggah berkas jawaban.');
    } finally {
      setUploadingFile(null);
      setUploadPct(0);
    }
  };

  const handleAddExternalLink = () => {
    const raw = newLinkUrl.trim();
    if (!raw) return;
    if (!raw.startsWith('https://')) {
      toast.error('Tautan eksternal wajib menggunakan protokol aman https://');
      return;
    }
    setExternalLinks((prev) => [
      ...prev,
      {
        url: raw,
        title: newLinkTitle.trim() || 'Tautan Proyek / Repositori',
        description: newLinkDesc.trim(),
      },
    ]);
    setNewLinkUrl('');
    setNewLinkTitle('');
    setNewLinkDesc('');
  };

  const submitMutation = useMutation({
    mutationFn: async (isDraft: boolean) => {
      return apiFetch<any>(`/api/v1/assignments/${assignmentId}/submissions`, {
        method: 'POST',
        body: JSON.stringify({
          submissionText,
          submissionJson,
          submissionHtml,
          isDraft,
          idempotencyKey: isDraft ? crypto.randomUUID() : idempotencyKey,
          attachments: uploadedFiles.map((f) => ({
            objectKey: f.objectKey,
            originalFileName: f.originalName || f.fileName,
            mimeType: f.mimeType,
            fileExtension: f.fileExtension,
            fileSize: f.fileSize,
            checksum: f.checksum,
            description: f.description || '',
          })),
          links: externalLinks,
        }),
      });
    },
    onSuccess: (_res, isDraft) => {
      setConfirmModalOpen(false);
      setIdempotencyKey(crypto.randomUUID());
      queryClient.invalidateQueries({
        queryKey: ['assignment-detail', assignmentId],
      });
      queryClient.invalidateQueries({
        queryKey: ['classroom', classroomId],
      });
      toast.success(
        isDraft
          ? 'Draf jawaban berhasil disimpan.'
          : 'Tugas berhasil dikumpulkan dan tercatat dalam riwayat versi!'
      );
    },
    onError: (err: any) => {
      toast.error(err.message || 'Gagal mengumpulkan tugas.');
    },
  });

  const commentMutation = useMutation({
    mutationFn: async () => {
      if (!mySub?.id) {
        throw new Error('Kumpulkan atau simpan draf tugas terlebih dahulu sebelum berdiskusi.');
      }
      return apiFetch<any>(`/api/v1/submissions/${mySub.id}/comments`, {
        method: 'POST',
        body: JSON.stringify({
          content: commentText,
          visibility: 'STUDENT_VISIBLE',
        }),
      });
    },
    onSuccess: () => {
      setCommentText('');
      queryClient.invalidateQueries({
        queryKey: ['assignment-detail', assignmentId],
      });
      toast.success('Pesan diskusi terkirim.');
    },
    onError: (err: any) => {
      toast.error(err.message || 'Gagal mengirim pesan diskusi.');
    },
  });

  const handlePreviewInstructorFile = async (att: any) => {
    try {
      const res = await apiFetch<any>(
        `/api/v1/assignments/${assignmentId}/preview?attachmentId=${att.id}`
      );
      setPreviewTarget({
        attachment: res.attachment,
        preview: res.preview,
      });
    } catch (err: any) {
      toast.error(err.message || 'Gagal memuat pratinjau berkas.');
    }
  };

  const handlePreviewSubmissionFile = async (att: any) => {
    if (!mySub?.id || !att.id) return;
    try {
      const res = await apiFetch<any>(
        `/api/v1/submissions/${mySub.id}/preview?attachmentId=${att.id}`
      );
      setPreviewTarget({
        attachment: res.attachment,
        preview: res.preview,
      });
    } catch (err: any) {
      toast.error(err.message || 'Gagal memuat pratinjau berkas jawaban.');
    }
  };

  if (assignmentQuery.isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 p-8">
        <div className="mx-auto max-w-6xl rounded-xl border border-slate-200 bg-white p-8 text-xs text-slate-500">
          Memuat ruang kerja tugas Politeknik Kampar...
        </div>
      </div>
    );
  }

  if (!asg) {
    return (
      <div className="min-h-screen bg-slate-50 p-8">
        <div className="mx-auto max-w-3xl rounded-xl border border-slate-200 bg-white p-8 space-y-4">
          <p className="text-sm font-bold text-slate-900">
            Tugas tidak ditemukan atau belum diterbitkan.
          </p>
          <Link
            to={`/classrooms/${classroomId}`}
            className="inline-flex items-center gap-2 text-xs font-semibold text-amber-700 hover:underline"
          >
            <ArrowLeft className="h-4 w-4" /> Kembali ke Ruang Kelas
          </Link>
        </div>
      </div>
    );
  }

  const dueDate = new Date(asg.dueAt);
  const diffMs = dueDate.getTime() - Date.now();
  const isPastDue = diffMs < 0;
  const remainingHours = Math.abs(Math.round(diffMs / 3600_000));
  const currentStatus = mySub?.status || 'not_submitted';

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {/* Top Bar Contract */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1380px] items-center justify-between gap-8 px-6 py-3.5">
          <div className="flex items-center gap-3">
            <Link
              to={`/classrooms/${classroomId}`}
              className="inline-flex items-center gap-2 text-xs font-semibold text-slate-600 hover:text-slate-900 whitespace-nowrap shrink-0"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>{asg.classroom?.name || 'Ruang Kelas'}</span>
            </Link>
            <span className="text-slate-300">/</span>
            <span className="text-sm font-bold tracking-tight text-slate-900 truncate max-w-md">
              {asg.title}
            </span>
          </div>

          <div className="hidden md:flex items-center gap-4 text-xs font-mono tabular-nums text-slate-600">
            <span>Status: {currentStatus.toUpperCase()}</span>
            <span>·</span>
            <span>Skor Maks: {asg.maxPoints}</span>
            <span>·</span>
            <span className={isPastDue ? 'text-rose-600 font-bold' : 'text-emerald-700 font-bold'}>
              {isPastDue
                ? `Lewat Tenggat (${remainingHours} jam lalu)`
                : `Sisa Waktu: ~${remainingHours} jam`}
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {isAuditor ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() =>
                  navigate(
                    `/classrooms/${classroomId}/assignments/${assignmentId}/monitoring`
                  )
                }
              >
                <Users className="h-3.5 w-3.5" />
                <span>Monitoring Pengumpulan</span>
              </Button>
            ) : canManage ? (
              <>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    navigate(
                      `/classrooms/${classroomId}/assignments/${assignmentId}/edit`
                    )
                  }
                >
                  <Edit3 className="h-3.5 w-3.5" />
                  <span>Edit Tugas</span>
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="accent"
                  onClick={() =>
                    navigate(
                      `/classrooms/${classroomId}/assignments/${assignmentId}/monitoring`
                    )
                  }
                >
                  <Users className="h-3.5 w-3.5" />
                  <span>Monitoring & Penilaian Peserta</span>
                </Button>
              </>
            ) : (
              <Button
                type="button"
                size="sm"
                variant="accent"
                onClick={() => setConfirmModalOpen(true)}
              >
                <Send className="h-3.5 w-3.5" />
                <span>
                  {mySub && mySub.status !== 'draft'
                    ? 'Kirim Versi Revisi'
                    : 'Konfirmasi & Kumpulkan Tugas'}
                </span>
              </Button>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1380px] px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* LEFT COLUMN: ASSIGNMENT DETAILS, INSTRUCTIONS, ATTACHMENTS & RUBRIC */}
          <div className="lg:col-span-7 space-y-6">
            <section className="rounded-xl border border-slate-200 bg-white p-6 space-y-5">
              <div className="border-b border-slate-100 pb-4 space-y-2">
                <div className="flex flex-wrap items-center gap-2 text-xs font-mono tabular-nums text-slate-500">
                  <span>Pertemuan #{asg.meetingNumber || 1}</span>
                  <span>·</span>
                  <span>{asg.topic?.title || 'Modul Perkuliahan'}</span>
                  <span>·</span>
                  <span>Tipe: {asg.assignmentType}</span>
                  <span>·</span>
                  <span>Oleh: {asg.instructor?.fullName || 'Dosen Pengampu'}</span>
                </div>
                <h1 className="text-xl font-bold text-slate-900">{asg.title}</h1>
                {asg.subtitle && (
                  <p className="text-sm font-medium text-slate-600">
                    {asg.subtitle}
                  </p>
                )}
                <div className="flex flex-wrap items-center gap-4 pt-1 text-xs font-mono tabular-nums text-slate-600">
                  <span>
                    Tenggat: {new Date(asg.dueAt).toLocaleString('id-ID')}
                  </span>
                  <span>·</span>
                  <span>Skor Maksimum: {asg.maxPoints} Poin</span>
                  <span>·</span>
                  <span>
                    Estimasi Pengerjaan: {asg.estimatedCompletionMinutes} Menit
                  </span>
                </div>
              </div>

              {/* Returned for revision alert */}
              {mySub?.status === 'returned' && (
                <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-xs space-y-1.5">
                  <p className="font-bold text-amber-900">
                    Tugas Dikembalikan untuk Revisi oleh Dosen
                  </p>
                  <p className="text-amber-800">
                    Instruksi Revisi:{' '}
                    {mySub.revisionInstructions ||
                      mySub.feedback ||
                      'Silakan perbaiki dan kirimkan versi terbaru.'}
                  </p>
                </div>
              )}

              {/* Published Grade & Rubric Evaluation Card */}
              {mySub?.grade && mySub.grade.isPublished && (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-bold uppercase text-emerald-900">
                        Nilai Resmi Telah Diterbitkan
                      </p>
                      <p className="text-xs text-emerald-800">
                        Metode Evaluasi: {mySub.grade.gradingMethod}
                      </p>
                    </div>
                    <div className="text-right font-mono tabular-nums">
                      <span className="text-2xl font-bold text-emerald-900">
                        {mySub.grade.finalScore}
                      </span>
                      <span className="text-sm text-emerald-700">
                        {' '}
                        / {asg.maxPoints}
                      </span>
                    </div>
                  </div>
                  {mySub.grade.generalFeedback && (
                    <div className="rounded-lg bg-white p-3 text-xs border border-emerald-100">
                      <p className="font-semibold text-slate-900">
                        Umpan Balik Dosen:
                      </p>
                      <p className="mt-1 text-slate-700">
                        {mySub.grade.generalFeedback}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {asg.learningObjectives && (
                <div className="rounded-lg bg-slate-50 border border-slate-200 p-4 text-xs space-y-1">
                  <p className="font-bold text-slate-900">
                    Capaian Pembelajaran (Learning Objectives):
                  </p>
                  <p className="text-slate-600 leading-relaxed">
                    {asg.learningObjectives}
                  </p>
                </div>
              )}

              <div className="space-y-2">
                <h2 className="text-sm font-bold text-slate-900">
                  Instruksi Pengerjaan
                </h2>
                <div className="rounded-lg border border-slate-200 p-5">
                  <TiptapReadOnlyRenderer
                    contentJson={asg.instructionsJson}
                    fallbackHtml={asg.instructionsHtml || asg.instructions}
                  />
                </div>
              </div>

              {/* Instructor Attachments */}
              {asg.attachments && asg.attachments.length > 0 && (
                <div className="space-y-3 pt-2 border-t border-slate-100">
                  <h3 className="text-sm font-bold text-slate-900">
                    Berkas Referensi & Soal dari Dosen ({asg.attachments.length})
                  </h3>
                  <div className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                    {asg.attachments.map((att: any) => (
                      <div
                        key={att.id}
                        className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 text-xs"
                      >
                        <div>
                          <p className="font-semibold text-slate-900">
                            {att.originalName || att.fileName}
                          </p>
                          <p className="font-mono tabular-nums text-slate-500">
                            .{att.fileExtension} ·{' '}
                            {Math.max(1, Math.round((att.fileSize || 0) / 1024))}{' '}
                            KB
                          </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => handlePreviewInstructorFile(att)}
                          >
                            <Eye className="h-3.5 w-3.5" />
                            <span>Pratinjau</span>
                          </Button>
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
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Rubric Matrix */}
              {asg.rubric &&
                Array.isArray(asg.rubric.criteria) &&
                asg.rubric.criteria.length > 0 && (
                  <div className="space-y-3 pt-2 border-t border-slate-100">
                    <h3 className="text-sm font-bold text-slate-900">
                      Kriteria Rubrik Penilaian ({asg.rubric.title})
                    </h3>
                    <div className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                      {asg.rubric.criteria.map((cr: any, idx: number) => {
                        const myCritScore =
                          mySub?.grade?.rubricScores?.find(
                            (rs: any) => rs.criterionId === cr.id
                          ) || null;
                        return (
                          <div
                            key={cr.id || idx}
                            className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3.5 text-xs"
                          >
                            <div className="space-y-0.5">
                              <p className="font-semibold text-slate-900">
                                {idx + 1}. {cr.criterionName}
                              </p>
                              <p className="text-slate-500">{cr.description}</p>
                              {myCritScore?.feedback && (
                                <p className="text-emerald-700 font-medium">
                                  Evaluasi Dosen: {myCritScore.feedback}
                                </p>
                              )}
                            </div>
                            <div className="text-right font-mono tabular-nums shrink-0">
                              <span className="font-bold text-slate-900">
                                Bobot {cr.weight}%
                              </span>
                              <span className="mx-1.5 text-slate-300">·</span>
                              <span className="text-slate-600">
                                {myCritScore
                                  ? `Skor: ${myCritScore.score}/${cr.maxScore}`
                                  : `Maks ${cr.maxScore}`}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
            </section>

            {/* SUBMISSION VERSION HISTORY */}
            {mySub?.versions && mySub.versions.length > 0 && (
              <section className="rounded-xl border border-slate-200 bg-white p-6 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-2">
                    <History className="h-4 w-4 text-slate-700" />
                    <h2 className="text-sm font-bold text-slate-900">
                      Riwayat Versi Pengumpulan ({mySub.versions.length} Versi Terjaga)
                    </h2>
                  </div>
                  <span className="text-xs font-mono tabular-nums text-slate-500">
                    Versi Aktif: v{mySub.currentVersion}
                  </span>
                </div>

                <div className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                  {mySub.versions.map((ver: any) => (
                    <div
                      key={ver.id}
                      className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3.5 text-xs"
                    >
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2 font-mono tabular-nums">
                          <span className="font-bold text-slate-900">
                            Versi #{ver.versionNumber}
                          </span>
                          <span>·</span>
                          <span className="text-slate-500">
                            {new Date(ver.submittedAt).toLocaleString('id-ID')}
                          </span>
                          {ver.isLate && (
                            <>
                              <span>·</span>
                              <span className="text-rose-600 font-semibold">
                                Terlambat ({ver.lateMinutes} menit)
                              </span>
                            </>
                          )}
                        </div>
                        <p className="text-slate-600 line-clamp-1">
                          {ver.submissionText || 'Pengumpulan berkas & tautan'}
                        </p>
                      </div>
                      <div className="font-mono tabular-nums text-slate-500 shrink-0">
                        {(ver.attachmentsSnapshot || []).length} Berkas ·{' '}
                        {(ver.linksSnapshot || []).length} Tautan
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>

          {/* RIGHT COLUMN: STUDENT SUBMISSION EDITOR & DISCUSSION */}
          <div className="lg:col-span-5 space-y-6">
            {canMutate && !isAuditor ? (
            <section className="rounded-xl border border-slate-200 bg-white p-6 space-y-5">
              <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                <div>
                  <h2 className="text-base font-bold text-slate-900">
                    Lembar Kerja Pengumpulan Tugas
                  </h2>
                  <p className="text-xs text-slate-500">
                    Kumpulkan jawaban teks, berkas dokumen/gambar, dan tautan HTTPS.
                  </p>
                </div>
                <span className="text-xs font-mono tabular-nums font-bold text-slate-800 uppercase">
                  {currentStatus}
                </span>
              </div>

              {/* A. Text Response */}
              {cfg.allowTextResponse !== false && (
                <div className="space-y-2">
                  <label className="block text-xs font-bold text-slate-800">
                    A. Jawaban Teks Terstruktur (Tiptap Rich Response)
                  </label>
                  <TiptapMaterialEditor
                    initialJson={submissionJson}
                    onChange={(json, html, text) => {
                      setSubmissionJson(json);
                      setSubmissionHtml(html);
                      setSubmissionText(text);
                    }}
                  />
                </div>
              )}

              {/* B. File Uploads */}
              {cfg.allowFileUpload !== false && (
                <div className="space-y-3 pt-3 border-t border-slate-100">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-800">
                      B. Unggah Berkas Jawaban ({uploadedFiles.length}/
                      {cfg.maxFiles || 5})
                    </label>
                    <span className="text-xs font-mono text-slate-500">
                      Maks {cfg.maxFileSizeMb || 25} MB/berkas
                    </span>
                  </div>
                  <p className="text-xs text-slate-500">
                    Ekstensi diizinkan:{' '}
                    {(cfg.allowedExtensions || []).join(', ').toUpperCase()}
                  </p>

                  <div>
                    <label className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50 cursor-pointer">
                      <Upload className="h-3.5 w-3.5" />
                      <span>Unggah Berkas ke S3 Privat</span>
                      <input
                        type="file"
                        multiple
                        className="hidden"
                        onChange={(e) => handleUploadStudentFiles(e.target.files)}
                      />
                    </label>
                  </div>

                  {uploadingFile && (
                    <div className="space-y-1 text-xs font-mono tabular-nums text-slate-600">
                      <div className="flex justify-between">
                        <span>Mengunggah {uploadingFile}...</span>
                        <span>{uploadPct}%</span>
                      </div>
                      <div className="h-1.5 w-full rounded-full bg-slate-200 overflow-hidden">
                        <div
                          className="h-full bg-slate-900"
                          style={{ width: `${uploadPct}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {uploadedFiles.length > 0 && (
                    <div className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                      {uploadedFiles.map((f, idx) => (
                        <div
                          key={f.objectKey || idx}
                          className="flex items-center justify-between gap-2 p-2.5 text-xs"
                        >
                          <div className="truncate">
                            <p className="font-semibold text-slate-900 truncate">
                              {f.originalName || f.fileName}
                            </p>
                            <p className="font-mono tabular-nums text-slate-500">
                              .{f.fileExtension} ·{' '}
                              {Math.max(1, Math.round((f.fileSize || 0) / 1024))}{' '}
                              KB
                            </p>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            {f.id && (
                              <button
                                type="button"
                                onClick={() => handlePreviewSubmissionFile(f)}
                                className="px-2 py-1 rounded border border-slate-200 hover:bg-slate-50 font-medium cursor-pointer"
                              >
                                Pratinjau
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() =>
                                setUploadedFiles((prev) =>
                                  prev.filter((_, i) => i !== idx)
                                )
                              }
                              className="p-1 text-rose-600 hover:bg-rose-50 rounded cursor-pointer"
                              title="Hapus Berkas"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* C. External HTTPS Links */}
              {cfg.allowExternalLinks !== false && (
                <div className="space-y-3 pt-3 border-t border-slate-100">
                  <label className="block text-xs font-bold text-slate-800">
                    C. Tautan Eksternal HTTPS (GitHub, Google Drive, Figma, Demo)
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <Input
                      value={newLinkUrl}
                      onChange={(e) => setNewLinkUrl(e.target.value)}
                      placeholder="https://github.com/..."
                      className="text-xs h-9"
                    />
                    <Input
                      value={newLinkTitle}
                      onChange={(e) => setNewLinkTitle(e.target.value)}
                      placeholder="Judul tautan (opsional)"
                      className="text-xs h-9"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Input
                      value={newLinkDesc}
                      onChange={(e) => setNewLinkDesc(e.target.value)}
                      placeholder="Keterangan singkat tautan..."
                      className="text-xs h-9"
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={handleAddExternalLink}
                    >
                      <Plus className="h-3.5 w-3.5" />
                      <span>Tambah</span>
                    </Button>
                  </div>

                  {externalLinks.length > 0 && (
                    <div className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                      {externalLinks.map((lnk, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between gap-2 p-2.5 text-xs"
                        >
                          <div className="truncate">
                            <a
                              href={lnk.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="font-semibold text-amber-700 hover:underline inline-flex items-center gap-1"
                            >
                              <span>{lnk.title || lnk.url}</span>
                              <ExternalLink className="h-3 w-3" />
                            </a>
                            <p className="text-slate-500 truncate">{lnk.url}</p>
                          </div>
                          <button
                            type="button"
                            onClick={() =>
                              setExternalLinks((prev) =>
                                prev.filter((_, i) => i !== idx)
                              )
                            }
                            className="p-1 text-rose-600 hover:bg-rose-50 rounded cursor-pointer"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Actions */}
              <div className="flex flex-wrap items-center justify-end gap-2 pt-4 border-t border-slate-100">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => submitMutation.mutate(true)}
                  disabled={submitMutation.isPending}
                >
                  <Save className="h-3.5 w-3.5" />
                  <span>Simpan Draf</span>
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="accent"
                  onClick={() => setConfirmModalOpen(true)}
                  disabled={submitMutation.isPending}
                >
                  <Send className="h-3.5 w-3.5" />
                  <span>
                    {mySub && mySub.status !== 'draft'
                      ? 'Kumpulkan Versi Baru'
                      : 'Kumpulkan Tugas Sekarang'}
                  </span>
                </Button>
              </div>
            </section>
            ) : (
              <section className="rounded-xl border border-amber-200 bg-amber-50/70 p-5 text-xs text-amber-950 space-y-1.5">
                <p className="font-bold">Mode Auditor (Read-Only)</p>
                <p className="text-amber-900">
                  Anda sedang mengakses halaman tugas dalam mode audit hanya-baca. Pengumpulan jawaban, unggah berkas, dan perubahan data dinonaktifkan.
                </p>
              </section>
            )}

            {/* STUDENT-INSTRUCTOR SUBMISSION DISCUSSION */}
            <section className="rounded-xl border border-slate-200 bg-white p-6 space-y-4">
              <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
                <MessageSquare className="h-4 w-4 text-slate-700" />
                <h3 className="text-sm font-bold text-slate-900">
                  Diskusi & Konsultasi Pengumpulan (Mahasiswa — Dosen)
                </h3>
              </div>

              {!mySub?.comments || mySub.comments.length === 0 ? (
                <p className="text-xs text-slate-500">
                  Belum ada catatan diskusi pada pengumpulan ini.
                </p>
              ) : (
                <div className="space-y-2.5 max-h-64 overflow-y-auto pr-1">
                  {mySub.comments.map((c: any) => (
                    <div
                      key={c.id}
                      className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs space-y-1"
                    >
                      <div className="flex items-center justify-between font-mono tabular-nums text-slate-500">
                        <span className="font-bold text-slate-900 font-sans">
                          {c.authorName}
                        </span>
                        <span>
                          {new Date(c.createdAt).toLocaleString('id-ID')}
                        </span>
                      </div>
                      <p className="text-slate-700">{c.content}</p>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex items-center gap-2 pt-1">
                <Input
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  placeholder="Tulis pertanyaan atau konfirmasi ke Dosen..."
                  className="h-9 text-xs"
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => commentMutation.mutate()}
                  disabled={commentMutation.isPending || !commentText.trim()}
                >
                  <Send className="h-3.5 w-3.5" />
                  <span>Kirim</span>
                </Button>
              </div>
            </section>
          </div>
        </div>
      </main>

      {/* PRE-SUBMISSION CONFIRMATION DIALOG */}
      <ModalDialog
        open={confirmModalOpen}
        onClose={() => setConfirmModalOpen(false)}
        title="Konfirmasi Pengumpulan Tugas Akhir"
      >
        <div className="space-y-4 text-xs">
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3.5 space-y-1.5">
            <p className="font-bold text-slate-900">{asg.title}</p>
            <p className="font-mono tabular-nums text-slate-600">
              Status Batas Waktu:{' '}
              <span
                className={
                  isPastDue
                    ? 'text-rose-600 font-bold'
                    : 'text-emerald-700 font-bold'
                }
              >
                {isPastDue
                  ? 'TERLAMBAT (Melewati Tenggat Waktu)'
                  : 'TEPAT WAKTU (Sebelum Tenggat)'}
              </span>
            </p>
          </div>

          <div className="space-y-2">
            <p className="font-semibold text-slate-800">
              Ringkasan Komponen yang Akan Dikumpulkan:
            </p>
            <ul className="space-y-1 text-slate-600 list-disc pl-4">
              <li>
                Jawaban Teks:{' '}
                {submissionText.trim()
                  ? `${submissionText.trim().length} karakter`
                  : 'Tidak ada teks'}
              </li>
              <li>Berkas Lampiran S3: {uploadedFiles.length} berkas</li>
              <li>Tautan Eksternal HTTPS: {externalLinks.length} tautan</li>
            </ul>
          </div>

          {uploadedFiles.length > 0 && (
            <div className="rounded-lg border border-slate-200 p-3 space-y-1">
              <p className="font-semibold text-slate-800">Daftar Berkas:</p>
              {uploadedFiles.map((f, i) => (
                <p key={i} className="font-mono text-slate-600 truncate">
                  {i + 1}. {f.originalName || f.fileName} (.{f.fileExtension})
                </p>
              ))}
            </div>
          )}

          {externalLinks.length > 0 && (
            <div className="rounded-lg border border-slate-200 p-3 space-y-1">
              <p className="font-semibold text-slate-800">Daftar Tautan:</p>
              {externalLinks.map((l, i) => (
                <p key={i} className="font-mono text-slate-600 truncate">
                  {i + 1}. {l.url}
                </p>
              ))}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setConfirmModalOpen(false)}
            >
              Periksa Kembali
            </Button>
            <Button
              type="button"
              variant="accent"
              onClick={() => submitMutation.mutate(false)}
              disabled={submitMutation.isPending}
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              <span>Ya, Kumpulkan Sekarang</span>
            </Button>
          </div>
        </div>
      </ModalDialog>

      <DocumentPreviewModal
        open={Boolean(previewTarget)}
        onClose={() => setPreviewTarget(null)}
        attachment={previewTarget?.attachment || null}
        preview={previewTarget?.preview || null}
      />
    </div>
  );
}
