import fs from 'fs';
import crypto from 'crypto';
import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq, and, asc, desc } from 'drizzle-orm';
import * as XLSX from 'xlsx';
import { db } from '../db/index.ts';
import {
  classrooms,
  classroomTopics,
  learningMaterials,
  materialAttachments,
  materialVideos,
  materialProgress,
  materialRevisions,
  classroomResourceVersions,
  comments,
  users,
  assignments,
  assessments,
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
  generateObjectKey,
  signPresignedPutUrl,
  verifyPresignedPutSignature,
  signPresignedGetUrl,
  verifyPresignedGetSignature,
  writePrivateObjectBuffer,
  resolvePrivateObjectPath,
  deletePrivateObject,
  verifyUploadedObject,
  generateAttachmentPreviewPayload,
  validateAndExtractExternalVideo,
  sanitizePreviewHtml,
} from './storage.ts';

let materialsBackfilled = false;

async function ensureExistingMaterialsUpgraded() {
  if (materialsBackfilled) return;
  try {
    const allMats = await db.select().from(learningMaterials);
    for (let i = 0; i < allMats.length; i++) {
      const m = allMats[i];
      const existingJson = m.contentJson as any;
      const isEmptyJson =
        !existingJson ||
        !Array.isArray(existingJson.content) ||
        existingJson.content.length === 0;

      if (isEmptyJson) {
        const defaultTiptapDoc = {
          type: 'doc',
          content: [
            {
              type: 'heading',
              attrs: { level: 2 },
              content: [{ type: 'text', text: m.title }],
            },
            {
              type: 'paragraph',
              content: [
                {
                  type: 'text',
                  text:
                    m.content ||
                    'Materi pembelajaran terstruktur Politeknik Kampar.',
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
                      text: 'Catatan Praktikum: Pastikan seluruh skema database menggunakan Drizzle ORM, autentikasi Argon2id, dan penyimpanan berkas privat S3.',
                    },
                  ],
                },
              ],
            },
            {
              type: 'taskList',
              content: [
                {
                  type: 'taskItem',
                  attrs: { checked: true },
                  content: [
                    {
                      type: 'paragraph',
                      content: [
                        {
                          type: 'text',
                          text: 'Pelajari struktur tabel relasional PostgreSQL dan kunci asing UUID.',
                        },
                      ],
                    },
                  ],
                },
                {
                  type: 'taskItem',
                  attrs: { checked: false },
                  content: [
                    {
                      type: 'paragraph',
                      content: [
                        {
                          type: 'text',
                          text: 'Uji endpoint presigned upload dan pratinjau dokumen terisolasi.',
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        };

        const slug = m.title
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '');

        await db
          .update(learningMaterials)
          .set({
            slug: `${slug}-${i + 1}`,
            subtitle: `Pertemuan Ke-${i + 1} · Modul Perkuliahan & Praktikum Terstruktur`,
            description: m.content.slice(0, 220),
            meetingNumber: i + 1,
            sequenceOrder: i + 1,
            contentJson: defaultTiptapDoc,
            createdBy: m.authorId,
            status: 'PUBLISHED',
            isPublished: true,
          })
          .where(eq(learningMaterials.id, m.id));

        // Ensure a sample XLSX spreadsheet and PDF document exist in private S3 storage for immediate preview testing
        const existingAtts = await db
          .select()
          .from(materialAttachments)
          .where(eq(materialAttachments.materialId, m.id));

        const hasS3Att = existingAtts.some((a) => Boolean(a.objectKey));
        if (!hasS3Att && i === 0) {
          // 1. Generate a valid real PDF buffer in private S3 storage
          const pdfKey = `materials/${m.id}/modul-rpl-terdistribusi-polkam.pdf`;
          const minimalPdf = Buffer.from(
            `%PDF-1.4
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj
3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj
4 0 obj << /Length 148 >> stream
BT /F1 16 Tf 50 720 Td (MODUL AJAR POLITEKNIK KAMPAR - TIF-501) Tj /F1 11 Tf 0 -28 Td (Arsitektur Modular Monolith, PostgreSQL & S3 Private Storage) Tj ET
endstream endobj
5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000229 00000 n 
0000000428 00000 n 
trailer << /Size 6 /Root 1 0 R >>
startxref
496
%%EOF`,
            'utf-8'
          );
          writePrivateObjectBuffer(pdfKey, minimalPdf);
          const pdfVerified = verifyUploadedObject(pdfKey, 'pdf');

          // 2. Generate a valid real XLSX workbook in private S3 storage
          const xlsxKey = `materials/${m.id}/matriks-penilaian-praktikum.xlsx`;
          const wb = XLSX.utils.book_new();
          const wsData = [
            ['Komponen Evaluasi', 'Bobot (%)', 'Target Capaian', 'Metode Verifikasi'],
            ['Desain Skema Drizzle & PostgreSQL', '30', 'Normalisasi 3NF & UUID FK', 'Inspeksi Migrasi SQL'],
            ['Keamanan Sesi Argon2id & CSRF', '35', 'HttpOnly Cookie + SHA-256 Digest', 'Vitest Security Suite'],
            ['Integrasi Penyimpanan S3 Presigned', '35', 'Validasi MIME & Checksum SHA-256', 'Uji Unggah Berkas'],
          ];
          const ws = XLSX.utils.aoa_to_sheet(wsData);
          XLSX.utils.book_append_sheet(wb, ws, 'Rubrik Praktikum');
          const xlsxBuffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
          writePrivateObjectBuffer(xlsxKey, xlsxBuffer);
          const xlsxVerified = verifyUploadedObject(xlsxKey, 'xlsx');

          await db.insert(materialAttachments).values([
            {
              materialId: m.id,
              originalName: 'Modul_Arsitektur_RPL_Terdistribusi_Polkam.pdf',
              objectKey: pdfKey,
              mimeType: 'application/pdf',
              fileExtension: 'pdf',
              fileSize: pdfVerified.sizeBytes,
              checksum: pdfVerified.checksum,
              description: 'Dokumen utama modul perkuliahan Pertemuan 1 (Format PDF).',
              processingStatus: 'READY',
              sortOrder: 1,
            },
            {
              materialId: m.id,
              originalName: 'Matriks_Rubrik_Praktikum_TIF501.xlsx',
              objectKey: xlsxKey,
              mimeType:
                'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
              fileExtension: 'xlsx',
              fileSize: xlsxVerified.sizeBytes,
              checksum: xlsxVerified.checksum,
              description: 'Lembar kerja indikator penilaian praktikum laboratorium (SheetJS Preview).',
              processingStatus: 'READY',
              sortOrder: 2,
            },
          ]);

          // Also add a default validated YouTube educational video
          await db.insert(materialVideos).values({
            materialId: m.id,
            title: 'Video Pengantar Arsitektur Sistem Terdistribusi & Database Relasional',
            sourceType: 'YOUTUBE',
            videoUrl: 'https://www.youtube.com/watch?v=b2F-DItXtZs',
            videoId: 'b2F-DItXtZs',
            duration: 940,
            sortOrder: 1,
          });
        }
      }
    }
    materialsBackfilled = true;
  } catch (err) {
    console.error('Failed to upgrade existing materials:', err);
  }
}

function isMaterialVisibleToStudent(mat: any): boolean {
  const now = new Date();
  if (mat.status === 'DRAFT' || mat.status === 'ARCHIVED') {
    return false;
  }
  if (mat.status === 'SCHEDULED') {
    if (!mat.scheduledAt || new Date(mat.scheduledAt) > now) {
      return false;
    }
  }
  if (mat.visibility === 'INSTRUCTORS_ONLY') {
    return false;
  }
  if (mat.availabilityStartAt && new Date(mat.availabilityStartAt) > now) {
    return false;
  }
  if (
    mat.availabilityEndAt &&
    new Date(mat.availabilityEndAt) < now &&
    !mat.allowAccessAfterPublish
  ) {
    return false;
  }
  return true;
}

export async function registerMaterialRoutes(fastify: FastifyInstance) {
  // Support raw binary uploads on presigned PUT URLs without interfering with application/json
  fastify.addContentTypeParser(
    '*',
    { parseAs: 'buffer' },
    (_req, body, done) => {
      done(null, body);
    }
  );

  fastify.addHook('preHandler', async (req) => {
    if (req.url.startsWith('/api/v1')) {
      await ensureExistingMaterialsUpgraded();
    }
  });

  // ==========================================================================
  // S3-COMPATIBLE PRESIGNED UPLOAD (PUT) & PRIVATE STREAM/DOWNLOAD (GET)
  // ==========================================================================
  fastify.put('/api/v1/s3-presigned/upload', async (req, reply) => {
    const query = req.query as {
      key?: string;
      mime?: string;
      max?: string;
      exp?: string;
      sig?: string;
    };

    const objectKey = query.key || '';
    const mimeType = query.mime || 'application/octet-stream';
    const maxBytes = parseInt(query.max || '0', 10);
    const exp = parseInt(query.exp || '0', 10);
    const sig = query.sig || '';

    if (
      !objectKey ||
      !sig ||
      !verifyPresignedPutSignature({
        objectKey,
        mimeType,
        maxBytes,
        exp,
        sig,
      })
    ) {
      return sendError(
        reply,
        403,
        'PRESIGNED_URL_EXPIRED_OR_INVALID',
        'Tautan unggah S3 presigned tidak valid atau telah kedaluwarsa.'
      );
    }

    let buffer: Buffer;
    if (Buffer.isBuffer(req.body)) {
      buffer = req.body;
    } else if (typeof req.body === 'string') {
      buffer = Buffer.from(req.body, 'binary');
    } else if (req.body && typeof req.body === 'object') {
      buffer = Buffer.from(JSON.stringify(req.body));
    } else {
      return sendError(reply, 400, 'EMPTY_UPLOAD_BODY', ' Isi berkas kosong.');
    }

    if (buffer.length === 0 || buffer.length > maxBytes) {
      return sendError(
        reply,
        413,
        'FILE_SIZE_VIOLATION',
        `Ukuran berkas (${buffer.length} byte) tidak sesuai batas presigned URL.`
      );
    }

    writePrivateObjectBuffer(objectKey, buffer);
    const etag = `"${
      crypto.createHash('md5').update(buffer).digest('hex')
    }"`;
    reply.header('ETag', etag);
    return sendSuccess(reply, {
      uploaded: true,
      objectKey,
      sizeBytes: buffer.length,
    });
  });

  fastify.get('/api/v1/s3-presigned/object', async (req, reply) => {
    // Require authenticated user session even for signed object URLs (defense-in-depth)
    const user = await authenticateRequest(req, reply, { requireCsrf: false });
    if (!user) return;

    const query = req.query as {
      key?: string;
      name?: string;
      mime?: string;
      disp?: string;
      exp?: string;
      sig?: string;
    };

    const objectKey = query.key || '';
    const fileName = query.name || 'document';
    const mimeType = query.mime || 'application/octet-stream';
    const disposition = query.disp === 'attachment' ? 'attachment' : 'inline';
    const exp = parseInt(query.exp || '0', 10);
    const sig = query.sig || '';

    if (
      !objectKey ||
      !sig ||
      !verifyPresignedGetSignature({
        objectKey,
        disposition,
        exp,
        sig,
      })
    ) {
      return sendError(
        reply,
        403,
        'PRESIGNED_GET_EXPIRED',
        'Tautan akses objek S3 telah kedaluwarsa atau tidak sah.'
      );
    }

    // Enforce attachment ownership verification for student submission objects
    if (objectKey.startsWith('submissions/')) {
      const segs = objectKey.split('/');
      const keyAssignmentId = segs[1];
      const keyStudentId = segs[2];
      if (keyAssignmentId && keyStudentId && user.id !== keyStudentId) {
        const [asg] = await db
          .select()
          .from(assignments)
          .where(eq(assignments.id, keyAssignmentId));
        if (!asg) {
          return sendError(reply, 404, 'OBJECT_NOT_FOUND', 'Tugas tidak ditemukan.');
        }
        const access = await checkClassroomAccess(user, asg.classroomId);
        if (!access.canManage) {
          return sendError(
            reply,
            403,
            'FORBIDDEN_ATTACHMENT_OWNERSHIP',
            'Akses ditolak: Mahasiswa tidak diizinkan mengakses berkas lampiran milik mahasiswa lain.'
          );
        }
      }
    }

    if (objectKey.startsWith('exam-attachments/')) {
      const segs = objectKey.split('/');
      const keyAssessmentId = segs[1];
      const keyStudentId = segs[2];
      if (keyAssessmentId && keyStudentId && user.id !== keyStudentId) {
        const [asmt] = await db
          .select()
          .from(assessments)
          .where(eq(assessments.id, keyAssessmentId));
        if (!asmt) {
          return sendError(reply, 404, 'OBJECT_NOT_FOUND', 'Asesmen tidak ditemukan.');
        }
        const access = await checkClassroomAccess(user, asmt.classroomId);
        if (!access.canManage) {
          return sendError(
            reply,
            403,
            'FORBIDDEN_EXAM_ATTACHMENT_OWNERSHIP',
            'Akses ditolak: Mahasiswa tidak diizinkan mengakses berkas jawaban ujian milik mahasiswa lain.'
          );
        }
      }
    }

    const filePath = resolvePrivateObjectPath(objectKey);
    if (!fs.existsSync(filePath)) {
      return sendError(reply, 404, 'OBJECT_NOT_FOUND', 'Berkas objek S3 tidak ditemukan.');
    }

    const stat = fs.statSync(filePath);
    const totalSize = stat.size;
    const range = req.headers.range;

    // Never allow HTML or SVG inline execution
    const safeMime =
      mimeType.includes('html') || mimeType.includes('svg')
        ? 'application/octet-stream'
        : mimeType;

    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header(
      'Content-Disposition',
      `${disposition}; filename="${encodeURIComponent(fileName)}"`
    );

    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : totalSize - 1;
      const chunksize = end - start + 1;
      const stream = fs.createReadStream(filePath, { start, end });
      reply.code(206);
      reply.header('Content-Range', `bytes ${start}-${end}/${totalSize}`);
      reply.header('Accept-Ranges', 'bytes');
      reply.header('Content-Length', chunksize);
      reply.type(safeMime);
      return reply.send(stream);
    }

    reply.header('Accept-Ranges', 'bytes');
    reply.header('Content-Length', totalSize);
    reply.type(safeMime);
    return reply.send(fs.createReadStream(filePath));
  });

  // ==========================================================================
  // 1. GET /api/v1/classrooms/:id/topics
  // ==========================================================================
  fastify.get('/api/v1/classrooms/:id/topics', async (req, reply) => {
    const user = await authenticateRequest(req, reply);
    if (!user) return;

    const { id } = req.params as { id: string };
    const access = await checkClassroomAccess(user, id);
    if (!access.canView) {
      return sendError(
        reply,
        403,
        'FORBIDDEN_CLASSROOM_ACCESS',
        'Akses ditolak: Anda harus terdaftar aktif di ruang kelas ini.'
      );
    }

    const topics = await db
      .select()
      .from(classroomTopics)
      .where(eq(classroomTopics.classroomId, id))
      .orderBy(asc(classroomTopics.sortOrder));

    const allMaterials = await db
      .select()
      .from(learningMaterials)
      .where(eq(learningMaterials.classroomId, id))
      .orderBy(
        asc(learningMaterials.sequenceOrder),
        asc(learningMaterials.meetingNumber)
      );

    const visibleMaterials = access.canManage
      ? allMaterials
      : allMaterials.filter(isMaterialVisibleToStudent);

    const progressRows = await db
      .select()
      .from(materialProgress)
      .where(eq(materialProgress.studentId, user.id));
    const progressMap = new Map(progressRows.map((p) => [p.materialId, p]));

    const enrichedTopics = topics.map((t) => ({
      ...t,
      materials: visibleMaterials
        .filter((m) => m.topicId === t.id)
        .map((m) => ({
          ...m,
          myProgress: progressMap.get(m.id) || null,
        })),
    }));

    return sendSuccess(reply, enrichedTopics);
  });

  // ==========================================================================
  // 2. GET /api/v1/topics/:id/materials
  // ==========================================================================
  fastify.get('/api/v1/topics/:id/materials', async (req, reply) => {
    const user = await authenticateRequest(req, reply);
    if (!user) return;

    const { id: topicId } = req.params as { id: string };
    const [topic] = await db
      .select()
      .from(classroomTopics)
      .where(eq(classroomTopics.id, topicId));
    if (!topic) {
      return sendError(reply, 404, 'TOPIC_NOT_FOUND', 'Topik modul tidak ditemukan.');
    }

    const access = await checkClassroomAccess(user, topic.classroomId);
    if (!access.canView) {
      return sendError(
        reply,
        403,
        'FORBIDDEN_TOPIC_ACCESS',
        'Hanya peserta aktif di kelas ini yang dapat mengakses daftar materi.'
      );
    }

    const rows = await db
      .select()
      .from(learningMaterials)
      .where(eq(learningMaterials.topicId, topicId))
      .orderBy(
        asc(learningMaterials.sequenceOrder),
        asc(learningMaterials.meetingNumber)
      );

    const visible = access.canManage
      ? rows
      : rows.filter(isMaterialVisibleToStudent);

    const attachments = await db
      .select()
      .from(materialAttachments)
      .orderBy(asc(materialAttachments.sortOrder));
    const videos = await db
      .select()
      .from(materialVideos)
      .orderBy(asc(materialVideos.sortOrder));
    const myProgressRows = await db
      .select()
      .from(materialProgress)
      .where(eq(materialProgress.studentId, user.id));

    const enriched = visible.map((m) => ({
      ...m,
      attachments: attachments.filter((a) => a.materialId === m.id),
      videos: videos.filter((v) => v.materialId === m.id),
      myProgress: myProgressRows.find((p) => p.materialId === m.id) || null,
    }));

    return sendSuccess(reply, enriched, {
      topicId,
      classroomId: topic.classroomId,
      total: enriched.length,
    });
  });

  // ==========================================================================
  // 3. POST /api/v1/topics/:id/materials
  // ==========================================================================
  const createMaterialSchema = z.object({
    title: z.string().min(3, 'Judul materi minimal 3 karakter'),
    subtitle: z.string().nullable().optional().default(''),
    description: z.string().nullable().optional(),
    shortDescription: z.string().nullable().optional(),
    meetingNumber: z.number().int().min(1).max(32).optional().default(1),
    sequenceOrder: z.number().int().min(1).max(100).optional().default(1),
    estimatedDuration: z.number().int().min(5).max(600).optional(),
    estimatedDurationMinutes: z.number().int().min(5).max(600).optional(),
    isRequired: z.boolean().optional().default(true),
    contentJson: z.record(z.string(), z.any()).optional(),
    contentHtml: z.string().optional().nullable(),
    thumbnailKey: z.string().optional().nullable(),
    coverImageUrl: z.string().optional().nullable(),
    completionRule: z
      .enum([
        'VIEW',
        'VIEW_AND_SCROLL',
        'WATCH_VIDEOS',
        'DOWNLOAD_ATTACHMENTS',
        'SCROLL',
        'MANUAL_MARK',
        'VIDEO_PROGRESS',
        'ATTACHMENT_OPEN',
      ])
      .optional()
      .default('VIEW_AND_SCROLL'),
    minCompletionPercent: z.number().int().min(10).max(100).optional().default(80),
    enableComments: z.boolean().optional().default(true),
    enableDownloads: z.boolean().optional().default(true),
    allowAccessAfterPublish: z.boolean().optional().default(true),
    prerequisiteMaterialId: z.string().uuid().optional().nullable(),
    status: z
      .enum(['DRAFT', 'PUBLISHED', 'SCHEDULED', 'ARCHIVED'])
      .optional()
      .default('DRAFT'),
    scheduledAt: z.string().optional().nullable(),
    availabilityStartAt: z.string().optional().nullable(),
    availabilityEndAt: z.string().optional().nullable(),
    visibility: z
      .enum(['ENROLLED_ONLY', 'INSTRUCTORS_ONLY'])
      .optional()
      .default('ENROLLED_ONLY'),
  });

  fastify.post('/api/v1/topics/:id/materials', async (req, reply) => {
    const user = await authenticateRequest(req, reply);
    if (!user) return;

    const { id: topicId } = req.params as { id: string };
    const [topic] = await db
      .select()
      .from(classroomTopics)
      .where(eq(classroomTopics.id, topicId));
    if (!topic) {
      return sendError(reply, 404, 'TOPIC_NOT_FOUND', 'Topik modul tidak ditemukan.');
    }

    const access = await checkClassroomAccess(user, topic.classroomId);
    if (!access.canManage) {
      return sendError(
        reply,
        403,
        'FORBIDDEN_NOT_INSTRUCTOR',
        'Hanya Dosen pengampu kelas ini yang dapat membuat materi pembelajaran.'
      );
    }

    const parsed = createMaterialSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(
        reply,
        400,
        'VALIDATION_ERROR',
        'Data materi pembelajaran tidak valid.',
        parsed.error.issues
      );
    }

    const data = parsed.data;
    const descText = (data.description ?? data.shortDescription ?? '').trim();
    const durationVal = data.estimatedDuration ?? data.estimatedDurationMinutes ?? 45;
    const thumbVal = data.thumbnailKey ?? data.coverImageUrl ?? null;

    const slug = `${data.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')}-${Date.now().toString(36)}`;

    const canonicalJson = data.contentJson || {
      type: 'doc',
      content: [
        {
          type: 'heading',
          attrs: { level: 2 },
          content: [{ type: 'text', text: data.title }],
        },
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: descText || 'Mulai menulis materi pembelajaran...',
            },
          ],
        },
      ],
    };

    const isPublished = data.status === 'PUBLISHED';

    const created = await db.transaction(async (tx) => {
      const [mat] = await tx
        .insert(learningMaterials)
        .values({
          classroomId: topic.classroomId,
          topicId: topic.id,
          authorId: user.id,
          createdBy: user.id,
          meetingNumber: data.meetingNumber,
          title: data.title,
          slug,
          subtitle: data.subtitle || '',
          description: descText,
          content: descText || data.title,
          contentJson: canonicalJson,
          contentHtml: data.contentHtml
            ? sanitizePreviewHtml(data.contentHtml)
            : null,
          thumbnailKey: thumbVal,
          estimatedDuration: durationVal,
          isRequired: data.isRequired,
          sequenceOrder: data.sequenceOrder,
          completionRule: data.completionRule,
          minCompletionPercent: data.minCompletionPercent,
          enableComments: data.enableComments,
          enableDownloads: data.enableDownloads,
          allowAccessAfterPublish: data.allowAccessAfterPublish,
          prerequisiteMaterialId: data.prerequisiteMaterialId || null,
          status: data.status,
          isPublished,
          scheduledAt: data.scheduledAt ? new Date(data.scheduledAt) : null,
          publishedAt: isPublished ? new Date() : null,
          availabilityStartAt: data.availabilityStartAt
            ? new Date(data.availabilityStartAt)
            : null,
          availabilityEndAt: data.availabilityEndAt
            ? new Date(data.availabilityEndAt)
            : null,
          visibility: data.visibility,
        })
        .returning();

      await tx.insert(materialRevisions).values({
        materialId: mat.id,
        revisionNumber: 1,
        title: mat.title,
        contentJson: canonicalJson,
        status: mat.status,
        editedBy: user.id,
      });

      await tx.insert(classroomResourceVersions).values({
        classroomId: topic.classroomId,
        resourceType: 'MATERIAL',
        resourceId: mat.id,
        versionNumber: 1,
        title: mat.title,
        contentJson: canonicalJson,
        contentHtml: mat.contentHtml,
        createdById: user.id,
        changeNotes: 'Versi awal materi',
      });

      return mat;
    });

    const roleInfo = await resolveClassroomRole(user, topic.classroomId);
    await recordClassroomAudit({
      classroomId: topic.classroomId,
      actorId: user.id,
      actorRole: roleInfo.role,
      resourceType: 'MATERIAL',
      resourceId: created.id,
      resourceTitle: created.title,
      action: created.status === 'PUBLISHED' ? 'PUBLISHED' : 'CREATED',
      afterValue: { title: created.title, status: created.status, topicId: created.topicId },
      changeSummary: `Membuat materi pembelajaran: "${created.title}"`,
    });

    await recordAuditLog({
      actorId: user.id,
      action: 'MATERIAL_CREATED',
      entityType: 'LEARNING_MATERIAL',
      entityId: created.id,
      metadata: {
        classroomId: topic.classroomId,
        topicId: topic.id,
        status: created.status,
      },
      ipAddress: req.ip,
    });

    return sendSuccess(
      reply,
      {
        ...created,
        shortDescription: created.description,
        estimatedDurationMinutes: created.estimatedDuration,
        versionNumber: 1,
      },
      null,
      201
    );
  });

  // ==========================================================================
  // 4. GET /api/v1/materials/:id
  // ==========================================================================
  fastify.get('/api/v1/materials/:id', async (req, reply) => {
    const user = await authenticateRequest(req, reply);
    if (!user) return;

    const { id } = req.params as { id: string };
    const [mat] = await db
      .select()
      .from(learningMaterials)
      .where(eq(learningMaterials.id, id));
    if (!mat) {
      return sendError(reply, 404, 'MATERIAL_NOT_FOUND', 'Materi tidak ditemukan.');
    }

    const access = await checkClassroomAccess(user, mat.classroomId);
    if (!access.canView) {
      return sendError(
        reply,
        403,
        'FORBIDDEN_MATERIAL_ACCESS',
        'Akses ditolak: Hanya mahasiswa terdaftar aktif atau Dosen pengampu yang dapat membuka materi ini.'
      );
    }

    // Enforce draft / scheduled / visibility restriction for students
    if (!access.canManage && !isMaterialVisibleToStudent(mat)) {
      return sendError(
        reply,
        403,
        'MATERIAL_NOT_PUBLISHED',
        'Materi ini masih berstatus Draft, Terjadwal, atau Diarsipkan oleh Dosen Pengampu.'
      );
    }

    const [classroom] = await db
      .select()
      .from(classrooms)
      .where(eq(classrooms.id, mat.classroomId));
    const [topic] = mat.topicId
      ? await db
          .select()
          .from(classroomTopics)
          .where(eq(classroomTopics.id, mat.topicId))
      : [null];
    const [author] = await db
      .select({
        id: users.id,
        fullName: users.fullName,
        email: users.email,
      })
      .from(users)
      .where(eq(users.id, mat.authorId));

    const rawAttachments = await db
      .select()
      .from(materialAttachments)
      .where(eq(materialAttachments.materialId, id))
      .orderBy(asc(materialAttachments.sortOrder));

    const attachments = rawAttachments.map((att) => {
      const ext = (att.fileExtension || '').toLowerCase();
      const attachmentType = ['jpg', 'jpeg', 'png', 'webp'].includes(ext)
        ? 'IMAGE'
        : ['mp4', 'webm'].includes(ext)
          ? 'VIDEO'
          : 'DOCUMENT';
      const previewMode =
        ext === 'pdf'
          ? 'PDF'
          : ext === 'docx'
            ? 'DOCX_HTML'
            : ['xlsx', 'xls'].includes(ext)
              ? 'SPREADSHEET'
              : attachmentType === 'IMAGE'
                ? 'IMAGE'
                : attachmentType === 'VIDEO'
                  ? 'VIDEO'
                  : 'PRESENTATION_FALLBACK';

      return {
        ...att,
        originalFileName: att.originalName,
        fileName: att.originalName,
        storageKey: att.objectKey,
        attachmentType,
        previewMode,
        streamUrl: att.objectKey
          ? signPresignedGetUrl({
              objectKey: att.objectKey,
              fileName: att.originalName || 'file',
              mimeType: att.mimeType,
              disposition: 'inline',
            })
          : null,
        downloadUrl:
          att.objectKey && (mat.enableDownloads || access.canManage)
            ? signPresignedGetUrl({
                objectKey: att.objectKey,
                fileName: att.originalName || 'file',
                mimeType: att.mimeType,
                disposition: 'attachment',
              })
            : null,
      };
    });

    const rawVideos = await db
      .select()
      .from(materialVideos)
      .where(eq(materialVideos.materialId, id))
      .orderBy(asc(materialVideos.sortOrder));

    const videos = rawVideos.map((v) => {
      const base = {
        ...v,
        videoType: v.sourceType,
        externalUrl: v.videoUrl,
        storageKey: v.objectKey,
        isRequired: true,
      };
      if (v.sourceType === 'UPLOAD' && v.objectKey) {
        return {
          ...base,
          streamUrl: signPresignedGetUrl({
            objectKey: v.objectKey,
            fileName: v.title || 'video.mp4',
            mimeType: v.mimeType || 'video/mp4',
            disposition: 'inline',
          }),
        };
      }
      if (v.sourceType === 'YOUTUBE' && v.videoId) {
        return {
          ...base,
          embedUrl: `https://www.youtube-nocookie.com/embed/${v.videoId}`,
        };
      }
      if (v.sourceType === 'VIMEO' && v.videoId) {
        return {
          ...base,
          embedUrl: `https://player.vimeo.com/video/${v.videoId}`,
        };
      }
      return base;
    });

    // Sibling materials in the classroom for Previous / Next navigation
    const allClassMaterials = await db
      .select({
        id: learningMaterials.id,
        title: learningMaterials.title,
        topicId: learningMaterials.topicId,
        meetingNumber: learningMaterials.meetingNumber,
        sequenceOrder: learningMaterials.sequenceOrder,
        status: learningMaterials.status,
        scheduledAt: learningMaterials.scheduledAt,
        visibility: learningMaterials.visibility,
        availabilityStartAt: learningMaterials.availabilityStartAt,
        availabilityEndAt: learningMaterials.availabilityEndAt,
        allowAccessAfterPublish: learningMaterials.allowAccessAfterPublish,
      })
      .from(learningMaterials)
      .where(eq(learningMaterials.classroomId, mat.classroomId))
      .orderBy(
        asc(learningMaterials.meetingNumber),
        asc(learningMaterials.sequenceOrder)
      );

    const visibleSiblings = access.canManage
      ? allClassMaterials
      : allClassMaterials.filter(isMaterialVisibleToStudent);
    const currentIndex = visibleSiblings.findIndex((s) => s.id === mat.id);
    const previousMaterial =
      currentIndex > 0 ? visibleSiblings[currentIndex - 1] : null;
    const nextMaterial =
      currentIndex >= 0 && currentIndex < visibleSiblings.length - 1
        ? visibleSiblings[currentIndex + 1]
        : null;

    // Student Progress
    const [myProgressRow] = await db
      .select()
      .from(materialProgress)
      .where(
        and(
          eq(materialProgress.materialId, id),
          eq(materialProgress.studentId, user.id)
        )
      );

    const rawLastPos = (myProgressRow?.lastPosition as any) || {};
    const numericLastPos =
      typeof rawLastPos === 'number'
        ? rawLastPos
        : typeof rawLastPos?.seconds === 'number'
          ? rawLastPos.seconds
          : 0;

    const myProgress = myProgressRow
      ? {
          ...myProgressRow,
          lastPosition: numericLastPos,
          lastPositionObject: rawLastPos,
        }
      : {
          progressPercent: 0,
          lastPosition: 0,
          lastPositionObject: {},
          status: 'NOT_STARTED',
          completedAt: null,
        };

    // Comments on this material
    const rawComments = await db
      .select({
        id: comments.id,
        content: comments.content,
        createdAt: comments.createdAt,
        authorId: users.id,
        authorName: users.fullName,
      })
      .from(comments)
      .innerJoin(users, eq(comments.authorId, users.id))
      .where(eq(comments.materialId, id))
      .orderBy(asc(comments.createdAt));

    const materialComments = rawComments.map((c) => ({
      ...c,
      body: c.content,
    }));

    // Revisions history for instructors
    const revisions = access.canManage
      ? await db
          .select()
          .from(materialRevisions)
          .where(eq(materialRevisions.materialId, id))
          .orderBy(desc(materialRevisions.revisionNumber))
          .limit(10)
      : [];

    const coverImageUrl = mat.thumbnailKey
      ? mat.thumbnailKey.startsWith('http') || mat.thumbnailKey.startsWith('/')
        ? mat.thumbnailKey
        : signPresignedGetUrl({
            objectKey: mat.thumbnailKey,
            fileName: 'cover.jpg',
            mimeType: 'image/jpeg',
            disposition: 'inline',
          })
      : null;

    const versionNumber = revisions[0]?.revisionNumber || 1;

    return sendSuccess(reply, {
      ...mat,
      shortDescription: mat.description,
      estimatedDurationMinutes: mat.estimatedDuration,
      coverImageUrl,
      authorName: author?.fullName || 'Dosen Pengampu',
      versionNumber,
      material: {
        ...mat,
        shortDescription: mat.description,
        estimatedDurationMinutes: mat.estimatedDuration,
        coverImageUrl,
        versionNumber,
      },
      classroom,
      topic,
      author,
      access,
      attachments,
      videos,
      myProgress,
      comments: materialComments,
      revisions,
      navigation: {
        previous: previousMaterial,
        next: nextMaterial,
        previousMaterial,
        nextMaterial,
        totalInClassroom: visibleSiblings.length,
        currentPosition: currentIndex + 1,
      },
    });
  });

  // ==========================================================================
  // 5. PATCH /api/v1/materials/:id (Update & Debounced Autosave)
  // ==========================================================================
  const updateMaterialSchema = z.object({
    topicId: z.string().uuid().optional().nullable(),
    title: z.string().min(3).optional(),
    subtitle: z.string().nullable().optional(),
    description: z.string().nullable().optional(),
    shortDescription: z.string().nullable().optional(),
    meetingNumber: z.number().int().min(1).max(32).optional(),
    sequenceOrder: z.number().int().min(1).max(100).optional(),
    estimatedDuration: z.number().int().min(5).max(600).optional(),
    estimatedDurationMinutes: z.number().int().min(5).max(600).optional(),
    isRequired: z.boolean().optional(),
    contentJson: z.record(z.string(), z.any()).optional(),
    contentHtml: z.string().optional().nullable(),
    thumbnailKey: z.string().optional().nullable(),
    coverImageUrl: z.string().optional().nullable(),
    completionRule: z
      .enum([
        'VIEW',
        'VIEW_AND_SCROLL',
        'WATCH_VIDEOS',
        'DOWNLOAD_ATTACHMENTS',
        'SCROLL',
        'MANUAL_MARK',
        'VIDEO_PROGRESS',
        'ATTACHMENT_OPEN',
      ])
      .optional(),
    minCompletionPercent: z.number().int().min(10).max(100).optional(),
    enableComments: z.boolean().optional(),
    enableDownloads: z.boolean().optional(),
    allowAccessAfterPublish: z.boolean().optional(),
    prerequisiteMaterialId: z.string().uuid().optional().nullable(),
    status: z.enum(['DRAFT', 'PUBLISHED', 'SCHEDULED', 'ARCHIVED']).optional(),
    scheduledAt: z.string().optional().nullable(),
    availabilityStartAt: z.string().optional().nullable(),
    availabilityEndAt: z.string().optional().nullable(),
    visibility: z.enum(['ENROLLED_ONLY', 'INSTRUCTORS_ONLY']).optional(),
    createRevision: z.boolean().optional().default(false),
  });

  fastify.patch('/api/v1/materials/:id', async (req, reply) => {
    const user = await authenticateRequest(req, reply);
    if (!user) return;

    const { id } = req.params as { id: string };
    const [existing] = await db
      .select()
      .from(learningMaterials)
      .where(eq(learningMaterials.id, id));
    if (!existing) {
      return sendError(reply, 404, 'MATERIAL_NOT_FOUND', 'Materi tidak ditemukan.');
    }

    const access = await checkClassroomAccess(user, existing.classroomId);
    if (!access.canManage) {
      return sendError(
        reply,
        403,
        'FORBIDDEN_NOT_INSTRUCTOR',
        'Hanya Dosen pengampu kelas ini yang dapat memperbarui materi.'
      );
    }

    const roleInfo = await resolveClassroomRole(user, existing.classroomId);
    const ownerId = existing.createdBy || existing.authorId;
    if (roleInfo.role === 'CO_INSTRUCTOR' && !roleInfo.canManageAll && ownerId !== user.id) {
      return sendError(
        reply,
        403,
        'FORBIDDEN_CO_INSTRUCTOR_RESOURCE_OWNERSHIP',
        'Co-Instructor tidak dapat mengubah materi yang dibuat oleh pengajar lain tanpa izin.'
      );
    }

    const parsed = updateMaterialSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(
        reply,
        400,
        'VALIDATION_ERROR',
        'Format pembaruan materi tidak valid.',
        parsed.error.issues
      );
    }

    const d = parsed.data;
    const nextStatus = d.status || existing.status;
    const isPublished = nextStatus === 'PUBLISHED';
    const descUpdate = d.description !== undefined ? d.description : d.shortDescription;
    const durUpdate =
      d.estimatedDuration !== undefined
        ? d.estimatedDuration
        : d.estimatedDurationMinutes;
    const thumbUpdate =
      d.thumbnailKey !== undefined ? d.thumbnailKey : d.coverImageUrl;

    const updated = await db.transaction(async (tx) => {
      const [row] = await tx
        .update(learningMaterials)
        .set({
          ...(d.topicId !== undefined ? { topicId: d.topicId } : {}),
          ...(d.title !== undefined ? { title: d.title } : {}),
          ...(d.subtitle !== undefined ? { subtitle: d.subtitle || '' } : {}),
          ...(descUpdate !== undefined
            ? { description: descUpdate || '', content: descUpdate || '' }
            : {}),
          ...(d.meetingNumber !== undefined
            ? { meetingNumber: d.meetingNumber }
            : {}),
          ...(d.sequenceOrder !== undefined
            ? { sequenceOrder: d.sequenceOrder }
            : {}),
          ...(durUpdate !== undefined
            ? { estimatedDuration: durUpdate }
            : {}),
          ...(d.isRequired !== undefined ? { isRequired: d.isRequired } : {}),
          ...(d.contentJson !== undefined
            ? { contentJson: d.contentJson }
            : {}),
          ...(d.contentHtml !== undefined
            ? {
                contentHtml: d.contentHtml
                  ? sanitizePreviewHtml(d.contentHtml)
                  : null,
              }
            : {}),
          ...(thumbUpdate !== undefined
            ? { thumbnailKey: thumbUpdate }
            : {}),
          ...(d.completionRule !== undefined
            ? { completionRule: d.completionRule }
            : {}),
          ...(d.minCompletionPercent !== undefined
            ? { minCompletionPercent: d.minCompletionPercent }
            : {}),
          ...(d.enableComments !== undefined
            ? { enableComments: d.enableComments }
            : {}),
          ...(d.enableDownloads !== undefined
            ? { enableDownloads: d.enableDownloads }
            : {}),
          ...(d.allowAccessAfterPublish !== undefined
            ? { allowAccessAfterPublish: d.allowAccessAfterPublish }
            : {}),
          ...(d.prerequisiteMaterialId !== undefined
            ? { prerequisiteMaterialId: d.prerequisiteMaterialId }
            : {}),
          ...(d.status !== undefined
            ? {
                status: d.status,
                isPublished,
                ...(isPublished && !existing.publishedAt
                  ? { publishedAt: new Date() }
                  : {}),
              }
            : {}),
          ...(d.scheduledAt !== undefined
            ? { scheduledAt: d.scheduledAt ? new Date(d.scheduledAt) : null }
            : {}),
          ...(d.availabilityStartAt !== undefined
            ? {
                availabilityStartAt: d.availabilityStartAt
                  ? new Date(d.availabilityStartAt)
                  : null,
              }
            : {}),
          ...(d.availabilityEndAt !== undefined
            ? {
                availabilityEndAt: d.availabilityEndAt
                  ? new Date(d.availabilityEndAt)
                  : null,
              }
            : {}),
          ...(d.visibility !== undefined ? { visibility: d.visibility } : {}),
          updatedAt: new Date(),
        })
        .where(eq(learningMaterials.id, id))
        .returning();

      const prevRevs = await tx
        .select()
        .from(materialRevisions)
        .where(eq(materialRevisions.materialId, id));
      const nextRevNum = prevRevs.length + 1;

      if (d.createRevision) {
        await tx.insert(materialRevisions).values({
          materialId: id,
          revisionNumber: nextRevNum,
          title: row.title,
          contentJson: row.contentJson as any,
          status: row.status,
          editedBy: user.id,
        });
      }

      const existingVersions = await tx
        .select({ versionNumber: classroomResourceVersions.versionNumber })
        .from(classroomResourceVersions)
        .where(eq(classroomResourceVersions.resourceId, id))
        .orderBy(desc(classroomResourceVersions.versionNumber))
        .limit(1);
      const nextVer = (existingVersions[0]?.versionNumber || 0) + 1;
      await tx.insert(classroomResourceVersions).values({
        classroomId: existing.classroomId,
        resourceType: 'MATERIAL',
        resourceId: id,
        versionNumber: nextVer,
        title: row.title,
        contentJson: row.contentJson,
        contentHtml: row.contentHtml,
        createdById: user.id,
        changeNotes: `Pembaruan materi v${nextVer}`,
      });

      return {
        ...row,
        shortDescription: row.description,
        estimatedDurationMinutes: row.estimatedDuration,
        versionNumber: d.createRevision ? nextRevNum : prevRevs.length || 1,
      };
    });

    let auditAction: 'UPDATED' | 'PUBLISHED' | 'UNPUBLISHED' | 'ARCHIVED' | 'RESTORED' = 'UPDATED';
    if (d.status && d.status !== existing.status) {
      if (existing.status === 'ARCHIVED' && d.status !== 'ARCHIVED') auditAction = 'RESTORED';
      else if (d.status === 'PUBLISHED') auditAction = 'PUBLISHED';
      else if (d.status === 'ARCHIVED') auditAction = 'ARCHIVED';
      else auditAction = 'UNPUBLISHED';
    }
    await recordClassroomAudit({
      classroomId: existing.classroomId,
      actorId: user.id,
      actorRole: roleInfo.role,
      resourceType: 'MATERIAL',
      resourceId: id,
      resourceTitle: updated.title,
      action: auditAction,
      beforeValue: { title: existing.title, status: existing.status, topicId: existing.topicId },
      afterValue: { title: updated.title, status: updated.status, topicId: updated.topicId },
      changeSummary: `Memperbarui materi: "${updated.title}"`,
    });

    return sendSuccess(reply, updated);
  });

  // ==========================================================================
  // 6. DELETE /api/v1/materials/:id
  // ==========================================================================
  fastify.delete('/api/v1/materials/:id', async (req, reply) => {
    const user = await authenticateRequest(req, reply);
    if (!user) return;

    const { id } = req.params as { id: string };
    const [existing] = await db
      .select()
      .from(learningMaterials)
      .where(eq(learningMaterials.id, id));
    if (!existing) {
      return sendError(reply, 404, 'MATERIAL_NOT_FOUND', 'Materi tidak ditemukan.');
    }

    const access = await checkClassroomAccess(user, existing.classroomId);
    if (!access.canManage) {
      return sendError(
        reply,
        403,
        'FORBIDDEN',
        'Hanya Dosen pengampu yang dapat menghapus materi pembelajaran.'
      );
    }

    const roleInfo = await resolveClassroomRole(user, existing.classroomId);
    const ownerId = existing.createdBy || existing.authorId;
    if (roleInfo.role === 'CO_INSTRUCTOR' && !roleInfo.canManageAll && ownerId !== user.id) {
      return sendError(
        reply,
        403,
        'FORBIDDEN_CO_INSTRUCTOR_RESOURCE_OWNERSHIP',
        'Co-Instructor tidak dapat menghapus materi milik pengajar lain tanpa izin.'
      );
    }

    const atts = await db
      .select()
      .from(materialAttachments)
      .where(eq(materialAttachments.materialId, id));
    for (const a of atts) {
      if (a.objectKey) deletePrivateObject(a.objectKey);
    }

    await db.delete(learningMaterials).where(eq(learningMaterials.id, id));

    await recordClassroomAudit({
      classroomId: existing.classroomId,
      actorId: user.id,
      actorRole: roleInfo.role,
      resourceType: 'MATERIAL',
      resourceId: id,
      resourceTitle: existing.title,
      action: 'DELETED',
      beforeValue: { title: existing.title, status: existing.status, topicId: existing.topicId },
      changeSummary: `Menghapus materi "${existing.title}"`,
    });

    await recordAuditLog({
      actorId: user.id,
      action: 'MATERIAL_DELETED',
      entityType: 'LEARNING_MATERIAL',
      entityId: id,
      metadata: { title: existing.title },
      ipAddress: req.ip,
    });

    return sendSuccess(reply, { deleted: true, id });
  });

  // ==========================================================================
  // 7. POST /api/v1/materials/:id/publish
  // ==========================================================================
  fastify.post('/api/v1/materials/:id/publish', async (req, reply) => {
    const user = await authenticateRequest(req, reply);
    if (!user) return;

    const { id } = req.params as { id: string };
    const [existing] = await db
      .select()
      .from(learningMaterials)
      .where(eq(learningMaterials.id, id));
    if (!existing) {
      return sendError(reply, 404, 'MATERIAL_NOT_FOUND', 'Materi tidak ditemukan.');
    }

    const access = await checkClassroomAccess(user, existing.classroomId);
    if (!access.canManage) {
      return sendError(
        reply,
        403,
        'FORBIDDEN',
        'Hanya Dosen pengampu yang dapat menerbitkan materi di kelas ini.'
      );
    }

    const [published] = await db
      .update(learningMaterials)
      .set({
        status: 'PUBLISHED',
        isPublished: true,
        publishedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(learningMaterials.id, id))
      .returning();

    await recordAuditLog({
      actorId: user.id,
      action: 'MATERIAL_PUBLISHED',
      entityType: 'LEARNING_MATERIAL',
      entityId: id,
      metadata: { title: published.title },
      ipAddress: req.ip,
    });

    return sendSuccess(reply, published);
  });

  // ==========================================================================
  // 8. POST /api/v1/materials/:id/schedule
  // ==========================================================================
  const scheduleSchema = z.object({
    scheduledAt: z.string().min(5, 'Tanggal jadwal publikasi wajib diisi'),
    availabilityStartAt: z.string().optional().nullable(),
    availabilityEndAt: z.string().optional().nullable(),
  });

  fastify.post('/api/v1/materials/:id/schedule', async (req, reply) => {
    const user = await authenticateRequest(req, reply);
    if (!user) return;

    const { id } = req.params as { id: string };
    const [existing] = await db
      .select()
      .from(learningMaterials)
      .where(eq(learningMaterials.id, id));
    if (!existing) {
      return sendError(reply, 404, 'MATERIAL_NOT_FOUND', 'Materi tidak ditemukan.');
    }

    const access = await checkClassroomAccess(user, existing.classroomId);
    if (!access.canManage) {
      return sendError(
        reply,
        403,
        'FORBIDDEN',
        'Hanya Dosen pengampu yang dapat menjadwalkan publikasi materi.'
      );
    }

    const parsed = scheduleSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(
        reply,
        400,
        'VALIDATION_ERROR',
        'Tanggal penjadwalan tidak valid.',
        parsed.error.issues
      );
    }

    const [scheduled] = await db
      .update(learningMaterials)
      .set({
        status: 'SCHEDULED',
        isPublished: false,
        scheduledAt: new Date(parsed.data.scheduledAt),
        availabilityStartAt: parsed.data.availabilityStartAt
          ? new Date(parsed.data.availabilityStartAt)
          : null,
        availabilityEndAt: parsed.data.availabilityEndAt
          ? new Date(parsed.data.availabilityEndAt)
          : null,
        updatedAt: new Date(),
      })
      .where(eq(learningMaterials.id, id))
      .returning();

    await recordAuditLog({
      actorId: user.id,
      action: 'MATERIAL_SCHEDULED',
      entityType: 'LEARNING_MATERIAL',
      entityId: id,
      metadata: { scheduledAt: parsed.data.scheduledAt },
      ipAddress: req.ip,
    });

    return sendSuccess(reply, scheduled);
  });

  // ==========================================================================
  // 9. POST /api/v1/materials/:id/attachments/upload-url
  // ==========================================================================
  const uploadUrlSchema = z.object({
    fileName: z.string().min(3),
    mimeType: z.string().min(3),
    fileSize: z.number().int().positive(),
  });

  fastify.post(
    '/api/v1/materials/:id/attachments/upload-url',
    async (req, reply) => {
      const user = await authenticateRequest(req, reply);
      if (!user) return;

      const { id } = req.params as { id: string };
      const [mat] = await db
        .select()
        .from(learningMaterials)
        .where(eq(learningMaterials.id, id));
      if (!mat) {
        return sendError(reply, 404, 'MATERIAL_NOT_FOUND', 'Materi tidak ditemukan.');
      }

      const access = await checkClassroomAccess(user, mat.classroomId);
      if (!access.canManage) {
        return sendError(
          reply,
          403,
          'FORBIDDEN',
          'Hanya Dosen pengampu yang dapat mengunggah berkas ke materi ini.'
        );
      }

      const parsed = uploadUrlSchema.safeParse(req.body);
      if (!parsed.success) {
        return sendError(
          reply,
          400,
          'VALIDATION_ERROR',
          'Parameter permintaan presigned upload tidak valid.',
          parsed.error.issues
        );
      }

      const validation = validateAttachmentRequest(
        parsed.data.fileName,
        parsed.data.mimeType,
        parsed.data.fileSize
      );
      if (!validation.valid || !validation.spec || !validation.extension) {
        return sendError(
          reply,
          400,
          'FILE_VALIDATION_FAILED',
          validation.error || 'Tipe atau ukuran berkas tidak diizinkan.'
        );
      }

      const objectKey = generateObjectKey(id, validation.extension);
      const { uploadUrl, expiresAt } = signPresignedPutUrl({
        objectKey,
        mimeType: parsed.data.mimeType,
        maxBytes: validation.spec.maxBytes,
        expiresInSeconds: 900,
      });

      const ext = validation.extension.toLowerCase();
      const attachmentType = ['jpg', 'jpeg', 'png', 'webp'].includes(ext)
        ? 'IMAGE'
        : ['mp4', 'webm'].includes(ext)
          ? 'VIDEO'
          : 'DOCUMENT';
      const previewMode =
        ext === 'pdf'
          ? 'PDF'
          : ext === 'docx'
            ? 'DOCX_HTML'
            : ['xlsx', 'xls'].includes(ext)
              ? 'SPREADSHEET'
              : attachmentType === 'IMAGE'
                ? 'IMAGE'
                : attachmentType === 'VIDEO'
                  ? 'VIDEO'
                  : 'PRESENTATION_FALLBACK';

      return sendSuccess(reply, {
        uploadUrl,
        objectKey,
        bucketName: 'poltek-kampar-s3-private-bucket',
        storageProvider: 'S3_COMPATIBLE',
        attachmentType,
        previewMode,
        extension: ext,
        fileExtension: ext,
        mimeType: parsed.data.mimeType,
        category: validation.spec.category,
        maxBytes: validation.spec.maxBytes,
        expiresAt,
      });
    }
  );

  // ==========================================================================
  // 10. POST /api/v1/materials/:id/attachments/confirm
  // ==========================================================================
  const confirmUploadSchema = z.object({
    objectKey: z.string().min(5),
    originalName: z.string().optional(),
    originalFileName: z.string().optional(),
    mimeType: z.string().min(3),
    fileExtension: z.string().optional(),
    fileSize: z.number().int().positive(),
    checksum: z.string().optional(),
    description: z.string().nullable().optional().default(''),
    sortOrder: z.number().int().min(1).optional().default(1),
    replaceAttachmentId: z.string().uuid().optional().nullable(),
  });

  fastify.post(
    '/api/v1/materials/:id/attachments/confirm',
    async (req, reply) => {
      const user = await authenticateRequest(req, reply);
      if (!user) return;

      const { id } = req.params as { id: string };
      const [mat] = await db
        .select()
        .from(learningMaterials)
        .where(eq(learningMaterials.id, id));
      if (!mat) {
        return sendError(reply, 404, 'MATERIAL_NOT_FOUND', 'Materi tidak ditemukan.');
      }

      const access = await checkClassroomAccess(user, mat.classroomId);
      if (!access.canManage) {
        return sendError(
          reply,
          403,
          'FORBIDDEN',
          'Hanya Dosen pengampu yang dapat mengonfirmasi lampiran materi.'
        );
      }

      const parsed = confirmUploadSchema.safeParse(req.body);
      if (!parsed.success) {
        return sendError(
          reply,
          400,
          'VALIDATION_ERROR',
          'Data konfirmasi lampiran tidak valid.',
          parsed.error.issues
        );
      }

      const d = parsed.data;
      const origName = (d.originalName || d.originalFileName || 'document.pdf').trim();
      const inferredExt =
        (
          d.fileExtension ||
          origName.split('.').pop() ||
          d.objectKey.split('.').pop() ||
          'pdf'
        ).toLowerCase();

      // Verify actual uploaded object on private S3 storage
      const verification = verifyUploadedObject(d.objectKey, inferredExt);
      if (!verification.exists) {
        return sendError(
          reply,
          422,
          'OBJECT_VERIFICATION_FAILED',
          verification.error || 'Objek gagal diverifikasi pada penyimpanan S3.'
        );
      }

      if (d.replaceAttachmentId) {
        const [oldAtt] = await db
          .select()
          .from(materialAttachments)
          .where(
            and(
              eq(materialAttachments.id, d.replaceAttachmentId),
              eq(materialAttachments.materialId, id)
            )
          );
        if (oldAtt && oldAtt.objectKey) {
          deletePrivateObject(oldAtt.objectKey);
        }
        await db
          .delete(materialAttachments)
          .where(eq(materialAttachments.id, d.replaceAttachmentId));
      }

      const [attachment] = await db
        .insert(materialAttachments)
        .values({
          materialId: id,
          originalName: origName,
          objectKey: d.objectKey,
          mimeType: verification.detectedMime,
          fileExtension: inferredExt,
          fileSize: verification.sizeBytes,
          checksum: verification.checksum,
          previewKey: `preview:${d.objectKey}`,
          description: d.description || '',
          processingStatus: 'READY',
          sortOrder: d.sortOrder,
        })
        .returning();

      const streamUrl = signPresignedGetUrl({
        objectKey: attachment.objectKey,
        fileName: attachment.originalName,
        mimeType: attachment.mimeType,
        disposition: 'inline',
      });
      const downloadUrl = signPresignedGetUrl({
        objectKey: attachment.objectKey,
        fileName: attachment.originalName,
        mimeType: attachment.mimeType,
        disposition: 'attachment',
      });

      const attachmentType = ['jpg', 'jpeg', 'png', 'webp'].includes(inferredExt)
        ? 'IMAGE'
        : ['mp4', 'webm'].includes(inferredExt)
          ? 'VIDEO'
          : 'DOCUMENT';
      const previewMode =
        inferredExt === 'pdf'
          ? 'PDF'
          : inferredExt === 'docx'
            ? 'DOCX_HTML'
            : ['xlsx', 'xls'].includes(inferredExt)
              ? 'SPREADSHEET'
              : attachmentType === 'IMAGE'
                ? 'IMAGE'
                : attachmentType === 'VIDEO'
                  ? 'VIDEO'
                  : 'PRESENTATION_FALLBACK';

      await recordAuditLog({
        actorId: user.id,
        action: 'MATERIAL_ATTACHMENT_CONFIRMED',
        entityType: 'MATERIAL_ATTACHMENT',
        entityId: attachment.id,
        metadata: {
          materialId: id,
          originalName: attachment.originalName,
          checksum: attachment.checksum,
          sizeBytes: attachment.fileSize,
        },
        ipAddress: req.ip,
      });

      return sendSuccess(
        reply,
        {
          ...attachment,
          originalFileName: attachment.originalName,
          fileName: attachment.originalName,
          storageKey: attachment.objectKey,
          attachmentType,
          previewMode,
          streamUrl,
          downloadUrl,
        },
        null,
        201
      );
    }
  );

  // Update attachment description or sort order
  const updateAttachmentMetaSchema = z.object({
    description: z.string().optional(),
    sortOrder: z.number().int().min(1).optional(),
  });

  fastify.patch('/api/v1/material-attachments/:id', async (req, reply) => {
    const user = await authenticateRequest(req, reply);
    if (!user) return;

    const { id } = req.params as { id: string };
    const [att] = await db
      .select()
      .from(materialAttachments)
      .where(eq(materialAttachments.id, id));
    if (!att) {
      return sendError(reply, 404, 'ATTACHMENT_NOT_FOUND', 'Lampiran tidak ditemukan.');
    }

    const [mat] = await db
      .select()
      .from(learningMaterials)
      .where(eq(learningMaterials.id, att.materialId));
    if (!mat) {
      return sendError(reply, 404, 'MATERIAL_NOT_FOUND', 'Materi tidak ditemukan.');
    }

    const access = await checkClassroomAccess(user, mat.classroomId);
    if (!access.canManage) {
      return sendError(reply, 403, 'FORBIDDEN', 'Akses ditolak.');
    }

    const parsed = updateAttachmentMetaSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(reply, 400, 'VALIDATION_ERROR', 'Data lampiran tidak valid.');
    }

    const [updated] = await db
      .update(materialAttachments)
      .set({
        ...(parsed.data.description !== undefined
          ? { description: parsed.data.description }
          : {}),
        ...(parsed.data.sortOrder !== undefined
          ? { sortOrder: parsed.data.sortOrder }
          : {}),
      })
      .where(eq(materialAttachments.id, id))
      .returning();

    return sendSuccess(reply, updated);
  });

  // ==========================================================================
  // 11. DELETE /api/v1/material-attachments/:id
  // ==========================================================================
  fastify.delete('/api/v1/material-attachments/:id', async (req, reply) => {
    const user = await authenticateRequest(req, reply);
    if (!user) return;

    const { id } = req.params as { id: string };
    const [att] = await db
      .select()
      .from(materialAttachments)
      .where(eq(materialAttachments.id, id));
    if (!att) {
      return sendError(reply, 404, 'ATTACHMENT_NOT_FOUND', 'Lampiran tidak ditemukan.');
    }

    const [mat] = await db
      .select()
      .from(learningMaterials)
      .where(eq(learningMaterials.id, att.materialId));
    if (!mat) {
      return sendError(reply, 404, 'MATERIAL_NOT_FOUND', 'Materi tidak ditemukan.');
    }

    const access = await checkClassroomAccess(user, mat.classroomId);
    if (!access.canManage) {
      return sendError(
        reply,
        403,
        'FORBIDDEN',
        'Hanya Dosen pengampu yang dapat menghapus lampiran materi.'
      );
    }

    if (att.objectKey) {
      deletePrivateObject(att.objectKey);
    }

    await db.delete(materialAttachments).where(eq(materialAttachments.id, id));

    return sendSuccess(reply, { deleted: true, id });
  });

  // ==========================================================================
  // 12. POST /api/v1/materials/:id/videos
  // ==========================================================================
  const addVideoSchema = z.object({
    title: z.string().min(2),
    description: z.string().nullable().optional(),
    sourceType: z.enum(['UPLOAD', 'YOUTUBE', 'VIMEO']).optional(),
    videoType: z.enum(['UPLOAD', 'YOUTUBE', 'VIMEO']).optional(),
    videoUrl: z.string().optional().nullable(),
    externalUrl: z.string().optional().nullable(),
    objectKey: z.string().optional().nullable(),
    storageKey: z.string().optional().nullable(),
    mimeType: z.string().optional().nullable(),
    duration: z.number().int().min(0).optional().default(0),
    sortOrder: z.number().int().min(1).optional().default(1),
    isRequired: z.boolean().optional().default(true),
  });

  fastify.post('/api/v1/materials/:id/videos', async (req, reply) => {
    const user = await authenticateRequest(req, reply);
    if (!user) return;

    const { id } = req.params as { id: string };
    const [mat] = await db
      .select()
      .from(learningMaterials)
      .where(eq(learningMaterials.id, id));
    if (!mat) {
      return sendError(reply, 404, 'MATERIAL_NOT_FOUND', 'Materi tidak ditemukan.');
    }

    const access = await checkClassroomAccess(user, mat.classroomId);
    if (!access.canManage) {
      return sendError(
        reply,
        403,
        'FORBIDDEN',
        'Hanya Dosen pengampu yang dapat menambahkan video pembelajaran.'
      );
    }

    const parsed = addVideoSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(
        reply,
        400,
        'VALIDATION_ERROR',
        'Konfigurasi video tidak valid.',
        parsed.error.issues
      );
    }

    const d = parsed.data;
    const resolvedType = d.sourceType || d.videoType || 'YOUTUBE';
    const resolvedKey = d.objectKey || d.storageKey || null;
    const resolvedUrl = d.videoUrl || d.externalUrl || null;

    if (resolvedType === 'UPLOAD') {
      if (!resolvedKey) {
        return sendError(
          reply,
          400,
          'MISSING_OBJECT_KEY',
          'Object key wajib disertakan untuk video yang diunggah.'
        );
      }
      const ext = resolvedKey.endsWith('.webm') ? 'webm' : 'mp4';
      const verified = verifyUploadedObject(resolvedKey, ext);
      if (!verified.exists) {
        return sendError(
          reply,
          422,
          'VIDEO_OBJECT_NOT_FOUND',
          verified.error || 'Berkas video belum terunggah ke S3 privat.'
        );
      }

      const [videoRow] = await db
        .insert(materialVideos)
        .values({
          materialId: id,
          title: d.title,
          sourceType: 'UPLOAD',
          objectKey: resolvedKey,
          mimeType: verified.detectedMime,
          fileSize: verified.sizeBytes,
          duration: d.duration,
          sortOrder: d.sortOrder,
        })
        .returning();

      return sendSuccess(
        reply,
        {
          ...videoRow,
          videoType: 'UPLOAD',
          storageKey: resolvedKey,
          isRequired: d.isRequired,
          streamUrl: signPresignedGetUrl({
            objectKey: resolvedKey,
            fileName: `${d.title}.${ext}`,
            mimeType: verified.detectedMime,
            disposition: 'inline',
          }),
        },
        null,
        201
      );
    }

    // External video: YOUTUBE or VIMEO
    if (!resolvedUrl) {
      return sendError(
        reply,
        400,
        'VIDEO_URL_REQUIRED',
        'URL video wajib diisi untuk YouTube atau Vimeo.'
      );
    }

    const extracted = validateAndExtractExternalVideo(resolvedType, resolvedUrl);
    if (!extracted.valid || !extracted.videoId) {
      return sendError(
        reply,
        400,
        'INVALID_EXTERNAL_VIDEO_URL',
        extracted.error || 'URL video eksternal tidak valid.'
      );
    }

    const [videoRow] = await db
      .insert(materialVideos)
      .values({
        materialId: id,
        title: d.title,
        sourceType: resolvedType,
        videoUrl: extracted.canonicalUrl,
        videoId: extracted.videoId,
        duration: d.duration,
        sortOrder: d.sortOrder,
      })
      .returning();

    return sendSuccess(
      reply,
      {
        ...videoRow,
        videoType: resolvedType,
        externalUrl: extracted.canonicalUrl,
        isRequired: d.isRequired,
        embedUrl: extracted.embedUrl,
      },
      null,
      201
    );
  });

  // ==========================================================================
  // 13. DELETE /api/v1/material-videos/:id
  // ==========================================================================
  fastify.delete('/api/v1/material-videos/:id', async (req, reply) => {
    const user = await authenticateRequest(req, reply);
    if (!user) return;

    const { id } = req.params as { id: string };
    const [vid] = await db
      .select()
      .from(materialVideos)
      .where(eq(materialVideos.id, id));
    if (!vid) {
      return sendError(reply, 404, 'VIDEO_NOT_FOUND', 'Video tidak ditemukan.');
    }

    const [mat] = await db
      .select()
      .from(learningMaterials)
      .where(eq(learningMaterials.id, vid.materialId));
    if (!mat) {
      return sendError(reply, 404, 'MATERIAL_NOT_FOUND', 'Materi tidak ditemukan.');
    }

    const access = await checkClassroomAccess(user, mat.classroomId);
    if (!access.canManage) {
      return sendError(reply, 403, 'FORBIDDEN', 'Akses ditolak.');
    }

    if (vid.objectKey) {
      deletePrivateObject(vid.objectKey);
    }

    await db.delete(materialVideos).where(eq(materialVideos.id, id));
    return sendSuccess(reply, { deleted: true, id });
  });

  // ==========================================================================
  // 14. GET /api/v1/materials/:id/preview
  // ==========================================================================
  fastify.get('/api/v1/materials/:id/preview', async (req, reply) => {
    const user = await authenticateRequest(req, reply);
    if (!user) return;

    const { id } = req.params as { id: string };
    const query = req.query as { attachmentId?: string };

    const [mat] = await db
      .select()
      .from(learningMaterials)
      .where(eq(learningMaterials.id, id));
    if (!mat) {
      return sendError(reply, 404, 'MATERIAL_NOT_FOUND', 'Materi tidak ditemukan.');
    }

    const access = await checkClassroomAccess(user, mat.classroomId);
    if (!access.canView) {
      return sendError(
        reply,
        403,
        'FORBIDDEN',
        'Anda harus terdaftar aktif di kelas ini untuk melihat pratinjau dokumen.'
      );
    }

    if (!access.canManage && !isMaterialVisibleToStudent(mat)) {
      return sendError(
        reply,
        403,
        'MATERIAL_NOT_PUBLISHED',
        'Materi belum dipublikasikan untuk mahasiswa.'
      );
    }

    if (query.attachmentId) {
      const [att] = await db
        .select()
        .from(materialAttachments)
        .where(
          and(
            eq(materialAttachments.id, query.attachmentId),
            eq(materialAttachments.materialId, id)
          )
        );
      if (!att) {
        return sendError(
          reply,
          404,
          'ATTACHMENT_NOT_FOUND',
          'Berkas lampiran tidak ditemukan pada materi ini.'
        );
      }

      const previewPayload = await generateAttachmentPreviewPayload({
        objectKey: att.objectKey,
        originalName: att.originalName,
        fileExtension: att.fileExtension,
        mimeType: att.mimeType,
      });

      return sendSuccess(reply, {
        attachment: {
          ...att,
          originalFileName: att.originalName,
          fileName: att.originalName,
        },
        preview: previewPayload,
      });
    }

    // Full material preview summary
    const atts = await db
      .select()
      .from(materialAttachments)
      .where(eq(materialAttachments.materialId, id))
      .orderBy(asc(materialAttachments.sortOrder));

    const previews = await Promise.all(
      atts.map(async (att) => ({
        attachment: {
          ...att,
          originalFileName: att.originalName,
          fileName: att.originalName,
        },
        preview: await generateAttachmentPreviewPayload({
          objectKey: att.objectKey,
          originalName: att.originalName,
          fileExtension: att.fileExtension,
          mimeType: att.mimeType,
        }),
      }))
    );

    return sendSuccess(reply, {
      materialId: mat.id,
      title: mat.title,
      contentJson: mat.contentJson,
      attachmentPreviews: previews,
    });
  });

  // ==========================================================================
  // 15. GET /api/v1/materials/:id/progress & 16. PATCH /api/v1/materials/:id/progress
  // ==========================================================================
  fastify.get('/api/v1/materials/:id/progress', async (req, reply) => {
    const user = await authenticateRequest(req, reply);
    if (!user) return;

    const { id } = req.params as { id: string };
    const [mat] = await db
      .select()
      .from(learningMaterials)
      .where(eq(learningMaterials.id, id));
    if (!mat) {
      return sendError(reply, 404, 'MATERIAL_NOT_FOUND', 'Materi tidak ditemukan.');
    }

    const access = await checkClassroomAccess(user, mat.classroomId);
    if (!access.canView) {
      return sendError(reply, 403, 'FORBIDDEN', 'Akses ditolak.');
    }

    const [myProgress] = await db
      .select()
      .from(materialProgress)
      .where(
        and(
          eq(materialProgress.materialId, id),
          eq(materialProgress.studentId, user.id)
        )
      );

    let classProgress: any[] = [];
    if (access.canManage) {
      classProgress = await db
        .select({
          id: materialProgress.id,
          studentId: users.id,
          fullName: users.fullName,
          identityNumber: users.identityNumber,
          progressPercent: materialProgress.progressPercent,
          status: materialProgress.status,
          completedAt: materialProgress.completedAt,
          updatedAt: materialProgress.updatedAt,
        })
        .from(materialProgress)
        .innerJoin(users, eq(materialProgress.studentId, users.id))
        .where(eq(materialProgress.materialId, id))
        .orderBy(desc(materialProgress.progressPercent));
    }

    return sendSuccess(reply, {
      myProgress: myProgress || {
        materialId: id,
        studentId: user.id,
        progressPercent: 0,
        lastPosition: {},
        status: 'NOT_STARTED',
        completedAt: null,
      },
      ...(access.canManage ? { classProgress } : {}),
    });
  });

  const updateProgressSchema = z.object({
    progressPercent: z.number().int().min(0).max(100).optional(),
    status: z.enum(['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED']).optional(),
    lastPosition: z.union([z.number(), z.record(z.string(), z.any())]).optional(),
    scrollPercent: z.number().optional(),
    videoWatchSeconds: z.number().optional(),
    markCompleted: z.boolean().optional(),
  });

  fastify.patch('/api/v1/materials/:id/progress', async (req, reply) => {
    const user = await authenticateRequest(req, reply);
    if (!user) return;

    const { id } = req.params as { id: string };
    const [mat] = await db
      .select()
      .from(learningMaterials)
      .where(eq(learningMaterials.id, id));
    if (!mat) {
      return sendError(reply, 404, 'MATERIAL_NOT_FOUND', 'Materi tidak ditemukan.');
    }

    const access = await checkClassroomAccess(user, mat.classroomId);
    if (!access.canView) {
      return sendError(reply, 403, 'FORBIDDEN', 'Akses ditolak.');
    }

    const parsed = updateProgressSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(
        reply,
        400,
        'VALIDATION_ERROR',
        'Data progres belajar tidak valid.',
        parsed.error.issues
      );
    }

    const [existing] = await db
      .select()
      .from(materialProgress)
      .where(
        and(
          eq(materialProgress.materialId, id),
          eq(materialProgress.studentId, user.id)
        )
      );

    const prevPercent = existing?.progressPercent || 0;
    const isCompletedRequested =
      parsed.data.markCompleted || parsed.data.status === 'COMPLETED';
    const nextPercent = isCompletedRequested
      ? 100
      : Math.max(prevPercent, parsed.data.progressPercent ?? prevPercent);

    const reachedThreshold =
      isCompletedRequested || nextPercent >= mat.minCompletionPercent;
    const nextStatus =
      parsed.data.status ||
      (reachedThreshold
        ? 'COMPLETED'
        : nextPercent > 0
          ? 'IN_PROGRESS'
          : 'NOT_STARTED');

    const incomingPos =
      typeof parsed.data.lastPosition === 'number'
        ? {
            seconds: parsed.data.lastPosition,
            scrollPercent: parsed.data.scrollPercent || 0,
            videoWatchSeconds:
              parsed.data.videoWatchSeconds || parsed.data.lastPosition,
          }
        : {
            ...(parsed.data.lastPosition || {}),
            ...(parsed.data.scrollPercent !== undefined
              ? { scrollPercent: parsed.data.scrollPercent }
              : {}),
            ...(parsed.data.videoWatchSeconds !== undefined
              ? { videoWatchSeconds: parsed.data.videoWatchSeconds }
              : {}),
          };

    const mergedLastPosition = {
      ...((existing?.lastPosition as Record<string, unknown>) || {}),
      ...incomingPos,
    };

    const [upserted] = await db
      .insert(materialProgress)
      .values({
        materialId: id,
        studentId: user.id,
        progressPercent: nextPercent,
        lastPosition: mergedLastPosition,
        status: nextStatus,
        completedAt: reachedThreshold ? new Date() : null,
      })
      .onConflictDoUpdate({
        target: [materialProgress.materialId, materialProgress.studentId],
        set: {
          progressPercent: nextPercent,
          lastPosition: mergedLastPosition,
          status: nextStatus,
          completedAt: reachedThreshold
            ? existing?.completedAt || new Date()
            : null,
          updatedAt: new Date(),
        },
      })
      .returning();

    return sendSuccess(reply, upserted);
  });

  // Post comment on material
  const materialCommentSchema = z.object({
    content: z.string().min(2).optional(),
    body: z.string().min(2).optional(),
  });

  fastify.post('/api/v1/materials/:id/comments', async (req, reply) => {
    const user = await authenticateRequest(req, reply);
    if (!user) return;

    const { id } = req.params as { id: string };
    const [mat] = await db
      .select()
      .from(learningMaterials)
      .where(eq(learningMaterials.id, id));
    if (!mat) {
      return sendError(reply, 404, 'MATERIAL_NOT_FOUND', 'Materi tidak ditemukan.');
    }

    if (!mat.enableComments) {
      return sendError(
        reply,
        403,
        'COMMENTS_DISABLED',
        'Komentar pada materi ini telah dinonaktifkan oleh Dosen.'
      );
    }

    const access = await checkClassroomAccess(user, mat.classroomId);
    if (!access.canView) {
      return sendError(reply, 403, 'FORBIDDEN', 'Akses ditolak.');
    }

    const parsed = materialCommentSchema.safeParse(req.body);
    const commentText = (parsed.data?.content || parsed.data?.body || '').trim();
    if (!parsed.success || commentText.length < 2) {
      return sendError(reply, 400, 'VALIDATION_ERROR', 'Komentar tidak valid.');
    }

    const [created] = await db
      .insert(comments)
      .values({
        classroomId: mat.classroomId,
        materialId: id,
        authorId: user.id,
        content: commentText,
      })
      .returning();

    return sendSuccess(
      reply,
      {
        ...created,
        body: created.content,
      },
      null,
      201
    );
  });
}
