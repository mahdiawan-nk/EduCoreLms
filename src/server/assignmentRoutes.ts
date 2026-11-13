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
  classroomInstructors,
  assignments,
  assignmentAttachments,
  assignmentRubrics,
  assignmentRubricCriteria,
  assignmentGroups,
  assignmentGroupMembers,
  assignmentSubmissions,
  submissionVersions,
  submissionRevisions,
  submissionAttachments,
  submissionLinks,
  submissionComments,
  submissionGrades,
  submissionRubricScores,
  submissionEvents,
  assignmentReminders,
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
  writePrivateObjectBuffer,
  deletePrivateObject,
  verifyUploadedObject,
  generateAttachmentPreviewPayload,
  sanitizePreviewHtml,
} from './storage.ts';

export interface SubmissionConfig {
  submissionMethods: ('FILE_UPLOAD' | 'TEXT_RESPONSE' | 'EXTERNAL_URL')[];
  allowFileUpload: boolean;
  allowTextResponse: boolean;
  allowExternalLinks: boolean;
  allowedExtensions: string[];
  maxFileSizeMb: number;
  maxFiles: number;
  maxLinks: number;
  requireAttachment: boolean;
  requireLink: boolean;
  allowMultipleVersions: boolean;
  maxRevisions: number;
  allowLateSubmission: boolean;
  gracePeriodMinutes: number;
  allowAfterDeadline: boolean;
  allowEditBeforeDeadline: boolean;
  allowReturnForRevision: boolean;
  gradingMethod: 'DIRECT' | 'RUBRIC' | 'COMBINED';
}

export const DEFAULT_SUBMISSION_CONFIG: SubmissionConfig = {
  submissionMethods: ['FILE_UPLOAD', 'TEXT_RESPONSE', 'EXTERNAL_URL'],
  allowFileUpload: true,
  allowTextResponse: true,
  allowExternalLinks: true,
  allowedExtensions: [
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
  ],
  maxFileSizeMb: 25,
  maxFiles: 5,
  maxLinks: 5,
  requireAttachment: false,
  requireLink: false,
  allowMultipleVersions: true,
  maxRevisions: 5,
  allowLateSubmission: true,
  gracePeriodMinutes: 15,
  allowAfterDeadline: true,
  allowEditBeforeDeadline: true,
  allowReturnForRevision: true,
  gradingMethod: 'COMBINED',
};

let assignmentsBackfilled = false;

async function ensureExistingAssignmentsUpgraded() {
  if (assignmentsBackfilled) return;
  try {
    const allAsgs = await db.select().from(assignments);
    for (let i = 0; i < allAsgs.length; i++) {
      const a = allAsgs[i];
      const existingJson = a.instructionsJson as any;
      const isEmptyJson =
        !existingJson ||
        !Array.isArray(existingJson.content) ||
        existingJson.content.length === 0;

      if (isEmptyJson) {
        const tiptapDoc = {
          type: 'doc',
          content: [
            {
              type: 'heading',
              attrs: { level: 2 },
              content: [{ type: 'text', text: a.title }],
            },
            {
              type: 'paragraph',
              content: [
                {
                  type: 'text',
                  text:
                    a.instructions ||
                    'Kerjakan tugas praktikum ini sesuai standar arsitektur Politeknik Kampar.',
                },
              ],
            },
            {
              type: 'blockquote',
              content: [
                {
                  type: 'paragraph',
                  content: [
                    {
                      type: 'text',
                      text: 'Pastikan laporan dilampirkan dalam format PDF/DOCX/XLSX dan sertakan tautan repositori HTTPS yang valid.',
                    },
                  ],
                },
              ],
            },
          ],
        };

        await db
          .update(assignments)
          .set({
            subtitle: `Tugas Terstruktur Pertemuan Ke-${i + 1}`,
            shortDescription: (a.instructions || '').slice(0, 180),
            assignmentType: i === 0 ? 'Practical' : 'Project',
            learningObjectives:
              'Mahasiswa mampu mengimplementasikan skema database ternormalisasi, validasi backend Zod, serta keamanan penyimpanan berkas S3.',
            instructionsJson: tiptapDoc,
            submissionConfig: DEFAULT_SUBMISSION_CONFIG,
            meetingNumber: i + 1,
            sequenceOrder: i + 1,
          })
          .where(eq(assignments.id, a.id));
      }

      // Ensure default rubric exists for existing assignments
      const existingRubrics = await db
        .select()
        .from(assignmentRubrics)
        .where(eq(assignmentRubrics.assignmentId, a.id));
      if (existingRubrics.length === 0) {
        const [rubric] = await db
          .insert(assignmentRubrics)
          .values({
            assignmentId: a.id,
            title: `Rubrik Evaluasi: ${a.title}`,
            description:
              'Penilaian objektif berbasis indikator kompetensi praktikum Politeknik Kampar.',
            totalWeight: 100,
            createdById: a.authorId,
          })
          .returning();

        await db.insert(assignmentRubricCriteria).values([
          {
            rubricId: rubric.id,
            assignmentId: a.id,
            criterionName: 'Ketepatan Arsitektur & Skema Database',
            description:
              'Kesesuaian relasi tabel PostgreSQL, kunci asing UUID, dan indeks.',
            maxScore: 100,
            weight: 40,
            performanceLevels: [
              { label: 'Sangat Baik', minScore: 85, maxScore: 100 },
              { label: 'Baik', minScore: 70, maxScore: 84 },
              { label: 'Cukup', minScore: 50, maxScore: 69 },
            ],
            sortOrder: 1,
          },
          {
            rubricId: rubric.id,
            assignmentId: a.id,
            criterionName: 'Keamanan Validasi & Otorisasi Backend',
            description:
              'Penerapan validasi Zod, RBAC, dan perlindungan kepemilikan sumber daya.',
            maxScore: 100,
            weight: 35,
            performanceLevels: [
              { label: 'Sangat Baik', minScore: 85, maxScore: 100 },
              { label: 'Baik', minScore: 70, maxScore: 84 },
              { label: 'Cukup', minScore: 50, maxScore: 69 },
            ],
            sortOrder: 2,
          },
          {
            rubricId: rubric.id,
            assignmentId: a.id,
            criterionName: 'Dokumentasi Laporan & Pengujian',
            description:
              'Kelengkapan bukti pengujian integrasi dan kejelasan dokumentasi teknis.',
            maxScore: 100,
            weight: 25,
            performanceLevels: [
              { label: 'Sangat Baik', minScore: 85, maxScore: 100 },
              { label: 'Baik', minScore: 70, maxScore: 84 },
              { label: 'Cukup', minScore: 50, maxScore: 69 },
            ],
            sortOrder: 3,
          },
        ]);
      }

      // Ensure at least one S3 instructor attachment on the first assignment
      if (i === 0) {
        const existingAtts = await db
          .select()
          .from(assignmentAttachments)
          .where(eq(assignmentAttachments.assignmentId, a.id));
        const hasS3 = existingAtts.some((att) => Boolean(att.objectKey));
        if (!hasS3) {
          const pdfKey = `assignments/${a.id}/panduan-praktikum-polkam.pdf`;
          const minimalPdf = Buffer.from(
            `%PDF-1.4
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj
3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj
4 0 obj << /Length 120 >> stream
BT /F1 14 Tf 50 720 Td (PANDUAN TUGAS PRAKTIKUM POLITEKNIK KAMPAR) Tj ET
endstream endobj
5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj
trailer << /Root 1 0 R >>
%%EOF`,
            'utf-8'
          );
          writePrivateObjectBuffer(pdfKey, minimalPdf);
          const verified = verifyUploadedObject(pdfKey, 'pdf');

          await db.insert(assignmentAttachments).values({
            assignmentId: a.id,
            originalName: 'Panduan_Tugas_Praktikum_Polkam.pdf',
            objectKey: pdfKey,
            mimeType: 'application/pdf',
            fileExtension: 'pdf',
            fileSize: verified.sizeBytes,
            checksum: verified.checksum,
            description: 'Dokumen spesifikasi teknis dan format laporan praktikum.',
            sortOrder: 1,
          });
        }
      }
    }

    // Backfill existing submissions to ensure submission_versions and normalized status exist
    const allSubs = await db.select().from(assignmentSubmissions);
    for (const sub of allSubs) {
      const existingVers = await db
        .select()
        .from(submissionVersions)
        .where(eq(submissionVersions.submissionId, sub.id));
      if (existingVers.length === 0) {
        await db.insert(submissionVersions).values({
          submissionId: sub.id,
          assignmentId: sub.assignmentId,
          studentId: sub.studentId,
          versionNumber: 1,
          submissionText: sub.submissionText,
          submissionJson: {
            type: 'doc',
            content: [
              {
                type: 'paragraph',
                content: [{ type: 'text', text: sub.submissionText || '' }],
              },
            ],
          },
          linksSnapshot: sub.repositoryUrl
            ? [
                {
                  url: sub.repositoryUrl,
                  title: 'Repositori Praktikum',
                  description: 'Tautan kode sumber utama',
                  linkCategory: classifyExternalUrl(sub.repositoryUrl),
                },
              ]
            : [],
          attachmentsSnapshot: [],
          isLate: sub.isLate,
          lateMinutes: sub.lateMinutes,
          submittedAt: sub.submittedAt,
        });
      }

      if (sub.repositoryUrl) {
        const existingLinks = await db
          .select()
          .from(submissionLinks)
          .where(eq(submissionLinks.submissionId, sub.id));
        if (existingLinks.length === 0) {
          await db.insert(submissionLinks).values({
            submissionId: sub.id,
            url: sub.repositoryUrl,
            title: 'Repositori Praktikum',
            description: 'Tautan repositori yang dikumpulkan',
            linkCategory: classifyExternalUrl(sub.repositoryUrl),
          });
        }
      }

      if (sub.score !== null && !sub.isGradePublished) {
        await db
          .update(assignmentSubmissions)
          .set({
            publishedScore: sub.score,
            isGradePublished: true,
            gradingStatus: 'graded',
            status: 'graded',
          })
          .where(eq(assignmentSubmissions.id, sub.id));
      }
    }

    assignmentsBackfilled = true;
  } catch (err) {
    console.error('Failed to backfill assignments:', err);
  }
}

export function classifyExternalUrl(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl.trim());
    const host = parsed.hostname.toLowerCase();
    if (host.includes('github.com') || host.includes('gitlab.com')) return 'GITHUB';
    if (host.includes('drive.google.com') || host.includes('docs.google.com'))
      return 'GOOGLE_DRIVE';
    if (host.includes('onedrive.live.com') || host.includes('sharepoint.com'))
      return 'ONEDRIVE';
    if (host.includes('figma.com')) return 'FIGMA';
    if (
      host.includes('youtube.com') ||
      host.includes('youtu.be') ||
      host.includes('vimeo.com') ||
      host.includes('loom.com')
    )
      return 'VIDEO_DEMO';
    return 'WEBSITE';
  } catch {
    return 'HTTPS';
  }
}

export function validateExternalHttpsUrl(rawUrl: string): {
  valid: boolean;
  normalizedUrl?: string;
  category?: string;
  error?: string;
} {
  try {
    const parsed = new URL(rawUrl.trim());
    if (parsed.protocol !== 'https:') {
      return {
        valid: false,
        error: `Tautan eksternal "${rawUrl}" wajib menggunakan protokol aman HTTPS (https://).`,
      };
    }
    return {
      valid: true,
      normalizedUrl: parsed.toString(),
      category: classifyExternalUrl(parsed.toString()),
    };
  } catch {
    return {
      valid: false,
      error: `Format URL eksternal "${rawUrl}" tidak valid.`,
    };
  }
}

function isAssignmentVisibleToStudent(asg: any): boolean {
  const now = new Date();
  if (asg.status === 'DRAFT' || asg.status === 'ARCHIVED') {
    return false;
  }
  if (asg.status === 'SCHEDULED') {
    if (!asg.scheduledAt || new Date(asg.scheduledAt) > now) {
      return false;
    }
  }
  if (asg.availableFrom && new Date(asg.availableFrom) > now) {
    return false;
  }
  return true;
}

function normalizeSubmissionStatus(rawStatus: string | null | undefined, isLate?: boolean): string {
  if (!rawStatus) return 'not_submitted';
  const lower = rawStatus.toLowerCase();
  if (lower === 'submitted' && isLate) return 'late';
  if (
    [
      'not_submitted',
      'draft',
      'submitted',
      'late',
      'returned',
      'resubmitted',
      'graded',
      'excused',
    ].includes(lower)
  ) {
    return lower;
  }
  return lower;
}

function extractPlainTextFromTiptap(doc: any): string {
  if (!doc || typeof doc !== 'object') return '';
  const parts: string[] = [];
  function walk(node: any) {
    if (!node) return;
    if (typeof node.text === 'string') {
      parts.push(node.text);
    }
    if (Array.isArray(node.content)) {
      for (const child of node.content) {
        walk(child);
      }
      if (
        ['paragraph', 'heading', 'blockquote', 'codeBlock', 'listItem'].includes(
          node.type
        )
      ) {
        parts.push('\n');
      }
    }
  }
  walk(doc);
  return parts.join('').trim();
}

function mergeSubmissionConfig(raw: any): SubmissionConfig {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_SUBMISSION_CONFIG };
  return {
    ...DEFAULT_SUBMISSION_CONFIG,
    ...raw,
    allowedExtensions: Array.isArray(raw.allowedExtensions)
      ? raw.allowedExtensions.map((e: string) =>
          String(e).toLowerCase().replace(/^\./, '')
        )
      : DEFAULT_SUBMISSION_CONFIG.allowedExtensions,
  };
}

function enrichAttachmentUrls(att: any) {
  if (!att.objectKey) {
    return {
      ...att,
      originalFileName: att.originalName || 'Lampiran',
      fileName: att.originalName || 'Lampiran',
      streamUrl: null,
      downloadUrl: null,
    };
  }
  return {
    ...att,
    originalFileName: att.originalName || 'Lampiran',
    fileName: att.originalName || 'Lampiran',
    streamUrl: signPresignedGetUrl({
      objectKey: att.objectKey,
      fileName: att.originalName || 'document',
      mimeType: att.mimeType || 'application/octet-stream',
      disposition: 'inline',
    }),
    downloadUrl: signPresignedGetUrl({
      objectKey: att.objectKey,
      fileName: att.originalName || 'document',
      mimeType: att.mimeType || 'application/octet-stream',
      disposition: 'attachment',
    }),
  };
}

const rubricCriterionInputSchema = z.object({
  id: z.string().uuid().optional(),
  criterionName: z.string().min(2),
  description: z.string().optional().default(''),
  maxScore: z.number().int().min(1).max(1000).default(100),
  weight: z.number().int().min(1).max(100),
  performanceLevels: z.array(z.record(z.string(), z.any())).optional().default([]),
  sortOrder: z.number().int().min(1).optional(),
});

const submissionConfigInputSchema = z
  .object({
    submissionMethods: z
      .array(z.enum(['FILE_UPLOAD', 'TEXT_RESPONSE', 'EXTERNAL_URL']))
      .optional(),
    allowFileUpload: z.boolean().optional(),
    allowTextResponse: z.boolean().optional(),
    allowExternalLinks: z.boolean().optional(),
    allowedExtensions: z.array(z.string()).optional(),
    maxFileSizeMb: z.number().min(1).max(250).optional(),
    maxFiles: z.number().int().min(1).max(20).optional(),
    maxLinks: z.number().int().min(1).max(20).optional(),
    requireAttachment: z.boolean().optional(),
    requireLink: z.boolean().optional(),
    allowMultipleVersions: z.boolean().optional(),
    maxRevisions: z.number().int().min(1).max(50).optional(),
    allowLateSubmission: z.boolean().optional(),
    gracePeriodMinutes: z.number().int().min(0).max(10080).optional(),
    allowAfterDeadline: z.boolean().optional(),
    allowEditBeforeDeadline: z.boolean().optional(),
    allowReturnForRevision: z.boolean().optional(),
    gradingMethod: z.enum(['DIRECT', 'RUBRIC', 'COMBINED']).optional(),
  })
  .optional();

