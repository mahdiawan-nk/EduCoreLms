import crypto from 'crypto';
import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq, and, asc, desc, inArray } from 'drizzle-orm';
import * as XLSX from 'xlsx';
import { db } from '../db/index.ts';
import {
  classrooms,
  classroomTopics,
  classroomEnrollments,
  assessments,
  assessmentSections,
  questionBanks,
  questions,
  questionOptions,
  questionMedia,
  questionBankTags,
  assessmentQuestions,
  assessmentQuestionPools,
  assessmentAccommodations,
  assessmentAttempts,
  attemptQuestions,
  attemptAnswers,
  essayAttachments,
  assessmentRubrics,
  assessmentRubricCriteria,
  essayGrades,
  essayFeedback,
  assessmentResults,
  assessmentEvents,
  gradeCategories,
  gradeItems,
  gradeRecords,
  notifications,
  users,
} from '../db/schema.ts';
import {
  authenticateRequest,
  checkClassroomAccess,
  sendSuccess,
  sendError,
  recordAuditLog,
} from './security.ts';
import { resolveClassroomRole, recordClassroomAudit } from './classroomWorkspaceRoutes.ts';
import {
  validateAttachmentRequest,
  signPresignedPutUrl,
  signPresignedGetUrl,
  verifyUploadedObject,
  generateAttachmentPreviewPayload,
  sanitizePreviewHtml,
} from './storage.ts';
import {
  buildQuestionSnapshots,
  evaluateObjectiveQuestion,
  calculateServerEssayQuestionScore,
  deterministicShuffle,
} from './assessmentGradingEngine.ts';

let assessmentsSeeded = false;

async function ensureSeededAssessmentsAndQuestionBanks() {
  if (assessmentsSeeded) return;
  try {
    const existingAssessments = await db.select().from(assessments);
    if (existingAssessments.length > 0) {
      assessmentsSeeded = true;
      return;
    }

    const allClassrooms = await db.select().from(classrooms);
    if (allClassrooms.length === 0) return;

    const cls = allClassrooms[0];
    const topics = await db
      .select()
      .from(classroomTopics)
      .where(eq(classroomTopics.classroomId, cls.id))
      .orderBy(asc(classroomTopics.sortOrder));
    const topicId = topics[0]?.id || null;
    const authorId = cls.createdById;

    // 1. Create a comprehensive Question Bank
    const [bank] = await db
      .insert(questionBanks)
      .values({
        classroomId: cls.id,
        courseId: cls.courseId,
        ownerId: authorId,
        title: 'Bank Soal Utama — Arsitektur Basis Data & Sistem Terdistribusi',
        subject: 'Basis Data & Sistem Terdistribusi',
        topic: 'Transaksi ACID, Indexing, Keamanan RBAC & Replikasi',
        description:
          'Koleksi soal terstandarisasi mencakup 8 tipe soal objektif dan soal esai analitis berjenjang.',
        isShared: true,
      })
      .returning();

    // Create 8 Objective Questions (one of each supported objective type) + 2 Essay Questions
    const [qSingle] = await db
      .insert(questions)
      .values({
        questionBankId: bank.id,
        classroomId: cls.id,
        authorId,
        questionMode: 'OBJECTIVE',
        questionType: 'SINGLE_CHOICE',
        subject: 'Basis Data',
        topic: 'Transaksi ACID',
        category: 'Database Engine',
        difficulty: 'EASY',
        learningOutcome: 'CPMK-01: Memahami isolasi transaksi relasional',
        promptText:
          'Properti ACID manakah yang menjamin bahwa seluruh operasi dalam satu transaksi basis data berhasil dieksekusi sepenuhnya atau dibatalkan seluruhnya (all-or-nothing)?',
        promptJson: {
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              content: [
                {
                  type: 'text',
                  text: 'Properti ACID manakah yang menjamin bahwa seluruh operasi dalam satu transaksi basis data berhasil dieksekusi sepenuhnya atau dibatalkan seluruhnya (all-or-nothing)?',
                },
              ],
            },
          ],
        },
        points: '10',
        negativePoints: '0',
        partialCreditEnabled: false,
        explanation:
          'Atomicity memastikan transaksi diperlakukan sebagai satu unit kerja atomik yang tidak dapat dibagi.',
      })
      .returning();

    await db.insert(questionOptions).values([
      {
        questionId: qSingle.id,
        optionLabel: 'A',
        optionText: 'Atomicity',
        isCorrect: true,
        scoreWeight: '100',
        sortOrder: 1,
      },
      {
        questionId: qSingle.id,
        optionLabel: 'B',
        optionText: 'Consistency',
        isCorrect: false,
        scoreWeight: '0',
        sortOrder: 2,
      },
      {
        questionId: qSingle.id,
        optionLabel: 'C',
        optionText: 'Isolation',
        isCorrect: false,
        scoreWeight: '0',
        sortOrder: 3,
      },
      {
        questionId: qSingle.id,
        optionLabel: 'D',
        optionText: 'Durability',
        isCorrect: false,
        scoreWeight: '0',
        sortOrder: 4,
      },
    ]);

    const [qMulti] = await db
      .insert(questions)
      .values({
        questionBankId: bank.id,
        classroomId: cls.id,
        authorId,
        questionMode: 'OBJECTIVE',
        questionType: 'MULTIPLE_SELECT',
        subject: 'Keamanan Aplikasi',
        topic: 'Autentikasi & Otorisasi',
        category: 'Security',
        difficulty: 'MEDIUM',
        learningOutcome: 'CPMK-02: Menerapkan kontrol keamanan server-side',
        promptText:
          'Pilih seluruh mekanisme keamanan yang WAJIB diterapkan pada arsitektur autentikasi produksi Politeknik Kampar LMS:',
        promptJson: {
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              content: [
                {
                  type: 'text',
                  text: 'Pilih seluruh mekanisme keamanan yang WAJIB diterapkan pada arsitektur autentikasi produksi Politeknik Kampar LMS:',
                },
              ],
            },
          ],
        },
        points: '10',
        negativePoints: '0',
        partialCreditEnabled: true,
        explanation:
          'Argon2id hashing, HttpOnly cookie sessions, dan proteksi CSRF adalah standar keamanan wajib.',
      })
      .returning();

    await db.insert(questionOptions).values([
      {
        questionId: qMulti.id,
        optionLabel: 'A',
        optionText: 'Password hashing menggunakan algoritma Argon2id',
        isCorrect: true,
        scoreWeight: '50',
        sortOrder: 1,
      },
      {
        questionId: qMulti.id,
        optionLabel: 'B',
        optionText: 'Penyimpanan sesi di cookie HttpOnly dengan validasi CSRF',
        isCorrect: true,
        scoreWeight: '50',
        sortOrder: 2,
      },
      {
        questionId: qMulti.id,
        optionLabel: 'C',
        optionText: 'Menyimpan kunci jawaban ujian di localStorage browser mahasiswa',
        isCorrect: false,
        scoreWeight: '0',
        sortOrder: 3,
      },
      {
        questionId: qMulti.id,
        optionLabel: 'D',
        optionText: 'Mengizinkan koneksi langsung dari React ke PostgreSQL',
        isCorrect: false,
        scoreWeight: '0',
        sortOrder: 4,
      },
    ]);

    const [qTF] = await db
      .insert(questions)
      .values({
        questionBankId: bank.id,
        classroomId: cls.id,
        authorId,
        questionMode: 'OBJECTIVE',
        questionType: 'TRUE_FALSE',
        subject: 'Arsitektur Ujian',
        topic: 'Keamanan Kunci Jawaban',
        category: 'Security',
        difficulty: 'EASY',
        learningOutcome: 'CPMK-02: Menerapkan kontrol keamanan server-side',
        promptText:
          'Benar atau Salah: Kunci jawaban soal objektif tidak boleh dikirimkan ke browser mahasiswa selama ujian berlangsung.',
        promptJson: {
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              content: [
                {
                  type: 'text',
                  text: 'Benar atau Salah: Kunci jawaban soal objektif tidak boleh dikirimkan ke browser mahasiswa selama ujian berlangsung.',
                },
              ],
            },
          ],
        },
        points: '10',
        explanation:
          'Pernyataan Benar. Seluruh evaluasi jawaban dilakukan di server menggunakan snapshot kunci jawaban.',
      })
      .returning();

    await db.insert(questionOptions).values([
      {
        questionId: qTF.id,
        optionLabel: 'A',
        optionText: 'Benar',
        isCorrect: true,
        scoreWeight: '100',
        sortOrder: 1,
      },
      {
        questionId: qTF.id,
        optionLabel: 'B',
        optionText: 'Salah',
        isCorrect: false,
        scoreWeight: '0',
        sortOrder: 2,
      },
    ]);

    const [qMatching] = await db
      .insert(questions)
      .values({
        questionBankId: bank.id,
        classroomId: cls.id,
        authorId,
        questionMode: 'OBJECTIVE',
        questionType: 'MATCHING',
        subject: 'Basis Data',
        topic: 'Indeks & Kunci',
        category: 'Database Engine',
        difficulty: 'MEDIUM',
        learningOutcome: 'CPMK-01: Memahami isolasi transaksi relasional',
        promptText:
          'Pasangkan konsep skema basis data berikut dengan fungsi utamanya:',
        points: '10',
        partialCreditEnabled: true,
        answerConfig: {
          pairs: [
            {
              id: 'm1',
              leftText: 'Primary Key UUID',
              rightText: 'Identitas baris unik secara global tanpa urutan sekuensial mudah ditebak',
            },
            {
              id: 'm2',
              leftText: 'Foreign Key Constraint',
              rightText: 'Menjaga integritas referensial antar tabel relasional',
            },
            {
              id: 'm3',
              leftText: 'B-Tree Index',
              rightText: 'Mempercepat operasi pencarian dan pengurutan kolom',
            },
          ],
        },
        explanation:
          'UUID menjamin keunikan identitas, Foreign Key menjaga integritas referensial, dan B-Tree Index mempercepat query.',
      })
      .returning();

    const [qOrdering] = await db
      .insert(questions)
      .values({
        questionBankId: bank.id,
        classroomId: cls.id,
        authorId,
        questionMode: 'OBJECTIVE',
        questionType: 'ORDERING',
        subject: 'Sistem Terdistribusi',
        topic: 'Siklus Hidup Request API',
        category: 'Backend Architecture',
        difficulty: 'MEDIUM',
        learningOutcome: 'CPMK-03: Merancang pipeline API aman',
        promptText:
          'Urutkan tahapan pemrosesan request HTTP yang aman pada backend Fastify dari awal hingga akhir:',
        points: '10',
        partialCreditEnabled: true,
        answerConfig: {
          scoringPolicy: 'PARTIAL',
          items: [
            { id: 'step-1', text: '1. Verifikasi Sesi Cookie HttpOnly & Token CSRF', correctOrder: 1 },
            { id: 'step-2', text: '2. Validasi Payload Input dengan Skema Zod', correctOrder: 2 },
            { id: 'step-3', text: '3. Pemeriksaan Otorisasi RBAC & Kepemilikan Resource', correctOrder: 3 },
            { id: 'step-4', text: '4. Eksekusi Transaksi Database PostgreSQL & Audit Log', correctOrder: 4 },
          ],
        },
        explanation:
          'Tahapan standar: Autentikasi + CSRF -> Validasi Input Zod -> Otorisasi RBAC -> Transaksi Database.',
      })
      .returning();

    const [qFillBlank] = await db
      .insert(questions)
      .values({
        questionBankId: bank.id,
        classroomId: cls.id,
        authorId,
        questionMode: 'OBJECTIVE',
        questionType: 'FILL_IN_BLANK',
        subject: 'Basis Data',
        topic: 'Bahasa Query',
        category: 'Database Engine',
        difficulty: 'EASY',
        learningOutcome: 'CPMK-01: Memahami isolasi transaksi relasional',
        promptText:
          'Perintah SQL standar yang digunakan untuk mengambil data dari tabel relasional adalah ______.',
        points: '10',
        answerConfig: {
          acceptedAnswers: ['SELECT', 'select'],
          caseSensitive: false,
          normalizeWhitespace: true,
        },
        explanation: 'Perintah SELECT digunakan pada Data Query Language (DQL).',
      })
      .returning();

    const [qShort] = await db
      .insert(questions)
      .values({
        questionBankId: bank.id,
        classroomId: cls.id,
        authorId,
        questionMode: 'OBJECTIVE',
        questionType: 'SHORT_ANSWER',
        subject: 'Keamanan Aplikasi',
        topic: 'Kriptografi Password',
        category: 'Security',
        difficulty: 'MEDIUM',
        learningOutcome: 'CPMK-02: Menerapkan kontrol keamanan server-side',
        promptText:
          'Sebutkan nama varian algoritma pemenang Password Hashing Competition (PHC) yang tahan terhadap serangan GPU dan side-channel yang digunakan pada sistem ini!',
        points: '10',
        answerConfig: {
          acceptedVariants: ['Argon2id', 'Argon2', 'argon2id'],
          matchMode: 'CASE_INSENSITIVE',
          manualReviewFallback: true,
        },
        explanation: 'Argon2id adalah varian hibrida Argon2 yang direkomendasikan OWASP.',
      })
      .returning();

    const [qNumeric] = await db
      .insert(questions)
      .values({
        questionBankId: bank.id,
        classroomId: cls.id,
        authorId,
        questionMode: 'OBJECTIVE',
        questionType: 'NUMERIC',
        subject: 'Sistem Terdistribusi',
        topic: 'Korum Konsensus',
        category: 'Distributed Systems',
        difficulty: 'HARD',
        learningOutcome: 'CPMK-03: Merancang pipeline API aman',
        promptText:
          'Dalam klaster konsensus Raft yang terdiri dari 5 node replika, berapakah jumlah minimum node (kuorum mayoritas) yang harus menyetujui entri log agar dianggap committed?',
        points: '10',
        answerConfig: {
          exactValue: 3,
          tolerance: 0,
          decimalPrecision: 0,
          unit: 'node',
        },
        explanation: 'Kuorum mayoritas untuk N=5 adalah floor(5/2) + 1 = 3 node.',
      })
      .returning();

    const [qEssay1] = await db
      .insert(questions)
      .values({
        questionBankId: bank.id,
        classroomId: cls.id,
        authorId,
        questionMode: 'ESSAY',
        questionType: 'CASE_STUDY',
        subject: 'Basis Data & Sistem Terdistribusi',
        topic: 'Transaksi & Concurrency Control',
        category: 'Architecture Essay',
        difficulty: 'HARD',
        learningOutcome: 'CPMK-04: Menganalisis studi kasus konkurensi database',
        promptText:
          'Studi Kasus: Dua mahasiswa mendaftar secara bersamaan pada slot kursi terakhir di ruang kelas yang memiliki batas kapasitas 35 orang. Jelaskan secara rinci bagaimana transaksi database PostgreSQL dan mekanisme locking mencegah terjadinya race condition (over-enrollment)!',
        points: '20',
        answerConfig: {
          minWords: 20,
          maxWords: 1000,
          allowAttachments: true,
          allowExternalUrl: true,
          modelAnswer:
            'Menggunakan transaksi database (BEGIN ... COMMIT) dengan SELECT ... FOR UPDATE atau serializable isolation level sehingga pemeriksaan jumlah terisi dan penyisipan baris baru berjalan atomik.',
        },
        explanation:
          'Penilaian mencakup ketepatan analisis race condition, penggunaan transaksi atomik, dan contoh skema SQL/Drizzle.',
      })
      .returning();

    await db.insert(questionBankTags).values([
      { questionId: qSingle.id, tag: 'ACID', learningOutcomeCode: 'CPMK-01' },
      { questionId: qMulti.id, tag: 'Security', learningOutcomeCode: 'CPMK-02' },
      { questionId: qTF.id, tag: 'Exam-Security', learningOutcomeCode: 'CPMK-02' },
      { questionId: qMatching.id, tag: 'Schema', learningOutcomeCode: 'CPMK-01' },
      { questionId: qOrdering.id, tag: 'Fastify', learningOutcomeCode: 'CPMK-03' },
      { questionId: qFillBlank.id, tag: 'SQL', learningOutcomeCode: 'CPMK-01' },
      { questionId: qShort.id, tag: 'Argon2id', learningOutcomeCode: 'CPMK-02' },
      { questionId: qNumeric.id, tag: 'Raft', learningOutcomeCode: 'CPMK-03' },
      { questionId: qEssay1.id, tag: 'Concurrency', learningOutcomeCode: 'CPMK-04' },
    ]);

    // 2. Create a Hybrid Assessment (UTS) & an Objective Assessment (Kuis Evaluasi)
    const now = new Date();
    const nextMonth = new Date(now.getTime() + 30 * 24 * 3600 * 1000);

    const [hybridAssessment] = await db
      .insert(assessments)
      .values({
        classroomId: cls.id,
        topicId,
        authorId,
        title: 'Ujian Tengah Semester (UTS) — Arsitektur Basis Data & Keamanan Sistem (Hybrid)',
        description:
          'Evaluasi komprehensif menggabungkan Bagian A (8 Tipe Soal Objektif Otomatis) dan Bagian B (Studi Kasus Esai Analitis dengan Rubrik).',
        category: 'MIDTERM',
        assessmentMode: 'HYBRID',
        instructions:
          'Kerjakan seluruh soal Bagian A (Objektif - 80 Poin) dan Bagian B (Esai Studi Kasus - 20 Poin). Waktu ujian dihitung secara otoritatif oleh server.',
        maxScore: 100,
        passingGrade: 70,
        estimatedDurationMinutes: 60,
        durationMinutes: 60,
        maxAttempts: 2,
        startDate: new Date(now.getTime() - 3600 * 1000),
        endDate: nextMonth,
        lateAttemptPolicy: 'ALLOW_MARK_LATE',
        latePenaltyPercent: 0,
        status: 'PUBLISHED',
        publishedAt: now,
        resultsPublished: false,
      })
      .returning();

    const [secA, secB] = await db
      .insert(assessmentSections)
      .values([
        {
          assessmentId: hybridAssessment.id,
          title: 'Bagian A: Evaluasi Objektif Multi-Format (80 Poin)',
          description: 'Penilaian otomatis server-side mencakup 8 tipe soal objektif.',
          sectionType: 'OBJECTIVE',
          totalPoints: 80,
          sortOrder: 1,
          randomizeQuestions: false,
        },
        {
          assessmentId: hybridAssessment.id,
          title: 'Bagian B: Studi Kasus & Esai Analitis (20 Poin)',
          description: 'Penilaian manual berbasis rubrik oleh Dosen Pengampu.',
          sectionType: 'ESSAY',
          totalPoints: 20,
          sortOrder: 2,
          randomizeQuestions: false,
        },
      ])
      .returning();

    const [essayRubric] = await db
      .insert(assessmentRubrics)
      .values({
        assessmentId: hybridAssessment.id,
        questionId: qEssay1.id,
        title: 'Rubrik Analisis Konkurensi & Transaksi Database',
        description: 'Evaluasi ketepatan konsep isolasi transaksi dan solusi teknis.',
        totalWeight: 100,
        maxScore: '20',
        createdById: authorId,
      })
      .returning();

    await db.insert(assessmentRubricCriteria).values([
      {
        rubricId: essayRubric.id,
        criterionName: 'Identifikasi Masalah Race Condition',
        description: 'Ketepatan menjelaskan celah waktu antara pembacaan kuota dan penulisan data.',
        weight: 50,
        maxScore: '10',
        sortOrder: 1,
      },
      {
        rubricId: essayRubric.id,
        criterionName: 'Solusi Transaksi & Locking PostgreSQL',
        description: 'Ketepatan merancang transaksi atomik dan isolasi baris.',
        weight: 50,
        maxScore: '10',
        sortOrder: 2,
      },
    ]);

    const allObjQuestions = [
      qSingle,
      qMulti,
      qTF,
      qMatching,
      qOrdering,
      qFillBlank,
      qShort,
      qNumeric,
    ];
    for (let i = 0; i < allObjQuestions.length; i++) {
      await db.insert(assessmentQuestions).values({
        assessmentId: hybridAssessment.id,
        sectionId: secA.id,
        questionId: allObjQuestions[i].id,
        pointsOverride: '10',
        sortOrder: i + 1,
      });
    }

    await db.insert(assessmentQuestions).values({
      assessmentId: hybridAssessment.id,
      sectionId: secB.id,
      questionId: qEssay1.id,
      pointsOverride: '20',
      rubricId: essayRubric.id,
      sortOrder: 9,
    });

    assessmentsSeeded = true;
  } catch (err) {
    console.error('Failed to seed default assessments:', err);
  }
}

