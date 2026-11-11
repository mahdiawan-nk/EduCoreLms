import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  BookOpen,
  CheckCircle2,
  Copy,
  Database,
  Eye,
  Layers,
  Plus,
  Save,
  Send,
  Settings,
  Shuffle,
  Trash2,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import {
  TiptapMaterialEditor,
  TiptapReadOnlyRenderer,
} from '../components/TiptapMaterialEditor';
import { toast } from 'sonner';

type BuilderTab = 'general' | 'questions' | 'bank' | 'settings' | 'preview';

const OBJECTIVE_TYPES = [
  { value: 'SINGLE_CHOICE', label: 'Pilihan Ganda Tunggal (Single Choice)' },
  { value: 'MULTIPLE_SELECT', label: 'Pilihan Ganda Kompleks (Multiple Select)' },
  { value: 'TRUE_FALSE', label: 'Benar / Salah (True / False)' },
  { value: 'MATCHING', label: 'Menjodohkan (Matching Pairs)' },
  { value: 'ORDERING', label: 'Mengurutkan Langkah (Ordering)' },
  { value: 'FILL_IN_BLANK', label: 'Isian Singkat (Fill in the Blank)' },
  { value: 'SHORT_ANSWER', label: 'Jawaban Pendek (Short Answer)' },
  { value: 'NUMERIC', label: 'Jawaban Numerik & Toleransi (Numeric)' },
];

const ESSAY_TYPES = [
  { value: 'SHORT_ESSAY', label: 'Esai Singkat (Short Essay)' },
  { value: 'LONG_ESSAY', label: 'Esai Uraian Panjang (Long Essay)' },
  { value: 'CASE_STUDY', label: 'Analisis Studi Kasus (Case Study)' },
  { value: 'ANALYTICAL_RESPONSE', label: 'Respons Analitis (Analytical Response)' },
  { value: 'PROBLEM_SOLVING', label: 'Pemecahan Masalah (Problem Solving)' },
  { value: 'PROGRAMMING_EXPLANATION', label: 'Penjelasan Algoritma / Kode' },
  { value: 'DOCUMENT_RESPONSE', label: 'Respons Berbasis Dokumen Lampiran' },
];

