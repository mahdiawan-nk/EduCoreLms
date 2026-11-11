import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Award,
  CheckCircle2,
  Download,
  FileText,
  History,
  Save,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import { TiptapReadOnlyRenderer } from '../components/TiptapMaterialEditor';
import { toast } from 'sonner';

export const AssessmentEssayGradingPage: React.FC = () => {
  const { classroomId, assessmentId, attemptId } = useParams<{
    classroomId: string;
    assessmentId: string;
    attemptId: string;
  }>();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [attempt, setAttempt] = useState<any>(null);
  const [assessment, setAssessment] = useState<any>(null);
  const [student, setStudent] = useState<any>(null);
  const [questions, setQuestions] = useState<any[]>([]);
  const [generalFeedback, setGeneralFeedback] = useState('');

  // Map of attemptQuestionId -> grading state
  const [gradeInputs, setGradeInputs] = useState<
    Record<
      string,
      {
        gradingMethod: 'DIRECT' | 'RUBRIC';
        rawScore: number;
        criterionScores: Array<{
          criterionId: string;
          score: number;
          feedback: string;
        }>;
        feedback: string;
        privateFeedback: string;
      }
    >
  >({});

  const loadGradingWorkspace = async () => {
    if (!attemptId) return;
    setLoading(true);
    try {
      const res = await apiFetch<any>(`/api/v1/attempts/${attemptId}/grading`);
      setAttempt(res.attempt);
      setAssessment(res.assessment);
      setStudent(res.student);
      setQuestions(res.questions || []);
      setGeneralFeedback(res.attempt?.generalFeedback || '');

      const initInputs: Record<string, any> = {};
      for (const q of res.questions || []) {
        if (q.questionMode === 'ESSAY' || q.answer?.requiresManualReview) {
          const eg = q.essayGrade;
          const rubCriteria = q.rubricSnapshot?.criteria || [];
          const existingCritScores = eg?.criterionScores || [];

          initInputs[q.id] = {
            gradingMethod:
              eg?.gradingMethod ||
              (rubCriteria.length > 0 ? 'RUBRIC' : 'DIRECT'),
            rawScore: Number(
              eg?.finalScore ?? q.answer?.manualScore ?? q.points ?? 10
            ),
            criterionScores: rubCriteria.map((c: any) => {
              const found = existingCritScores.find(
                (cs: any) =>
                  cs.criterionId === c.id || cs.criterionName === c.criterionName
              );
              return {
                criterionId: c.id || c.criterionName,
                score: found ? Number(found.score) : Number(c.maxScore || 10),
                feedback: found?.feedback || '',
              };
            }),
            feedback: eg?.feedback || '',
            privateFeedback: '',
          };
        }
      }
      setGradeInputs(initInputs);
    } catch (err: any) {
      toast.error(err.message || 'Gagal memuat workspace penilaian esai');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadGradingWorkspace();
  }, [attemptId]);

  const computeQuestionPreviewScore = (q: any) => {
    const inp = gradeInputs[q.id];
    if (!inp) return 0;
    const qMax = Number(q.points || 10);
    const rubCriteria = q.rubricSnapshot?.criteria || [];

    if (inp.gradingMethod === 'RUBRIC' && rubCriteria.length > 0) {
      let totalWeight = 0;
      let weightedRatioSum = 0;
      for (const c of rubCriteria) {
        const cMax = Math.max(1, Number(c.maxScore || 10));
        const cWeight = Math.max(0, Number(c.weight || 0));
        const cs = inp.criterionScores.find(
          (item) =>
            item.criterionId === c.id || item.criterionId === c.criterionName
        );
        const s = Math.max(0, Math.min(cMax, Number(cs?.score ?? 0)));
        totalWeight += cWeight;
        weightedRatioSum += (s / cMax) * cWeight;
      }
      const ratio = totalWeight > 0 ? weightedRatioSum / totalWeight : 0;
      return Math.round(ratio * qMax * 100) / 100;
    }

    return Math.max(0, Math.min(qMax, Number(inp.rawScore || 0)));
  };

  const handleSaveEssayGrades = async (
    isDraft: boolean,
    publishToStudent: boolean
  ) => {
    if (!attemptId) return;
    setSaving(true);
    try {
      const gradesArray = Object.entries(gradeInputs).map(
        ([attemptQuestionId, val]) => ({
          attemptQuestionId,
          gradingMethod: val.gradingMethod,
          rawScore: Number(val.rawScore),
          criterionScores: val.criterionScores,
          feedback: val.feedback,
          privateFeedback: val.privateFeedback,
        })
      );

      await apiFetch(`/api/v1/attempts/${attemptId}/essay-grades`, {
        method: 'POST',
        body: JSON.stringify({
          isDraft,
          publishToStudent,
          generalFeedback,
          grades: gradesArray,
        }),
      });

      toast.success(
        isDraft
          ? 'Draf penilaian esai berhasil disimpan (belum terlihat oleh mahasiswa).'
          : publishToStudent
          ? 'Nilai esai & skor akhir berhasil disimpan dan dipublikasikan ke mahasiswa.'
          : 'Nilai esai berhasil disimpan dan siap dipublikasikan.'
      );
      await loadGradingWorkspace();
    } catch (err: any) {
      toast.error(err.message || 'Gagal menyimpan penilaian esai');
    } finally {
      setSaving(false);
    }
  };

  if (loading && !attempt) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex items-center gap-3 text-slate-700 font-medium text-sm">
          <div className="w-5 h-5 border-2 border-amber-600 border-t-transparent rounded-full animate-spin" />
          Memuat Workspace Penilaian Esai & Hybrid...
        </div>
      </div>
    );
  }

  const objectiveQuestions = questions.filter(
    (q) => q.questionMode === 'OBJECTIVE' && !q.answer?.requiresManualReview
  );
  const manualQuestions = questions.filter(
    (q) => q.questionMode === 'ESSAY' || q.answer?.requiresManualReview
  );

  const previewEssayTotal =
    Math.round(
      manualQuestions.reduce(
        (acc, q) => acc + computeQuestionPreviewScore(q),
        0
      ) * 100
    ) / 100;
  const objectiveTotal = Number(attempt?.objectiveScore || 0);
  const combinedTotal =
    Math.round((objectiveTotal + previewEssayTotal) * 100) / 100;

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 pb-20">
      <header className="sticky top-0 z-30 bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() =>
                navigate(
                  `/classrooms/${classroomId}/assessments/${assessmentId}/monitoring`
                )
              }
              className="p-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 shrink-0"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-xs text-slate-500 font-mono">
                <span className="font-bold text-slate-900">
                  Essay & Hybrid Grading Workspace
                </span>
                <span>·</span>
                <span>
                  {student?.fullName} ({student?.studentNumber || 'Mahasiswa'})
                </span>
              </div>
              <h1 className="text-base font-bold text-slate-900 truncate">
                {assessment?.title}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              disabled={saving}
              onClick={() => handleSaveEssayGrades(true, false)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-800 hover:bg-slate-50 whitespace-nowrap"
            >
              <Save className="w-4 h-4" />
              Simpan Draf Nilai
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => handleSaveEssayGrades(false, false)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-slate-900 text-white text-xs font-bold hover:bg-slate-800 whitespace-nowrap"
            >
              <CheckCircle2 className="w-4 h-4 text-amber-400" />
              Simpan Nilai Final
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => handleSaveEssayGrades(false, true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold whitespace-nowrap"
            >
              <Award className="w-4 h-4" />
              Publikasikan ke Mahasiswa ({combinedTotal}/
              {assessment?.maxScore || 100})
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 space-y-6">
        {/* Hybrid Score Breakdown Banner */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="text-xs text-slate-500">
              Skor Bagian Objektif (Otomatis)
            </div>
            <div className="text-2xl font-black font-mono tabular-nums text-slate-900 mt-1">
              {objectiveTotal} Poin
            </div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="text-xs text-slate-500">
              Skor Bagian Esai (Manual / Rubrik)
            </div>
            <div className="text-2xl font-black font-mono tabular-nums text-amber-700 mt-1">
              {previewEssayTotal} Poin
            </div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="text-xs text-slate-500">Status Penilaian Esai</div>
            <div className="text-base font-bold font-mono text-slate-900 mt-2">
              {attempt?.essayGradingStatus}
            </div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="text-xs text-slate-500">
              Total Skor Akhir Gabungan
            </div>
            <div className="text-2xl font-black font-mono tabular-nums text-emerald-700 mt-1">
              {combinedTotal} / {assessment?.maxScore || 100}
            </div>
          </div>
        </div>

        {/* Manual / Essay Questions Evaluation */}
        <div className="space-y-6">
          <h2 className="text-base font-bold text-slate-900">
            01. Evaluasi Jawaban Esai & Studi Kasus Mahasiswa ({manualQuestions.length} Soal)
          </h2>

          {manualQuestions.map((q, idx) => {
            const inp = gradeInputs[q.id] || {
              gradingMethod: 'DIRECT',
              rawScore: 0,
              criterionScores: [],
              feedback: '',
              privateFeedback: '',
            };
            const rubCriteria = q.rubricSnapshot?.criteria || [];
            const payload = q.answer?.answerPayload || {};

            return (
              <div
                key={q.id}
                className="bg-white rounded-xl border border-slate-200 p-6 grid grid-cols-1 lg:grid-cols-12 gap-6"
              >
                {/* Left: Student Response & Attachments (7 cols) */}
                <div className="lg:col-span-7 space-y-4">
                  <div className="flex items-center justify-between text-xs font-mono text-slate-500 border-b border-slate-100 pb-3">
                    <span className="font-bold text-slate-900">
                      Soal Esai #{idx + 1} ({q.questionType})
                    </span>
                    <span>Bobot Maksimum: {q.points} Poin</span>
                  </div>

                  <p className="text-sm font-bold text-slate-900">
                    {q.promptText}
                  </p>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs text-slate-500">
                      <span className="font-bold text-slate-700 flex items-center gap-1.5">
                        <FileText className="w-3.5 h-3.5 text-amber-600" />
                        Jawaban Tertulis Mahasiswa:
                      </span>
                      {payload.wordCount !== undefined && (
                        <span className="font-mono">
                          {payload.wordCount} kata
                        </span>
                      )}
                    </div>

                    {payload.essayJson ? (
                      <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 prose prose-slate max-w-none text-sm">
                        <TiptapReadOnlyRenderer
                          contentJson={payload.essayJson}
                        />
                      </div>
                    ) : payload.essayText || payload.shortAnswerText ? (
                      <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-sm whitespace-pre-wrap text-slate-800">
                        {payload.essayText || payload.shortAnswerText}
                      </div>
                    ) : (
                      <p className="text-xs text-slate-400 italic">
                        Mahasiswa tidak mengisi jawaban teks pada soal ini.
                      </p>
                    )}
                  </div>

                  {/* Essay Attachments */}
                  {(q.attachments || []).length > 0 && (
                    <div className="space-y-2 pt-2">
                      <span className="text-xs font-bold text-slate-700 block">
                        Berkas Lampiran Esai ({q.attachments.length}):
                      </span>
                      {q.attachments.map((att: any) => (
                        <div
                          key={att.id}
                          className="flex items-center justify-between p-3 rounded-xl border border-slate-200 bg-slate-50 text-xs"
                        >
                          <span className="font-mono font-semibold">
                            {att.originalName} (
                            {Math.round((att.fileSize || 0) / 1024)} KB)
                          </span>
                          <a
                            href={att.downloadUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-white border border-slate-300 font-semibold text-slate-800 hover:bg-slate-100"
                          >
                            <Download className="w-3.5 h-3.5" /> Unduh
                          </a>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Audit History */}
                  {q.essayGrade?.auditHistory?.length > 0 && (
                    <div className="pt-3 border-t border-slate-100 space-y-1.5">
                      <span className="text-[11px] font-bold uppercase text-slate-500 flex items-center gap-1">
                        <History className="w-3.5 h-3.5" /> Riwayat Revisi Nilai
                        Esai ({q.essayGrade.auditHistory.length})
                      </span>
                      <div className="space-y-1">
                        {q.essayGrade.auditHistory.map(
                          (ah: any, aIdx: number) => (
                            <div
                              key={aIdx}
                              className="text-[11px] font-mono text-slate-500"
                            >
                              Revisi #{ah.revisionNumber}: Skor {ah.newScore} (
                              {new Date(ah.gradedAt).toLocaleString('id-ID')})
                            </div>
                          )
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Right: Rubric & Score Panel (5 cols) */}
                <div className="lg:col-span-5 bg-slate-50 rounded-xl border border-slate-200 p-5 space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                    <span className="text-xs font-bold text-slate-900">
                      Panel Skor & Rubrik Soal
                    </span>
                    <span className="font-mono text-base font-black text-amber-700">
                      {computeQuestionPreviewScore(q)} / {q.points} Poin
                    </span>
                  </div>

                  {rubCriteria.length > 0 && (
                    <div className="grid grid-cols-2 gap-2">
                      {(['RUBRIC', 'DIRECT'] as const).map((m) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() =>
                            setGradeInputs((prev) => ({
                              ...prev,
                              [q.id]: { ...inp, gradingMethod: m },
                            }))
                          }
                          className={`py-1.5 px-3 rounded-lg text-xs font-bold border ${
                            inp.gradingMethod === m
                              ? 'bg-slate-900 text-white border-slate-900'
                              : 'bg-white text-slate-700 border-slate-300'
                          }`}
                        >
                          {m === 'RUBRIC'
                            ? 'Penilaian Rubrik'
                            : 'Skor Langsung'}
                        </button>
                      ))}
                    </div>
                  )}

                  {inp.gradingMethod === 'RUBRIC' && rubCriteria.length > 0 ? (
                    <div className="space-y-3">
                      {rubCriteria.map((crit: any, cIdx: number) => {
                        const cId = crit.id || crit.criterionName;
                        const cEntry = inp.criterionScores.find(
                          (cs) => cs.criterionId === cId
                        ) || { score: 0, feedback: '' };

                        return (
                          <div
                            key={cIdx}
                            className="p-3 rounded-lg bg-white border border-slate-200 space-y-2 text-xs"
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-slate-900">
                                {crit.criterionName}
                              </span>
                              <span className="font-mono text-[11px] text-amber-800 font-bold">
                                Bobot {crit.weight}% (Maks {crit.maxScore})
                              </span>
                            </div>
                            <input
                              type="number"
                              min={0}
                              max={Number(crit.maxScore || 25)}
                              value={cEntry.score}
                              onChange={(e) => {
                                const nextScore = Number(e.target.value);
                                setGradeInputs((prev) => ({
                                  ...prev,
                                  [q.id]: {
                                    ...inp,
                                    criterionScores: inp.criterionScores.map(
                                      (cs) =>
                                        cs.criterionId === cId
                                          ? { ...cs, score: nextScore }
                                          : cs
                                    ),
                                  },
                                }));
                              }}
                              className="w-full px-2.5 py-1.5 rounded border border-slate-300 font-mono font-bold"
                            />
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Skor Langsung (Maksimum {q.points} Poin)
                      </label>
                      <input
                        type="number"
                        min={0}
                        max={Number(q.points || 10)}
                        value={inp.rawScore}
                        onChange={(e) =>
                          setGradeInputs((prev) => ({
                            ...prev,
                            [q.id]: {
                              ...inp,
                              rawScore: Number(e.target.value),
                            },
                          }))
                        }
                        className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white font-mono text-sm font-bold"
                      />
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Umpan Balik ke Mahasiswa
                    </label>
                    <textarea
                      rows={2}
                      value={inp.feedback}
                      onChange={(e) =>
                        setGradeInputs((prev) => ({
                          ...prev,
                          [q.id]: { ...inp, feedback: e.target.value },
                        }))
                      }
                      placeholder="Berikan catatan evaluasi jawaban esai..."
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-xs"
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* General Attempt Feedback */}
        <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-3">
          <label className="block text-sm font-bold text-slate-900">
            Catatan & Umpan Balik Umum Ujian
          </label>
          <textarea
            rows={2}
            value={generalFeedback}
            onChange={(e) => setGeneralFeedback(e.target.value)}
            placeholder="Ringkasan evaluasi keseluruhan hasil ujian mahasiswa..."
            className="w-full px-3.5 py-2 rounded-lg border border-slate-300 text-xs"
          />
        </div>

        {/* Objective Questions Summary */}
        {objectiveQuestions.length > 0 && (
          <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
            <h2 className="text-base font-bold text-slate-900">
              02. Ringkasan Hasil Bagian Objektif Otomatis ({objectiveQuestions.length} Soal)
            </h2>
            <div className="divide-y divide-slate-100">
              {objectiveQuestions.map((oq, idx) => (
                <div
                  key={oq.id}
                  className="py-3 flex items-center justify-between gap-4 text-xs"
                >
                  <div>
                    <span className="font-mono font-bold text-slate-900 mr-2">
                      #{idx + 1} [{oq.questionType}]
                    </span>
                    <span className="text-slate-700">{oq.promptText}</span>
                  </div>
                  <span
                    className={`font-mono font-bold shrink-0 ${
                      oq.answer?.isCorrect
                        ? 'text-emerald-700'
                        : 'text-slate-600'
                    }`}
                  >
                    Skor: {oq.answer?.autoScore ?? 0} / {oq.points}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default AssessmentEssayGradingPage;