/**
 * Helper to execute automatic objective grading and status transitions for an attempt.
 */
export async function finalizeAttemptSubmission(params: {
  attemptId: string;
  actorId: string;
  isAutoSubmit: boolean;
  idempotencyKey?: string;
  ipAddress?: string;
}) {
  const { attemptId, actorId, isAutoSubmit, idempotencyKey, ipAddress } = params;

  return await db.transaction(async (tx) => {
    const [attempt] = await tx
      .select()
      .from(assessmentAttempts)
      .where(eq(assessmentAttempts.id, attemptId));

    if (!attempt) {
      throw new Error('ATTEMPT_NOT_FOUND');
    }

    // Idempotent check: if already submitted, return immediately without double-scoring
    if (
      attempt.status === 'SUBMITTED' ||
      attempt.status === 'AUTO_SUBMITTED' ||
      attempt.status === 'GRADED' ||
      attempt.status === 'TIMED_OUT'
    ) {
      return attempt;
    }

    const [assessment] = await tx
      .select()
      .from(assessments)
      .where(eq(assessments.id, attempt.assessmentId));

    if (!assessment) {
      throw new Error('ASSESSMENT_NOT_FOUND');
    }

    const settings = (assessment.settingsConfig || {}) as Record<string, any>;
    const negativeMarkingEnabled = Boolean(settings.negativeMarkingEnabled);

    const attQuestions = await tx
      .select()
      .from(attemptQuestions)
      .where(eq(attemptQuestions.attemptId, attemptId))
      .orderBy(asc(attemptQuestions.questionOrder));

    const attAnswers = await tx
      .select()
      .from(attemptAnswers)
      .where(eq(attemptAnswers.attemptId, attemptId));

    let totalObjectiveScore = 0;
    let totalEssayScore = 0;
    let hasObjectiveQuestions = false;
    let hasEssayOrManualQuestions = false;
    let allManualQuestionsGraded = true;

    for (const aq of attQuestions) {
      const ans = attAnswers.find((a) => a.attemptQuestionId === aq.id);
      const qPts = Number(aq.points || 0);
      const qNegPts = Number(aq.negativePoints || 0);

      if (aq.questionMode === 'OBJECTIVE') {
        hasObjectiveQuestions = true;
        const evalResult = evaluateObjectiveQuestion({
          questionType: aq.questionType,
          points: qPts,
          negativePoints: qNegPts,
          partialCreditEnabled: Boolean(aq.partialCreditEnabled),
          negativeMarkingEnabled,
          serverAnswerKeySnapshot: (aq.serverAnswerKeySnapshot || {}) as Record<
            string,
            any
          >,
          answerPayload: (ans?.answerPayload || {}) as Record<string, any>,
          isAnswered: Boolean(ans?.isAnswered),
        });

        if (evalResult.requiresManualReview) {
          hasEssayOrManualQuestions = true;
          allManualQuestionsGraded = false;
        } else {
          totalObjectiveScore += evalResult.autoScore;
        }

        if (ans) {
          await tx
            .update(attemptAnswers)
            .set({
              isCorrect: evalResult.isCorrect,
              partialRatio: String(evalResult.partialRatio),
              autoScore: String(evalResult.autoScore),
              finalQuestionScore: evalResult.requiresManualReview
                ? null
                : String(evalResult.autoScore),
              requiresManualReview: evalResult.requiresManualReview,
              gradingStatus: evalResult.gradingStatus,
              updatedAt: new Date(),
            })
            .where(eq(attemptAnswers.id, ans.id));
        }
      } else {
        hasEssayOrManualQuestions = true;
        if (ans?.gradingStatus === 'MANUAL_GRADED' && ans.manualScore !== null) {
          totalEssayScore += Number(ans.manualScore || 0);
        } else {
          allManualQuestionsGraded = false;
        }
      }
    }

    totalObjectiveScore = Math.max(
      0,
      Math.round(totalObjectiveScore * 100) / 100
    );

    const latePenaltyFactor =
      attempt.isLate &&
      assessment.lateAttemptPolicy === 'PENALTY_PERCENT' &&
      Number(assessment.latePenaltyPercent) > 0
        ? Math.max(0, 1 - Number(assessment.latePenaltyPercent) / 100)
        : 1;

    const rawCombined = totalObjectiveScore + totalEssayScore;
    const penalizedTotal =
      Math.round(rawCombined * latePenaltyFactor * 100) / 100;
    const maxScoreNum = Math.max(1, Number(assessment.maxScore || 100));
    const percentageScore =
      Math.round((penalizedTotal / maxScoreNum) * 10000) / 100;
    const passed = penalizedTotal >= Number(assessment.passingGrade || 70);

    const objectiveGradingStatus = hasObjectiveQuestions
      ? 'GRADED'
      : 'NOT_APPLICABLE';
    const essayGradingStatus = hasEssayOrManualQuestions
      ? allManualQuestionsGraded
        ? 'GRADED'
        : 'PENDING'
      : 'NOT_APPLICABLE';

    const canAutoPublish =
      !hasEssayOrManualQuestions &&
      (settings.gradePublicationPolicy === 'AUTO_ON_COMPLETE' ||
        settings.resultVisibility === 'IMMEDIATE_OBJECTIVE' ||
        assessment.resultsPublished);

    const finalGradingStatus = hasEssayOrManualQuestions
      ? allManualQuestionsGraded
        ? canAutoPublish
          ? 'PUBLISHED'
          : 'READY'
        : 'PENDING_ESSAY'
      : canAutoPublish
      ? 'PUBLISHED'
      : 'READY';

    const newStatus = isAutoSubmit
      ? 'AUTO_SUBMITTED'
      : !hasEssayOrManualQuestions
      ? 'GRADED'
      : 'SUBMITTED';

    const [updatedAttempt] = await tx
      .update(assessmentAttempts)
      .set({
        status: newStatus,
        submittedAt: new Date(),
        lastActivityAt: new Date(),
        idempotencyKey: idempotencyKey || attempt.idempotencyKey,
        objectiveScore: String(totalObjectiveScore),
        essayScore: String(totalEssayScore),
        totalScore: String(penalizedTotal),
        maxScore: String(maxScoreNum),
        percentageScore: String(percentageScore),
        passed,
        objectiveGradingStatus,
        essayGradingStatus,
        finalGradingStatus,
        isPublishedToStudent: Boolean(canAutoPublish),
        updatedAt: new Date(),
      })
      .where(eq(assessmentAttempts.id, attemptId))
      .returning();

    // Upsert assessment_results summary for this student
    const existingResults = await tx
      .select()
      .from(assessmentResults)
      .where(
        and(
          eq(assessmentResults.assessmentId, assessment.id),
          eq(assessmentResults.studentId, attempt.studentId)
        )
      );

    const allStudentAttempts = await tx
      .select()
      .from(assessmentAttempts)
      .where(
        and(
          eq(assessmentAttempts.assessmentId, assessment.id),
          eq(assessmentAttempts.studentId, attempt.studentId)
        )
      );

    const submittedAttempts = allStudentAttempts.filter(
      (a) => a.status !== 'IN_PROGRESS' && a.status !== 'INVALIDATED'
    );
    const bestAtt =
      submittedAttempts.sort(
        (a, b) => Number(b.totalScore || 0) - Number(a.totalScore || 0)
      )[0] || updatedAttempt;

    const resultGradingStatus =
      finalGradingStatus === 'PUBLISHED' || finalGradingStatus === 'READY'
        ? 'COMPLETE'
        : hasObjectiveQuestions && hasEssayOrManualQuestions
        ? 'PARTIAL'
        : 'PENDING';

    if (existingResults.length > 0) {
      await tx
        .update(assessmentResults)
        .set({
          bestAttemptId: bestAtt.id,
          latestAttemptId: updatedAttempt.id,
          attemptsUsed: submittedAttempts.length,
          objectiveScore: bestAtt.objectiveScore,
          essayScore: bestAtt.essayScore,
          finalScore: bestAtt.totalScore,
          maxScore: bestAtt.maxScore,
          percentageScore: bestAtt.percentageScore,
          passed: bestAtt.passed,
          gradingStatus: resultGradingStatus,
          isPublished: Boolean(canAutoPublish || existingResults[0].isPublished),
          publishedAt: canAutoPublish
            ? new Date()
            : existingResults[0].publishedAt,
          updatedAt: new Date(),
        })
        .where(eq(assessmentResults.id, existingResults[0].id));
    } else {
      await tx.insert(assessmentResults).values({
        assessmentId: assessment.id,
        studentId: attempt.studentId,
        bestAttemptId: bestAtt.id,
        latestAttemptId: updatedAttempt.id,
        attemptsUsed: Math.max(1, submittedAttempts.length),
        objectiveScore: updatedAttempt.objectiveScore,
        essayScore: updatedAttempt.essayScore,
        finalScore: updatedAttempt.totalScore,
        maxScore: updatedAttempt.maxScore,
        percentageScore: updatedAttempt.percentageScore,
        passed: updatedAttempt.passed,
        gradingStatus: resultGradingStatus,
        isPublished: Boolean(canAutoPublish),
        publishedAt: canAutoPublish ? new Date() : null,
      });
    }

    await tx.insert(assessmentEvents).values({
      assessmentId: assessment.id,
      attemptId: attempt.id,
      actorId,
      eventType: isAutoSubmit ? 'ATTEMPT_AUTO_SUBMITTED' : 'ATTEMPT_SUBMITTED',
      metadata: {
        objectiveScore: totalObjectiveScore,
        essayGradingStatus,
        finalGradingStatus,
      },
      ipAddress: ipAddress || null,
    });

    return updatedAttempt;
  });
}

