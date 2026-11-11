import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Award,
  CheckCircle2,
  Clock,
  Flag,
  Play,
  Send,
  Upload,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import {
  TiptapMaterialEditor,
  TiptapReadOnlyRenderer,
} from '../components/TiptapMaterialEditor';
import { toast } from 'sonner';

export const AssessmentExaminationPage: React.FC = () => {
  const { classroomId, assessmentId } = useParams<{
    classroomId: string;
    assessmentId: string;
  }>();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [assessment, setAssessment] = useState<any>(null);
  const [activeAttempt, setActiveAttempt] = useState<any>(null);
  const [questions, setQuestions] = useState<any[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [autosaveStatus, setAutosaveStatus] = useState<
    'IDLE' | 'SAVING' | 'SAVED' | 'ERROR'
  >('IDLE');
  const [submitting, setSubmitting] = useState(false);
  const [confirmSubmitOpen, setConfirmSubmitOpen] = useState(false);
  const [uploadingEssayFile, setUploadingEssayFile] = useState(false);

  const autoSubmittedRef = useRef(false);

  const loadAssessmentOverview = async () => {
    if (!assessmentId) return;
    setLoading(true);
    try {
      const data = await apiFetch<any>(`/api/v1/assessments/${assessmentId}`);
      setAssessment(data.assessment);

      // Check if an IN_PROGRESS attempt exists and auto-resume it
      const inProg = (data.assessment?.myAttempts || []).find(
        (a: any) => a.status === 'IN_PROGRESS'
      );
      if (inProg) {
        await resumeOrLoadAttempt(inProg.id);
      }
    } catch (err: any) {
      toast.error(err.message || 'Gagal memuat detail ujian');
    } finally {
      setLoading(false);
    }
  };

  const resumeOrLoadAttempt = async (attemptId: string) => {
    try {
      const attRes = await apiFetch<any>(`/api/v1/attempts/${attemptId}`);
      setActiveAttempt(attRes.attempt);
      setRemainingSeconds(attRes.remainingSeconds ?? 0);

      const qRes = await apiFetch<any>(`/api/v1/attempts/${attemptId}/questions`);
      const loadedQs = qRes.questions || [];

      // Initialize ordering items if not yet answered
      const initializedQs = loadedQs.map((q: any) => {
        const existingPayload = q.answer?.answerPayload || {};
        if (
          q.questionType === 'ORDERING' &&
          (!existingPayload.orderedItems ||
            existingPayload.orderedItems.length === 0)
        ) {
          const initialIds = (q.studentOptionsSnapshot?.items || []).map(
            (i: any) => i.id
          );
          return {
            ...q,
            localPayload: {
              ...existingPayload,
              orderedItems: initialIds,
            },
            isAnswered: Boolean(q.answer?.isAnswered),
            isFlagged: Boolean(q.answer?.isFlagged),
            autosaveVersion: q.answer?.autosaveVersion || 1,
          };
        }
        return {
          ...q,
          localPayload: existingPayload,
          isAnswered: Boolean(q.answer?.isAnswered),
          isFlagged: Boolean(q.answer?.isFlagged),
          autosaveVersion: q.answer?.autosaveVersion || 1,
        };
      });

      setQuestions(initializedQs);
      setCurrentIndex(0);
      autoSubmittedRef.current = false;
    } catch (err: any) {
      toast.error(err.message || 'Gagal memuat sesi ujian');
    }
  };

  useEffect(() => {
    loadAssessmentOverview();
  }, [assessmentId]);

  // Network & visibility audit listener
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Server-synchronized countdown timer
  useEffect(() => {
    if (
      !activeAttempt ||
      activeAttempt.status !== 'IN_PROGRESS' ||
      remainingSeconds === null
    ) {
      return;
    }

    const interval = setInterval(() => {
      setRemainingSeconds((prev) => {
        if (prev === null) return null;
        if (prev <= 1) {
          clearInterval(interval);
          if (!autoSubmittedRef.current) {
            autoSubmittedRef.current = true;
            handleFinalSubmit(true);
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [activeAttempt, remainingSeconds]);

  const handleStartOrResumeExam = async () => {
    if (!assessmentId) return;
    try {
      const res = await apiFetch<any>(
        `/api/v1/assessments/${assessmentId}/attempts`,
        {
          method: 'POST',
          body: JSON.stringify({}),
        }
      );
      await resumeOrLoadAttempt(res.attempt.id);
      toast.success(
        res.resumed
          ? 'Melanjutkan sesi ujian aktif Anda.'
          : 'Sesi ujian dimulai. Waktu dihitung secara otoritatif oleh server.'
      );
    } catch (err: any) {
      toast.error(err.message || 'Gagal memulai ujian');
    }
  };

  const persistAnswerToServer = async (
    qIndex: number,
    nextPayload: Record<string, any>,
    nextFlagged?: boolean
  ) => {
    const targetQ = questions[qIndex];
    if (!targetQ || !activeAttempt || activeAttempt.status !== 'IN_PROGRESS')
      return;

    const hasVal = Object.values(nextPayload).some((v) =>
      Array.isArray(v)
        ? v.length > 0
        : v !== null && v !== undefined && String(v).trim() !== ''
    );
    const flaggedVal =
      nextFlagged !== undefined ? nextFlagged : targetQ.isFlagged;

    setQuestions((prev) =>
      prev.map((q, idx) =>
        idx === qIndex
          ? {
              ...q,
              localPayload: nextPayload,
              isAnswered: hasVal,
              isFlagged: flaggedVal,
            }
          : q
      )
    );

    setAutosaveStatus('SAVING');
    try {
      const saved = await apiFetch<any>(
        `/api/v1/attempts/${activeAttempt.id}/answers/${targetQ.id}`,
        {
          method: 'PUT',
          body: JSON.stringify({
            answerPayload: nextPayload,
            isAnswered: hasVal,
            isFlagged: flaggedVal,
          }),
        }
      );
      if (saved.remainingSeconds !== undefined) {
        setRemainingSeconds(saved.remainingSeconds);
      }
      setQuestions((prev) =>
        prev.map((q, idx) =>
          idx === qIndex
            ? {
                ...q,
                autosaveVersion: saved.answer?.autosaveVersion || q.autosaveVersion,
              }
            : q
        )
      );
      setAutosaveStatus('SAVED');
    } catch (err: any) {
      setAutosaveStatus('ERROR');
      toast.error(err.message || 'Gagal menyimpan jawaban otomatis');
    }
  };

  const handleUploadEssayAttachment = async (
    qIndex: number,
    file: File
  ) => {
    const targetQ = questions[qIndex];
    if (!targetQ || !activeAttempt) return;
    setUploadingEssayFile(true);
    try {
      const presign = await apiFetch<any>(
        `/api/v1/attempts/${activeAttempt.id}/answers/${targetQ.id}/attachments/presign`,
        {
          method: 'POST',
          body: JSON.stringify({
            fileName: file.name,
            mimeType: file.type || 'application/pdf',
            sizeBytes: file.size,
          }),
        }
      );

      const uploadRes = await fetch(presign.uploadUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': file.type || 'application/octet-stream',
        },
        body: file,
      });
      if (!uploadRes.ok) {
        throw new Error('Gagal mengunggah berkas ke penyimpanan S3 privat');
      }

      const confirmed = await apiFetch<any>(
        `/api/v1/attempts/${activeAttempt.id}/answers/${targetQ.id}/attachments/confirm`,
        {
          method: 'POST',
          body: JSON.stringify({
            objectKey: presign.objectKey,
            originalName: file.name,
            mimeType: file.type || 'application/pdf',
            fileExtension: presign.fileExtension || 'pdf',
          }),
        }
      );

      setQuestions((prev) =>
        prev.map((q, idx) =>
          idx === qIndex
            ? {
                ...q,
                attachments: [...(q.attachments || []), confirmed.attachment],
              }
            : q
        )
      );
      toast.success('Berkas lampiran jawaban esai berhasil diunggah.');
    } catch (err: any) {
      toast.error(err.message || 'Gagal mengunggah berkas esai');
    } finally {
      setUploadingEssayFile(false);
    }
  };

  const handleFinalSubmit = async (isAuto = false) => {
    if (!activeAttempt || submitting) return;
    setSubmitting(true);
    try {
      await apiFetch<any>(`/api/v1/attempts/${activeAttempt.id}/submit`, {
        method: 'POST',
        body: JSON.stringify({
          idempotencyKey: `submit-${activeAttempt.id}-${Date.now()}`,
        }),
      });
      setConfirmSubmitOpen(false);
      toast.success(
        isAuto
          ? 'Waktu habis: Ujian Anda telah dikumpulkan secara otomatis oleh server.'
          : 'Jawaban ujian Anda berhasil dikumpulkan dan dinilai oleh server.'
      );
      setActiveAttempt(null);
      await loadAssessmentOverview();
    } catch (err: any) {
      toast.error(err.message || 'Gagal mengumpulkan ujian');
    } finally {
      setSubmitting(false);
    }
  };

  const formatTimer = (sec: number | null) => {
    if (sec === null) return '--:--';
    const hrs = Math.floor(sec / 3600);
    const mins = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    if (hrs > 0) {
      return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(
        2,
        '0'
      )}:${String(s).padStart(2, '0')}`;
    }
    return `${String(mins).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  if (loading && !assessment) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex items-center gap-3 text-slate-700 font-medium text-sm">
          <div className="w-5 h-5 border-2 border-amber-600 border-t-transparent rounded-full animate-spin" />
          Memuat Ruang Ujian Politeknik Kampar LMS...
        </div>
      </div>
    );
  }

  // =========================================================================
  // VIEW 1: ACTIVE EXAMINATION WORKSPACE (WHEN ATTEMPT IS IN_PROGRESS)
  // =========================================================================
  if (activeAttempt && activeAttempt.status === 'IN_PROGRESS') {
    const currentQ = questions[currentIndex];
    const settings = assessment?.settingsConfig || {};
    const allowBack = settings.allowBackwardNavigation !== false;
    const answeredCount = questions.filter((q) => q.isAnswered).length;
    const flaggedCount = questions.filter((q) => q.isFlagged).length;
    const unansweredCount = Math.max(0, questions.length - answeredCount);

    const countWords = (text: string) =>
      text
        .trim()
        .split(/\s+/)
        .filter(Boolean).length;

    return (
      <div className="min-h-screen bg-[#F8FAFC] text-slate-900 pb-20">
        {/* Examination Sticky Header */}
        <header className="sticky top-0 z-30 bg-slate-900 text-white border-b border-slate-800">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-xs text-slate-300 font-mono">
                <span>Percobaan #{activeAttempt.attemptNumber}</span>
                <span>·</span>
                <span>
                  Terjawab: {answeredCount}/{questions.length}
                </span>
                <span>·</span>
                <span className="inline-flex items-center gap-1">
                  {isOnline ? (
                    <>
                      <Wifi className="w-3.5 h-3.5 text-emerald-400" /> Online
                    </>
                  ) : (
                    <>
                      <WifiOff className="w-3.5 h-3.5 text-rose-400" /> Offline
                    </>
                  )}
                </span>
                <span>·</span>
                <span>
                  {autosaveStatus === 'SAVING'
                    ? 'Menyimpan...'
                    : autosaveStatus === 'SAVED'
                    ? 'Tersimpan Otomatis'
                    : autosaveStatus === 'ERROR'
                    ? 'Gagal Simpan'
                    : 'Siap'}
                </span>
              </div>
              <h1 className="text-sm sm:text-base font-bold truncate">
                {assessment?.title}
              </h1>
            </div>

            <div className="flex items-center gap-4 shrink-0">
              {settings.showRemainingTime !== false && (
                <div
                  className={`px-3.5 py-1.5 rounded-lg font-mono text-sm font-bold flex items-center gap-2 ${
                    (remainingSeconds ?? 999) < 300
                      ? 'bg-rose-600 text-white'
                      : 'bg-slate-800 text-amber-400'
                  }`}
                >
                  <Clock className="w-4 h-4" />
                  <span>{formatTimer(remainingSeconds)}</span>
                </div>
              )}

              <button
                type="button"
                onClick={() => setConfirmSubmitOpen(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 whitespace-nowrap"
              >
                <Send className="w-3.5 h-3.5" />
                Selesai & Kumpulkan
              </button>
            </div>
          </div>
        </header>

        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left / Center Stage: Current Question Workspace (8 cols) */}
            <div className="lg:col-span-8 space-y-6">
              {currentQ ? (
                <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-6">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
                    <div className="flex items-center gap-2 text-xs font-mono text-slate-600">
                      <span className="font-bold text-slate-900 text-sm">
                        Soal #{currentIndex + 1} dari {questions.length}
                      </span>
                      <span>·</span>
                      <span>{currentQ.questionMode}</span>
                      <span>·</span>
                      <span>{currentQ.points} Poin</span>
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        persistAnswerToServer(
                          currentIndex,
                          currentQ.localPayload || {},
                          !currentQ.isFlagged
                        )
                      }
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition ${
                        currentQ.isFlagged
                          ? 'bg-amber-100 border-amber-400 text-amber-950'
                          : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      <Flag className="w-3.5 h-3.5" />
                      {currentQ.isFlagged
                        ? 'Ditandai Ragu-Ragu'
                        : 'Tandai Ragu-Ragu'}
                    </button>
                  </div>

                  {/* Question Prompt */}
                  <div className="text-base font-medium text-slate-900 leading-relaxed whitespace-pre-wrap">
                    {currentQ.promptText}
                  </div>

                  {/* Question Type Interactive Controls */}
                  {(currentQ.questionType === 'SINGLE_CHOICE' ||
                    currentQ.questionType === 'TRUE_FALSE') && (
                    <div className="space-y-2.5">
                      {(currentQ.studentOptionsSnapshot?.options || []).map(
                        (opt: any) => {
                          const isSelected =
                            currentQ.localPayload?.selectedOptionId === opt.id;
                          return (
                            <label
                              key={opt.id}
                              onClick={() =>
                                persistAnswerToServer(currentIndex, {
                                  selectedOptionId: opt.id,
                                })
                              }
                              className={`flex items-start gap-3 p-4 rounded-xl border cursor-pointer transition ${
                                isSelected
                                  ? 'border-slate-900 bg-slate-900 text-white'
                                  : 'border-slate-200 bg-slate-50/70 hover:bg-slate-100 text-slate-800'
                              }`}
                            >
                              <input
                                type="radio"
                                name={`q-${currentQ.id}`}
                                checked={isSelected}
                                onChange={() => {}}
                                className="mt-1"
                              />
                              <div className="text-sm">
                                <span className="font-mono font-bold mr-2">
                                  {opt.optionLabel}.
                                </span>
                                <span>{opt.optionText}</span>
                              </div>
                            </label>
                          );
                        }
                      )}
                    </div>
                  )}

                  {currentQ.questionType === 'MULTIPLE_SELECT' && (
                    <div className="space-y-2.5">
                      <p className="text-xs text-slate-500 font-medium">
                        Pilih seluruh jawaban yang benar (dapat memilih lebih dari satu):
                      </p>
                      {(currentQ.studentOptionsSnapshot?.options || []).map(
                        (opt: any) => {
                          const selectedArr: string[] =
                            currentQ.localPayload?.selectedOptionIds || [];
                          const isChecked = selectedArr.includes(opt.id);
                          return (
                            <label
                              key={opt.id}
                              onClick={() => {
                                const nextArr = isChecked
                                  ? selectedArr.filter((id) => id !== opt.id)
                                  : [...selectedArr, opt.id];
                                persistAnswerToServer(currentIndex, {
                                  selectedOptionIds: nextArr,
                                });
                              }}
                              className={`flex items-start gap-3 p-4 rounded-xl border cursor-pointer transition ${
                                isChecked
                                  ? 'border-slate-900 bg-slate-900 text-white'
                                  : 'border-slate-200 bg-slate-50/70 hover:bg-slate-100 text-slate-800'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => {}}
                                className="mt-1"
                              />
                              <div className="text-sm">
                                <span className="font-mono font-bold mr-2">
                                  {opt.optionLabel}.
                                </span>
                                <span>{opt.optionText}</span>
                              </div>
                            </label>
                          );
                        }
                      )}
                    </div>
                  )}

                  {currentQ.questionType === 'MATCHING' && (
                    <div className="space-y-3">
                      <p className="text-xs text-slate-500 font-medium">
                        Pasangkan setiap pernyataan di sebelah kiri dengan pasangan yang tepat di sebelah kanan:
                      </p>
                      {(currentQ.studentOptionsSnapshot?.leftItems || []).map(
                        (left: any) => {
                          const currentPairs =
                            currentQ.localPayload?.matchingPairs || {};
                          return (
                            <div
                              key={left.id}
                              className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center p-3.5 rounded-xl border border-slate-200 bg-slate-50"
                            >
                              <div className="text-xs font-semibold text-slate-900">
                                {left.leftText}
                              </div>
                              <select
                                value={currentPairs[left.id] || ''}
                                onChange={(e) => {
                                  const nextPairs = {
                                    ...currentPairs,
                                    [left.id]: e.target.value,
                                  };
                                  persistAnswerToServer(currentIndex, {
                                    matchingPairs: nextPairs,
                                  });
                                }}
                                className="px-3 py-2 rounded-lg border border-slate-300 bg-white text-xs font-medium"
                              >
                                <option value="">-- Pilih Pasangan --</option>
                                {(
                                  currentQ.studentOptionsSnapshot
                                    ?.rightOptions || []
                                ).map((ro: string, rIdx: number) => (
                                  <option key={rIdx} value={ro}>
                                    {ro}
                                  </option>
                                ))}
                              </select>
                            </div>
                          );
                        }
                      )}
                    </div>
                  )}

                  {currentQ.questionType === 'ORDERING' && (
                    <div className="space-y-2.5">
                      <p className="text-xs text-slate-500 font-medium">
                        Susun urutan tahapan berikut menggunakan tombol panah Atas / Bawah:
                      </p>
                      {(() => {
                        const rawItems: Array<{ id: string; text: string }> =
                          currentQ.studentOptionsSnapshot?.items || [];
                        const orderedIds: string[] =
                          currentQ.localPayload?.orderedItems ||
                          rawItems.map((i) => i.id);
                        const orderedObjects = orderedIds
                          .map((id) => rawItems.find((i) => i.id === id))
                          .filter(Boolean) as Array<{ id: string; text: string }>;

                        const moveOrder = (idx: number, dir: -1 | 1) => {
                          const target = idx + dir;
                          if (
                            target < 0 ||
                            target >= orderedObjects.length
                          )
                            return;
                          const nextIds = orderedObjects.map((o) => o.id);
                          const tmp = nextIds[idx];
                          nextIds[idx] = nextIds[target];
                          nextIds[target] = tmp;
                          persistAnswerToServer(currentIndex, {
                            orderedItems: nextIds,
                          });
                        };

                        return orderedObjects.map((item, idx) => (
                          <div
                            key={item.id}
                            className="flex items-center justify-between gap-3 p-3.5 rounded-xl border border-slate-200 bg-slate-50"
                          >
                            <div className="flex items-center gap-3 text-xs font-semibold text-slate-900">
                              <span className="font-mono px-2 py-1 rounded bg-slate-900 text-white">
                                #{idx + 1}
                              </span>
                              <span>{item.text}</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => moveOrder(idx, -1)}
                                className="p-1.5 rounded border border-slate-300 bg-white hover:bg-slate-100"
                              >
                                <ArrowUp className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => moveOrder(idx, 1)}
                                className="p-1.5 rounded border border-slate-300 bg-white hover:bg-slate-100"
                              >
                                <ArrowDown className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        ));
                      })()}
                    </div>
                  )}

                  {(currentQ.questionType === 'FILL_IN_BLANK' ||
                    currentQ.questionType === 'SHORT_ANSWER') && (
                    <div className="space-y-2">
                      <label className="block text-xs font-bold text-slate-700">
                        Jawaban Singkat Anda:
                      </label>
                      <input
                        type="text"
                        value={
                          currentQ.localPayload?.blankAnswer ??
                          currentQ.localPayload?.shortAnswerText ??
                          ''
                        }
                        onChange={(e) =>
                          persistAnswerToServer(currentIndex, {
                            blankAnswer: e.target.value,
                            shortAnswerText: e.target.value,
                          })
                        }
                        placeholder="Ketik jawaban Anda di sini..."
                        className="w-full px-4 py-2.5 rounded-xl border border-slate-300 text-sm font-medium"
                      />
                    </div>
                  )}

                  {currentQ.questionType === 'NUMERIC' && (
                    <div className="space-y-2">
                      <label className="block text-xs font-bold text-slate-700">
                        Jawaban Numerik{' '}
                        {currentQ.studentOptionsSnapshot?.unit
                          ? `(Satuan: ${currentQ.studentOptionsSnapshot.unit})`
                          : ''}
                      </label>
                      <input
                        type="number"
                        step="any"
                        value={currentQ.localPayload?.numericAnswer ?? ''}
                        onChange={(e) =>
                          persistAnswerToServer(currentIndex, {
                            numericAnswer:
                              e.target.value === ''
                                ? ''
                                : Number(e.target.value),
                          })
                        }
                        placeholder="Masukkan angka..."
                        className="w-full max-w-xs px-4 py-2.5 rounded-xl border border-slate-300 font-mono text-sm font-bold"
                      />
                    </div>
                  )}

                  {currentQ.questionMode === 'ESSAY' && (
                    <div className="space-y-4">
                      {currentQ.rubricSnapshot && (
                        <div className="p-4 rounded-xl bg-amber-50/70 border border-amber-200 space-y-2">
                          <div className="text-xs font-bold text-amber-950">
                            Rubrik Penilaian: {currentQ.rubricSnapshot.title}
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {(currentQ.rubricSnapshot.criteria || []).map(
                              (c: any, cIdx: number) => (
                                <div
                                  key={cIdx}
                                  className="p-2.5 rounded-lg bg-white border border-amber-200 text-xs"
                                >
                                  <div className="font-bold text-slate-900">
                                    {c.criterionName} ({c.weight}%)
                                  </div>
                                  <div className="text-slate-500 text-[11px]">
                                    {c.description}
                                  </div>
                                </div>
                              )
                            )}
                          </div>
                        </div>
                      )}

                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <label className="text-xs font-bold text-slate-700">
                            Jawaban Esai & Analisis (Tiptap Rich Text)
                          </label>
                          <span className="text-xs font-mono text-slate-500">
                            Jumlah Kata:{' '}
                            {countWords(currentQ.localPayload?.essayText || '')}{' '}
                            kata (Min:{' '}
                            {currentQ.studentOptionsSnapshot?.minWords || 0},
                            Maks:{' '}
                            {currentQ.studentOptionsSnapshot?.maxWords || 5000})
                          </span>
                        </div>
                        <TiptapMaterialEditor
                          contentJson={
                            currentQ.localPayload?.essayJson || {
                              type: 'doc',
                              content: [{ type: 'paragraph' }],
                            }
                          }
                          onChange={(json, html, plain) => {
                            const wc = countWords(plain || '');
                            persistAnswerToServer(currentIndex, {
                              ...currentQ.localPayload,
                              essayJson: json,
                              essayHtml: html,
                              essayText: plain,
                              wordCount: wc,
                            });
                          }}
                        />
                      </div>

                      {/* Essay File Upload */}
                      <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-slate-800">
                            Lampiran Berkas Pendukung Esai (S3 Privat)
                          </span>
                          <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-bold cursor-pointer hover:bg-slate-800">
                            <Upload className="w-3.5 h-3.5" />
                            <span>
                              {uploadingEssayFile
                                ? 'Mengunggah...'
                                : 'Unggah Berkas'}
                            </span>
                            <input
                              type="file"
                              className="hidden"
                              disabled={uploadingEssayFile}
                              onChange={(e) => {
                                const f = e.target.files?.[0];
                                if (f)
                                  handleUploadEssayAttachment(currentIndex, f);
                              }}
                            />
                          </label>
                        </div>
                        {(currentQ.attachments || []).length > 0 && (
                          <div className="space-y-1 pt-1">
                            {currentQ.attachments.map((att: any) => (
                              <div
                                key={att.id}
                                className="text-xs font-mono text-slate-700 bg-white px-3 py-1.5 rounded border border-slate-200"
                              >
                                {att.originalName} (
                                {Math.round((att.fileSize || 0) / 1024)} KB)
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Bottom Question Navigation */}
                  <div className="flex items-center justify-between pt-4 border-t border-slate-100">
                    <button
                      type="button"
                      disabled={currentIndex === 0 || !allowBack}
                      onClick={() =>
                        setCurrentIndex((prev) => Math.max(0, prev - 1))
                      }
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-slate-300 bg-white text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                    >
                      <ArrowLeft className="w-4 h-4" />
                      Soal Sebelumnya
                    </button>

                    {currentIndex < questions.length - 1 ? (
                      <button
                        type="button"
                        onClick={() =>
                          setCurrentIndex((prev) =>
                            Math.min(questions.length - 1, prev + 1)
                          )
                        }
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-slate-900 text-white text-xs font-bold hover:bg-slate-800"
                      >
                        Soal Berikutnya
                        <ArrowRight className="w-4 h-4" />
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmSubmitOpen(true)}
                        className="inline-flex items-center gap-1.5 px-5 py-2 rounded-lg bg-amber-500 text-slate-950 text-xs font-bold hover:bg-amber-400"
                      >
                        <Send className="w-4 h-4" />
                        Tinjau & Kumpulkan Ujian
                      </button>
                    )}
                  </div>
                </div>
              ) : null}
            </div>

            {/* Right Column: Question Navigation Palette (4 cols) */}
            <div className="lg:col-span-4 space-y-6">
              <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
                <h2 className="text-sm font-bold text-slate-900">
                  Navigasi Nomor Soal
                </h2>
                <div className="grid grid-cols-5 gap-2">
                  {questions.map((q, idx) => {
                    const isCurrent = idx === currentIndex;
                    const isDisabled = idx < currentIndex && !allowBack;
                    let btnClass =
                      'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100';
                    if (isCurrent) {
                      btnClass =
                        'border-slate-900 bg-slate-900 text-white ring-2 ring-amber-400';
                    } else if (q.isFlagged) {
                      btnClass =
                        'border-amber-400 bg-amber-100 text-amber-950';
                    } else if (q.isAnswered) {
                      btnClass =
                        'border-emerald-300 bg-emerald-50 text-emerald-900';
                    }

                    return (
                      <button
                        key={q.id}
                        type="button"
                        disabled={isDisabled}
                        onClick={() => setCurrentIndex(idx)}
                        className={`h-10 rounded-lg border font-mono text-xs font-bold transition ${btnClass} disabled:opacity-40`}
                      >
                        {idx + 1}
                      </button>
                    );
                  })}
                </div>

                <div className="pt-3 border-t border-slate-100 grid grid-cols-2 gap-2 text-xs text-slate-600 font-mono">
                  <div>Terjawab: {answeredCount}</div>
                  <div>Belum Dijawab: {unansweredCount}</div>
                  <div>Ragu-Ragu: {flaggedCount}</div>
                  <div>Total Soal: {questions.length}</div>
                </div>
              </div>
            </div>
          </div>
        </main>

        {/* Submit Confirmation Modal */}
        {confirmSubmitOpen && (
          <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl border border-slate-200 max-w-md w-full p-6 space-y-4">
              <div className="flex items-center gap-3">
                <AlertTriangle className="w-6 h-6 text-amber-600 shrink-0" />
                <h3 className="text-base font-bold text-slate-900">
                  Konfirmasi Pengumpulan Ujian Akhir
                </h3>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                Pastikan seluruh jawaban Anda telah diperiksa. Setelah dikumpulkan, jawaban tidak dapat diubah lagi.
              </p>
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 font-mono text-xs space-y-1">
                <div>Soal Terjawab: {answeredCount} dari {questions.length}</div>
                <div>Soal Belum Dijawab: {unansweredCount}</div>
                <div>Soal Ditandai Ragu-Ragu: {flaggedCount}</div>
              </div>
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setConfirmSubmitOpen(false)}
                  className="px-4 py-2 rounded-lg border border-slate-300 text-xs font-bold text-slate-700"
                >
                  Kembali Periksa
                </button>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => handleFinalSubmit(false)}
                  className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold"
                >
                  {submitting ? 'Mengumpulkan...' : 'Ya, Kumpulkan Sekarang'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // =========================================================================
  // VIEW 2: ASSESSMENT LANDING, ATTEMPT HISTORY & PUBLISHED RESULTS
  // =========================================================================
  const myAttempts = assessment?.myAttempts || [];

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 pb-20">
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => navigate(`/classrooms/${classroomId}`)}
              className="p-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div>
              <div className="flex items-center gap-2 text-xs text-slate-500 font-mono">
                <span className="font-bold text-slate-900">
                  {assessment?.category}
                </span>
                <span>·</span>
                <span>Mode: {assessment?.assessmentMode}</span>
                <span>·</span>
                <span>Durasi: {assessment?.durationMinutes} Menit</span>
              </div>
              <h1 className="text-base font-bold text-slate-900">
                {assessment?.title}
              </h1>
            </div>
          </div>

          <button
            type="button"
            onClick={handleStartOrResumeExam}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold"
          >
            <Play className="w-4 h-4" />
            Mulai / Lanjutkan Ujian
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 space-y-6">
        <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
          <h2 className="text-base font-bold text-slate-900">
            Petunjuk & Informasi Pelaksanaan Ujian
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 rounded-xl bg-slate-50 border border-slate-200 font-mono text-xs">
            <div>
              <span className="text-slate-500 block">Durasi Ujian</span>
              <span className="font-bold text-slate-900">
                {assessment?.durationMinutes} Menit
              </span>
            </div>
            <div>
              <span className="text-slate-500 block">Skor Maksimum</span>
              <span className="font-bold text-slate-900">
                {assessment?.maxScore} Poin
              </span>
            </div>
            <div>
              <span className="text-slate-500 block">Ambang Lulus</span>
              <span className="font-bold text-slate-900">
                {assessment?.passingGrade} Poin
              </span>
            </div>
            <div>
              <span className="text-slate-500 block">Batas Percobaan</span>
              <span className="font-bold text-slate-900">
                {myAttempts.length} / {assessment?.maxAttempts}x
              </span>
            </div>
          </div>

          {assessment?.instructionsJson && (
            <div className="prose prose-slate max-w-none text-sm pt-2">
              <TiptapReadOnlyRenderer
                contentJson={assessment.instructionsJson}
              />
            </div>
          )}
        </div>

        {/* Student Attempt History & Published Results */}
        <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
          <h2 className="text-base font-bold text-slate-900">
            Riwayat Percobaan & Status Penilaian Anda ({myAttempts.length})
          </h2>
          {myAttempts.length === 0 ? (
            <p className="text-xs text-slate-500">
              Anda belum memulai percobaan pada ujian ini. Klik tombol "Mulai / Lanjutkan Ujian" di kanan atas untuk memulai.
            </p>
          ) : (
            <div className="space-y-3">
              {myAttempts.map((att: any) => (
                <div
                  key={att.id}
                  className="p-4 rounded-xl border border-slate-200 bg-slate-50 flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 font-mono">
                      <span className="font-bold text-slate-900">
                        Percobaan #{att.attemptNumber}
                      </span>
                      <span>·</span>
                      <span className="font-semibold text-amber-800">
                        Status: {att.status}
                      </span>
                      <span>·</span>
                      <span>
                        Status Nilai: {att.finalGradingStatus}
                      </span>
                    </div>
                    <div className="text-slate-500 font-mono">
                      Waktu Mulai:{' '}
                      {att.startedAt
                        ? new Date(att.startedAt).toLocaleString('id-ID')
                        : '—'}
                    </div>
                    {att.generalFeedback && (
                      <div className="text-emerald-800 font-medium pt-1">
                        Catatan Dosen: {att.generalFeedback}
                      </div>
                    )}
                  </div>

                  <div className="text-right font-mono">
                    {att.totalScore !== null && att.totalScore !== undefined ? (
                      <div className="space-y-0.5">
                        <div className="text-base font-bold text-slate-900">
                          Skor Akhir: {att.totalScore} / {assessment?.maxScore}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          Objektif: {att.objectiveScore ?? 0} · Esai:{' '}
                          {att.essayScore ?? 0}
                        </div>
                      </div>
                    ) : (
                      <span className="text-slate-600 font-semibold">
                        Menunggu Penilaian / Publikasi Hasil Dosen
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default AssessmentExaminationPage;
