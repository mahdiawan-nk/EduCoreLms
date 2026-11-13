import crypto from 'crypto';
import fs from 'fs';
import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq, and, desc, asc, ilike, or, inArray, sql } from 'drizzle-orm';
import * as XLSX from 'xlsx';
import sharp from 'sharp';
import { db } from '../db/index.ts';
import {
  assessments,
  assessmentQuestions,
  assessmentRubrics,
  assessmentRubricCriteria,
  assessmentEvents,
  classroomAuditLogs,
  questions,
  questionOptions,
  questionMedia,
  questionBankTags,
  questionImportJobs,
  questionImportErrors,
  users,
} from '../db/schema.ts';
import { authenticateRequest, sendSuccess, sendError, AuthenticatedUser } from './security.ts';
import { validateImageMagicBytes } from './imageOptimization.ts';
import {
  writePrivateObjectBuffer,
  deletePrivateObject,
  resolvePrivateObjectPath,
} from './storage.ts';
import { resolveClassroomRole, recordClassroomAudit } from './classroomWorkspaceRoutes.ts';

function isInstructorOrAdmin(user: AuthenticatedUser): boolean {
  return user.roles.some((r) => ['SUPERADMIN', 'DOSEN'].includes(r.toUpperCase()));
}

function isSuperadmin(user: AuthenticatedUser): boolean {
  return user.roles.some((r) => r.toUpperCase() === 'SUPERADMIN');
}

const VALID_QUESTION_TYPES = [
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
] as const;

const ESSAY_TYPE_SET = new Set([
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
]);

const VALID_DIFFICULTIES = ['EASY', 'MEDIUM', 'HARD'] as const;

const AUDIO_EXTENSIONS_MIME: Record<string, string> = {
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  m4a: 'audio/mp4',
  ogg: 'audio/ogg',
  webm: 'audio/webm',
};