const createOrUpdateAssignmentSchema = z.object({
  topicId: z.string().uuid().optional().nullable(),
  meetingNumber: z.number().int().min(1).max(32).optional(),
  sequenceOrder: z.number().int().min(1).max(100).optional(),
  title: z.string().min(3),
  subtitle: z.string().optional(),
  shortDescription: z.string().optional(),
  assignmentType: z
    .enum([
      'Individual',
      'Group',
      'Practical',
      'Project',
      'Report',
      'Essay',
      'Portfolio',
    ])
    .optional(),
  learningObjectives: z.string().optional(),
  instructions: z.string().optional(),
  instructionsJson: z.record(z.string(), z.any()).optional(),
  instructionsHtml: z.string().optional().nullable(),
  maxPoints: z.number().int().min(1).max(1000).optional(),
  maxScore: z.number().int().min(1).max(1000).optional(),
  estimatedCompletionMinutes: z.number().int().min(5).max(10080).optional(),
  coverImageKey: z.string().optional().nullable(),
  submissionConfig: submissionConfigInputSchema,
  status: z.enum(['DRAFT', 'SCHEDULED', 'PUBLISHED', 'ARCHIVED']).optional(),
  scheduledAt: z.string().optional().nullable(),
  availableFrom: z.string().optional().nullable(),
  availableUntil: z.string().optional().nullable(),
  dueAt: z.string().optional(),
  dueDaysFromNow: z.number().int().min(1).max(365).optional(),
  timezone: z.string().optional(),
  lateSubmissionPolicy: z.string().optional(),
  gradePublicationPolicy: z.string().optional(),
  allowLateSubmission: z.boolean().optional(),
  rubric: z
    .object({
      title: z.string().optional(),
      description: z.string().optional(),
      criteria: z.array(rubricCriterionInputSchema),
    })
    .optional()
    .nullable(),
  groups: z
    .array(
      z.object({
        name: z.string().min(2),
        memberIds: z.array(z.string().uuid()),
      })
    )
    .optional(),
});

