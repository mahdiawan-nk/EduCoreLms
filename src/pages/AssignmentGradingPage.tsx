import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Award,
  CheckCircle2,
  Clock,
  Download,
  Eye,
  FileText,
  History,
  Link as LinkIcon,
  Lock,
  MessageSquare,
  RotateCcw,
  Save,
  Send,
  ShieldAlert,
  User,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import { TiptapReadOnlyRenderer } from '../components/TiptapMaterialEditor';
import { DocumentPreviewModal } from '../components/DocumentPreviewModal';

export const AssignmentGradingPage: React.FC = () => {
  const { classroomId, assignmentId, submissionId } = useParams<{
    classroomId: string;
    assignmentId: string;
    submissionId: string;
  }>();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const [submission, setSubmission] = useState<any>(null);
  const [assignment, setAssignment] = useState<any>(null);
  const [student, setStudent] = useState<any>(null);
  const [versions, setVersions] = useState<any[]>([]);
  const [selectedVersionNumber, setSelectedVersionNumber] = useState<number | null>(null);
  const [attachments, setAttachments] = useState<any[]>([]);
  const [links, setLinks] = useState<any[]>([]);
  const [rubric, setRubric] = useState<any>(null);
  const [gradeHistory, setGradeHistory] = useState<any[]>([]);
  const [comments, setComments] = useState<any[]>([]);

  // Grading state
  const [gradingMethod, setGradingMethod] = useState<'DIRECT' | 'RUBRIC' | 'COMBINED'>('DIRECT');
  const [rawScore, setRawScore] = useState<number>(85);
  const [latePenaltyScore, setLatePenaltyScore] = useState<number>(0);
  const [feedbackJson, setFeedbackJson] = useState<any>({ type: 'doc', content: [{ type: 'paragraph' }] });
  const [feedbackText, setFeedbackText] = useState<string>('');
  const [privateNotes, setPrivateNotes] = useState<string>('');
  const [revisionInstructions, setRevisionInstructions] = useState<string>('');
  const [rubricScores, setRubricScores] = useState<
    Record<string, { score: number; feedback: string }>
  >({});

  // Comments state
  const [commentText, setCommentText] = useState('');
  const [commentVisibility, setCommentVisibility] = useState<'STUDENT_VISIBLE' | 'INSTRUCTOR_PRIVATE'>('STUDENT_VISIBLE');
  const [sendingComment, setSendingComment] = useState(false);

  // Preview Modal
  const [previewAttachmentId, setPreviewAttachmentId] = useState<string | null>(null);

  const loadSubmissionDetails = async () => {
    if (!submissionId) return;
    setLoading(true);
    setError('');
    try {
      const d = await apiFetch<any>(`/api/v1/submissions/${submissionId}`);
      const subObj = d.submission || d;
      setSubmission(subObj);
      setAssignment(d.assignment);
      setStudent(d.student);
      setVersions(d.versions || []);
      setSelectedVersionNumber(subObj.currentVersion || 1);
      setAttachments(d.attachments || []);
      setLinks(d.links || []);
      const resolvedRubric = d.rubric || d.assignment?.rubric || null;
      setRubric(resolvedRubric);
      setGradeHistory(d.gradeHistory || d.grade?.auditHistory || []);
      setComments(d.comments || []);

      // Initialize grading form
      if (d.grade) {
        setGradingMethod(
          (d.grade.gradingMethod as 'DIRECT' | 'RUBRIC' | 'COMBINED') || 'DIRECT'
        );
        setRawScore(Number(d.grade.rawScore ?? subObj.score ?? 85));
        setLatePenaltyScore(Number(d.grade.latePenaltyScore ?? 0));
        setFeedbackText(d.grade.generalFeedback || d.grade.feedbackText || subObj.feedback || '');
        if (d.grade.feedbackJson) setFeedbackJson(d.grade.feedbackJson);
        setPrivateNotes(d.grade.privateComment || d.grade.privateNotes || '');
      } else {
        setGradingMethod(resolvedRubric ? 'RUBRIC' : 'DIRECT');
        setRawScore(Number(subObj.score ?? 85));
      }

      if (resolvedRubric && resolvedRubric.criteria) {
        const initMap: Record<string, { score: number; feedback: string }> = {};
        const existingScores = d.rubricScores || d.grade?.rubricScores || [];
        for (const c of resolvedRubric.criteria) {
          const existing = existingScores.find((rs: any) => rs.criterionId === c.id);
          initMap[c.id] = {
            score: existing ? Number(existing.score) : Number(c.maxScore || 100),
            feedback: existing?.feedback || '',
          };
        }
        setRubricScores(initMap);
      }
    } catch (err: any) {
      setError(err.message || 'Gagal memuat detail pengumpulan mahasiswa');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSubmissionDetails();
  }, [submissionId]);

  const computeRubricScore = () => {
    if (!rubric || !rubric.criteria || rubric.criteria.length === 0) return rawScore;
    let totalWeight = 0;
    let weightedAcc = 0;
    for (const c of rubric.criteria) {
      const entry = rubricScores[c.id];
      const s = entry ? Number(entry.score) : 0;
      const w = Number(c.weight || 0);
      totalWeight += w;
      if (w > 0 && Number(c.maxScore) > 0) {
        weightedAcc += (s / Number(c.maxScore)) * w;
      } else {
        weightedAcc += s;
      }
    }
    return totalWeight > 0 ? Math.round(weightedAcc * 100) / 100 : Math.round(weightedAcc * 100) / 100;
  };

  const calculatedFinalPreview = () => {
    const base =
      gradingMethod === 'RUBRIC' || gradingMethod === 'COMBINED'
        ? computeRubricScore()
        : Number(rawScore || 0);
    return Math.max(0, Math.round((base - Number(latePenaltyScore || 0)) * 100) / 100);
  };

  const handleSaveGrade = async (publish: boolean) => {
    if (!submissionId) return;
    setSaving(true);
    setError('');
    setSuccessMsg('');
    try {
      const rubricScoresArray =
        rubric?.criteria?.map((c: any) => ({
          criterionId: c.id,
          score: Number(rubricScores[c.id]?.score || 0),
          feedback: rubricScores[c.id]?.feedback || '',
        })) || [];

      await apiFetch(`/api/v1/submissions/${submissionId}/grade`, {
        method: 'POST',
        body: JSON.stringify({
          gradingMethod,
          rawScore: Number(rawScore),
          latePenaltyScore: Number(latePenaltyScore),
          feedbackText,
          feedbackJson,
          privateNotes,
          publish,
          rubricScores: rubricScoresArray,
        }),
      });

      setSuccessMsg(
        publish
          ? 'Nilai berhasil disimpan dan dipublikasikan ke mahasiswa.'
          : 'Draf nilai berhasil disimpan (belum terlihat oleh mahasiswa).'
      );
      await loadSubmissionDetails();
    } catch (err: any) {
      setError(err.message || 'Gagal menyimpan penilaian');
    } finally {
      setSaving(false);
    }
  };

  const handleReturnForRevision = async () => {
    if (!submissionId) return;
    if (!revisionInstructions.trim() && !feedbackText.trim()) {
      setError('Mohon isi instruksi revisi atau umpan balik terlebih dahulu.');
      return;
    }
    setSaving(true);
    setError('');
    setSuccessMsg('');
    try {
      await apiFetch(`/api/v1/submissions/${submissionId}/return`, {
        method: 'POST',
        body: JSON.stringify({
          feedbackText: feedbackText || revisionInstructions,
          revisionInstructions: revisionInstructions || feedbackText,
        }),
      });
      setSuccessMsg('Tugas berhasil dikembalikan kepada mahasiswa untuk direvisi.');
      await loadSubmissionDetails();
    } catch (err: any) {
      setError(err.message || 'Gagal mengembalikan tugas untuk revisi');
    } finally {
      setSaving(false);
    }
  };

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!submissionId || !commentText.trim()) return;
    setSendingComment(true);
    try {
      await apiFetch(`/api/v1/submissions/${submissionId}/comments`, {
        method: 'POST',
        body: JSON.stringify({
          contentText: commentText.trim(),
          visibility: commentVisibility,
        }),
      });
      setCommentText('');
      await loadSubmissionDetails();
    } catch (err: any) {
      setError(err.message || 'Gagal mengirim komentar');
    } finally {
      setSendingComment(false);
    }
  };

  const activeVersionObj =
    versions.find((v) => v.versionNumber === selectedVersionNumber) || null;

  const displayedAttachments = selectedVersionNumber
    ? attachments.filter((a) => !a.versionId || a.versionId === activeVersionObj?.id)
    : attachments;

  if (loading && !submission) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex items-center gap-3 text-slate-700 font-medium">
          <div className="w-5 h-5 border-2 border-amber-600 border-t-transparent rounded-full animate-spin" />
          Memuat Workspace Pemeriksaan & Penilaian Dosen...
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 pb-16">
      {/* Top Bar */}
      <header className="sticky top-0 z-30 bg-white border-b border-slate-200 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() =>
                navigate(`/classrooms/${classroomId}/assignments/${assignmentId}/monitoring`)
              }
              className="p-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 text-[11px] font-bold uppercase rounded bg-slate-900 text-white">
                  Grading Workspace
                </span>
                <span className="text-xs font-mono text-slate-500">
                  {student?.fullName} ({student?.studentNumber || student?.id?.slice(0, 8)})
                </span>
              </div>
              <h1 className="text-base font-bold text-slate-900 truncate max-w-xl">
                {assignment?.title}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={saving}
              onClick={() => handleSaveGrade(false)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold border border-slate-300 bg-white text-slate-800 hover:bg-slate-50"
            >
              <Save className="w-4 h-4" />
              Simpan Draf Nilai
            </button>

            <button
              type="button"
              disabled={saving}
              onClick={handleReturnForRevision}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold border border-purple-300 bg-purple-50 text-purple-900 hover:bg-purple-100"
            >
              <RotateCcw className="w-4 h-4" />
              Kembalikan untuk Revisi
            </button>

            <button
              type="button"
              disabled={saving}
              onClick={() => handleSaveGrade(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold bg-amber-600 hover:bg-amber-500 text-slate-950 shadow-xs"
            >
              <Award className="w-4 h-4" />
              Publikasikan Nilai ({calculatedFinalPreview()}/{assignment?.maxScore || 100})
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6">
        {error && (
          <div className="mb-6 p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-sm">
            {error}
          </div>
        )}
        {successMsg && (
          <div className="mb-6 p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm">
            {successMsg}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: Student Submission Inspection (7 cols) */}
          <div className="lg:col-span-7 space-y-6">
            {/* Student Metadata & Version Selector */}
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-full bg-slate-900 text-amber-400 flex items-center justify-center font-bold text-base">
                    {student?.fullName?.charAt(0) || 'M'}
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-slate-900">{student?.fullName}</h2>
                    <div className="flex items-center gap-3 text-xs text-slate-500">
                      <span className="font-mono font-semibold">
                        NIM: {student?.studentNumber || '—'}
                      </span>
                      <span>•</span>
                      <span>{student?.email}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <label className="text-xs font-bold text-slate-600">Versi Pengumpulan:</label>
                  <select
                    value={selectedVersionNumber || 1}
                    onChange={(e) => setSelectedVersionNumber(Number(e.target.value))}
                    className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-mono font-bold bg-slate-50"
                  >
                    {versions.length === 0 ? (
                      <option value={1}>Versi 1 (Terbaru)</option>
                    ) : (
                      versions.map((v) => (
                        <option key={v.id} value={v.versionNumber}>
                          Versi #{v.versionNumber} —{' '}
                          {new Date(v.submittedAt).toLocaleString('id-ID')}
                        </option>
                      ))
                    )}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 pt-4 border-t border-slate-100 text-xs">
                <div>
                  <span className="text-slate-400 block">Status Kumpul</span>
                  <span className="font-bold uppercase text-slate-900">
                    {submission?.submissionStatus || submission?.status}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block">Waktu Kumpul</span>
                  <span className="font-mono font-semibold text-slate-800">
                    {submission?.submittedAt
                      ? new Date(submission.submittedAt).toLocaleString('id-ID')
                      : '—'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block">Keterlambatan</span>
                  {submission?.isLate ? (
                    <span className="font-mono font-bold text-orange-700">
                      Terlambat {submission.lateMinutes} menit
                    </span>
                  ) : (
                    <span className="font-semibold text-emerald-700">Tepat Waktu</span>
                  )}
                </div>
                <div>
                  <span className="text-slate-400 block">Status Nilai</span>
                  <span className="font-bold text-slate-800">
                    {submission?.isGradePublished ? 'Dipublikasikan' : submission?.gradingStatus}
                  </span>
                </div>
              </div>
            </div>

            {/* Student Written Response */}
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs space-y-3">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <FileText className="w-4 h-4 text-amber-600" />
                Jawaban Tertulis Mahasiswa
              </h3>
              {activeVersionObj?.submissionContentJson || submission?.submissionContentJson ? (
                <div className="prose prose-slate max-w-none text-sm p-4 rounded-xl bg-slate-50 border border-slate-200">
                  <TiptapReadOnlyRenderer
                    contentJson={
                      activeVersionObj?.submissionContentJson || submission?.submissionContentJson
                    }
                  />
                </div>
              ) : submission?.submissionText || activeVersionObj?.submissionText ? (
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-sm whitespace-pre-wrap text-slate-800">
                  {activeVersionObj?.submissionText || submission?.submissionText}
                </div>
              ) : (
                <p className="text-xs text-slate-400 italic">
                  Mahasiswa tidak menyertakan jawaban teks tertulis.
                </p>
              )}
            </div>

            {/* Uploaded Student Attachments with In-App Preview */}
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs space-y-3">
              <h3 className="text-sm font-bold text-slate-900">
                Berkas Lampiran Mahasiswa ({displayedAttachments.length})
              </h3>
              {displayedAttachments.length === 0 ? (
                <p className="text-xs text-slate-400 italic">Tidak ada berkas yang diunggah.</p>
              ) : (
                <div className="space-y-2">
                  {displayedAttachments.map((att) => (
                    <div
                      key={att.id}
                      className="flex items-center justify-between p-3 rounded-xl border border-slate-200 bg-slate-50/70"
                    >
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-slate-900 truncate">
                          {att.originalName || att.fileName}
                        </p>
                        <p className="text-[11px] font-mono text-slate-500">
                          {(att.fileExtension || '').toUpperCase()} •{' '}
                          {Math.round((att.fileSize || 0) / 1024)} KB
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setPreviewAttachmentId(att.id)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-white border border-slate-300 text-slate-700 hover:bg-slate-100"
                        >
                          <Eye className="w-3.5 h-3.5 text-amber-600" />
                          Pratinjau
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Submitted External Links */}
            {links.length > 0 && (
              <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs space-y-3">
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <LinkIcon className="w-4 h-4 text-amber-600" />
                  Tautan Eksternal Mahasiswa ({links.length})
                </h3>
                <div className="space-y-2">
                  {links.map((lnk) => (
                    <a
                      key={lnk.id}
                      href={lnk.url}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center justify-between p-3 rounded-xl border border-slate-200 hover:border-amber-500 bg-slate-50 text-xs font-medium text-blue-700"
                    >
                      <span>{lnk.title || lnk.url}</span>
                      <span className="font-mono text-[11px] text-slate-500 truncate max-w-xs">
                        {lnk.url}
                      </span>
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* Threaded Discussion & Instructor-Private Comments */}
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs space-y-4">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-amber-600" />
                Diskusi Pengumpulan & Catatan Internal Dosen ({comments.length})
              </h3>

              <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
                {comments.length === 0 ? (
                  <p className="text-xs text-slate-400 italic">Belum ada komentar.</p>
                ) : (
                  comments.map((c) => (
                    <div
                      key={c.id}
                      className={`p-3 rounded-xl border text-xs ${
                        c.visibility === 'INSTRUCTOR_PRIVATE'
                          ? 'bg-amber-50/70 border-amber-300'
                          : 'bg-slate-50 border-slate-200'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-bold text-slate-900">
                          {c.authorName || 'Pengguna'}
                        </span>
                        <div className="flex items-center gap-2">
                          {c.visibility === 'INSTRUCTOR_PRIVATE' && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-200 text-amber-950 text-[10px] font-bold">
                              <Lock className="w-2.5 h-2.5" /> INTERNAL DOSEN
                            </span>
                          )}
                          <span className="text-[10px] font-mono text-slate-400">
                            {new Date(c.createdAt).toLocaleString('id-ID')}
                          </span>
                        </div>
                      </div>
                      <p className="text-slate-700 whitespace-pre-wrap">{c.contentText}</p>
                    </div>
                  ))
                )}
              </div>

              <form onSubmit={handleAddComment} className="space-y-2 pt-2 border-t border-slate-100">
                <div className="flex items-center gap-2">
                  <select
                    value={commentVisibility}
                    onChange={(e) =>
                      setCommentVisibility(
                        e.target.value as 'STUDENT_VISIBLE' | 'INSTRUCTOR_PRIVATE'
                      )
                    }
                    className="px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs font-semibold bg-white"
                  >
                    <option value="STUDENT_VISIBLE">Terlihat oleh Mahasiswa</option>
                    <option value="INSTRUCTOR_PRIVATE">Privat (Hanya Sesama Dosen)</option>
                  </select>
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    placeholder="Tulis umpan balik diskusi atau catatan internal..."
                    className="flex-1 px-3 py-2 rounded-lg border border-slate-300 text-xs"
                  />
                  <button
                    type="submit"
                    disabled={sendingComment}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-slate-900 text-white text-xs font-bold hover:bg-slate-800"
                  >
                    <Send className="w-3.5 h-3.5" />
                    Kirim
                  </button>
                </div>
              </form>
            </div>
          </div>

          {/* Right Column: Grading & Rubric Evaluation Panel (5 cols) */}
          <div className="lg:col-span-5 space-y-6">
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs space-y-5">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div>
                  <h2 className="text-sm font-bold text-slate-900">Panel Penilaian & Rubrik</h2>
                  <p className="text-xs text-slate-500">
                    Kalkulasi skor divalidasi di sisi server
                  </p>
                </div>
                <div className="text-right">
                  <div className="text-[10px] font-bold uppercase text-slate-400">Nilai Akhir</div>
                  <div className="text-2xl font-black font-mono text-amber-600">
                    {calculatedFinalPreview()}
                    <span className="text-xs font-normal text-slate-400">
                      /{assignment?.maxScore || 100}
                    </span>
                  </div>
                </div>
              </div>

              {/* Grading Method Selector */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Metode Penilaian
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(['DIRECT', 'RUBRIC', 'COMBINED'] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setGradingMethod(m)}
                      className={`py-2 px-3 rounded-lg text-xs font-bold border transition-all ${
                        gradingMethod === m
                          ? 'bg-slate-900 text-white border-slate-900'
                          : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {m === 'DIRECT'
                        ? 'Skor Langsung'
                        : m === 'RUBRIC'
                        ? 'Berbasis Rubrik'
                        : 'Kombinasi'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Rubric Criteria Evaluation */}
              {(gradingMethod === 'RUBRIC' || gradingMethod === 'COMBINED') &&
                rubric &&
                rubric.criteria?.length > 0 && (
                  <div className="space-y-3 pt-2">
                    <div className="text-xs font-bold text-slate-800">
                      Kriteria Rubrik ({rubric.title})
                    </div>
                    {rubric.criteria.map((c: any) => {
                      const currentVal = rubricScores[c.id]?.score ?? 0;
                      return (
                        <div
                          key={c.id}
                          className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/70 space-y-2"
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <div className="text-xs font-bold text-slate-900">{c.title}</div>
                              <div className="text-[11px] text-slate-500">{c.description}</div>
                            </div>
                            <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-900 font-mono text-[11px] font-bold">
                              Bobot {c.weight}%
                            </span>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
                            <div>
                              <label className="block text-[10px] font-bold uppercase text-slate-500">
                                Skor (Maks {c.maxScore})
                              </label>
                              <input
                                type="number"
                                min={0}
                                max={Number(c.maxScore || 100)}
                                value={currentVal}
                                onChange={(e) =>
                                  setRubricScores((prev) => ({
                                    ...prev,
                                    [c.id]: {
                                      score: Math.min(
                                        Number(c.maxScore || 100),
                                        Math.max(0, Number(e.target.value))
                                      ),
                                      feedback: prev[c.id]?.feedback || '',
                                    },
                                  }))
                                }
                                className="w-full mt-1 px-2.5 py-1.5 rounded-lg border border-slate-300 font-mono text-xs font-bold bg-white"
                              />
                            </div>
                            <div className="sm:col-span-2">
                              <label className="block text-[10px] font-bold uppercase text-slate-500">
                                Catatan Kriteria
                              </label>
                              <input
                                type="text"
                                value={rubricScores[c.id]?.feedback || ''}
                                onChange={(e) =>
                                  setRubricScores((prev) => ({
                                    ...prev,
                                    [c.id]: {
                                      score: prev[c.id]?.score ?? 0,
                                      feedback: e.target.value,
                                    },
                                  }))
                                }
                                placeholder="Komentar spesifik kriteria..."
                                className="w-full mt-1 px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs bg-white"
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

              {/* Direct Score & Penalty */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Skor Mentah (Maks {assignment?.maxScore || 100})
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={Number(assignment?.maxScore || 100)}
                    disabled={gradingMethod === 'RUBRIC' && rubric?.criteria?.length > 0}
                    value={
                      gradingMethod === 'RUBRIC' && rubric?.criteria?.length > 0
                        ? computeRubricScore()
                        : rawScore
                    }
                    onChange={(e) => setRawScore(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 font-mono text-sm font-bold"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Penalti Keterlambatan (Poin)
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={latePenaltyScore}
                    onChange={(e) => setLatePenaltyScore(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 font-mono text-sm font-bold text-rose-700"
                  />
                </div>
              </div>

              {/* General Feedback */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Umpan Balik Umum (Terlihat oleh Mahasiswa Saat Nilai Dipublikasikan)
                </label>
                <textarea
                  rows={3}
                  value={feedbackText}
                  onChange={(e) => setFeedbackText(e.target.value)}
                  placeholder="Berikan evaluasi menyeluruh atas hasil pekerjaan mahasiswa..."
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs"
                />
              </div>

              {/* Revision Instructions */}
              <div>
                <label className="block text-xs font-bold text-purple-800 mb-1">
                  Instruksi Revisi (Jika Dikembalikan untuk Revisi)
                </label>
                <textarea
                  rows={2}
                  value={revisionInstructions}
                  onChange={(e) => setRevisionInstructions(e.target.value)}
                  placeholder="Jelaskan bagian yang wajib diperbaiki sebelum mahasiswa mengumpulkan ulang..."
                  className="w-full px-3 py-2 rounded-lg border border-purple-200 bg-purple-50/40 text-xs"
                />
              </div>

              {/* Private Instructor Notes */}
              <div>
                <label className="block text-xs font-bold text-amber-900 mb-1 flex items-center gap-1">
                  <Lock className="w-3 h-3" /> Catatan Rahasia Dosen (Tidak Pernah Terlihat oleh Mahasiswa)
                </label>
                <textarea
                  rows={2}
                  value={privateNotes}
                  onChange={(e) => setPrivateNotes(e.target.value)}
                  placeholder="Catatan internal tim pengajar..."
                  className="w-full px-3 py-2 rounded-lg border border-amber-300 bg-amber-50/50 text-xs"
                />
              </div>
            </div>

            {/* Grade Audit History */}
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                <History className="w-3.5 h-3.5 text-amber-600" />
                Riwayat Audit Penilaian ({gradeHistory.length})
              </h3>
              {gradeHistory.length === 0 ? (
                <p className="text-xs text-slate-400 italic">Belum ada riwayat penilaian.</p>
              ) : (
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {gradeHistory.map((gh) => (
                    <div
                      key={gh.id}
                      className="p-2.5 rounded-lg border border-slate-200 bg-slate-50 text-xs flex items-center justify-between"
                    >
                      <div>
                        <span className="font-mono font-bold text-slate-900">
                          Skor Akhir: {gh.finalScore}
                        </span>
                        <span className="ml-2 text-[11px] text-slate-500">
                          ({gh.gradingMethod})
                        </span>
                        <div className="text-[10px] text-slate-400">
                          {new Date(gh.gradedAt).toLocaleString('id-ID')}
                        </div>
                      </div>
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          gh.isPublished
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {gh.isPublished ? 'DIPUBLIKASIKAN' : 'DRAF'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>

      {previewAttachmentId && submissionId && (
        <DocumentPreviewModal
          submissionId={submissionId}
          attachmentId={previewAttachmentId}
          onClose={() => setPreviewAttachmentId(null)}
        />
      )}
    </div>
  );
};
export default AssignmentGradingPage;