function generateQuestionCode(): string {
  return `SOAL-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
}

export interface NormalizedImportRow {
  rowNumber: number;
  externalQuestionId: string;
  questionType: string;
  promptText: string;
  title: string;
  topic: string;
  learningOutcome: string;
  difficulty: 'EASY' | 'MEDIUM' | 'HARD';
  points: number;
  explanation: string;
  answerKey: string;
  tags: string[];
  options: Array<{
    optionLabel: string;
    optionText: string;
    isCorrect: boolean;
    sortOrder: number;
  }>;
  rubricCriteria: Array<{
    criterionName: string;
    description: string;
    maxScore: number;
    weight: number;
  }>;
}

export interface ImportValidationErrorItem {
  rowNumber: number;
  externalQuestionId: string;
  field: string;
  message: string;
}

function parseCsvText(rawText: string): { delimiter: ',' | ';'; rows: Record<string, string>[] } {
  const cleaned = rawText.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = cleaned.split('\n').filter((l) => l.trim().length > 0);
  if (lines.length === 0) return { delimiter: ',', rows: [] };

  const firstLine = lines[0];
  const commaCount = (firstLine.match(/,/g) || []).length;
  const semiCount = (firstLine.match(/;/g) || []).length;
  const delimiter: ',' | ';' = semiCount > commaCount ? ';' : ',';

  const splitRow = (line: string): string[] => {
    const out: string[] = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === delimiter && !inQuotes) {
        out.push(cur.trim());
        cur = '';
      } else {
        cur += ch;
      }
    }
    out.push(cur.trim());
    return out;
  };

  const headers = splitRow(lines[0]).map((h) => h.trim().toLowerCase());
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const vals = splitRow(lines[i]);
    const obj: Record<string, string> = {};
    headers.forEach((h, idx) => {
      if (h) obj[h] = (vals[idx] ?? '').trim();
    });
    rows.push(obj);
  }
  return { delimiter, rows };
}

function validateAndNormalizeImportRows(
  rawRows: Array<Record<string, unknown>>,
  optionsByExtId: Map<string, Array<Record<string, unknown>>>,
  rubricByExtId: Map<string, Array<Record<string, unknown>>>,
  isXlsxMultiSheet: boolean
): {
  validRows: NormalizedImportRow[];
  errors: ImportValidationErrorItem[];
} {
  const validRows: NormalizedImportRow[] = [];
  const errors: ImportValidationErrorItem[] = [];
  const seenExternalIds = new Set<string>();

  for (let idx = 0; idx < rawRows.length; idx++) {
    const raw = rawRows[idx];
    const rowNum = idx + 2; // 1-indexed header + row
    const extId = String(raw.external_question_id || '').trim();
    const qType = String(raw.question_type || '')
      .trim()
      .toUpperCase();
    const promptText = String(raw.question_text || raw.prompt_text || '').trim();
    const title = String(raw.title || '').trim();
    const topic = String(raw.topic || '').trim();
    const cpmk = String(raw.cpmk || raw.learning_outcome || '').trim();
    const diffRaw = String(raw.difficulty || 'MEDIUM')
      .trim()
      .toUpperCase();
    const scoreRaw = Number(raw.default_score ?? raw.points ?? 10);
    const explanation = String(raw.explanation || '').trim();
    const answerKey = String(raw.answer_key || raw.correct_answers || '').trim();
    const tagsRaw = String(raw.tags || '').trim();
    const tags = tagsRaw
      ? tagsRaw
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean)
      : [];

    let rowHasError = false;
    const addErr = (field: string, message: string) => {
      rowHasError = true;
      errors.push({ rowNumber: rowNum, externalQuestionId: extId, field, message });
    };

    if (!promptText) {
      addErr('question_text', 'Missing question content (question_text wajib diisi).');
    }
    if (!VALID_QUESTION_TYPES.includes(qType as (typeof VALID_QUESTION_TYPES)[number])) {
      addErr('question_type', `Invalid question_type: "${qType || '(kosong)'}".`);
    }
    if (!VALID_DIFFICULTIES.includes(diffRaw as (typeof VALID_DIFFICULTIES)[number])) {
      addErr('difficulty', `Invalid difficulty "${diffRaw}". Gunakan EASY, MEDIUM, atau HARD.`);
    }
    if (!Number.isFinite(scoreRaw) || scoreRaw <= 0 || scoreRaw > 1000) {
      addErr('default_score', 'default_score harus berupa angka positif (1 - 1000).');
    }
    if (extId) {
      if (seenExternalIds.has(extId)) {
        addErr('external_question_id', `Duplicate external_question_id "${extId}" dalam berkas.`);
      }
      seenExternalIds.add(extId);
    }

    // Build options either from Opsi_Jawaban sheet or flat CSV columns (option_a..option_e)
    const builtOptions: NormalizedImportRow['options'] = [];
    if (isXlsxMultiSheet && extId && optionsByExtId.has(extId)) {
      const sheetOpts = optionsByExtId.get(extId)!;
      sheetOpts.forEach((o, i) => {
        const label = String(o.option_code || String.fromCharCode(65 + i))
          .trim()
          .toUpperCase();
        const text = String(o.option_text || '').trim();
        const isCorrectVal = String(o.is_correct ?? '')
          .trim()
          .toLowerCase();
        const isCorrect =
          isCorrectVal === 'true' || isCorrectVal === '1' || isCorrectVal === 'yes' || isCorrectVal === 'ya';
        const sortOrder = Number(o.option_order ?? i + 1) || i + 1;
        if (text) {
          builtOptions.push({ optionLabel: label, optionText: text, isCorrect, sortOrder });
        }
      });
    } else {
      const correctSet = new Set(
        answerKey
          .split(/[,;|]/)
          .map((s) => s.trim().toUpperCase())
          .filter(Boolean)
      );
      const flatCols = ['a', 'b', 'c', 'd', 'e'];
      flatCols.forEach((letter, i) => {
        const val = String(raw[`option_${letter}`] || '').trim();
        if (val) {
          const upper = letter.toUpperCase();
          builtOptions.push({
            optionLabel: upper,
            optionText: val,
            isCorrect: correctSet.has(upper),
            sortOrder: i + 1,
          });
        }
      });
    }

    // Validate options for choice types
    if (qType === 'SINGLE_CHOICE') {
      if (builtOptions.length < 2) {
        addErr('options', 'SINGLE_CHOICE minimal membutuhkan 2 opsi jawaban.');
      } else {
        const correctCount = builtOptions.filter((o) => o.isCorrect).length;
        if (correctCount !== 1) {
          addErr(
            'correct_answers',
            'Single-choice question must have exactly one correct answer.'
          );
        }
      }
    } else if (qType === 'MULTIPLE_SELECT') {
      if (builtOptions.length < 2) {
        addErr('options', 'MULTIPLE_SELECT minimal membutuhkan 2 opsi jawaban.');
      } else if (builtOptions.filter((o) => o.isCorrect).length < 1) {
        addErr('correct_answers', 'MULTIPLE_SELECT minimal memiliki 1 jawaban benar.');
      }
    } else if (qType === 'TRUE_FALSE') {
      if (builtOptions.length === 0) {
        const ansUpper = answerKey.toUpperCase();
        if (ansUpper !== 'TRUE' && ansUpper !== 'FALSE' && ansUpper !== 'A' && ansUpper !== 'B') {
          addErr('correct_answers', 'TRUE_FALSE wajib memiliki jawaban TRUE atau FALSE.');
        } else {
          const isTrue = ansUpper === 'TRUE' || ansUpper === 'A';
          builtOptions.push(
            { optionLabel: 'A', optionText: 'Benar', isCorrect: isTrue, sortOrder: 1 },
            { optionLabel: 'B', optionText: 'Salah', isCorrect: !isTrue, sortOrder: 2 }
          );
        }
      }
    }

    // Build rubric criteria
    const builtRubric: NormalizedImportRow['rubricCriteria'] = [];
    if (extId && rubricByExtId.has(extId)) {
      for (const r of rubricByExtId.get(extId)!) {
        const critName = String(r.criterion || '').trim();
        if (critName) {
          builtRubric.push({
            criterionName: critName,
            description: String(r.description || '').trim(),
            maxScore: Number(r.maximum_score ?? 25) || 25,
            weight: Number(r.weight ?? 25) || 25,
          });
        }
      }
    } else if (raw.rubric_json && String(raw.rubric_json).trim()) {
      try {
        const parsedRubric = JSON.parse(String(raw.rubric_json));
        if (Array.isArray(parsedRubric)) {
          for (const r of parsedRubric) {
            if (r?.criterionName || r?.criterion) {
              builtRubric.push({
                criterionName: String(r.criterionName || r.criterion),
                description: String(r.description || ''),
                maxScore: Number(r.maxScore ?? r.maximum_score ?? 25) || 25,
                weight: Number(r.weight ?? 25) || 25,
              });
            }
          }
        }
      } catch {
        addErr('rubric_json', 'Format JSON rubrik tidak valid.');
      }
    }

    if (!rowHasError) {
      validRows.push({
        rowNumber: rowNum,
        externalQuestionId: extId || `ROW-${rowNum}`,
        questionType: qType,
        promptText,
        title,
        topic,
        learningOutcome: cpmk,
        difficulty: diffRaw as 'EASY' | 'MEDIUM' | 'HARD',
        points: scoreRaw,
        explanation,
        answerKey,
        tags,
        options: builtOptions,
        rubricCriteria: builtRubric,
      });
    }
  }

  return { validRows, errors };
}

async function buildQuestionSnapshot(questionId: string) {
  const [q] = await db.select().from(questions).where(eq(questions.id, questionId));
  if (!q) return null;
  const opts = await db
    .select()
    .from(questionOptions)
    .where(eq(questionOptions.questionId, questionId))
    .orderBy(asc(questionOptions.sortOrder));
  const media = await db
    .select()
    .from(questionMedia)
    .where(eq(questionMedia.questionId, questionId))
    .orderBy(asc(questionMedia.sortOrder));
  const rubrics = await db
    .select()
    .from(assessmentRubrics)
    .where(eq(assessmentRubrics.questionId, questionId));
  const criteria =
    rubrics.length > 0
      ? await db
          .select()
          .from(assessmentRubricCriteria)
          .where(eq(assessmentRubricCriteria.rubricId, rubrics[0].id))
          .orderBy(asc(assessmentRubricCriteria.sortOrder))
      : [];

  return {
    id: q.id,
    questionCode: q.questionCode,
    title: q.title,
    questionMode: q.questionMode,
    questionType: q.questionType,
    subject: q.subject,
    topic: q.topic,
    learningOutcome: q.learningOutcome,
    difficulty: q.difficulty,
    promptText: q.promptText,
    promptJson: q.promptJson,
    promptHtml: q.promptHtml,
    points: q.points,
    negativePoints: q.negativePoints,
    partialCreditEnabled: q.partialCreditEnabled,
    answerConfig: q.answerConfig,
    explanation: q.explanation,
    versionNumber: q.versionNumber,
    options: opts,
    media,
    rubric: rubrics[0] ? { ...rubrics[0], criteria } : null,
    capturedAt: new Date().toISOString(),
  };
}

async function processImportJobAsync(jobId: string) {
  try {
    const [job] = await db
      .select()
      .from(questionImportJobs)
      .where(eq(questionImportJobs.id, jobId));
    if (!job || job.status === 'CANCELLED') return;

    await db
      .update(questionImportJobs)
      .set({ status: 'PROCESSING', updatedAt: new Date() })
      .where(eq(questionImportJobs.id, jobId));

    const rows = Array.isArray(job.payloadRows) ? (job.payloadRows as NormalizedImportRow[]) : [];
    const batchSize = Math.max(10, Math.min(250, job.batchSize || 100));
    let processed = 0;
    let successful = 0;
    let failed = 0;
    let skipped = 0;
    const errorReport: ImportValidationErrorItem[] = [];

    for (let start = 0; start < rows.length; start += batchSize) {
      // Check if cancelled before each batch
      const [latestJob] = await db
        .select({ status: questionImportJobs.status })
        .from(questionImportJobs)
        .where(eq(questionImportJobs.id, jobId));
      if (!latestJob || latestJob.status === 'CANCELLED') return;

      const batch = rows.slice(start, start + batchSize);
      await db.transaction(async (tx) => {
        for (const row of batch) {
          processed++;
          try {
            const [existing] = await tx
              .select()
              .from(questions)
              .where(
                and(
                  eq(questions.authorId, job.uploadedById),
                  eq(questions.externalQuestionId, row.externalQuestionId)
                )
              );

            if (existing) {
              if (job.importMode === 'SKIP_DUPLICATES') {
                skipped++;
                continue;
              }
              if (job.importMode === 'INSERT_ONLY') {
                failed++;
                const errItem: ImportValidationErrorItem = {
                  rowNumber: row.rowNumber,
                  externalQuestionId: row.externalQuestionId,
                  field: 'external_question_id',
                  message: `Soal dengan ID "${row.externalQuestionId}" sudah ada (INSERT_ONLY).`,
                };
                errorReport.push(errItem);
                await tx.insert(questionImportErrors).values({
                  jobId,
                  rowNumber: row.rowNumber,
                  externalQuestionId: row.externalQuestionId,
                  field: 'external_question_id',
                  errorMessage: errItem.message,
                  rawRow: row,
                });
                continue;
              }
              // UPDATE_OWNED_QUESTIONS
              await tx
                .update(questions)
                .set({
                  title: row.title,
                  questionType: row.questionType,
                  questionMode: ESSAY_TYPE_SET.has(row.questionType) ? 'ESSAY' : 'OBJECTIVE',
                  topic: row.topic,
                  learningOutcome: row.learningOutcome,
                  difficulty: row.difficulty,
                  promptText: row.promptText,
                  points: String(row.points),
                  explanation: row.explanation,
                  tags: row.tags,
                  versionNumber: existing.versionNumber + 1,
                  updatedAt: new Date(),
                })
                .where(eq(questions.id, existing.id));
              successful++;
              continue;
            }

            const [createdQ] = await tx
              .insert(questions)
              .values({
                classroomId: job.classroomId,
                authorId: job.uploadedById,
                title: row.title,
                questionCode: generateQuestionCode(),
                status: 'READY',
                sourceType: job.fileFormat === 'XLSX' ? 'IMPORT_XLSX' : 'IMPORT_CSV',
                externalQuestionId: row.externalQuestionId,
                importJobId: job.id,
                tags: row.tags,
                questionMode: ESSAY_TYPE_SET.has(row.questionType) ? 'ESSAY' : 'OBJECTIVE',
                questionType: row.questionType,
                topic: row.topic,
                learningOutcome: row.learningOutcome,
                difficulty: row.difficulty,
                promptText: row.promptText,
                promptJson: {
                  type: 'doc',
                  content: [{ type: 'paragraph', content: [{ type: 'text', text: row.promptText }] }],
                },
                points: String(row.points),
                explanation: row.explanation,
                answerConfig: row.answerKey ? { expectedAnswer: row.answerKey } : {},
              })
              .returning();

            if (row.options.length > 0) {
              await tx.insert(questionOptions).values(
                row.options.map((opt) => ({
                  questionId: createdQ.id,
                  optionLabel: opt.optionLabel,
                  optionText: opt.optionText,
                  isCorrect: opt.isCorrect,
                  sortOrder: opt.sortOrder,
                }))
              );
            }

            if (row.tags.length > 0) {
              await tx.insert(questionBankTags).values(
                row.tags.map((tag) => ({
                  questionId: createdQ.id,
                  tag,
                  learningOutcomeCode: row.learningOutcome,
                }))
              );
            }

            if (row.rubricCriteria.length > 0) {
              const [rub] = await tx
                .insert(assessmentRubrics)
                .values({
                  questionId: createdQ.id,
                  title: `Rubrik ${row.externalQuestionId}`,
                  maxScore: String(row.points),
                })
                .returning();
              await tx.insert(assessmentRubricCriteria).values(
                row.rubricCriteria.map((c, idx) => ({
                  rubricId: rub.id,
                  criterionName: c.criterionName,
                  description: c.description,
                  weight: c.weight,
                  maxScore: String(c.maxScore),
                  sortOrder: idx + 1,
                }))
              );
            }

            successful++;
          } catch (err: unknown) {
            failed++;
            const msg = err instanceof Error ? err.message : 'Gagal memproses baris.';
            errorReport.push({
              rowNumber: row.rowNumber,
              externalQuestionId: row.externalQuestionId,
              field: 'row',
              message: msg,
            });
          }
        }
      });

      await db
        .update(questionImportJobs)
        .set({
          processedRows: processed,
          successfulRows: successful,
          failedRows: failed,
          skippedRows: skipped,
          errorReport,
          updatedAt: new Date(),
        })
        .where(eq(questionImportJobs.id, jobId));
    }

    await db
      .update(questionImportJobs)
      .set({
        status: 'COMPLETED',
        processedRows: processed,
        successfulRows: successful,
        failedRows: failed,
        skippedRows: skipped,
        errorReport,
        summary: {
          totalRows: rows.length,
          successfulRows: successful,
          failedRows: failed,
          skippedRows: skipped,
        },
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(questionImportJobs.id, jobId));
  } catch (err: unknown) {
    await db
      .update(questionImportJobs)
      .set({
        status: 'FAILED',
        summary: { error: err instanceof Error ? err.message : 'Import job failed' },
        updatedAt: new Date(),
      })
      .where(eq(questionImportJobs.id, jobId));
  }
}

export async function registerAssessmentCenterRoutes(fastify: FastifyInstance) {
  // =========================================================================
  // 1. QUESTION MEDIA: IMAGE & AUDIO UPLOAD + STREAMING + SAFE DELETE
  // =========================================================================
  fastify.post('/api/v1/questions/media/upload-image', async (req, reply) => {
    const user = await authenticateRequest(req, reply);
    if (!user || !isInstructorOrAdmin(user)) {
      return sendError(reply, 403, 'FORBIDDEN', 'Hanya pengajar atau admin yang dapat mengunggah media soal.');
    }

    const file = await req.file();
    if (!file) {
      return sendError(reply, 400, 'FILE_REQUIRED', 'Berkas gambar wajib dipilih.');
    }

    const buffer = await file.toBuffer();
    if (buffer.length > 10 * 1024 * 1024) {
      return sendError(reply, 400, 'FILE_TOO_LARGE', 'Ukuran gambar maksimal 10 MB.');
    }

    const magic = validateImageMagicBytes(buffer);
    if (!magic.valid) {
      return sendError(reply, 400, 'INVALID_IMAGE_FORMAT', magic.error || 'Format gambar tidak valid.');
    }

    try {
      const id = crypto.randomUUID();
      const optimizedBuffer = await sharp(buffer)
        .rotate()
        .resize(1600, 1600, { fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 84 })
        .toBuffer();

      const meta = await sharp(optimizedBuffer).metadata();
      const thumbBuffer = await sharp(optimizedBuffer)
        .resize(400, 400, { fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 78 })
        .toBuffer();

      const objectKey = `question-media/images/${id}.webp`;
      const thumbnailKey = `question-media/images/${id}-thumb.webp`;
      writePrivateObjectBuffer(objectKey, optimizedBuffer);
      writePrivateObjectBuffer(thumbnailKey, thumbBuffer);

      return sendSuccess(reply, {
        mediaType: 'IMAGE',
        objectKey,
        thumbnailKey,
        mimeType: 'image/webp',
        fileSize: optimizedBuffer.length,
        width: meta.width || 0,
        height: meta.height || 0,
        originalName: file.filename || 'image',
        optimizedFilename: `${id}.webp`,
        url: `/api/v1/questions/media/stream?key=${encodeURIComponent(objectKey)}`,
        thumbnailUrl: `/api/v1/questions/media/stream?key=${encodeURIComponent(thumbnailKey)}`,
      });
    } catch {
      return sendError(reply, 500, 'IMAGE_PROCESSING_FAILED', 'Gagal mengoptimalkan gambar soal.');
    }
  });

  fastify.post('/api/v1/questions/media/upload-audio', async (req, reply) => {
    const user = await authenticateRequest(req, reply);
    if (!user || !isInstructorOrAdmin(user)) {
      return sendError(reply, 403, 'FORBIDDEN', 'Hanya pengajar atau admin yang dapat mengunggah audio soal.');
    }

    const file = await req.file();
    if (!file) {
      return sendError(reply, 400, 'FILE_REQUIRED', 'Berkas audio wajib dipilih.');
    }

    const ext = (file.filename?.split('.').pop() || '').toLowerCase();
    const resolvedMime = AUDIO_EXTENSIONS_MIME[ext];
    if (!resolvedMime) {
      return sendError(
        reply,
        400,
        'INVALID_AUDIO_FORMAT',
        'Format audio tidak didukung. Gunakan MP3, WAV, M4A, OGG, atau WebM.'
      );
    }

    const buffer = await file.toBuffer();
    if (buffer.length > 25 * 1024 * 1024) {
      return sendError(reply, 400, 'FILE_TOO_LARGE', 'Ukuran audio maksimal 25 MB.');
    }

    const id = crypto.randomUUID();
    const objectKey = `question-media/audio/${id}.${ext}`;
    writePrivateObjectBuffer(objectKey, buffer);

    return sendSuccess(reply, {
      mediaType: 'AUDIO',
      objectKey,
      mimeType: resolvedMime,
      fileSize: buffer.length,
      originalName: file.filename || `audio.${ext}`,
      optimizedFilename: `${id}.${ext}`,
      durationSeconds: null,
      url: `/api/v1/questions/media/stream?key=${encodeURIComponent(objectKey)}`,
    });
  });

  fastify.get('/api/v1/questions/media/stream', async (req, reply) => {
    const user = await authenticateRequest(req, reply);
    if (!user) return;

    const { key } = req.query as { key?: string };
    if (!key || !key.startsWith('question-media/')) {
      return sendError(reply, 400, 'INVALID_MEDIA_KEY', 'Kunci media tidak valid.');
    }

    const filePath = resolvePrivateObjectPath(key);
    if (!fs.existsSync(filePath)) {
      return sendError(reply, 404, 'MEDIA_NOT_FOUND', 'Berkas media tidak ditemukan.');
    }

    const stat = fs.statSync(filePath);
    const ext = key.split('.').pop()?.toLowerCase() || '';
    const contentType =
      ext === 'webp'
        ? 'image/webp'
        : AUDIO_EXTENSIONS_MIME[ext] || 'application/octet-stream';

    const range = req.headers.range;
    if (range && contentType.startsWith('audio/')) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
      const chunkSize = end - start + 1;
      reply.code(206).headers({
        'Content-Range': `bytes ${start}-${end}/${stat.size}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': String(chunkSize),
        'Content-Type': contentType,
      });
      return reply.send(fs.createReadStream(filePath, { start, end }));
    }

    reply.headers({
      'Content-Type': contentType,
      'Content-Length': String(stat.size),
      'Cache-Control': 'private, max-age=3600',
    });
    return reply.send(fs.createReadStream(filePath));
  });

  fastify.delete('/api/v1/questions/media/:mediaId', async (req, reply) => {
    const user = await authenticateRequest(req, reply);
    if (!user || !isInstructorOrAdmin(user)) {
      return sendError(reply, 403, 'FORBIDDEN', 'Akses ditolak.');
    }

    const { mediaId } = req.params as { mediaId: string };
    const [media] = await db.select().from(questionMedia).where(eq(questionMedia.id, mediaId));
    if (!media) {
      return sendError(reply, 404, 'MEDIA_NOT_FOUND', 'Media tidak ditemukan.');
    }

    await db.delete(questionMedia).where(eq(questionMedia.id, mediaId));

    // Only delete underlying object if no other questionMedia references it
    const [otherRefs] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(questionMedia)
      .where(eq(questionMedia.objectKey, media.objectKey));
    if ((otherRefs?.count || 0) === 0) {
      deletePrivateObject(media.objectKey);
      if (media.thumbnailKey) deletePrivateObject(media.thumbnailKey);
    }

    return sendSuccess(reply, { deleted: true });
  });

  // =========================================================================
  // 2. QUESTION REPOSITORY (BANK SOAL) & IMMUTABLE SNAPSHOT REUSE
  // =========================================================================
  fastify.get('/api/v1/question-repository', async (req, reply) => {
    const user = await authenticateRequest(req, reply);
    if (!user || !isInstructorOrAdmin(user)) {
      return sendError(reply, 403, 'FORBIDDEN', 'Hanya pengajar atau admin yang dapat mengakses Bank Soal.');
    }

    const {
      search,
      questionType,
      difficulty,
      learningOutcome,
      topic,
      sourceType,
      status,
      classroomId,
      authorId,
      page = '1',
      limit = '25',
    } = req.query as Record<string, string | undefined>;

    const p = Math.max(1, Number(page) || 1);
    const l = Math.min(100, Math.max(1, Number(limit) || 25));
    const offset = (p - 1) * l;

    const conditions = [];
    if (classroomId) conditions.push(eq(questions.classroomId, classroomId));
    if (questionType && questionType !== 'ALL') conditions.push(eq(questions.questionType, questionType));
    if (difficulty && difficulty !== 'ALL') conditions.push(eq(questions.difficulty, difficulty));
    if (learningOutcome?.trim()) {
      conditions.push(ilike(questions.learningOutcome, `%${learningOutcome.trim()}%`));
    }
    if (topic?.trim()) conditions.push(ilike(questions.topic, `%${topic.trim()}%`));
    if (sourceType && sourceType !== 'ALL') conditions.push(eq(questions.sourceType, sourceType));
    if (status && status !== 'ALL') conditions.push(eq(questions.status, status));
    if (authorId && authorId !== 'ALL') conditions.push(eq(questions.authorId, authorId));
    if (search?.trim()) {
      conditions.push(
        or(
          ilike(questions.promptText, `%${search.trim()}%`),
          ilike(questions.title, `%${search.trim()}%`),
          ilike(questions.questionCode, `%${search.trim()}%`)
        )!
      );
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
    const [countRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(questions)
      .where(whereClause);

    const rows = await db
      .select({
        question: questions,
        authorName: users.fullName,
      })
      .from(questions)
      .leftJoin(users, eq(questions.authorId, users.id))
      .where(whereClause)
      .orderBy(desc(questions.updatedAt))
      .limit(l)
      .offset(offset);

    const qIds = rows.map((r) => r.question.id);
    const opts =
      qIds.length > 0
        ? await db
            .select()
            .from(questionOptions)
            .where(inArray(questionOptions.questionId, qIds))
            .orderBy(asc(questionOptions.sortOrder))
        : [];
    const mediaList =
      qIds.length > 0
        ? await db.select().from(questionMedia).where(inArray(questionMedia.questionId, qIds))
        : [];

    const items = rows.map(({ question, authorName }) => ({
      ...question,
      authorName: authorName || 'Pengajar',
      options: opts.filter((o) => o.questionId === question.id),
      media: mediaList.filter((m) => m.questionId === question.id),
    }));

    const total = countRow?.count || 0;
    return sendSuccess(reply, {
      items,
      pagination: { page: p, limit: l, total, totalPages: Math.ceil(total / l) },
    });
  });

  fastify.patch('/api/v1/question-repository/:id/status', async (req, reply) => {
    const user = await authenticateRequest(req, reply);
    if (!user || !isInstructorOrAdmin(user)) {
      return sendError(reply, 403, 'FORBIDDEN', 'Akses ditolak.');
    }

    const { id } = req.params as { id: string };
    const parsed = z.object({ status: z.enum(['DRAFT', 'READY', 'ARCHIVED']) }).safeParse(req.body);
    if (!parsed.success) {
      return sendError(reply, 400, 'VALIDATION_ERROR', 'Status soal tidak valid.');
    }

    const [existing] = await db.select().from(questions).where(eq(questions.id, id));
    if (!existing) {
      return sendError(reply, 404, 'QUESTION_NOT_FOUND', 'Soal tidak ditemukan.');
    }
    if (!isSuperadmin(user) && existing.authorId !== user.id) {
      return sendError(
        reply,
        403,
        'FORBIDDEN_OWNERSHIP',
        'Anda tidak berhak mengubah status soal milik pengajar lain.'
      );
    }

    const [updated] = await db
      .update(questions)
      .set({ status: parsed.data.status, updatedAt: new Date() })
      .where(eq(questions.id, id))
      .returning();

    return sendSuccess(reply, updated);
  });

  fastify.post('/api/v1/assessments/:id/import-from-repository', async (req, reply) => {
    const user = await authenticateRequest(req, reply);
    if (!user || !isInstructorOrAdmin(user)) {
      return sendError(reply, 403, 'FORBIDDEN', 'Akses ditolak.');
    }

    const { id: assessmentId } = req.params as { id: string };
    const [asm] = await db.select().from(assessments).where(eq(assessments.id, assessmentId));
    if (!asm) {
      return sendError(reply, 404, 'ASSESSMENT_NOT_FOUND', 'Evaluasi tidak ditemukan.');
    }

    const roleInfo = await resolveClassroomRole(user, asm.classroomId);
    if (roleInfo.role === 'STUDENT') {
      return sendError(reply, 403, 'FORBIDDEN', 'Akses ditolak.');
    }

    const parsed = z
      .object({
        questionIds: z.array(z.string().uuid()).min(1).max(200),
      })
      .safeParse(req.body);
    if (!parsed.success) {
      return sendError(reply, 400, 'VALIDATION_ERROR', 'Daftar ID soal tidak valid.');
    }

    const existingItems = await db
      .select({ questionId: assessmentQuestions.questionId, sortOrder: assessmentQuestions.sortOrder })
      .from(assessmentQuestions)
      .where(eq(assessmentQuestions.assessmentId, assessmentId));
    const existingSet = new Set(existingItems.map((e) => e.questionId));
    let nextOrder =
      existingItems.reduce((max, e) => Math.max(max, e.sortOrder || 0), 0) + 1;

    const added: Array<{ id: string; questionId: string }> = [];
    for (const qId of parsed.data.questionIds) {
      if (existingSet.has(qId)) continue;
      const snapshot = await buildQuestionSnapshot(qId);
      if (!snapshot) continue;

      const [inserted] = await db
        .insert(assessmentQuestions)
        .values({
          assessmentId,
          questionId: qId,
          sortOrder: nextOrder++,
          questionSnapshot: snapshot,
          sourceVersionNumber: snapshot.versionNumber,
        })
        .returning();
      added.push({ id: inserted.id, questionId: qId });

      const [qRow] = await db.select().from(questions).where(eq(questions.id, qId));
      if (qRow) {
        const prevUsage = Array.isArray(qRow.usageHistory) ? qRow.usageHistory : [];
        await db
          .update(questions)
          .set({
            usageCount: qRow.usageCount + 1,
            usageHistory: [
              ...prevUsage,
              {
                assessmentId,
                assessmentTitle: asm.title,
                addedBy: user.id,
                addedAt: new Date().toISOString(),
              },
            ],
          })
          .where(eq(questions.id, qId));
      }
    }

    return sendSuccess(reply, { importedCount: added.length, added });
  });

  fastify.post('/api/v1/assessments/:id/sync-question-snapshots', async (req, reply) => {
    const user = await authenticateRequest(req, reply);
    if (!user || !isInstructorOrAdmin(user)) {
      return sendError(reply, 403, 'FORBIDDEN', 'Akses ditolak.');
    }

    const { id: assessmentId } = req.params as { id: string };
    const [asm] = await db.select().from(assessments).where(eq(assessments.id, assessmentId));
    if (!asm) {
      return sendError(reply, 404, 'ASSESSMENT_NOT_FOUND', 'Evaluasi tidak ditemukan.');
    }
    if (asm.status !== 'DRAFT') {
      return sendError(
        reply,
        409,
        'IMMUTABLE_PUBLISHED_ASSESSMENT',
        'Snapshot soal pada evaluasi yang sudah diterbitkan bersifat permanen dan tidak dapat ditimpa.'
      );
    }

    const items = await db
      .select()
      .from(assessmentQuestions)
      .where(eq(assessmentQuestions.assessmentId, assessmentId));

    let synced = 0;
    for (const item of items) {
      const snap = await buildQuestionSnapshot(item.questionId);
      if (snap) {
        await db
          .update(assessmentQuestions)
          .set({
            questionSnapshot: snap,
            sourceVersionNumber: snap.versionNumber,
          })
          .where(eq(assessmentQuestions.id, item.id));
        synced++;
      }
    }

    return sendSuccess(reply, { syncedCount: synced });
  });

  // =========================================================================
  // 3. EXCEL / CSV IMPORT CENTER (TEMPLATES, PREVIEW, BACKGROUND JOBS)
  // =========================================================================
  fastify.get('/api/v1/question-imports/templates/xlsx', async (req, reply) => {
    const user = await authenticateRequest(req, reply);
    if (!user || !isInstructorOrAdmin(user)) {
      return sendError(reply, 403, 'FORBIDDEN', 'Akses ditolak.');
    }

    const wb = XLSX.utils.book_new();
    const petunjuk = [
      ['PETUNJUK IMPORT SOAL — POLITEKNIK KAMPAR LMS'],
      ['1. Jangan mengubah nama worksheet: Petunjuk, Soal, Opsi_Jawaban, Rubrik.'],
      ['2. Gunakan external_question_id yang unik (contoh: Q001, Q002) untuk menghubungkan Soal dengan Opsi_Jawaban dan Rubrik.'],
      ['3. Tipe Soal Valid: SINGLE_CHOICE, MULTIPLE_SELECT, TRUE_FALSE, MATCHING, ORDERING, FILL_IN_BLANK, SHORT_ANSWER, NUMERIC, NUMERIC_TOLERANCE, ESSAY_SHORT, ESSAY_LONG, CASE_STUDY, ANALYTICAL_RESPONSE, PROBLEM_SOLVING, ALGORITHM_CODE, DOCUMENT_BASED_RESPONSE.'],
      ['4. Tingkat Kesulitan Valid: EASY, MEDIUM, HARD.'],
    ];
    const soal = [
      ['external_question_id', 'question_type', 'question_text', 'topic', 'cpmk', 'difficulty', 'default_score', 'explanation', 'answer_key', 'tags'],
      ['Q001', 'SINGLE_CHOICE', 'Protokol apa yang digunakan untuk transfer halaman web terenkripsi?', 'Jaringan Komputer', 'CPMK-1', 'EASY', 10, 'HTTPS menggunakan TLS di atas HTTP.', 'B', 'jaringan,keamanan'],
      ['Q002', 'ESSAY_LONG', 'Jelaskan perbedaan arsitektur monolitik dan microservices dalam konteks skalabilitas.', 'Rekayasa Perangkat Lunak', 'CPMK-3', 'HARD', 25, 'Bahas decoupling, deployment independen, dan konsistensi data.', '', 'arsitektur,rpl'],
    ];
    const opsi = [
      ['external_question_id', 'option_code', 'option_text', 'is_correct', 'option_order'],
      ['Q001', 'A', 'FTP', 'false', 1],
      ['Q001', 'B', 'HTTPS', 'true', 2],
      ['Q001', 'C', 'SMTP', 'false', 3],
      ['Q001', 'D', 'Telnet', 'false', 4],
    ];
    const rubrik = [
      ['external_question_id', 'criterion', 'description', 'maximum_score', 'weight'],
      ['Q002', 'Ketepatan Konsep', 'Menjelaskan definisi dan perbandingan secara akurat', 15, 60],
      ['Q002', 'Studi Kasus & Contoh', 'Memberikan contoh implementasi nyata yang relevan', 10, 40],
    ];

    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(petunjuk), 'Petunjuk');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(soal), 'Soal');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(opsi), 'Opsi_Jawaban');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rubrik), 'Rubrik');

    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
    reply.headers({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="template_import_soal_polkam.xlsx"',
    });
    return reply.send(buf);
  });

  fastify.get('/api/v1/question-imports/templates/csv', async (req, reply) => {
    const user = await authenticateRequest(req, reply);
    if (!user || !isInstructorOrAdmin(user)) {
      return sendError(reply, 403, 'FORBIDDEN', 'Akses ditolak.');
    }

    const csvLines = [
      'external_question_id,question_type,question_text,topic,cpmk,difficulty,default_score,option_a,option_b,option_c,option_d,option_e,correct_answers,explanation',
      'Q001,SINGLE_CHOICE,"Apa kepanjangan dari SQL?",Basis Data,CPMK-1,EASY,10,"Structured Query Language","Simple Query Language","Sequential Query Logic","System Query Language",,A,"SQL adalah bahasa standar basis data relasional."',
      'Q002,MULTIPLE_SELECT,"Pilih dua database NoSQL populer:",Basis Data,CPMK-2,MEDIUM,15,"PostgreSQL","MongoDB","Redis","MySQL",,"B,C","MongoDB dan Redis adalah database NoSQL."',
    ].join('\n');

    reply.headers({
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="template_import_soal_polkam.csv"',
    });
    return reply.send(`\uFEFF${csvLines}`);
  });

  fastify.post('/api/v1/question-imports/preview', async (req, reply) => {
    const user = await authenticateRequest(req, reply);
    if (!user || !isInstructorOrAdmin(user)) {
      return sendError(reply, 403, 'FORBIDDEN', 'Akses ditolak.');
    }

    const file = await req.file();
    if (!file) {
      return sendError(reply, 400, 'FILE_REQUIRED', 'Berkas XLSX atau CSV wajib diunggah.');
    }

    const filename = file.filename || 'import.csv';
    const ext = filename.split('.').pop()?.toLowerCase() || '';
    const buffer = await file.toBuffer();
    const fingerprint = crypto.createHash('sha256').update(buffer).digest('hex');

    let detectedFormat: 'XLSX' | 'CSV' = 'CSV';
    let delimiter: ',' | ';' = ',';
    let rawRows: Array<Record<string, unknown>> = [];
    const optionsByExtId = new Map<string, Array<Record<string, unknown>>>();
    const rubricByExtId = new Map<string, Array<Record<string, unknown>>>();
    let isMultiSheet = false;

    if (ext === 'xlsx' || ext === 'xls') {
      detectedFormat = 'XLSX';
      const wb = XLSX.read(buffer, { type: 'buffer' });
      const soalSheetName = wb.SheetNames.find((n) => n.toLowerCase() === 'soal') || wb.SheetNames[0];
      const soalSheet = wb.Sheets[soalSheetName];
      rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(soalSheet, { defval: '' });

      const opsiSheetName = wb.SheetNames.find((n) => n.toLowerCase() === 'opsi_jawaban');
      if (opsiSheetName) {
        isMultiSheet = true;
        const opsiRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(
          wb.Sheets[opsiSheetName],
          { defval: '' }
        );
        for (const r of opsiRows) {
          const eid = String(r.external_question_id || '').trim();
          if (eid) {
            if (!optionsByExtId.has(eid)) optionsByExtId.set(eid, []);
            optionsByExtId.get(eid)!.push(r);
          }
        }
      }

      const rubrikSheetName = wb.SheetNames.find((n) => n.toLowerCase() === 'rubrik');
      if (rubrikSheetName) {
        const rubRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(
          wb.Sheets[rubrikSheetName],
          { defval: '' }
        );
        for (const r of rubRows) {
          const eid = String(r.external_question_id || '').trim();
          if (eid) {
            if (!rubricByExtId.has(eid)) rubricByExtId.set(eid, []);
            rubricByExtId.get(eid)!.push(r);
          }
        }
      }
    } else if (ext === 'csv') {
      detectedFormat = 'CSV';
      const parsedCsv = parseCsvText(buffer.toString('utf-8'));
      delimiter = parsedCsv.delimiter;
      rawRows = parsedCsv.rows;
    } else {
      return sendError(
        reply,
        400,
        'UNSUPPORTED_FORMAT',
        'Format berkas tidak didukung. Gunakan .xlsx atau .csv.'
      );
    }

    const { validRows, errors } = validateAndNormalizeImportRows(
      rawRows,
      optionsByExtId,
      rubricByExtId,
      isMultiSheet
    );

    const columns = rawRows[0] ? Object.keys(rawRows[0]) : [];
    return sendSuccess(reply, {
      filename,
      detectedFormat,
      delimiter,
      fingerprint,
      columns,
      totalRows: rawRows.length,
      validCount: validRows.length,
      invalidCount: errors.length,
      previewRows: validRows.slice(0, 25),
      validRows,
      validationErrors: errors,
    });
  });

  fastify.post('/api/v1/question-imports/jobs', async (req, reply) => {
    const user = await authenticateRequest(req, reply);
    if (!user || !isInstructorOrAdmin(user)) {
      return sendError(reply, 403, 'FORBIDDEN', 'Akses ditolak.');
    }

    const parsed = z
      .object({
        classroomId: z.string().uuid().nullable().optional(),
        assessmentId: z.string().uuid().nullable().optional(),
        filename: z.string().min(1),
        fileFormat: z.enum(['XLSX', 'CSV']),
        importMode: z
          .enum(['INSERT_ONLY', 'SKIP_DUPLICATES', 'UPDATE_OWNED_QUESTIONS'])
          .default('SKIP_DUPLICATES'),
        fingerprint: z.string().min(8),
        batchSize: z.number().int().min(10).max(250).default(100),
        rows: z.array(z.any()).min(1).max(5000),
      })
      .safeParse(req.body);

    if (!parsed.success) {
      return sendError(
        reply,
        400,
        'VALIDATION_ERROR',
        'Data import job tidak valid.',
        parsed.error.issues
      );
    }

    const d = parsed.data;
    const [job] = await db
      .insert(questionImportJobs)
      .values({
        classroomId: d.classroomId || null,
        assessmentId: d.assessmentId || null,
        uploadedById: user.id,
        filename: d.filename,
        fileFormat: d.fileFormat,
        importMode: d.importMode,
        fingerprint: d.fingerprint,
        status: 'PENDING',
        batchSize: d.batchSize,
        totalRows: d.rows.length,
        payloadRows: d.rows,
      })
      .returning();

    setImmediate(() => {
      void processImportJobAsync(job.id);
    });

    return sendSuccess(
      reply,
      {
        jobId: job.id,
        status: job.status,
        totalRows: job.totalRows,
        batchSize: job.batchSize,
      },
      null,
      202
    );
  });

  fastify.get('/api/v1/question-imports/jobs', async (req, reply) => {
    const user = await authenticateRequest(req, reply);
    if (!user || !isInstructorOrAdmin(user)) {
      return sendError(reply, 403, 'FORBIDDEN', 'Akses ditolak.');
    }

    const jobs = await db
      .select({
        id: questionImportJobs.id,
        filename: questionImportJobs.filename,
        fileFormat: questionImportJobs.fileFormat,
        importMode: questionImportJobs.importMode,
        status: questionImportJobs.status,
        batchSize: questionImportJobs.batchSize,
        totalRows: questionImportJobs.totalRows,
        processedRows: questionImportJobs.processedRows,
        successfulRows: questionImportJobs.successfulRows,
        failedRows: questionImportJobs.failedRows,
        skippedRows: questionImportJobs.skippedRows,
        createdAt: questionImportJobs.createdAt,
        completedAt: questionImportJobs.completedAt,
      })
      .from(questionImportJobs)
      .where(eq(questionImportJobs.uploadedById, user.id))
      .orderBy(desc(questionImportJobs.createdAt))
      .limit(20);

    return sendSuccess(reply, { jobs });
  });

  fastify.get('/api/v1/question-imports/jobs/:jobId', async (req, reply) => {
    const user = await authenticateRequest(req, reply);
    if (!user || !isInstructorOrAdmin(user)) {
      return sendError(reply, 403, 'FORBIDDEN', 'Akses ditolak.');
    }

    const { jobId } = req.params as { jobId: string };
    const [job] = await db
      .select()
      .from(questionImportJobs)
      .where(eq(questionImportJobs.id, jobId));
    if (!job) {
      return sendError(reply, 404, 'JOB_NOT_FOUND', 'Import job tidak ditemukan.');
    }
    if (!isSuperadmin(user) && job.uploadedById !== user.id) {
      return sendError(reply, 403, 'FORBIDDEN', 'Akses ditolak.');
    }

    const errors = await db
      .select()
      .from(questionImportErrors)
      .where(eq(questionImportErrors.jobId, jobId))
      .orderBy(asc(questionImportErrors.rowNumber))
      .limit(200);

    return sendSuccess(reply, {
      id: job.id,
      filename: job.filename,
      fileFormat: job.fileFormat,
      importMode: job.importMode,
      status: job.status,
      batchSize: job.batchSize,
      totalRows: job.totalRows,
      processedRows: job.processedRows,
      successfulRows: job.successfulRows,
      failedRows: job.failedRows,
      skippedRows: job.skippedRows,
      errorReport: job.errorReport,
      errors,
      summary: job.summary,
      createdAt: job.createdAt,
      completedAt: job.completedAt,
    });
  });

  fastify.post('/api/v1/question-imports/jobs/:jobId/retry', async (req, reply) => {
    const user = await authenticateRequest(req, reply);
    if (!user || !isInstructorOrAdmin(user)) {
      return sendError(reply, 403, 'FORBIDDEN', 'Akses ditolak.');
    }

    const { jobId } = req.params as { jobId: string };
    const [job] = await db
      .select()
      .from(questionImportJobs)
      .where(eq(questionImportJobs.id, jobId));
    if (!job) {
      return sendError(reply, 404, 'JOB_NOT_FOUND', 'Import job tidak ditemukan.');
    }
    if (!isSuperadmin(user) && job.uploadedById !== user.id) {
      return sendError(reply, 403, 'FORBIDDEN', 'Akses ditolak.');
    }

    await db
      .update(questionImportJobs)
      .set({
        status: 'PENDING',
        importMode: 'SKIP_DUPLICATES',
        updatedAt: new Date(),
      })
      .where(eq(questionImportJobs.id, jobId));

    setImmediate(() => {
      void processImportJobAsync(jobId);
    });

    return sendSuccess(reply, { jobId, status: 'PENDING' });
  });

  fastify.post('/api/v1/question-imports/jobs/:jobId/cancel', async (req, reply) => {
    const user = await authenticateRequest(req, reply);
    if (!user || !isInstructorOrAdmin(user)) {
      return sendError(reply, 403, 'FORBIDDEN', 'Akses ditolak.');
    }

    const { jobId } = req.params as { jobId: string };
    const [job] = await db
      .select()
      .from(questionImportJobs)
      .where(eq(questionImportJobs.id, jobId));
    if (!job) {
      return sendError(reply, 404, 'JOB_NOT_FOUND', 'Import job tidak ditemukan.');
    }
    if (!isSuperadmin(user) && job.uploadedById !== user.id) {
      return sendError(reply, 403, 'FORBIDDEN', 'Akses ditolak.');
    }

    const [updated] = await db
      .update(questionImportJobs)
      .set({ status: 'CANCELLED', updatedAt: new Date() })
      .where(eq(questionImportJobs.id, jobId))
      .returning();

    return sendSuccess(reply, { jobId: updated.id, status: updated.status });
  });

  // =========================================================================
  // 4. ASSESSMENT AUDIT HISTORY
  // =========================================================================
  fastify.get('/api/v1/assessments/:id/history', async (req, reply) => {
    const user = await authenticateRequest(req, reply);
    if (!user || !isInstructorOrAdmin(user)) {
      return sendError(reply, 403, 'FORBIDDEN', 'Akses ditolak.');
    }

    const { id: assessmentId } = req.params as { id: string };
    const [asm] = await db.select().from(assessments).where(eq(assessments.id, assessmentId));
    if (!asm) {
      return sendError(reply, 404, 'ASSESSMENT_NOT_FOUND', 'Evaluasi tidak ditemukan.');
    }

    const logs = await db
      .select({
        id: classroomAuditLogs.id,
        action: classroomAuditLogs.action,
        resourceType: classroomAuditLogs.resourceType,
        resourceTitle: classroomAuditLogs.resourceTitle,
        actorRole: classroomAuditLogs.actorRole,
        changeSummary: classroomAuditLogs.changeSummary,
        beforeValue: classroomAuditLogs.beforeValue,
        afterValue: classroomAuditLogs.afterValue,
        createdAt: classroomAuditLogs.createdAt,
        actorName: users.fullName,
      })
      .from(classroomAuditLogs)
      .leftJoin(users, eq(classroomAuditLogs.actorId, users.id))
      .where(
        and(
          eq(classroomAuditLogs.classroomId, asm.classroomId),
          eq(classroomAuditLogs.resourceType, 'ASSESSMENT'),
          eq(classroomAuditLogs.resourceId, assessmentId)
        )
      )
      .orderBy(desc(classroomAuditLogs.createdAt))
      .limit(50);

    const events = await db
      .select({
        id: assessmentEvents.id,
        eventType: assessmentEvents.eventType,
        metadata: assessmentEvents.metadata,
        createdAt: assessmentEvents.createdAt,
        actorName: users.fullName,
      })
      .from(assessmentEvents)
      .leftJoin(users, eq(assessmentEvents.actorId, users.id))
      .where(eq(assessmentEvents.assessmentId, assessmentId))
      .orderBy(desc(assessmentEvents.createdAt))
      .limit(50);

    return sendSuccess(reply, { auditLogs: logs, recentEvents: events });
  });
}