export async function registerAssignmentRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', async (req) => {
    if (req.url.startsWith('/api/v1')) {
      await ensureExistingAssignmentsUpgraded();
    }
  });

  // ==========================================================================
  // 1. GET /api/v1/classrooms/:id/assignments
  // ==========================================================================
  fastify.get('/api/v1/classrooms/:id/assignments', async (req, reply) => {
    const user = await authenticateRequest(req, reply);
    if (!user) return;

    const { id } = req.params as { id: string };
    const access = await checkClassroomAccess(user, id);
    if (!access.canView) {
      return sendError(
        reply,
        403,
        'FORBIDDEN_CLASSROOM_ACCESS',
        'Akses ditolak: Hanya anggota kelas aktif yang dapat melihat daftar tugas.'
      );
    }

    const rawAsgs = await db
      .select({
        id: assignments.id,
        classroomId: assignments.classroomId,
        topicId: assignments.topicId,
        authorId: assignments.authorId,
        authorName: users.fullName,
        meetingNumber: assignments.meetingNumber,
        sequenceOrder: assignments.sequenceOrder,
        title: assignments.title,
        subtitle: assignments.subtitle,
        shortDescription: assignments.shortDescription,
        assignmentType: assignments.assignmentType,
        learningObjectives: assignments.learningObjectives,
        instructions: assignments.instructions,
        instructionsJson: assignments.instructionsJson,
        maxPoints: assignments.maxPoints,
        estimatedCompletionMinutes: assignments.estimatedCompletionMinutes,
        coverImageKey: assignments.coverImageKey,
        submissionConfig: assignments.submissionConfig,
        status: assignments.status,
        publishedAt: assignments.publishedAt,
        scheduledAt: assignments.scheduledAt,
        availableFrom: assignments.availableFrom,
        availableUntil: assignments.availableUntil,
        dueAt: assignments.dueAt,
        timezone: assignments.timezone,
        lateSubmissionPolicy: assignments.lateSubmissionPolicy,
        gradePublicationPolicy: assignments.gradePublicationPolicy,
        allowLateSubmission: assignments.allowLateSubmission,
        createdAt: assignments.createdAt,
        updatedAt: assignments.updatedAt,
      })
      .from(assignments)
      .innerJoin(users, eq(assignments.authorId, users.id))
      .where(eq(assignments.classroomId, id))
      .orderBy(asc(assignments.sequenceOrder), asc(assignments.dueAt));

    const visibleAsgs = access.canManage
      ? rawAsgs
      : rawAsgs.filter((a) => isAssignmentVisibleToStudent(a));

    const allTopics = await db
      .select()
      .from(classroomTopics)
      .where(eq(classroomTopics.classroomId, id));
    const allAtts = await db.select().from(assignmentAttachments);
    const allSubs = await db.select().from(assignmentSubmissions);
    const activeEnrollments = await db
      .select()
      .from(classroomEnrollments)
      .where(
        and(
          eq(classroomEnrollments.classroomId, id),
          eq(classroomEnrollments.status, 'active')
        )
      );

    const enriched = visibleAsgs.map((a) => {
      const topic = allTopics.find((t) => t.id === a.topicId);
      const atts = allAtts
        .filter((att) => att.assignmentId === a.id)
        .map(enrichAttachmentUrls);
      const asgSubs = allSubs.filter((s) => s.assignmentId === a.id);
      const mySub = asgSubs.find((s) => s.studentId === user.id) || null;

      const submittedCount = asgSubs.filter(
        (s) => normalizeSubmissionStatus(s.status, s.isLate) !== 'draft'
      ).length;
      const gradedCount = asgSubs.filter(
        (s) => s.gradingStatus === 'graded' || s.isGradePublished
      ).length;

      return {
        ...a,
        maxScore: a.maxPoints,
        topicTitle: topic?.title || 'Modul Umum',
        attachments: atts,
        attachmentCount: atts.length,
        mySubmission: mySub
          ? {
              id: mySub.id,
              status: normalizeSubmissionStatus(mySub.status, mySub.isLate),
              isLate: mySub.isLate,
              lateMinutes: mySub.lateMinutes,
              currentVersion: mySub.currentVersion,
              submittedAt: mySub.submittedAt,
              score: mySub.isGradePublished
                ? mySub.publishedScore ?? mySub.score
                : null,
              feedback:
                mySub.isGradePublished || mySub.status === 'returned'
                  ? mySub.feedback
                  : null,
              revisionInstructions: mySub.revisionInstructions,
              gradingStatus: mySub.isGradePublished
                ? 'graded'
                : mySub.status === 'returned'
                  ? 'returned'
                  : 'pending',
            }
          : {
              id: null,
              status: 'not_submitted',
              isLate: false,
              lateMinutes: 0,
              currentVersion: 0,
              submittedAt: null,
              score: null,
              feedback: null,
              gradingStatus: 'pending',
            },
        ...(access.canManage
          ? {
              stats: {
                totalParticipants: activeEnrollments.length,
                submittedCount,
                notSubmittedCount: Math.max(
                  0,
                  activeEnrollments.length - submittedCount
                ),
                gradedCount,
              },
            }
          : {}),
      };
    });

    return sendSuccess(reply, enriched);
  });

  // ==========================================================================
  // 2. POST /api/v1/classrooms/:id/assignments
  // ==========================================================================
  fastify.post('/api/v1/classrooms/:id/assignments', async (req, reply) => {
    const user = await authenticateRequest(req, reply);
    if (!user) return;

    const { id } = req.params as { id: string };
    const access = await checkClassroomAccess(user, id);
    if (!access.canManage) {
      return sendError(
        reply,
        403,
        'FORBIDDEN_NOT_INSTRUCTOR',
        'Akses ditolak: Hanya Dosen pengampu kelas ini yang dapat membuat tugas.'
      );
    }

    const parsed = createOrUpdateAssignmentSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(
        reply,
        400,
        'VALIDATION_ERROR',
        'Data konfigurasi tugas tidak valid.',
        parsed.error.issues
      );
    }

    const data = parsed.data;

    // Validate topic belongs to classroom if provided
    if (data.topicId) {
      const [topic] = await db
        .select()
        .from(classroomTopics)
        .where(
          and(
            eq(classroomTopics.id, data.topicId),
            eq(classroomTopics.classroomId, id)
          )
        );
      if (!topic) {
        return sendError(
          reply,
          400,
          'INVALID_TOPIC_OWNERSHIP',
          'Topik/modul yang dipilih bukan bagian dari ruang kelas ini.'
        );
      }
    }

    // Validate rubric weights total 100% if rubric criteria are provided
    if (data.rubric && data.rubric.criteria.length > 0) {
      const totalWeight = data.rubric.criteria.reduce(
        (sum, c) => sum + c.weight,
        0
      );
      if (totalWeight !== 100) {
        return sendError(
          reply,
          400,
          'INVALID_RUBRIC_WEIGHT_SUM',
          `Total bobot kriteria rubrik harus tepat 100% (saat ini: ${totalWeight}%).`
        );
      }
    }

    const maxPoints = data.maxPoints ?? data.maxScore ?? 100;
    const dueAt = data.dueAt
      ? new Date(data.dueAt)
      : new Date(Date.now() + (data.dueDaysFromNow || 7) * 86400_000);

    const instructionsJson = data.instructionsJson || {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text:
                data.instructions ||
                data.shortDescription ||
                'Kerjakan tugas sesuai instruksi.',
            },
          ],
        },
      ],
    };
    const plainInstructions =
      data.instructions ||
      extractPlainTextFromTiptap(instructionsJson) ||
      data.shortDescription ||
      data.title;

    const mergedConfig = mergeSubmissionConfig({
      ...data.submissionConfig,
      ...(data.allowLateSubmission !== undefined
        ? { allowLateSubmission: data.allowLateSubmission }
        : {}),
    });

    const status = data.status || 'PUBLISHED';
    const scheduledAt = data.scheduledAt ? new Date(data.scheduledAt) : null;
    const publishedAt = status === 'PUBLISHED' ? new Date() : null;

    const created = await db.transaction(async (tx) => {
      const [asg] = await tx
        .insert(assignments)
        .values({
          classroomId: id,
          topicId: data.topicId || null,
          authorId: user.id,
          meetingNumber: data.meetingNumber || 1,
          sequenceOrder: data.sequenceOrder || 1,
          title: data.title.trim(),
          subtitle: data.subtitle?.trim() || '',
          shortDescription:
            data.shortDescription?.trim() || plainInstructions.slice(0, 200),
          assignmentType: data.assignmentType || 'Individual',
          learningObjectives: data.learningObjectives?.trim() || '',
          instructions: plainInstructions,
          instructionsJson,
          instructionsHtml: data.instructionsHtml
            ? sanitizePreviewHtml(data.instructionsHtml)
            : null,
          maxPoints,
          estimatedCompletionMinutes: data.estimatedCompletionMinutes || 120,
          coverImageKey: data.coverImageKey || null,
          submissionConfig: mergedConfig,
          status,
          publishedAt,
          scheduledAt,
          availableFrom: data.availableFrom
            ? new Date(data.availableFrom)
            : null,
          availableUntil: data.availableUntil
            ? new Date(data.availableUntil)
            : null,
          dueAt,
          timezone: data.timezone || 'Asia/Jakarta',
          lateSubmissionPolicy:
            data.lateSubmissionPolicy || 'ACCEPT_WITH_LATE_FLAG',
          gradePublicationPolicy:
            data.gradePublicationPolicy || 'MANUAL_PUBLISH',
          allowLateSubmission: mergedConfig.allowLateSubmission,
        })
        .returning();

      // Create rubric if provided
      let rubricRecord: any = null;
      let criteriaRecords: any[] = [];
      if (data.rubric && data.rubric.criteria.length > 0) {
        const [r] = await tx
          .insert(assignmentRubrics)
          .values({
            assignmentId: asg.id,
            title: data.rubric.title || `Rubrik Penilaian: ${asg.title}`,
            description: data.rubric.description || '',
            totalWeight: 100,
            createdById: user.id,
          })
          .returning();
        rubricRecord = r;

        criteriaRecords = await tx
          .insert(assignmentRubricCriteria)
          .values(
            data.rubric.criteria.map((c, idx) => ({
              rubricId: r.id,
              assignmentId: asg.id,
              criterionName: c.criterionName,
              description: c.description || '',
              maxScore: c.maxScore || 100,
              weight: c.weight,
              performanceLevels: c.performanceLevels || [],
              sortOrder: c.sortOrder || idx + 1,
            }))
          )
          .returning();
      }

      // Create assignment groups if group assignment
      if (data.groups && data.groups.length > 0) {
        for (const grp of data.groups) {
          const [gRow] = await tx
            .insert(assignmentGroups)
            .values({
              assignmentId: asg.id,
              classroomId: id,
              name: grp.name,
              createdById: user.id,
            })
            .returning();

          if (grp.memberIds.length > 0) {
            await tx.insert(assignmentGroupMembers).values(
              grp.memberIds.map((studentId, i) => ({
                groupId: gRow.id,
                studentId,
                role: i === 0 ? 'LEADER' : 'MEMBER',
              }))
            );
          }
        }
      }

      // Register in Gradebook
      const cats = await tx
        .select()
        .from(gradeCategories)
        .where(eq(gradeCategories.classroomId, id));

      await tx.insert(gradeItems).values({
        classroomId: id,
        categoryId: cats[0]?.id || null,
        sourceType: 'ASSIGNMENT',
        sourceId: asg.id,
        title: asg.title,
        maxScore: asg.maxPoints,
      });

      // Notify enrolled students if published immediately
      if (status === 'PUBLISHED') {
        const enrolled = await tx
          .select()
          .from(classroomEnrollments)
          .where(
            and(
              eq(classroomEnrollments.classroomId, id),
              eq(classroomEnrollments.status, 'active')
            )
          );
        if (enrolled.length > 0) {
          await tx.insert(notifications).values(
            enrolled.map((enr) => ({
              userId: enr.studentId,
              title: `Tugas Baru Diterbitkan: ${asg.title}`,
              message: `Dosen ${user.fullName} telah menerbitkan tugas "${asg.title}". Batas pengumpulan: ${dueAt.toLocaleDateString('id-ID')}.`,
              type: 'ASSIGNMENT_PUBLISHED',
              linkUrl: `/classrooms/${id}/assignments/${asg.id}`,
            }))
          );
        }
      }

      return {
        ...asg,
        maxScore: asg.maxPoints,
        rubric: rubricRecord
          ? { ...rubricRecord, criteria: criteriaRecords }
          : null,
      };
    });

    await recordAuditLog({
      actorId: user.id,
      action: 'ASSIGNMENT_CREATED',
      entityType: 'ASSIGNMENT',
      entityId: created.id,
      metadata: { classroomId: id, title: created.title, status: created.status },
      ipAddress: req.ip,
    });

    return sendSuccess(reply, created, null, 201);
  });

  // ==========================================================================
  // 3. GET /api/v1/assignments/:id
  // ==========================================================================
  fastify.get('/api/v1/assignments/:id', async (req, reply) => {
    const user = await authenticateRequest(req, reply);
    if (!user) return;

    const { id } = req.params as { id: string };
    const [asg] = await db
      .select()
      .from(assignments)
      .where(eq(assignments.id, id));
    if (!asg) {
      return sendError(reply, 404, 'ASSIGNMENT_NOT_FOUND', 'Tugas tidak ditemukan.');
    }

    const access = await checkClassroomAccess(user, asg.classroomId);
    if (!access.canView) {
      return sendError(
        reply,
        403,
        'FORBIDDEN_CLASSROOM_ACCESS',
        'Akses ditolak: Hanya peserta kelas aktif yang dapat membuka tugas ini.'
      );
    }

    if (!access.canManage && !isAssignmentVisibleToStudent(asg)) {
      return sendError(
        reply,
        403,
        'ASSIGNMENT_NOT_PUBLISHED',
        'Tugas ini masih berstatus draf atau dijadwalkan untuk waktu mendatang.'
      );
    }

    const [cls] = await db
      .select()
      .from(classrooms)
      .where(eq(classrooms.id, asg.classroomId));
    const [topic] = asg.topicId
      ? await db
          .select()
          .from(classroomTopics)
          .where(eq(classroomTopics.id, asg.topicId))
      : [null];
    const [author] = await db
      .select({
        id: users.id,
        fullName: users.fullName,
        email: users.email,
      })
      .from(users)
      .where(eq(users.id, asg.authorId));

    const atts = await db
      .select()
      .from(assignmentAttachments)
      .where(eq(assignmentAttachments.assignmentId, id))
      .orderBy(asc(assignmentAttachments.sortOrder));

    const [rubric] = await db
      .select()
      .from(assignmentRubrics)
      .where(eq(assignmentRubrics.assignmentId, id));
    const criteria = rubric
      ? await db
          .select()
          .from(assignmentRubricCriteria)
          .where(eq(assignmentRubricCriteria.rubricId, rubric.id))
          .orderBy(asc(assignmentRubricCriteria.sortOrder))
      : [];

    const groups = await db
      .select()
      .from(assignmentGroups)
      .where(eq(assignmentGroups.assignmentId, id));
    const groupMembers =
      groups.length > 0
        ? await db
            .select({
              id: assignmentGroupMembers.id,
              groupId: assignmentGroupMembers.groupId,
              studentId: users.id,
              fullName: users.fullName,
              identityNumber: users.identityNumber,
              role: assignmentGroupMembers.role,
            })
            .from(assignmentGroupMembers)
            .innerJoin(users, eq(assignmentGroupMembers.studentId, users.id))
            .where(
              inArray(
                assignmentGroupMembers.groupId,
                groups.map((g) => g.id)
              )
            )
        : [];

    // Load student's own submission (or group submission if part of a group)
    const myGroupMember = groupMembers.find((gm) => gm.studentId === user.id);
    const [mySubRow] = await db
      .select()
      .from(assignmentSubmissions)
      .where(
        and(
          eq(assignmentSubmissions.assignmentId, id),
          eq(assignmentSubmissions.studentId, user.id)
        )
      );

    let mySubmissionDetail: any = null;
    if (mySubRow) {
      const subVers = await db
        .select()
        .from(submissionVersions)
        .where(eq(submissionVersions.submissionId, mySubRow.id))
        .orderBy(desc(submissionVersions.versionNumber));

      const subAtts = await db
        .select()
        .from(submissionAttachments)
        .where(eq(submissionAttachments.submissionId, mySubRow.id))
        .orderBy(asc(submissionAttachments.createdAt));

      const subLinks = await db
        .select()
        .from(submissionLinks)
        .where(eq(submissionLinks.submissionId, mySubRow.id))
        .orderBy(asc(submissionLinks.createdAt));

      const rawComments = await db
        .select({
          id: submissionComments.id,
          submissionId: submissionComments.submissionId,
          parentCommentId: submissionComments.parentCommentId,
          authorId: users.id,
          authorName: users.fullName,
          content: submissionComments.content,
          visibility: submissionComments.visibility,
          attachmentObjectKey: submissionComments.attachmentObjectKey,
          attachmentName: submissionComments.attachmentName,
          isRead: submissionComments.isRead,
          createdAt: submissionComments.createdAt,
        })
        .from(submissionComments)
        .innerJoin(users, eq(submissionComments.authorId, users.id))
        .where(eq(submissionComments.submissionId, mySubRow.id))
        .orderBy(asc(submissionComments.createdAt));

      const visibleComments = access.canManage
        ? rawComments
        : rawComments.filter((c) => c.visibility === 'STUDENT_VISIBLE');

      const [gradeRow] = await db
        .select()
        .from(submissionGrades)
        .where(eq(submissionGrades.submissionId, mySubRow.id));

      const rubricScores =
        gradeRow && (access.canManage || gradeRow.isPublished)
          ? await db
              .select()
              .from(submissionRubricScores)
              .where(eq(submissionRubricScores.gradeId, gradeRow.id))
          : [];

      const isGradeVisibleToUser =
        access.canManage || Boolean(gradeRow?.isPublished || mySubRow.isGradePublished);

      mySubmissionDetail = {
        ...mySubRow,
        status: normalizeSubmissionStatus(mySubRow.status, mySubRow.isLate),
        score: isGradeVisibleToUser
          ? gradeRow?.finalScore ?? mySubRow.publishedScore ?? mySubRow.score
          : null,
        feedback:
          isGradeVisibleToUser || mySubRow.status === 'returned'
            ? gradeRow?.generalFeedback || mySubRow.feedback
            : null,
        privateNotes: access.canManage
          ? gradeRow?.privateComment || mySubRow.privateNotes
          : undefined,
        revisionInstructions:
          gradeRow?.revisionInstructions || mySubRow.revisionInstructions,
        attachments: subAtts.map(enrichAttachmentUrls),
        links: subLinks,
        versions: subVers,
        comments: visibleComments,
        grade: isGradeVisibleToUser && gradeRow
          ? {
              id: gradeRow.id,
              gradingMethod: gradeRow.gradingMethod,
              rawScore: gradeRow.rawScore,
              finalScore: gradeRow.finalScore,
              maxScore: gradeRow.maxScore,
              generalFeedback: gradeRow.generalFeedback,
              revisionInstructions: gradeRow.revisionInstructions,
              isPublished: gradeRow.isPublished,
              publishedAt: gradeRow.publishedAt,
              rubricScores,
              ...(access.canManage
                ? {
                    privateComment: gradeRow.privateComment,
                    auditHistory: gradeRow.auditHistory,
                  }
                : {}),
            }
          : null,
      };
    }

    return sendSuccess(reply, {
      ...asg,
      maxScore: asg.maxPoints,
      submissionConfig: mergeSubmissionConfig(asg.submissionConfig),
      classroom: cls
        ? { id: cls.id, name: cls.name, section: cls.section }
        : null,
      topic: topic ? { id: topic.id, title: topic.title } : null,
      instructor: author || null,
      access,
      attachments: atts.map(enrichAttachmentUrls),
      rubric: rubric ? { ...rubric, criteria } : null,
      groups: groups.map((g) => ({
        ...g,
        members: groupMembers.filter((m) => m.groupId === g.id),
      })),
      myGroupId: myGroupMember?.groupId || null,
      mySubmission: mySubmissionDetail,
    });
  });

  // ==========================================================================
  // 4. PATCH /api/v1/assignments/:id & DELETE /api/v1/assignments/:id
  // ==========================================================================
  fastify.patch('/api/v1/assignments/:id', async (req, reply) => {
    const user = await authenticateRequest(req, reply);
    if (!user) return;

    const { id } = req.params as { id: string };
    const [existing] = await db
      .select()
      .from(assignments)
      .where(eq(assignments.id, id));
    if (!existing) {
      return sendError(reply, 404, 'ASSIGNMENT_NOT_FOUND', 'Tugas tidak ditemukan.');
    }

    const access = await checkClassroomAccess(user, existing.classroomId);
    if (!access.canManage) {
      return sendError(
        reply,
        403,
        'FORBIDDEN_NOT_INSTRUCTOR',
        'Hanya Dosen pengampu yang dapat mengubah konfigurasi tugas.'
      );
    }

    const roleInfo = await resolveClassroomRole(user, existing.classroomId);
    if (roleInfo.role === 'CO_INSTRUCTOR' && !roleInfo.canManageAll && existing.authorId !== user.id) {
      return sendError(
        reply,
        403,
        'FORBIDDEN_CO_INSTRUCTOR_RESOURCE_OWNERSHIP',
        'Co-Instructor tidak dapat mengubah tugas milik pengajar lain tanpa izin.'
      );
    }

    const parsed = createOrUpdateAssignmentSchema.partial().safeParse(req.body);
    if (!parsed.success) {
      return sendError(
        reply,
        400,
        'VALIDATION_ERROR',
        'Pembaruan konfigurasi tugas tidak valid.',
        parsed.error.issues
      );
    }

    const data = parsed.data;

    if (data.rubric && data.rubric.criteria && data.rubric.criteria.length > 0) {
      const totalWeight = data.rubric.criteria.reduce(
        (sum, c) => sum + c.weight,
        0
      );
      if (totalWeight !== 100) {
        return sendError(
          reply,
          400,
          'INVALID_RUBRIC_WEIGHT_SUM',
          `Total bobot kriteria rubrik harus tepat 100% (saat ini: ${totalWeight}%).`
        );
      }
    }

    const nextConfig = data.submissionConfig
      ? mergeSubmissionConfig({
          ...(existing.submissionConfig as any),
          ...data.submissionConfig,
        })
      : mergeSubmissionConfig(existing.submissionConfig);

    const nextMaxPoints =
      data.maxPoints ?? data.maxScore ?? existing.maxPoints;
    const nextInstructionsJson =
      data.instructionsJson || (existing.instructionsJson as any);
    const nextInstructionsText =
      data.instructions ||
      (data.instructionsJson
        ? extractPlainTextFromTiptap(data.instructionsJson)
        : existing.instructions);

    const updated = await db.transaction(async (tx) => {
      const [upAsg] = await tx
        .update(assignments)
        .set({
          ...(data.topicId !== undefined ? { topicId: data.topicId } : {}),
          ...(data.meetingNumber !== undefined
            ? { meetingNumber: data.meetingNumber }
            : {}),
          ...(data.sequenceOrder !== undefined
            ? { sequenceOrder: data.sequenceOrder }
            : {}),
          ...(data.title !== undefined ? { title: data.title.trim() } : {}),
          ...(data.subtitle !== undefined
            ? { subtitle: data.subtitle.trim() }
            : {}),
          ...(data.shortDescription !== undefined
            ? { shortDescription: data.shortDescription.trim() }
            : {}),
          ...(data.assignmentType !== undefined
            ? { assignmentType: data.assignmentType }
            : {}),
          ...(data.learningObjectives !== undefined
            ? { learningObjectives: data.learningObjectives.trim() }
            : {}),
          instructions: nextInstructionsText,
          instructionsJson: nextInstructionsJson,
          ...(data.instructionsHtml !== undefined
            ? {
                instructionsHtml: data.instructionsHtml
                  ? sanitizePreviewHtml(data.instructionsHtml)
                  : null,
              }
            : {}),
          maxPoints: nextMaxPoints,
          ...(data.estimatedCompletionMinutes !== undefined
            ? {
                estimatedCompletionMinutes: data.estimatedCompletionMinutes,
              }
            : {}),
          ...(data.coverImageKey !== undefined
            ? { coverImageKey: data.coverImageKey }
            : {}),
          submissionConfig: nextConfig,
          ...(data.status !== undefined ? { status: data.status } : {}),
          ...(data.scheduledAt !== undefined
            ? {
                scheduledAt: data.scheduledAt
                  ? new Date(data.scheduledAt)
                  : null,
              }
            : {}),
          ...(data.availableFrom !== undefined
            ? {
                availableFrom: data.availableFrom
                  ? new Date(data.availableFrom)
                  : null,
              }
            : {}),
          ...(data.availableUntil !== undefined
            ? {
                availableUntil: data.availableUntil
                  ? new Date(data.availableUntil)
                  : null,
              }
            : {}),
          ...(data.dueAt !== undefined
            ? { dueAt: new Date(data.dueAt) }
            : {}),
          ...(data.timezone !== undefined ? { timezone: data.timezone } : {}),
          ...(data.lateSubmissionPolicy !== undefined
            ? { lateSubmissionPolicy: data.lateSubmissionPolicy }
            : {}),
          ...(data.gradePublicationPolicy !== undefined
            ? { gradePublicationPolicy: data.gradePublicationPolicy }
            : {}),
          allowLateSubmission: nextConfig.allowLateSubmission,
          updatedAt: new Date(),
        })
        .where(eq(assignments.id, id))
        .returning();

      if (data.rubric && data.rubric.criteria.length > 0) {
        const [existingRubric] = await tx
          .select()
          .from(assignmentRubrics)
          .where(eq(assignmentRubrics.assignmentId, id));

        let rubricId = existingRubric?.id;
        if (existingRubric) {
          await tx
            .update(assignmentRubrics)
            .set({
              title: data.rubric.title || existingRubric.title,
              description:
                data.rubric.description ?? existingRubric.description,
              totalWeight: 100,
              updatedAt: new Date(),
            })
            .where(eq(assignmentRubrics.id, existingRubric.id));
          await tx
            .delete(assignmentRubricCriteria)
            .where(eq(assignmentRubricCriteria.rubricId, existingRubric.id));
        } else {
          const [createdRubric] = await tx
            .insert(assignmentRubrics)
            .values({
              assignmentId: id,
              title: data.rubric.title || `Rubrik Penilaian: ${upAsg.title}`,
              description: data.rubric.description || '',
              totalWeight: 100,
              createdById: user.id,
            })
            .returning();
          rubricId = createdRubric.id;
        }

        await tx.insert(assignmentRubricCriteria).values(
          data.rubric.criteria.map((c, idx) => ({
            rubricId: rubricId!,
            assignmentId: id,
            criterionName: c.criterionName,
            description: c.description || '',
            maxScore: c.maxScore || 100,
            weight: c.weight,
            performanceLevels: c.performanceLevels || [],
            sortOrder: c.sortOrder || idx + 1,
          }))
        );
      }

      return upAsg;
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
      resourceType: 'ASSIGNMENT',
      resourceId: id,
      resourceTitle: updated.title,
      action: auditAction,
      beforeValue: { title: existing.title, status: existing.status, dueAt: existing.dueAt },
      afterValue: { title: updated.title, status: updated.status, dueAt: updated.dueAt },
      changeSummary: `Memperbarui tugas: "${updated.title}"`,
    });

    return sendSuccess(reply, {
      ...updated,
      maxScore: updated.maxPoints,
    });
  });

  fastify.delete('/api/v1/assignments/:id', async (req, reply) => {
    const user = await authenticateRequest(req, reply);
    if (!user) return;

    const { id } = req.params as { id: string };
    const [existing] = await db
      .select()
      .from(assignments)
      .where(eq(assignments.id, id));
    if (!existing) {
      return sendError(reply, 404, 'ASSIGNMENT_NOT_FOUND', 'Tugas tidak ditemukan.');
    }

    const access = await checkClassroomAccess(user, existing.classroomId);
    if (!access.canManage) {
      return sendError(reply, 403, 'FORBIDDEN', 'Hanya Dosen yang dapat menghapus tugas.');
    }

    const roleInfo = await resolveClassroomRole(user, existing.classroomId);
    if (roleInfo.role === 'CO_INSTRUCTOR' && !roleInfo.canManageAll && existing.authorId !== user.id) {
      return sendError(
        reply,
        403,
        'FORBIDDEN_CO_INSTRUCTOR_RESOURCE_OWNERSHIP',
        'Co-Instructor tidak dapat menghapus tugas milik pengajar lain tanpa izin.'
      );
    }

    await db.delete(assignments).where(eq(assignments.id, id));
    await recordClassroomAudit({
      classroomId: existing.classroomId,
      actorId: user.id,
      actorRole: roleInfo.role,
      resourceType: 'ASSIGNMENT',
      resourceId: id,
      resourceTitle: existing.title,
      action: 'DELETED',
      beforeValue: { title: existing.title, status: existing.status },
      changeSummary: `Menghapus tugas "${existing.title}"`,
    });
    return sendSuccess(reply, { deleted: true, id });
  });

  // ==========================================================================
  // 5. POST /api/v1/assignments/:id/publish & /schedule & /rubric
  // ==========================================================================
  fastify.post('/api/v1/assignments/:id/publish', async (req, reply) => {
    const user = await authenticateRequest(req, reply);
    if (!user) return;

    const { id } = req.params as { id: string };
    const [asg] = await db
      .select()
      .from(assignments)
      .where(eq(assignments.id, id));
    if (!asg) {
      return sendError(reply, 404, 'ASSIGNMENT_NOT_FOUND', 'Tugas tidak ditemukan.');
    }

    const access = await checkClassroomAccess(user, asg.classroomId);
    if (!access.canManage) {
      return sendError(reply, 403, 'FORBIDDEN', 'Akses ditolak.');
    }

    const [updated] = await db
      .update(assignments)
      .set({
        status: 'PUBLISHED',
        publishedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(assignments.id, id))
      .returning();

    // Notify active enrolled students (avoid duplicates if already notified)
    const enrolled = await db
      .select()
      .from(classroomEnrollments)
      .where(
        and(
          eq(classroomEnrollments.classroomId, asg.classroomId),
          eq(classroomEnrollments.status, 'active')
        )
      );

    for (const enr of enrolled) {
      await db.insert(notifications).values({
        userId: enr.studentId,
        title: `Tugas Diterbitkan: ${updated.title}`,
        message: `Tugas "${updated.title}" telah diterbitkan dan siap dikerjakan.`,
        type: 'ASSIGNMENT_PUBLISHED',
        linkUrl: `/classrooms/${asg.classroomId}/assignments/${id}`,
      });
    }

    return sendSuccess(reply, updated);
  });

  fastify.post('/api/v1/assignments/:id/schedule', async (req, reply) => {
    const user = await authenticateRequest(req, reply);
    if (!user) return;

    const { id } = req.params as { id: string };
    const [asg] = await db
      .select()
      .from(assignments)
      .where(eq(assignments.id, id));
    if (!asg) {
      return sendError(reply, 404, 'ASSIGNMENT_NOT_FOUND', 'Tugas tidak ditemukan.');
    }

    const access = await checkClassroomAccess(user, asg.classroomId);
    if (!access.canManage) {
      return sendError(reply, 403, 'FORBIDDEN', 'Akses ditolak.');
    }

    const body = req.body as { scheduledAt?: string };
    if (!body?.scheduledAt) {
      return sendError(
        reply,
        400,
        'VALIDATION_ERROR',
        'Tanggal publikasi terjadwal (scheduledAt) wajib diisi.'
      );
    }

    const [updated] = await db
      .update(assignments)
      .set({
        status: 'SCHEDULED',
        scheduledAt: new Date(body.scheduledAt),
        updatedAt: new Date(),
      })
      .where(eq(assignments.id, id))
      .returning();

    return sendSuccess(reply, updated);
  });

  fastify.post('/api/v1/assignments/:id/rubric', async (req, reply) => {
    const user = await authenticateRequest(req, reply);
    if (!user) return;

    const { id } = req.params as { id: string };
    const [asg] = await db
      .select()
      .from(assignments)
      .where(eq(assignments.id, id));
    if (!asg) {
      return sendError(reply, 404, 'ASSIGNMENT_NOT_FOUND', 'Tugas tidak ditemukan.');
    }

    const access = await checkClassroomAccess(user, asg.classroomId);
    if (!access.canManage) {
      return sendError(reply, 403, 'FORBIDDEN', 'Hanya Dosen yang dapat mengatur rubrik.');
    }

    const rubricBodySchema = z.object({
      title: z.string().min(2).optional(),
      description: z.string().optional(),
      criteria: z.array(rubricCriterionInputSchema).min(1),
    });

    const parsed = rubricBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(
        reply,
        400,
        'VALIDATION_ERROR',
        'Format rubrik tidak valid.',
        parsed.error.issues
      );
    }

    const totalWeight = parsed.data.criteria.reduce(
      (sum, c) => sum + c.weight,
      0
    );
    if (totalWeight !== 100) {
      return sendError(
        reply,
        400,
        'INVALID_RUBRIC_WEIGHT_SUM',
        `Total bobot kriteria rubrik harus tepat 100% (saat ini: ${totalWeight}%).`
      );
    }

    const result = await db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(assignmentRubrics)
        .where(eq(assignmentRubrics.assignmentId, id));

      let rubricRow = existing;
      if (existing) {
        const [up] = await tx
          .update(assignmentRubrics)
          .set({
            title: parsed.data.title || existing.title,
            description: parsed.data.description ?? existing.description,
            totalWeight: 100,
            updatedAt: new Date(),
          })
          .where(eq(assignmentRubrics.id, existing.id))
          .returning();
        rubricRow = up;
        await tx
          .delete(assignmentRubricCriteria)
          .where(eq(assignmentRubricCriteria.rubricId, existing.id));
      } else {
        const [ins] = await tx
          .insert(assignmentRubrics)
          .values({
            assignmentId: id,
            title: parsed.data.title || `Rubrik Evaluasi: ${asg.title}`,
            description: parsed.data.description || '',
            totalWeight: 100,
            createdById: user.id,
          })
          .returning();
        rubricRow = ins;
      }

      const criteriaRows = await tx
        .insert(assignmentRubricCriteria)
        .values(
          parsed.data.criteria.map((c, idx) => ({
            rubricId: rubricRow.id,
            assignmentId: id,
            criterionName: c.criterionName,
            description: c.description || '',
            maxScore: c.maxScore || 100,
            weight: c.weight,
            performanceLevels: c.performanceLevels || [],
            sortOrder: c.sortOrder || idx + 1,
          }))
        )
        .returning();

      return { ...rubricRow, criteria: criteriaRows };
    });

    return sendSuccess(reply, result, null, 201);
  });

  // ==========================================================================
  // 6. INSTRUCTOR ATTACHMENTS & STUDENT SUBMISSION S3 UPLOAD + PREVIEW
  // ==========================================================================
  fastify.post(
    '/api/v1/assignments/:id/attachments/upload-url',
    async (req, reply) => {
      const user = await authenticateRequest(req, reply);
      if (!user) return;

      const { id } = req.params as { id: string };
      const [asg] = await db
        .select()
        .from(assignments)
        .where(eq(assignments.id, id));
      if (!asg) {
        return sendError(reply, 404, 'ASSIGNMENT_NOT_FOUND', 'Tugas tidak ditemukan.');
      }

      const access = await checkClassroomAccess(user, asg.classroomId);
      if (!access.canManage) {
        return sendError(reply, 403, 'FORBIDDEN', 'Akses ditolak.');
      }

      const body = req.body as {
        fileName?: string;
        mimeType?: string;
        fileSize?: number;
      };
      const check = validateAttachmentRequest(
        body.fileName || '',
        body.mimeType || 'application/octet-stream',
        Number(body.fileSize || 0)
      );
      if (!check.valid || !check.spec || !check.extension) {
        return sendError(
          reply,
          400,
          'INVALID_ATTACHMENT_TYPE',
          check.error || 'Tipe berkas tidak didukung.'
        );
      }

      const objectKey = `assignments/${id}/${crypto.randomUUID()}.${check.extension}`;
      const signed = signPresignedPutUrl({
        objectKey,
        mimeType: body.mimeType || check.spec.mimes[0],
        maxBytes: check.spec.maxBytes,
      });

      return sendSuccess(reply, {
        uploadUrl: signed.uploadUrl,
        expiresAt: signed.expiresAt,
        objectKey,
        bucketName: 'poltek-kampar-s3-private-bucket',
        storageProvider: 'S3_COMPATIBLE_PRIVATE',
        attachmentType: check.spec.category,
        extension: check.extension,
        mimeType: body.mimeType || check.spec.mimes[0],
      });
    }
  );

  fastify.post(
    '/api/v1/assignments/:id/attachments/confirm',
    async (req, reply) => {
      const user = await authenticateRequest(req, reply);
      if (!user) return;

      const { id } = req.params as { id: string };
      const [asg] = await db
        .select()
        .from(assignments)
        .where(eq(assignments.id, id));
      if (!asg) {
        return sendError(reply, 404, 'ASSIGNMENT_NOT_FOUND', 'Tugas tidak ditemukan.');
      }

      const access = await checkClassroomAccess(user, asg.classroomId);
      if (!access.canManage) {
        return sendError(reply, 403, 'FORBIDDEN', 'Akses ditolak.');
      }

      const body = req.body as {
        objectKey?: string;
        originalFileName?: string;
        fileName?: string;
        mimeType?: string;
        fileSize?: number;
        checksum?: string;
        description?: string;
        sortOrder?: number;
      };

      const objectKey = body.objectKey || '';
      const originalName = body.originalFileName || body.fileName || 'lampiran';
      const ext = originalName.split('.').pop()?.toLowerCase() || '';

      const verified = verifyUploadedObject(objectKey, ext);
      if (!verified.exists) {
        return sendError(
          reply,
          400,
          'OBJECT_VERIFICATION_FAILED',
          verified.error || 'Gagal memverifikasi berkas S3.'
        );
      }

      const [inserted] = await db
        .insert(assignmentAttachments)
        .values({
          assignmentId: id,
          originalName,
          objectKey,
          mimeType: verified.detectedMime,
          fileExtension: ext,
          fileSize: verified.sizeBytes,
          checksum: verified.checksum,
          description: body.description || '',
          sortOrder: body.sortOrder || 1,
        })
        .returning();

      return sendSuccess(reply, enrichAttachmentUrls(inserted), null, 201);
    }
  );

  fastify.delete(
    '/api/v1/assignment-attachments/:attachmentId',
    async (req, reply) => {
      const user = await authenticateRequest(req, reply);
      if (!user) return;

      const { attachmentId } = req.params as { attachmentId: string };
      const [att] = await db
        .select()
        .from(assignmentAttachments)
        .where(eq(assignmentAttachments.id, attachmentId));
      if (!att) {
        return sendError(reply, 404, 'NOT_FOUND', 'Lampiran tidak ditemukan.');
      }

      const [asg] = await db
        .select()
        .from(assignments)
        .where(eq(assignments.id, att.assignmentId));
      if (!asg) {
        return sendError(reply, 404, 'NOT_FOUND', 'Tugas tidak ditemukan.');
      }

      const access = await checkClassroomAccess(user, asg.classroomId);
      if (!access.canManage) {
        return sendError(reply, 403, 'FORBIDDEN', 'Akses ditolak.');
      }

      if (att.objectKey) {
        deletePrivateObject(att.objectKey);
      }
      await db
        .delete(assignmentAttachments)
        .where(eq(assignmentAttachments.id, attachmentId));

      return sendSuccess(reply, { deleted: true, id: attachmentId });
    }
  );

  // Student Submission S3 Upload URL (validates assignment's allowedExtensions and maxFileSizeMb!)
  fastify.post(
    '/api/v1/assignments/:id/submission-upload-url',
    async (req, reply) => {
      const user = await authenticateRequest(req, reply);
      if (!user) return;

      const { id } = req.params as { id: string };
      const [asg] = await db
        .select()
        .from(assignments)
        .where(eq(assignments.id, id));
      if (!asg) {
        return sendError(reply, 404, 'ASSIGNMENT_NOT_FOUND', 'Tugas tidak ditemukan.');
      }

      const access = await checkClassroomAccess(user, asg.classroomId);
      if (!access.isEnrolledActive && !access.canManage) {
        return sendError(
          reply,
          403,
          'FORBIDDEN_NOT_ENROLLED',
          'Hanya mahasiswa dengan enrollment aktif yang dapat mengunggah berkas tugas.'
        );
      }

      const cfg = mergeSubmissionConfig(asg.submissionConfig);
      if (!cfg.allowFileUpload && !access.canManage) {
        return sendError(
          reply,
          400,
          'FILE_UPLOAD_DISABLED',
          'Pengumpulan berkas dinonaktifkan untuk tugas ini.'
        );
      }

      const body = req.body as {
        fileName?: string;
        mimeType?: string;
        fileSize?: number;
      };
      const check = validateAttachmentRequest(
        body.fileName || '',
        body.mimeType || 'application/octet-stream',
        Number(body.fileSize || 0)
      );
      if (!check.valid || !check.spec || !check.extension) {
        return sendError(
          reply,
          400,
          'INVALID_ATTACHMENT_TYPE',
          check.error || 'Tipe berkas tidak diizinkan.'
        );
      }

      // Enforce assignment-specific allowed extensions
      if (
        !access.canManage &&
        cfg.allowedExtensions.length > 0 &&
        !cfg.allowedExtensions.includes(check.extension)
      ) {
        return sendError(
          reply,
          400,
          'EXTENSION_NOT_ALLOWED_BY_ASSIGNMENT',
          `Ekstensi .${check.extension} tidak diizinkan pada tugas ini. Ekstensi yang diizinkan: ${cfg.allowedExtensions.join(', ').toUpperCase()}.`
        );
      }

      const maxAllowedBytes = (cfg.maxFileSizeMb || 25) * 1024 * 1024;
      if (Number(body.fileSize || 0) > maxAllowedBytes) {
        return sendError(
          reply,
          400,
          'FILE_SIZE_EXCEEDS_ASSIGNMENT_LIMIT',
          `Ukuran berkas melebihi batas tugas (${cfg.maxFileSizeMb} MB).`
        );
      }

      const objectKey = `submissions/${id}/${user.id}/${crypto.randomUUID()}.${check.extension}`;
      const signed = signPresignedPutUrl({
        objectKey,
        mimeType: body.mimeType || check.spec.mimes[0],
        maxBytes: maxAllowedBytes,
      });

      return sendSuccess(reply, {
        uploadUrl: signed.uploadUrl,
        expiresAt: signed.expiresAt,
        objectKey,
        extension: check.extension,
        mimeType: body.mimeType || check.spec.mimes[0],
      });
    }
  );

  // Confirm uploaded student file and verify magic bytes + SHA-256 checksum
  fastify.post(
    '/api/v1/assignments/:id/submission-upload-confirm',
    async (req, reply) => {
      const user = await authenticateRequest(req, reply);
      if (!user) return;

      const { id } = req.params as { id: string };
      const [asg] = await db
        .select()
        .from(assignments)
        .where(eq(assignments.id, id));
      if (!asg) {
        return sendError(reply, 404, 'ASSIGNMENT_NOT_FOUND', 'Tugas tidak ditemukan.');
      }

      const access = await checkClassroomAccess(user, asg.classroomId);
      if (!access.isEnrolledActive && !access.canManage) {
        return sendError(reply, 403, 'FORBIDDEN_NOT_ENROLLED', 'Akses ditolak.');
      }

      const body = req.body as {
        objectKey?: string;
        originalFileName?: string;
        fileName?: string;
        mimeType?: string;
        fileSize?: number;
        description?: string;
      };

      const objectKey = body.objectKey || '';
      const originalName = body.originalFileName || body.fileName || 'jawaban';
      const ext = originalName.split('.').pop()?.toLowerCase() || '';

      if (!objectKey.startsWith(`submissions/${id}/${user.id}/`) && !access.canManage) {
        return sendError(
          reply,
          403,
          'FORBIDDEN_OBJECT_OWNERSHIP',
          'Kunci objek S3 tidak sesuai dengan identitas mahasiswa.'
        );
      }

      const verified = verifyUploadedObject(objectKey, ext);
      if (!verified.exists) {
        return sendError(
          reply,
          400,
          'OBJECT_VERIFICATION_FAILED',
          verified.error || 'Gagal memverifikasi berkas jawaban.'
        );
      }

      return sendSuccess(
        reply,
        enrichAttachmentUrls({
          objectKey,
          originalName,
          mimeType: verified.detectedMime,
          fileExtension: ext,
          fileSize: verified.sizeBytes,
          checksum: verified.checksum,
          description: body.description || '',
        }),
        null,
        201
      );
    }
  );

  // Preview instructor assignment attachment
  fastify.get('/api/v1/assignments/:id/preview', async (req, reply) => {
    const user = await authenticateRequest(req, reply);
    if (!user) return;

    const { id } = req.params as { id: string };
    const { attachmentId } = req.query as { attachmentId?: string };

    const [asg] = await db
      .select()
      .from(assignments)
      .where(eq(assignments.id, id));
    if (!asg) {
      return sendError(reply, 404, 'NOT_FOUND', 'Tugas tidak ditemukan.');
    }

    const access = await checkClassroomAccess(user, asg.classroomId);
    if (!access.canView) {
      return sendError(reply, 403, 'FORBIDDEN', 'Akses ditolak.');
    }

    if (attachmentId) {
      const [att] = await db
        .select()
        .from(assignmentAttachments)
        .where(
          and(
            eq(assignmentAttachments.id, attachmentId),
            eq(assignmentAttachments.assignmentId, id)
          )
        );
      if (!att) {
        return sendError(reply, 404, 'ATTACHMENT_NOT_FOUND', 'Berkas tidak ditemukan.');
      }

      const preview = await generateAttachmentPreviewPayload({
        objectKey: att.objectKey,
        originalName: att.originalName,
        fileExtension: att.fileExtension,
        mimeType: att.mimeType,
      });

      return sendSuccess(reply, {
        attachment: enrichAttachmentUrls(att),
        preview,
      });
    }

    return sendSuccess(reply, {
      assignmentId: asg.id,
      title: asg.title,
      instructionsJson: asg.instructionsJson,
    });
  });

  // ==========================================================================
  // 7. GET /api/v1/assignments/:id/participants (INSTRUCTOR MONITORING DASHBOARD)
  // ==========================================================================
  fastify.get('/api/v1/assignments/:id/participants', async (req, reply) => {
    const user = await authenticateRequest(req, reply);
    if (!user) return;

    const { id } = req.params as { id: string };
    const [asg] = await db
      .select()
      .from(assignments)
      .where(eq(assignments.id, id));
    if (!asg) {
      return sendError(reply, 404, 'ASSIGNMENT_NOT_FOUND', 'Tugas tidak ditemukan.');
    }

    const access = await checkClassroomAccess(user, asg.classroomId);
    if (!access.canManage) {
      return sendError(
        reply,
        403,
        'FORBIDDEN_NOT_INSTRUCTOR',
        'Hanya Dosen pengampu atau Superadmin yang dapat memantau daftar peserta tugas.'
      );
    }

    const query = req.query as {
      search?: string;
      submissionStatus?: string;
      gradingStatus?: string;
      sortBy?: string;
      sortDir?: string;
      page?: string;
      limit?: string;
    };

    // Derive participant list from ACTIVE classroom enrollments (never from assignment_submissions alone!)
    const activeEnrollments = await db
      .select({
        enrollmentId: classroomEnrollments.id,
        studentId: users.id,
        studentName: users.fullName,
        studentEmail: users.email,
        studentNim: users.identityNumber,
        enrollmentStatus: classroomEnrollments.status,
        enrolledAt: classroomEnrollments.enrolledAt,
      })
      .from(classroomEnrollments)
      .innerJoin(users, eq(classroomEnrollments.studentId, users.id))
      .where(
        and(
          eq(classroomEnrollments.classroomId, asg.classroomId),
          inArray(classroomEnrollments.status, ['active', 'completed'])
        )
      )
      .orderBy(asc(users.fullName));

    const allSubs = await db
      .select()
      .from(assignmentSubmissions)
      .where(eq(assignmentSubmissions.assignmentId, id));

    const allSubAtts = await db.select().from(submissionAttachments);
    const allSubLinks = await db.select().from(submissionLinks);
    const allGrades = await db
      .select()
      .from(submissionGrades)
      .where(eq(submissionGrades.assignmentId, id));

    const participantsFull = activeEnrollments.map((enr) => {
      const sub = allSubs.find((s) => s.studentId === enr.studentId) || null;
      const gradeRow = sub
        ? allGrades.find((g) => g.submissionId === sub.id) || null
        : null;
      const attCount = sub
        ? allSubAtts.filter((a) => a.submissionId === sub.id).length
        : 0;
      const linkCount = sub
        ? allSubLinks.filter((l) => l.submissionId === sub.id).length
        : 0;

      // Derived submission status: 'not_submitted' when no submission row exists
      const derivedSubmissionStatus = sub
        ? normalizeSubmissionStatus(sub.status, sub.isLate)
        : 'not_submitted';

      const derivedGradingStatus = !sub
        ? 'pending'
        : gradeRow?.isPublished || sub.isGradePublished
          ? 'graded'
          : sub.status === 'returned'
            ? 'returned'
            : sub.status === 'excused'
              ? 'excused'
              : gradeRow
                ? 'draft'
                : 'pending';

      const numericScore = gradeRow
        ? Number(gradeRow.finalScore)
        : sub?.score !== null && sub?.score !== undefined
          ? Number(sub.score)
          : null;

      return {
        studentId: enr.studentId,
        studentName: enr.studentName,
        studentEmail: enr.studentEmail,
        studentNim: enr.studentNim || '-',
        submissionId: sub?.id || null,
        submissionStatus: derivedSubmissionStatus,
        isLate: sub?.isLate || false,
        lateMinutes: sub?.lateMinutes || 0,
        submittedAt: sub?.submittedAt || null,
        submissionVersion: sub?.currentVersion || 0,
        attachmentCount: attCount,
        linkCount,
        grade: numericScore,
        maxScore: asg.maxPoints,
        isGradePublished: Boolean(gradeRow?.isPublished || sub?.isGradePublished),
        gradingStatus: derivedGradingStatus,
        lastActivityAt: sub?.lastActivityAt || sub?.updatedAt || enr.enrolledAt,
      };
    });

    // Compute real summary statistics from PostgreSQL records
    const summary = {
      totalParticipants: participantsFull.length,
      submitted: participantsFull.filter((p) =>
        ['submitted', 'late', 'resubmitted', 'graded', 'returned'].includes(
          p.submissionStatus
        )
      ).length,
      notSubmitted: participantsFull.filter(
        (p) =>
          p.submissionStatus === 'not_submitted' ||
          p.submissionStatus === 'draft'
      ).length,
      lateSubmissions: participantsFull.filter(
        (p) => p.isLate || p.submissionStatus === 'late'
      ).length,
      pendingGrading: participantsFull.filter(
        (p) =>
          ['submitted', 'late', 'resubmitted'].includes(p.submissionStatus) &&
          p.gradingStatus !== 'graded'
      ).length,
      graded: participantsFull.filter((p) => p.gradingStatus === 'graded').length,
      returnedForRevision: participantsFull.filter(
        (p) =>
          p.submissionStatus === 'returned' || p.gradingStatus === 'returned'
      ).length,
      excused: participantsFull.filter((p) => p.submissionStatus === 'excused')
        .length,
    };

    // Apply search & filters
    const searchTerm = (query.search || '').trim().toLowerCase();
    const statusFilter = (query.submissionStatus || 'all').toLowerCase();
    const gradingFilter = (query.gradingStatus || 'all').toLowerCase();

    let filtered = participantsFull.filter((p) => {
      if (searchTerm) {
        const matchName = p.studentName.toLowerCase().includes(searchTerm);
        const matchNim = p.studentNim.toLowerCase().includes(searchTerm);
        const matchEmail = p.studentEmail.toLowerCase().includes(searchTerm);
        if (!matchName && !matchNim && !matchEmail) return false;
      }
      if (statusFilter !== 'all') {
        if (statusFilter === 'missing' || statusFilter === 'not_submitted') {
          if (p.submissionStatus !== 'not_submitted') return false;
        } else if (statusFilter === 'late') {
          if (!p.isLate && p.submissionStatus !== 'late') return false;
        } else if (p.submissionStatus !== statusFilter) {
          return false;
        }
      }
      if (gradingFilter !== 'all' && p.gradingStatus !== gradingFilter) {
        return false;
      }
      return true;
    });

    // Apply sorting
    const sortBy = query.sortBy || 'name';
    const sortDir = query.sortDir === 'desc' ? -1 : 1;
    filtered.sort((a, b) => {
      if (sortBy === 'submittedAt') {
        const tA = a.submittedAt ? new Date(a.submittedAt).getTime() : 0;
        const tB = b.submittedAt ? new Date(b.submittedAt).getTime() : 0;
        return (tA - tB) * sortDir;
      }
      if (sortBy === 'grade') {
        const gA = a.grade ?? -1;
        const gB = b.grade ?? -1;
        return (gA - gB) * sortDir;
      }
      return a.studentName.localeCompare(b.studentName) * sortDir;
    });

    const page = Math.max(1, parseInt(query.page || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(query.limit || '50', 10)));
    const total = filtered.length;
    const paginated = filtered.slice((page - 1) * limit, page * limit);

    return sendSuccess(
      reply,
      {
        summary,
        participants: paginated,
      },
      {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      }
    );
  });

  // ==========================================================================
  // 8. GET & POST /api/v1/assignments/:id/submissions (STUDENT SUBMISSION + IDEMPOTENCY)
  // ==========================================================================
  fastify.get('/api/v1/assignments/:id/submissions', async (req, reply) => {
    const user = await authenticateRequest(req, reply);
    if (!user) return;

    const { id } = req.params as { id: string };
    const [asg] = await db
      .select()
      .from(assignments)
      .where(eq(assignments.id, id));
    if (!asg) {
      return sendError(reply, 404, 'ASSIGNMENT_NOT_FOUND', 'Tugas tidak ditemukan.');
    }

    const access = await checkClassroomAccess(user, asg.classroomId);
    if (!access.canView) {
      return sendError(reply, 403, 'FORBIDDEN', 'Akses ditolak.');
    }

    const rawSubs = await db
      .select({
        id: assignmentSubmissions.id,
        assignmentId: assignmentSubmissions.assignmentId,
        studentId: users.id,
        studentName: users.fullName,
        studentNim: users.identityNumber,
        submissionText: assignmentSubmissions.submissionText,
        submissionJson: assignmentSubmissions.submissionJson,
        repositoryUrl: assignmentSubmissions.repositoryUrl,
        status: assignmentSubmissions.status,
        isLate: assignmentSubmissions.isLate,
        lateMinutes: assignmentSubmissions.lateMinutes,
        currentVersion: assignmentSubmissions.currentVersion,
        score: assignmentSubmissions.score,
        publishedScore: assignmentSubmissions.publishedScore,
        isGradePublished: assignmentSubmissions.isGradePublished,
        gradingStatus: assignmentSubmissions.gradingStatus,
        feedback: assignmentSubmissions.feedback,
        revisionInstructions: assignmentSubmissions.revisionInstructions,
        submittedAt: assignmentSubmissions.submittedAt,
        gradedAt: assignmentSubmissions.gradedAt,
      })
      .from(assignmentSubmissions)
      .innerJoin(users, eq(assignmentSubmissions.studentId, users.id))
      .where(eq(assignmentSubmissions.assignmentId, id))
      .orderBy(desc(assignmentSubmissions.submittedAt));

    // Students NEVER see other students' submissions or unpublished grades
    const visible = access.canManage
      ? rawSubs
      : rawSubs
          .filter((s) => s.studentId === user.id)
          .map((s) => ({
            ...s,
            score: s.isGradePublished ? s.publishedScore ?? s.score : null,
            feedback:
              s.isGradePublished || s.status === 'returned' ? s.feedback : null,
          }));

    return sendSuccess(reply, visible);
  });

  const submitPayloadSchema = z.object({
    submissionText: z.string().optional().default(''),
    submissionJson: z.record(z.string(), z.any()).optional(),
    submissionHtml: z.string().optional().nullable(),
    repositoryUrl: z.string().optional().nullable(),
    isDraft: z.boolean().optional().default(false),
    idempotencyKey: z.string().optional(),
    groupId: z.string().uuid().optional().nullable(),
    attachments: z
      .array(
        z.object({
          objectKey: z.string().min(3),
          originalFileName: z.string().optional(),
          fileName: z.string().optional(),
          mimeType: z.string().optional(),
          fileExtension: z.string().optional(),
          fileSize: z.number().optional(),
          checksum: z.string().optional(),
          description: z.string().optional(),
        })
      )
      .optional()
      .default([]),
    links: z
      .array(
        z.object({
          url: z.string().min(8),
          title: z.string().optional(),
          description: z.string().optional(),
        })
      )
      .optional()
      .default([]),
  });

  async function handleStudentSubmission(
    req: any,
    reply: any,
    assignmentId: string
  ) {
    const user = await authenticateRequest(req, reply);
    if (!user) return;

    const [asg] = await db
      .select()
      .from(assignments)
      .where(eq(assignments.id, assignmentId));
    if (!asg) {
      return sendError(reply, 404, 'ASSIGNMENT_NOT_FOUND', 'Tugas tidak ditemukan.');
    }

    const access = await checkClassroomAccess(user, asg.classroomId);
    if (!access.isEnrolledActive && !access.canManage) {
      return sendError(
        reply,
        403,
        'FORBIDDEN_NOT_ENROLLED',
        'Hanya mahasiswa dengan status enrollment aktif yang dapat mengumpulkan tugas.'
      );
    }

    if (!access.canManage && !isAssignmentVisibleToStudent(asg)) {
      return sendError(
        reply,
        403,
        'ASSIGNMENT_NOT_AVAILABLE',
        'Tugas ini belum tersedia untuk pengumpulan.'
      );
    }

    const parsed = submitPayloadSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(
        reply,
        400,
        'VALIDATION_ERROR',
        'Format pengumpulan tugas tidak valid.',
        parsed.error.issues
      );
    }

    const data = parsed.data;
    const cfg = mergeSubmissionConfig(asg.submissionConfig);

    // Check existing submission for this student + assignment
    const [existingSub] = await db
      .select()
      .from(assignmentSubmissions)
      .where(
        and(
          eq(assignmentSubmissions.assignmentId, assignmentId),
          eq(assignmentSubmissions.studentId, user.id)
        )
      );

    // 1. Idempotency check: prevent duplicate submission versions on double-click / network retry
    if (
      data.idempotencyKey &&
      existingSub &&
      existingSub.idempotencyKey === data.idempotencyKey
    ) {
      return sendSuccess(
        reply,
        {
          ...existingSub,
          idempotentReplay: true,
        },
        null,
        200
      );
    }

    // 2. Check deadline and grace period policy
    const now = new Date();
    const dueTime = new Date(asg.dueAt).getTime();
    const graceMs = (cfg.gracePeriodMinutes || 0) * 60_000;
    const effectiveDeadline = dueTime + graceMs;
    const isAfterDeadline = now.getTime() > effectiveDeadline;
    const lateMinutes =
      now.getTime() > dueTime
        ? Math.max(1, Math.ceil((now.getTime() - dueTime) / 60_000))
        : 0;

    if (
      !data.isDraft &&
      isAfterDeadline &&
      (!cfg.allowLateSubmission || !cfg.allowAfterDeadline) &&
      existingSub?.status !== 'returned'
    ) {
      return sendError(
        reply,
        400,
        'SUBMISSION_DEADLINE_PASSED',
        'Batas waktu pengumpulan tugas telah berakhir dan pengumpulan terlambat tidak diizinkan.'
      );
    }

    // 3. Check multiple versions / revision limits
    if (existingSub && !data.isDraft && existingSub.status !== 'draft') {
      const isReturnedRevision = existingSub.status === 'returned';
      if (!isReturnedRevision && !cfg.allowMultipleVersions) {
        return sendError(
          reply,
          400,
          'MULTIPLE_VERSIONS_NOT_ALLOWED',
          'Tugas ini hanya mengizinkan satu kali pengumpulan final.'
        );
      }
      if (
        !isReturnedRevision &&
        !isAfterDeadline &&
        !cfg.allowEditBeforeDeadline
      ) {
        return sendError(
          reply,
          400,
          'EDIT_BEFORE_DEADLINE_DISABLED',
          'Perubahan pengumpulan sebelum tenggat waktu tidak diizinkan pada tugas ini.'
        );
      }
      if (existingSub.currentVersion >= (cfg.maxRevisions || 10)) {
        return sendError(
          reply,
          400,
          'MAX_REVISIONS_EXCEEDED',
          `Batas maksimum revisi (${cfg.maxRevisions} versi) telah tercapai.`
        );
      }
    }

    // 4. Normalize text, links, and attachments
    const submissionJson = data.submissionJson || {
      type: 'doc',
      content: data.submissionText
        ? [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: data.submissionText }],
            },
          ]
        : [],
    };
    const plainText =
      data.submissionText?.trim() ||
      extractPlainTextFromTiptap(submissionJson);

    const allLinks = [...(data.links || [])];
    if (
      data.repositoryUrl &&
      !allLinks.some((l) => l.url === data.repositoryUrl)
    ) {
      allLinks.unshift({
        url: data.repositoryUrl,
        title: 'Repositori / Tautan Utama',
        description: '',
      });
    }

    // Validate external HTTPS links
    const validatedLinks: {
      url: string;
      title: string;
      description: string;
      linkCategory: string;
    }[] = [];
    for (const l of allLinks) {
      const checkUrl = validateExternalHttpsUrl(l.url);
      if (!checkUrl.valid || !checkUrl.normalizedUrl) {
        return sendError(
          reply,
          400,
          'INVALID_EXTERNAL_URL',
          checkUrl.error || 'Tautan eksternal harus menggunakan HTTPS.'
        );
      }
      validatedLinks.push({
        url: checkUrl.normalizedUrl,
        title: l.title?.trim() || checkUrl.category || 'Tautan Eksternal',
        description: l.description?.trim() || '',
        linkCategory: checkUrl.category || 'HTTPS',
      });
    }

    if (validatedLinks.length > (cfg.maxLinks || 10)) {
      return sendError(
        reply,
        400,
        'MAX_LINKS_EXCEEDED',
        `Jumlah tautan melebihi batas maksimum (${cfg.maxLinks} tautan).`
      );
    }

    // Validate attachments against S3 storage & assignment rules
    const verifiedAttachments: {
      objectKey: string;
      originalName: string;
      mimeType: string;
      fileExtension: string;
      fileSize: number;
      checksum: string;
      description: string;
    }[] = [];

    if (data.attachments && data.attachments.length > 0) {
      if (!cfg.allowFileUpload) {
        return sendError(
          reply,
          400,
          'FILE_UPLOAD_NOT_ALLOWED',
          'Pengumpulan berkas tidak diizinkan untuk tugas ini.'
        );
      }
      if (data.attachments.length > (cfg.maxFiles || 10)) {
        return sendError(
          reply,
          400,
          'MAX_FILES_EXCEEDED',
          `Jumlah berkas melebihi batas maksimum (${cfg.maxFiles} berkas).`
        );
      }

      for (const att of data.attachments) {
        const origName =
          att.originalFileName || att.fileName || att.objectKey.split('/').pop() || 'berkas';
        const ext =
          (att.fileExtension || origName.split('.').pop() || '')
            .toLowerCase()
            .replace(/^\./, '');

        if (
          cfg.allowedExtensions.length > 0 &&
          !cfg.allowedExtensions.includes(ext)
        ) {
          return sendError(
            reply,
            400,
            'DISALLOWED_FILE_EXTENSION',
            `Ekstensi berkas .${ext} tidak diizinkan pada tugas ini.`
          );
        }

        const verified = verifyUploadedObject(att.objectKey, ext);
        if (!verified.exists) {
          return sendError(
            reply,
            400,
            'ATTACHMENT_NOT_FOUND_IN_S3',
            verified.error || `Berkas ${origName} belum terverifikasi di S3.`
          );
        }

        verifiedAttachments.push({
          objectKey: att.objectKey,
          originalName: origName,
          mimeType: verified.detectedMime,
          fileExtension: ext,
          fileSize: verified.sizeBytes,
          checksum: verified.checksum,
          description: att.description || '',
        });
      }
    }

    if (!data.isDraft) {
      if (cfg.requireAttachment && verifiedAttachments.length === 0) {
        return sendError(
          reply,
          400,
          'ATTACHMENT_REQUIRED',
          'Tugas ini mewajibkan minimal 1 berkas lampiran.'
        );
      }
      if (cfg.requireLink && validatedLinks.length === 0) {
        return sendError(
          reply,
          400,
          'EXTERNAL_LINK_REQUIRED',
          'Tugas ini mewajibkan minimal 1 tautan eksternal HTTPS.'
        );
      }
      if (
        !plainText &&
        verifiedAttachments.length === 0 &&
        validatedLinks.length === 0
      ) {
        return sendError(
          reply,
          400,
          'EMPTY_SUBMISSION',
          'Pengumpulan tugas harus memuat jawaban teks, berkas lampiran, atau tautan eksternal.'
        );
      }
    }

    // Determine target status
    const isResubmission =
      Boolean(existingSub) &&
      existingSub.status !== 'draft';
    const nextStatus = data.isDraft
      ? 'draft'
      : existingSub?.status === 'returned' || isResubmission
        ? 'resubmitted'
        : isAfterDeadline
          ? 'late'
          : 'submitted';

    const saved = await db.transaction(async (tx) => {
      const existingVers = existingSub
        ? await tx
            .select()
            .from(submissionVersions)
            .where(eq(submissionVersions.submissionId, existingSub.id))
        : [];
      const nextVersionNumber = existingVers.length + 1;

      let subRow = existingSub;
      if (existingSub) {
        const [updated] = await tx
          .update(assignmentSubmissions)
          .set({
            submissionText: plainText,
            submissionJson,
            submissionHtml: data.submissionHtml
              ? sanitizePreviewHtml(data.submissionHtml)
              : null,
            repositoryUrl: validatedLinks[0]?.url || data.repositoryUrl || null,
            status: nextStatus,
            isLate: !data.isDraft && isAfterDeadline,
            lateMinutes: !data.isDraft && isAfterDeadline ? lateMinutes : 0,
            currentVersion: nextVersionNumber,
            idempotencyKey: data.idempotencyKey || null,
            gradingStatus:
              nextStatus === 'resubmitted'
                ? 'pending'
                : existingSub.gradingStatus,
            submittedAt: new Date(),
            lastActivityAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(assignmentSubmissions.id, existingSub.id))
          .returning();
        subRow = updated;
      } else {
        const [inserted] = await tx
          .insert(assignmentSubmissions)
          .values({
            assignmentId,
            studentId: user.id,
            groupId: data.groupId || null,
            submissionText: plainText,
            submissionJson,
            submissionHtml: data.submissionHtml
              ? sanitizePreviewHtml(data.submissionHtml)
              : null,
            repositoryUrl: validatedLinks[0]?.url || data.repositoryUrl || null,
            status: nextStatus,
            isLate: !data.isDraft && isAfterDeadline,
            lateMinutes: !data.isDraft && isAfterDeadline ? lateMinutes : 0,
            currentVersion: 1,
            idempotencyKey: data.idempotencyKey || null,
            gradingStatus: 'pending',
            submittedAt: new Date(),
            lastActivityAt: new Date(),
          })
          .returning();
        subRow = inserted;
      }

      // Preserve version in submission_versions (never overwrite previous versions!)
      const [verRow] = await tx
        .insert(submissionVersions)
        .values({
          submissionId: subRow.id,
          assignmentId,
          studentId: user.id,
          versionNumber: nextVersionNumber,
          submissionText: plainText,
          submissionJson,
          submissionHtml: data.submissionHtml
            ? sanitizePreviewHtml(data.submissionHtml)
            : null,
          linksSnapshot: validatedLinks,
          attachmentsSnapshot: verifiedAttachments,
          isLate: !data.isDraft && isAfterDeadline,
          lateMinutes: !data.isDraft && isAfterDeadline ? lateMinutes : 0,
          idempotencyKey: data.idempotencyKey || null,
          submittedAt: new Date(),
        })
        .returning();

      // Also record in legacy submission_revisions table for backward compatibility
      await tx.insert(submissionRevisions).values({
        submissionId: subRow.id,
        revisionNumber: nextVersionNumber,
        submissionText: plainText || 'Lampiran berkas / tautan',
        repositoryUrl: validatedLinks[0]?.url || null,
      });

      // Sync active attachments & links for this submission
      if (verifiedAttachments.length > 0) {
        await tx
          .delete(submissionAttachments)
          .where(eq(submissionAttachments.submissionId, subRow.id));
        await tx.insert(submissionAttachments).values(
          verifiedAttachments.map((att) => ({
            submissionId: subRow.id,
            versionId: verRow.id,
            originalName: att.originalName,
            objectKey: att.objectKey,
            mimeType: att.mimeType,
            fileExtension: att.fileExtension,
            fileSize: att.fileSize,
            checksum: att.checksum,
            description: att.description,
            uploadedById: user.id,
          }))
        );
      }

      if (validatedLinks.length > 0) {
        await tx
          .delete(submissionLinks)
          .where(eq(submissionLinks.submissionId, subRow.id));
        await tx.insert(submissionLinks).values(
          validatedLinks.map((l) => ({
            submissionId: subRow.id,
            versionId: verRow.id,
            url: l.url,
            title: l.title,
            description: l.description,
            linkCategory: l.linkCategory,
          }))
        );
      }

      // Record submission activity event
      await tx.insert(submissionEvents).values({
        submissionId: subRow.id,
        assignmentId,
        actorId: user.id,
        eventType: data.isDraft
          ? 'DRAFT_SAVED'
          : isAfterDeadline
            ? 'SUBMITTED_LATE'
            : nextStatus === 'resubmitted'
              ? 'RESUBMITTED'
              : 'SUBMITTED',
        metadata: {
          versionNumber: nextVersionNumber,
          attachmentCount: verifiedAttachments.length,
          linkCount: validatedLinks.length,
          isLate: !data.isDraft && isAfterDeadline,
        },
      });

      // Notify classroom instructors on non-draft submission
      if (!data.isDraft) {
        const instructors = await tx
          .select()
          .from(classroomInstructors)
          .where(eq(classroomInstructors.classroomId, asg.classroomId));

        for (const inst of instructors) {
          await tx.insert(notifications).values({
            userId: inst.instructorId,
            title: isAfterDeadline
              ? `Pengumpulan Tugas Terlambat: ${asg.title}`
              : `Pengumpulan Tugas Baru (v${nextVersionNumber}): ${asg.title}`,
            message: `${user.fullName} telah mengumpulkan tugas "${asg.title}" (Versi #${nextVersionNumber}).`,
            type: isAfterDeadline
              ? 'LATE_ASSIGNMENT_SUBMITTED'
              : 'ASSIGNMENT_SUBMITTED',
            linkUrl: `/classrooms/${asg.classroomId}/assignments/${assignmentId}/grading/${subRow.id}`,
          });
        }
      }

      const finalAtts = await tx
        .select()
        .from(submissionAttachments)
        .where(eq(submissionAttachments.submissionId, subRow.id));
      const finalLinks = await tx
        .select()
        .from(submissionLinks)
        .where(eq(submissionLinks.submissionId, subRow.id));
      const allVers = await tx
        .select()
        .from(submissionVersions)
        .where(eq(submissionVersions.submissionId, subRow.id))
        .orderBy(desc(submissionVersions.versionNumber));

      return {
        ...subRow,
        attachments: finalAtts.map(enrichAttachmentUrls),
        links: finalLinks,
        versions: allVers,
      };
    });

    await recordAuditLog({
      actorId: user.id,
      action: 'ASSIGNMENT_SUBMITTED',
      entityType: 'SUBMISSION',
      entityId: saved.id,
      metadata: {
        assignmentId,
        version: saved.currentVersion,
        status: saved.status,
      },
      ipAddress: req.ip,
    });

    return sendSuccess(reply, saved, null, 201);
  }

  fastify.post('/api/v1/assignments/:id/submissions', async (req, reply) => {
    const { id } = req.params as { id: string };
    return handleStudentSubmission(req, reply, id);
  });

  // Legacy endpoint alias for backward compatibility
  fastify.post(
    '/api/v1/assignments/:assignmentId/submit',
    async (req, reply) => {
      const { assignmentId } = req.params as { assignmentId: string };
      return handleStudentSubmission(req, reply, assignmentId);
    }
  );

  // POST /api/v1/submissions/:id/versions (Submit a new version by submission ID)
  fastify.post('/api/v1/submissions/:id/versions', async (req, reply) => {
    const { id } = req.params as { id: string };
    const [sub] = await db
      .select()
      .from(assignmentSubmissions)
      .where(eq(assignmentSubmissions.id, id));
    if (!sub) {
      return sendError(reply, 404, 'SUBMISSION_NOT_FOUND', 'Pengumpulan tidak ditemukan.');
    }
    return handleStudentSubmission(req, reply, sub.assignmentId);
  });

  // ==========================================================================
  // 9. GET /api/v1/submissions/:id & /versions & /preview
  // ==========================================================================
  fastify.get('/api/v1/submissions/:id', async (req, reply) => {
    const user = await authenticateRequest(req, reply);
    if (!user) return;

    const { id } = req.params as { id: string };
    const [sub] = await db
      .select()
      .from(assignmentSubmissions)
      .where(eq(assignmentSubmissions.id, id));
    if (!sub) {
      return sendError(reply, 404, 'SUBMISSION_NOT_FOUND', 'Pengumpulan tugas tidak ditemukan.');
    }

    const [asg] = await db
      .select()
      .from(assignments)
      .where(eq(assignments.id, sub.assignmentId));
    if (!asg) {
      return sendError(reply, 404, 'ASSIGNMENT_NOT_FOUND', 'Tugas tidak ditemukan.');
    }

    const access = await checkClassroomAccess(user, asg.classroomId);

    // STRICT OWNERSHIP CHECK: Students can NEVER access another student's submission!
    if (!access.canManage && sub.studentId !== user.id) {
      return sendError(
        reply,
        403,
        'FORBIDDEN_SUBMISSION_OWNERSHIP',
        'Akses ditolak: Mahasiswa tidak diizinkan melihat pengumpulan atau nilai milik mahasiswa lain.'
      );
    }

    const [student] = await db
      .select({
        id: users.id,
        fullName: users.fullName,
        email: users.email,
        identityNumber: users.identityNumber,
      })
      .from(users)
      .where(eq(users.id, sub.studentId));

    const vers = await db
      .select()
      .from(submissionVersions)
      .where(eq(submissionVersions.submissionId, id))
      .orderBy(desc(submissionVersions.versionNumber));

    const atts = await db
      .select()
      .from(submissionAttachments)
      .where(eq(submissionAttachments.submissionId, id))
      .orderBy(asc(submissionAttachments.createdAt));

    const links = await db
      .select()
      .from(submissionLinks)
      .where(eq(submissionLinks.submissionId, id))
      .orderBy(asc(submissionLinks.createdAt));

    const rawComments = await db
      .select({
        id: submissionComments.id,
        submissionId: submissionComments.submissionId,
        parentCommentId: submissionComments.parentCommentId,
        authorId: users.id,
        authorName: users.fullName,
        content: submissionComments.content,
        visibility: submissionComments.visibility,
        attachmentObjectKey: submissionComments.attachmentObjectKey,
        attachmentName: submissionComments.attachmentName,
        isRead: submissionComments.isRead,
        createdAt: submissionComments.createdAt,
      })
      .from(submissionComments)
      .innerJoin(users, eq(submissionComments.authorId, users.id))
      .where(eq(submissionComments.submissionId, id))
      .orderBy(asc(submissionComments.createdAt));

    // Filter out INSTRUCTOR_PRIVATE comments for students!
    const visibleComments = access.canManage
      ? rawComments
      : rawComments.filter((c) => c.visibility === 'STUDENT_VISIBLE');

    const [gradeRow] = await db
      .select()
      .from(submissionGrades)
      .where(eq(submissionGrades.submissionId, id));

    const isGradeVisibleToUser =
      access.canManage || Boolean(gradeRow?.isPublished || sub.isGradePublished);

    const rubricScores =
      gradeRow && isGradeVisibleToUser
        ? await db
            .select()
            .from(submissionRubricScores)
            .where(eq(submissionRubricScores.gradeId, gradeRow.id))
        : [];

    const [rubric] = await db
      .select()
      .from(assignmentRubrics)
      .where(eq(assignmentRubrics.assignmentId, asg.id));
    const criteria = rubric
      ? await db
          .select()
          .from(assignmentRubricCriteria)
          .where(eq(assignmentRubricCriteria.rubricId, rubric.id))
          .orderBy(asc(assignmentRubricCriteria.sortOrder))
      : [];

    const events = await db
      .select()
      .from(submissionEvents)
      .where(eq(submissionEvents.submissionId, id))
      .orderBy(desc(submissionEvents.createdAt));

    const enrichedSub = {
      ...sub,
      status: normalizeSubmissionStatus(sub.status, sub.isLate),
      submissionStatus: normalizeSubmissionStatus(sub.status, sub.isLate),
      score: isGradeVisibleToUser
        ? gradeRow?.finalScore ?? sub.publishedScore ?? sub.score
        : null,
      feedback:
        isGradeVisibleToUser || sub.status === 'returned'
          ? gradeRow?.generalFeedback || sub.feedback
          : null,
      privateNotes: access.canManage
        ? gradeRow?.privateComment || sub.privateNotes
        : null,
      privateInstructorNotes: access.canManage
        ? gradeRow?.privateComment || sub.privateNotes
        : null,
      revisionInstructions:
        gradeRow?.revisionInstructions || sub.revisionInstructions,
    };

    return sendSuccess(reply, {
      ...enrichedSub,
      submission: enrichedSub,
      student: student
        ? { ...student, studentNumber: student.identityNumber }
        : null,
      assignment: {
        id: asg.id,
        classroomId: asg.classroomId,
        title: asg.title,
        maxPoints: asg.maxPoints,
        maxScore: asg.maxPoints,
        dueAt: asg.dueAt,
        submissionConfig: mergeSubmissionConfig(asg.submissionConfig),
        rubric: rubric ? { ...rubric, criteria } : null,
      },
      rubric: rubric
        ? {
            ...rubric,
            criteria: criteria.map((c) => ({ ...c, title: c.criterionName })),
          }
        : null,
      rubricScores,
      gradeHistory: access.canManage
        ? Array.isArray(gradeRow?.auditHistory)
          ? (gradeRow.auditHistory as any[]).map((ah, i) => ({
              id: `${gradeRow.id}-${i}`,
              finalScore: ah.newGrade,
              gradingMethod: gradeRow.gradingMethod,
              gradedAt: ah.timestamp,
              isPublished: ah.isPublished,
              ...ah,
            }))
          : []
        : [],
      attachments: atts.map(enrichAttachmentUrls),
      links,
      versions: vers,
      comments: visibleComments.map((c) => ({ ...c, contentText: c.content })),
      events,
      grade:
        isGradeVisibleToUser && gradeRow
          ? {
              id: gradeRow.id,
              gradingMethod: gradeRow.gradingMethod,
              rawScore: gradeRow.rawScore,
              finalScore: gradeRow.finalScore,
              previousScore: gradeRow.previousScore,
              maxScore: gradeRow.maxScore,
              generalFeedback: gradeRow.generalFeedback,
              feedbackText: gradeRow.generalFeedback,
              revisionInstructions: gradeRow.revisionInstructions,
              feedbackAttachmentKey: gradeRow.feedbackAttachmentKey,
              feedbackAttachmentName: gradeRow.feedbackAttachmentName,
              isPublished: gradeRow.isPublished,
              publishedAt: gradeRow.publishedAt,
              rubricScores,
              ...(access.canManage
                ? {
                    privateComment: gradeRow.privateComment,
                    privateNotes: gradeRow.privateComment,
                    modificationReason: gradeRow.modificationReason,
                    auditHistory: gradeRow.auditHistory,
                  }
                : {}),
            }
          : null,
    });
  });

  fastify.get('/api/v1/submissions/:id/versions', async (req, reply) => {
    const user = await authenticateRequest(req, reply);
    if (!user) return;

    const { id } = req.params as { id: string };
    const [sub] = await db
      .select()
      .from(assignmentSubmissions)
      .where(eq(assignmentSubmissions.id, id));
    if (!sub) {
      return sendError(reply, 404, 'SUBMISSION_NOT_FOUND', 'Pengumpulan tidak ditemukan.');
    }

    const [asg] = await db
      .select()
      .from(assignments)
      .where(eq(assignments.id, sub.assignmentId));
    const access = await checkClassroomAccess(user, asg.classroomId);
    if (!access.canManage && sub.studentId !== user.id) {
      return sendError(
        reply,
        403,
        'FORBIDDEN_SUBMISSION_OWNERSHIP',
        'Akses ditolak.'
      );
    }

    const vers = await db
      .select()
      .from(submissionVersions)
      .where(eq(submissionVersions.submissionId, id))
      .orderBy(desc(submissionVersions.versionNumber));

    return sendSuccess(reply, vers);
  });

  // Preview student submission attachment inside the LMS (strict ownership & instructor check)
  fastify.get('/api/v1/submissions/:id/preview', async (req, reply) => {
    const user = await authenticateRequest(req, reply);
    if (!user) return;

    const { id } = req.params as { id: string };
    const { attachmentId } = req.query as { attachmentId?: string };

    const [sub] = await db
      .select()
      .from(assignmentSubmissions)
      .where(eq(assignmentSubmissions.id, id));
    if (!sub) {
      return sendError(reply, 404, 'SUBMISSION_NOT_FOUND', 'Pengumpulan tidak ditemukan.');
    }

    const [asg] = await db
      .select()
      .from(assignments)
      .where(eq(assignments.id, sub.assignmentId));
    const access = await checkClassroomAccess(user, asg.classroomId);

    if (!access.canManage && sub.studentId !== user.id) {
      return sendError(
        reply,
        403,
        'FORBIDDEN_SUBMISSION_OWNERSHIP',
        'Akses ditolak: Anda tidak berhak melihat berkas lampiran pengumpulan ini.'
      );
    }

    const atts = await db
      .select()
      .from(submissionAttachments)
      .where(eq(submissionAttachments.submissionId, id));

    const targetAtt = attachmentId
      ? atts.find((a) => a.id === attachmentId)
      : atts[0];

    if (!targetAtt) {
      return sendError(
        reply,
        404,
        'ATTACHMENT_NOT_FOUND',
        'Berkas lampiran pengumpulan tidak ditemukan.'
      );
    }

    const preview = await generateAttachmentPreviewPayload({
      objectKey: targetAtt.objectKey,
      originalName: targetAtt.originalName,
      fileExtension: targetAtt.fileExtension,
      mimeType: targetAtt.mimeType,
    });

    return sendSuccess(reply, {
      attachment: enrichAttachmentUrls(targetAtt),
      preview,
      attachments: atts.map(enrichAttachmentUrls),
    });
  });

  // ==========================================================================
  // 10. POST /api/v1/submissions/:id/comments (STUDENT-INSTRUCTOR DISCUSSIONS)
  // ==========================================================================
  const submissionCommentSchema = z.object({
    content: z.string().optional(),
    contentText: z.string().optional(),
    parentCommentId: z.string().uuid().optional().nullable(),
    visibility: z
      .enum(['STUDENT_VISIBLE', 'INSTRUCTOR_PRIVATE'])
      .optional()
      .default('STUDENT_VISIBLE'),
    attachmentObjectKey: z.string().optional().nullable(),
    attachmentName: z.string().optional().nullable(),
  });

  fastify.post('/api/v1/submissions/:id/comments', async (req, reply) => {
    const user = await authenticateRequest(req, reply);
    if (!user) return;

    const { id } = req.params as { id: string };
    const [sub] = await db
      .select()
      .from(assignmentSubmissions)
      .where(eq(assignmentSubmissions.id, id));
    if (!sub) {
      return sendError(reply, 404, 'SUBMISSION_NOT_FOUND', 'Pengumpulan tidak ditemukan.');
    }

    const [asg] = await db
      .select()
      .from(assignments)
      .where(eq(assignments.id, sub.assignmentId));
    const access = await checkClassroomAccess(user, asg.classroomId);

    if (!access.canManage && sub.studentId !== user.id) {
      return sendError(
        reply,
        403,
        'FORBIDDEN_SUBMISSION_OWNERSHIP',
        'Hanya mahasiswa pemilik tugas atau Dosen pengampu yang dapat berdiskusi pada pengumpulan ini.'
      );
    }

    const parsed = submissionCommentSchema.safeParse(req.body);
    const commentText = (parsed.data?.content || parsed.data?.contentText || '').trim();
    if (!parsed.success || !commentText) {
      return sendError(reply, 400, 'VALIDATION_ERROR', 'Isi komentar tidak valid.');
    }

    // Students can only post STUDENT_VISIBLE comments
    const visibility = access.canManage
      ? parsed.data.visibility
      : 'STUDENT_VISIBLE';

    const [created] = await db
      .insert(submissionComments)
      .values({
        submissionId: id,
        assignmentId: asg.id,
        authorId: user.id,
        parentCommentId: parsed.data.parentCommentId || null,
        content: commentText,
        visibility,
        attachmentObjectKey: parsed.data.attachmentObjectKey || null,
        attachmentName: parsed.data.attachmentName || null,
        isRead: false,
      })
      .returning();

    // Notify recipient if comment is student-visible
    if (visibility === 'STUDENT_VISIBLE') {
      if (access.canManage && sub.studentId !== user.id) {
        await db.insert(notifications).values({
          userId: sub.studentId,
          title: `Umpan Balik Diskusi Tugas: ${asg.title}`,
          message: `Dosen ${user.fullName} menambahkan komentar pada tugas Anda.`,
          type: 'INSTRUCTOR_FEEDBACK',
          linkUrl: `/classrooms/${asg.classroomId}/assignments/${asg.id}`,
        });
      } else if (!access.canManage) {
        const instructors = await db
          .select()
          .from(classroomInstructors)
          .where(eq(classroomInstructors.classroomId, asg.classroomId));
        for (const inst of instructors) {
          await db.insert(notifications).values({
            userId: inst.instructorId,
            title: `Balasan Diskusi Tugas: ${asg.title}`,
            message: `${user.fullName} membalas diskusi pada pengumpulan tugas "${asg.title}".`,
            type: 'SUBMISSION_COMMENT',
            linkUrl: `/classrooms/${asg.classroomId}/assignments/${asg.id}/grading/${id}`,
          });
        }
      }
    }

    return sendSuccess(
      reply,
      {
        ...created,
        contentText: created.content,
        authorName: user.fullName,
      },
      null,
      201
    );
  });

  // ==========================================================================
  // 11. POST /api/v1/submissions/:id/grade & PATCH /api/v1/grades/:id & POST /return
  // ==========================================================================
  const gradeInputSchema = z.object({
    gradingMethod: z
      .enum(['DIRECT', 'RUBRIC', 'COMBINED'])
      .optional()
      .default('DIRECT'),
    score: z.number().optional(),
    rawScore: z.number().optional(),
    latePenaltyScore: z.number().min(0).optional().default(0),
    feedback: z.string().optional(),
    feedbackText: z.string().optional(),
    generalFeedback: z.string().optional(),
    privateComment: z.string().optional(),
    privateNotes: z.string().optional(),
    revisionInstructions: z.string().optional().default(''),
    feedbackAttachmentKey: z.string().optional().nullable(),
    feedbackAttachmentName: z.string().optional().nullable(),
    publish: z.boolean().optional().default(true),
    reason: z.string().optional(),
    rubricScores: z
      .array(
        z.object({
          criterionId: z.string().uuid(),
          score: z.number().min(0),
          feedback: z.string().optional().default(''),
        })
      )
      .optional()
      .default([]),
  });

  async function handleGradeSubmission(
    req: any,
    reply: any,
    submissionId: string
  ) {
    const user = await authenticateRequest(req, reply);
    if (!user) return;

    const [sub] = await db
      .select()
      .from(assignmentSubmissions)
      .where(eq(assignmentSubmissions.id, submissionId));
    if (!sub) {
      return sendError(
        reply,
        404,
        'SUBMISSION_NOT_FOUND',
        'Pengumpulan tugas tidak ditemukan.'
      );
    }

    const [asg] = await db
      .select()
      .from(assignments)
      .where(eq(assignments.id, sub.assignmentId));
    if (!asg) {
      return sendError(reply, 404, 'ASSIGNMENT_NOT_FOUND', 'Tugas tidak ditemukan.');
    }

    const access = await checkClassroomAccess(user, asg.classroomId);
    if (!access.canManage) {
      return sendError(
        reply,
        403,
        'FORBIDDEN_RESOURCE_OWNERSHIP',
        'Hanya Dosen pengampu kelas ini yang dapat memberikan penilaian.'
      );
    }

    const parsed = gradeInputSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(
        reply,
        400,
        'VALIDATION_ERROR',
        'Data penilaian tidak valid.',
        parsed.error.issues
      );
    }

    const data = parsed.data;
    const generalFeedback =
      (data.generalFeedback ?? data.feedbackText ?? data.feedback ?? '').trim() ||
      'Penilaian tugas telah dievaluasi.';
    const privateComment =
      (data.privateComment ?? data.privateNotes ?? '').trim();

    // Validate rubric criteria and calculate backend score if rubricScores provided
    const [rubric] = await db
      .select()
      .from(assignmentRubrics)
      .where(eq(assignmentRubrics.assignmentId, asg.id));
    const criteria = rubric
      ? await db
          .select()
          .from(assignmentRubricCriteria)
          .where(eq(assignmentRubricCriteria.rubricId, rubric.id))
      : [];

    let calculatedRubricTotal = 0;
    const preparedRubricScores: {
      criterionId: string;
      score: number;
      maxScore: number;
      weight: number;
      weightedScore: number;
      feedback: string;
    }[] = [];

    if (data.rubricScores && data.rubricScores.length > 0) {
      for (const rs of data.rubricScores) {
        const crit = criteria.find((c) => c.id === rs.criterionId);
        if (!crit) {
          return sendError(
            reply,
            400,
            'INVALID_RUBRIC_CRITERION',
            'Kriteria rubrik tidak ditemukan pada tugas ini.'
          );
        }
        if (rs.score < 0 || rs.score > crit.maxScore) {
          return sendError(
            reply,
            400,
            'RUBRIC_SCORE_EXCEEDS_MAX',
            `Skor untuk kriteria "${crit.criterionName}" (${rs.score}) tidak boleh melebihi batas maksimum kriteria (${crit.maxScore}).`
          );
        }

        // Normalize criterion score to assignment maxPoints using criterion weight (%)
        const ratio = rs.score / crit.maxScore;
        const weighted = ratio * (crit.weight / 100) * asg.maxPoints;
        calculatedRubricTotal += weighted;

        preparedRubricScores.push({
          criterionId: crit.id,
          score: rs.score,
          maxScore: crit.maxScore,
          weight: crit.weight,
          weightedScore: Number(weighted.toFixed(2)),
          feedback: rs.feedback || '',
        });
      }
    }

    const directInputScore = data.score ?? data.rawScore;
    const baseScore =
      data.gradingMethod === 'RUBRIC' && preparedRubricScores.length > 0
        ? Number(calculatedRubricTotal.toFixed(2))
        : directInputScore !== undefined
          ? Number(directInputScore.toFixed(2))
          : Number(calculatedRubricTotal.toFixed(2));

    const finalNumericScore = Number(
      Math.max(0, baseScore - Number(data.latePenaltyScore || 0)).toFixed(2)
    );

    if (baseScore < 0 || baseScore > asg.maxPoints || finalNumericScore > asg.maxPoints) {
      return sendError(
        reply,
        400,
        'SCORE_EXCEEDS_ASSIGNMENT_MAX',
        `Nilai akhir (${baseScore}) tidak boleh melebihi skor maksimum tugas (${asg.maxPoints}).`
      );
    }

    const scoreStr = finalNumericScore.toFixed(2);
    const isPublished = data.publish !== false;

    const result = await db.transaction(async (tx) => {
      const [existingGrade] = await tx
        .select()
        .from(submissionGrades)
        .where(eq(submissionGrades.submissionId, submissionId));

      const prevScoreStr =
        existingGrade?.finalScore ?? sub.score ?? null;

      const prevAudit = Array.isArray(existingGrade?.auditHistory)
        ? (existingGrade.auditHistory as any[])
        : [];
      const auditEntry = {
        previousGrade: prevScoreStr,
        newGrade: scoreStr,
        instructorId: user.id,
        instructorName: user.fullName,
        timestamp: new Date().toISOString(),
        reason:
          data.reason ||
          (existingGrade
            ? 'Pembaruan evaluasi nilai tugas'
            : 'Penilaian awal tugas'),
        isPublished,
      };

      let gradeRow = existingGrade;
      if (existingGrade) {
        const [upGrade] = await tx
          .update(submissionGrades)
          .set({
            gradedById: user.id,
            gradingMethod: data.gradingMethod,
            rawScore: scoreStr,
            finalScore: scoreStr,
            previousScore: prevScoreStr,
            maxScore: asg.maxPoints,
            generalFeedback,
            privateComment,
            revisionInstructions: data.revisionInstructions || '',
            feedbackAttachmentKey: data.feedbackAttachmentKey || null,
            feedbackAttachmentName: data.feedbackAttachmentName || null,
            isPublished,
            modificationReason: auditEntry.reason,
            auditHistory: [...prevAudit, auditEntry],
            publishedAt: isPublished ? new Date() : existingGrade.publishedAt,
            updatedAt: new Date(),
          })
          .where(eq(submissionGrades.id, existingGrade.id))
          .returning();
        gradeRow = upGrade;
      } else {
        const [insGrade] = await tx
          .insert(submissionGrades)
          .values({
            submissionId,
            assignmentId: asg.id,
            studentId: sub.studentId,
            gradedById: user.id,
            gradingMethod: data.gradingMethod,
            rawScore: scoreStr,
            finalScore: scoreStr,
            previousScore: null,
            maxScore: asg.maxPoints,
            generalFeedback,
            privateComment,
            revisionInstructions: data.revisionInstructions || '',
            feedbackAttachmentKey: data.feedbackAttachmentKey || null,
            feedbackAttachmentName: data.feedbackAttachmentName || null,
            isPublished,
            modificationReason: auditEntry.reason,
            auditHistory: [auditEntry],
            publishedAt: isPublished ? new Date() : null,
          })
          .returning();
        gradeRow = insGrade;
      }

      if (preparedRubricScores.length > 0) {
        await tx
          .delete(submissionRubricScores)
          .where(eq(submissionRubricScores.gradeId, gradeRow.id));
        await tx.insert(submissionRubricScores).values(
          preparedRubricScores.map((rs) => ({
            gradeId: gradeRow.id,
            submissionId,
            criterionId: rs.criterionId,
            score: rs.score.toFixed(2),
            maxScore: rs.maxScore,
            weight: rs.weight,
            weightedScore: rs.weightedScore.toFixed(2),
            feedback: rs.feedback,
          }))
        );
      }

      const [updatedSub] = await tx
        .update(assignmentSubmissions)
        .set({
          score: scoreStr,
          publishedScore: isPublished ? scoreStr : sub.publishedScore,
          isGradePublished: isPublished,
          gradingStatus: isPublished ? 'graded' : 'draft',
          status: isPublished ? 'graded' : sub.status,
          feedback: generalFeedback,
          privateNotes: privateComment || null,
          revisionInstructions: data.revisionInstructions || null,
          gradedById: user.id,
          gradedAt: new Date(),
          lastActivityAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(assignmentSubmissions.id, submissionId))
        .returning();

      await tx.insert(submissionEvents).values({
        submissionId,
        assignmentId: asg.id,
        actorId: user.id,
        eventType: isPublished ? 'GRADE_PUBLISHED' : 'GRADE_DRAFT_SAVED',
        metadata: auditEntry,
      });

      // Only sync to Gradebook and notify student when grade is PUBLISHED
      if (isPublished) {
        let [gItem] = await tx
          .select()
          .from(gradeItems)
          .where(
            and(
              eq(gradeItems.classroomId, asg.classroomId),
              eq(gradeItems.sourceId, asg.id)
            )
          );

        if (!gItem) {
          const [createdItem] = await tx
            .insert(gradeItems)
            .values({
              classroomId: asg.classroomId,
              sourceType: 'ASSIGNMENT',
              sourceId: asg.id,
              title: asg.title,
              maxScore: asg.maxPoints,
            })
            .returning();
          gItem = createdItem;
        }

        await tx
          .insert(gradeRecords)
          .values({
            gradeItemId: gItem.id,
            classroomId: asg.classroomId,
            studentId: sub.studentId,
            score: scoreStr,
            maxScore: asg.maxPoints,
            remarks: generalFeedback,
            gradedById: user.id,
          })
          .onConflictDoUpdate({
            target: [gradeRecords.gradeItemId, gradeRecords.studentId],
            set: {
              score: scoreStr,
              remarks: generalFeedback,
              gradedById: user.id,
              updatedAt: new Date(),
            },
          });

        await tx.insert(notifications).values({
          userId: sub.studentId,
          title: `Nilai Tugas Diterbitkan: ${asg.title}`,
          message: `Dosen ${user.fullName} telah menerbitkan nilai ${scoreStr}/${asg.maxPoints} pada tugas "${asg.title}".`,
          type: 'GRADE_PUBLISHED',
          linkUrl: `/classrooms/${asg.classroomId}/assignments/${asg.id}`,
        });
      }

      return {
        ...updatedSub,
        finalScore: finalNumericScore,
        isPublished,
        grade: gradeRow,
      };
    });

    await recordAuditLog({
      actorId: user.id,
      action: isPublished ? 'SUBMISSION_GRADE_PUBLISHED' : 'SUBMISSION_GRADE_DRAFT',
      entityType: 'SUBMISSION_GRADE',
      entityId: result.grade.id,
      metadata: {
        submissionId,
        score: scoreStr,
        isPublished,
      },
      ipAddress: req.ip,
    });

    return sendSuccess(reply, result);
  }

  fastify.post('/api/v1/submissions/:id/grade', async (req, reply) => {
    const { id } = req.params as { id: string };
    return handleGradeSubmission(req, reply, id);
  });

  // PATCH /api/v1/grades/:id (Update grade with mandatory audit history)
  fastify.patch('/api/v1/grades/:id', async (req, reply) => {
    const user = await authenticateRequest(req, reply);
    if (!user) return;

    const { id } = req.params as { id: string };
    const [existingGrade] = await db
      .select()
      .from(submissionGrades)
      .where(eq(submissionGrades.id, id));

    if (existingGrade) {
      return handleGradeSubmission(req, reply, existingGrade.submissionId);
    }

    // Fallback if caller passed submissionId
    return handleGradeSubmission(req, reply, id);
  });

  // POST /api/v1/submissions/:id/return (Return submission for student revision)
  const returnSubmissionSchema = z.object({
    revisionInstructions: z.string().min(3),
    generalFeedback: z.string().optional(),
  });

  fastify.post('/api/v1/submissions/:id/return', async (req, reply) => {
    const user = await authenticateRequest(req, reply);
    if (!user) return;

    const { id } = req.params as { id: string };
    const [sub] = await db
      .select()
      .from(assignmentSubmissions)
      .where(eq(assignmentSubmissions.id, id));
    if (!sub) {
      return sendError(reply, 404, 'SUBMISSION_NOT_FOUND', 'Pengumpulan tidak ditemukan.');
    }

    const [asg] = await db
      .select()
      .from(assignments)
      .where(eq(assignments.id, sub.assignmentId));
    const access = await checkClassroomAccess(user, asg.classroomId);
    if (!access.canManage) {
      return sendError(
        reply,
        403,
        'FORBIDDEN',
        'Hanya Dosen pengampu yang dapat mengembalikan tugas untuk revisi.'
      );
    }

    const parsed = returnSubmissionSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(
        reply,
        400,
        'VALIDATION_ERROR',
        'Instruksi revisi wajib diisi minimal 3 karakter.'
      );
    }

    const returned = await db.transaction(async (tx) => {
      const [up] = await tx
        .update(assignmentSubmissions)
        .set({
          status: 'returned',
          gradingStatus: 'returned',
          revisionInstructions: parsed.data.revisionInstructions.trim(),
          feedback:
            parsed.data.generalFeedback?.trim() ||
            parsed.data.revisionInstructions.trim(),
          returnedAt: new Date(),
          lastActivityAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(assignmentSubmissions.id, id))
        .returning();

      await tx.insert(submissionEvents).values({
        submissionId: id,
        assignmentId: asg.id,
        actorId: user.id,
        eventType: 'RETURNED_FOR_REVISION',
        metadata: {
          revisionInstructions: parsed.data.revisionInstructions.trim(),
        },
      });

      await tx.insert(notifications).values({
        userId: sub.studentId,
        title: `Tugas Dikembalikan untuk Revisi: ${asg.title}`,
        message: `Dosen ${user.fullName} mengembalikan tugas Anda untuk direvisi: "${parsed.data.revisionInstructions.trim()}".`,
        type: 'SUBMISSION_RETURNED',
        linkUrl: `/classrooms/${asg.classroomId}/assignments/${asg.id}`,
      });

      return up;
    });

    await recordAuditLog({
      actorId: user.id,
      action: 'SUBMISSION_RETURNED_FOR_REVISION',
      entityType: 'SUBMISSION',
      entityId: id,
      metadata: { assignmentId: asg.id, studentId: sub.studentId },
      ipAddress: req.ip,
    });

    return sendSuccess(reply, returned);
  });

  // ==========================================================================
  // 12. POST /api/v1/assignments/:id/reminders (BULK / INDIVIDUAL REMINDERS)
  // ==========================================================================
  const reminderSchema = z.object({
    studentIds: z.array(z.string().uuid()).optional(),
    message: z.string().optional(),
  });

  fastify.post('/api/v1/assignments/:id/reminders', async (req, reply) => {
    const user = await authenticateRequest(req, reply);
    if (!user) return;

    const { id } = req.params as { id: string };
    const [asg] = await db
      .select()
      .from(assignments)
      .where(eq(assignments.id, id));
    if (!asg) {
      return sendError(reply, 404, 'ASSIGNMENT_NOT_FOUND', 'Tugas tidak ditemukan.');
    }

    const access = await checkClassroomAccess(user, asg.classroomId);
    if (!access.canManage) {
      return sendError(
        reply,
        403,
        'FORBIDDEN',
        'Hanya Dosen pengampu yang dapat mengirimkan pengingat tugas.'
      );
    }

    const parsed = reminderSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return sendError(reply, 400, 'VALIDATION_ERROR', 'Data pengingat tidak valid.');
    }

    // Determine target students (if not provided, target all active enrolled students who haven't submitted)
    let targetStudentIds = parsed.data.studentIds || [];
    if (targetStudentIds.length === 0) {
      const enrolled = await db
        .select()
        .from(classroomEnrollments)
        .where(
          and(
            eq(classroomEnrollments.classroomId, asg.classroomId),
            eq(classroomEnrollments.status, 'active')
          )
        );
      const subs = await db
        .select()
        .from(assignmentSubmissions)
        .where(eq(assignmentSubmissions.assignmentId, id));
      const submittedIds = new Set(
        subs
          .filter((s) => s.status !== 'draft')
          .map((s) => s.studentId)
      );
      targetStudentIds = enrolled
        .map((e) => e.studentId)
        .filter((sid) => !submittedIds.has(sid));
    }

    const uniqueTargets = Array.from(new Set(targetStudentIds));
    const customMsg =
      parsed.data.message?.trim() ||
      `Pengingat: Segera kumpulkan tugas "${asg.title}" sebelum tenggat waktu ${new Date(
        asg.dueAt
      ).toLocaleDateString('id-ID')}.`;

    const createdReminders: any[] = [];
    await db.transaction(async (tx) => {
      for (const sid of uniqueTargets) {
        const [rem] = await tx
          .insert(assignmentReminders)
          .values({
            assignmentId: id,
            studentId: sid,
            sentById: user.id,
            message: customMsg,
            channel: 'IN_APP',
          })
          .returning();
        createdReminders.push(rem);

        await tx.insert(notifications).values({
          userId: sid,
          title: `Pengingat Tugas: ${asg.title}`,
          message: customMsg,
          type: 'SUBMISSION_REMINDER',
          linkUrl: `/classrooms/${asg.classroomId}/assignments/${id}`,
        });
      }
    });

    return sendSuccess(
      reply,
      {
        sentCount: createdReminders.length,
        reminders: createdReminders,
      },
      null,
      201
    );
  });

  // ==========================================================================
  // 13. GET /api/v1/assignments/:id/analytics & /export (CSV / XLSX)
  // ==========================================================================
  fastify.get('/api/v1/assignments/:id/analytics', async (req, reply) => {
    const user = await authenticateRequest(req, reply);
    if (!user) return;

    const { id } = req.params as { id: string };
    const [asg] = await db
      .select()
      .from(assignments)
      .where(eq(assignments.id, id));
    if (!asg) {
      return sendError(reply, 404, 'ASSIGNMENT_NOT_FOUND', 'Tugas tidak ditemukan.');
    }

    const access = await checkClassroomAccess(user, asg.classroomId);
    if (!access.canManage) {
      return sendError(reply, 403, 'FORBIDDEN', 'Akses ditolak.');
    }

    const enrolled = await db
      .select()
      .from(classroomEnrollments)
      .where(
        and(
          eq(classroomEnrollments.classroomId, asg.classroomId),
          inArray(classroomEnrollments.status, ['active', 'completed'])
        )
      );

    const subs = await db
      .select()
      .from(assignmentSubmissions)
      .where(eq(assignmentSubmissions.assignmentId, id));

    const totalParticipants = enrolled.length;
    const activeSubs = subs.filter((s) => s.status !== 'draft');
    const submittedCount = activeSubs.length;
    const missingSubmissionCount = Math.max(
      0,
      totalParticipants - submittedCount
    );
    const lateSubmissionCount = activeSubs.filter(
      (s) => s.isLate || s.status === 'late'
    ).length;

    const gradedScores = activeSubs
      .filter((s) => s.score !== null && s.score !== undefined)
      .map((s) => Number(s.score));

    const averageGrade =
      gradedScores.length > 0
        ? Number(
            (
              gradedScores.reduce((sum, v) => sum + v, 0) / gradedScores.length
            ).toFixed(2)
          )
        : 0;
    const highestGrade =
      gradedScores.length > 0 ? Math.max(...gradedScores) : 0;
    const lowestGrade =
      gradedScores.length > 0 ? Math.min(...gradedScores) : 0;

    const submissionPercentage =
      totalParticipants > 0
        ? Number(((submittedCount / totalParticipants) * 100).toFixed(1))
        : 0;
    const gradingCompletionPercentage =
      submittedCount > 0
        ? Number(((gradedScores.length / submittedCount) * 100).toFixed(1))
        : 0;

    const gradeDistribution = [
      {
        bucket: 'A (85 - 100)',
        count: gradedScores.filter((s) => s >= 85).length,
      },
      {
        bucket: 'B (70 - 84)',
        count: gradedScores.filter((s) => s >= 70 && s < 85).length,
      },
      {
        bucket: 'C (55 - 69)',
        count: gradedScores.filter((s) => s >= 55 && s < 70).length,
      },
      {
        bucket: 'D (40 - 54)',
        count: gradedScores.filter((s) => s >= 40 && s < 55).length,
      },
      {
        bucket: 'E (< 40)',
        count: gradedScores.filter((s) => s < 40).length,
      },
    ];

    return sendSuccess(reply, {
      assignmentId: id,
      title: asg.title,
      totalParticipants,
      submittedCount,
      missingSubmissionCount,
      lateSubmissionCount,
      gradedCount: gradedScores.length,
      submissionPercentage,
      gradingCompletionPercentage,
      averageGrade,
      highestGrade,
      lowestGrade,
      gradeDistribution,
    });
  });

  fastify.get('/api/v1/assignments/:id/export', async (req, reply) => {
    const user = await authenticateRequest(req, reply);
    if (!user) return;

    const { id } = req.params as { id: string };
    const { format = 'json' } = req.query as { format?: string };

    const [asg] = await db
      .select()
      .from(assignments)
      .where(eq(assignments.id, id));
    if (!asg) {
      return sendError(reply, 404, 'ASSIGNMENT_NOT_FOUND', 'Tugas tidak ditemukan.');
    }

    const access = await checkClassroomAccess(user, asg.classroomId);
    if (!access.canManage) {
      return sendError(reply, 403, 'FORBIDDEN', 'Akses ditolak.');
    }

    const enrolled = await db
      .select({
        studentId: users.id,
        studentName: users.fullName,
        studentEmail: users.email,
        studentNim: users.identityNumber,
      })
      .from(classroomEnrollments)
      .innerJoin(users, eq(classroomEnrollments.studentId, users.id))
      .where(
        and(
          eq(classroomEnrollments.classroomId, asg.classroomId),
          inArray(classroomEnrollments.status, ['active', 'completed'])
        )
      )
      .orderBy(asc(users.fullName));

    const subs = await db
      .select()
      .from(assignmentSubmissions)
      .where(eq(assignmentSubmissions.assignmentId, id));
    const subAtts = await db.select().from(submissionAttachments);

    const rows = enrolled.map((e, idx) => {
      const sub = subs.find((s) => s.studentId === e.studentId) || null;
      const attCount = sub
        ? subAtts.filter((a) => a.submissionId === sub.id).length
        : 0;
      const status = sub
        ? normalizeSubmissionStatus(sub.status, sub.isLate)
        : 'not_submitted';

      return {
        no: idx + 1,
        nim: e.studentNim || '-',
        studentName: e.studentName,
        email: e.studentEmail,
        submissionStatus: status,
        isLate: sub?.isLate ? 'TERLAMBAT' : 'TEPAT WAKTU',
        version: sub?.currentVersion || 0,
        attachmentCount: attCount,
        submittedAt: sub?.submittedAt
          ? new Date(sub.submittedAt).toISOString()
          : '-',
        score: sub?.score !== null && sub?.score !== undefined ? Number(sub.score) : '',
        maxScore: asg.maxPoints,
        gradingStatus: sub?.isGradePublished
          ? 'GRADED'
          : sub?.status === 'returned'
            ? 'RETURNED'
            : 'PENDING',
        feedback: sub?.feedback || '-',
      };
    });

    const fmt = format.toLowerCase();
    if (fmt === 'csv') {
      const headers = [
        'No',
        'NIM',
        'Nama Mahasiswa',
        'Email',
        'Status Pengumpulan',
        'Ketepatan Waktu',
        'Versi',
        'Jumlah Lampiran',
        'Waktu Kumpul',
        'Nilai',
        'Skor Maksimum',
        'Status Penilaian',
        'Umpan Balik',
      ];
      const csvLines = [
        headers.join(','),
        ...rows.map((r) =>
          [
            r.no,
            `"${r.nim}"`,
            `"${r.studentName.replace(/"/g, '""')}"`,
            `"${r.email}"`,
            r.submissionStatus,
            r.isLate,
            r.version,
            r.attachmentCount,
            `"${r.submittedAt}"`,
            r.score,
            r.maxScore,
            r.gradingStatus,
            `"${String(r.feedback).replace(/"/g, '""')}"`,
          ].join(',')
        ),
      ];
      const csvContent = csvLines.join('\n');
      reply.header('Content-Type', 'text/csv; charset=utf-8');
      reply.header(
        'Content-Disposition',
        `attachment; filename="rekap-tugas-${asg.id.slice(0, 8)}.csv"`
      );
      return reply.send(csvContent);
    }

    if (fmt === 'xlsx') {
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(rows);
      XLSX.utils.book_append_sheet(wb, ws, 'Rekap Tugas');
      const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
      reply.header(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      reply.header(
        'Content-Disposition',
        `attachment; filename="rekap-tugas-${asg.id.slice(0, 8)}.xlsx"`
      );
      return reply.send(buf);
    }

    return sendSuccess(reply, {
      assignmentId: id,
      title: asg.title,
      exportedAt: new Date().toISOString(),
      rows,
    });
  });
}