export const AssessmentBuilderPage: React.FC = () => {
  const { classroomId, assessmentId } = useParams<{
    classroomId: string;
    assessmentId?: string;
  }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const isEditing = Boolean(assessmentId);

  const [activeTab, setActiveTab] = useState<BuilderTab>('general');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [classroom, setClassroom] = useState<any>(null);
  const [topics, setTopics] = useState<any[]>([]);
  const [questionBanks, setQuestionBanks] = useState<any[]>([]);
  const [selectedBankId, setSelectedBankId] = useState<string>('');
  const [bankQuestions, setBankQuestions] = useState<any[]>([]);

  // General Info State
  const [topicId, setTopicId] = useState<string>(
    searchParams.get('topicId') || ''
  );
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<string>('QUIZ');
  const [assessmentMode, setAssessmentMode] = useState<
    'OBJECTIVE' | 'ESSAY' | 'HYBRID'
  >('HYBRID');
  const [instructions, setInstructions] = useState('');
  const [instructionsJson, setInstructionsJson] = useState<any>({
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [
          {
            type: 'text',
            text: 'Bacalah setiap butir soal dengan teliti. Waktu ujian dihitung secara otoritatif oleh server dan jawaban disimpan otomatis.',
          },
        ],
      },
    ],
  });
  const [maxScore, setMaxScore] = useState(100);
  const [passingGrade, setPassingGrade] = useState(70);
  const [estimatedDurationMinutes, setEstimatedDurationMinutes] = useState(60);
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [maxAttempts, setMaxAttempts] = useState(2);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [lateAttemptPolicy, setLateAttemptPolicy] =
    useState<string>('ALLOW_MARK_LATE');
  const [latePenaltyPercent, setLatePenaltyPercent] = useState(0);
  const [status, setStatus] = useState<string>('PUBLISHED');

  // Settings Config
  const [settingsConfig, setSettingsConfig] = useState({
    randomizeQuestions: false,
    randomizeOptions: false,
    oneQuestionAtATime: false,
    allowBackwardNavigation: true,
    allowAnswerChanges: true,
    showRemainingTime: true,
    autoSubmit: true,
    autosave: true,
    resultVisibility: 'AFTER_PUBLISH',
    explanationVisibility: 'AFTER_PUBLISH',
    negativeMarkingEnabled: false,
    negativeMarkingPercent: 0,
    gradePublicationPolicy: 'MANUAL',
  });

  // Sections
  const [sections, setSections] = useState<any[]>([
    {
      title: 'Bagian A: Soal Objektif Otomatis',
      description: 'Penilaian otomatis oleh server.',
      sectionType: 'OBJECTIVE',
      totalPoints: 60,
      randomizeQuestions: false,
    },
    {
      title: 'Bagian B: Soal Esai & Studi Kasus',
      description: 'Penilaian berbasis rubrik oleh Dosen Pengampu.',
      sectionType: 'ESSAY',
      totalPoints: 40,
      randomizeQuestions: false,
    },
  ]);

  // Questions List
  const [questionsList, setQuestionsList] = useState<any[]>([]);
  // Question Pools
  const [questionPools, setQuestionPools] = useState<any[]>([]);

  useEffect(() => {
    const init = async () => {
      if (!classroomId) return;
      setLoading(true);
      try {
        const clsData = await apiFetch<any>(`/api/v1/classrooms/${classroomId}`);
        setClassroom(clsData.classroom);
        setTopics(clsData.topics || []);

        const banksData = await apiFetch<any>(
          `/api/v1/question-banks?classroomId=${classroomId}`
        );
        const bList = banksData.questionBanks || [];
        setQuestionBanks(bList);
        if (bList[0]) {
          setSelectedBankId(bList[0].id);
          const bq = await apiFetch<any>(
            `/api/v1/question-banks/${bList[0].id}/questions`
          );
          setBankQuestions(bq.questions || []);
        }

        if (isEditing && assessmentId) {
          const asmtData = await apiFetch<any>(
            `/api/v1/assessments/${assessmentId}`
          );
          const a = asmtData.assessment;
          setTopicId(a.topicId || '');
          setTitle(a.title || '');
          setDescription(a.description || '');
          setCategory(a.category || 'QUIZ');
          setAssessmentMode(a.assessmentMode || 'HYBRID');
          setInstructions(a.instructions || '');
          if (a.instructionsJson) setInstructionsJson(a.instructionsJson);
          setMaxScore(Number(a.maxScore || 100));
          setPassingGrade(Number(a.passingGrade || 70));
          setEstimatedDurationMinutes(Number(a.estimatedDurationMinutes || 60));
          setDurationMinutes(Number(a.durationMinutes || 60));
          setMaxAttempts(Number(a.maxAttempts || 1));
          setLateAttemptPolicy(a.lateAttemptPolicy || 'REJECT');
          setLatePenaltyPercent(Number(a.latePenaltyPercent || 0));
          setStatus(a.status || 'PUBLISHED');
          if (a.settingsConfig) {
            setSettingsConfig((prev) => ({ ...prev, ...a.settingsConfig }));
          }
          if (a.sections?.length > 0) setSections(a.sections);
          if (a.questions?.length > 0) {
            setQuestionsList(
              a.questions.map((q: any, idx: number) => ({
                questionId: q.id,
                sectionIndex: 0,
                questionMode: q.questionMode,
                questionType: q.questionType,
                promptText: q.promptText,
                points: Number(q.points || 10),
                negativePoints: Number(q.negativePoints || 0),
                partialCreditEnabled: Boolean(q.partialCreditEnabled),
                difficulty: q.difficulty || 'MEDIUM',
                category: q.category || 'General',
                topic: q.topic || '',
                learningOutcome: q.learningOutcome || '',
                explanation: q.explanation || '',
                answerConfig: q.answerConfig || {},
                options: q.options || [],
                rubric: q.rubric || null,
                sortOrder: idx + 1,
              }))
            );
          }
          if (a.questionPools?.length > 0) setQuestionPools(a.questionPools);
        } else {
          // Default starter question for new assessment
          setQuestionsList([
            {
              sectionIndex: 0,
              questionMode: 'OBJECTIVE',
              questionType: 'SINGLE_CHOICE',
              promptText:
                'Manakah pernyataan yang tepat mengenai isolasi kunci jawaban pada sistem ujian Politeknik Kampar LMS?',
              points: 20,
              negativePoints: 0,
              partialCreditEnabled: false,
              difficulty: 'MEDIUM',
              category: 'Keamanan Ujian',
              topic: 'Otorisasi Server',
              learningOutcome: 'CPMK-02',
              explanation:
                'Kunci jawaban disimpan di server_answer_key_snapshot dan tidak pernah dikirim ke browser peserta.',
              answerConfig: {},
              options: [
                {
                  optionLabel: 'A',
                  optionText:
                    'Kunci jawaban diisolasi di server dan kalkulasi skor dilakukan sepenuhnya di backend.',
                  isCorrect: true,
                  scoreWeight: 100,
                },
                {
                  optionLabel: 'B',
                  optionText:
                    'Kunci jawaban dikirim ke React state untuk mempercepat penilaian di sisi klien.',
                  isCorrect: false,
                  scoreWeight: 0,
                },
              ],
            },
          ]);
        }
      } catch (err: any) {
        toast.error(err.message || 'Gagal memuat konfigurasi Assessment Builder');
      } finally {
        setLoading(false);
      }
    };
    init();
  }, [classroomId, assessmentId, isEditing]);

  const handleSelectBank = async (bId: string) => {
    setSelectedBankId(bId);
    if (!bId) return;
    try {
      const res = await apiFetch<any>(`/api/v1/question-banks/${bId}/questions`);
      setBankQuestions(res.questions || []);
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleAddBlankQuestion = (mode: 'OBJECTIVE' | 'ESSAY', qType: string) => {
    const baseQuestion: any = {
      sectionIndex: mode === 'ESSAY' && sections.length > 1 ? 1 : 0,
      questionMode: mode,
      questionType: qType,
      promptText: '',
      points: mode === 'ESSAY' ? 20 : 10,
      negativePoints: 0,
      partialCreditEnabled: true,
      difficulty: 'MEDIUM',
      category: 'General',
      topic: '',
      learningOutcome: 'CPMK-01',
      explanation: '',
      answerConfig: {},
      options: [],
      rubric: null,
    };

    if (qType === 'SINGLE_CHOICE' || qType === 'MULTIPLE_SELECT') {
      baseQuestion.options = [
        { optionLabel: 'A', optionText: 'Opsi Jawaban A', isCorrect: true, scoreWeight: 100 },
        { optionLabel: 'B', optionText: 'Opsi Jawaban B', isCorrect: false, scoreWeight: 0 },
        { optionLabel: 'C', optionText: 'Opsi Jawaban C', isCorrect: false, scoreWeight: 0 },
        { optionLabel: 'D', optionText: 'Opsi Jawaban D', isCorrect: false, scoreWeight: 0 },
      ];
    } else if (qType === 'TRUE_FALSE') {
      baseQuestion.options = [
        { optionLabel: 'A', optionText: 'Benar', isCorrect: true, scoreWeight: 100 },
        { optionLabel: 'B', optionText: 'Salah', isCorrect: false, scoreWeight: 0 },
      ];
    } else if (qType === 'MATCHING') {
      baseQuestion.answerConfig = {
        pairs: [
          { id: `p-${Date.now()}-1`, leftText: 'Konsep 1', rightText: 'Definisi 1' },
          { id: `p-${Date.now()}-2`, leftText: 'Konsep 2', rightText: 'Definisi 2' },
        ],
      };
    } else if (qType === 'ORDERING') {
      baseQuestion.answerConfig = {
        scoringPolicy: 'PARTIAL',
        items: [
          { id: `o-${Date.now()}-1`, text: 'Tahap Pertama', correctOrder: 1 },
          { id: `o-${Date.now()}-2`, text: 'Tahap Kedua', correctOrder: 2 },
          { id: `o-${Date.now()}-3`, text: 'Tahap Ketiga', correctOrder: 3 },
        ],
      };
    } else if (qType === 'FILL_IN_BLANK') {
      baseQuestion.answerConfig = {
        acceptedAnswers: ['SELECT'],
        caseSensitive: false,
        normalizeWhitespace: true,
      };
    } else if (qType === 'SHORT_ANSWER') {
      baseQuestion.answerConfig = {
        acceptedVariants: ['Argon2id', 'Argon2'],
        matchMode: 'CASE_INSENSITIVE',
        manualReviewFallback: true,
      };
    } else if (qType === 'NUMERIC') {
      baseQuestion.answerConfig = {
        exactValue: 3.14,
        tolerance: 0.05,
        decimalPrecision: 2,
        unit: '',
      };
    } else if (mode === 'ESSAY') {
      baseQuestion.answerConfig = {
        minWords: 20,
        maxWords: 1000,
        allowAttachments: true,
        allowExternalUrl: true,
        modelAnswer: '',
      };
      baseQuestion.rubric = {
        title: 'Rubrik Penilaian Esai',
        description: 'Evaluasi analitis dan ketepatan teknis.',
        criteria: [
          {
            criterionName: 'Ketepatan Konsep & Analisis',
            description: 'Kesesuaian argumen dengan teori dan studi kasus',
            weight: 60,
            maxScore: 12,
          },
          {
            criterionName: 'Struktur & Bukti Implementasi',
            description: 'Sistematika penjelasan dan contoh teknis',
            weight: 40,
            maxScore: 8,
          },
        ],
      };
    }

    setQuestionsList((prev) => [...prev, baseQuestion]);
  };

  const handleImportQuestionFromBank = (bq: any) => {
    if (questionsList.some((q) => q.questionId === bq.id)) {
      toast.info('Soal ini sudah ditambahkan ke dalam asesmen.');
      return;
    }
    setQuestionsList((prev) => [
      ...prev,
      {
        questionId: bq.id,
        sectionIndex: bq.questionMode === 'ESSAY' && sections.length > 1 ? 1 : 0,
        questionMode: bq.questionMode,
        questionType: bq.questionType,
        promptText: bq.promptText,
        points: Number(bq.points || 10),
        negativePoints: Number(bq.negativePoints || 0),
        partialCreditEnabled: Boolean(bq.partialCreditEnabled),
        difficulty: bq.difficulty,
        category: bq.category,
        topic: bq.topic,
        learningOutcome: bq.learningOutcome,
        explanation: bq.explanation,
        answerConfig: bq.answerConfig || {},
        options: bq.options || [],
      },
    ]);
    toast.success('Soal berhasil diimpor dari Bank Soal');
  };

  const handleDuplicateQuestionItem = (idx: number) => {
    const src = questionsList[idx];
    const clone = JSON.parse(JSON.stringify(src));
    delete clone.questionId;
    clone.promptText = `${clone.promptText} (Salinan)`;
    setQuestionsList((prev) => {
      const next = [...prev];
      next.splice(idx + 1, 0, clone);
      return next;
    });
  };

  const handleMoveQuestion = (idx: number, dir: -1 | 1) => {
    const target = idx + dir;
    if (target < 0 || target >= questionsList.length) return;
    setQuestionsList((prev) => {
      const next = [...prev];
      const tmp = next[idx];
      next[idx] = next[target];
      next[target] = tmp;
      return next;
    });
  };

  const handleAddQuestionPool = () => {
    setQuestionPools((prev) => [
      ...prev,
      {
        sectionIndex: 0,
        questionBankId: selectedBankId || null,
        title: 'Pool Soal Acak Bank Soal',
        categoryFilter: '',
        topicFilter: '',
        difficultyFilter: 'ANY',
        difficultyDistribution: { easy: 1, medium: 2, hard: 1 },
        questionCount: 3,
        pointsPerQuestion: 10,
      },
    ]);
  };

  const handleSaveAssessment = async (publishNowStatus?: string) => {
    if (!title.trim()) {
      toast.error('Judul asesmen/ujian wajib diisi.');
      setActiveTab('general');
      return;
    }

    setSaving(true);
    try {
      const targetStatus = publishNowStatus || status;
      const payload = {
        topicId: topicId || null,
        title: title.trim(),
        description: description.trim(),
        category,
        assessmentMode,
        instructions: instructions.trim() || description.trim(),
        instructionsJson,
        maxScore: Number(maxScore),
        passingGrade: Number(passingGrade),
        estimatedDurationMinutes: Number(estimatedDurationMinutes),
        durationMinutes: Number(durationMinutes),
        maxAttempts: Number(maxAttempts),
        startDate: startDate || null,
        endDate: endDate || null,
        lateAttemptPolicy,
        latePenaltyPercent: Number(latePenaltyPercent),
        settingsConfig,
        status: targetStatus,
        sections,
        questions: questionsList.map((q, idx) => ({
          questionId: q.questionId,
          sectionIndex: q.sectionIndex ?? 0,
          pointsOverride: Number(q.points || 10),
          negativePointsOverride: Number(q.negativePoints || 0),
          sortOrder: idx + 1,
          inlineQuestion: q.questionId
            ? undefined
            : {
                questionBankId: selectedBankId || null,
                classroomId,
                questionMode: q.questionMode,
                questionType: q.questionType,
                subject: classroom?.course?.title || 'Informatika',
                topic: q.topic || '',
                category: q.category || 'General',
                difficulty: q.difficulty || 'MEDIUM',
                learningOutcome: q.learningOutcome || 'CPMK-01',
                promptText: q.promptText || `Soal #${idx + 1}`,
                points: Number(q.points || 10),
                negativePoints: Number(q.negativePoints || 0),
                partialCreditEnabled: Boolean(q.partialCreditEnabled),
                answerConfig: q.answerConfig || {},
                explanation: q.explanation || '',
                options: q.options || [],
                rubric: q.rubric || undefined,
              },
        })),
        questionPools: questionPools.map((p, idx) => ({
          ...p,
          questionCount: Number(p.questionCount || 1),
          pointsPerQuestion: Number(p.pointsPerQuestion || 10),
          sortOrder: idx + 1,
        })),
      };

      if (isEditing && assessmentId) {
        await apiFetch(`/api/v1/assessments/${assessmentId}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
        toast.success('Pembaruan asesmen berhasil disimpan.');
      } else {
        await apiFetch(`/api/v1/classrooms/${classroomId}/assessments`, {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        toast.success('Asesmen baru berhasil dibuat dan diterbitkan.');
      }
      navigate(`/classrooms/${classroomId}`);
    } catch (err: any) {
      toast.error(err.message || 'Gagal menyimpan asesmen');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex items-center gap-3 text-slate-700 font-medium text-sm">
          <div className="w-5 h-5 border-2 border-amber-600 border-t-transparent rounded-full animate-spin" />
          Memuat Workspace Advanced Assessment & Examination Builder...
        </div>
      </div>
    );
  }

  const totalConfiguredPoints =
    questionsList.reduce((acc, q) => acc + Number(q.points || 0), 0) +
    questionPools.reduce(
      (acc, p) =>
        acc + Number(p.questionCount || 0) * Number(p.pointsPerQuestion || 0),
      0
    );

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 pb-20">
      {/* Top Bar */}
      <header className="sticky top-0 z-30 bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-6">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => navigate(`/classrooms/${classroomId}`)}
              className="p-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 shrink-0"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <span className="font-semibold text-slate-900">
                  Assessment & Examination Builder
                </span>
                <span>·</span>
                <span>Mode: {assessmentMode}</span>
                <span>·</span>
                <span className="font-mono tabular-nums">
                  Total Poin Soal: {totalConfiguredPoints} / {maxScore}
                </span>
              </div>
              <h1 className="text-base font-bold text-slate-900 truncate">
                {title || 'Asesmen / Ujian Baru'}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              disabled={saving}
              onClick={() => handleSaveAssessment('DRAFT')}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold border border-slate-300 bg-white text-slate-800 hover:bg-slate-50 whitespace-nowrap"
            >
              <Save className="w-4 h-4" />
              Simpan Draf
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => handleSaveAssessment('PUBLISHED')}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 whitespace-nowrap"
            >
              <Send className="w-4 h-4" />
              Terbitkan Ujian
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 space-y-6">
        {/* Segmented Navigation Tabs */}
        <div className="flex flex-wrap items-center gap-1 p-1.5 bg-slate-200/70 rounded-xl w-fit">
          {[
            { id: 'general', label: '01. Informasi & Mode Ujian', icon: BookOpen },
            {
              id: 'questions',
              label: `02. Editor Soal & Pool (${questionsList.length})`,
              icon: Layers,
            },
            {
              id: 'bank',
              label: `03. Bank Soal Terpadu (${bankQuestions.length})`,
              icon: Database,
            },
            { id: 'settings', label: '04. Aturan, Timer & Keamanan', icon: Settings },
            { id: 'preview', label: '05. Pratinjau Mahasiswa', icon: Eye },
          ].map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setActiveTab(t.id as BuilderTab)}
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition whitespace-nowrap ${
                  activeTab === t.id
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {t.label}
              </button>
            );
          })}
        </div>

        {/* =================================================================
            TAB 1: GENERAL INFORMATION & THREE ASSESSMENT MODES
        ================================================================= */}
        {activeTab === 'general' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-8 space-y-6">
              <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-5">
                <h2 className="text-base font-bold text-slate-900">
                  Informasi Umum & Pilihan Mode Asesmen
                </h2>

                {/* Three Assessment Modes Selector */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-2">
                    Mode Mesin Asesmen (Unified Assessment Engine)
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {[
                      {
                        mode: 'OBJECTIVE',
                        title: 'Mode A: Objektif',
                        desc: 'Penilaian otomatis penuh (8 tipe soal: PG, Multi-Select, B/S, Matching, Ordering, Isian, Numerik).',
                      },
                      {
                        mode: 'ESSAY',
                        title: 'Mode B: Esai & Studi Kasus',
                        desc: 'Penilaian manual Dosen dengan editor Tiptap, batas kata, lampiran S3, dan rubrik kriteria.',
                      },
                      {
                        mode: 'HYBRID',
                        title: 'Mode C: Hybrid (Objektif + Esai)',
                        desc: 'Kombinasi Bagian A (Otomatis) + Bagian B (Esai Manual) dalam satu ujian terpadu.',
                      },
                    ].map((m) => (
                      <button
                        key={m.mode}
                        type="button"
                        onClick={() => setAssessmentMode(m.mode as any)}
                        className={`p-4 rounded-xl border text-left transition ${
                          assessmentMode === m.mode
                            ? 'border-slate-900 bg-slate-900 text-white'
                            : 'border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-800'
                        }`}
                      >
                        <div className="text-xs font-bold">{m.title}</div>
                        <p
                          className={`mt-1 text-[11px] leading-relaxed ${
                            assessmentMode === m.mode
                              ? 'text-slate-300'
                              : 'text-slate-500'
                          }`}
                        >
                          {m.desc}
                        </p>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Topik / Modul Perkuliahan
                    </label>
                    <select
                      value={topicId}
                      onChange={(e) => setTopicId(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs bg-white"
                    >
                      <option value="">-- Umum / Lintas Topik --</option>
                      {topics.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.title}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Kategori Evaluasi Akademik
                    </label>
                    <select
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs bg-white"
                    >
                      <option value="QUIZ">Kuis Terstruktur (Quiz)</option>
                      <option value="MIDTERM">Ujian Tengah Semester (UTS)</option>
                      <option value="FINAL_EXAM">Ujian Akhir Semester (UAS)</option>
                      <option value="PRACTICAL_TEST">Ujian Praktikum Laboratorium</option>
                      <option value="DIAGNOSTIC">Tes Diagnostik / Pre-Test</option>
                      <option value="REMEDIAL">Ujian Remedial / Perbaikan</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Judul Asesmen / Ujian
                  </label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Contoh: Ujian Tengah Semester — Basis Data Lanjut & Transaksi Terdistribusi"
                    className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm font-semibold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Deskripsi Ringkas
                  </label>
                  <textarea
                    rows={2}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Ringkasan capaian pembelajaran yang diujikan..."
                    className="w-full px-3.5 py-2 rounded-lg border border-slate-300 text-xs"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Petunjuk & Tata Tertib Ujian (Tiptap Rich Text)
                  </label>
                  <TiptapMaterialEditor
                    contentJson={instructionsJson}
                    onChange={(json, html, plain) => {
                      setInstructionsJson(json);
                      setInstructions(plain || html);
                    }}
                  />
                </div>
              </div>
            </div>

            <div className="lg:col-span-4 space-y-6">
              <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
                <h3 className="text-sm font-bold text-slate-900">
                  Parameter Skor, Kelulusan & Durasi
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Skor Maksimum
                    </label>
                    <input
                      type="number"
                      min={1}
                      value={maxScore}
                      onChange={(e) => setMaxScore(Number(e.target.value))}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 font-mono text-sm font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Ambang Lulus (Passing Grade)
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={passingGrade}
                      onChange={(e) => setPassingGrade(Number(e.target.value))}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 font-mono text-sm font-bold"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Durasi Timer Server (Menit)
                    </label>
                    <input
                      type="number"
                      min={5}
                      value={durationMinutes}
                      onChange={(e) => {
                        setDurationMinutes(Number(e.target.value));
                        setEstimatedDurationMinutes(Number(e.target.value));
                      }}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 font-mono text-sm font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Maksimum Percobaan
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={10}
                      value={maxAttempts}
                      onChange={(e) => setMaxAttempts(Number(e.target.value))}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 font-mono text-sm font-bold"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Status Publikasi
                  </label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs font-bold bg-white"
                  >
                    <option value="DRAFT">DRAFT (Belum Terlihat Mahasiswa)</option>
                    <option value="PUBLISHED">PUBLISHED (Aktif & Terbuka)</option>
                    <option value="SCHEDULED">SCHEDULED (Terjadwal)</option>
                    <option value="CLOSED">CLOSED (Ditutup)</option>
                    <option value="ARCHIVED">ARCHIVED (Diarsipkan)</option>
                  </select>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* =================================================================
            TAB 2: QUESTION MANAGEMENT & DEDICATED QUESTION EDITORS
        ================================================================= */}
        {activeTab === 'questions' && (
          <div className="space-y-6">
            {/* Toolbar to Add Any Objective or Essay Question Type */}
            <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h2 className="text-sm font-bold text-slate-900">
                    Manajemen Butir Soal & Pool Acak
                  </h2>
                  <p className="text-xs text-slate-500">
                    Tambahkan soal objektif (8 tipe), soal esai dengan rubrik (7 tipe), atau pool soal acak dari Bank Soal.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleAddQuestionPool}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-amber-400 bg-amber-50 text-amber-950 text-xs font-bold hover:bg-amber-100"
                >
                  <Shuffle className="w-3.5 h-3.5" />
                  Tambah Pool Soal Acak (Random Question Pool)
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-slate-100">
                <div>
                  <span className="block text-[11px] font-bold uppercase text-slate-500 mb-2">
                    + Tambah Soal Objektif (Otomatis Server-Side)
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {OBJECTIVE_TYPES.map((ot) => (
                      <button
                        key={ot.value}
                        type="button"
                        onClick={() =>
                          handleAddBlankQuestion('OBJECTIVE', ot.value)
                        }
                        className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-900 hover:text-white text-xs font-semibold transition"
                      >
                        + {ot.label.split(' (')[0]}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <span className="block text-[11px] font-bold uppercase text-slate-500 mb-2">
                    + Tambah Soal Esai & Studi Kasus (Manual / Rubrik)
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {ESSAY_TYPES.map((et) => (
                      <button
                        key={et.value}
                        type="button"
                        onClick={() => handleAddBlankQuestion('ESSAY', et.value)}
                        className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-amber-500 hover:text-slate-950 text-xs font-semibold transition"
                      >
                        + {et.label.split(' (')[0]}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Random Question Pools */}
            {questionPools.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-sm font-bold text-slate-900">
                  Konfigurasi Random Question Pools ({questionPools.length})
                </h3>
                {questionPools.map((pool, pIdx) => (
                  <div
                    key={pIdx}
                    className="bg-amber-50/60 border border-amber-300 rounded-xl p-5 space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-amber-950 flex items-center gap-1.5">
                        <Shuffle className="w-4 h-4 text-amber-700" />
                        Pool Soal Acak #{pIdx + 1} (Di-snapshot saat mahasiswa memulai ujian)
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setQuestionPools((prev) =>
                            prev.filter((_, i) => i !== pIdx)
                          )
                        }
                        className="text-xs text-rose-700 font-bold hover:underline"
                      >
                        Hapus Pool
                      </button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                      <div>
                        <label className="block text-[11px] font-bold text-slate-700">
                          Sumber Bank Soal
                        </label>
                        <select
                          value={pool.questionBankId || ''}
                          onChange={(e) =>
                            setQuestionPools((prev) =>
                              prev.map((item, i) =>
                                i === pIdx
                                  ? { ...item, questionBankId: e.target.value }
                                  : item
                              )
                            )
                          }
                          className="w-full mt-1 px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs bg-white"
                        >
                          <option value="">Semua Bank Soal Kelas</option>
                          {questionBanks.map((b) => (
                            <option key={b.id} value={b.id}>
                              {b.title}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-slate-700">
                          Filter Kategori / Topik
                        </label>
                        <input
                          type="text"
                          value={pool.categoryFilter || ''}
                          onChange={(e) =>
                            setQuestionPools((prev) =>
                              prev.map((item, i) =>
                                i === pIdx
                                  ? { ...item, categoryFilter: e.target.value }
                                  : item
                              )
                            )
                          }
                          placeholder="Kosongkan untuk semua..."
                          className="w-full mt-1 px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs bg-white"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-slate-700">
                          Jumlah Soal Diambil
                        </label>
                        <input
                          type="number"
                          min={1}
                          value={pool.questionCount}
                          onChange={(e) =>
                            setQuestionPools((prev) =>
                              prev.map((item, i) =>
                                i === pIdx
                                  ? {
                                      ...item,
                                      questionCount: Number(e.target.value),
                                    }
                                  : item
                              )
                            )
                          }
                          className="w-full mt-1 px-2.5 py-1.5 rounded-lg border border-slate-300 font-mono text-xs font-bold bg-white"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-slate-700">
                          Poin per Soal
                        </label>
                        <input
                          type="number"
                          min={1}
                          value={pool.pointsPerQuestion}
                          onChange={(e) =>
                            setQuestionPools((prev) =>
                              prev.map((item, i) =>
                                i === pIdx
                                  ? {
                                      ...item,
                                      pointsPerQuestion: Number(e.target.value),
                                    }
                                  : item
                              )
                            )
                          }
                          className="w-full mt-1 px-2.5 py-1.5 rounded-lg border border-slate-300 font-mono text-xs font-bold bg-white"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Individual Question Editors */}
            <div className="space-y-4">
              {questionsList.map((q, qIdx) => (
                <div
                  key={qIdx}
                  className="bg-white rounded-xl border border-slate-200 p-6 space-y-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
                    <div className="flex items-center gap-2 text-xs">
                      <span className="font-mono font-bold text-slate-900">
                        Soal #{qIdx + 1}
                      </span>
                      <span>·</span>
                      <span className="font-bold text-amber-700">
                        {q.questionMode} — {q.questionType}
                      </span>
                      <span>·</span>
                      <span className="font-mono text-slate-600">
                        {q.points} Poin
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleMoveQuestion(qIdx, -1)}
                        className="p-1.5 rounded border border-slate-200 text-slate-600 hover:bg-slate-100"
                        title="Pindah ke Atas"
                      >
                        <ArrowUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleMoveQuestion(qIdx, 1)}
                        className="p-1.5 rounded border border-slate-200 text-slate-600 hover:bg-slate-100"
                        title="Pindah ke Bawah"
                      >
                        <ArrowDown className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDuplicateQuestionItem(qIdx)}
                        className="p-1.5 rounded border border-slate-200 text-slate-600 hover:bg-slate-100"
                        title="Duplikat Soal"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setQuestionsList((prev) =>
                            prev.filter((_, i) => i !== qIdx)
                          )
                        }
                        className="p-1.5 rounded border border-rose-200 text-rose-700 hover:bg-rose-50"
                        title="Hapus Soal"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                    <div className="sm:col-span-2">
                      <label className="block text-[11px] font-bold text-slate-700">
                        Tipe Soal
                      </label>
                      <select
                        value={q.questionType}
                        onChange={(e) => {
                          const val = e.target.value;
                          const isEss = ESSAY_TYPES.some((et) => et.value === val);
                          setQuestionsList((prev) =>
                            prev.map((item, i) =>
                              i === qIdx
                                ? {
                                    ...item,
                                    questionType: val,
                                    questionMode: isEss ? 'ESSAY' : 'OBJECTIVE',
                                  }
                                : item
                            )
                          );
                        }}
                        className="w-full mt-1 px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-semibold bg-white"
                      >
                        <optgroup label="Objektif (Otomatis)">
                          {OBJECTIVE_TYPES.map((ot) => (
                            <option key={ot.value} value={ot.value}>
                              {ot.label}
                            </option>
                          ))}
                        </optgroup>
                        <optgroup label="Esai & Studi Kasus (Manual / Rubrik)">
                          {ESSAY_TYPES.map((et) => (
                            <option key={et.value} value={et.value}>
                              {et.label}
                            </option>
                          ))}
                        </optgroup>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-700">
                        Bobot Poin
                      </label>
                      <input
                        type="number"
                        min={1}
                        value={q.points}
                        onChange={(e) =>
                          setQuestionsList((prev) =>
                            prev.map((item, i) =>
                              i === qIdx
                                ? { ...item, points: Number(e.target.value) }
                                : item
                            )
                          )
                        }
                        className="w-full mt-1 px-3 py-1.5 rounded-lg border border-slate-300 font-mono text-xs font-bold"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-700">
                        Tingkat Kesulitan
                      </label>
                      <select
                        value={q.difficulty}
                        onChange={(e) =>
                          setQuestionsList((prev) =>
                            prev.map((item, i) =>
                              i === qIdx
                                ? { ...item, difficulty: e.target.value }
                                : item
                            )
                          )
                        }
                        className="w-full mt-1 px-3 py-1.5 rounded-lg border border-slate-300 text-xs bg-white"
                      >
                        <option value="EASY">Mudah (Easy)</option>
                        <option value="MEDIUM">Sedang (Medium)</option>
                        <option value="HARD">Sulit (Hard)</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Pertanyaan / Pernyataan Soal
                    </label>
                    <textarea
                      rows={3}
                      value={q.promptText}
                      onChange={(e) =>
                        setQuestionsList((prev) =>
                          prev.map((item, i) =>
                            i === qIdx
                              ? { ...item, promptText: e.target.value }
                              : item
                          )
                        )
                      }
                      placeholder="Tuliskan teks soal atau studi kasus..."
                      className="w-full px-3.5 py-2 rounded-lg border border-slate-300 text-xs"
                    />
                  </div>

                  {/* Type-Specific Answer Key Editor */}
                  {(q.questionType === 'SINGLE_CHOICE' ||
                    q.questionType === 'MULTIPLE_SELECT' ||
                    q.questionType === 'TRUE_FALSE') && (
                    <div className="space-y-2 bg-slate-50 p-4 rounded-xl border border-slate-200">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-800">
                          Opsi Jawaban & Kunci Jawaban Server (Terisolasi dari Mahasiswa)
                        </span>
                        {q.questionType !== 'TRUE_FALSE' && (
                          <button
                            type="button"
                            onClick={() =>
                              setQuestionsList((prev) =>
                                prev.map((item, i) =>
                                  i === qIdx
                                    ? {
                                        ...item,
                                        options: [
                                          ...(item.options || []),
                                          {
                                            optionLabel: String.fromCharCode(
                                              65 + (item.options?.length || 0)
                                            ),
                                            optionText: '',
                                            isCorrect: false,
                                            scoreWeight: 0,
                                          },
                                        ],
                                      }
                                    : item
                                )
                              )
                            }
                            className="text-xs font-bold text-amber-700 hover:underline"
                          >
                            + Tambah Opsi
                          </button>
                        )}
                      </div>
                      {(q.options || []).map((opt: any, oIdx: number) => (
                        <div
                          key={oIdx}
                          className="flex items-center gap-2.5 text-xs"
                        >
                          <input
                            type={
                              q.questionType === 'MULTIPLE_SELECT'
                                ? 'checkbox'
                                : 'radio'
                            }
                            name={`q-correct-${qIdx}`}
                            checked={Boolean(opt.isCorrect)}
                            onChange={(e) =>
                              setQuestionsList((prev) =>
                                prev.map((item, i) => {
                                  if (i !== qIdx) return item;
                                  const nextOpts = (item.options || []).map(
                                    (o: any, j: number) => {
                                      if (q.questionType === 'MULTIPLE_SELECT') {
                                        return j === oIdx
                                          ? { ...o, isCorrect: e.target.checked }
                                          : o;
                                      }
                                      return {
                                        ...o,
                                        isCorrect: j === oIdx,
                                      };
                                    }
                                  );
                                  return { ...item, options: nextOpts };
                                })
                              )
                            }
                          />
                          <span className="font-mono font-bold w-5">
                            {opt.optionLabel || String.fromCharCode(65 + oIdx)}.
                          </span>
                          <input
                            type="text"
                            value={opt.optionText}
                            onChange={(e) =>
                              setQuestionsList((prev) =>
                                prev.map((item, i) => {
                                  if (i !== qIdx) return item;
                                  const nextOpts = (item.options || []).map(
                                    (o: any, j: number) =>
                                      j === oIdx
                                        ? { ...o, optionText: e.target.value }
                                        : o
                                  );
                                  return { ...item, options: nextOpts };
                                })
                              )
                            }
                            className="flex-1 px-2.5 py-1.5 rounded border border-slate-300 bg-white text-xs"
                          />
                          {opt.isCorrect && (
                            <span className="text-[11px] font-bold text-emerald-700">
                              Kunci Benar
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {q.questionType === 'MATCHING' && (
                    <div className="space-y-2 bg-slate-50 p-4 rounded-xl border border-slate-200">
                      <span className="text-xs font-bold text-slate-800 block">
                        Pasangan Menjodohkan (Kolom Kiri ↔ Kolom Kanan)
                      </span>
                      {(q.answerConfig?.pairs || []).map(
                        (pair: any, pIdx: number) => (
                          <div
                            key={pIdx}
                            className="grid grid-cols-2 gap-2 text-xs"
                          >
                            <input
                              type="text"
                              value={pair.leftText}
                              onChange={(e) =>
                                setQuestionsList((prev) =>
                                  prev.map((item, i) => {
                                    if (i !== qIdx) return item;
                                    const nextPairs = [
                                      ...(item.answerConfig?.pairs || []),
                                    ];
                                    nextPairs[pIdx] = {
                                      ...nextPairs[pIdx],
                                      leftText: e.target.value,
                                    };
                                    return {
                                      ...item,
                                      answerConfig: {
                                        ...item.answerConfig,
                                        pairs: nextPairs,
                                      },
                                    };
                                  })
                                )
                              }
                              placeholder="Pernyataan Kiri"
                              className="px-2.5 py-1.5 rounded border border-slate-300 bg-white"
                            />
                            <input
                              type="text"
                              value={pair.rightText}
                              onChange={(e) =>
                                setQuestionsList((prev) =>
                                  prev.map((item, i) => {
                                    if (i !== qIdx) return item;
                                    const nextPairs = [
                                      ...(item.answerConfig?.pairs || []),
                                    ];
                                    nextPairs[pIdx] = {
                                      ...nextPairs[pIdx],
                                      rightText: e.target.value,
                                    };
                                    return {
                                      ...item,
                                      answerConfig: {
                                        ...item.answerConfig,
                                        pairs: nextPairs,
                                      },
                                    };
                                  })
                                )
                              }
                              placeholder="Pasangan Kanan yang Benar"
                              className="px-2.5 py-1.5 rounded border border-slate-300 bg-white"
                            />
                          </div>
                        )
                      )}
                    </div>
                  )}

                  {q.questionType === 'ORDERING' && (
                    <div className="space-y-2 bg-slate-50 p-4 rounded-xl border border-slate-200">
                      <span className="text-xs font-bold text-slate-800 block">
                        Urutan Item yang Benar (Akan Diacak untuk Mahasiswa)
                      </span>
                      {(q.answerConfig?.items || []).map(
                        (ord: any, oIdx: number) => (
                          <div
                            key={oIdx}
                            className="flex items-center gap-2 text-xs"
                          >
                            <span className="font-mono font-bold">
                              #{oIdx + 1}
                            </span>
                            <input
                              type="text"
                              value={ord.text}
                              onChange={(e) =>
                                setQuestionsList((prev) =>
                                  prev.map((item, i) => {
                                    if (i !== qIdx) return item;
                                    const nextItems = [
                                      ...(item.answerConfig?.items || []),
                                    ];
                                    nextItems[oIdx] = {
                                      ...nextItems[oIdx],
                                      text: e.target.value,
                                    };
                                    return {
                                      ...item,
                                      answerConfig: {
                                        ...item.answerConfig,
                                        items: nextItems,
                                      },
                                    };
                                  })
                                )
                              }
                              className="flex-1 px-2.5 py-1.5 rounded border border-slate-300 bg-white"
                            />
                          </div>
                        )
                      )}
                    </div>
                  )}

                  {(q.questionType === 'FILL_IN_BLANK' ||
                    q.questionType === 'SHORT_ANSWER') && (
                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2">
                      <label className="block text-xs font-bold text-slate-800">
                        Variasi Jawaban Diterima (Pisahkan dengan koma)
                      </label>
                      <input
                        type="text"
                        value={(
                          q.answerConfig?.acceptedAnswers ||
                          q.answerConfig?.acceptedVariants ||
                          []
                        ).join(', ')}
                        onChange={(e) => {
                          const arr = e.target.value
                            .split(',')
                            .map((s) => s.trim())
                            .filter(Boolean);
                          setQuestionsList((prev) =>
                            prev.map((item, i) =>
                              i === qIdx
                                ? {
                                    ...item,
                                    answerConfig: {
                                      ...item.answerConfig,
                                      acceptedAnswers: arr,
                                      acceptedVariants: arr,
                                    },
                                  }
                                : item
                            )
                          );
                        }}
                        placeholder="Contoh: SELECT, select"
                        className="w-full px-3 py-1.5 rounded border border-slate-300 bg-white text-xs font-mono"
                      />
                    </div>
                  )}

                  {q.questionType === 'NUMERIC' && (
                    <div className="grid grid-cols-3 gap-3 bg-slate-50 p-4 rounded-xl border border-slate-200">
                      <div>
                        <label className="block text-xs font-bold text-slate-700">
                          Nilai Eksak
                        </label>
                        <input
                          type="number"
                          step="any"
                          value={q.answerConfig?.exactValue ?? 0}
                          onChange={(e) =>
                            setQuestionsList((prev) =>
                              prev.map((item, i) =>
                                i === qIdx
                                  ? {
                                      ...item,
                                      answerConfig: {
                                        ...item.answerConfig,
                                        exactValue: Number(e.target.value),
                                      },
                                    }
                                  : item
                              )
                            )
                          }
                          className="w-full mt-1 px-2.5 py-1.5 rounded border border-slate-300 bg-white font-mono text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-700">
                          Toleransi (±)
                        </label>
                        <input
                          type="number"
                          step="any"
                          value={q.answerConfig?.tolerance ?? 0}
                          onChange={(e) =>
                            setQuestionsList((prev) =>
                              prev.map((item, i) =>
                                i === qIdx
                                  ? {
                                      ...item,
                                      answerConfig: {
                                        ...item.answerConfig,
                                        tolerance: Number(e.target.value),
                                      },
                                    }
                                  : item
                              )
                            )
                          }
                          className="w-full mt-1 px-2.5 py-1.5 rounded border border-slate-300 bg-white font-mono text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-700">
                          Satuan (Opsional)
                        </label>
                        <input
                          type="text"
                          value={q.answerConfig?.unit ?? ''}
                          onChange={(e) =>
                            setQuestionsList((prev) =>
                              prev.map((item, i) =>
                                i === qIdx
                                  ? {
                                      ...item,
                                      answerConfig: {
                                        ...item.answerConfig,
                                        unit: e.target.value,
                                      },
                                    }
                                  : item
                              )
                            )
                          }
                          placeholder="ms, node, MB..."
                          className="w-full mt-1 px-2.5 py-1.5 rounded border border-slate-300 bg-white text-xs"
                        />
                      </div>
                    </div>
                  )}

                  {q.questionMode === 'ESSAY' && (
                    <div className="bg-amber-50/50 p-4 rounded-xl border border-amber-200 space-y-3">
                      <span className="text-xs font-bold text-amber-950 block">
                        Konfigurasi Soal Esai & Rubrik Penilaian
                      </span>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                        <div>
                          <label className="block font-bold text-slate-700">
                            Minimal Kata
                          </label>
                          <input
                            type="number"
                            value={q.answerConfig?.minWords ?? 20}
                            onChange={(e) =>
                              setQuestionsList((prev) =>
                                prev.map((item, i) =>
                                  i === qIdx
                                    ? {
                                        ...item,
                                        answerConfig: {
                                          ...item.answerConfig,
                                          minWords: Number(e.target.value),
                                        },
                                      }
                                    : item
                                )
                              )
                            }
                            className="w-full mt-1 px-2.5 py-1.5 rounded border border-slate-300 bg-white font-mono"
                          />
                        </div>
                        <div>
                          <label className="block font-bold text-slate-700">
                            Maksimal Kata
                          </label>
                          <input
                            type="number"
                            value={q.answerConfig?.maxWords ?? 1000}
                            onChange={(e) =>
                              setQuestionsList((prev) =>
                                prev.map((item, i) =>
                                  i === qIdx
                                    ? {
                                        ...item,
                                        answerConfig: {
                                          ...item.answerConfig,
                                          maxWords: Number(e.target.value),
                                        },
                                      }
                                    : item
                                )
                              )
                            }
                            className="w-full mt-1 px-2.5 py-1.5 rounded border border-slate-300 bg-white font-mono"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Pembahasan / Penjelasan Jawaban (Ditampilkan Sesuai Kebijakan Ujian)
                    </label>
                    <input
                      type="text"
                      value={q.explanation || ''}
                      onChange={(e) =>
                        setQuestionsList((prev) =>
                          prev.map((item, i) =>
                            i === qIdx
                              ? { ...item, explanation: e.target.value }
                              : item
                          )
                        )
                      }
                      placeholder="Penjelasan konsep untuk umpan balik pembelajaran..."
                      className="w-full px-3 py-1.5 rounded-lg border border-slate-300 text-xs"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* =================================================================
            TAB 3: QUESTION BANK MANAGEMENT & IMPORT
        ================================================================= */}
        {activeTab === 'bank' && (
          <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  Bank Soal Terpadu (Question Bank Repository)
                </h2>
                <p className="text-xs text-slate-500">
                  Impor butir soal terstandarisasi berdasarkan topik, tingkat kesulitan, dan CPMK ke dalam asesmen ini.
                </p>
              </div>
              <select
                value={selectedBankId}
                onChange={(e) => handleSelectBank(e.target.value)}
                className="px-3.5 py-2 rounded-lg border border-slate-300 text-xs font-bold bg-white"
              >
                {questionBanks.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.title} ({b.questionCount || 0} Soal)
                  </option>
                ))}
              </select>
            </div>

            <div className="divide-y divide-slate-100">
              {bankQuestions.map((bq) => {
                const alreadyAdded = questionsList.some(
                  (q) => q.questionId === bq.id
                );
                return (
                  <div
                    key={bq.id}
                    className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 text-xs text-slate-500 font-mono">
                        <span className="font-bold text-slate-900">
                          {bq.questionMode} · {bq.questionType}
                        </span>
                        <span>·</span>
                        <span>Kesulitan: {bq.difficulty}</span>
                        <span>·</span>
                        <span>{bq.points} Poin</span>
                        {bq.learningOutcome && (
                          <>
                            <span>·</span>
                            <span>{bq.learningOutcome}</span>
                          </>
                        )}
                      </div>
                      <p className="text-sm font-semibold text-slate-900">
                        {bq.promptText}
                      </p>
                    </div>

                    <button
                      type="button"
                      disabled={alreadyAdded}
                      onClick={() => handleImportQuestionFromBank(bq)}
                      className={`px-3.5 py-2 rounded-lg text-xs font-bold shrink-0 ${
                        alreadyAdded
                          ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                          : 'bg-slate-900 text-white hover:bg-slate-800'
                      }`}
                    >
                      {alreadyAdded ? (
                        <span className="inline-flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Terdaftar di Ujian
                        </span>
                      ) : (
                        '+ Impor ke Ujian'
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* =================================================================
            TAB 4: ASSESSMENT SETTINGS, RANDOMIZATION & SECURITY POLICIES
        ================================================================= */}
        {activeTab === 'settings' && (
          <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-6">
            <h2 className="text-base font-bold text-slate-900">
              Konfigurasi Pelaksanaan, Pengacakan, Navigasi & Kebijakan Penilaian
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-3">
                <h3 className="text-xs font-bold uppercase text-slate-500">
                  Integritas & Navigasi Peserta
                </h3>
                {[
                  {
                    key: 'randomizeQuestions',
                    label: 'Acak Urutan Soal per Mahasiswa (Question Randomization)',
                  },
                  {
                    key: 'randomizeOptions',
                    label: 'Acak Urutan Opsi Jawaban (Option Randomization)',
                  },
                  {
                    key: 'oneQuestionAtATime',
                    label: 'Tampilkan Satu Soal per Halaman (One-Question-at-a-Time)',
                  },
                  {
                    key: 'allowBackwardNavigation',
                    label: 'Izinkan Navigasi Mundur ke Soal Sebelumnya',
                  },
                  {
                    key: 'allowAnswerChanges',
                    label: 'Izinkan Mahasiswa Mengubah Jawaban Sebelum Submit',
                  },
                  {
                    key: 'showRemainingTime',
                    label: 'Tampilkan Countdown Timer Server di Layar Ujian',
                  },
                  {
                    key: 'autoSubmit',
                    label: 'Kumpulkan Otomatis Saat Waktu Server Habis (Auto-Submit)',
                  },
                  {
                    key: 'autosave',
                    label: 'Aktifkan Penyimpanan Jawaban Otomatis (Real-Time Autosave)',
                  },
                ].map((chk) => (
                  <label
                    key={chk.key}
                    className="flex items-center gap-3 p-3 rounded-lg border border-slate-200 bg-slate-50/60 text-xs font-medium text-slate-800 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={Boolean((settingsConfig as any)[chk.key])}
                      onChange={(e) =>
                        setSettingsConfig((prev) => ({
                          ...prev,
                          [chk.key]: e.target.checked,
                        }))
                      }
                      className="rounded border-slate-300"
                    />
                    <span>{chk.label}</span>
                  </label>
                ))}
              </div>

              <div className="space-y-4">
                <h3 className="text-xs font-bold uppercase text-slate-500">
                  Kebijakan Skor, Penalti & Visibilitas Hasil
                </h3>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Visibilitas Nilai ke Mahasiswa
                  </label>
                  <select
                    value={settingsConfig.resultVisibility}
                    onChange={(e) =>
                      setSettingsConfig((prev) => ({
                        ...prev,
                        resultVisibility: e.target.value,
                      }))
                    }
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs bg-white"
                  >
                    <option value="IMMEDIATE_OBJECTIVE">
                      Langsung Setelah Submit (Khusus Mode Objektif)
                    </option>
                    <option value="AFTER_PUBLISH">
                      Setelah Dosen Mempublikasikan Hasil Resmi
                    </option>
                    <option value="NEVER">Sembunyikan Detail Skor</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Visibilitas Pembahasan Soal (Explanation Visibility)
                  </label>
                  <select
                    value={settingsConfig.explanationVisibility}
                    onChange={(e) =>
                      setSettingsConfig((prev) => ({
                        ...prev,
                        explanationVisibility: e.target.value,
                      }))
                    }
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs bg-white"
                  >
                    <option value="AFTER_PUBLISH">
                      Setelah Nilai Dipublikasikan
                    </option>
                    <option value="AFTER_SUBMIT">
                      Setelah Mahasiswa Mengumpulkan Ujian
                    </option>
                    <option value="NEVER">Jangan Tampilkan Pembahasan</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Kebijakan Keterlambatan (Late Attempt Policy)
                  </label>
                  <select
                    value={lateAttemptPolicy}
                    onChange={(e) => setLateAttemptPolicy(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs bg-white"
                  >
                    <option value="REJECT">
                      Tolak Percobaan Setelah Batas Waktu Berakhir
                    </option>
                    <option value="ALLOW_MARK_LATE">
                      Izinkan dengan Penanda Terlambat (Mark as Late)
                    </option>
                    <option value="PENALTY_PERCENT">
                      Izinkan dengan Pemotongan Skor Persentase
                    </option>
                  </select>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* =================================================================
            TAB 5: STUDENT PREVIEW BEFORE PUBLISHING
        ================================================================= */}
        {activeTab === 'preview' && (
          <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-6">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div>
                <span className="text-xs font-mono uppercase text-amber-700 font-bold">
                  Simulasi Tampilan Mahasiswa (Tanpa Kunci Jawaban)
                </span>
                <h2 className="text-lg font-bold text-slate-900 mt-0.5">
                  {title || 'Pratinjau Ujian'}
                </h2>
              </div>
              <div className="text-right font-mono text-xs text-slate-600">
                <div>Durasi: {durationMinutes} Menit</div>
                <div>Skor Maksimum: {maxScore} Poin</div>
              </div>
            </div>

            <div className="prose prose-slate max-w-none text-sm p-4 rounded-xl bg-slate-50 border border-slate-200">
              <TiptapReadOnlyRenderer contentJson={instructionsJson} />
            </div>

            <div className="space-y-4">
              {questionsList.map((q, idx) => (
                <div
                  key={idx}
                  className="p-5 rounded-xl border border-slate-200 space-y-3"
                >
                  <div className="flex items-center justify-between text-xs text-slate-500 font-mono">
                    <span className="font-bold text-slate-900">
                      Butir Soal #{idx + 1} ({q.questionType})
                    </span>
                    <span>{q.points} Poin</span>
                  </div>
                  <p className="text-sm font-medium text-slate-900">
                    {q.promptText}
                  </p>
                  {(q.options || []).length > 0 && (
                    <div className="space-y-1.5 pt-2">
                      {q.options.map((o: any, oIdx: number) => (
                        <div
                          key={oIdx}
                          className="p-2.5 rounded-lg border border-slate-200 bg-slate-50 text-xs text-slate-700"
                        >
                          <span className="font-mono font-bold mr-2">
                            {o.optionLabel || String.fromCharCode(65 + oIdx)}.
                          </span>
                          {o.optionText}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AssessmentBuilderPage;