export async function registerAssessmentRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', async (req) => {
    if (req.url.startsWith('/api/v1')) {
      await ensureSeededAssessmentsAndQuestionBanks();
    }
  });

  // ==========================================================================
  // 1. QUESTION BANK & QUESTION MANAGEMENT ENDPOINTS
  // ==========================================================================
  fastify.get('/api/v1/question-banks', async (req, reply) => {
    const user = await authenticateRequest(req, reply, { requireCsrf: false });
    if (!user) return;

    const query = req.query as {
      classroomId?: string;
      subject?: string;
      search?: string;
    };

    const banks = await db
      .select()
      .from(questionBanks)
      .orderBy(desc(questionBanks.createdAt));

    const allQuestions = await db.select().from(questions);

    const filtered = banks
      .filter((b) => {
        if (query.classroomId && b.classroomId && b.classroomId !== query.classroomId) {
          return b.isShared;
        }
        if (
          query.subject &&
          !b.subject.toLowerCase().includes(query.subject.toLowerCase())
        ) {
          return false;
        }
        if (
          query.search &&
          !`${b.title} ${b.subject} ${b.topic} ${b.description}`
            .toLowerCase()
            .includes(query.search.toLowerCase())
        ) {
          return false;
        }
        return true;
      })
      .map((b) => {
        const bQuestions = allQuestions.filter((q) => q.questionBankId === b.id);
        return {
          ...b,
          questionCount: bQuestions.length,
          objectiveCount: bQuestions.filter((q) => q.questionMode === 'OBJECTIVE')
            .length,
          essayCount: bQuestions.filter((q) => q.questionMode === 'ESSAY').length,
        };
      });

    return sendSuccess(reply, { questionBanks: filtered });
  });

  const createQuestionBankSchema = z.object({
    classroomId: z.string().uuid().nullable().optional(),
    courseId: z.string().uuid().nullable().optional(),
    title: z.string().min(3),
    subject: z.string().default(''),
    topic: z.string().default(''),
    description: z.string().default(''),
    isShared: z.boolean().default(true),
  });

  const isInstructorOrAdmin = (u: { roles: string[] }) =>
    u.roles.some((r) =>
      ['SUPERADMIN', 'DOSEN', 'superadmin', 'dosen'].includes(r)
    );

  fastify.post('/api/v1/question-banks', async (req, reply) => {
    const user = await authenticateRequest(req, reply, { requireCsrf: true });
    if (!user) return;

    if (!isInstructorOrAdmin(user)) {
      return sendError(
        reply,
        403,
        'FORBIDDEN_ROLE',
        'Hanya Dosen atau Superadmin yang dapat membuat Bank Soal.'
      );
    }

    const parsed = createQuestionBankSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(
        reply,
        400,
        'VALIDATION_ERROR',
        'Data bank soal tidak valid.',
        parsed.error.issues
      );
    }

    const [created] = await db
      .insert(questionBanks)
      .values({
        classroomId: parsed.data.classroomId || null,
        courseId: parsed.data.courseId || null,
        ownerId: user.id,
        title: parsed.data.title,
        subject: parsed.data.subject,
        topic: parsed.data.topic,
        description: parsed.data.description,
        isShared: parsed.data.isShared,
      })
      .returning();

    return sendSuccess(reply, { questionBank: created }, null, 201);
  });

  fastify.get('/api/v1/question-banks/:id/questions', async (req, reply) => {
    const user = await authenticateRequest(req, reply, { requireCsrf: false });
    if (!user) return;

    if (!isInstructorOrAdmin(user)) {
      return sendError(
        reply,
        403,
        'FORBIDDEN_ANSWER_KEY_ISOLATION',
        'Mahasiswa tidak diizinkan mengakses Bank Soal beserta kunci jawaban.'
      );
    }

    const { id } = req.params as { id: string };
    const query = req.query as {
      questionMode?: string;
      questionType?: string;
      difficulty?: string;
      category?: string;
      topic?: string;
      tag?: string;
      search?: string;
    };

    const [bank] = await db
      .select()
      .from(questionBanks)
      .where(eq(questionBanks.id, id));
    if (!bank) {
      return sendError(reply, 404, 'BANK_NOT_FOUND', 'Bank soal tidak ditemukan.');
    }

    const rawQuestions = await db
      .select()
      .from(questions)
      .where(eq(questions.questionBankId, id))
      .orderBy(desc(questions.createdAt));

    const qIds = rawQuestions.map((q) => q.id);
    const allOpts =
      qIds.length > 0
        ? await db
            .select()
            .from(questionOptions)
            .where(inArray(questionOptions.questionId, qIds))
            .orderBy(asc(questionOptions.sortOrder))
        : [];
    const allTags =
      qIds.length > 0
        ? await db
            .select()
            .from(questionBankTags)
            .where(inArray(questionBankTags.questionId, qIds))
        : [];
    const allMedia =
      qIds.length > 0
        ? await db
            .select()
            .from(questionMedia)
            .where(inArray(questionMedia.questionId, qIds))
        : [];

    const enriched = rawQuestions
      .map((q) => ({
        ...q,
        options: allOpts.filter((o) => o.questionId === q.id),
        tags: allTags.filter((t) => t.questionId === q.id),
        media: allMedia.filter((m) => m.questionId === q.id),
      }))
      .filter((q) => {
        if (query.questionMode && q.questionMode !== query.questionMode)
          return false;
        if (query.questionType && q.questionType !== query.questionType)
          return false;
        if (query.difficulty && q.difficulty !== query.difficulty) return false;
        if (
          query.category &&
          !q.category.toLowerCase().includes(query.category.toLowerCase())
        )
          return false;
        if (
          query.topic &&
          !q.topic.toLowerCase().includes(query.topic.toLowerCase())
        )
          return false;
        if (
          query.tag &&
          !q.tags.some((t) =>
            t.tag.toLowerCase().includes(query.tag!.toLowerCase())
          )
        )
          return false;
        if (
          query.search &&
          !`${q.promptText} ${q.subject} ${q.topic} ${q.category} ${q.learningOutcome}`
            .toLowerCase()
            .includes(query.search.toLowerCase())
        )
          return false;
        return true;
      });

    return sendSuccess(reply, {
      questionBank: bank,
      questions: enriched,
    });
  });

  const createOrUpdateQuestionSchema = z.object({
    questionBankId: z.string().uuid().nullable().optional(),
    classroomId: z.string().uuid().nullable().optional(),
    title: z.string().default(''),
    status: z.enum(['DRAFT', 'READY', 'ARCHIVED']).default('READY'),
    questionMode: z.enum(['OBJECTIVE', 'ESSAY']).default('OBJECTIVE'),
    questionType: z.enum([
      'SINGLE_CHOICE',
      'MULTIPLE_SELECT',
      'TRUE_FALSE',
      'MATCHING',
      'ORDERING',
      'FILL_IN_BLANK',
      'SHORT_ANSWER',
      'NUMERIC',
      'NUMERIC_TOLERANCE',
      'SHORT_ESSAY',
      'LONG_ESSAY',
      'ESSAY_SHORT',
      'ESSAY_LONG',
      'CASE_STUDY',
      'ANALYTICAL_RESPONSE',
      'PROBLEM_SOLVING',
      'PROGRAMMING_EXPLANATION',
      'ALGORITHM_CODE',
      'DOCUMENT_RESPONSE',
      'DOCUMENT_BASED_RESPONSE',
    ]),
    subject: z.string().default(''),
    topic: z.string().default(''),
    category: z.string().default('General'),
    difficulty: z.enum(['EASY', 'MEDIUM', 'HARD']).default('MEDIUM'),
    learningOutcome: z.string().default(''),
    promptText: z.string().min(2),
    promptJson: z.any().optional(),
    promptHtml: z.string().nullable().optional(),
    points: z.union([z.number(), z.string()]).default(10),
    negativePoints: z.union([z.number(), z.string()]).default(0),
    partialCreditEnabled: z.boolean().default(true),
    answerConfig: z.record(z.string(), z.any()).default({}),
    explanation: z.string().default(''),
    explanationJson: z.any().optional(),
    options: z
      .array(
        z.object({
          optionLabel: z.string().default('A'),
          optionText: z.string(),
          optionJson: z.any().optional(),
          imageObjectKey: z.string().nullable().optional(),
          audioObjectKey: z.string().nullable().optional(),
          matchRightText: z.string().nullable().optional(),
          correctOrderIndex: z.number().int().nullable().optional(),
          isCorrect: z.boolean().default(false),
          scoreWeight: z.union([z.number(), z.string()]).default(100),
          feedback: z.string().default(''),
          sortOrder: z.number().int().optional(),
        })
      )
      .optional(),
    media: z
      .array(
        z.object({
          mediaType: z.enum(['IMAGE', 'AUDIO']).default('IMAGE'),
          objectKey: z.string(),
          thumbnailKey: z.string().nullable().optional(),
          originalName: z.string().default('media'),
          optimizedFilename: z.string().nullable().optional(),
          mimeType: z.string().default('application/octet-stream'),
          fileSize: z.number().int().default(0),
          width: z.number().int().nullable().optional(),
          height: z.number().int().nullable().optional(),
          durationSeconds: z.number().int().nullable().optional(),
          caption: z.string().default(''),
        })
      )
      .optional(),
    tags: z.array(z.string()).optional(),
    rubric: z
      .object({
        title: z.string(),
        description: z.string().default(''),
        criteria: z.array(
          z.object({
            criterionName: z.string(),
            description: z.string().default(''),
            weight: z.number().default(25),
            maxScore: z.number().default(25),
            performanceLevels: z.array(z.any()).default([]),
          })
        ),
      })
      .optional(),
  });

  fastify.post('/api/v1/questions', async (req, reply) => {
    const user = await authenticateRequest(req, reply, { requireCsrf: true });
    if (!user) return;

    if (!isInstructorOrAdmin(user)) {
      return sendError(
        reply,
        403,
        'FORBIDDEN_ROLE',
        'Hanya Dosen atau Superadmin yang dapat membuat soal.'
      );
    }

    const parsed = createOrUpdateQuestionSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(
        reply,
        400,
        'VALIDATION_ERROR',
        'Format soal tidak valid.',
        parsed.error.issues
      );
    }

    const d = parsed.data;
    const isEssayType = [
      'SHORT_ESSAY',
      'LONG_ESSAY',
      'ESSAY_SHORT',
      'ESSAY_LONG',
      'CASE_STUDY',
      'ANALYTICAL_RESPONSE',
      'PROBLEM_SOLVING',
      'PROGRAMMING_EXPLANATION',
      'ALGORITHM_CODE',
      'DOCUMENT_RESPONSE',
      'DOCUMENT_BASED_RESPONSE',
    ].includes(d.questionType);
    const resolvedMode = isEssayType ? 'ESSAY' : d.questionMode;
    const generatedCode = `SOAL-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

    const result = await db.transaction(async (tx) => {
      const [createdQ] = await tx
        .insert(questions)
        .values({
          questionBankId: d.questionBankId || null,
          classroomId: d.classroomId || null,
          authorId: user.id,
          title: d.title || '',
          questionCode: generatedCode,
          status: d.status || 'READY',
          sourceType: 'EDITOR',
          tags: d.tags || [],
          questionMode: resolvedMode,
          questionType: d.questionType,
          subject: d.subject,
          topic: d.topic,
          category: d.category,
          difficulty: d.difficulty,
          learningOutcome: d.learningOutcome,
          promptText: d.promptText,
          promptJson: d.promptJson || {
            type: 'doc',
            content: [
              {
                type: 'paragraph',
                content: [{ type: 'text', text: d.promptText }],
              },
            ],
          },
          promptHtml: d.promptHtml || null,
          points: String(d.points),
          negativePoints: String(d.negativePoints),
          partialCreditEnabled: d.partialCreditEnabled,
          answerConfig: d.answerConfig || {},
          explanation: d.explanation,
          explanationJson: d.explanationJson || { type: 'doc', content: [] },
        })
        .returning();

      const insertedOptions = [];
      if (d.options && d.options.length > 0) {
        for (let i = 0; i < d.options.length; i++) {
          const opt = d.options[i];
          const [insOpt] = await tx
            .insert(questionOptions)
            .values({
              questionId: createdQ.id,
              optionLabel: opt.optionLabel || String.fromCharCode(65 + i),
              optionText: opt.optionText,
              optionJson: opt.optionJson || null,
              imageObjectKey: opt.imageObjectKey || null,
              audioObjectKey: opt.audioObjectKey || null,
              matchRightText: opt.matchRightText || null,
              correctOrderIndex: opt.correctOrderIndex ?? null,
              isCorrect: opt.isCorrect,
              scoreWeight: String(opt.scoreWeight ?? 100),
              feedback: opt.feedback || '',
              sortOrder: opt.sortOrder ?? i + 1,
            })
            .returning();
          insertedOptions.push(insOpt);
        }
      }

      if (d.media && d.media.length > 0) {
        for (let i = 0; i < d.media.length; i++) {
          const m = d.media[i];
          await tx.insert(questionMedia).values({
            questionId: createdQ.id,
            mediaType: m.mediaType,
            objectKey: m.objectKey,
            thumbnailKey: m.thumbnailKey || null,
            originalName: m.originalName,
            optimizedFilename: m.optimizedFilename || null,
            mimeType: m.mimeType,
            fileSize: m.fileSize,
            width: m.width ?? null,
            height: m.height ?? null,
            durationSeconds: m.durationSeconds ?? null,
            caption: m.caption || '',
            uploadedById: user.id,
            sortOrder: i + 1,
          });
        }
      }

      if (d.tags && d.tags.length > 0) {
        for (const tagStr of d.tags) {
          if (tagStr.trim()) {
            await tx.insert(questionBankTags).values({
              questionId: createdQ.id,
              tag: tagStr.trim(),
              learningOutcomeCode: d.learningOutcome,
            });
          }
        }
      }

      let createdRubric = null;
      if (d.rubric && d.rubric.criteria?.length > 0) {
        const [rub] = await tx
          .insert(assessmentRubrics)
          .values({
            questionId: createdQ.id,
            title: d.rubric.title,
            description: d.rubric.description || '',
            totalWeight: d.rubric.criteria.reduce(
              (acc, c) => acc + Number(c.weight || 0),
              0
            ),
            maxScore: String(d.points),
            createdById: user.id,
          })
          .returning();

        const critRows = [];
        for (let i = 0; i < d.rubric.criteria.length; i++) {
          const c = d.rubric.criteria[i];
          const [cr] = await tx
            .insert(assessmentRubricCriteria)
            .values({
              rubricId: rub.id,
              criterionName: c.criterionName,
              description: c.description || '',
              weight: c.weight,
              maxScore: String(c.maxScore),
              performanceLevels: c.performanceLevels || [],
              sortOrder: i + 1,
            })
            .returning();
          critRows.push(cr);
        }
        createdRubric = { ...rub, criteria: critRows };
      }

      return {
        ...createdQ,
        options: insertedOptions,
        rubric: createdRubric,
      };
    });

    return sendSuccess(reply, { question: result }, null, 201);
  });

  fastify.patch('/api/v1/questions/:id', async (req, reply) => {
    const user = await authenticateRequest(req, reply, { requireCsrf: true });
    if (!user) return;

    if (!isInstructorOrAdmin(user)) {
      return sendError(reply, 403, 'FORBIDDEN_ROLE', 'Akses ditolak.');
    }

    const { id } = req.params as { id: string };
    const [existing] = await db
      .select()
      .from(questions)
      .where(eq(questions.id, id));
    if (!existing) {
      return sendError(reply, 404, 'QUESTION_NOT_FOUND', 'Soal tidak ditemukan.');
    }

    const parsed = createOrUpdateQuestionSchema.partial().safeParse(req.body);
    if (!parsed.success) {
      return sendError(
        reply,
        400,
        'VALIDATION_ERROR',
        'Data pembaruan soal tidak valid.',
        parsed.error.issues
      );
    }

    const d = parsed.data;
    const prevHistory = Array.isArray(existing.versionHistory)
      ? existing.versionHistory
      : [];

    const updated = await db.transaction(async (tx) => {
      const [upQ] = await tx
        .update(questions)
        .set({
          questionType: d.questionType ?? existing.questionType,
          questionMode: d.questionMode ?? existing.questionMode,
          subject: d.subject ?? existing.subject,
          topic: d.topic ?? existing.topic,
          category: d.category ?? existing.category,
          difficulty: d.difficulty ?? existing.difficulty,
          learningOutcome: d.learningOutcome ?? existing.learningOutcome,
          promptText: d.promptText ?? existing.promptText,
          promptJson: d.promptJson ?? existing.promptJson,
          promptHtml:
            d.promptHtml !== undefined ? d.promptHtml : existing.promptHtml,
          points: d.points !== undefined ? String(d.points) : existing.points,
          negativePoints:
            d.negativePoints !== undefined
              ? String(d.negativePoints)
              : existing.negativePoints,
          partialCreditEnabled:
            d.partialCreditEnabled ?? existing.partialCreditEnabled,
          answerConfig: d.answerConfig ?? existing.answerConfig,
          explanation: d.explanation ?? existing.explanation,
          versionNumber: existing.versionNumber + 1,
          versionHistory: [
            ...prevHistory,
            {
              versionNumber: existing.versionNumber,
              promptText: existing.promptText,
              points: existing.points,
              updatedAt: new Date().toISOString(),
              editedBy: user.id,
            },
          ],
          updatedAt: new Date(),
        })
        .where(eq(questions.id, id))
        .returning();

      let currentOptions = await tx
        .select()
        .from(questionOptions)
        .where(eq(questionOptions.questionId, id))
        .orderBy(asc(questionOptions.sortOrder));

      if (d.options) {
        await tx
          .delete(questionOptions)
          .where(eq(questionOptions.questionId, id));
        currentOptions = [];
        for (let i = 0; i < d.options.length; i++) {
          const opt = d.options[i];
          const [insOpt] = await tx
            .insert(questionOptions)
            .values({
              questionId: id,
              optionLabel: opt.optionLabel || String.fromCharCode(65 + i),
              optionText: opt.optionText,
              optionJson: opt.optionJson || null,
              imageObjectKey: opt.imageObjectKey || null,
              matchRightText: opt.matchRightText || null,
              correctOrderIndex: opt.correctOrderIndex ?? null,
              isCorrect: opt.isCorrect,
              scoreWeight: String(opt.scoreWeight ?? 100),
              feedback: opt.feedback || '',
              sortOrder: opt.sortOrder ?? i + 1,
            })
            .returning();
          currentOptions.push(insOpt);
        }
      }

      if (d.tags) {
        await tx
          .delete(questionBankTags)
          .where(eq(questionBankTags.questionId, id));
        for (const tagStr of d.tags) {
          if (tagStr.trim()) {
            await tx.insert(questionBankTags).values({
              questionId: id,
              tag: tagStr.trim(),
              learningOutcomeCode: upQ.learningOutcome,
            });
          }
        }
      }

      return {
        ...upQ,
        options: currentOptions,
      };
    });

    return sendSuccess(reply, { question: updated });
  });

  fastify.post('/api/v1/questions/:id/duplicate', async (req, reply) => {
    const user = await authenticateRequest(req, reply, { requireCsrf: true });
    if (!user) return;
    if (!isInstructorOrAdmin(user)) {
      return sendError(reply, 403, 'FORBIDDEN', 'Akses ditolak.');
    }

    const { id } = req.params as { id: string };
    const [src] = await db.select().from(questions).where(eq(questions.id, id));
    if (!src) {
      return sendError(reply, 404, 'QUESTION_NOT_FOUND', 'Soal tidak ditemukan.');
    }

    const srcOpts = await db
      .select()
      .from(questionOptions)
      .where(eq(questionOptions.questionId, id))
      .orderBy(asc(questionOptions.sortOrder));

    const duplicated = await db.transaction(async (tx) => {
      const [copyQ] = await tx
        .insert(questions)
        .values({
          questionBankId: src.questionBankId,
          classroomId: src.classroomId,
          authorId: user.id,
          questionMode: src.questionMode,
          questionType: src.questionType,
          subject: src.subject,
          topic: src.topic,
          category: src.category,
          difficulty: src.difficulty,
          learningOutcome: src.learningOutcome,
          promptText: `${src.promptText} (Salinan)`,
          promptJson: src.promptJson,
          promptHtml: src.promptHtml,
          points: src.points,
          negativePoints: src.negativePoints,
          partialCreditEnabled: src.partialCreditEnabled,
          answerConfig: src.answerConfig,
          explanation: src.explanation,
          explanationJson: src.explanationJson,
        })
        .returning();

      const copyOpts = [];
      for (const o of srcOpts) {
        const [co] = await tx
          .insert(questionOptions)
          .values({
            questionId: copyQ.id,
            optionLabel: o.optionLabel,
            optionText: o.optionText,
            optionJson: o.optionJson,
            imageObjectKey: o.imageObjectKey,
            matchRightText: o.matchRightText,
            correctOrderIndex: o.correctOrderIndex,
            isCorrect: o.isCorrect,
            scoreWeight: o.scoreWeight,
            feedback: o.feedback,
            sortOrder: o.sortOrder,
          })
          .returning();
        copyOpts.push(co);
      }

      return { ...copyQ, options: copyOpts };
    });

    return sendSuccess(reply, { question: duplicated }, null, 201);
  });

  // ==========================================================================
  // 2. ASSESSMENT BUILDER & MANAGEMENT ENDPOINTS
  // ==========================================================================
  fastify.get('/api/v1/classrooms/:id/assessments', async (req, reply) => {
    const user = await authenticateRequest(req, reply, { requireCsrf: false });
    if (!user) return;

    const { id } = req.params as { id: string };
    const access = await checkClassroomAccess(user, id);
    if (!access.canView) {
      return sendError(
        reply,
        403,
        'FORBIDDEN_CLASSROOM',
        'Anda tidak memiliki akses ke kelas ini.'
      );
    }

    const clsAssessments = await db
      .select()
      .from(assessments)
      .where(eq(assessments.classroomId, id))
      .orderBy(desc(assessments.createdAt));

    const visibleAssessments = access.canManage
      ? clsAssessments
      : clsAssessments.filter(
          (a) =>
            a.status === 'PUBLISHED' ||
            a.status === 'CLOSED' ||
            (a.status === 'SCHEDULED' &&
              a.scheduledAt &&
              new Date(a.scheduledAt) <= new Date())
        );

    const asmtIds = visibleAssessments.map((a) => a.id);
    const allSections =
      asmtIds.length > 0
        ? await db
            .select()
            .from(assessmentSections)
            .where(inArray(assessmentSections.assessmentId, asmtIds))
            .orderBy(asc(assessmentSections.sortOrder))
        : [];
    const allAsmtQuestions =
      asmtIds.length > 0
        ? await db
            .select()
            .from(assessmentQuestions)
            .where(inArray(assessmentQuestions.assessmentId, asmtIds))
        : [];
    const allPools =
      asmtIds.length > 0
        ? await db
            .select()
            .from(assessmentQuestionPools)
            .where(inArray(assessmentQuestionPools.assessmentId, asmtIds))
        : [];
    const allAttempts =
      asmtIds.length > 0
        ? await db
            .select()
            .from(assessmentAttempts)
            .where(inArray(assessmentAttempts.assessmentId, asmtIds))
            .orderBy(desc(assessmentAttempts.startedAt))
        : [];

    const enriched = visibleAssessments.map((a) => {
      const sections = allSections.filter((s) => s.assessmentId === a.id);
      const qLinks = allAsmtQuestions.filter((q) => q.assessmentId === a.id);
      const pools = allPools.filter((p) => p.assessmentId === a.id);
      const pooledCount = pools.reduce((acc, p) => acc + p.questionCount, 0);

      const myAttempts = allAttempts
        .filter((at) => at.assessmentId === a.id && at.studentId === user.id)
        .map((at) => ({
          id: at.id,
          attemptNumber: at.attemptNumber,
          status: at.status,
          startedAt: at.startedAt,
          submittedAt: at.submittedAt,
          serverDeadlineAt: at.serverDeadlineAt,
          objectiveGradingStatus: at.objectiveGradingStatus,
          essayGradingStatus: at.essayGradingStatus,
          finalGradingStatus: at.finalGradingStatus,
          isPublishedToStudent: at.isPublishedToStudent,
          // Strictly hide unpublished scores from students
          objectiveScore:
            access.canManage || at.isPublishedToStudent || a.resultsPublished
              ? Number(at.objectiveScore)
              : null,
          essayScore:
            access.canManage || at.isPublishedToStudent || a.resultsPublished
              ? Number(at.essayScore)
              : null,
          totalScore:
            access.canManage || at.isPublishedToStudent || a.resultsPublished
              ? Number(at.totalScore)
              : null,
          passed:
            access.canManage || at.isPublishedToStudent || a.resultsPublished
              ? at.passed
              : null,
        }));

      const totalAttemptsCount = allAttempts.filter(
        (at) => at.assessmentId === a.id
      ).length;

      return {
        ...a,
        sections,
        questionCount: qLinks.length + pooledCount,
        directQuestionCount: qLinks.length,
        poolQuestionCount: pooledCount,
        myAttempts,
        totalAttemptsCount: access.canManage ? totalAttemptsCount : undefined,
      };
    });

    return sendSuccess(reply, { assessments: enriched });
  });

  const assessmentPayloadSchema = z.object({
    topicId: z.string().uuid().nullable().optional(),
    title: z.string().min(3),
    description: z.string().default(''),
    category: z
      .enum([
        'QUIZ',
        'MIDTERM',
        'FINAL_EXAM',
        'PRACTICAL_TEST',
        'DIAGNOSTIC',
        'REMEDIAL',
      ])
      .default('QUIZ'),
    assessmentMode: z
      .enum(['OBJECTIVE', 'ESSAY', 'HYBRID'])
      .default('OBJECTIVE'),
    instructions: z.string().default(''),
    instructionsJson: z.any().optional(),
    instructionsHtml: z.string().nullable().optional(),
    maxScore: z.number().min(1).max(1000).default(100),
    passingGrade: z.number().min(0).max(1000).default(70),
    estimatedDurationMinutes: z.number().int().min(1).default(60),
    durationMinutes: z.number().int().min(1).default(60),
    maxAttempts: z.number().int().min(1).max(20).default(1),
    startDate: z.string().nullable().optional(),
    endDate: z.string().nullable().optional(),
    lateAttemptPolicy: z
      .enum(['REJECT', 'ALLOW_MARK_LATE', 'PENALTY_PERCENT'])
      .default('REJECT'),
    latePenaltyPercent: z.number().min(0).max(100).default(0),
    settingsConfig: z
      .object({
        randomizeQuestions: z.boolean().default(false),
        randomizeOptions: z.boolean().default(false),
        oneQuestionAtATime: z.boolean().default(false),
        allowBackwardNavigation: z.boolean().default(true),
        allowAnswerChanges: z.boolean().default(true),
        showRemainingTime: z.boolean().default(true),
        autoSubmit: z.boolean().default(true),
        autosave: z.boolean().default(true),
        resultVisibility: z
          .enum(['IMMEDIATE_OBJECTIVE', 'AFTER_PUBLISH', 'NEVER'])
          .default('AFTER_PUBLISH'),
        explanationVisibility: z
          .enum(['AFTER_SUBMIT', 'AFTER_PUBLISH', 'NEVER'])
          .default('AFTER_PUBLISH'),
        negativeMarkingEnabled: z.boolean().default(false),
        negativeMarkingPercent: z.number().default(0),
        gradePublicationPolicy: z
          .enum(['MANUAL', 'AUTO_ON_COMPLETE'])
          .default('MANUAL'),
      })
      .optional(),
    status: z
      .enum(['DRAFT', 'PUBLISHED', 'SCHEDULED', 'CLOSED', 'ARCHIVED'])
      .default('DRAFT'),
    scheduledAt: z.string().nullable().optional(),
    sections: z
      .array(
        z.object({
          id: z.string().optional(),
          title: z.string(),
          description: z.string().default(''),
          sectionType: z
            .enum(['OBJECTIVE', 'ESSAY', 'MIXED'])
            .default('OBJECTIVE'),
          totalPoints: z.number().default(50),
          sortOrder: z.number().int().optional(),
          randomizeQuestions: z.boolean().default(false),
        })
      )
      .optional(),
    questions: z
      .array(
        z.object({
          questionId: z.string().uuid().optional(),
          sectionIndex: z.number().int().optional(),
          sectionId: z.string().uuid().nullable().optional(),
          pointsOverride: z.number().optional(),
          negativePointsOverride: z.number().optional(),
          sortOrder: z.number().int().optional(),
          inlineQuestion: createOrUpdateQuestionSchema.optional(),
        })
      )
      .optional(),
    questionPools: z
      .array(
        z.object({
          sectionIndex: z.number().int().optional(),
          sectionId: z.string().uuid().nullable().optional(),
          questionBankId: z.string().uuid().nullable().optional(),
          title: z.string().default('Pool Soal Acak'),
          categoryFilter: z.string().default(''),
          topicFilter: z.string().default(''),
          difficultyFilter: z
            .enum(['ANY', 'EASY', 'MEDIUM', 'HARD', 'DISTRIBUTION'])
            .default('ANY'),
          difficultyDistribution: z
            .object({
              easy: z.number().default(0),
              medium: z.number().default(0),
              hard: z.number().default(0),
            })
            .optional(),
          questionCount: z.number().int().min(1).default(5),
          pointsPerQuestion: z.number().min(0.5).default(10),
          sortOrder: z.number().int().optional(),
        })
      )
      .optional(),
    accommodations: z
      .array(
        z.object({
          studentId: z.string().uuid(),
          extraDurationMinutes: z.number().int().default(0),
          extraAttempts: z.number().int().default(0),
          extendedEndDate: z.string().nullable().optional(),
          reason: z.string().default(''),
        })
      )
      .optional(),
  });

  fastify.post('/api/v1/classrooms/:id/assessments', async (req, reply) => {
    const user = await authenticateRequest(req, reply, { requireCsrf: true });
    if (!user) return;

    const { id: classroomId } = req.params as { id: string };
    const access = await checkClassroomAccess(user, classroomId);
    if (!access.canManage) {
      return sendError(
        reply,
        403,
        'FORBIDDEN_MANAGE_ASSESSMENT',
        'Hanya Dosen Pengampu atau Superadmin yang dapat membuat asesmen/ujian.'
      );
    }

    const parsed = assessmentPayloadSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(
        reply,
        400,
        'VALIDATION_ERROR',
        'Konfigurasi asesmen tidak valid.',
        parsed.error.issues
      );
    }

    const d = parsed.data;
    const defaultSettings = {
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
      ...(d.settingsConfig || {}),
    };

    const created = await db.transaction(async (tx) => {
      const [asmt] = await tx
        .insert(assessments)
        .values({
          classroomId,
          topicId: d.topicId || null,
          authorId: user.id,
          title: d.title,
          description: d.description,
          category: d.category,
          assessmentMode: d.assessmentMode,
          instructions: d.instructions,
          instructionsJson: d.instructionsJson || {
            type: 'doc',
            content: [
              {
                type: 'paragraph',
                content: [{ type: 'text', text: d.instructions || d.description }],
              },
            ],
          },
          instructionsHtml: d.instructionsHtml || null,
          maxScore: d.maxScore,
          passingGrade: d.passingGrade,
          estimatedDurationMinutes: d.estimatedDurationMinutes,
          durationMinutes: d.durationMinutes,
          maxAttempts: d.maxAttempts,
          startDate: d.startDate ? new Date(d.startDate) : null,
          endDate: d.endDate ? new Date(d.endDate) : null,
          lateAttemptPolicy: d.lateAttemptPolicy,
          latePenaltyPercent: d.latePenaltyPercent,
          settingsConfig: defaultSettings,
          status: d.status,
          publishedAt: d.status === 'PUBLISHED' ? new Date() : null,
          scheduledAt: d.scheduledAt ? new Date(d.scheduledAt) : null,
        })
        .returning();

      // Create sections
      const createdSections = [];
      if (d.sections && d.sections.length > 0) {
        for (let i = 0; i < d.sections.length; i++) {
          const sec = d.sections[i];
          const [cs] = await tx
            .insert(assessmentSections)
            .values({
              assessmentId: asmt.id,
              title: sec.title,
              description: sec.description || '',
              sectionType: sec.sectionType,
              totalPoints: sec.totalPoints,
              sortOrder: sec.sortOrder ?? i + 1,
              randomizeQuestions: sec.randomizeQuestions,
            })
            .returning();
          createdSections.push(cs);
        }
      } else {
        // Default section(s) based on mode
        if (d.assessmentMode === 'HYBRID') {
          const [sA, sB] = await tx
            .insert(assessmentSections)
            .values([
              {
                assessmentId: asmt.id,
                title: 'Section A: Objective Questions',
                sectionType: 'OBJECTIVE',
                totalPoints: 60,
                sortOrder: 1,
              },
              {
                assessmentId: asmt.id,
                title: 'Section B: Essay Questions',
                sectionType: 'ESSAY',
                totalPoints: 40,
                sortOrder: 2,
              },
            ])
            .returning();
          createdSections.push(sA, sB);
        } else {
          const [sMain] = await tx
            .insert(assessmentSections)
            .values({
              assessmentId: asmt.id,
              title:
                d.assessmentMode === 'ESSAY'
                  ? 'Section A: Essay Examination'
                  : 'Section A: Objective Examination',
              sectionType: d.assessmentMode,
              totalPoints: d.maxScore,
              sortOrder: 1,
            })
            .returning();
          createdSections.push(sMain);
        }
      }

      // Attach or create questions
      if (d.questions && d.questions.length > 0) {
        for (let i = 0; i < d.questions.length; i++) {
          const qItem = d.questions[i];
          let targetQuestionId = qItem.questionId;
          let targetRubricId: string | null = null;

          if (!targetQuestionId && qItem.inlineQuestion) {
            const iq = qItem.inlineQuestion;
            const isEssay = [
              'SHORT_ESSAY',
              'LONG_ESSAY',
              'CASE_STUDY',
              'ANALYTICAL_RESPONSE',
              'PROBLEM_SOLVING',
              'PROGRAMMING_EXPLANATION',
              'DOCUMENT_RESPONSE',
            ].includes(iq.questionType);

            const [newQ] = await tx
              .insert(questions)
              .values({
                questionBankId: iq.questionBankId || null,
                classroomId,
                authorId: user.id,
                questionMode: isEssay ? 'ESSAY' : iq.questionMode || 'OBJECTIVE',
                questionType: iq.questionType,
                subject: iq.subject || '',
                topic: iq.topic || '',
                category: iq.category || 'General',
                difficulty: iq.difficulty || 'MEDIUM',
                learningOutcome: iq.learningOutcome || '',
                promptText: iq.promptText,
                promptJson: iq.promptJson || {
                  type: 'doc',
                  content: [
                    {
                      type: 'paragraph',
                      content: [{ type: 'text', text: iq.promptText }],
                    },
                  ],
                },
                promptHtml: iq.promptHtml || null,
                points: String(iq.points ?? 10),
                negativePoints: String(iq.negativePoints ?? 0),
                partialCreditEnabled: iq.partialCreditEnabled ?? true,
                answerConfig: iq.answerConfig || {},
                explanation: iq.explanation || '',
              })
              .returning();
            targetQuestionId = newQ.id;

            if (iq.options && iq.options.length > 0) {
              for (let j = 0; j < iq.options.length; j++) {
                const opt = iq.options[j];
                await tx.insert(questionOptions).values({
                  questionId: newQ.id,
                  optionLabel: opt.optionLabel || String.fromCharCode(65 + j),
                  optionText: opt.optionText,
                  optionJson: opt.optionJson || null,
                  imageObjectKey: opt.imageObjectKey || null,
                  matchRightText: opt.matchRightText || null,
                  correctOrderIndex: opt.correctOrderIndex ?? null,
                  isCorrect: opt.isCorrect,
                  scoreWeight: String(opt.scoreWeight ?? 100),
                  feedback: opt.feedback || '',
                  sortOrder: opt.sortOrder ?? j + 1,
                });
              }
            }

            if (iq.rubric && iq.rubric.criteria?.length > 0) {
              const [rub] = await tx
                .insert(assessmentRubrics)
                .values({
                  assessmentId: asmt.id,
                  questionId: newQ.id,
                  title: iq.rubric.title,
                  description: iq.rubric.description || '',
                  totalWeight: iq.rubric.criteria.reduce(
                    (acc, c) => acc + Number(c.weight || 0),
                    0
                  ),
                  maxScore: String(iq.points ?? 10),
                  createdById: user.id,
                })
                .returning();
              targetRubricId = rub.id;

              for (let k = 0; k < iq.rubric.criteria.length; k++) {
                const crit = iq.rubric.criteria[k];
                await tx.insert(assessmentRubricCriteria).values({
                  rubricId: rub.id,
                  criterionName: crit.criterionName,
                  description: crit.description || '',
                  weight: crit.weight,
                  maxScore: String(crit.maxScore),
                  performanceLevels: crit.performanceLevels || [],
                  sortOrder: k + 1,
                });
              }
            }
          }

          if (targetQuestionId) {
            const secId =
              qItem.sectionId ||
              (qItem.sectionIndex !== undefined &&
              createdSections[qItem.sectionIndex]
                ? createdSections[qItem.sectionIndex].id
                : createdSections[0]?.id || null);

            await tx.insert(assessmentQuestions).values({
              assessmentId: asmt.id,
              sectionId: secId,
              questionId: targetQuestionId,
              pointsOverride:
                qItem.pointsOverride !== undefined
                  ? String(qItem.pointsOverride)
                  : null,
              negativePointsOverride:
                qItem.negativePointsOverride !== undefined
                  ? String(qItem.negativePointsOverride)
                  : null,
              rubricId: targetRubricId,
              sortOrder: qItem.sortOrder ?? i + 1,
            });
          }
        }
      }

      // Question pools
      if (d.questionPools && d.questionPools.length > 0) {
        for (let i = 0; i < d.questionPools.length; i++) {
          const pool = d.questionPools[i];
          const secId =
            pool.sectionId ||
            (pool.sectionIndex !== undefined && createdSections[pool.sectionIndex]
              ? createdSections[pool.sectionIndex].id
              : createdSections[0]?.id || null);

          await tx.insert(assessmentQuestionPools).values({
            assessmentId: asmt.id,
            sectionId: secId,
            questionBankId: pool.questionBankId || null,
            title: pool.title,
            categoryFilter: pool.categoryFilter || '',
            topicFilter: pool.topicFilter || '',
            difficultyFilter: pool.difficultyFilter || 'ANY',
            difficultyDistribution: pool.difficultyDistribution || {
              easy: 0,
              medium: 0,
              hard: 0,
            },
            questionCount: pool.questionCount,
            pointsPerQuestion: String(pool.pointsPerQuestion),
            sortOrder: pool.sortOrder ?? i + 1,
          });
        }
      }

      // Accommodations
      if (d.accommodations && d.accommodations.length > 0) {
        for (const acc of d.accommodations) {
          await tx.insert(assessmentAccommodations).values({
            assessmentId: asmt.id,
            studentId: acc.studentId,
            extraDurationMinutes: acc.extraDurationMinutes,
            extraAttempts: acc.extraAttempts,
            extendedEndDate: acc.extendedEndDate
              ? new Date(acc.extendedEndDate)
              : null,
            reason: acc.reason,
            grantedById: user.id,
          });
        }
      }

      // Register in classroom gradebook
      const cats = await tx
        .select()
        .from(gradeCategories)
        .where(eq(gradeCategories.classroomId, classroomId));
      await tx.insert(gradeItems).values({
        classroomId,
        categoryId: cats[0]?.id || null,
        sourceType: 'ASSESSMENT',
        sourceId: asmt.id,
        title: asmt.title,
        maxScore: asmt.maxScore,
      });

      return asmt;
    });

    await recordAuditLog({
      actorId: user.id,
      action: 'ASSESSMENT_CREATED',
      entityType: 'assessment',
      entityId: created.id,
      metadata: {
        classroomId,
        title: created.title,
        assessmentMode: created.assessmentMode,
      },
      ipAddress: req.ip,
    });

    return sendSuccess(reply, { assessment: created }, null, 201);
  });

  fastify.get('/api/v1/assessments/:id', async (req, reply) => {
    const user = await authenticateRequest(req, reply, { requireCsrf: false });
    if (!user) return;

    const { id } = req.params as { id: string };
    const query = req.query as { previewAsStudent?: string };

    const [asmt] = await db
      .select()
      .from(assessments)
      .where(eq(assessments.id, id));
    if (!asmt) {
      return sendError(
        reply,
        404,
        'ASSESSMENT_NOT_FOUND',
        'Asesmen tidak ditemukan.'
      );
    }

    const access = await checkClassroomAccess(user, asmt.classroomId);
    if (!access.canView) {
      return sendError(reply, 403, 'FORBIDDEN', 'Akses ditolak.');
    }

    const isStudentView =
      !access.canManage || query.previewAsStudent === 'true';

    if (
      !access.canManage &&
      (asmt.status === 'DRAFT' || asmt.status === 'ARCHIVED')
    ) {
      return sendError(
        reply,
        403,
        'ASSESSMENT_NOT_AVAILABLE',
        'Asesmen belum diterbitkan.'
      );
    }

    const sections = await db
      .select()
      .from(assessmentSections)
      .where(eq(assessmentSections.assessmentId, id))
      .orderBy(asc(assessmentSections.sortOrder));

    const qLinks = await db
      .select()
      .from(assessmentQuestions)
      .where(eq(assessmentQuestions.assessmentId, id))
      .orderBy(asc(assessmentQuestions.sortOrder));

    const pools = await db
      .select()
      .from(assessmentQuestionPools)
      .where(eq(assessmentQuestionPools.assessmentId, id))
      .orderBy(asc(assessmentQuestionPools.sortOrder));

    const accommodations = access.canManage
      ? await db
          .select()
          .from(assessmentAccommodations)
          .where(eq(assessmentAccommodations.assessmentId, id))
      : await db
          .select()
          .from(assessmentAccommodations)
          .where(
            and(
              eq(assessmentAccommodations.assessmentId, id),
              eq(assessmentAccommodations.studentId, user.id)
            )
          );

    const qIds = qLinks.map((ql) => ql.questionId);
    const rawQuestions =
      qIds.length > 0
        ? await db.select().from(questions).where(inArray(questions.id, qIds))
        : [];
    const rawOptions =
      qIds.length > 0
        ? await db
            .select()
            .from(questionOptions)
            .where(inArray(questionOptions.questionId, qIds))
            .orderBy(asc(questionOptions.sortOrder))
        : [];
    const allRubricsInDb = await db.select().from(assessmentRubrics);
    const rawRubrics = allRubricsInDb.filter(
      (r) => r.assessmentId === id || (r.questionId && qIds.includes(r.questionId))
    );
    const rubIds = rawRubrics.map((r) => r.id);
    const rawCriteria =
      rubIds.length > 0
        ? await db
            .select()
            .from(assessmentRubricCriteria)
            .where(inArray(assessmentRubricCriteria.rubricId, rubIds))
            .orderBy(asc(assessmentRubricCriteria.sortOrder))
        : [];

    // Format questions: if student view, NEVER include answer keys!
    const formattedQuestions = qLinks
      .map((link) => {
        const q = rawQuestions.find((rq) => rq.id === link.questionId);
        if (!q) return null;
        const opts = rawOptions.filter((o) => o.questionId === q.id);
        const rub = rawRubrics.find(
          (r) => r.id === link.rubricId || r.questionId === q.id
        );
        const rubWithCriteria = rub
          ? {
              ...rub,
              criteria: rawCriteria.filter((c) => c.rubricId === rub.id),
            }
          : null;

        if (isStudentView) {
          const safeSnap = buildQuestionSnapshots({
            question: q,
            options: opts,
            rubric: rubWithCriteria,
            randomizeOptions: false,
            seedStr: `${id}-${q.id}`,
          });
          return {
            id: q.id,
            assessmentQuestionId: link.id,
            sectionId: link.sectionId,
            sortOrder: link.sortOrder,
            questionMode: q.questionMode,
            questionType: q.questionType,
            promptText: q.promptText,
            promptJson: q.promptJson,
            promptHtml: q.promptHtml,
            points: Number(link.pointsOverride ?? q.points),
            studentOptions: safeSnap.studentOptionsSnapshot,
          };
        }

        return {
          ...q,
          assessmentQuestionId: link.id,
          sectionId: link.sectionId,
          sortOrder: link.sortOrder,
          points: Number(link.pointsOverride ?? q.points),
          negativePoints: Number(
            link.negativePointsOverride ?? q.negativePoints
          ),
          options: opts,
          rubric: rubWithCriteria,
        };
      })
      .filter(Boolean);

    const myAttempts = await db
      .select()
      .from(assessmentAttempts)
      .where(
        and(
          eq(assessmentAttempts.assessmentId, id),
          eq(assessmentAttempts.studentId, user.id)
        )
      )
      .orderBy(desc(assessmentAttempts.attemptNumber));

    const safeMyAttempts = myAttempts.map((at) => ({
      id: at.id,
      attemptNumber: at.attemptNumber,
      status: at.status,
      startedAt: at.startedAt,
      serverDeadlineAt: at.serverDeadlineAt,
      submittedAt: at.submittedAt,
      objectiveGradingStatus: at.objectiveGradingStatus,
      essayGradingStatus: at.essayGradingStatus,
      finalGradingStatus: at.finalGradingStatus,
      isPublishedToStudent: at.isPublishedToStudent,
      objectiveScore:
        access.canManage || at.isPublishedToStudent || asmt.resultsPublished
          ? Number(at.objectiveScore)
          : null,
      essayScore:
        access.canManage || at.isPublishedToStudent || asmt.resultsPublished
          ? Number(at.essayScore)
          : null,
      totalScore:
        access.canManage || at.isPublishedToStudent || asmt.resultsPublished
          ? Number(at.totalScore)
          : null,
      passed:
        access.canManage || at.isPublishedToStudent || asmt.resultsPublished
          ? at.passed
          : null,
      generalFeedback:
        access.canManage || at.isPublishedToStudent || asmt.resultsPublished
          ? at.generalFeedback
          : null,
    }));

    return sendSuccess(reply, {
      assessment: {
        ...asmt,
        sections,
        questions: isStudentView
          ? access.canManage
            ? formattedQuestions // allow student preview for instructor
            : undefined // students only receive questions inside an active attempt!
          : formattedQuestions,
        questionPools: access.canManage ? pools : undefined,
        questionCount: qLinks.length + pools.reduce((a, p) => a + p.questionCount, 0),
        accommodations,
        myAttempts: safeMyAttempts,
        canManage: access.canManage,
      },
    });
  });

  fastify.patch('/api/v1/assessments/:id', async (req, reply) => {
    const user = await authenticateRequest(req, reply, { requireCsrf: true });
    if (!user) return;

    const { id } = req.params as { id: string };
    const [existing] = await db
      .select()
      .from(assessments)
      .where(eq(assessments.id, id));
    if (!existing) {
      return sendError(
        reply,
        404,
        'ASSESSMENT_NOT_FOUND',
        'Asesmen tidak ditemukan.'
      );
    }

    const access = await checkClassroomAccess(user, existing.classroomId);
    if (!access.canManage) {
      return sendError(reply, 403, 'FORBIDDEN', 'Akses ditolak.');
    }

    const roleInfo = await resolveClassroomRole(user, existing.classroomId);
    if (roleInfo.role === 'CO_INSTRUCTOR' && !roleInfo.canManageAll && existing.authorId !== user.id) {
      return sendError(
        reply,
        403,
        'FORBIDDEN_CO_INSTRUCTOR_RESOURCE_OWNERSHIP',
        'Co-Instructor tidak dapat mengubah asesmen milik pengajar lain tanpa izin.'
      );
    }

    const parsed = assessmentPayloadSchema.partial().safeParse(req.body);
    if (!parsed.success) {
      return sendError(
        reply,
        400,
        'VALIDATION_ERROR',
        'Data pembaruan asesmen tidak valid.',
        parsed.error.issues
      );
    }

    const d = parsed.data;
    const updated = await db.transaction(async (tx) => {
      const [upAsmt] = await tx
        .update(assessments)
        .set({
          topicId: d.topicId !== undefined ? d.topicId : existing.topicId,
          title: d.title ?? existing.title,
          description: d.description ?? existing.description,
          category: d.category ?? existing.category,
          assessmentMode: d.assessmentMode ?? existing.assessmentMode,
          instructions: d.instructions ?? existing.instructions,
          instructionsJson: d.instructionsJson ?? existing.instructionsJson,
          instructionsHtml:
            d.instructionsHtml !== undefined
              ? d.instructionsHtml
              : existing.instructionsHtml,
          maxScore: d.maxScore ?? existing.maxScore,
          passingGrade: d.passingGrade ?? existing.passingGrade,
          estimatedDurationMinutes:
            d.estimatedDurationMinutes ?? existing.estimatedDurationMinutes,
          durationMinutes: d.durationMinutes ?? existing.durationMinutes,
          maxAttempts: d.maxAttempts ?? existing.maxAttempts,
          startDate:
            d.startDate !== undefined
              ? d.startDate
                ? new Date(d.startDate)
                : null
              : existing.startDate,
          endDate:
            d.endDate !== undefined
              ? d.endDate
                ? new Date(d.endDate)
                : null
              : existing.endDate,
          lateAttemptPolicy: d.lateAttemptPolicy ?? existing.lateAttemptPolicy,
          latePenaltyPercent:
            d.latePenaltyPercent ?? existing.latePenaltyPercent,
          settingsConfig: d.settingsConfig
            ? { ...(existing.settingsConfig as object), ...d.settingsConfig }
            : existing.settingsConfig,
          status: d.status ?? existing.status,
          updatedAt: new Date(),
        })
        .where(eq(assessments.id, id))
        .returning();

      if (d.sections) {
        await tx
          .delete(assessmentSections)
          .where(eq(assessmentSections.assessmentId, id));
        for (let i = 0; i < d.sections.length; i++) {
          const sec = d.sections[i];
          await tx.insert(assessmentSections).values({
            assessmentId: id,
            title: sec.title,
            description: sec.description || '',
            sectionType: sec.sectionType,
            totalPoints: sec.totalPoints,
            sortOrder: sec.sortOrder ?? i + 1,
            randomizeQuestions: sec.randomizeQuestions,
          });
        }
      }

      if (d.questionPools) {
        await tx
          .delete(assessmentQuestionPools)
          .where(eq(assessmentQuestionPools.assessmentId, id));
        for (let i = 0; i < d.questionPools.length; i++) {
          const pool = d.questionPools[i];
          await tx.insert(assessmentQuestionPools).values({
            assessmentId: id,
            sectionId: pool.sectionId || null,
            questionBankId: pool.questionBankId || null,
            title: pool.title,
            categoryFilter: pool.categoryFilter || '',
            topicFilter: pool.topicFilter || '',
            difficultyFilter: pool.difficultyFilter || 'ANY',
            difficultyDistribution: pool.difficultyDistribution || {
              easy: 0,
              medium: 0,
              hard: 0,
            },
            questionCount: pool.questionCount,
            pointsPerQuestion: String(pool.pointsPerQuestion),
            sortOrder: pool.sortOrder ?? i + 1,
          });
        }
      }

      return upAsmt;
    });

    let auditAction: 'UPDATED' | 'PUBLISHED' | 'UNPUBLISHED' | 'ARCHIVED' | 'RESTORED' = 'UPDATED';
    if (updated.status !== existing.status) {
      if (existing.status === 'ARCHIVED' && updated.status !== 'ARCHIVED') auditAction = 'RESTORED';
      else if (updated.status === 'PUBLISHED') auditAction = 'PUBLISHED';
      else if (updated.status === 'ARCHIVED') auditAction = 'ARCHIVED';
      else auditAction = 'UNPUBLISHED';
    }
    await recordClassroomAudit({
      classroomId: existing.classroomId,
      actorId: user.id,
      actorRole: roleInfo.role,
      resourceType: 'ASSESSMENT',
      resourceId: id,
      resourceTitle: updated.title,
      action: auditAction,
      beforeValue: { title: existing.title, status: existing.status },
      afterValue: { title: updated.title, status: updated.status },
      changeSummary: `Memperbarui asesmen: "${updated.title}"`,
    });

    return sendSuccess(reply, { assessment: updated });
  });

  fastify.post('/api/v1/assessments/:id/publish', async (req, reply) => {
    const user = await authenticateRequest(req, reply, { requireCsrf: true });
    if (!user) return;

    const { id } = req.params as { id: string };
    const body = (req.body || {}) as {
      status?: 'DRAFT' | 'PUBLISHED' | 'SCHEDULED' | 'CLOSED' | 'ARCHIVED';
      scheduledAt?: string;
    };

    const [existing] = await db
      .select()
      .from(assessments)
      .where(eq(assessments.id, id));
    if (!existing) {
      return sendError(
        reply,
        404,
        'ASSESSMENT_NOT_FOUND',
        'Asesmen tidak ditemukan.'
      );
    }

    const access = await checkClassroomAccess(user, existing.classroomId);
    if (!access.canManage) {
      return sendError(reply, 403, 'FORBIDDEN', 'Akses ditolak.');
    }

    const roleInfo = await resolveClassroomRole(user, existing.classroomId);
    if (roleInfo.role === 'CO_INSTRUCTOR' && !roleInfo.canManageAll && existing.authorId !== user.id) {
      return sendError(
        reply,
        403,
        'FORBIDDEN_CO_INSTRUCTOR_RESOURCE_OWNERSHIP',
        'Co-Instructor tidak dapat mengubah asesmen milik pengajar lain tanpa izin.'
      );
    }

    const nextStatus = body.status || 'PUBLISHED';
    const [updated] = await db
      .update(assessments)
      .set({
        status: nextStatus,
        publishedAt:
          nextStatus === 'PUBLISHED' ? new Date() : existing.publishedAt,
        scheduledAt: body.scheduledAt
          ? new Date(body.scheduledAt)
          : existing.scheduledAt,
        updatedAt: new Date(),
      })
      .where(eq(assessments.id, id))
      .returning();

    return sendSuccess(reply, { assessment: updated });
  });

  // ==========================================================================
  // 3. SERVER-AUTHORITATIVE ATTEMPT ENGINE
  // ==========================================================================
  fastify.post('/api/v1/assessments/:id/attempts', async (req, reply) => {
    const user = await authenticateRequest(req, reply, { requireCsrf: true });
    if (!user) return;

    const { id: assessmentId } = req.params as { id: string };
    const [assessment] = await db
      .select()
      .from(assessments)
      .where(eq(assessments.id, assessmentId));

    if (!assessment) {
      return sendError(
        reply,
        404,
        'ASSESSMENT_NOT_FOUND',
        'Asesmen tidak ditemukan.'
      );
    }

    const access = await checkClassroomAccess(user, assessment.classroomId);
    if (!access.canView) {
      return sendError(
        reply,
        403,
        'FORBIDDEN_CLASSROOM',
        'Anda tidak terdaftar sebagai peserta aktif di ruang kelas ini.'
      );
    }

    if (
      !access.canManage &&
      assessment.status !== 'PUBLISHED' &&
      !(
        assessment.status === 'SCHEDULED' &&
        assessment.scheduledAt &&
        new Date(assessment.scheduledAt) <= new Date()
      )
    ) {
      return sendError(
        reply,
        403,
        'ASSESSMENT_NOT_OPEN',
        'Asesmen belum dibuka atau telah ditutup.'
      );
    }

    const now = new Date();
    const [accomm] = await db
      .select()
      .from(assessmentAccommodations)
      .where(
        and(
          eq(assessmentAccommodations.assessmentId, assessmentId),
          eq(assessmentAccommodations.studentId, user.id)
        )
      );

    if (assessment.startDate && now < new Date(assessment.startDate) && !access.canManage) {
      return sendError(
        reply,
        403,
        'ASSESSMENT_NOT_STARTED_YET',
        'Waktu pelaksanaan ujian belum dimulai.'
      );
    }

    const effectiveEndDate = accomm?.extendedEndDate
      ? new Date(accomm.extendedEndDate)
      : assessment.endDate
      ? new Date(assessment.endDate)
      : null;

    const isPastEndDate = effectiveEndDate ? now > effectiveEndDate : false;
    if (
      isPastEndDate &&
      assessment.lateAttemptPolicy === 'REJECT' &&
      !access.canManage
    ) {
      return sendError(
        reply,
        403,
        'ASSESSMENT_DEADLINE_PASSED',
        'Batas waktu pengerjaan ujian telah berakhir.'
      );
    }

    // Check existing attempts for this student
    const existingAttempts = await db
      .select()
      .from(assessmentAttempts)
      .where(
        and(
          eq(assessmentAttempts.assessmentId, assessmentId),
          eq(assessmentAttempts.studentId, user.id)
        )
      )
      .orderBy(asc(assessmentAttempts.attemptNumber));

    // If an IN_PROGRESS attempt exists:
    const activeAttempt = existingAttempts.find(
      (a) => a.status === 'IN_PROGRESS'
    );
    if (activeAttempt) {
      if (new Date(activeAttempt.serverDeadlineAt) <= now) {
        // Server deadline passed -> auto-submit it first
        await finalizeAttemptSubmission({
          attemptId: activeAttempt.id,
          actorId: user.id,
          isAutoSubmit: true,
          ipAddress: req.ip,
        });
      } else {
        // Return the existing active attempt so refresh/resume never creates a duplicate or regenerates questions!
        return sendSuccess(reply, {
          attempt: activeAttempt,
          resumed: true,
          serverNow: now.toISOString(),
          remainingSeconds: Math.max(
            0,
            Math.floor(
              (new Date(activeAttempt.serverDeadlineAt).getTime() -
                now.getTime()) /
                1000
            )
          ),
        });
      }
    }

    const refreshedAttempts = await db
      .select()
      .from(assessmentAttempts)
      .where(
        and(
          eq(assessmentAttempts.assessmentId, assessmentId),
          eq(assessmentAttempts.studentId, user.id)
        )
      );

    const validAttemptsCount = refreshedAttempts.filter(
      (a) => a.status !== 'INVALIDATED'
    ).length;
    const allowedAttempts =
      Number(assessment.maxAttempts || 1) + Number(accomm?.extraAttempts || 0);

    if (validAttemptsCount >= allowedAttempts && !access.canManage) {
      return sendError(
        reply,
        403,
        'MAX_ATTEMPTS_REACHED',
        `Anda telah menggunakan seluruh batas percobaan ujian (${allowedAttempts}x).`
      );
    }

    const nextAttemptNumber = refreshedAttempts.length + 1;
    const totalDurationMinutes =
      Number(assessment.durationMinutes || 60) +
      Number(accomm?.extraDurationMinutes || 0);
    const serverDeadlineAt = new Date(
      now.getTime() + totalDurationMinutes * 60 * 1000
    );
    const settings = (assessment.settingsConfig || {}) as Record<string, any>;

    // Create the attempt + immutable question snapshots inside a database transaction
    const createdAttempt = await db.transaction(async (tx) => {
      const [att] = await tx
        .insert(assessmentAttempts)
        .values({
          assessmentId,
          studentId: user.id,
          attemptNumber: nextAttemptNumber,
          status: 'IN_PROGRESS',
          startedAt: now,
          serverDeadlineAt,
          lastActivityAt: now,
          isLate: isPastEndDate,
          maxScore: String(assessment.maxScore),
          objectiveGradingStatus:
            assessment.assessmentMode === 'ESSAY'
              ? 'NOT_APPLICABLE'
              : 'PENDING',
          essayGradingStatus:
            assessment.assessmentMode === 'OBJECTIVE'
              ? 'NOT_APPLICABLE'
              : 'PENDING',
          finalGradingStatus: 'IN_PROGRESS',
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'] || '',
        })
        .returning();

      // Gather direct questions
      const directLinks = await tx
        .select()
        .from(assessmentQuestions)
        .where(eq(assessmentQuestions.assessmentId, assessmentId))
        .orderBy(asc(assessmentQuestions.sortOrder));

      // Gather random question pools
      const pools = await tx
        .select()
        .from(assessmentQuestionPools)
        .where(eq(assessmentQuestionPools.assessmentId, assessmentId))
        .orderBy(asc(assessmentQuestionPools.sortOrder));

      const selectedItems: Array<{
        question: any;
        sectionId: string | null;
        sourcePoolId: string | null;
        points: number;
        negativePoints: number;
        rubricId: string | null;
      }> = [];

      const usedQuestionIds = new Set<string>();

      if (directLinks.length > 0) {
        const directQIds = directLinks.map((dl) => dl.questionId);
        const directQs = await tx
          .select()
          .from(questions)
          .where(inArray(questions.id, directQIds));

        for (const link of directLinks) {
          const q = directQs.find((dq) => dq.id === link.questionId);
          if (q && !usedQuestionIds.has(q.id)) {
            usedQuestionIds.add(q.id);
            selectedItems.push({
              question: q,
              sectionId: link.sectionId,
              sourcePoolId: null,
              points: Number(link.pointsOverride ?? q.points ?? 10),
              negativePoints: Number(
                link.negativePointsOverride ?? q.negativePoints ?? 0
              ),
              rubricId: link.rubricId || null,
            });
          }
        }
      }

      // Resolve random question pools
      for (const pool of pools) {
        const allCandidateQs = await tx.select().from(questions);
        const candidates = allCandidateQs.filter((q) => {
          if (usedQuestionIds.has(q.id)) return false;
          if (pool.questionBankId && q.questionBankId !== pool.questionBankId)
            return false;
          if (
            pool.categoryFilter &&
            !q.category
              .toLowerCase()
              .includes(pool.categoryFilter.toLowerCase())
          )
            return false;
          if (
            pool.topicFilter &&
            !q.topic.toLowerCase().includes(pool.topicFilter.toLowerCase())
          )
            return false;
          if (
            pool.difficultyFilter &&
            pool.difficultyFilter !== 'ANY' &&
            pool.difficultyFilter !== 'DISTRIBUTION' &&
            q.difficulty !== pool.difficultyFilter
          )
            return false;
          return true;
        });

        let pickedFromPool: any[] = [];
        const dist = (pool.difficultyDistribution || {}) as {
          easy?: number;
          medium?: number;
          hard?: number;
        };

        if (
          pool.difficultyFilter === 'DISTRIBUTION' &&
          ((dist.easy || 0) + (dist.medium || 0) + (dist.hard || 0) > 0)
        ) {
          const easyPool = deterministicShuffle(
            candidates.filter((c) => c.difficulty === 'EASY'),
            `${att.id}-${pool.id}-easy`
          ).slice(0, dist.easy || 0);
          const medPool = deterministicShuffle(
            candidates.filter((c) => c.difficulty === 'MEDIUM'),
            `${att.id}-${pool.id}-med`
          ).slice(0, dist.medium || 0);
          const hardPool = deterministicShuffle(
            candidates.filter((c) => c.difficulty === 'HARD'),
            `${att.id}-${pool.id}-hard`
          ).slice(0, dist.hard || 0);
          pickedFromPool = [...easyPool, ...medPool, ...hardPool];
        } else {
          pickedFromPool = deterministicShuffle(
            candidates,
            `${att.id}-${pool.id}`
          ).slice(0, pool.questionCount);
        }

        for (const pq of pickedFromPool) {
          usedQuestionIds.add(pq.id);
          selectedItems.push({
            question: pq,
            sectionId: pool.sectionId,
            sourcePoolId: pool.id,
            points: Number(pool.pointsPerQuestion ?? pq.points ?? 10),
            negativePoints: Number(pq.negativePoints ?? 0),
            rubricId: null,
          });
        }
      }

      const orderedItems = settings.randomizeQuestions
        ? deterministicShuffle(selectedItems, `${att.id}-q-order`)
        : selectedItems;

      const allSelectedQIds = orderedItems.map((i) => i.question.id);
      const allOpts =
        allSelectedQIds.length > 0
          ? await tx
              .select()
              .from(questionOptions)
              .where(inArray(questionOptions.questionId, allSelectedQIds))
              .orderBy(asc(questionOptions.sortOrder))
          : [];

      const allRubricsInDb = await tx.select().from(assessmentRubrics);
      const allRubrics = allRubricsInDb.filter(
        (r) =>
          r.assessmentId === assessmentId ||
          (r.questionId && allSelectedQIds.includes(r.questionId))
      );
      const rubIds = allRubrics.map((r) => r.id);
      const allCriteria =
        rubIds.length > 0
          ? await tx
              .select()
              .from(assessmentRubricCriteria)
              .where(inArray(assessmentRubricCriteria.rubricId, rubIds))
              .orderBy(asc(assessmentRubricCriteria.sortOrder))
          : [];

      for (let idx = 0; idx < orderedItems.length; idx++) {
        const item = orderedItems[idx];
        const qOpts = allOpts.filter((o) => o.questionId === item.question.id);
        const rub = allRubrics.find(
          (r) => r.id === item.rubricId || r.questionId === item.question.id
        );
        const rubWithCrit = rub
          ? {
              ...rub,
              criteria: allCriteria.filter((c) => c.rubricId === rub.id),
            }
          : null;

        const { studentOptionsSnapshot, serverAnswerKeySnapshot } =
          buildQuestionSnapshots({
            question: item.question,
            options: qOpts,
            rubric: rubWithCrit,
            randomizeOptions: Boolean(settings.randomizeOptions),
            seedStr: `${att.id}-${item.question.id}`,
          });

        const [aq] = await tx
          .insert(attemptQuestions)
          .values({
            attemptId: att.id,
            assessmentId,
            sectionId: item.sectionId,
            sourceQuestionId: item.question.id,
            sourcePoolId: item.sourcePoolId,
            questionOrder: idx + 1,
            questionMode: item.question.questionMode,
            questionType: item.question.questionType,
            promptText: item.question.promptText,
            promptJson: item.question.promptJson,
            promptHtml: item.question.promptHtml,
            points: String(item.points),
            negativePoints: String(item.negativePoints),
            partialCreditEnabled: item.question.partialCreditEnabled,
            studentOptionsSnapshot,
            serverAnswerKeySnapshot,
            explanationSnapshot: item.question.explanation || '',
            rubricSnapshot: rubWithCrit,
          })
          .returning();

        await tx.insert(attemptAnswers).values({
          attemptId: att.id,
          attemptQuestionId: aq.id,
          sourceQuestionId: item.question.id,
          studentId: user.id,
          answerPayload: {},
          isAnswered: false,
          isFlagged: false,
          gradingStatus: 'UNGRADED',
        });
      }

      await tx.insert(assessmentEvents).values({
        assessmentId,
        attemptId: att.id,
        actorId: user.id,
        eventType: 'ATTEMPT_STARTED',
        metadata: {
          attemptNumber: nextAttemptNumber,
          questionCount: orderedItems.length,
          serverDeadlineAt: serverDeadlineAt.toISOString(),
        },
        ipAddress: req.ip,
      });

      return att;
    });

    return sendSuccess(
      reply,
      {
        attempt: createdAttempt,
        resumed: false,
        serverNow: now.toISOString(),
        remainingSeconds: Math.max(
          0,
          Math.floor((serverDeadlineAt.getTime() - now.getTime()) / 1000)
        ),
      },
      null,
      201
    );
  });

  fastify.get('/api/v1/attempts/:id', async (req, reply) => {
    const user = await authenticateRequest(req, reply, { requireCsrf: false });
    if (!user) return;

    const { id } = req.params as { id: string };
    let [attempt] = await db
      .select()
      .from(assessmentAttempts)
      .where(eq(assessmentAttempts.id, id));
    if (!attempt) {
      return sendError(
        reply,
        404,
        'ATTEMPT_NOT_FOUND',
        'Percobaan ujian tidak ditemukan.'
      );
    }

    const [assessment] = await db
      .select()
      .from(assessments)
      .where(eq(assessments.id, attempt.assessmentId));
    if (!assessment) {
      return sendError(
        reply,
        404,
        'ASSESSMENT_NOT_FOUND',
        'Asesmen tidak ditemukan.'
      );
    }

    const access = await checkClassroomAccess(user, assessment.classroomId);
    if (attempt.studentId !== user.id && !access.canManage) {
      return sendError(
        reply,
        403,
        'FORBIDDEN_ATTEMPT_OWNERSHIP',
        'Akses ditolak: Anda tidak berhak mengakses percobaan ujian milik peserta lain.'
      );
    }

    const now = new Date();
    const settings = (assessment.settingsConfig || {}) as Record<string, any>;

    // Enforce server-side timeout & auto-submission
    if (
      attempt.status === 'IN_PROGRESS' &&
      now > new Date(attempt.serverDeadlineAt) &&
      settings.autoSubmit !== false
    ) {
      attempt = await finalizeAttemptSubmission({
        attemptId: attempt.id,
        actorId: attempt.studentId,
        isAutoSubmit: true,
        ipAddress: req.ip,
      });
    }

    const answers = await db
      .select()
      .from(attemptAnswers)
      .where(eq(attemptAnswers.attemptId, id));

    const canSeeResults =
      access.canManage ||
      attempt.isPublishedToStudent ||
      assessment.resultsPublished;

    return sendSuccess(reply, {
      attempt: {
        id: attempt.id,
        assessmentId: attempt.assessmentId,
        studentId: attempt.studentId,
        attemptNumber: attempt.attemptNumber,
        status: attempt.status,
        startedAt: attempt.startedAt,
        serverDeadlineAt: attempt.serverDeadlineAt,
        submittedAt: attempt.submittedAt,
        lastActivityAt: attempt.lastActivityAt,
        isLate: attempt.isLate,
        versionNumber: attempt.versionNumber,
        objectiveGradingStatus: attempt.objectiveGradingStatus,
        essayGradingStatus: attempt.essayGradingStatus,
        finalGradingStatus: attempt.finalGradingStatus,
        isPublishedToStudent: attempt.isPublishedToStudent,
        objectiveScore: canSeeResults ? Number(attempt.objectiveScore) : null,
        essayScore: canSeeResults ? Number(attempt.essayScore) : null,
        totalScore: canSeeResults ? Number(attempt.totalScore) : null,
        maxScore: Number(attempt.maxScore),
        percentageScore: canSeeResults ? Number(attempt.percentageScore) : null,
        passed: canSeeResults ? attempt.passed : null,
        generalFeedback: canSeeResults ? attempt.generalFeedback : null,
      },
      assessment: {
        id: assessment.id,
        classroomId: assessment.classroomId,
        title: assessment.title,
        description: assessment.description,
        category: assessment.category,
        assessmentMode: assessment.assessmentMode,
        instructions: assessment.instructions,
        instructionsJson: assessment.instructionsJson,
        maxScore: assessment.maxScore,
        passingGrade: assessment.passingGrade,
        durationMinutes: assessment.durationMinutes,
        settingsConfig: assessment.settingsConfig,
      },
      progress: {
        totalQuestions: answers.length,
        answeredQuestions: answers.filter((a) => a.isAnswered).length,
        flaggedQuestions: answers.filter((a) => a.isFlagged).length,
      },
      serverNow: now.toISOString(),
      remainingSeconds:
        attempt.status === 'IN_PROGRESS'
          ? Math.max(
              0,
              Math.floor(
                (new Date(attempt.serverDeadlineAt).getTime() - now.getTime()) /
                  1000
              )
            )
          : 0,
    });
  });

  fastify.get('/api/v1/attempts/:id/questions', async (req, reply) => {
    const user = await authenticateRequest(req, reply, { requireCsrf: false });
    if (!user) return;

    const { id } = req.params as { id: string };
    const [attempt] = await db
      .select()
      .from(assessmentAttempts)
      .where(eq(assessmentAttempts.id, id));
    if (!attempt) {
      return sendError(
        reply,
        404,
        'ATTEMPT_NOT_FOUND',
        'Percobaan ujian tidak ditemukan.'
      );
    }

    const [assessment] = await db
      .select()
      .from(assessments)
      .where(eq(assessments.id, attempt.assessmentId));
    if (!assessment) {
      return sendError(
        reply,
        404,
        'ASSESSMENT_NOT_FOUND',
        'Asesmen tidak ditemukan.'
      );
    }

    const access = await checkClassroomAccess(user, assessment.classroomId);
    if (attempt.studentId !== user.id && !access.canManage) {
      return sendError(
        reply,
        403,
        'FORBIDDEN_ATTEMPT_OWNERSHIP',
        'Akses ditolak: Anda tidak berhak mengakses soal percobaan ujian milik peserta lain.'
      );
    }

    const sections = await db
      .select()
      .from(assessmentSections)
      .where(eq(assessmentSections.assessmentId, assessment.id))
      .orderBy(asc(assessmentSections.sortOrder));

    const snapQuestions = await db
      .select()
      .from(attemptQuestions)
      .where(eq(attemptQuestions.attemptId, id))
      .orderBy(asc(attemptQuestions.questionOrder));

    const answers = await db
      .select()
      .from(attemptAnswers)
      .where(eq(attemptAnswers.attemptId, id));

    const attachments = await db
      .select()
      .from(essayAttachments)
      .where(eq(essayAttachments.attemptId, id));

    const settings = (assessment.settingsConfig || {}) as Record<string, any>;
    const isSubmitted = attempt.status !== 'IN_PROGRESS';
    const canSeeExplanation =
      access.canManage ||
      (isSubmitted &&
        (settings.explanationVisibility === 'AFTER_SUBMIT' ||
          (settings.explanationVisibility === 'AFTER_PUBLISH' &&
            (attempt.isPublishedToStudent || assessment.resultsPublished))));
    const canSeeScores =
      access.canManage ||
      attempt.isPublishedToStudent ||
      assessment.resultsPublished;

    // CRITICAL SECURITY RULE: Never include `serverAnswerKeySnapshot` in student DTOs!
    const safeQuestions = snapQuestions.map((sq) => {
      const ans = answers.find((a) => a.attemptQuestionId === sq.id);
      const qAtts = attachments.filter((att) => att.attemptQuestionId === sq.id);

      return {
        id: sq.id,
        attemptQuestionId: sq.id,
        sourceQuestionId: sq.sourceQuestionId,
        sectionId: sq.sectionId,
        questionOrder: sq.questionOrder,
        questionMode: sq.questionMode,
        questionType: sq.questionType,
        promptText: sq.promptText,
        promptJson: sq.promptJson,
        promptHtml: sq.promptHtml,
        points: Number(sq.points),
        negativePoints: Number(sq.negativePoints),
        partialCreditEnabled: sq.partialCreditEnabled,
        studentOptionsSnapshot: sq.studentOptionsSnapshot,
        rubricSnapshot: sq.rubricSnapshot,
        explanation: canSeeExplanation ? sq.explanationSnapshot : undefined,
        answer: ans
          ? {
              id: ans.id,
              answerPayload: ans.answerPayload,
              isAnswered: ans.isAnswered,
              isFlagged: ans.isFlagged,
              autosaveVersion: ans.autosaveVersion,
              savedAt: ans.savedAt,
              isCorrect: canSeeScores ? ans.isCorrect : undefined,
              finalQuestionScore:
                canSeeScores && ans.finalQuestionScore !== null
                  ? Number(ans.finalQuestionScore)
                  : undefined,
              gradingStatus: canSeeScores ? ans.gradingStatus : undefined,
            }
          : null,
        attachments: qAtts,
      };
    });

    return sendSuccess(reply, {
      sections,
      questions: safeQuestions,
    });
  });

  const saveAnswerSchema = z.object({
    answerPayload: z.record(z.string(), z.any()).optional(),
    isAnswered: z.boolean().optional(),
    isFlagged: z.boolean().optional(),
  });

  fastify.put(
    '/api/v1/attempts/:id/answers/:questionId',
    async (req, reply) => {
      const user = await authenticateRequest(req, reply, { requireCsrf: true });
      if (!user) return;

      const { id: attemptId, questionId } = req.params as {
        id: string;
        questionId: string;
      };

      const [attempt] = await db
        .select()
        .from(assessmentAttempts)
        .where(eq(assessmentAttempts.id, attemptId));
      if (!attempt) {
        return sendError(
          reply,
          404,
          'ATTEMPT_NOT_FOUND',
          'Percobaan ujian tidak ditemukan.'
        );
      }

      if (attempt.studentId !== user.id) {
        return sendError(
          reply,
          403,
          'FORBIDDEN_ATTEMPT_OWNERSHIP',
          'Akses ditolak: Anda hanya dapat menyimpan jawaban pada percobaan ujian Anda sendiri.'
        );
      }

      if (attempt.status !== 'IN_PROGRESS') {
        return sendError(
          reply,
          403,
          'ATTEMPT_ALREADY_CLOSED',
          'Percobaan ujian telah dikumpulkan dan tidak dapat diubah lagi.'
        );
      }

      const now = new Date();
      if (now > new Date(attempt.serverDeadlineAt)) {
        await finalizeAttemptSubmission({
          attemptId,
          actorId: user.id,
          isAutoSubmit: true,
          ipAddress: req.ip,
        });
        return sendError(
          reply,
          403,
          'ATTEMPT_DEADLINE_EXPIRED',
          'Batas waktu pengerjaan ujian telah habis. Jawaban Anda telah dikumpulkan secara otomatis oleh server.'
        );
      }

      const [assessment] = await db
        .select()
        .from(assessments)
        .where(eq(assessments.id, attempt.assessmentId));
      const settings = (assessment?.settingsConfig || {}) as Record<string, any>;

      // Match either attemptQuestion.id or sourceQuestionId
      const snapQs = await db
        .select()
        .from(attemptQuestions)
        .where(eq(attemptQuestions.attemptId, attemptId));
      const targetAq = snapQs.find(
        (sq) => sq.id === questionId || sq.sourceQuestionId === questionId
      );
      if (!targetAq) {
        return sendError(
          reply,
          404,
          'ATTEMPT_QUESTION_NOT_FOUND',
          'Soal tidak ditemukan dalam snapshot percobaan ujian ini.'
        );
      }

      const parsed = saveAnswerSchema.safeParse(req.body);
      if (!parsed.success) {
        return sendError(
          reply,
          400,
          'VALIDATION_ERROR',
          'Payload jawaban tidak valid.'
        );
      }

      const [existingAns] = await db
        .select()
        .from(attemptAnswers)
        .where(
          and(
            eq(attemptAnswers.attemptId, attemptId),
            eq(attemptAnswers.attemptQuestionId, targetAq.id)
          )
        );

      if (
        existingAns?.isAnswered &&
        settings.allowAnswerChanges === false &&
        parsed.data.answerPayload !== undefined
      ) {
        return sendError(
          reply,
          403,
          'ANSWER_CHANGE_LOCKED',
          'Kebijakan ujian ini tidak mengizinkan perubahan jawaban yang telah disimpan.'
        );
      }

      const nextPayload =
        parsed.data.answerPayload !== undefined
          ? parsed.data.answerPayload
          : (existingAns?.answerPayload as Record<string, any>) || {};

      // Determine if answered based on payload contents if not explicitly passed
      const hasContent =
        parsed.data.isAnswered !== undefined
          ? parsed.data.isAnswered
          : Object.values(nextPayload).some((v) =>
              Array.isArray(v)
                ? v.length > 0
                : v !== null && v !== undefined && String(v).trim() !== ''
            );

      const nextFlagged =
        parsed.data.isFlagged !== undefined
          ? parsed.data.isFlagged
          : existingAns?.isFlagged ?? false;

      const updatedAns = await db.transaction(async (tx) => {
        let saved;
        if (existingAns) {
          const [up] = await tx
            .update(attemptAnswers)
            .set({
              answerPayload: nextPayload,
              isAnswered: Boolean(hasContent),
              isFlagged: nextFlagged,
              autosaveVersion: existingAns.autosaveVersion + 1,
              savedAt: now,
              updatedAt: now,
            })
            .where(eq(attemptAnswers.id, existingAns.id))
            .returning();
          saved = up;
        } else {
          const [ins] = await tx
            .insert(attemptAnswers)
            .values({
              attemptId,
              attemptQuestionId: targetAq.id,
              sourceQuestionId: targetAq.sourceQuestionId,
              studentId: user.id,
              answerPayload: nextPayload,
              isAnswered: Boolean(hasContent),
              isFlagged: nextFlagged,
              autosaveVersion: 1,
              savedAt: now,
              updatedAt: now,
            })
            .returning();
          saved = ins;
        }

        await tx
          .update(assessmentAttempts)
          .set({
            lastActivityAt: now,
            versionNumber: attempt.versionNumber + 1,
            updatedAt: now,
          })
          .where(eq(assessmentAttempts.id, attemptId));

        return saved;
      });

      return sendSuccess(reply, {
        answer: {
          id: updatedAns.id,
          attemptQuestionId: updatedAns.attemptQuestionId,
          answerPayload: updatedAns.answerPayload,
          isAnswered: updatedAns.isAnswered,
          isFlagged: updatedAns.isFlagged,
          autosaveVersion: updatedAns.autosaveVersion,
          savedAt: updatedAns.savedAt,
        },
        serverNow: now.toISOString(),
        remainingSeconds: Math.max(
          0,
          Math.floor(
            (new Date(attempt.serverDeadlineAt).getTime() - now.getTime()) /
              1000
          )
        ),
      });
    }
  );

  // Essay Attachment Presign & Confirm inside an Attempt
  fastify.post(
    '/api/v1/attempts/:id/answers/:questionId/attachments/presign',
    async (req, reply) => {
      const user = await authenticateRequest(req, reply, { requireCsrf: true });
      if (!user) return;

      const { id: attemptId } = req.params as {
        id: string;
        questionId: string;
      };
      const [attempt] = await db
        .select()
        .from(assessmentAttempts)
        .where(eq(assessmentAttempts.id, attemptId));
      if (!attempt || attempt.studentId !== user.id) {
        return sendError(reply, 403, 'FORBIDDEN', 'Akses ditolak.');
      }
      if (
        attempt.status !== 'IN_PROGRESS' ||
        new Date() > new Date(attempt.serverDeadlineAt)
      ) {
        return sendError(
          reply,
          403,
          'ATTEMPT_CLOSED',
          'Waktu ujian telah habis.'
        );
      }

      const body = req.body as {
        fileName?: string;
        mimeType?: string;
        sizeBytes?: number;
      };
      const check = validateAttachmentRequest(
        body.fileName || '',
        body.mimeType || '',
        Number(body.sizeBytes || 0)
      );
      if (!check.valid) {
        return sendError(
          reply,
          400,
          'INVALID_ATTACHMENT',
          check.error || 'Berkas tidak valid.'
        );
      }

      const rand = crypto.randomBytes(8).toString('hex');
      const safeBase = (body.fileName || 'essay')
        .replace(/[^a-zA-Z0-9._-]/g, '_')
        .slice(0, 60);
      const objectKey = `exam-attachments/${attempt.assessmentId}/${user.id}/${Date.now()}-${rand}-${safeBase}`;
      const presigned = signPresignedPutUrl({
        objectKey,
        mimeType: body.mimeType || 'application/octet-stream',
        maxBytes: 25 * 1024 * 1024,
      });

      return sendSuccess(reply, {
        ...presigned,
        fileExtension: check.extension,
      });
    }
  );

  fastify.post(
    '/api/v1/attempts/:id/answers/:questionId/attachments/confirm',
    async (req, reply) => {
      const user = await authenticateRequest(req, reply, { requireCsrf: true });
      if (!user) return;

      const { id: attemptId, questionId } = req.params as {
        id: string;
        questionId: string;
      };
      const [attempt] = await db
        .select()
        .from(assessmentAttempts)
        .where(eq(assessmentAttempts.id, attemptId));
      if (!attempt || attempt.studentId !== user.id) {
        return sendError(reply, 403, 'FORBIDDEN', 'Akses ditolak.');
      }

      const snapQs = await db
        .select()
        .from(attemptQuestions)
        .where(eq(attemptQuestions.attemptId, attemptId));
      const targetAq = snapQs.find(
        (sq) => sq.id === questionId || sq.sourceQuestionId === questionId
      );
      if (!targetAq) {
        return sendError(reply, 404, 'NOT_FOUND', 'Soal tidak ditemukan.');
      }

      const body = req.body as {
        objectKey: string;
        originalName: string;
        mimeType: string;
        fileExtension: string;
      };

      const verified = verifyUploadedObject(
        body.objectKey,
        body.fileExtension || 'pdf'
      );
      if (!verified.exists) {
        return sendError(
          reply,
          400,
          'OBJECT_NOT_UPLOADED',
          'Berkas belum ditemukan di penyimpanan objek S3.'
        );
      }

      const [ans] = await db
        .select()
        .from(attemptAnswers)
        .where(
          and(
            eq(attemptAnswers.attemptId, attemptId),
            eq(attemptAnswers.attemptQuestionId, targetAq.id)
          )
        );

      const [attRow] = await db
        .insert(essayAttachments)
        .values({
          attemptId,
          attemptQuestionId: targetAq.id,
          answerId: ans?.id || null,
          originalName: body.originalName,
          objectKey: body.objectKey,
          mimeType: body.mimeType,
          fileExtension: body.fileExtension,
          fileSize: verified.sizeBytes,
          checksum: verified.checksum,
          uploadedById: user.id,
        })
        .returning();

      return sendSuccess(reply, { attachment: attRow }, null, 201);
    }
  );

  // Submit Attempt (Idempotent + Transactional)
  fastify.post('/api/v1/attempts/:id/submit', async (req, reply) => {
    const user = await authenticateRequest(req, reply, { requireCsrf: true });
    if (!user) return;

    const { id: attemptId } = req.params as { id: string };
    const body = (req.body || {}) as { idempotencyKey?: string };

    const [attempt] = await db
      .select()
      .from(assessmentAttempts)
      .where(eq(assessmentAttempts.id, attemptId));
    if (!attempt) {
      return sendError(
        reply,
        404,
        'ATTEMPT_NOT_FOUND',
        'Percobaan ujian tidak ditemukan.'
      );
    }

    if (attempt.studentId !== user.id) {
      return sendError(
        reply,
        403,
        'FORBIDDEN_ATTEMPT_OWNERSHIP',
        'Akses ditolak: Anda hanya dapat mengumpulkan percobaan ujian Anda sendiri.'
      );
    }

    const isTimeout = new Date() > new Date(attempt.serverDeadlineAt);
    const finalized = await finalizeAttemptSubmission({
      attemptId,
      actorId: user.id,
      isAutoSubmit: isTimeout,
      idempotencyKey: body.idempotencyKey,
      ipAddress: req.ip,
    });

    const [assessment] = await db
      .select()
      .from(assessments)
      .where(eq(assessments.id, attempt.assessmentId));

    const canSeeScore =
      finalized.isPublishedToStudent || assessment?.resultsPublished;

    return sendSuccess(reply, {
      attempt: {
        id: finalized.id,
        status: finalized.status,
        submittedAt: finalized.submittedAt,
        objectiveGradingStatus: finalized.objectiveGradingStatus,
        essayGradingStatus: finalized.essayGradingStatus,
        finalGradingStatus: finalized.finalGradingStatus,
        isPublishedToStudent: finalized.isPublishedToStudent,
        objectiveScore: canSeeScore ? Number(finalized.objectiveScore) : null,
        essayScore: canSeeScore ? Number(finalized.essayScore) : null,
        totalScore: canSeeScore ? Number(finalized.totalScore) : null,
        maxScore: Number(finalized.maxScore),
        percentageScore: canSeeScore
          ? Number(finalized.percentageScore)
          : null,
        passed: canSeeScore ? finalized.passed : null,
      },
    });
  });

  // Record audit telemetry event during attempt (connection, focus/visibility, flag)
  fastify.post('/api/v1/attempts/:id/events', async (req, reply) => {
    const user = await authenticateRequest(req, reply, { requireCsrf: true });
    if (!user) return;

    const { id: attemptId } = req.params as { id: string };
    const [attempt] = await db
      .select()
      .from(assessmentAttempts)
      .where(eq(assessmentAttempts.id, attemptId));
    if (!attempt || attempt.studentId !== user.id) {
      return sendError(reply, 403, 'FORBIDDEN', 'Akses ditolak.');
    }

    const body = (req.body || {}) as {
      eventType?: string;
      metadata?: Record<string, any>;
    };

    const [ev] = await db
      .insert(assessmentEvents)
      .values({
        assessmentId: attempt.assessmentId,
        attemptId: attempt.id,
        actorId: user.id,
        eventType: body.eventType || 'CLIENT_ACTIVITY',
        metadata: body.metadata || {},
        ipAddress: req.ip,
      })
      .returning();

    return sendSuccess(reply, { event: ev }, null, 201);
  });

  // ==========================================================================
  // 4. INSTRUCTOR MONITORING, ESSAY/HYBRID GRADING, RESULTS & ANALYTICS
  // ==========================================================================
  fastify.get('/api/v1/assessments/:id/monitoring', async (req, reply) => {
    const user = await authenticateRequest(req, reply, { requireCsrf: false });
    if (!user) return;

    const { id: assessmentId } = req.params as { id: string };
    const [assessment] = await db
      .select()
      .from(assessments)
      .where(eq(assessments.id, assessmentId));
    if (!assessment) {
      return sendError(
        reply,
        404,
        'ASSESSMENT_NOT_FOUND',
        'Asesmen tidak ditemukan.'
      );
    }

    const access = await checkClassroomAccess(user, assessment.classroomId);
    if (!access.canManage) {
      return sendError(
        reply,
        403,
        'FORBIDDEN_MONITORING',
        'Hanya Dosen Pengampu atau Superadmin yang dapat memantau ujian.'
      );
    }

    const query = req.query as {
      search?: string;
      status?: string;
      sortBy?: string;
      format?: string;
    };

    const enrollments = await db
      .select({
        enrollmentId: classroomEnrollments.id,
        studentId: users.id,
        fullName: users.fullName,
        email: users.email,
        studentNumber: users.identityNumber,
        enrollmentStatus: classroomEnrollments.status,
      })
      .from(classroomEnrollments)
      .innerJoin(users, eq(classroomEnrollments.studentId, users.id))
      .where(
        and(
          eq(classroomEnrollments.classroomId, assessment.classroomId),
          eq(classroomEnrollments.status, 'active')
        )
      )
      .orderBy(asc(users.fullName));

    const allAttempts = await db
      .select()
      .from(assessmentAttempts)
      .where(eq(assessmentAttempts.assessmentId, assessmentId))
      .orderBy(desc(assessmentAttempts.attemptNumber));

    const attIds = allAttempts.map((a) => a.id);
    const allAnswers =
      attIds.length > 0
        ? await db
            .select()
            .from(attemptAnswers)
            .where(inArray(attemptAnswers.attemptId, attIds))
        : [];
    const allEvents = await db
      .select()
      .from(assessmentEvents)
      .where(eq(assessmentEvents.assessmentId, assessmentId))
      .orderBy(desc(assessmentEvents.createdAt));

    const now = new Date();

    const participants = enrollments.map((st) => {
      const stAttempts = allAttempts.filter(
        (a) => a.studentId === st.studentId
      );
      const latestAttempt = stAttempts[0] || null;

      if (!latestAttempt) {
        return {
          studentId: st.studentId,
          studentName: st.fullName,
          studentNim: st.studentNumber || '—',
          studentEmail: st.email,
          attemptId: null,
          attemptNumber: 0,
          attemptsCount: 0,
          attemptStatus: 'NOT_STARTED',
          startedAt: null,
          submittedAt: null,
          lastActivityAt: null,
          answeredQuestions: 0,
          unansweredQuestions: 0,
          totalQuestions: 0,
          progressPercentage: 0,
          objectiveScore: null,
          essayScore: null,
          essayGradingStatus: 'NOT_APPLICABLE',
          finalGradingStatus: 'NOT_STARTED',
          finalScore: null,
          isPublishedToStudent: false,
          recentEvents: [],
        };
      }

      const attAns = allAnswers.filter(
        (ans) => ans.attemptId === latestAttempt.id
      );
      const totalQ = attAns.length;
      const answeredQ = attAns.filter((ans) => ans.isAnswered).length;
      const unansweredQ = Math.max(0, totalQ - answeredQ);
      const progressPct =
        totalQ > 0 ? Math.round((answeredQ / totalQ) * 100) : 0;

      let derivedStatus = latestAttempt.status;
      if (
        derivedStatus === 'IN_PROGRESS' &&
        now > new Date(latestAttempt.serverDeadlineAt)
      ) {
        derivedStatus = 'TIMED_OUT';
      }

      const stEvents = allEvents
        .filter((ev) => ev.attemptId === latestAttempt.id)
        .slice(0, 8);

      return {
        studentId: st.studentId,
        studentName: st.fullName,
        studentNim: st.studentNumber || '—',
        studentEmail: st.email,
        attemptId: latestAttempt.id,
        attemptNumber: latestAttempt.attemptNumber,
        attemptsCount: stAttempts.length,
        attemptStatus: derivedStatus,
        startedAt: latestAttempt.startedAt,
        submittedAt: latestAttempt.submittedAt,
        lastActivityAt: latestAttempt.lastActivityAt,
        answeredQuestions: answeredQ,
        unansweredQuestions: unansweredQ,
        totalQuestions: totalQ,
        progressPercentage: progressPct,
        objectiveScore: Number(latestAttempt.objectiveScore || 0),
        essayScore: Number(latestAttempt.essayScore || 0),
        essayGradingStatus: latestAttempt.essayGradingStatus,
        finalGradingStatus: latestAttempt.finalGradingStatus,
        finalScore: Number(latestAttempt.totalScore || 0),
        isPublishedToStudent: latestAttempt.isPublishedToStudent,
        recentEvents: stEvents,
      };
    });

    const summary = {
      totalParticipants: participants.length,
      notStarted: participants.filter((p) => p.attemptStatus === 'NOT_STARTED')
        .length,
      inProgress: participants.filter((p) => p.attemptStatus === 'IN_PROGRESS')
        .length,
      submitted: participants.filter(
        (p) =>
          p.attemptStatus === 'SUBMITTED' || p.attemptStatus === 'GRADED'
      ).length,
      autoSubmitted: participants.filter(
        (p) => p.attemptStatus === 'AUTO_SUBMITTED'
      ).length,
      timedOut: participants.filter((p) => p.attemptStatus === 'TIMED_OUT')
        .length,
      abandoned: participants.filter((p) => p.attemptStatus === 'ABANDONED')
        .length,
      invalidated: participants.filter((p) => p.attemptStatus === 'INVALIDATED')
        .length,
      pendingEssayGrading: participants.filter(
        (p) =>
          p.attemptId &&
          (p.essayGradingStatus === 'PENDING' ||
            p.essayGradingStatus === 'IN_PROGRESS' ||
            p.essayGradingStatus === 'DRAFT_SAVED')
      ).length,
    };

    let filtered = participants.filter((p) => {
      if (
        query.status &&
        query.status !== 'ALL' &&
        p.attemptStatus !== query.status
      ) {
        return false;
      }
      if (
        query.search &&
        !`${p.studentName} ${p.studentNim} ${p.studentEmail}`
          .toLowerCase()
          .includes(query.search.toLowerCase())
      ) {
        return false;
      }
      return true;
    });

    if (query.sortBy === 'score_desc') {
      filtered.sort((a, b) => (b.finalScore ?? -1) - (a.finalScore ?? -1));
    } else if (query.sortBy === 'progress_desc') {
      filtered.sort((a, b) => b.progressPercentage - a.progressPercentage);
    }

    if (query.format === 'csv' || query.format === 'xlsx') {
      const exportRows = filtered.map((p, idx) => ({
        No: idx + 1,
        Nama_Mahasiswa: p.studentName,
        NIM: p.studentNim,
        Email: p.studentEmail,
        Percobaan_Ke: p.attemptNumber,
        Status_Ujian: p.attemptStatus,
        Soal_Terjawab: `${p.answeredQuestions}/${p.totalQuestions}`,
        Progres_Persen: `${p.progressPercentage}%`,
        Skor_Objektif: p.objectiveScore ?? '',
        Status_Esai: p.essayGradingStatus,
        Skor_Esai: p.essayScore ?? '',
        Skor_Akhir: p.finalScore ?? '',
        Status_Publikasi: p.isPublishedToStudent ? 'Dipublikasikan' : 'Belum',
      }));

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(exportRows);
      XLSX.utils.book_append_sheet(wb, ws, 'Monitoring_Ujian');

      if (query.format === 'csv') {
        const csvData = XLSX.utils.sheet_to_csv(ws);
        reply.header('Content-Type', 'text/csv; charset=utf-8');
        reply.header(
          'Content-Disposition',
          `attachment; filename="monitoring-${assessment.id.slice(0, 8)}.csv"`
        );
        return reply.send(csvData);
      } else {
        const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
        reply.header(
          'Content-Type',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        );
        reply.header(
          'Content-Disposition',
          `attachment; filename="monitoring-${assessment.id.slice(0, 8)}.xlsx"`
        );
        return reply.send(buf);
      }
    }

    return sendSuccess(reply, {
      assessment,
      summary,
      participants: filtered,
    });
  });

  // Instructor Essay & Hybrid Grading Workspace GET
  fastify.get('/api/v1/attempts/:id/grading', async (req, reply) => {
    const user = await authenticateRequest(req, reply, { requireCsrf: false });
    if (!user) return;

    const { id: attemptId } = req.params as { id: string };
    const [attempt] = await db
      .select()
      .from(assessmentAttempts)
      .where(eq(assessmentAttempts.id, attemptId));
    if (!attempt) {
      return sendError(
        reply,
        404,
        'ATTEMPT_NOT_FOUND',
        'Percobaan ujian tidak ditemukan.'
      );
    }

    const [assessment] = await db
      .select()
      .from(assessments)
      .where(eq(assessments.id, attempt.assessmentId));
    if (!assessment) {
      return sendError(
        reply,
        404,
        'ASSESSMENT_NOT_FOUND',
        'Asesmen tidak ditemukan.'
      );
    }

    const access = await checkClassroomAccess(user, assessment.classroomId);
    if (!access.canManage) {
      return sendError(
        reply,
        403,
        'FORBIDDEN_GRADING',
        'Hanya Dosen Pengampu atau Superadmin yang dapat membuka workspace penilaian ujian.'
      );
    }

    const [student] = await db
      .select({
        id: users.id,
        fullName: users.fullName,
        email: users.email,
        studentNumber: users.identityNumber,
      })
      .from(users)
      .where(eq(users.id, attempt.studentId));

    const snapQuestions = await db
      .select()
      .from(attemptQuestions)
      .where(eq(attemptQuestions.attemptId, attemptId))
      .orderBy(asc(attemptQuestions.questionOrder));

    const answers = await db
      .select()
      .from(attemptAnswers)
      .where(eq(attemptAnswers.attemptId, attemptId));

    const attachments = await db
      .select()
      .from(essayAttachments)
      .where(eq(essayAttachments.attemptId, attemptId));

    const grades = await db
      .select()
      .from(essayGrades)
      .where(eq(essayGrades.attemptId, attemptId));

    const feedbacks = await db
      .select()
      .from(essayFeedback)
      .where(eq(essayFeedback.attemptId, attemptId));

    const questionsWithGrading = snapQuestions.map((sq) => {
      const ans = answers.find((a) => a.attemptQuestionId === sq.id);
      const qAtts = attachments.filter((att) => att.attemptQuestionId === sq.id).map((att) => ({
        ...att,
        downloadUrl: signPresignedGetUrl({
          objectKey: att.objectKey,
          fileName: att.originalName,
          mimeType: att.mimeType,
          disposition: 'attachment',
        }),
        inlineUrl: signPresignedGetUrl({
          objectKey: att.objectKey,
          fileName: att.originalName,
          mimeType: att.mimeType,
          disposition: 'inline',
        }),
      }));
      const eg = grades.find((g) => g.attemptQuestionId === sq.id);
      const qFeedbacks = feedbacks.filter(
        (fb) => fb.attemptQuestionId === sq.id
      );

      return {
        ...sq,
        points: Number(sq.points),
        answer: ans || null,
        attachments: qAtts,
        essayGrade: eg || null,
        feedbacks: qFeedbacks,
      };
    });

    return sendSuccess(reply, {
      attempt,
      assessment,
      student,
      questions: questionsWithGrading,
    });
  });

  const essayGradesSubmitSchema = z.object({
    isDraft: z.boolean().default(false),
    publishToStudent: z.boolean().default(false),
    generalFeedback: z.string().default(''),
    grades: z.array(
      z.object({
        attemptQuestionId: z.string().uuid(),
        gradingMethod: z.enum(['DIRECT', 'RUBRIC']).default('DIRECT'),
        rawScore: z.number().min(0).optional(),
        criterionScores: z
          .array(
            z.object({
              criterionId: z.string(),
              score: z.number().min(0),
              feedback: z.string().default(''),
            })
          )
          .optional(),
        feedback: z.string().default(''),
        privateFeedback: z.string().optional(),
      })
    ),
  });

  fastify.post('/api/v1/attempts/:id/essay-grades', async (req, reply) => {
    const user = await authenticateRequest(req, reply, { requireCsrf: true });
    if (!user) return;

    const { id: attemptId } = req.params as { id: string };
    const [attempt] = await db
      .select()
      .from(assessmentAttempts)
      .where(eq(assessmentAttempts.id, attemptId));
    if (!attempt) {
      return sendError(
        reply,
        404,
        'ATTEMPT_NOT_FOUND',
        'Percobaan ujian tidak ditemukan.'
      );
    }

    const [assessment] = await db
      .select()
      .from(assessments)
      .where(eq(assessments.id, attempt.assessmentId));
    if (!assessment) {
      return sendError(
        reply,
        404,
        'ASSESSMENT_NOT_FOUND',
        'Asesmen tidak ditemukan.'
      );
    }

    const access = await checkClassroomAccess(user, assessment.classroomId);
    if (!access.canManage) {
      return sendError(
        reply,
        403,
        'FORBIDDEN_GRADING',
        'Hanya Dosen Pengampu atau Superadmin yang dapat menilai jawaban esai.'
      );
    }

    const parsed = essayGradesSubmitSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(
        reply,
        400,
        'VALIDATION_ERROR',
        'Data penilaian esai tidak valid.',
        parsed.error.issues
      );
    }

    const d = parsed.data;
    const snapQuestions = await db
      .select()
      .from(attemptQuestions)
      .where(eq(attemptQuestions.attemptId, attemptId));
    const existingAnswers = await db
      .select()
      .from(attemptAnswers)
      .where(eq(attemptAnswers.attemptId, attemptId));

    // Validate that if publishToStudent is requested, all mandatory essay/manual questions are graded and not draft!
    const manualQuestions = snapQuestions.filter((sq) => {
      const ans = existingAnswers.find((a) => a.attemptQuestionId === sq.id);
      return sq.questionMode === 'ESSAY' || Boolean(ans?.requiresManualReview);
    });

    if (d.publishToStudent && d.isDraft) {
      return sendError(
        reply,
        400,
        'CANNOT_PUBLISH_DRAFT_GRADE',
        'Tidak dapat mempublikasikan nilai ke mahasiswa selama status penilaian masih berupa draf.'
      );
    }

    if (d.publishToStudent) {
      for (const mq of manualQuestions) {
        const inPayload = d.grades.find(
          (g) => g.attemptQuestionId === mq.id
        );
        const ans = existingAnswers.find((a) => a.attemptQuestionId === mq.id);
        if (!inPayload && ans?.gradingStatus !== 'MANUAL_GRADED') {
          return sendError(
            reply,
            400,
            'INCOMPLETE_MANDATORY_GRADING',
            `Tidak dapat mempublikasikan nilai akhir karena soal "${mq.promptText.slice(0, 50)}..." belum selesai dinilai.`
          );
        }
      }
    }

    const updatedAttempt = await db.transaction(async (tx) => {
      for (const gItem of d.grades) {
        const targetQuestion = snapQuestions.find(
          (sq) => sq.id === gItem.attemptQuestionId
        );
        if (!targetQuestion) continue;

        const qMaxPts = Number(targetQuestion.points || 10);
        const calc = calculateServerEssayQuestionScore({
          questionMaxPoints: qMaxPts,
          gradingMethod: gItem.gradingMethod,
          rawScore: gItem.rawScore,
          rubricSnapshot: targetQuestion.rubricSnapshot,
          criterionScores: gItem.criterionScores,
        });

        const ans = existingAnswers.find(
          (a) => a.attemptQuestionId === targetQuestion.id
        );

        const [existingGrade] = await tx
          .select()
          .from(essayGrades)
          .where(
            and(
              eq(essayGrades.attemptId, attemptId),
              eq(essayGrades.attemptQuestionId, targetQuestion.id)
            )
          );

        if (existingGrade) {
          const prevAudit = Array.isArray(existingGrade.auditHistory)
            ? existingGrade.auditHistory
            : [];
          const [upGrade] = await tx
            .update(essayGrades)
            .set({
              gradedById: user.id,
              gradingMethod: gItem.gradingMethod,
              rawScore: String(gItem.rawScore ?? calc.finalScore),
              finalScore: String(calc.finalScore),
              maxScore: String(qMaxPts),
              criterionScores: calc.normalizedCriterionScores,
              feedback: gItem.feedback,
              isDraft: d.isDraft,
              revisionNumber: existingGrade.revisionNumber + 1,
              auditHistory: [
                ...prevAudit,
                {
                  revisionNumber: existingGrade.revisionNumber,
                  previousScore: existingGrade.finalScore,
                  newScore: String(calc.finalScore),
                  gradedById: user.id,
                  gradedAt: new Date().toISOString(),
                },
              ],
              gradedAt: new Date(),
              updatedAt: new Date(),
            })
            .where(eq(essayGrades.id, existingGrade.id))
            .returning();

          if (gItem.feedback) {
            await tx.insert(essayFeedback).values({
              essayGradeId: upGrade.id,
              attemptId,
              attemptQuestionId: targetQuestion.id,
              authorId: user.id,
              feedbackText: gItem.feedback,
              visibility: 'STUDENT_VISIBLE',
            });
          }
          if (gItem.privateFeedback) {
            await tx.insert(essayFeedback).values({
              essayGradeId: upGrade.id,
              attemptId,
              attemptQuestionId: targetQuestion.id,
              authorId: user.id,
              feedbackText: gItem.privateFeedback,
              visibility: 'INSTRUCTOR_PRIVATE',
            });
          }
        } else {
          const [insGrade] = await tx
            .insert(essayGrades)
            .values({
              attemptId,
              attemptQuestionId: targetQuestion.id,
              answerId: ans?.id || null,
              gradedById: user.id,
              gradingMethod: gItem.gradingMethod,
              rawScore: String(gItem.rawScore ?? calc.finalScore),
              finalScore: String(calc.finalScore),
              maxScore: String(qMaxPts),
              criterionScores: calc.normalizedCriterionScores,
              feedback: gItem.feedback,
              isDraft: d.isDraft,
              revisionNumber: 1,
              auditHistory: [
                {
                  revisionNumber: 1,
                  newScore: String(calc.finalScore),
                  gradedById: user.id,
                  gradedAt: new Date().toISOString(),
                },
              ],
            })
            .returning();

          if (gItem.feedback) {
            await tx.insert(essayFeedback).values({
              essayGradeId: insGrade.id,
              attemptId,
              attemptQuestionId: targetQuestion.id,
              authorId: user.id,
              feedbackText: gItem.feedback,
              visibility: 'STUDENT_VISIBLE',
            });
          }
          if (gItem.privateFeedback) {
            await tx.insert(essayFeedback).values({
              essayGradeId: insGrade.id,
              attemptId,
              attemptQuestionId: targetQuestion.id,
              authorId: user.id,
              feedbackText: gItem.privateFeedback,
              visibility: 'INSTRUCTOR_PRIVATE',
            });
          }
        }

        if (ans) {
          await tx
            .update(attemptAnswers)
            .set({
              manualScore: String(calc.finalScore),
              finalQuestionScore: String(calc.finalScore),
              requiresManualReview: false,
              gradingStatus: d.isDraft ? 'DRAFT_MANUAL' : 'MANUAL_GRADED',
              updatedAt: new Date(),
            })
            .where(eq(attemptAnswers.id, ans.id));
        }
      }

      // Recompute total objective + essay scores across the attempt
      const refreshedAnswers = await tx
        .select()
        .from(attemptAnswers)
        .where(eq(attemptAnswers.attemptId, attemptId));

      let objSum = 0;
      let essaySum = 0;
      let anyManualPending = false;

      for (const sq of snapQuestions) {
        const rAns = refreshedAnswers.find(
          (a) => a.attemptQuestionId === sq.id
        );
        if (sq.questionMode === 'OBJECTIVE' && !rAns?.requiresManualReview) {
          objSum += Number(
            rAns?.manualScore ?? rAns?.autoScore ?? rAns?.finalQuestionScore ?? 0
          );
        } else {
          if (
            rAns?.gradingStatus === 'MANUAL_GRADED' ||
            rAns?.gradingStatus === 'DRAFT_MANUAL'
          ) {
            essaySum += Number(rAns?.manualScore ?? 0);
          }
          if (rAns?.gradingStatus !== 'MANUAL_GRADED') {
            anyManualPending = true;
          }
        }
      }

      objSum = Math.max(0, Math.round(objSum * 100) / 100);
      essaySum = Math.max(0, Math.round(essaySum * 100) / 100);

      const latePenaltyFactor =
        attempt.isLate &&
        assessment.lateAttemptPolicy === 'PENALTY_PERCENT' &&
        Number(assessment.latePenaltyPercent) > 0
          ? Math.max(0, 1 - Number(assessment.latePenaltyPercent) / 100)
          : 1;

      const combinedScore =
        Math.round((objSum + essaySum) * latePenaltyFactor * 100) / 100;
      const maxScoreNum = Math.max(1, Number(assessment.maxScore || 100));
      const pctScore =
        Math.round((combinedScore / maxScoreNum) * 10000) / 100;
      const passed = combinedScore >= Number(assessment.passingGrade || 70);

      const essayGradingStatus = d.isDraft
        ? 'DRAFT_SAVED'
        : anyManualPending
        ? 'IN_PROGRESS'
        : 'GRADED';

      const finalGradingStatus = anyManualPending
        ? 'PENDING_ESSAY'
        : d.publishToStudent
        ? 'PUBLISHED'
        : 'READY';

      const [upAtt] = await tx
        .update(assessmentAttempts)
        .set({
          status:
            !anyManualPending && !d.isDraft ? 'GRADED' : attempt.status,
          objectiveScore: String(objSum),
          essayScore: String(essaySum),
          totalScore: String(combinedScore),
          percentageScore: String(pctScore),
          passed,
          essayGradingStatus,
          finalGradingStatus,
          isPublishedToStudent: Boolean(
            d.publishToStudent && !anyManualPending && !d.isDraft
          ),
          generalFeedback: d.generalFeedback || attempt.generalFeedback,
          updatedAt: new Date(),
        })
        .where(eq(assessmentAttempts.id, attemptId))
        .returning();

      // Update assessment_results
      await tx
        .update(assessmentResults)
        .set({
          objectiveScore: String(objSum),
          essayScore: String(essaySum),
          finalScore: String(combinedScore),
          percentageScore: String(pctScore),
          passed,
          gradingStatus: anyManualPending ? 'PARTIAL' : 'COMPLETE',
          isPublished: Boolean(
            d.publishToStudent && !anyManualPending && !d.isDraft
          ),
          publishedAt:
            d.publishToStudent && !anyManualPending && !d.isDraft
              ? new Date()
              : null,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(assessmentResults.assessmentId, assessment.id),
            eq(assessmentResults.studentId, attempt.studentId)
          )
        );

      await tx.insert(assessmentEvents).values({
        assessmentId: assessment.id,
        attemptId,
        actorId: user.id,
        eventType: d.isDraft ? 'ESSAY_DRAFT_SAVED' : 'ESSAY_GRADED',
        metadata: {
          essayScore: essaySum,
          totalScore: combinedScore,
          publishToStudent: d.publishToStudent,
        },
        ipAddress: req.ip,
      });

      return upAtt;
    });

    return sendSuccess(reply, { attempt: updatedAttempt });
  });

  // Publish Assessment Results (Bulk or Individual)
  fastify.post('/api/v1/assessments/:id/publish-results', async (req, reply) => {
    const user = await authenticateRequest(req, reply, { requireCsrf: true });
    if (!user) return;

    const { id: assessmentId } = req.params as { id: string };
    const [assessment] = await db
      .select()
      .from(assessments)
      .where(eq(assessments.id, assessmentId));
    if (!assessment) {
      return sendError(
        reply,
        404,
        'ASSESSMENT_NOT_FOUND',
        'Asesmen tidak ditemukan.'
      );
    }

    const access = await checkClassroomAccess(user, assessment.classroomId);
    if (!access.canManage) {
      return sendError(reply, 403, 'FORBIDDEN', 'Akses ditolak.');
    }

    const allAttempts = await db
      .select()
      .from(assessmentAttempts)
      .where(eq(assessmentAttempts.assessmentId, assessmentId));

    const submittedAttempts = allAttempts.filter(
      (a) => a.status !== 'IN_PROGRESS' && a.status !== 'INVALIDATED'
    );

    const incompleteAttempts = submittedAttempts.filter(
      (a) =>
        a.finalGradingStatus === 'PENDING_ESSAY' ||
        a.essayGradingStatus === 'PENDING' ||
        a.essayGradingStatus === 'IN_PROGRESS' ||
        a.essayGradingStatus === 'DRAFT_SAVED'
    );

    if (incompleteAttempts.length > 0) {
      return sendError(
        reply,
        400,
        'INCOMPLETE_MANDATORY_GRADING',
        `Terdapat ${incompleteAttempts.length} percobaan mahasiswa yang masih menunggu penyelesaian penilaian esai manual.`
      );
    }

    await db.transaction(async (tx) => {
      await tx
        .update(assessments)
        .set({
          resultsPublished: true,
          resultsPublishedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(assessments.id, assessmentId));

      for (const att of submittedAttempts) {
        await tx
          .update(assessmentAttempts)
          .set({
            finalGradingStatus: 'PUBLISHED',
            isPublishedToStudent: true,
            updatedAt: new Date(),
          })
          .where(eq(assessmentAttempts.id, att.id));
      }

      await tx
        .update(assessmentResults)
        .set({
          isPublished: true,
          publishedAt: new Date(),
          gradingStatus: 'COMPLETE',
          updatedAt: new Date(),
        })
        .where(eq(assessmentResults.assessmentId, assessmentId));

      await tx.insert(assessmentEvents).values({
        assessmentId,
        actorId: user.id,
        eventType: 'RESULTS_PUBLISHED',
        metadata: { publishedCount: submittedAttempts.length },
        ipAddress: req.ip,
      });
    });

    return sendSuccess(reply, {
      published: true,
      publishedAttemptsCount: submittedAttempts.length,
    });
  });

  fastify.get('/api/v1/assessments/:id/results', async (req, reply) => {
    const user = await authenticateRequest(req, reply, { requireCsrf: false });
    if (!user) return;

    const { id: assessmentId } = req.params as { id: string };
    const [assessment] = await db
      .select()
      .from(assessments)
      .where(eq(assessments.id, assessmentId));
    if (!assessment) {
      return sendError(
        reply,
        404,
        'ASSESSMENT_NOT_FOUND',
        'Asesmen tidak ditemukan.'
      );
    }

    const access = await checkClassroomAccess(user, assessment.classroomId);
    if (!access.canView) {
      return sendError(reply, 403, 'FORBIDDEN', 'Akses ditolak.');
    }

    const rawResults = await db
      .select({
        id: assessmentResults.id,
        assessmentId: assessmentResults.assessmentId,
        studentId: assessmentResults.studentId,
        studentName: users.fullName,
        studentNim: users.identityNumber,
        attemptsUsed: assessmentResults.attemptsUsed,
        objectiveScore: assessmentResults.objectiveScore,
        essayScore: assessmentResults.essayScore,
        finalScore: assessmentResults.finalScore,
        maxScore: assessmentResults.maxScore,
        percentageScore: assessmentResults.percentageScore,
        passed: assessmentResults.passed,
        gradingStatus: assessmentResults.gradingStatus,
        isPublished: assessmentResults.isPublished,
        publishedAt: assessmentResults.publishedAt,
      })
      .from(assessmentResults)
      .innerJoin(users, eq(assessmentResults.studentId, users.id))
      .where(eq(assessmentResults.assessmentId, assessmentId));

    const visibleResults = access.canManage
      ? rawResults
      : rawResults
          .filter((r) => r.studentId === user.id)
          .map((r) => ({
            ...r,
            objectiveScore:
              r.isPublished || assessment.resultsPublished
                ? Number(r.objectiveScore)
                : null,
            essayScore:
              r.isPublished || assessment.resultsPublished
                ? Number(r.essayScore)
                : null,
            finalScore:
              r.isPublished || assessment.resultsPublished
                ? Number(r.finalScore)
                : null,
            percentageScore:
              r.isPublished || assessment.resultsPublished
                ? Number(r.percentageScore)
                : null,
            passed:
              r.isPublished || assessment.resultsPublished ? r.passed : null,
          }));

    return sendSuccess(reply, { results: visibleResults });
  });

  // ==========================================================================
  // 5. REAL POSTGRESQL ANALYTICS & ITEM ANALYSIS ENGINE
  // ==========================================================================
  fastify.get('/api/v1/assessments/:id/analytics', async (req, reply) => {
    const user = await authenticateRequest(req, reply, { requireCsrf: false });
    if (!user) return;

    const { id: assessmentId } = req.params as { id: string };
    const [assessment] = await db
      .select()
      .from(assessments)
      .where(eq(assessments.id, assessmentId));
    if (!assessment) {
      return sendError(
        reply,
        404,
        'ASSESSMENT_NOT_FOUND',
        'Asesmen tidak ditemukan.'
      );
    }

    const access = await checkClassroomAccess(user, assessment.classroomId);
    if (!access.canManage) {
      return sendError(
        reply,
        403,
        'FORBIDDEN_ANALYTICS',
        'Hanya Dosen Pengampu atau Superadmin yang dapat melihat analitik ujian.'
      );
    }

    const enrollments = await db
      .select()
      .from(classroomEnrollments)
      .where(
        and(
          eq(classroomEnrollments.classroomId, assessment.classroomId),
          eq(classroomEnrollments.status, 'active')
        )
      );

    const allAttempts = await db
      .select()
      .from(assessmentAttempts)
      .where(eq(assessmentAttempts.assessmentId, assessmentId));

    const submittedAttempts = allAttempts.filter(
      (a) =>
        a.status === 'SUBMITTED' ||
        a.status === 'AUTO_SUBMITTED' ||
        a.status === 'GRADED' ||
        a.status === 'TIMED_OUT'
    );

    const scores = submittedAttempts
      .map((a) => Number(a.totalScore || 0))
      .sort((a, b) => a - b);
    const objScores = submittedAttempts.map((a) =>
      Number(a.objectiveScore || 0)
    );
    const essayScores = submittedAttempts.map((a) =>
      Number(a.essayScore || 0)
    );

    const count = scores.length;
    const averageScore =
      count > 0
        ? Math.round((scores.reduce((a, b) => a + b, 0) / count) * 100) / 100
        : 0;
    const medianScore =
      count > 0
        ? count % 2 === 1
          ? scores[Math.floor(count / 2)]
          : Math.round(
              ((scores[count / 2 - 1] + scores[count / 2]) / 2) * 100
            ) / 100
        : 0;
    const highestScore = count > 0 ? scores[count - 1] : 0;
    const lowestScore = count > 0 ? scores[0] : 0;

    const passCount = submittedAttempts.filter((a) => a.passed).length;
    const failCount = count - passCount;
    const passPercentage =
      count > 0 ? Math.round((passCount / count) * 10000) / 100 : 0;
    const failPercentage =
      count > 0 ? Math.round((failCount / count) * 10000) / 100 : 0;

    const totalEnrolled = Math.max(1, enrollments.length);
    const uniqueSubmittedStudents = new Set(
      submittedAttempts.map((a) => a.studentId)
    ).size;
    const uniqueStartedStudents = new Set(allAttempts.map((a) => a.studentId))
      .size;

    const submissionRate =
      Math.round((uniqueSubmittedStudents / totalEnrolled) * 10000) / 100;
    const completionRate =
      uniqueStartedStudents > 0
        ? Math.round(
            (uniqueSubmittedStudents / uniqueStartedStudents) * 10000
          ) / 100
        : 0;

    const gradeDistribution = [
      {
        grade: 'A (85–100)',
        count: scores.filter((s) => s >= 85).length,
      },
      {
        grade: 'B (70–84.9)',
        count: scores.filter((s) => s >= 70 && s < 85).length,
      },
      {
        grade: 'C (55–69.9)',
        count: scores.filter((s) => s >= 55 && s < 70).length,
      },
      {
        grade: 'D (40–54.9)',
        count: scores.filter((s) => s >= 40 && s < 55).length,
      },
      {
        grade: 'E (<40)',
        count: scores.filter((s) => s < 40).length,
      },
    ];

    const essayGradedCount = submittedAttempts.filter(
      (a) => a.essayGradingStatus === 'GRADED'
    ).length;
    const essayPendingCount = submittedAttempts.filter(
      (a) =>
        a.essayGradingStatus === 'PENDING' ||
        a.essayGradingStatus === 'IN_PROGRESS' ||
        a.essayGradingStatus === 'DRAFT_SAVED'
    ).length;

    // Per-question item analysis & distractor analysis
    const subAttIds = submittedAttempts.map((a) => a.id);
    const snapQs =
      subAttIds.length > 0
        ? await db
            .select()
            .from(attemptQuestions)
            .where(inArray(attemptQuestions.attemptId, subAttIds))
        : [];
    const snapAns =
      subAttIds.length > 0
        ? await db
            .select()
            .from(attemptAnswers)
            .where(inArray(attemptAnswers.attemptId, subAttIds))
        : [];

    // Group by sourceQuestionId
    const questionGroups = new Map<string, typeof snapQs>();
    for (const sq of snapQs) {
      const key = sq.sourceQuestionId || sq.promptText;
      const arr = questionGroups.get(key) || [];
      arr.push(sq);
      questionGroups.set(key, arr);
    }

    const sampleSizeSufficient = submittedAttempts.length >= 10;

    // Sort attempts by totalScore for upper/lower 27% discrimination calculation
    const sortedAttemptsDesc = [...submittedAttempts].sort(
      (a, b) => Number(b.totalScore || 0) - Number(a.totalScore || 0)
    );
    const groupSize = Math.max(1, Math.floor(sortedAttemptsDesc.length * 0.27));
    const upperAttemptIds = new Set(
      sortedAttemptsDesc.slice(0, groupSize).map((a) => a.id)
    );
    const lowerAttemptIds = new Set(
      sortedAttemptsDesc
        .slice(Math.max(0, sortedAttemptsDesc.length - groupSize))
        .map((a) => a.id)
    );

    const itemAnalysis = Array.from(questionGroups.entries()).map(
      ([sourceQuestionId, sqInstances]) => {
        const rep = sqInstances[0];
        const qMaxPts = Math.max(1, Number(rep.points || 10));
        const qAnswers = snapAns.filter((a) =>
          sqInstances.some((sq) => sq.id === a.attemptQuestionId)
        );

        const totalResponses = qAnswers.length;
        const correctCount = qAnswers.filter((a) => a.isCorrect).length;
        const correctPercentage =
          totalResponses > 0
            ? Math.round((correctCount / totalResponses) * 10000) / 100
            : 0;

        const avgItemScore =
          totalResponses > 0
            ? Math.round(
                (qAnswers.reduce(
                  (acc, a) => acc + Number(a.finalQuestionScore ?? a.autoScore ?? 0),
                  0
                ) /
                  totalResponses) *
                  100
              ) / 100
            : 0;

        // Item Difficulty Index (p-value: 0.00 to 1.00)
        const itemDifficultyIndex =
          totalResponses > 0
            ? Math.round((avgItemScore / qMaxPts) * 100) / 100
            : 0;

        // Item Discrimination Index (D = P_upper - P_lower)
        const upperAns = qAnswers.filter((a) =>
          upperAttemptIds.has(a.attemptId)
        );
        const lowerAns = qAnswers.filter((a) =>
          lowerAttemptIds.has(a.attemptId)
        );
        const pUpper =
          upperAns.length > 0
            ? upperAns.reduce(
                (acc, a) =>
                  acc + Number(a.finalQuestionScore ?? a.autoScore ?? 0) / qMaxPts,
                0
              ) / upperAns.length
            : 0;
        const pLower =
          lowerAns.length > 0
            ? lowerAns.reduce(
                (acc, a) =>
                  acc + Number(a.finalQuestionScore ?? a.autoScore ?? 0) / qMaxPts,
                0
              ) / lowerAns.length
            : 0;
        const itemDiscriminationIndex = sampleSizeSufficient
          ? Math.round((pUpper - pLower) * 100) / 100
          : null;

        // Distractor frequency analysis for choice questions
        const serverKey = (rep.serverAnswerKeySnapshot || {}) as Record<
          string,
          any
        >;
        const optionsList: any[] = serverKey.options || [];
        const distractorAnalysis = optionsList.map((opt) => {
          const pickedCount = qAnswers.filter((a) => {
            const payload = (a.answerPayload || {}) as Record<string, any>;
            if (payload.selectedOptionId === opt.id) return true;
            if (
              Array.isArray(payload.selectedOptionIds) &&
              payload.selectedOptionIds.includes(opt.id)
            )
              return true;
            return false;
          }).length;

          return {
            optionId: opt.id,
            optionLabel: opt.optionLabel,
            optionText: opt.optionText,
            isCorrect: opt.isCorrect,
            selectedCount: pickedCount,
            selectionPercentage:
              totalResponses > 0
                ? Math.round((pickedCount / totalResponses) * 10000) / 100
                : 0,
          };
        });

        return {
          sourceQuestionId,
          promptText: rep.promptText,
          questionMode: rep.questionMode,
          questionType: rep.questionType,
          maxPoints: qMaxPts,
          totalResponses,
          correctCount,
          correctPercentage,
          averageScore: avgItemScore,
          itemDifficultyIndex,
          itemDiscriminationIndex,
          sampleSizeSufficient,
          reliabilityNote: sampleSizeSufficient
            ? 'Sampel memadai (N >= 10)'
            : `Ukuran sampel kecil (N = ${submittedAttempts.length} < 10); indeks daya pembeda memerlukan minimal 10 peserta.`,
          distractorAnalysis,
        };
      }
    );

    return sendSuccess(reply, {
      analytics: {
        totalEnrolled: enrollments.length,
        totalSubmittedAttempts: count,
        averageScore,
        medianScore,
        highestScore,
        lowestScore,
        passCount,
        failCount,
        passPercentage,
        failPercentage,
        submissionRate,
        completionRate,
        objectiveAverageScore:
          objScores.length > 0
            ? Math.round(
                (objScores.reduce((a, b) => a + b, 0) / objScores.length) * 100
              ) / 100
            : 0,
        essayAverageScore:
          essayScores.length > 0
            ? Math.round(
                (essayScores.reduce((a, b) => a + b, 0) / essayScores.length) *
                  100
              ) / 100
            : 0,
        essayGradingProgress: {
          graded: essayGradedCount,
          pending: essayPendingCount,
          total: submittedAttempts.length,
        },
        gradeDistribution,
        sampleSizeSufficient,
        itemAnalysis,
      },
    });
  });
}
