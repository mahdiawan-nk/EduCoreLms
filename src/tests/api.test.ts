import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import * as XLSX from 'xlsx';
import { buildApiServer } from '../server/app.ts';
import {
  hashPassword,
  verifyPassword,
  hashSessionToken,
} from '../server/security.ts';

function extractCookieValue(
  setCookieHeader: string | string[] | undefined,
  cookieName: string
): string | null {
  if (!setCookieHeader) return null;
  const list = Array.isArray(setCookieHeader)
    ? setCookieHeader
    : [setCookieHeader];
  for (const item of list) {
    if (item.startsWith(`${cookieName}=`)) {
      return item.split(';')[0].split('=')[1];
    }
  }
  return null;
}

describe('Politeknik Kampar LMS — Security, RBAC, and Advanced Learning Material Builder Suite', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApiServer();
    await app.ready();

    // Clean up transient test classrooms from previous test runs
    const { db: dbInstance } = await import('../db/index.ts');
    const { classrooms: classroomsTable } = await import('../db/schema.ts');
    const { or, ilike } = await import('drizzle-orm');
    await dbInstance
      .delete(classroomsTable)
      .where(
        or(
          ilike(classroomsTable.name, 'Kelas Draft%'),
          ilike(classroomsTable.name, 'Kelas Khusus Cloud%'),
          ilike(classroomsTable.name, 'Kelas Mandiri Cloud%')
        )
      );
  });

  afterAll(async () => {
    await app.close();
  });

  it('hashes and verifies passwords with Argon2id and hashes session tokens with SHA-256', async () => {
    const hash = await hashPassword('SecretPolkam#2026');
    expect(hash.startsWith('$argon2id$')).toBe(true);
    expect(await verifyPassword(hash, 'SecretPolkam#2026')).toBe(true);
    expect(await verifyPassword(hash, 'WrongPassword')).toBe(false);

    const tokenDigest = hashSessionToken('raw-token-123');
    expect(tokenDigest).toHaveLength(64);
    expect(tokenDigest).not.toBe('raw-token-123');
  });

  it('serves OpenAPI 3.1 specification in standard /api/v1 envelope', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/openapi.json',
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.openapi).toBe('3.1.0');
  }, 15000);

  it('enforces deny-by-default 401 UNAUTHORIZED for unauthenticated requests', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/classrooms',
    });
    expect(res.statusCode).toBe(401);
    const body = res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('UNAUTHORIZED');
  });

  it('authenticates Mahasiswa, enforces CSRF on mutating endpoints, and blocks RBAC escalation', async () => {
    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: {
        email: 'ahmad.mhs@student.poltek-kampar.ac.id',
        password: 'MhsPolkam#2026',
      },
    });
    expect(loginRes.statusCode).toBe(200);
    const loginBody = loginRes.json();
    expect(loginBody.success).toBe(true);
    expect(loginBody.data.user.roles).toContain('MAHASISWA');

    const sessionCookie = extractCookieValue(
      loginRes.headers['set-cookie'],
      'pk_lms_session'
    );
    const csrfToken = loginBody.data.csrfToken;
    expect(sessionCookie).toBeTruthy();
    expect(csrfToken).toBeTruthy();

    // Mutating request WITHOUT X-CSRF-Token must fail with 403 CSRF_TOKEN_MISMATCH
    const noCsrfRes = await app.inject({
      method: 'POST',
      url: '/api/v1/notifications/read-all',
      cookies: { pk_lms_session: sessionCookie! },
    });
    expect(noCsrfRes.statusCode).toBe(403);
    expect(noCsrfRes.json().error.code).toBe('CSRF_TOKEN_MISMATCH');

    // Mahasiswa attempting Superadmin academic period creation must fail with 403 FORBIDDEN_INSUFFICIENT_PERMISSIONS
    const rbacRes = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/academic-periods',
      cookies: { pk_lms_session: sessionCookie! },
      headers: { 'x-csrf-token': csrfToken },
      payload: {
        academicCode: '2026-HACK',
        name: 'Unauthorized Period',
        academicYear: '2026/2027',
        semesterType: 'ODD',
        startDate: '2026-09-01T00:00:00Z',
        endDate: '2027-01-31T00:00:00Z',
      },
    });
    expect(rbacRes.statusCode).toBe(403);
    expect(rbacRes.json().error.code).toBe('FORBIDDEN_INSUFFICIENT_PERMISSIONS');

    // Mahasiswa fetching enrolled classroom never receives quiz answer keys (isCorrect)
    const clsListRes = await app.inject({
      method: 'GET',
      url: '/api/v1/classrooms?scope=mine&limit=50',
      cookies: { pk_lms_session: sessionCookie! },
    });
    let targetClass: any = null;
    let targetQuizzes: any[] = [];
    for (const c of clsListRes.json().data.filter((c: any) => c.myEnrollmentStatus === 'active')) {
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/classrooms/${c.id}`,
        cookies: { pk_lms_session: sessionCookie! },
      });
      if (res.statusCode === 200 && res.json().data.quizzes?.length > 0) {
        targetClass = c;
        targetQuizzes = res.json().data.quizzes;
        break;
      }
    }
    expect(targetClass).toBeTruthy();
    expect(targetQuizzes.length).toBeGreaterThan(0);
    const firstOption = targetQuizzes[0].questions[0].options[0];
    expect(firstOption.isCorrect).toBeUndefined();
  });

  it('verifies complete Advanced Learning Material Builder lifecycle (19 verification items)', async () => {
    // 1. Login as Instructor (Dosen)
    const dosenLogin = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: {
        email: 'fitriani.dosen@poltek-kampar.ac.id',
        password: 'DosenPolkam#2026',
      },
    });
    expect(dosenLogin.statusCode).toBe(200);
    const dosenCookie = extractCookieValue(
      dosenLogin.headers['set-cookie'],
      'pk_lms_session'
    )!;
    const dosenCsrf = dosenLogin.json().data.csrfToken;

    // 2. Login as Enrolled Student (Ahmad)
    const mhsLogin = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: {
        email: 'ahmad.mhs@student.poltek-kampar.ac.id',
        password: 'MhsPolkam#2026',
      },
    });
    const mhsCookie = extractCookieValue(
      mhsLogin.headers['set-cookie'],
      'pk_lms_session'
    )!;
    const mhsCsrf = mhsLogin.json().data.csrfToken;

    // Fetch instructor's classrooms and topics
    const clsRes = await app.inject({
      method: 'GET',
      url: '/api/v1/classrooms?scope=mine&limit=50',
      cookies: { pk_lms_session: dosenCookie },
    });
    const classrooms = clsRes.json().data;
    let targetClassroom = classrooms.find(
      (c: any) => c.canManage && (c.courseCode === 'TIF-501' || c.name.includes('Rekayasa'))
    );
    if (!targetClassroom) targetClassroom = classrooms.find((c: any) => c.canManage);
    expect(targetClassroom).toBeTruthy();

    const topicsRes = await app.inject({
      method: 'GET',
      url: `/api/v1/classrooms/${targetClassroom.id}/topics`,
      cookies: { pk_lms_session: dosenCookie },
    });
    expect(topicsRes.statusCode).toBe(200);
    let topics = topicsRes.json().data;
    if (topics.length === 0) {
      await app.inject({
        method: 'POST',
        url: `/api/v1/classrooms/${targetClassroom.id}/topics`,
        cookies: { pk_lms_session: dosenCookie },
        headers: { 'x-csrf-token': dosenCsrf },
        payload: { title: 'Modul Pembelajaran Utama' },
      });
      const refetch = await app.inject({
        method: 'GET',
        url: `/api/v1/classrooms/${targetClassroom.id}/topics`,
        cookies: { pk_lms_session: dosenCookie },
      });
      topics = refetch.json().data;
    }
    expect(topics.length).toBeGreaterThan(0);
    const targetTopic = topics[0];

    // Item 1 & 2: Creating material under a topic & saving/restoring Tiptap JSONB content
    const richTiptapJson = {
      type: 'doc',
      content: [
        {
          type: 'heading',
          attrs: { level: 1 },
          content: [{ type: 'text', text: 'Bab 4: DesainPenyimpanan Objek S3 & Transaksi Database' }],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', marks: [{ type: 'bold' }], text: 'Tujuan Kompetensi:' },
            { type: 'text', text: ' Mahasiswa mampu merancang presigned URL dan validasi SHA-256.' },
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
                  content: [{ type: 'text', text: 'Konfigurasi Drizzle ORM & PostgreSQL' }],
                },
              ],
            },
          ],
        },
        {
          type: 'codeBlock',
          attrs: { language: 'typescript' },
          content: [{ type: 'text', text: 'const checksum = crypto.createHash("sha256").digest("hex");' }],
        },
      ],
    };

    const createMatRes = await app.inject({
      method: 'POST',
      url: `/api/v1/topics/${targetTopic.id}/materials`,
      cookies: { pk_lms_session: dosenCookie },
      headers: { 'x-csrf-token': dosenCsrf },
      payload: {
        title: 'Arsitektur Presigned S3 & Document Preview Terisolasi',
        subtitle: 'Modul Praktikum Keamanan Aplikasi Web',
        shortDescription: 'Panduan lengkap integrasi S3 presigned upload dan pratinjau dokumen.',
        meetingNumber: 4,
        sequenceOrder: 2,
        estimatedDurationMinutes: 90,
        isRequired: true,
        contentJson: richTiptapJson,
        status: 'DRAFT',
        completionRule: 'MANUAL_MARK',
        minCompletionPercent: 80,
        enableComments: true,
        enableDownloads: true,
      },
    });
    expect(createMatRes.statusCode).toBe(201);
    const createdMat = createMatRes.json().data;
    expect(createdMat.id).toBeTruthy();
    expect(createdMat.status).toBe('DRAFT');
    expect(createdMat.contentJson.content[0].content[0].text).toContain('Bab 4');

    const materialId = createdMat.id;

    // Item 17: Draft materials hidden from students
    const studentDraftCheck = await app.inject({
      method: 'GET',
      url: `/api/v1/materials/${materialId}`,
      cookies: { pk_lms_session: mhsCookie },
    });
    expect(studentDraftCheck.statusCode).toBe(403);
    expect(studentDraftCheck.json().error.code).toBe('MATERIAL_NOT_PUBLISHED');

    // Helper function to test presigned upload + PUT binary + confirm
    async function uploadAndConfirmAttachment(
      fileName: string,
      mimeType: string,
      binaryBuffer: Buffer,
      description: string
    ) {
      const urlRes = await app.inject({
        method: 'POST',
        url: `/api/v1/materials/${materialId}/attachments/upload-url`,
        cookies: { pk_lms_session: dosenCookie },
        headers: { 'x-csrf-token': dosenCsrf },
        payload: {
          fileName,
          mimeType,
          fileSize: binaryBuffer.length,
        },
      });
      expect(urlRes.statusCode).toBe(200);
      const { uploadUrl, objectKey } = urlRes.json().data;

      const putRes = await app.inject({
        method: 'PUT',
        url: uploadUrl,
        headers: { 'content-type': mimeType },
        payload: binaryBuffer,
      });
      expect(putRes.statusCode).toBe(200);

      const confirmRes = await app.inject({
        method: 'POST',
        url: `/api/v1/materials/${materialId}/attachments/confirm`,
        cookies: { pk_lms_session: dosenCookie },
        headers: { 'x-csrf-token': dosenCsrf },
        payload: {
          objectKey,
          originalFileName: fileName,
          mimeType,
          fileSize: binaryBuffer.length,
          description,
        },
      });
      expect(confirmRes.statusCode).toBe(201);
      return confirmRes.json().data;
    }

    // Item 3: Uploading Image attachment (PNG)
    const pngBuffer = Buffer.from(
      '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c63000100000500010d0a2db40000000049454e44ae426082',
      'hex'
    );
    const uploadedImg = await uploadAndConfirmAttachment(
      'diagram-arsitektur-s3.png',
      'image/png',
      pngBuffer,
      'Diagram Arsitektur S3'
    );
    expect(uploadedImg.fileExtension).toBe('png');
    expect(uploadedImg.checksum).toHaveLength(64);

    // Item 4: Uploading DOCX attachment
    const docxDummyBuffer = Buffer.from('PK\x03\x04-DOCX-ARCHIVE-CONTENT-POLITEKNIK-KAMPAR', 'utf-8');
    const uploadedDocx = await uploadAndConfirmAttachment(
      'modul-praktikum-bab4.docx',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      docxDummyBuffer,
      'Dokumen Word Praktikum'
    );
    expect(uploadedDocx.fileExtension).toBe('docx');

    // Item 5: Uploading XLSX attachment (real SheetJS workbook)
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([
      ['NIM', 'Nama Mahasiswa', 'Skor Praktikum'],
      ['202601001', 'Ahmad Fauzan', '95'],
    ]);
    XLSX.utils.book_append_sheet(wb, ws, 'Nilai Kelas');
    const xlsxBuffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
    const uploadedXlsx = await uploadAndConfirmAttachment(
      'rekap-nilai-praktikum.xlsx',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      xlsxBuffer,
      'Spreadsheet Nilai Praktikum'
    );
    expect(uploadedXlsx.fileExtension).toBe('xlsx');

    // Item 6: Uploading PPTX attachment
    const pptxBuffer = Buffer.from(
      'PK\x03\x04 Slide 1: Pengantar S3 Storage Politeknik Kampar Slide 2: Presigned URL Security',
      'utf-8'
    );
    const uploadedPptx = await uploadAndConfirmAttachment(
      'presentasi-kuliah-minggu4.pptx',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      pptxBuffer,
      'Slide Presentasi Minggu 4'
    );
    expect(uploadedPptx.fileExtension).toBe('pptx');

    // Item 7: Uploading PDF attachment
    const pdfBuffer = Buffer.from(
      '%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\n%%EOF',
      'utf-8'
    );
    const uploadedPdf = await uploadAndConfirmAttachment(
      'referensi-standar-keamanan.pdf',
      'application/pdf',
      pdfBuffer,
      'Dokumen PDF Standar Keamanan'
    );
    expect(uploadedPdf.fileExtension).toBe('pdf');

    // Item 8: Uploading MP4 video & registering in material_videos
    const mp4Buffer = Buffer.from(
      '00000018667479706d703432000000006d70343269736f6d000000086d646174',
      'hex'
    );
    const uploadedMp4Att = await uploadAndConfirmAttachment(
      'rekaman-demo-praktikum.mp4',
      'video/mp4',
      mp4Buffer,
      'Video Rekaman Praktikum'
    );
    const addUploadVidRes = await app.inject({
      method: 'POST',
      url: `/api/v1/materials/${materialId}/videos`,
      cookies: { pk_lms_session: dosenCookie },
      headers: { 'x-csrf-token': dosenCsrf },
      payload: {
        title: 'Rekaman Demo Praktikum Laboratorium',
        videoType: 'UPLOAD',
        storageKey: uploadedMp4Att.storageKey,
        duration: 180,
      },
    });
    expect(addUploadVidRes.statusCode).toBe(201);
    expect(addUploadVidRes.json().data.streamUrl).toContain('/api/v1/s3-presigned/object');

    // Item 9: Embedding YouTube video
    const ytRes = await app.inject({
      method: 'POST',
      url: `/api/v1/materials/${materialId}/videos`,
      cookies: { pk_lms_session: dosenCookie },
      headers: { 'x-csrf-token': dosenCsrf },
      payload: {
        title: 'Kuliah Tamu Keamanan Siber',
        videoType: 'YOUTUBE',
        externalUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      },
    });
    expect(ytRes.statusCode).toBe(201);
    expect(ytRes.json().data.embedUrl).toBe('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');

    // Item 10: Embedding Vimeo video
    const vimeoRes = await app.inject({
      method: 'POST',
      url: `/api/v1/materials/${materialId}/videos`,
      cookies: { pk_lms_session: dosenCookie },
      headers: { 'x-csrf-token': dosenCsrf },
      payload: {
        title: 'Animasi Topologi Jaringan',
        videoType: 'VIMEO',
        externalUrl: 'https://vimeo.com/76979871',
      },
    });
    expect(vimeoRes.statusCode).toBe(201);
    expect(vimeoRes.json().data.embedUrl).toBe('https://player.vimeo.com/video/76979871');

    // Item 18: Scheduled publication (future schedule blocks student, then publish opens access)
    const futureDate = new Date(Date.now() + 86400_000).toISOString();
    const schedRes = await app.inject({
      method: 'POST',
      url: `/api/v1/materials/${materialId}/schedule`,
      cookies: { pk_lms_session: dosenCookie },
      headers: { 'x-csrf-token': dosenCsrf },
      payload: { scheduledAt: futureDate },
    });
    expect(schedRes.statusCode).toBe(200);
    expect(schedRes.json().data.status).toBe('SCHEDULED');

    const studentSchedCheck = await app.inject({
      method: 'GET',
      url: `/api/v1/materials/${materialId}`,
      cookies: { pk_lms_session: mhsCookie },
    });
    expect(studentSchedCheck.statusCode).toBe(403);

    // Now publish the material so enrolled students can access it
    const pubRes = await app.inject({
      method: 'POST',
      url: `/api/v1/materials/${materialId}/publish`,
      cookies: { pk_lms_session: dosenCookie },
      headers: { 'x-csrf-token': dosenCsrf },
    });
    expect(pubRes.statusCode).toBe(200);
    expect(pubRes.json().data.status).toBe('PUBLISHED');

    // Enrolled student can now view the published material and its restored Tiptap JSON
    const studentViewRes = await app.inject({
      method: 'GET',
      url: `/api/v1/materials/${materialId}`,
      cookies: { pk_lms_session: mhsCookie },
    });
    expect(studentViewRes.statusCode).toBe(200);
    const viewedData = studentViewRes.json().data;
    expect(viewedData.title).toBe('Arsitektur Presigned S3 & Document Preview Terisolasi');
    expect(viewedData.attachments.length).toBe(6);
    expect(viewedData.videos.length).toBe(3);

    // Item 11: Previewing PDF in browser
    const pdfPreviewRes = await app.inject({
      method: 'GET',
      url: `/api/v1/materials/${materialId}/preview?attachmentId=${uploadedPdf.id}`,
      cookies: { pk_lms_session: mhsCookie },
    });
    expect(pdfPreviewRes.statusCode).toBe(200);
    expect(pdfPreviewRes.json().data.preview.mode).toBe('PDF');

    // Item 12: Previewing DOCX in browser
    const docxPreviewRes = await app.inject({
      method: 'GET',
      url: `/api/v1/materials/${materialId}/preview?attachmentId=${uploadedDocx.id}`,
      cookies: { pk_lms_session: mhsCookie },
    });
    expect(docxPreviewRes.statusCode).toBe(200);
    expect(['DOCX_HTML', 'FALLBACK']).toContain(docxPreviewRes.json().data.preview.mode);

    // Item 13: Previewing XLSX in browser (SheetJS tabular data)
    const xlsxPreviewRes = await app.inject({
      method: 'GET',
      url: `/api/v1/materials/${materialId}/preview?attachmentId=${uploadedXlsx.id}`,
      cookies: { pk_lms_session: mhsCookie },
    });
    expect(xlsxPreviewRes.statusCode).toBe(200);
    const xlsxPreview = xlsxPreviewRes.json().data.preview;
    expect(xlsxPreview.mode).toBe('SPREADSHEET');
    expect(xlsxPreview.sheets[0].name).toBe('Nilai Kelas');
    expect(xlsxPreview.sheets[0].rows[1][1]).toBe('Ahmad Fauzan');

    // Item 14: Previewing PPTX / fallback
    const pptxPreviewRes = await app.inject({
      method: 'GET',
      url: `/api/v1/materials/${materialId}/preview?attachmentId=${uploadedPptx.id}`,
      cookies: { pk_lms_session: mhsCookie },
    });
    expect(pptxPreviewRes.statusCode).toBe(200);
    expect(pptxPreviewRes.json().data.preview.mode).toBe('PRESENTATION_FALLBACK');

    // Item 15: Playing uploaded video with HTTP Range support (206 Partial Content) & blocking unauthenticated access
    const videoStreamUrl = addUploadVidRes.json().data.streamUrl;
    const unauthStreamRes = await app.inject({
      method: 'GET',
      url: videoStreamUrl,
    });
    expect(unauthStreamRes.statusCode).toBe(401);

    const rangeRes = await app.inject({
      method: 'GET',
      url: videoStreamUrl,
      cookies: { pk_lms_session: mhsCookie },
      headers: { range: 'bytes=0-15' },
    });
    expect(rangeRes.statusCode).toBe(206);
    expect(rangeRes.headers['accept-ranges']).toBe('bytes');

    // Item 16: Blocking unauthorized student access (student cannot create/modify materials, and pending/non-enrolled student cannot view classroom materials)
    const studentCreateAttempt = await app.inject({
      method: 'POST',
      url: `/api/v1/topics/${targetTopic.id}/materials`,
      cookies: { pk_lms_session: mhsCookie },
      headers: { 'x-csrf-token': mhsCsrf },
      payload: {
        title: 'percobaan-ilegal-mahasiswa',
      },
    });
    expect(studentCreateAttempt.statusCode).toBe(403);

    const sitiLogin = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: {
        email: 'siti.mhs@student.poltek-kampar.ac.id',
        password: 'MhsPolkam#2026',
      },
    });
    const sitiCookie = extractCookieValue(
      sitiLogin.headers['set-cookie'],
      'pk_lms_session'
    )!;
    const sitiEnrolledRes = await app.inject({
      method: 'GET',
      url: '/api/v1/classrooms',
      cookies: { pk_lms_session: sitiCookie },
    });
    const sitiEnrolledIds = new Set(
      sitiEnrolledRes.json().data.map((c: any) => c.id)
    );
    const dosenAllClassroomsRes = await app.inject({
      method: 'GET',
      url: '/api/v1/classrooms',
      cookies: { pk_lms_session: dosenCookie },
    });
    const unEnrolledClass = dosenAllClassroomsRes
      .json()
      .data.find((c: any) => !sitiEnrolledIds.has(c.id));
    expect(unEnrolledClass).toBeTruthy();

    const unEnrolledTopics = await app.inject({
      method: 'GET',
      url: `/api/v1/classrooms/${unEnrolledClass.id}/topics`,
      cookies: { pk_lms_session: sitiCookie },
    });
    expect(unEnrolledTopics.statusCode).toBe(403);

    // Item 19: Learning progress persistence
    const progPatchRes = await app.inject({
      method: 'PATCH',
      url: `/api/v1/materials/${materialId}/progress`,
      cookies: { pk_lms_session: mhsCookie },
      headers: { 'x-csrf-token': mhsCsrf },
      payload: {
        status: 'COMPLETED',
        progressPercent: 100,
        lastPosition: 125,
        scrollPercent: 100,
        videoWatchSeconds: 125,
      },
    });
    expect(progPatchRes.statusCode).toBe(200);
    expect(progPatchRes.json().data.status).toBe('COMPLETED');
    expect(progPatchRes.json().data.progressPercent).toBe(100);

    const progGetRes = await app.inject({
      method: 'GET',
      url: `/api/v1/materials/${materialId}/progress`,
      cookies: { pk_lms_session: mhsCookie },
    });
    expect(progGetRes.statusCode).toBe(200);
    expect(progGetRes.json().data.myProgress.status).toBe('COMPLETED');
    expect(progGetRes.json().data.myProgress.progressPercent).toBe(100);
  }, 30000);

  it('verifies all 25 items of the Advanced Assignment, Submission & Grading Management lifecycle', async () => {
    // Login as Dosen (Instructor)
    const dosenLogin = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: {
        email: 'fitriani.dosen@poltek-kampar.ac.id',
        password: 'DosenPolkam#2026',
      },
    });
    expect(dosenLogin.statusCode).toBe(200);
    const dosenCookie = extractCookieValue(dosenLogin.headers['set-cookie'], 'pk_lms_session')!;
    const dosenCsrf = dosenLogin.json().data.csrfToken;

    // Login as Mahasiswa 1 (Ahmad - Enrolled Active)
    const ahmadLogin = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: {
        email: 'ahmad.mhs@student.poltek-kampar.ac.id',
        password: 'MhsPolkam#2026',
      },
    });
    expect(ahmadLogin.statusCode).toBe(200);
    const ahmadCookie = extractCookieValue(ahmadLogin.headers['set-cookie'], 'pk_lms_session')!;
    const ahmadCsrf = ahmadLogin.json().data.csrfToken;
    const ahmadId = ahmadLogin.json().data.user.id;

    // Login as Mahasiswa 2 (Siti)
    const sitiLogin = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: {
        email: 'siti.mhs@student.poltek-kampar.ac.id',
        password: 'MhsPolkam#2026',
      },
    });
    expect(sitiLogin.statusCode).toBe(200);
    const sitiCookie = extractCookieValue(sitiLogin.headers['set-cookie'], 'pk_lms_session')!;
    const sitiCsrf = sitiLogin.json().data.csrfToken;
    const sitiId = sitiLogin.json().data.user.id;

    // Find classroom where Ahmad is active
    const classroomsRes = await app.inject({
      method: 'GET',
      url: '/api/v1/classrooms',
      cookies: { pk_lms_session: ahmadCookie },
    });
    const targetClassroom = classroomsRes.json().data.find((c: any) => c.canEnter);
    expect(targetClassroom).toBeTruthy();

    // Ensure Siti is also an active participant in targetClassroom so we have 2 active students
    // (Ahmad submits, Siti remains not_submitted to verify missing student tracking & cross-student isolation)
    const detailRes = await app.inject({
      method: 'GET',
      url: `/api/v1/classrooms/${targetClassroom.id}`,
      cookies: { pk_lms_session: dosenCookie },
    });
    const joinCode = detailRes.json().data.joinCodes?.find((j: any) => j.isActive)?.code;
    if (joinCode) {
      await app.inject({
        method: 'POST',
        url: '/api/v1/classrooms/join',
        cookies: { pk_lms_session: sitiCookie },
        headers: { 'x-csrf-token': sitiCsrf },
        payload: { code: joinCode },
      });
      // If pending, approve Siti
      const refreshedDetail = await app.inject({
        method: 'GET',
        url: `/api/v1/classrooms/${targetClassroom.id}`,
        cookies: { pk_lms_session: dosenCookie },
      });
      const sitiEnrollment = refreshedDetail
        .json()
        .data.enrollments.find((e: any) => e.studentId === sitiId);
      if (sitiEnrollment && sitiEnrollment.status !== 'active') {
        await app.inject({
          method: 'PATCH',
          url: `/api/v1/classrooms/${targetClassroom.id}/enrollments/${sitiEnrollment.id}`,
          cookies: { pk_lms_session: dosenCookie },
          headers: { 'x-csrf-token': dosenCsrf },
          payload: { status: 'active' },
        });
      }
    }

    const topicsRes = await app.inject({
      method: 'GET',
      url: `/api/v1/classrooms/${targetClassroom.id}/topics`,
      cookies: { pk_lms_session: dosenCookie },
    });
    const targetTopic = topicsRes.json().data[0];

    // Items 1, 2, 3: Creating an assignment, configuring allowed file types, and setting deadlines
    const pastDueDate = new Date(Date.now() - 30 * 60_000).toISOString(); // 30 mins ago to test late calculation

    const createAsgRes = await app.inject({
      method: 'POST',
      url: `/api/v1/classrooms/${targetClassroom.id}/assignments`,
      cookies: { pk_lms_session: dosenCookie },
      headers: { 'x-csrf-token': dosenCsrf },
      payload: {
        topicId: targetTopic?.id || null,
        meetingNumber: 5,
        title: 'Tugas Proyek Integrasi Backend & Keamanan S3',
        subtitle: 'Implementasi Presigned Upload, Rubrik & Audit Penilaian',
        shortDescription: 'Kerjakan laporan teknis, spreadsheet pengujian, dan kode repositori.',
        assignmentType: 'Project',
        learningObjectives: 'Mahasiswa mampu mengimplementasikan transaksi database dan penyimpanan objek.',
        maxPoints: 100,
        maxScore: 100,
        estimatedCompletionMinutes: 120,
        sequenceOrder: 1,
        instructionsJson: {
          type: 'doc',
          content: [
            {
              type: 'heading',
              attrs: { level: 2 },
              content: [{ type: 'text', text: 'Instruksi Pengerjaan Proyek' }],
            },
            {
              type: 'paragraph',
              content: [{ type: 'text', text: 'Unggah laporan PDF, Word, Excel, PPT, dan gambar arsitektur.' }],
            },
          ],
        },
        submissionConfig: {
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
          maxFiles: 10,
          maxLinks: 5,
          allowMultipleVersions: true,
          maxRevisions: 5,
          allowLateSubmission: true,
          gracePeriodMinutes: 0,
          allowAfterDeadline: true,
          allowEditBeforeDeadline: true,
          allowReturnForRevision: true,
          gradingMethod: 'RUBRIC',
        },
        dueAt: pastDueDate,
        allowLateSubmission: true,
        status: 'DRAFT',
      },
    });
    expect(createAsgRes.statusCode).toBe(201);
    const createdAsg = createAsgRes.json().data;
    const assignmentId = createdAsg.id;
    expect(assignmentId).toBeTruthy();
    expect(createdAsg.status).toBe('DRAFT');
    expect(createdAsg.submissionConfig.allowedExtensions).toContain('pdf');
    expect(createdAsg.submissionConfig.allowedExtensions).toContain('xlsx');

    // Draft assignment must not be accessible by student yet
    const draftCheck = await app.inject({
      method: 'GET',
      url: `/api/v1/assignments/${assignmentId}`,
      cookies: { pk_lms_session: ahmadCookie },
    });
    expect(draftCheck.statusCode).toBe(403);

    // Item 17 (part 1): Rubric creation
    const rubricRes = await app.inject({
      method: 'POST',
      url: `/api/v1/assignments/${assignmentId}/rubric`,
      cookies: { pk_lms_session: dosenCookie },
      headers: { 'x-csrf-token': dosenCsrf },
      payload: {
        title: 'Rubrik Proyek Keamanan & Database',
        description: 'Evaluasi berbasis kriteria terukur',
        criteria: [
          {
            criterionName: 'Arsitektur & Skema Database',
            description: 'Normalisasi tabel, FK, dan indeks',
            weight: 60,
            maxScore: 100,
          },
          {
            criterionName: 'Dokumentasi & Pengujian',
            description: 'Kelengkapan laporan PDF, Excel, dan slide',
            weight: 40,
            maxScore: 100,
          },
        ],
      },
    });
    expect([200, 201]).toContain(rubricRes.statusCode);
    const rubricCriteria = rubricRes.json().data.criteria;
    expect(rubricCriteria).toHaveLength(2);

    // Item 4: Publishing an assignment
    const pubAsgRes = await app.inject({
      method: 'POST',
      url: `/api/v1/assignments/${assignmentId}/publish`,
      cookies: { pk_lms_session: dosenCookie },
      headers: { 'x-csrf-token': dosenCsrf },
    });
    expect(pubAsgRes.statusCode).toBe(200);
    expect(pubAsgRes.json().data.status).toBe('PUBLISHED');

    // Verify disallowed file extension (.exe) is blocked on submission upload URL
    const blockedExeRes = await app.inject({
      method: 'POST',
      url: `/api/v1/assignments/${assignmentId}/submission-upload-url`,
      cookies: { pk_lms_session: ahmadCookie },
      headers: { 'x-csrf-token': ahmadCsrf },
      payload: {
        fileName: 'malware.exe',
        mimeType: 'application/octet-stream',
        fileSize: 1024,
      },
    });
    expect(blockedExeRes.statusCode).toBe(400);

    // Helper for student submission file upload via S3 presigned URL + PUT + confirm
    async function studentUploadSubmissionFile(
      fileName: string,
      mimeType: string,
      binaryBuffer: Buffer
    ) {
      const urlRes = await app.inject({
        method: 'POST',
        url: `/api/v1/assignments/${assignmentId}/submission-upload-url`,
        cookies: { pk_lms_session: ahmadCookie },
        headers: { 'x-csrf-token': ahmadCsrf },
        payload: {
          fileName,
          mimeType,
          fileSize: binaryBuffer.length,
        },
      });
      expect(urlRes.statusCode).toBe(200);
      const { uploadUrl, objectKey } = urlRes.json().data;

      const putRes = await app.inject({
        method: 'PUT',
        url: uploadUrl,
        headers: { 'content-type': mimeType },
        payload: binaryBuffer,
      });
      expect(putRes.statusCode).toBe(200);

      const confirmRes = await app.inject({
        method: 'POST',
        url: `/api/v1/assignments/${assignmentId}/submission-upload-confirm`,
        cookies: { pk_lms_session: ahmadCookie },
        headers: { 'x-csrf-token': ahmadCsrf },
        payload: {
          objectKey,
          originalFileName: fileName,
          mimeType,
          fileSize: binaryBuffer.length,
        },
      });
      expect(confirmRes.statusCode).toBe(201);
      return confirmRes.json().data;
    }

    // Item 5: Student uploading PDF
    const pdfFile = await studentUploadSubmissionFile(
      'laporan-proyek-ahmad.pdf',
      'application/pdf',
      Buffer.from('%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\n%%EOF', 'utf-8')
    );
    expect(pdfFile.fileExtension).toBe('pdf');

    // Item 6: Student uploading Word (DOCX)
    const docxFile = await studentUploadSubmissionFile(
      'dokumentasi-teknis.docx',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      Buffer.from('PK\x03\x04-WORD-DOCX-SUBMISSION-AHMAD', 'utf-8')
    );
    expect(docxFile.fileExtension).toBe('docx');

    // Item 7: Student uploading Excel (XLSX)
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([
      ['Skenario Uji', 'Status'],
      ['Presigned Upload S3', 'PASS'],
    ]);
    XLSX.utils.book_append_sheet(wb, ws, 'Hasil Uji');
    const xlsxBuf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
    const xlsxFile = await studentUploadSubmissionFile(
      'hasil-pengujian.xlsx',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      xlsxBuf
    );
    expect(xlsxFile.fileExtension).toBe('xlsx');

    // Item 8: Student uploading PowerPoint (PPTX)
    const pptxFile = await studentUploadSubmissionFile(
      'slide-demo-proyek.pptx',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      Buffer.from('PK\x03\x04 Slide 1: Demo Proyek Ahmad Fauzan', 'utf-8')
    );
    expect(pptxFile.fileExtension).toBe('pptx');

    // Item 9: Student uploading image (PNG)
    const pngBuf = Buffer.from(
      '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c63000100000500010d0a2db40000000049454e44ae426082',
      'hex'
    );
    const imgFile = await studentUploadSubmissionFile(
      'screenshot-erd.png',
      'image/png',
      pngBuf
    );
    expect(imgFile.fileExtension).toBe('png');

    // Items 10, 11, 13: Student submitting external links, text responses, and calculating late submission status (Version 1)
    const submitV1Res = await app.inject({
      method: 'POST',
      url: `/api/v1/assignments/${assignmentId}/submissions`,
      cookies: { pk_lms_session: ahmadCookie },
      headers: { 'x-csrf-token': ahmadCsrf },
      payload: {
        isDraft: false,
        submissionText: 'Berikut pengumpulan Versi 1 lengkap dengan 5 berkas dan tautan repositori.',
        submissionJson: {
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: 'Jawaban tertulis Tiptap Versi 1 oleh Ahmad Fauzan.' }],
            },
          ],
        },
        attachments: [pdfFile, docxFile, xlsxFile, pptxFile, imgFile],
        links: [
          {
            title: 'Repositori Proyek',
            url: 'https://github.com/poltek-kampar/proyek-ahmad',
            description: 'Kode sumber utama',
          },
        ],
      },
    });
    expect(submitV1Res.statusCode).toBe(201);
    const subV1 = submitV1Res.json().data;
    const submissionId = subV1.id;
    expect(submissionId).toBeTruthy();
    expect(subV1.currentVersion).toBe(1);
    expect(subV1.isLate).toBe(true);
    expect(subV1.lateMinutes).toBeGreaterThan(0);

    // Item 12: Preserving multiple submission versions (Submit Version 2)
    const submitV2Res = await app.inject({
      method: 'POST',
      url: `/api/v1/assignments/${assignmentId}/submissions`,
      cookies: { pk_lms_session: ahmadCookie },
      headers: { 'x-csrf-token': ahmadCsrf },
      payload: {
        isDraft: false,
        submissionText: 'Pengumpulan Versi 2 dengan perbaikan dokumentasi dan optimasi query.',
        submissionJson: {
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: 'Jawaban tertulis Tiptap Versi 2 (Diperbarui).' }],
            },
          ],
        },
        attachments: [pdfFile, docxFile, xlsxFile, pptxFile, imgFile],
        links: [
          {
            title: 'Repositori Proyek v2',
            url: 'https://github.com/poltek-kampar/proyek-ahmad-v2',
            description: 'Revisi ke-2',
          },
        ],
      },
    });
    expect(submitV2Res.statusCode).toBe(201);
    expect(submitV2Res.json().data.currentVersion).toBe(2);

    const versionsRes = await app.inject({
      method: 'GET',
      url: `/api/v1/submissions/${submissionId}/versions`,
      cookies: { pk_lms_session: ahmadCookie },
    });
    expect(versionsRes.statusCode).toBe(200);
    expect(versionsRes.json().data.length).toBe(2);

    // Items 14 & 15: Displaying all active classroom participants in the assignment table & identifying students who have not submitted
    const participantsRes = await app.inject({
      method: 'GET',
      url: `/api/v1/assignments/${assignmentId}/participants`,
      cookies: { pk_lms_session: dosenCookie },
    });
    expect(participantsRes.statusCode).toBe(200);
    const partData = participantsRes.json().data;
    expect(partData.summary.totalParticipants).toBeGreaterThanOrEqual(2);
    expect(partData.summary.submitted).toBeGreaterThanOrEqual(1);
    expect(partData.summary.notSubmitted).toBeGreaterThanOrEqual(1);

    const ahmadRow = partData.participants.find((p: any) => p.studentId === ahmadId);
    const sitiRow = partData.participants.find((p: any) => p.studentId === sitiId);
    expect(ahmadRow).toBeTruthy();
    expect(ahmadRow.isLate).toBe(true);
    expect(ahmadRow.submissionVersion).toBe(2);
    expect(sitiRow).toBeTruthy();
    expect(sitiRow.submissionStatus).toBe('not_submitted');

    // Send reminder to missing students
    const reminderRes = await app.inject({
      method: 'POST',
      url: `/api/v1/assignments/${assignmentId}/reminders`,
      cookies: { pk_lms_session: dosenCookie },
      headers: { 'x-csrf-token': dosenCsrf },
      payload: {
        message: 'Mohon segera mengumpulkan tugas sebelum batas akhir cutoff.',
      },
    });
    expect([200, 201]).toContain(reminderRes.statusCode);
    expect(reminderRes.json().data.sentCount).toBeGreaterThanOrEqual(1);

    // Item 16: Instructor previewing student attachments
    const previewSubRes = await app.inject({
      method: 'GET',
      url: `/api/v1/submissions/${submissionId}/preview`,
      cookies: { pk_lms_session: dosenCookie },
    });
    expect(previewSubRes.statusCode).toBe(200);
    expect(previewSubRes.json().data.attachments.length).toBeGreaterThanOrEqual(5);

    // Item 19: Blocking student access to other students' submissions & files
    const sitiSpySubRes = await app.inject({
      method: 'GET',
      url: `/api/v1/submissions/${submissionId}`,
      cookies: { pk_lms_session: sitiCookie },
    });
    expect(sitiSpySubRes.statusCode).toBe(403);

    const sitiSpyFileRes = await app.inject({
      method: 'GET',
      url: `/api/v1/s3-presigned/object?key=${encodeURIComponent(pdfFile.objectKey)}`,
      cookies: { pk_lms_session: sitiCookie },
    });
    expect(sitiSpyFileRes.statusCode).toBe(403);

    // Item 18: Backend grade validation (score exceeding maxScore must fail with 400)
    const invalidGradeRes = await app.inject({
      method: 'POST',
      url: `/api/v1/submissions/${submissionId}/grade`,
      cookies: { pk_lms_session: dosenCookie },
      headers: { 'x-csrf-token': dosenCsrf },
      payload: {
        gradingMethod: 'DIRECT',
        rawScore: 150, // exceeds maxScore 100
        publish: false,
      },
    });
    expect(invalidGradeRes.statusCode).toBe(400);

    // Item 20: Saving draft grade (publish: false) and blocking student access to unpublished grades
    const draftGradeRes = await app.inject({
      method: 'POST',
      url: `/api/v1/submissions/${submissionId}/grade`,
      cookies: { pk_lms_session: dosenCookie },
      headers: { 'x-csrf-token': dosenCsrf },
      payload: {
        gradingMethod: 'RUBRIC',
        latePenaltyScore: 5,
        feedbackText: 'Evaluasi draf sementara belum dipublikasikan.',
        privateNotes: 'Catatan rahasia khusus dosen pengampu.',
        publish: false,
        rubricScores: [
          {
            criterionId: rubricCriteria[0].id,
            score: 90,
            feedback: 'Skema sangat rapi',
          },
          {
            criterionId: rubricCriteria[1].id,
            score: 85,
            feedback: 'Dokumentasi baik',
          },
        ],
      },
    });
    expect(draftGradeRes.statusCode).toBe(200);
    expect(draftGradeRes.json().data.isPublished).toBe(false);

    const ahmadViewDraftGrade = await app.inject({
      method: 'GET',
      url: `/api/v1/submissions/${submissionId}`,
      cookies: { pk_lms_session: ahmadCookie },
    });
    expect(ahmadViewDraftGrade.statusCode).toBe(200);
    const ahmadSubDuringDraft = ahmadViewDraftGrade.json().data;
    expect(ahmadSubDuringDraft.submission.score).toBeNull();
    expect(ahmadSubDuringDraft.submission.feedback).toBeNull();
    expect(ahmadSubDuringDraft.grade).toBeNull();
    expect(ahmadSubDuringDraft.submission.privateInstructorNotes).toBeNull();

    // Item 22: Returning submission for revision
    const returnRes = await app.inject({
      method: 'POST',
      url: `/api/v1/submissions/${submissionId}/return`,
      cookies: { pk_lms_session: dosenCookie },
      headers: { 'x-csrf-token': dosenCsrf },
      payload: {
        generalFeedback: 'Silakan tambahkan diagram sequence pada bagian ke-3.',
        revisionInstructions: 'Lengkapi diagram sequence sebelum publikasi nilai akhir.',
      },
    });
    expect(returnRes.statusCode).toBe(200);
    expect(returnRes.json().data.status).toBe('returned');

    // Item 21 & 23: Publishing grades, feedback visibility, and grade modification audit history
    const pubGradeRes = await app.inject({
      method: 'POST',
      url: `/api/v1/submissions/${submissionId}/grade`,
      cookies: { pk_lms_session: dosenCookie },
      headers: { 'x-csrf-token': dosenCsrf },
      payload: {
        gradingMethod: 'RUBRIC',
        latePenaltyScore: 3,
        feedbackText: 'Kerja bagus! Seluruh spesifikasi arsitektur S3 dan PostgreSQL terpenuhi.',
        privateNotes: 'Internal: Mahasiswa berpotensi menjadi asisten laboratorium.',
        publish: true,
        rubricScores: [
          {
            criterionId: rubricCriteria[0].id,
            score: 95,
            feedback: 'Sangat baik (95/100)',
          },
          {
            criterionId: rubricCriteria[1].id,
            score: 90,
            feedback: 'Sangat lengkap (90/100)',
          },
        ],
      },
    });
    expect(pubGradeRes.statusCode).toBe(200);
    // Weighted rubric score: (95 * 0.60) + (90 * 0.40) = 57 + 36 = 93. Minus latePenalty 3 = 90.
    expect(pubGradeRes.json().data.finalScore).toBe(90);
    expect(pubGradeRes.json().data.isPublished).toBe(true);

    // Student can now see published score, rubric breakdown, and feedback, while privateNotes remain hidden
    const ahmadViewPubGrade = await app.inject({
      method: 'GET',
      url: `/api/v1/submissions/${submissionId}`,
      cookies: { pk_lms_session: ahmadCookie },
    });
    expect(ahmadViewPubGrade.statusCode).toBe(200);
    const ahmadPubData = ahmadViewPubGrade.json().data;
    expect(Number(ahmadPubData.submission.score)).toBe(90);
    expect(ahmadPubData.submission.feedback).toContain('Kerja bagus!');
    expect(ahmadPubData.submission.privateInstructorNotes).toBeNull();
    expect(ahmadPubData.rubricScores.length).toBe(2);

    // Instructor sees full grade audit history (draft + published)
    const dosenViewSub = await app.inject({
      method: 'GET',
      url: `/api/v1/submissions/${submissionId}`,
      cookies: { pk_lms_session: dosenCookie },
    });
    expect(dosenViewSub.statusCode).toBe(200);
    expect(dosenViewSub.json().data.gradeHistory.length).toBeGreaterThanOrEqual(2);

    // Item 24: Exporting assignment grade reports (CSV & XLSX) and verifying analytics
    const analyticsRes = await app.inject({
      method: 'GET',
      url: `/api/v1/assignments/${assignmentId}/analytics`,
      cookies: { pk_lms_session: dosenCookie },
    });
    expect(analyticsRes.statusCode).toBe(200);
    expect(analyticsRes.json().data.averageGrade).toBe(90);

    const csvExportRes = await app.inject({
      method: 'GET',
      url: `/api/v1/assignments/${assignmentId}/export?format=csv`,
      cookies: { pk_lms_session: dosenCookie },
    });
    expect(csvExportRes.statusCode).toBe(200);
    expect(csvExportRes.headers['content-type']).toContain('text/csv');
    expect(csvExportRes.body).toContain('Ahmad Fauzan');

    const xlsxExportRes = await app.inject({
      method: 'GET',
      url: `/api/v1/assignments/${assignmentId}/export?format=xlsx`,
      cookies: { pk_lms_session: dosenCookie },
    });
    expect(xlsxExportRes.statusCode).toBe(200);
    expect(xlsxExportRes.headers['content-type']).toContain(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
  }, 30000);

  it('verifies all 23 items of the Advanced Assessment & Examination Management Engine lifecycle', async () => {
    // Login as Dosen (Instructor)
    const dosenLogin = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: {
        email: 'fitriani.dosen@poltek-kampar.ac.id',
        password: 'DosenPolkam#2026',
      },
    });
    expect(dosenLogin.statusCode).toBe(200);
    const dosenCookie = extractCookieValue(dosenLogin.headers['set-cookie'], 'pk_lms_session')!;
    const dosenCsrf = dosenLogin.json().data.csrfToken;

    // Login as Mahasiswa 1 (Ahmad)
    const ahmadLogin = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: {
        email: 'ahmad.mhs@student.poltek-kampar.ac.id',
        password: 'MhsPolkam#2026',
      },
    });
    expect(ahmadLogin.statusCode).toBe(200);
    const ahmadCookie = extractCookieValue(ahmadLogin.headers['set-cookie'], 'pk_lms_session')!;
    const ahmadCsrf = ahmadLogin.json().data.csrfToken;
    const ahmadId = ahmadLogin.json().data.user.id;

    // Login as Mahasiswa 2 (Siti)
    const sitiLogin = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: {
        email: 'siti.mhs@student.poltek-kampar.ac.id',
        password: 'MhsPolkam#2026',
      },
    });
    expect(sitiLogin.statusCode).toBe(200);
    const sitiCookie = extractCookieValue(sitiLogin.headers['set-cookie'], 'pk_lms_session')!;
    const sitiCsrf = sitiLogin.json().data.csrfToken;

    // Find classroom where Ahmad is active
    const classroomsRes = await app.inject({
      method: 'GET',
      url: '/api/v1/classrooms',
      cookies: { pk_lms_session: ahmadCookie },
    });
    const targetClassroom = classroomsRes.json().data.find((c: any) => c.canEnter);
    expect(targetClassroom).toBeTruthy();

    // Item 5: Question Bank creation & question management (create, edit, version history, duplicate)
    const createBankRes = await app.inject({
      method: 'POST',
      url: '/api/v1/question-banks',
      cookies: { pk_lms_session: dosenCookie },
      headers: { 'x-csrf-token': dosenCsrf },
      payload: {
        classroomId: targetClassroom.id,
        title: 'Bank Soal Uji Komprehensif 8 Objektif & Esai',
        subject: 'Rekayasa Perangkat Lunak',
        topic: 'Pengujian & Keamanan Ujian',
        description: 'Bank soal untuk verifikasi 23 poin mesin ujian.',
        isShared: true,
      },
    });
    expect(createBankRes.statusCode).toBe(201);
    const bankId = createBankRes.json().data.questionBank.id;

    // Item 4: Create all 8 Objective Question Types + Essay Question in the Question Bank
    const q1Res = await app.inject({
      method: 'POST',
      url: '/api/v1/questions',
      cookies: { pk_lms_session: dosenCookie },
      headers: { 'x-csrf-token': dosenCsrf },
      payload: {
        questionBankId: bankId,
        classroomId: targetClassroom.id,
        questionMode: 'OBJECTIVE',
        questionType: 'SINGLE_CHOICE',
        subject: 'Basis Data',
        topic: 'ACID',
        category: 'Core DB',
        difficulty: 'EASY',
        learningOutcome: 'CPMK-1',
        promptText: 'Manakah kepanjangan dari huruf A pada ACID?',
        points: 10,
        options: [
          { optionLabel: 'A', optionText: 'Atomicity', isCorrect: true, scoreWeight: 100 },
          { optionLabel: 'B', optionText: 'Availability', isCorrect: false, scoreWeight: 0 },
          { optionLabel: 'C', optionText: 'Authorization', isCorrect: false, scoreWeight: 0 },
        ],
        tags: ['acid', 'db'],
      },
    });
    expect(q1Res.statusCode).toBe(201);
    const qSingle = q1Res.json().data.question;

    // Edit question to verify version_history increment
    const editQ1Res = await app.inject({
      method: 'PATCH',
      url: `/api/v1/questions/${qSingle.id}`,
      cookies: { pk_lms_session: dosenCookie },
      headers: { 'x-csrf-token': dosenCsrf },
      payload: {
        promptText: 'Manakah kepanjangan dari huruf A pada properti transaksi ACID?',
      },
    });
    expect(editQ1Res.statusCode).toBe(200);
    expect(editQ1Res.json().data.question.versionNumber).toBe(2);
    expect(editQ1Res.json().data.question.versionHistory.length).toBe(1);

    // Duplicate question
    const dupQ1Res = await app.inject({
      method: 'POST',
      url: `/api/v1/questions/${qSingle.id}/duplicate`,
      cookies: { pk_lms_session: dosenCookie },
      headers: { 'x-csrf-token': dosenCsrf },
    });
    expect(dupQ1Res.statusCode).toBe(201);
    expect(dupQ1Res.json().data.question.promptText).toContain('(Salinan)');

    const q2Res = await app.inject({
      method: 'POST',
      url: '/api/v1/questions',
      cookies: { pk_lms_session: dosenCookie },
      headers: { 'x-csrf-token': dosenCsrf },
      payload: {
        questionBankId: bankId,
        classroomId: targetClassroom.id,
        questionMode: 'OBJECTIVE',
        questionType: 'MULTIPLE_SELECT',
        difficulty: 'MEDIUM',
        promptText: 'Pilih protokol lapisan transport:',
        points: 10,
        partialCreditEnabled: true,
        options: [
          { optionLabel: 'A', optionText: 'TCP', isCorrect: true, scoreWeight: 50 },
          { optionLabel: 'B', optionText: 'UDP', isCorrect: true, scoreWeight: 50 },
          { optionLabel: 'C', optionText: 'HTTP', isCorrect: false, scoreWeight: 0 },
        ],
      },
    });
    const qMulti = q2Res.json().data.question;

    const q3Res = await app.inject({
      method: 'POST',
      url: '/api/v1/questions',
      cookies: { pk_lms_session: dosenCookie },
      headers: { 'x-csrf-token': dosenCsrf },
      payload: {
        questionBankId: bankId,
        classroomId: targetClassroom.id,
        questionMode: 'OBJECTIVE',
        questionType: 'TRUE_FALSE',
        difficulty: 'EASY',
        promptText: 'PostgreSQL mendukung tipe data JSONB terindeks.',
        points: 10,
        options: [
          { optionLabel: 'A', optionText: 'Benar', isCorrect: true, scoreWeight: 100 },
          { optionLabel: 'B', optionText: 'Salah', isCorrect: false, scoreWeight: 0 },
        ],
      },
    });
    const qTF = q3Res.json().data.question;

    const q4Res = await app.inject({
      method: 'POST',
      url: '/api/v1/questions',
      cookies: { pk_lms_session: dosenCookie },
      headers: { 'x-csrf-token': dosenCsrf },
      payload: {
        questionBankId: bankId,
        classroomId: targetClassroom.id,
        questionMode: 'OBJECTIVE',
        questionType: 'MATCHING',
        difficulty: 'MEDIUM',
        promptText: 'Pasangkan kode status HTTP dengan artinya:',
        points: 10,
        partialCreditEnabled: true,
        answerConfig: {
          pairs: [
            { id: 'p1', leftText: '200', rightText: 'OK' },
            { id: 'p2', leftText: '403', rightText: 'Forbidden' },
          ],
        },
      },
    });
    const qMatching = q4Res.json().data.question;

    const q5Res = await app.inject({
      method: 'POST',
      url: '/api/v1/questions',
      cookies: { pk_lms_session: dosenCookie },
      headers: { 'x-csrf-token': dosenCsrf },
      payload: {
        questionBankId: bankId,
        classroomId: targetClassroom.id,
        questionMode: 'OBJECTIVE',
        questionType: 'ORDERING',
        difficulty: 'MEDIUM',
        promptText: 'Urutkan fase 3-way handshake TCP:',
        points: 10,
        partialCreditEnabled: true,
        answerConfig: {
          scoringPolicy: 'EXACT_OR_PARTIAL',
          items: [
            { id: 'o1', text: 'SYN' },
            { id: 'o2', text: 'SYN-ACK' },
            { id: 'o3', text: 'ACK' },
          ],
        },
      },
    });
    const qOrdering = q5Res.json().data.question;

    const q6Res = await app.inject({
      method: 'POST',
      url: '/api/v1/questions',
      cookies: { pk_lms_session: dosenCookie },
      headers: { 'x-csrf-token': dosenCsrf },
      payload: {
        questionBankId: bankId,
        classroomId: targetClassroom.id,
        questionMode: 'OBJECTIVE',
        questionType: 'FILL_IN_BLANK',
        difficulty: 'EASY',
        promptText: 'Perintah DDL untuk menghapus tabel adalah ______ TABLE.',
        points: 10,
        answerConfig: {
          acceptedAnswers: ['DROP', 'drop'],
          caseSensitive: false,
        },
      },
    });
    const qFillBlank = q6Res.json().data.question;

    const q7Res = await app.inject({
      method: 'POST',
      url: '/api/v1/questions',
      cookies: { pk_lms_session: dosenCookie },
      headers: { 'x-csrf-token': dosenCsrf },
      payload: {
        questionBankId: bankId,
        classroomId: targetClassroom.id,
        questionMode: 'OBJECTIVE',
        questionType: 'SHORT_ANSWER',
        difficulty: 'MEDIUM',
        promptText: 'Algoritma hashing password yang digunakan Politeknik Kampar LMS adalah?',
        points: 10,
        answerConfig: {
          acceptedVariants: ['Argon2id', 'Argon2'],
          caseSensitive: false,
          manualReviewFallback: false,
        },
      },
    });
    const qShort = q7Res.json().data.question;

    const q8Res = await app.inject({
      method: 'POST',
      url: '/api/v1/questions',
      cookies: { pk_lms_session: dosenCookie },
      headers: { 'x-csrf-token': dosenCsrf },
      payload: {
        questionBankId: bankId,
        classroomId: targetClassroom.id,
        questionMode: 'OBJECTIVE',
        questionType: 'NUMERIC',
        difficulty: 'HARD',
        promptText: 'Berapa nilai 2^8?',
        points: 10,
        answerConfig: {
          exactValue: 256,
          tolerance: 0.5,
          unit: '',
        },
      },
    });
    const qNumeric = q8Res.json().data.question;

    const qEssayRes = await app.inject({
      method: 'POST',
      url: '/api/v1/questions',
      cookies: { pk_lms_session: dosenCookie },
      headers: { 'x-csrf-token': dosenCsrf },
      payload: {
        questionBankId: bankId,
        classroomId: targetClassroom.id,
        questionMode: 'ESSAY',
        questionType: 'CASE_STUDY',
        difficulty: 'HARD',
        promptText: 'Jelaskan mengapa kunci jawaban tidak boleh dikirim ke klien selama ujian!',
        points: 20,
        answerConfig: {
          minWords: 5,
          maxWords: 500,
          modelAnswer: 'Agar mahasiswa tidak dapat melihat kunci jawaban melalui DevTools network inspector.',
        },
        rubric: {
          title: 'Rubrik Keamanan Ujian',
          description: 'Evaluasi analisis keamanan',
          criteria: [
            { criterionName: 'Ketepatan Konsep', weight: 60, maxScore: 100 },
            { criterionName: 'Kedalaman Teknis', weight: 40, maxScore: 100 },
          ],
        },
      },
    });
    expect(qEssayRes.statusCode).toBe(201);
    const qEssay = qEssayRes.json().data.question;

    // Item 18 (part 1): Student blocked from accessing Question Bank questions & answer keys
    const studentSpyBankRes = await app.inject({
      method: 'GET',
      url: `/api/v1/question-banks/${bankId}/questions`,
      cookies: { pk_lms_session: ahmadCookie },
    });
    expect(studentSpyBankRes.statusCode).toBe(403);

    // Item 1 & Item 6: Create an Objective Assessment with Random Question Pool
    const objAsmtRes = await app.inject({
      method: 'POST',
      url: '/api/v1/classrooms/' + targetClassroom.id + '/assessments',
      cookies: { pk_lms_session: dosenCookie },
      headers: { 'x-csrf-token': dosenCsrf },
      payload: {
        title: 'Kuis Objektif Pool Acak',
        assessmentMode: 'OBJECTIVE',
        category: 'QUIZ',
        maxScore: 30,
        passingGrade: 20,
        durationMinutes: 30,
        maxAttempts: 2,
        status: 'PUBLISHED',
        questionPools: [
          {
            questionBankId: bankId,
            title: 'Pool Objektif',
            difficultyFilter: 'ANY',
            questionCount: 3,
            pointsPerQuestion: 10,
          },
        ],
      },
    });
    expect(objAsmtRes.statusCode).toBe(201);
    const objAssessmentId = objAsmtRes.json().data.assessment.id;

    // Verify random pool selects 3 questions when attempt is created
    const poolAttRes = await app.inject({
      method: 'POST',
      url: `/api/v1/assessments/${objAssessmentId}/attempts`,
      cookies: { pk_lms_session: sitiCookie },
      headers: { 'x-csrf-token': sitiCsrf },
    });
    expect(poolAttRes.statusCode).toBe(201);
    const poolAttQs = await app.inject({
      method: 'GET',
      url: `/api/v1/attempts/${poolAttRes.json().data.attempt.id}/questions`,
      cookies: { pk_lms_session: sitiCookie },
    });
    expect(poolAttQs.statusCode).toBe(200);
    expect(poolAttQs.json().data.questions.length).toBe(3);

    // Item 2: Create an Essay Assessment
    const essayAsmtRes = await app.inject({
      method: 'POST',
      url: '/api/v1/classrooms/' + targetClassroom.id + '/assessments',
      cookies: { pk_lms_session: dosenCookie },
      headers: { 'x-csrf-token': dosenCsrf },
      payload: {
        title: 'Ujian Esai Studi Kasus Mandiri',
        assessmentMode: 'ESSAY',
        category: 'FINAL_EXAM',
        maxScore: 20,
        passingGrade: 14,
        durationMinutes: 45,
        maxAttempts: 1,
        status: 'PUBLISHED',
        questions: [{ questionId: qEssay.id, pointsOverride: 20 }],
      },
    });
    expect(essayAsmtRes.statusCode).toBe(201);
    expect(essayAsmtRes.json().data.assessment.assessmentMode).toBe('ESSAY');

    // Item 3: Create a Hybrid Assessment containing all 8 Objective Question Types + 1 Essay Question (Total = 100 pts)
    const hybridAsmtRes = await app.inject({
      method: 'POST',
      url: '/api/v1/classrooms/' + targetClassroom.id + '/assessments',
      cookies: { pk_lms_session: dosenCookie },
      headers: { 'x-csrf-token': dosenCsrf },
      payload: {
        title: 'UTS Hybrid Komprehensif (8 Objektif + 1 Esai)',
        assessmentMode: 'HYBRID',
        category: 'MIDTERM',
        maxScore: 100,
        passingGrade: 70,
        durationMinutes: 60,
        maxAttempts: 2,
        status: 'DRAFT',
        sections: [
          { title: 'Bagian A: Objektif (80 Poin)', sectionType: 'OBJECTIVE', totalPoints: 80, sortOrder: 1 },
          { title: 'Bagian B: Esai (20 Poin)', sectionType: 'ESSAY', totalPoints: 20, sortOrder: 2 },
        ],
        questions: [
          { questionId: qSingle.id, sectionIndex: 0, pointsOverride: 10, sortOrder: 1 },
          { questionId: qMulti.id, sectionIndex: 0, pointsOverride: 10, sortOrder: 2 },
          { questionId: qTF.id, sectionIndex: 0, pointsOverride: 10, sortOrder: 3 },
          { questionId: qMatching.id, sectionIndex: 0, pointsOverride: 10, sortOrder: 4 },
          { questionId: qOrdering.id, sectionIndex: 0, pointsOverride: 10, sortOrder: 5 },
          { questionId: qFillBlank.id, sectionIndex: 0, pointsOverride: 10, sortOrder: 6 },
          { questionId: qShort.id, sectionIndex: 0, pointsOverride: 10, sortOrder: 7 },
          { questionId: qNumeric.id, sectionIndex: 0, pointsOverride: 10, sortOrder: 8 },
          { questionId: qEssay.id, sectionIndex: 1, pointsOverride: 20, sortOrder: 9 },
        ],
        accommodations: [
          {
            studentId: ahmadId,
            extraDurationMinutes: 15,
            extraAttempts: 1,
            reason: 'Akomodasi waktu tambahan uji integrasi',
          },
        ],
      },
    });
    expect(hybridAsmtRes.statusCode).toBe(201);
    const hybridId = hybridAsmtRes.json().data.assessment.id;

    // Publish the Hybrid Assessment
    const pubHybridRes = await app.inject({
      method: 'POST',
      url: `/api/v1/assessments/${hybridId}/publish`,
      cookies: { pk_lms_session: dosenCookie },
      headers: { 'x-csrf-token': dosenCsrf },
      payload: { status: 'PUBLISHED' },
    });
    expect(pubHybridRes.statusCode).toBe(200);
    expect(pubHybridRes.json().data.assessment.status).toBe('PUBLISHED');

    // Item 8: Attempt creation by Ahmad
    const startAttemptRes = await app.inject({
      method: 'POST',
      url: `/api/v1/assessments/${hybridId}/attempts`,
      cookies: { pk_lms_session: ahmadCookie },
      headers: { 'x-csrf-token': ahmadCsrf },
    });
    expect(startAttemptRes.statusCode).toBe(201);
    const attemptData = startAttemptRes.json().data;
    expect(attemptData.resumed).toBe(false);
    const attemptId = attemptData.attempt.id;

    // Item 7 & Item 18: Fetch attempt questions & verify answer-key protection and snapshot integrity
    const getQsRes1 = await app.inject({
      method: 'GET',
      url: `/api/v1/attempts/${attemptId}/questions`,
      cookies: { pk_lms_session: ahmadCookie },
    });
    expect(getQsRes1.statusCode).toBe(200);
    const snapQuestions = getQsRes1.json().data.questions;
    expect(snapQuestions.length).toBe(9);

    const rawQuestionsJson = JSON.stringify(snapQuestions);
    expect(rawQuestionsJson).not.toContain('serverAnswerKeySnapshot');
    expect(rawQuestionsJson).not.toContain('acceptedAnswers');
    expect(rawQuestionsJson).not.toContain('exactValue');
    expect(rawQuestionsJson).not.toContain('modelAnswer');

    // Modify source question in bank during active attempt; verify attempt snapshot remains immutable!
    await app.inject({
      method: 'PATCH',
      url: `/api/v1/questions/${qSingle.id}`,
      cookies: { pk_lms_session: dosenCookie },
      headers: { 'x-csrf-token': dosenCsrf },
      payload: {
        promptText: 'TEKS BARU SETELAH SNAPSHOT DIBUAT (TIDAK BOLEH MENGUBAH UJIAN AKTIF)',
      },
    });
    const getQsRes2 = await app.inject({
      method: 'GET',
      url: `/api/v1/attempts/${attemptId}/questions`,
      cookies: { pk_lms_session: ahmadCookie },
    });
    const sqSingle = getQsRes2.json().data.questions.find(
      (q: any) => q.questionType === 'SINGLE_CHOICE'
    );
    expect(sqSingle.promptText).toBe(
      'Manakah kepanjangan dari huruf A pada properti transaksi ACID?'
    );

    // Item 9: Answer autosave across all 8 Objective Question Types + 1 Essay Question
    for (const sq of snapQuestions) {
      let answerPayload: Record<string, any> = {};
      if (sq.questionType === 'SINGLE_CHOICE') {
        const optA = sq.studentOptionsSnapshot.options.find(
          (o: any) => o.optionText === 'Atomicity'
        );
        answerPayload = { selectedOptionId: optA.id };
      } else if (sq.questionType === 'MULTIPLE_SELECT') {
        // Select TCP (correct, 50%) only -> partial credit = 5 / 10 pts
        const optTcp = sq.studentOptionsSnapshot.options.find(
          (o: any) => o.optionText === 'TCP'
        );
        answerPayload = { selectedOptionIds: [optTcp.id] };
      } else if (sq.questionType === 'TRUE_FALSE') {
        const optTrue = sq.studentOptionsSnapshot.options.find(
          (o: any) => o.optionText === 'Benar'
        );
        answerPayload = { selectedOptionId: optTrue.id };
      } else if (sq.questionType === 'MATCHING') {
        answerPayload = {
          matches: { p1: 'OK', p2: 'Forbidden' },
        };
      } else if (sq.questionType === 'ORDERING') {
        answerPayload = {
          orderedIds: ['o1', 'o2', 'o3'],
        };
      } else if (sq.questionType === 'FILL_IN_BLANK') {
        answerPayload = { textAnswer: 'DROP' };
      } else if (sq.questionType === 'SHORT_ANSWER') {
        answerPayload = { textAnswer: 'argon2id' };
      } else if (sq.questionType === 'NUMERIC') {
        answerPayload = { numericAnswer: 256.2 }; // within tolerance 0.5 of 256
      } else if (sq.questionMode === 'ESSAY') {
        answerPayload = {
          essayText:
            'Kunci jawaban wajib diisolasi di server dalam kolom server_answer_key_snapshot agar tidak bocor di DevTools mahasiswa.',
          essayHtml:
            '<p>Kunci jawaban wajib diisolasi di server dalam kolom server_answer_key_snapshot agar tidak bocor di DevTools mahasiswa.</p>',
        };
      }

      const saveRes = await app.inject({
        method: 'PUT',
        url: `/api/v1/attempts/${attemptId}/answers/${sq.id}`,
        cookies: { pk_lms_session: ahmadCookie },
        headers: { 'x-csrf-token': ahmadCsrf },
        payload: { answerPayload, isAnswered: true },
      });
      expect(saveRes.statusCode).toBe(200);
      expect(saveRes.json().data.answer.isAnswered).toBe(true);
    }

    // Item 10: Resume after refresh (calling POST /attempts returns resumed: true and preserves all saved answers)
    const resumeRes = await app.inject({
      method: 'POST',
      url: `/api/v1/assessments/${hybridId}/attempts`,
      cookies: { pk_lms_session: ahmadCookie },
      headers: { 'x-csrf-token': ahmadCsrf },
    });
    expect(resumeRes.statusCode).toBe(200);
    expect(resumeRes.json().data.resumed).toBe(true);
    expect(resumeRes.json().data.attempt.id).toBe(attemptId);

    const checkProgressRes = await app.inject({
      method: 'GET',
      url: `/api/v1/attempts/${attemptId}`,
      cookies: { pk_lms_session: ahmadCookie },
    });
    expect(checkProgressRes.statusCode).toBe(200);
    expect(checkProgressRes.json().data.progress.answeredQuestions).toBe(9);

    // Item 17 (part 1): Student privacy - Siti cannot view or save answers to Ahmad's attempt
    const sitiSpyAttempt = await app.inject({
      method: 'GET',
      url: `/api/v1/attempts/${attemptId}`,
      cookies: { pk_lms_session: sitiCookie },
    });
    expect(sitiSpyAttempt.statusCode).toBe(403);

    const sitiSpyQuestions = await app.inject({
      method: 'GET',
      url: `/api/v1/attempts/${attemptId}/questions`,
      cookies: { pk_lms_session: sitiCookie },
    });
    expect(sitiSpyQuestions.statusCode).toBe(403);

    // Item 13: Submit attempt and verify Objective Auto-Grading (7 correct * 10 + 1 partial * 5 = 75.00 objective points)
    const submitAttRes = await app.inject({
      method: 'POST',
      url: `/api/v1/attempts/${attemptId}/submit`,
      cookies: { pk_lms_session: ahmadCookie },
      headers: { 'x-csrf-token': ahmadCsrf },
      payload: { idempotencyKey: 'ahmad-hybrid-submit-1' },
    });
    expect(submitAttRes.statusCode).toBe(200);
    const subAtt = submitAttRes.json().data.attempt;
    expect(subAtt.status).toBe('SUBMITTED');
    expect(subAtt.objectiveGradingStatus).toBe('GRADED');
    expect(subAtt.essayGradingStatus).toBe('PENDING');
    expect(subAtt.finalGradingStatus).toBe('PENDING_ESSAY');
    // Score is hidden from student before publication
    expect(subAtt.totalScore).toBeNull();

    // Item 15 (part 1): Prevent publishing assessment results while mandatory essay grading is incomplete
    const prematurePublishRes = await app.inject({
      method: 'POST',
      url: `/api/v1/assessments/${hybridId}/publish-results`,
      cookies: { pk_lms_session: dosenCookie },
      headers: { 'x-csrf-token': dosenCsrf },
    });
    expect(prematurePublishRes.statusCode).toBe(400);
    expect(prematurePublishRes.json().error.code).toBe('INCOMPLETE_MANDATORY_GRADING');

    // Item 14, 15, 16, 22: Instructor Essay & Hybrid Rubric Grading + Audit History
    const gradingViewRes = await app.inject({
      method: 'GET',
      url: `/api/v1/attempts/${attemptId}/grading`,
      cookies: { pk_lms_session: dosenCookie },
    });
    expect(gradingViewRes.statusCode).toBe(200);
    expect(Number(gradingViewRes.json().data.attempt.objectiveScore)).toBe(75);
    const essaySnapQ = gradingViewRes
      .json()
      .data.questions.find((q: any) => q.questionMode === 'ESSAY');
    expect(essaySnapQ).toBeTruthy();
    const essayRubricCriteria = essaySnapQ.rubricSnapshot.criteria;
    expect(essayRubricCriteria.length).toBe(2);

    // Save draft essay grade first
    const draftEssayGradeRes = await app.inject({
      method: 'POST',
      url: `/api/v1/attempts/${attemptId}/essay-grades`,
      cookies: { pk_lms_session: dosenCookie },
      headers: { 'x-csrf-token': dosenCsrf },
      payload: {
        isDraft: true,
        publishToStudent: false,
        generalFeedback: 'Draf evaluasi esai.',
        grades: [
          {
            attemptQuestionId: essaySnapQ.id,
            gradingMethod: 'RUBRIC',
            criterionScores: [
              { criterionId: essayRubricCriteria[0].id, score: 80, feedback: 'Cukup tepat' },
              { criterionId: essayRubricCriteria[1].id, score: 75, feedback: 'Cukup jelas' },
            ],
            feedback: 'Draf umpan balik esai.',
            privateFeedback: 'Catatan internal dosen.',
          },
        ],
      },
    });
    expect(draftEssayGradeRes.statusCode).toBe(200);
    expect(draftEssayGradeRes.json().data.attempt.essayGradingStatus).toBe('DRAFT_SAVED');

    // Finalize essay grade with Rubric:
    // Criterion 0 (weight 60, max 100): score 90 -> 90/100 * 60% = 54%
    // Criterion 1 (weight 40, max 100): score 85 -> 85/100 * 40% = 34%
    // Total weighted ratio = 88% of 20 max points = 17.60 points.
    // Combined Hybrid Score = 75 (Objective) + 17.6 (Essay) = 92.60 / 100.
    const finalEssayGradeRes = await app.inject({
      method: 'POST',
      url: `/api/v1/attempts/${attemptId}/essay-grades`,
      cookies: { pk_lms_session: dosenCookie },
      headers: { 'x-csrf-token': dosenCsrf },
      payload: {
        isDraft: false,
        publishToStudent: false,
        generalFeedback: 'Analisis keamanan ujian sangat komprehensif.',
        grades: [
          {
            attemptQuestionId: essaySnapQ.id,
            gradingMethod: 'RUBRIC',
            criterionScores: [
              { criterionId: essayRubricCriteria[0].id, score: 90, feedback: 'Konsep isolasi tepat' },
              { criterionId: essayRubricCriteria[1].id, score: 85, feedback: 'Penjelasan arsitektur baik' },
            ],
            feedback: 'Jawaban studi kasus sangat baik.',
            privateFeedback: 'Kandidat asisten lab.',
          },
        ],
      },
    });
    expect(finalEssayGradeRes.statusCode).toBe(200);
    const gradedAtt = finalEssayGradeRes.json().data.attempt;
    expect(Number(gradedAtt.objectiveScore)).toBe(75);
    expect(Number(gradedAtt.essayScore)).toBe(17.6);
    expect(Number(gradedAtt.totalScore)).toBe(92.6);
    expect(gradedAtt.finalGradingStatus).toBe('READY');

    // Verify auditHistory on essayGrade has 2 revisions
    const gradingViewAfterRes = await app.inject({
      method: 'GET',
      url: `/api/v1/attempts/${attemptId}/grading`,
      cookies: { pk_lms_session: dosenCookie },
    });
    const updatedEssayQ = gradingViewAfterRes
      .json()
      .data.questions.find((q: any) => q.questionMode === 'ESSAY');
    expect(updatedEssayQ.essayGrade.revisionNumber).toBe(2);
    expect(updatedEssayQ.essayGrade.auditHistory.length).toBe(2);

    // Items 11 & 12: Server-side deadline enforcement & Automatic submission on timeout
    // Siti starts an attempt on the Hybrid assessment, then we expire serverDeadlineAt in DB to simulate timeout
    const sitiStartRes = await app.inject({
      method: 'POST',
      url: `/api/v1/assessments/${hybridId}/attempts`,
      cookies: { pk_lms_session: sitiCookie },
      headers: { 'x-csrf-token': sitiCsrf },
    });
    expect(sitiStartRes.statusCode).toBe(201);
    const sitiAttemptId = sitiStartRes.json().data.attempt.id;
    const sitiQsRes = await app.inject({
      method: 'GET',
      url: `/api/v1/attempts/${sitiAttemptId}/questions`,
      cookies: { pk_lms_session: sitiCookie },
    });
    const sitiFirstQ = sitiQsRes.json().data.questions[0];

    // Expire Siti's attempt deadline on the server
    const { db } = await import('../db/index.ts');
    const { assessmentAttempts } = await import('../db/schema.ts');
    const { eq } = await import('drizzle-orm');
    await db
      .update(assessmentAttempts)
      .set({ serverDeadlineAt: new Date(Date.now() - 60_000) })
      .where(eq(assessmentAttempts.id, sitiAttemptId));

    // Attempting to save an answer after serverDeadlineAt must fail with 403 ATTEMPT_DEADLINE_EXPIRED and auto-submit the attempt!
    const lateSaveRes = await app.inject({
      method: 'PUT',
      url: `/api/v1/attempts/${sitiAttemptId}/answers/${sitiFirstQ.id}`,
      cookies: { pk_lms_session: sitiCookie },
      headers: { 'x-csrf-token': sitiCsrf },
      payload: { answerPayload: { textAnswer: 'Terlambat' }, isAnswered: true },
    });
    expect(lateSaveRes.statusCode).toBe(403);
    expect(lateSaveRes.json().error.code).toBe('ATTEMPT_DEADLINE_EXPIRED');

    const sitiAttAfterTimeout = await app.inject({
      method: 'GET',
      url: `/api/v1/attempts/${sitiAttemptId}`,
      cookies: { pk_lms_session: sitiCookie },
    });
    expect(sitiAttAfterTimeout.statusCode).toBe(200);
    expect(sitiAttAfterTimeout.json().data.attempt.status).toBe('AUTO_SUBMITTED');

    // Item 19: Instructor Monitoring & CSV/XLSX Export (verify live AUTO_SUBMITTED tracking)
    const monitoringRes = await app.inject({
      method: 'GET',
      url: `/api/v1/assessments/${hybridId}/monitoring`,
      cookies: { pk_lms_session: dosenCookie },
    });
    expect(monitoringRes.statusCode).toBe(200);
    const monData = monitoringRes.json().data;
    expect(monData.summary.totalParticipants).toBeGreaterThanOrEqual(2);
    expect(monData.summary.submitted).toBeGreaterThanOrEqual(1);
    expect(monData.summary.autoSubmitted).toBeGreaterThanOrEqual(1);

    // Grade Siti's essay question so all submitted attempts have completed mandatory essay grading
    const sitiGradingView = await app.inject({
      method: 'GET',
      url: `/api/v1/attempts/${sitiAttemptId}/grading`,
      cookies: { pk_lms_session: dosenCookie },
    });
    const sitiEssayQ = sitiGradingView
      .json()
      .data.questions.find((q: any) => q.questionMode === 'ESSAY');
    await app.inject({
      method: 'POST',
      url: `/api/v1/attempts/${sitiAttemptId}/essay-grades`,
      cookies: { pk_lms_session: dosenCookie },
      headers: { 'x-csrf-token': dosenCsrf },
      payload: {
        isDraft: false,
        publishToStudent: false,
        grades: [
          {
            attemptQuestionId: sitiEssayQ.id,
            gradingMethod: 'DIRECT',
            rawScore: 0,
            feedback: 'Tidak dijawab karena batas waktu habis.',
          },
        ],
      },
    });

    const monCsvRes = await app.inject({
      method: 'GET',
      url: `/api/v1/assessments/${hybridId}/monitoring?format=csv`,
      cookies: { pk_lms_session: dosenCookie },
    });
    expect(monCsvRes.statusCode).toBe(200);
    expect(monCsvRes.headers['content-type']).toContain('text/csv');
    expect(monCsvRes.body).toContain('Ahmad Fauzan');

    // Item 20: Analytics correctness & item analysis
    const asmtAnalyticsRes = await app.inject({
      method: 'GET',
      url: `/api/v1/assessments/${hybridId}/analytics`,
      cookies: { pk_lms_session: dosenCookie },
    });
    expect(asmtAnalyticsRes.statusCode).toBe(200);
    const anaData = asmtAnalyticsRes.json().data.analytics;
    expect(anaData.highestScore).toBe(92.6);
    expect(anaData.sampleSizeSufficient).toBe(false);
    expect(anaData.itemAnalysis.length).toBe(9);

    // Item 21: Grade publication & student visibility after publish
    const publishResultsRes = await app.inject({
      method: 'POST',
      url: `/api/v1/assessments/${hybridId}/publish-results`,
      cookies: { pk_lms_session: dosenCookie },
      headers: { 'x-csrf-token': dosenCsrf },
    });
    expect(publishResultsRes.statusCode).toBe(200);
    expect(publishResultsRes.json().data.published).toBe(true);

    const ahmadViewPublishedAtt = await app.inject({
      method: 'GET',
      url: `/api/v1/attempts/${attemptId}`,
      cookies: { pk_lms_session: ahmadCookie },
    });
    expect(ahmadViewPublishedAtt.statusCode).toBe(200);
    expect(ahmadViewPublishedAtt.json().data.attempt.objectiveScore).toBe(75);
    expect(ahmadViewPublishedAtt.json().data.attempt.essayScore).toBe(17.6);
    expect(ahmadViewPublishedAtt.json().data.attempt.totalScore).toBe(92.6);
    expect(ahmadViewPublishedAtt.json().data.attempt.passed).toBe(true);

    // Item 23: Existing classroom integration (`GET /api/v1/classrooms/:id` includes `assessments`)
    const classroomCheckRes = await app.inject({
      method: 'GET',
      url: `/api/v1/classrooms/${targetClassroom.id}`,
      cookies: { pk_lms_session: ahmadCookie },
    });
    expect(classroomCheckRes.statusCode).toBe(200);
    expect(Array.isArray(classroomCheckRes.json().data.assessments)).toBe(true);
    expect(
      classroomCheckRes
        .json()
        .data.assessments.some((a: any) => a.id === hybridId)
    ).toBe(true);
  }, 45000);

  it('Phase 11: Comprehensive Academic Classroom Management & Lifecycle Verification', async () => {
    // Authenticate Actors: Superadmin, Dosen Fitriani, Mahasiswa Ahmad, Mahasiswa Siti
    const adminLoginRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: {
        email: 'superadmin@poltek-kampar.ac.id',
        password: 'AdminPolkam#2026',
      },
    });
    expect(adminLoginRes.statusCode).toBe(200);
    const adminCookie = adminLoginRes.cookies.find(
      (c) => c.name === 'pk_lms_session'
    )!.value;
    const adminCsrf = adminLoginRes.cookies.find(
      (c) => c.name === 'pk_lms_csrf'
    )!.value;

    const dosenLoginRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: {
        email: 'fitriani.dosen@poltek-kampar.ac.id',
        password: 'DosenPolkam#2026',
      },
    });
    expect(dosenLoginRes.statusCode).toBe(200);
    const dosenCookie = dosenLoginRes.cookies.find(
      (c) => c.name === 'pk_lms_session'
    )!.value;
    const dosenCsrf = dosenLoginRes.cookies.find(
      (c) => c.name === 'pk_lms_csrf'
    )!.value;

    const ahmadLoginRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: {
        email: 'ahmad.mhs@student.poltek-kampar.ac.id',
        password: 'MhsPolkam#2026',
      },
    });
    const ahmadCookie = ahmadLoginRes.cookies.find(
      (c) => c.name === 'pk_lms_session'
    )!.value;
    const ahmadCsrf = ahmadLoginRes.cookies.find(
      (c) => c.name === 'pk_lms_csrf'
    )!.value;

    const sitiLoginRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: {
        email: 'siti.mhs@student.poltek-kampar.ac.id',
        password: 'MhsPolkam#2026',
      },
    });
    const sitiCookie = sitiLoginRes.cookies.find(
      (c) => c.name === 'pk_lms_session'
    )!.value;
    const sitiCsrf = sitiLoginRes.cookies.find(
      (c) => c.name === 'pk_lms_csrf'
    )!.value;

    // 1. MODULE A: Academic Period Management
    // 1.1 Read default period (Accessible by Dosen)
    const defaultPeriodRes = await app.inject({
      method: 'GET',
      url: '/api/v1/academic-periods/default',
      cookies: { pk_lms_session: dosenCookie },
    });
    expect(defaultPeriodRes.statusCode).toBe(200);
    const defaultPeriod = defaultPeriodRes.json().data;
    expect(defaultPeriod).toBeDefined();
    expect(defaultPeriod.isDefault).toBe(true);

    // 1.2 Dosen attempting to modify/create academic period MUST be rejected with 403
    const forbiddenCreatePeriod = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/academic-periods',
      cookies: { pk_lms_session: dosenCookie },
      headers: { 'x-csrf-token': dosenCsrf },
      payload: {
        code: '20262-FORBIDDEN',
        name: 'Semester Genap 2026/2027',
        academicYear: '2026/2027',
        semesterType: 'EVEN',
        startDate: '2027-02-01T00:00:00Z',
        endDate: '2027-06-30T23:59:59Z',
      },
    });
    expect(forbiddenCreatePeriod.statusCode).toBe(403);

    // 1.3 Superadmin creates a new Academic Period (Semester Genap 2026/2027)
    const newPeriodCode = `20262-${Date.now().toString().slice(-4)}`;
    const createPeriodRes = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/academic-periods',
      cookies: { pk_lms_session: adminCookie },
      headers: { 'x-csrf-token': adminCsrf },
      payload: {
        code: newPeriodCode,
        name: 'Semester Genap 2026/2027',
        academicYear: '2026/2027',
        semesterType: 'EVEN',
        startDate: '2027-02-01T00:00:00Z',
        endDate: '2027-06-30T23:59:59Z',
        status: 'SCHEDULED',
        isDefault: false,
      },
    });
    expect(createPeriodRes.statusCode).toBe(201);
    const createdPeriod = createPeriodRes.json().data;
    expect(createdPeriod.code).toBe(newPeriodCode);
    expect(createdPeriod.status).toBe('SCHEDULED');

    // 1.4 Superadmin transitions: activate, set-default
    const activatePeriodRes = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/academic-periods/${createdPeriod.id}/activate`,
      cookies: { pk_lms_session: adminCookie },
      headers: { 'x-csrf-token': adminCsrf },
    });
    expect(activatePeriodRes.statusCode).toBe(200);
    expect(activatePeriodRes.json().data.status).toBe('ACTIVE');

    // Set as default: verify strict rule that exactly 1 period is default
    const setDefaultRes = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/academic-periods/${createdPeriod.id}/set-default`,
      cookies: { pk_lms_session: adminCookie },
      headers: { 'x-csrf-token': adminCsrf },
    });
    expect(setDefaultRes.statusCode).toBe(200);
    expect(setDefaultRes.json().data.isDefault).toBe(true);

    // Verify previously default period is now NOT default
    const verifyDefaultRes = await app.inject({
      method: 'GET',
      url: '/api/v1/academic-periods/default',
      cookies: { pk_lms_session: dosenCookie },
    });
    expect(verifyDefaultRes.json().data.id).toBe(createdPeriod.id);

    // Reset default back to original default period for consistency
    await app.inject({
      method: 'POST',
      url: `/api/v1/admin/academic-periods/${defaultPeriod.id}/set-default`,
      cookies: { pk_lms_session: adminCookie },
      headers: { 'x-csrf-token': adminCsrf },
    });

    // 1.3 Superadmin reads single academic period by ID
    const singlePeriodRes = await app.inject({
      method: 'GET',
      url: `/api/v1/admin/academic-periods/${createdPeriod.id}`,
      cookies: { pk_lms_session: adminCookie },
    });
    expect(singlePeriodRes.statusCode).toBe(200);
    expect(singlePeriodRes.json().data.id).toBe(createdPeriod.id);

    // 2. MODULE B: Academic Calendar
    const calendarEventsRes = await app.inject({
      method: 'GET',
      url: `/api/v1/academic-calendar?periodId=${defaultPeriod.id}`,
      cookies: { pk_lms_session: dosenCookie },
    });
    expect(calendarEventsRes.statusCode).toBe(200);
    expect(Array.isArray(calendarEventsRes.json().data)).toBe(true);
    expect(calendarEventsRes.json().data.length).toBeGreaterThan(0);
    const firstCalEvent = calendarEventsRes.json().data[0];

    // Superadmin updates academic calendar event
    const updateEventRes = await app.inject({
      method: 'PATCH',
      url: `/api/v1/admin/academic-calendar/${firstCalEvent.id}`,
      cookies: { pk_lms_session: adminCookie },
      headers: { 'x-csrf-token': adminCsrf },
      payload: {
        description: 'Jadwal diperbarui oleh Biro Administrasi Akademik',
      },
    });
    expect(updateEventRes.statusCode).toBe(200);

    // 3. Removed Modules Verification (Course Offerings & Facilities return 404)
    const offeringsRes = await app.inject({
      method: 'GET',
      url: `/api/v1/course-offerings?periodId=${defaultPeriod.id}`,
      cookies: { pk_lms_session: dosenCookie },
    });
    expect(offeringsRes.statusCode).toBe(404);

    const buildingsRes = await app.inject({
      method: 'GET',
      url: '/api/v1/campus/buildings',
      cookies: { pk_lms_session: dosenCookie },
    });
    expect(buildingsRes.statusCode).toBe(404);

    const roomsRes = await app.inject({
      method: 'GET',
      url: '/api/v1/campus/rooms',
      cookies: { pk_lms_session: dosenCookie },
    });
    expect(roomsRes.statusCode).toBe(404);

    // 4. Schedule Conflict Detection Endpoint (Works without physical room requirement)
    const conflictCheckRes = await app.inject({
      method: 'POST',
      url: '/api/v1/schedules/conflicts',
      cookies: { pk_lms_session: dosenCookie },
      headers: { 'x-csrf-token': dosenCsrf },
      payload: {
        dayOfWeek: 1, // Monday
        startTime: '08:00',
        endTime: '10:30',
      },
    });
    expect(conflictCheckRes.statusCode).toBe(200);
    expect(conflictCheckRes.json().data).toHaveProperty('hasConflict');

    // 5. MODULE E: Advanced Classroom Builder (6-step Wizard, Decoupled from courses & facilities)
    const { db: dbInstance } = await import('../db/index.ts');
    const { classrooms: classroomsTable } = await import('../db/schema.ts');
    const { ilike } = await import('drizzle-orm');
    await dbInstance.delete(classroomsTable).where(ilike(classroomsTable.name, 'Kelas Khusus Cloud%'));

    const testClassName = `Kelas Khusus Cloud ${Date.now().toString().slice(-4)}`;
    const builderRes = await app.inject({
      method: 'POST',
      url: '/api/v1/classrooms/builder',
      cookies: { pk_lms_session: dosenCookie },
      headers: { 'x-csrf-token': dosenCsrf },
      payload: {
        academicPeriodId: defaultPeriod.id,
        name: testClassName,
        subjectName: 'Arsitektur Cloud & Komputasi Awan',
        subjectCode: 'TI-402',
        academicYear: '2025/2026',
        semesterName: defaultPeriod.name,
        locationDescription: 'Lab Komputer Cloud Lantai 2',
        section: 'B',
        cohort: '2026',
        classroomType: 'REGULAR',
        minCapacity: 1,
        maxCapacity: 1,
        category: 'REGULAR',
        language: 'id',
        visibility: 'PUBLIC_ENROLLED',
        learningObjectives: 'Memahami arsitektur cloud multi-tenant dan containerisasi.',
        description: 'Kelas unggulan Teknik Informatika Politeknik Kampar.',
        schedules: [
          {
            dayOfWeek: 2, // Tuesday
            startTime: '13:00',
            endTime: '15:30',
            locationDescription: 'Lab Komputer Cloud Lantai 2',
            meetingType: 'OFFLINE',
          },
        ],
        policy: {
          enrollmentMode: 'AUTO',
          minParticipants: 1,
          maxParticipants: 1, // Set small capacity to test waitlist queue!
          waitingListEnabled: true,
          maxWaitingList: 5,
          joinCodeMaxUses: 20,
        },
        lifecycleStatus: 'active',
      },
    });
    expect(builderRes.statusCode).toBe(201);
    const builtClass = builderRes.json().data;
    expect(builtClass.id).toBeDefined();
    expect(builtClass.joinCode).toBeDefined();

    // 6. MODULE F: Enrollment & Participant Management
    // 6.1 Verify catalog endpoint is removed (404)
    const catalogRes = await app.inject({
      method: 'GET',
      url: `/api/v1/classrooms/catalog?periodId=${defaultPeriod.id}`,
      cookies: { pk_lms_session: ahmadCookie },
    });
    expect(catalogRes.statusCode).toBe(404);

    // 6.2 Ahmad joins via Join Code (Seats available: takes the 1 seat)
    const ahmadJoinRes = await app.inject({
      method: 'POST',
      url: `/api/v1/classrooms/${builtClass.id}/join`,
      cookies: { pk_lms_session: ahmadCookie },
      headers: { 'x-csrf-token': ahmadCsrf },
      payload: { code: builtClass.joinCode },
    });
    expect(ahmadJoinRes.statusCode).toBe(200);
    expect(ahmadJoinRes.json().data.enrolled).toBe(true);
    expect(ahmadJoinRes.json().data.status).toBe('active');

    // 6.3 Siti joins via Join Code (Capacity full: must be routed to Waitlist!)
    const sitiJoinRes = await app.inject({
      method: 'POST',
      url: `/api/v1/classrooms/${builtClass.id}/join`,
      cookies: { pk_lms_session: sitiCookie },
      headers: { 'x-csrf-token': sitiCsrf },
      payload: { code: builtClass.joinCode },
    });
    expect(sitiJoinRes.statusCode).toBe(200);
    expect(sitiJoinRes.json().data.enrolled).toBe(false);
    expect(sitiJoinRes.json().data.waitlisted).toBe(true);
    expect(sitiJoinRes.json().data.queueNumber).toBe(1);

    // 6.4 Lecturer checks Participants & Waitlist
    const participantsRes = await app.inject({
      method: 'GET',
      url: `/api/v1/classrooms/${builtClass.id}/participants`,
      cookies: { pk_lms_session: dosenCookie },
    });
    expect(participantsRes.statusCode).toBe(200);
    const pData = participantsRes.json().data;
    expect(pData.totalActiveStudents).toBe(1);
    expect(pData.waitlist.length).toBe(1);
    expect(pData.waitlist[0].queueNumber).toBe(1);

    // 6.4b Direct Waitlist Query Endpoint
    const waitlistDirectRes = await app.inject({
      method: 'GET',
      url: `/api/v1/classrooms/${builtClass.id}/waitlist`,
      cookies: { pk_lms_session: dosenCookie },
    });
    expect(waitlistDirectRes.statusCode).toBe(200);
    expect(waitlistDirectRes.json().data.length).toBe(1);
    expect(waitlistDirectRes.json().data[0].queueNumber).toBe(1);
    expect(waitlistDirectRes.json().data[0].studentEmail).toBe(sitiLoginRes.json().data.user.email);

    // 6.4c Lecturer sends student invitation
    const inviteRes = await app.inject({
      method: 'POST',
      url: `/api/v1/classrooms/${builtClass.id}/invitations`,
      cookies: { pk_lms_session: dosenCookie },
      headers: { 'x-csrf-token': dosenCsrf },
      payload: {
        studentId: sitiLoginRes.json().data.user.id,
        message: 'Undangan khusus praktikum cloud',
        expiresInDays: 5,
      },
    });
    expect(inviteRes.statusCode).toBe(201);
    expect(inviteRes.json().data.status).toBe('PENDING');

    // 6.4d Classroom Schedules inspection & schedule update
    const schedulesListRes = await app.inject({
      method: 'GET',
      url: `/api/v1/classrooms/${builtClass.id}/schedules`,
      cookies: { pk_lms_session: dosenCookie },
    });
    expect(schedulesListRes.statusCode).toBe(200);
    expect(schedulesListRes.json().data.length).toBeGreaterThan(0);
    const existingSchedule = schedulesListRes.json().data[0];

    // Conflict detection GET endpoint check
    const conflictGetRes = await app.inject({
      method: 'GET',
      url: `/api/v1/schedules/conflicts?dayOfWeek=2&startTime=13:00&endTime=15:30`,
      cookies: { pk_lms_session: dosenCookie },
    });
    expect(conflictGetRes.statusCode).toBe(200);

    // PATCH schedule update
    const updateSchedRes = await app.inject({
      method: 'PATCH',
      url: `/api/v1/schedules/${existingSchedule.id}`,
      cookies: { pk_lms_session: dosenCookie },
      headers: { 'x-csrf-token': dosenCsrf },
      payload: {
        meetingType: 'HYBRID',
        onlineLink: 'https://meet.politeknik-kampar.ac.id/cloud-sec',
        force: true,
      },
    });
    expect(updateSchedRes.statusCode).toBe(200);
    expect(updateSchedRes.json().data.meetingType).toBe('HYBRID');

    // 6.5 Withdrawal & Automatic Promotion:
    // Ahmad withdraws from the class; Siti (queue #1 in waitlist) must be automatically promoted to active!
    const ahmadEnrollmentId = pData.students.find((s: any) => s.userId === ahmadLoginRes.json().data.user.id)!.enrollmentId;
    const withdrawRes = await app.inject({
      method: 'POST',
      url: `/api/v1/enrollments/${ahmadEnrollmentId}/withdraw`,
      cookies: { pk_lms_session: ahmadCookie },
      headers: { 'x-csrf-token': ahmadCsrf },
    });
    expect(withdrawRes.statusCode).toBe(200);
    expect(withdrawRes.json().data.dropped.status).toBe('dropped');
    expect(withdrawRes.json().data.promoted).toBeDefined();
    expect(withdrawRes.json().data.promoted.status).toBe('active');

    // Verify updated participants list: Siti is now active!
    const participantsAfterWithdraw = await app.inject({
      method: 'GET',
      url: `/api/v1/classrooms/${builtClass.id}/participants`,
      cookies: { pk_lms_session: dosenCookie },
    });
    expect(participantsAfterWithdraw.statusCode).toBe(200);
    const pDataAfter = participantsAfterWithdraw.json().data;
    const sitiStudent = pDataAfter.students.find((s: any) => s.userId === sitiLoginRes.json().data.user.id);
    expect(sitiStudent).toBeDefined();
    expect(sitiStudent.status).toBe('active');
    expect(sitiStudent.enrollmentSource).toBe('WAITLIST_PROMOTED');

    // 7. MODULE G: Dashboards
    const superadminDashRes = await app.inject({
      method: 'GET',
      url: '/api/v1/dashboards/superadmin',
      cookies: { pk_lms_session: adminCookie },
    });
    expect(superadminDashRes.statusCode).toBe(200);
    const saDash = superadminDashRes.json().data;
    expect(saDash.totalClassrooms).toBeGreaterThan(0);
    expect(saDash.activeClassrooms).toBeGreaterThan(0);
    expect(saDash.totalLecturers).toBeGreaterThanOrEqual(2);
    expect(saDash.totalStudents).toBeGreaterThanOrEqual(2);

    const lecturerDashRes = await app.inject({
      method: 'GET',
      url: '/api/v1/dashboards/lecturer',
      cookies: { pk_lms_session: dosenCookie },
    });
    expect(lecturerDashRes.statusCode).toBe(200);
    const lecDash = lecturerDashRes.json().data;
    expect(lecDash.myClassroomsCount).toBeGreaterThan(0);

    const studentDashRes = await app.inject({
      method: 'GET',
      url: '/api/v1/dashboards/student',
      cookies: { pk_lms_session: sitiCookie },
    });
    expect(studentDashRes.statusCode).toBe(200);
    const stDash = studentDashRes.json().data;
    expect(stDash.enrolledCount).toBeGreaterThan(0);
    expect(Array.isArray(stDash.timetable)).toBe(true);

    // 8. MODULE H: Complete Lifecycle, Approval, Join Code & Archive
    // 8.1 Create a draft classroom to test approval workflow
    const draftClassRes = await app.inject({
      method: 'POST',
      url: '/api/v1/classrooms/builder',
      cookies: { pk_lms_session: dosenCookie },
      headers: { 'x-csrf-token': dosenCsrf },
      payload: {
        academicPeriodId: defaultPeriod.id,
        name: `Kelas Draft ${Date.now().toString().slice(-4)}`,
        subjectName: 'Arsitektur Cloud & Komputasi Awan',
        subjectCode: 'TI-402',
        section: 'C',
        cohort: '2026',
        classroomType: 'REGULAR',
        minCapacity: 5,
        maxCapacity: 30,
        category: 'REGULAR',
        language: 'id',
        visibility: 'PUBLIC_ENROLLED',
        learningObjectives: 'Pengujian approval dan lifecycle.',
        description: 'Kelas pengujian siklus hidup.',
        schedules: [],
        policy: {
          enrollmentMode: 'AUTO',
          minParticipants: 5,
          maxParticipants: 30,
          waitingListEnabled: false,
          maxWaitingList: 0,
          joinCodeMaxUses: 20,
        },
        lifecycleStatus: 'draft',
      },
    });
    expect(draftClassRes.statusCode).toBe(201);
    const draftClass = draftClassRes.json().data;
    expect(draftClass.lifecycleStatus).toBe('draft');

    // Lecturer submits for approval
    const submitAppRes = await app.inject({
      method: 'POST',
      url: `/api/v1/classrooms/${draftClass.id}/submit-approval`,
      cookies: { pk_lms_session: dosenCookie },
      headers: { 'x-csrf-token': dosenCsrf },
    });
    expect(submitAppRes.statusCode).toBe(200);
    expect(submitAppRes.json().data.status).toBe('pending_approval');

    // Superadmin approves classroom
    const approveRes = await app.inject({
      method: 'POST',
      url: `/api/v1/classrooms/${draftClass.id}/approve`,
      cookies: { pk_lms_session: adminCookie },
      headers: { 'x-csrf-token': adminCsrf },
    });
    expect(approveRes.statusCode).toBe(200);
    expect(approveRes.json().data.status).toBe('active');

    // Student joins via Join Code
    const joinCodeRes = await app.inject({
      method: 'POST',
      url: `/api/v1/classrooms/${draftClass.id}/join`,
      cookies: { pk_lms_session: ahmadCookie },
      headers: { 'x-csrf-token': ahmadCsrf },
      payload: { code: draftClass.joinCode },
    });
    expect(joinCodeRes.statusCode).toBe(200);
    expect(joinCodeRes.json().data.success).toBe(true);
    expect(joinCodeRes.json().data.enrollment.status).toBe('active');

    // Lecturer completes and archives classroom
    const completeRes = await app.inject({
      method: 'POST',
      url: `/api/v1/classrooms/${draftClass.id}/complete`,
      cookies: { pk_lms_session: dosenCookie },
      headers: { 'x-csrf-token': dosenCsrf },
    });
    expect(completeRes.statusCode).toBe(200);
    expect(completeRes.json().data.lifecycleStatus).toBe('completed');

    const archiveRes = await app.inject({
      method: 'POST',
      url: `/api/v1/classrooms/${draftClass.id}/archive`,
      cookies: { pk_lms_session: dosenCookie },
      headers: { 'x-csrf-token': dosenCsrf },
    });
    expect(archiveRes.statusCode).toBe(200);
    expect(archiveRes.json().data.lifecycleStatus).toBe('archived');
  }, 45000);

  it('verifies complete Academic Period Management lifecycle — Pure Semester CRUD & RBAC (all 24 verification items)', async () => {
    // 1. Authenticate users
    const adminLogin = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'superadmin@poltek-kampar.ac.id', password: 'AdminPolkam#2026' },
    });
    expect(adminLogin.statusCode).toBe(200);
    const adminCookie = extractCookieValue(adminLogin.headers['set-cookie'], 'pk_lms_session')!;
    const adminCsrf = adminLogin.json().data.csrfToken;

    const dosenLogin = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'fitriani.dosen@poltek-kampar.ac.id', password: 'DosenPolkam#2026' },
    });
    expect(dosenLogin.statusCode).toBe(200);
    const dosenCookie = extractCookieValue(dosenLogin.headers['set-cookie'], 'pk_lms_session')!;
    const dosenCsrf = dosenLogin.json().data.csrfToken;

    const mhsLogin = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'ahmad.mhs@student.poltek-kampar.ac.id', password: 'MhsPolkam#2026' },
    });
    expect(mhsLogin.statusCode).toBe(200);
    const mhsCookie = extractCookieValue(mhsLogin.headers['set-cookie'], 'pk_lms_session')!;
    const mhsCsrf = mhsLogin.json().data.csrfToken;

    // Item 1: Superadmin can list academic periods
    const listRes = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/academic-periods',
      cookies: { pk_lms_session: adminCookie },
    });
    expect(listRes.statusCode).toBe(200);
    expect(Array.isArray(listRes.json().data)).toBe(true);
    expect(listRes.json().data.length).toBeGreaterThan(0);
    const existingPeriod = listRes.json().data[0];
    expect(existingPeriod).toHaveProperty('classroomCount');
    expect(existingPeriod).toHaveProperty('courseOfferingCount');

    // Item 2: Superadmin can create academic periods (Pure Semester fields)
    const uniqueSuffix = Date.now().toString().slice(-5);
    const newCode = `SEM-${uniqueSuffix}`;
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/academic-periods',
      cookies: { pk_lms_session: adminCookie },
      headers: { 'x-csrf-token': adminCsrf },
      payload: {
        academic_code: newCode,
        name: `Semester Khusus ${uniqueSuffix}`,
        academic_year: '2026/2027',
        semester_type: 'SHORT',
        description: 'Semester pendek akselerasi kompetensi Politeknik Kampar',
        preparation_start_date: '2027-07-01T00:00:00Z',
        lecture_start_date: '2027-07-15T00:00:00Z',
        lecture_end_date: '2027-08-31T23:59:59Z',
        status: 'DRAFT',
        is_default: false,
        administrative_notes: 'SK Direktur Politeknik Kampar No. 2026/SP-01',
      },
    });
    expect(createRes.statusCode).toBe(201);
    const createdPeriod = createRes.json().data;
    expect(createdPeriod.code).toBe(newCode);
    expect(createdPeriod.status).toBe('DRAFT');
    expect(createdPeriod.semesterType).toBe('SHORT');

    // Item 3: Superadmin can edit academic periods
    const editRes = await app.inject({
      method: 'PATCH',
      url: `/api/v1/admin/academic-periods/${createdPeriod.id}`,
      cookies: { pk_lms_session: adminCookie },
      headers: { 'x-csrf-token': adminCsrf },
      payload: {
        name: `Semester Khusus ${uniqueSuffix} (Revisi)`,
        description: 'Deskripsi kurikulum diperbarui oleh Biro Administrasi Akademik',
        status: 'SCHEDULED',
      },
    });
    expect(editRes.statusCode).toBe(200);
    expect(editRes.json().data.name).toBe(`Semester Khusus ${uniqueSuffix} (Revisi)`);
    expect(editRes.json().data.status).toBe('SCHEDULED');

    // Item 4: Superadmin can view period details and audit history
    const detailRes = await app.inject({
      method: 'GET',
      url: `/api/v1/admin/academic-periods/${createdPeriod.id}`,
      cookies: { pk_lms_session: adminCookie },
    });
    expect(detailRes.statusCode).toBe(200);
    expect(detailRes.json().data.id).toBe(createdPeriod.id);
    expect(detailRes.json().data).toHaveProperty('classroomCount');
    expect(detailRes.json().data).toHaveProperty('courseOfferingCount');

    const historyRes = await app.inject({
      method: 'GET',
      url: `/api/v1/admin/academic-periods/${createdPeriod.id}/history`,
      cookies: { pk_lms_session: adminCookie },
    });
    expect(historyRes.statusCode).toBe(200);
    expect(Array.isArray(historyRes.json().data.history)).toBe(true);
    expect(historyRes.json().data.history.length).toBeGreaterThanOrEqual(2);

    // Item 5: Eligible periods can be deleted (DRAFT/SCHEDULED, zero classrooms, zero offerings, never activated)
    const tempCode = `DEL-${Date.now().toString().slice(-5)}`;
    const tempCreate = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/academic-periods',
      cookies: { pk_lms_session: adminCookie },
      headers: { 'x-csrf-token': adminCsrf },
      payload: {
        academic_code: tempCode,
        name: 'Semester Draft Untuk Dihapus',
        academic_year: '2026/2027',
        semester_type: 'SHORT',
        lecture_start_date: '2027-08-01T00:00:00Z',
        lecture_end_date: '2027-08-30T23:59:59Z',
        status: 'DRAFT',
        is_default: false,
      },
    });
    expect(tempCreate.statusCode).toBe(201);
    const tempId = tempCreate.json().data.id;

    const deleteRes = await app.inject({
      method: 'DELETE',
      url: `/api/v1/admin/academic-periods/${tempId}`,
      cookies: { pk_lms_session: adminCookie },
      headers: { 'x-csrf-token': adminCsrf },
    });
    expect(deleteRes.statusCode).toBe(200);
    expect(deleteRes.json().data.deleted).toBe(true);

    // Verify deleted
    const verifyDel = await app.inject({
      method: 'GET',
      url: `/api/v1/admin/academic-periods/${tempId}`,
      cookies: { pk_lms_session: adminCookie },
    });
    expect(verifyDel.statusCode).toBe(404);

    // Item 6: Periods with dependencies or activation cannot be deleted
    // Attempting to delete the active default period
    const defaultPeriodRes = await app.inject({
      method: 'GET',
      url: '/api/v1/academic-periods/default',
      cookies: { pk_lms_session: adminCookie },
    });
    const defaultPeriod = defaultPeriodRes.json().data;
    if (defaultPeriod) {
      const rejectDelete = await app.inject({
        method: 'DELETE',
        url: `/api/v1/admin/academic-periods/${defaultPeriod.id}`,
        cookies: { pk_lms_session: adminCookie },
        headers: { 'x-csrf-token': adminCsrf },
      });
      expect(rejectDelete.statusCode).toBe(400);
      expect(rejectDelete.json().success).toBe(false);
    }

    // Item 7: Semester activation works
    const activateRes = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/academic-periods/${createdPeriod.id}/activate`,
      cookies: { pk_lms_session: adminCookie },
      headers: { 'x-csrf-token': adminCsrf },
    });
    expect(activateRes.statusCode).toBe(200);
    expect(activateRes.json().data.status).toBe('ACTIVE');

    // Item 8 & 9: Default semester configuration works & Only one default semester exists
    const setDefaultRes = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/academic-periods/${createdPeriod.id}/set-default`,
      cookies: { pk_lms_session: adminCookie },
      headers: { 'x-csrf-token': adminCsrf },
    });
    expect(setDefaultRes.statusCode).toBe(200);
    expect(setDefaultRes.json().data.isDefault).toBe(true);

    // Verify via GET default
    const checkDefault = await app.inject({
      method: 'GET',
      url: '/api/v1/academic-periods/default',
      cookies: { pk_lms_session: dosenCookie },
    });
    expect(checkDefault.json().data.id).toBe(createdPeriod.id);

    // Verify DB count of is_default = true is exactly 1
    const allPeriodsCheck = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/academic-periods',
      cookies: { pk_lms_session: adminCookie },
    });
    const defaultCount = allPeriodsCheck.json().data.filter((p: any) => p.isDefault).length;
    expect(defaultCount).toBe(1);

    // Reset default back to original default period for system stability
    if (defaultPeriod) {
      await app.inject({
        method: 'POST',
        url: `/api/v1/admin/academic-periods/${defaultPeriod.id}/set-default`,
        cookies: { pk_lms_session: adminCookie },
        headers: { 'x-csrf-token': adminCsrf },
      });
    }

    // Item 10: Semester completion works
    const completeRes = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/academic-periods/${createdPeriod.id}/complete`,
      cookies: { pk_lms_session: adminCookie },
      headers: { 'x-csrf-token': adminCsrf },
    });
    expect(completeRes.statusCode).toBe(200);
    expect(completeRes.json().data.status).toBe('COMPLETED');

    // Item 11: Semester archival works (and archived is read-only)
    const archiveRes = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/academic-periods/${createdPeriod.id}/archive`,
      cookies: { pk_lms_session: adminCookie },
      headers: { 'x-csrf-token': adminCsrf },
    });
    expect(archiveRes.statusCode).toBe(200);
    expect(archiveRes.json().data.status).toBe('ARCHIVED');

    // Verify archived semester is read-only
    const rejectEditArchived = await app.inject({
      method: 'PATCH',
      url: `/api/v1/admin/academic-periods/${createdPeriod.id}`,
      cookies: { pk_lms_session: adminCookie },
      headers: { 'x-csrf-token': adminCsrf },
      payload: { name: 'Attempt edit on archived' },
    });
    expect(rejectEditArchived.statusCode).toBe(400);
    expect(rejectEditArchived.json().error.code).toBe('PERIOD_ARCHIVED');

    // Verify archived semester cannot be used to create new classrooms
    const rejectClassroomArchived = await app.inject({
      method: 'POST',
      url: '/api/v1/classrooms/builder',
      cookies: { pk_lms_session: dosenCookie },
      headers: { 'x-csrf-token': dosenCsrf },
      payload: {
        academicPeriodId: createdPeriod.id,
        courseId: '00000000-0000-0000-0000-000000000000',
        name: 'Kelas Ditolak Pada Periode Diarsipkan',
        section: 'A',
        capacity: 30,
        schedules: [],
      },
    });
    expect(rejectClassroomArchived.statusCode).toBe(400);
    expect(rejectClassroomArchived.json().error.code).toBe('PERIOD_INACTIVE');

    // Item 12: Dosen can view authorized semester information
    const dosenViewList = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/academic-periods',
      cookies: { pk_lms_session: dosenCookie },
    });
    expect(dosenViewList.statusCode).toBe(200);

    const dosenViewDetail = await app.inject({
      method: 'GET',
      url: `/api/v1/admin/academic-periods/${createdPeriod.id}`,
      cookies: { pk_lms_session: dosenCookie },
    });
    expect(dosenViewDetail.statusCode).toBe(200);

    // Item 13: Mahasiswa can view authorized semester information
    const mhsViewList = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/academic-periods',
      cookies: { pk_lms_session: mhsCookie },
    });
    expect(mhsViewList.statusCode).toBe(200);

    const mhsViewDetail = await app.inject({
      method: 'GET',
      url: `/api/v1/admin/academic-periods/${createdPeriod.id}`,
      cookies: { pk_lms_session: mhsCookie },
    });
    expect(mhsViewDetail.statusCode).toBe(200);

    // Item 14: Dosen cannot modify semesters (returns 403)
    const dosenCreate = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/academic-periods',
      cookies: { pk_lms_session: dosenCookie },
      headers: { 'x-csrf-token': dosenCsrf },
      payload: {
        academic_code: 'DOSEN-FAIL',
        name: 'Dosen Fail',
        academic_year: '2026/2027',
        semester_type: 'ODD',
        lecture_start_date: '2026-09-01T00:00:00Z',
        lecture_end_date: '2027-01-31T23:59:59Z',
      },
    });
    expect(dosenCreate.statusCode).toBe(403);

    const dosenEdit = await app.inject({
      method: 'PATCH',
      url: `/api/v1/admin/academic-periods/${createdPeriod.id}`,
      cookies: { pk_lms_session: dosenCookie },
      headers: { 'x-csrf-token': dosenCsrf },
      payload: { name: 'Dosen Edit Fail' },
    });
    expect(dosenEdit.statusCode).toBe(403);

    const dosenDelete = await app.inject({
      method: 'DELETE',
      url: `/api/v1/admin/academic-periods/${createdPeriod.id}`,
      cookies: { pk_lms_session: dosenCookie },
      headers: { 'x-csrf-token': dosenCsrf },
    });
    expect(dosenDelete.statusCode).toBe(403);

    const dosenActivate = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/academic-periods/${createdPeriod.id}/activate`,
      cookies: { pk_lms_session: dosenCookie },
      headers: { 'x-csrf-token': dosenCsrf },
    });
    expect(dosenActivate.statusCode).toBe(403);

    // Item 15: Mahasiswa cannot modify semesters (returns 403)
    const mhsCreate = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/academic-periods',
      cookies: { pk_lms_session: mhsCookie },
      headers: { 'x-csrf-token': mhsCsrf },
      payload: {
        academic_code: 'MHS-FAIL',
        name: 'Mhs Fail',
        academic_year: '2026/2027',
        semester_type: 'ODD',
        lecture_start_date: '2026-09-01T00:00:00Z',
        lecture_end_date: '2027-01-31T23:59:59Z',
      },
    });
    expect(mhsCreate.statusCode).toBe(403);

    const mhsDelete = await app.inject({
      method: 'DELETE',
      url: `/api/v1/admin/academic-periods/${createdPeriod.id}`,
      cookies: { pk_lms_session: mhsCookie },
      headers: { 'x-csrf-token': mhsCsrf },
    });
    expect(mhsDelete.statusCode).toBe(403);

    // Item 16: Unauthorized API requests return 401
    const unauthGet = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/academic-periods',
    });
    expect(unauthGet.statusCode).toBe(401);

    // Item 17, 18, 19, 20: Existing relationships and scheduling remain intact
    const classroomsCheck = await app.inject({
      method: 'GET',
      url: '/api/v1/classrooms',
      cookies: { pk_lms_session: adminCookie },
    });
    expect(classroomsCheck.statusCode).toBe(200);

    const offeringsCheck = await app.inject({
      method: 'GET',
      url: '/api/v1/course-offerings',
      cookies: { pk_lms_session: adminCookie },
    });
    expect(offeringsCheck.statusCode).toBe(404);

    const schedulesCheck = await app.inject({
      method: 'POST',
      url: '/api/v1/schedules/conflicts',
      cookies: { pk_lms_session: adminCookie },
      headers: { 'x-csrf-token': adminCsrf },
      payload: {
        dayOfWeek: 1,
        startTime: '08:00',
        endTime: '10:00',
      },
    });
    expect(schedulesCheck.statusCode).toBe(200);

    // Item 21: Verify No KRS functionality remains in Academic Period UI
    const fs = await import('fs');
    const path = await import('path');
    const uiCode = fs.readFileSync(
      path.resolve(process.cwd(), 'src/pages/AcademicPeriodsPage.tsx'),
      'utf-8'
    );
    expect(uiCode).not.toContain('registrationStart');
    expect(uiCode).not.toContain('registrationEnd');
    expect(uiCode).not.toContain('close-registration');
    expect(uiCode).not.toContain('Pendaftaran Dibuka');
    expect(uiCode).not.toContain('Pendaftaran Ditutup');

    // Item 22: No KRS-related API exists in Academic Period module
    const closeRegRes = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/academic-periods/${createdPeriod.id}/close-registration`,
      cookies: { pk_lms_session: adminCookie },
      headers: { 'x-csrf-token': adminCsrf },
    });
    expect(closeRegRes.statusCode).toBe(404);

    // Item 23: No KRS-related permission exists in Academic Period RBAC
    const { PERMISSION_REGISTRY } = await import('../server/security.ts');
    const krsAcademicPerms = PERMISSION_REGISTRY.filter(
      (p: any) =>
        p.code.startsWith('academic_period.') &&
        (p.code.includes('registration') || p.code.includes('krs'))
    );
    expect(krsAcademicPerms.length).toBe(0);

    // Item 24: No Academic Calendar navigation remains
    const appShellCode = fs.readFileSync(
      path.resolve(process.cwd(), 'src/components/AppShell.tsx'),
      'utf-8'
    );
    expect(appShellCode).not.toContain('Periode & Kalender Akademik');
    expect(appShellCode).not.toContain('Kalender Akademik Kampus');
  }, 60000);

  it('Phase 15: System Refactoring - Decouple Classroom Architecture & Complete Module Removal', async () => {
    const fs = await import('fs');
    const path = await import('path');

    // 1. Module Removal Verification: Frontend Page Files
    expect(fs.existsSync(path.resolve(process.cwd(), 'src/pages/MasterCoursesPage.tsx'))).toBe(false);
    expect(fs.existsSync(path.resolve(process.cwd(), 'src/pages/CourseOfferingsPage.tsx'))).toBe(false);
    expect(fs.existsSync(path.resolve(process.cwd(), 'src/pages/CampusFacilitiesPage.tsx'))).toBe(false);

    // 2. Navigation & Shell Cleanup Verification
    const appShellCode = fs.readFileSync(
      path.resolve(process.cwd(), 'src/components/AppShell.tsx'),
      'utf-8'
    );
    expect(appShellCode).not.toContain("to: '/courses'");
    expect(appShellCode).not.toContain("to: '/course-offerings'");
    expect(appShellCode).not.toContain("to: '/facilities'");
    expect(appShellCode).not.toContain('Katalog Mata Kuliah');
    expect(appShellCode).not.toContain('Penawaran Mata Kuliah');
    expect(appShellCode).not.toContain('Gedung & Ruangan');

    // 3. Backend Endpoints Removal Verification (All removed routes must return 404)
    const adminLoginRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'superadmin@poltek-kampar.ac.id', password: 'AdminPolkam#2026' },
    });
    expect(adminLoginRes.statusCode).toBe(200);
    const adminCookie = extractCookieValue(adminLoginRes.headers['set-cookie'], 'pk_lms_session')!;
    const adminCsrf = adminLoginRes.json().data.csrfToken;

    const checkOfferingsList = await app.inject({
      method: 'GET',
      url: '/api/v1/course-offerings',
      cookies: { pk_lms_session: adminCookie },
    });
    expect(checkOfferingsList.statusCode).toBe(404);

    const checkOfferingsCreate = await app.inject({
      method: 'POST',
      url: '/api/v1/course-offerings',
      cookies: { pk_lms_session: adminCookie },
      headers: { 'x-csrf-token': adminCsrf },
      payload: { courseId: '00000000-0000-0000-0000-000000000000' },
    });
    expect(checkOfferingsCreate.statusCode).toBe(404);

    const checkBuildings = await app.inject({
      method: 'GET',
      url: '/api/v1/campus/buildings',
      cookies: { pk_lms_session: adminCookie },
    });
    expect(checkBuildings.statusCode).toBe(404);

    const checkRooms = await app.inject({
      method: 'GET',
      url: '/api/v1/campus/rooms',
      cookies: { pk_lms_session: adminCookie },
    });
    expect(checkRooms.statusCode).toBe(404);

    const checkCoursesCreate = await app.inject({
      method: 'POST',
      url: '/api/v1/academic/courses',
      cookies: { pk_lms_session: adminCookie },
      headers: { 'x-csrf-token': adminCsrf },
      payload: { code: 'CS-999', title: 'Removed Course' },
    });
    expect(checkCoursesCreate.statusCode).toBe(404);

    // 4. RBAC Verification: academic:manage is removed from PERMISSION_REGISTRY
    const { PERMISSION_REGISTRY } = await import('../server/security.ts');
    const academicManagePerm = PERMISSION_REGISTRY.find((p: any) => p.code === 'academic:manage');
    expect(academicManagePerm).toBeUndefined();

    // 5. Digital Classroom Independence: Create classroom without Course, Offering, or Facility dependencies
    const dosenLoginRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'fitriani.dosen@poltek-kampar.ac.id', password: 'DosenPolkam#2026' },
    });
    expect(dosenLoginRes.statusCode).toBe(200);
    const dosenCookie = extractCookieValue(dosenLoginRes.headers['set-cookie'], 'pk_lms_session')!;
    const dosenCsrf = dosenLoginRes.json().data.csrfToken;
    const dosenUser = dosenLoginRes.json().data.user;

    const defaultPeriodRes = await app.inject({
      method: 'GET',
      url: '/api/v1/academic-periods/default',
      cookies: { pk_lms_session: dosenCookie },
    });
    expect(defaultPeriodRes.statusCode).toBe(200);
    const defaultPeriod = defaultPeriodRes.json().data;

    const { db: dbInstance } = await import('../db/index.ts');
    const { classrooms: classroomsTable } = await import('../db/schema.ts');
    const { ilike } = await import('drizzle-orm');

    await dbInstance
      .delete(classroomsTable)
      .where(ilike(classroomsTable.name, 'Kelas Mandiri Cloud%'));

    const uniqueClassName = `Kelas Mandiri Cloud ${Date.now().toString().slice(-4)}`;
    const createDecoupledClassRes = await app.inject({
      method: 'POST',
      url: '/api/v1/classrooms/builder',
      cookies: { pk_lms_session: dosenCookie },
      headers: { 'x-csrf-token': dosenCsrf },
      payload: {
        academicPeriodId: defaultPeriod.id,
        name: uniqueClassName,
        subjectName: 'Arsitektur Komputasi Cloud',
        subjectCode: 'AKC-302',
        academicYear: defaultPeriod.academicYear || '2025/2026',
        semesterName: defaultPeriod.name,
        locationDescription: 'Lab Jaringan & Komputasi Cloud',
        section: 'A',
        cohort: '2026',
        classroomType: 'REGULAR',
        minCapacity: 10,
        maxCapacity: 30,
        category: 'REGULAR',
        language: 'id',
        visibility: 'PUBLIC_ENROLLED',
        learningObjectives: 'Mampu merancang dan mengimplementasikan sistem cloud terdistribusi.',
        description: 'Kelas mandiri tanpa ketergantungan kurikulum master lama.',
        schedules: [
          {
            dayOfWeek: 6, // Saturday
            startTime: '08:00',
            endTime: '10:00',
            locationDescription: 'Lab Jaringan Lantai 2',
            meetingType: 'OFFLINE',
          },
        ],
        policy: {
          enrollmentMode: 'AUTO',
          minParticipants: 5,
          maxParticipants: 30,
          waitingListEnabled: true,
          maxWaitingList: 10,
          joinCodeMaxUses: 50,
        },
        lifecycleStatus: 'active',
      },
    });
    expect(createDecoupledClassRes.statusCode).toBe(201);
    const newClassroom = createDecoupledClassRes.json().data;
    expect(newClassroom.id).toBeDefined();
    expect(newClassroom.name).toBe(uniqueClassName);
    expect(newClassroom.subjectName).toBe('Arsitektur Komputasi Cloud');
    expect(newClassroom.subjectCode).toBe('AKC-302');
    expect(newClassroom.courseId).toBeNull();
    expect(newClassroom.courseOfferingId).toBeNull();

    // 6. Detailed Classroom Workspace Verification
    const classDetailRes = await app.inject({
      method: 'GET',
      url: `/api/v1/classrooms/${newClassroom.id}`,
      cookies: { pk_lms_session: dosenCookie },
    });
    expect(classDetailRes.statusCode).toBe(200);
    const detailData = classDetailRes.json().data;
    expect(detailData.classroom.id).toBe(newClassroom.id);
    expect(detailData.classroom.courseCode).toBe('AKC-302');
    expect(detailData.classroom.courseTitle).toBe('Arsitektur Komputasi Cloud');
    expect(detailData.classroom.locationDescription).toBe('Lab Jaringan & Komputasi Cloud');

    // 7. Classroom List Search & Pagination Verification
    const listRes = await app.inject({
      method: 'GET',
      url: `/api/v1/classrooms?search=${encodeURIComponent('AKC-302')}`,
      cookies: { pk_lms_session: dosenCookie },
    });
    expect(listRes.statusCode).toBe(200);
    const listItems = listRes.json().data;
    expect(listItems.some((item: any) => item.id === newClassroom.id)).toBe(true);

    // 8. Schedule Conflict Detection without Room ID Requirement
    const conflictRes = await app.inject({
      method: 'POST',
      url: '/api/v1/schedules/conflicts',
      cookies: { pk_lms_session: dosenCookie },
      headers: { 'x-csrf-token': dosenCsrf },
      payload: {
        dayOfWeek: 6,
        startTime: '08:00',
        endTime: '10:00',
        instructorId: dosenUser.id,
      },
    });
    expect(conflictRes.statusCode).toBe(200);
    expect(conflictRes.json().data).toHaveProperty('hasConflict');

    // 9. Digital Classroom Activities Regression (Announcements, Topics, Materials, Assignments)
    // Post Announcement
    const annRes = await app.inject({
      method: 'POST',
      url: `/api/v1/classrooms/${newClassroom.id}/announcements`,
      cookies: { pk_lms_session: dosenCookie },
      headers: { 'x-csrf-token': dosenCsrf },
      payload: {
        title: 'Selamat Datang di Kelas Arsitektur Cloud',
        content: 'Perkuliahan semester ini akan berfokus pada arsitektur microservices dan cloud native.',
        isPinned: true,
      },
    });
    expect(annRes.statusCode).toBe(201);

    // Create Topic
    const topicRes = await app.inject({
      method: 'POST',
      url: `/api/v1/classrooms/${newClassroom.id}/topics`,
      cookies: { pk_lms_session: dosenCookie },
      headers: { 'x-csrf-token': dosenCsrf },
      payload: {
        title: 'Modul 01: Dasar Cloud Computing',
        description: 'Konsep dasar virtualisasi, IaaS, PaaS, dan SaaS.',
        sortOrder: 1,
      },
    });
    expect(topicRes.statusCode).toBe(201);

    // Create Assignment
    const asgRes = await app.inject({
      method: 'POST',
      url: `/api/v1/classrooms/${newClassroom.id}/assignments`,
      cookies: { pk_lms_session: dosenCookie },
      headers: { 'x-csrf-token': dosenCsrf },
      payload: {
        title: 'Tugas 01: Analisis Model Deployment Cloud',
        instructions: 'Bandingkan kelebihan dan kelemahan Public vs Private Cloud.',
        maxScore: 100,
        submissionType: 'FILE_UPLOAD',
        dueAt: new Date(Date.now() + 7 * 86400000).toISOString(),
        published: true,
      },
    });
    expect(asgRes.statusCode).toBe(201);

    // 10. Complete Removal Verification: Catalog, Lecturer Assignments, Timetable
    expect(fs.existsSync('src/pages/ClassroomCatalogPage.tsx')).toBe(false);
    expect(fs.existsSync('src/pages/LecturerAssignmentsPage.tsx')).toBe(false);
    expect(fs.existsSync('src/pages/ClassSchedulesPage.tsx')).toBe(false);

    const appShellContent = fs.readFileSync('src/components/AppShell.tsx', 'utf-8');
    expect(appShellContent.includes("to: '/catalog'")).toBe(false);
    expect(appShellContent.includes("to: '/lecturer-assignments'")).toBe(false);
    expect(appShellContent.includes("to: '/schedules'")).toBe(false);

    const appContent = fs.readFileSync('src/App.tsx', 'utf-8');
    expect(appContent.includes('<Route path="/catalog" element={<Navigate to="/classrooms" replace />} />')).toBe(true);
    expect(appContent.includes('<Route path="/lecturer-assignments" element={<Navigate to="/classrooms" replace />} />')).toBe(true);
    expect(appContent.includes('<Route path="/schedules" element={<Navigate to="/classrooms" replace />} />')).toBe(true);

    // Login Ahmad for student verification
    const ahmadLogin = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'ahmad.mhs@student.poltek-kampar.ac.id', password: 'MhsPolkam#2026' },
    });
    expect(ahmadLogin.statusCode).toBe(200);
    const ahmadCookie = extractCookieValue(ahmadLogin.headers['set-cookie'], 'pk_lms_session')!;
    const ahmadCsrf = ahmadLogin.json().data.csrfToken;

    const catalogRemovedRes = await app.inject({
      method: 'GET',
      url: '/api/v1/classrooms/catalog',
      cookies: { pk_lms_session: ahmadCookie },
    });
    expect(catalogRemovedRes.statusCode).toBe(404);

    // 11. Independent Classroom Enrollment & Dashboards Telemetry
    // Student joins decoupled classroom via join code
    const studentJoinRes = await app.inject({
      method: 'POST',
      url: `/api/v1/classrooms/${newClassroom.id}/join`,
      cookies: { pk_lms_session: ahmadCookie },
      headers: { 'x-csrf-token': ahmadCsrf },
      payload: { code: newClassroom.joinCode },
    });
    expect(studentJoinRes.statusCode).toBe(200);
    expect(studentJoinRes.json().data.enrolled).toBe(true);

    // Participants list reflects enrolled student and primary instructor
    const participantsRes = await app.inject({
      method: 'GET',
      url: `/api/v1/classrooms/${newClassroom.id}/participants`,
      cookies: { pk_lms_session: dosenCookie },
    });
    expect(participantsRes.statusCode).toBe(200);
    const pData = participantsRes.json().data;
    expect(pData.totalActiveStudents).toBeGreaterThanOrEqual(1);
    expect(pData.instructors.some((inst: any) => inst.userId === dosenUser.id)).toBe(true);

    // Lecturer dashboard includes decoupled classroom without courseId
    const lecDashRes = await app.inject({
      method: 'GET',
      url: '/api/v1/dashboards/lecturer',
      cookies: { pk_lms_session: dosenCookie },
    });
    expect(lecDashRes.statusCode).toBe(200);
    const lecDashData = lecDashRes.json().data;
    expect(lecDashData.classrooms.some((c: any) => c.id === newClassroom.id)).toBe(true);

    // Student dashboard includes decoupled classroom without courseId
    const stuDashRes = await app.inject({
      method: 'GET',
      url: '/api/v1/dashboards/student',
      cookies: { pk_lms_session: ahmadCookie },
    });
    expect(stuDashRes.statusCode).toBe(200);
    const stuDashData = stuDashRes.json().data;
    expect(stuDashData.classrooms.some((c: any) => c.id === newClassroom.id)).toBe(true);
  }, 60000);

  it('Phase 17: Digital Classroom Creation Wizard Refactoring — 5 Steps, CPMK, Lightweight Rich Text Editor & Sharp Image Optimization', async () => {
    const fs = await import('fs');
    const sharp = (await import('sharp')).default;

    // 1. Wizard Structure & Elimination of Schedule/Location Step Verification
    const wizardCode = fs.readFileSync('src/pages/ClassroomBuilderWizardPage.tsx', 'utf-8');
    expect(wizardCode).toContain("'Identitas Kelas'");
    expect(wizardCode).toContain("'Konteks Akademik'");
    expect(wizardCode).toContain("'Tim Pengajar'");
    expect(wizardCode).toContain("'Aturan Pendaftaran'");
    expect(wizardCode).toContain("'Review & Publikasi'");
    expect(wizardCode).not.toContain("'Jadwal & Lokasi'");
    expect(wizardCode).not.toContain('handleAddSchedule');
    expect(wizardCode).not.toContain('handleRemoveSchedule');
    expect(wizardCode).not.toContain('checkScheduleConflict');
    expect(wizardCode).not.toContain('conflictWarning');

    // Verify Lightweight Tiptap Editor & Cover Uploader Integration in Wizard
    expect(wizardCode).toContain('LightweightTiptapEditor');
    expect(wizardCode).toContain('ClassroomCoverUploader');

    // 2. Lightweight Rich Text Editor Configuration Verification
    const editorCode = fs.readFileSync('src/components/LightweightTiptapEditor.tsx', 'utf-8');
    expect(editorCode).toContain('Bold');
    expect(editorCode).toContain('Italic');
    expect(editorCode).toContain('Underline');
    expect(editorCode).toContain('Strikethrough');
    expect(editorCode).toContain('Heading2');
    expect(editorCode).toContain('Heading3');
    expect(editorCode).toContain('List');
    expect(editorCode).toContain('ListOrdered');
    expect(editorCode).toContain('AlignLeft');
    expect(editorCode).toContain('AlignCenter');
    expect(editorCode).toContain('AlignRight');
    expect(editorCode).toContain('AlignJustify');
    expect(editorCode).toContain('Link');
    expect(editorCode).not.toContain('CustomImage');
    expect(editorCode).not.toContain('Youtube');
    expect(editorCode).not.toContain('VimeoEmbedNode');
    expect(editorCode).not.toContain('@tiptap/extension-table');

    // 3. Image Optimization Engine & Security Verification
    // 3.1 Unauthenticated upload rejected
    const unauthUploadRes = await app.inject({
      method: 'POST',
      url: '/api/v1/classrooms/cover-image',
      payload: { imageBase64: 'abc' },
    });
    expect(unauthUploadRes.statusCode).toBe(401);

    // 3.2 Student unauthorized upload rejected
    const studentLogin = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'ahmad.mhs@student.poltek-kampar.ac.id', password: 'MhsPolkam#2026' },
    });
    expect(studentLogin.statusCode).toBe(200);
    const ahmadCookie = extractCookieValue(studentLogin.headers['set-cookie'], 'pk_lms_session')!;

    const studentUploadRes = await app.inject({
      method: 'POST',
      url: '/api/v1/classrooms/cover-image',
      cookies: { pk_lms_session: ahmadCookie },
      payload: { imageBase64: 'abc' },
    });
    expect(studentUploadRes.statusCode).toBe(403);

    // 3.3 Lecturer authentication
    const dosenLogin = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'fitriani.dosen@poltek-kampar.ac.id', password: 'DosenPolkam#2026' },
    });
    expect(dosenLogin.statusCode).toBe(200);
    const dosenCookie = extractCookieValue(dosenLogin.headers['set-cookie'], 'pk_lms_session')!;
    const dosenCsrf = dosenLogin.json().data.csrfToken;

    // 3.4 Valid JPEG optimization to WebP (standard 1280x720 + thumb 480x270)
    const testJpegBuffer = await sharp({
      create: {
        width: 1600,
        height: 900,
        channels: 3,
        background: { r: 37, g: 99, b: 235 },
      },
    })
      .jpeg()
      .toBuffer();

    const jpegUploadRes = await app.inject({
      method: 'POST',
      url: '/api/v1/classrooms/cover-image',
      cookies: { pk_lms_session: dosenCookie },
      payload: { imageBase64: `data:image/jpeg;base64,${testJpegBuffer.toString('base64')}` },
    });
    expect(jpegUploadRes.statusCode).toBe(200);
    const optJpeg = jpegUploadRes.json().data;
    expect(optJpeg.coverMimeType).toBe('image/webp');
    expect(optJpeg.coverImagePath).toMatch(/^covers\/[a-f0-9-]{36}_standard\.webp$/);
    expect(optJpeg.coverThumbnailPath).toMatch(/^covers\/[a-f0-9-]{36}_thumb\.webp$/);
    expect(optJpeg.coverWidth).toBeLessThanOrEqual(1280);
    expect(optJpeg.coverHeight).toBeLessThanOrEqual(720);

    // 3.5 Valid PNG optimization to WebP
    const testPngBuffer = await sharp({
      create: {
        width: 800,
        height: 450,
        channels: 4,
        background: { r: 16, g: 185, b: 129, alpha: 1 },
      },
    })
      .png()
      .toBuffer();

    const pngUploadRes = await app.inject({
      method: 'POST',
      url: '/api/v1/classrooms/cover-image',
      cookies: { pk_lms_session: dosenCookie },
      payload: { imageBase64: `data:image/png;base64,${testPngBuffer.toString('base64')}` },
    });
    expect(pngUploadRes.statusCode).toBe(200);
    expect(pngUploadRes.json().data.coverMimeType).toBe('image/webp');

    // 3.6 Corrupted image buffer rejected
    const corruptedRes = await app.inject({
      method: 'POST',
      url: '/api/v1/classrooms/cover-image',
      cookies: { pk_lms_session: dosenCookie },
      payload: { imageBase64: 'data:image/jpeg;base64,corrupted-invalid-bytes-12345' },
    });
    expect(corruptedRes.statusCode).toBe(400);

    // 3.7 SVG uploads rejected for security
    const svgBuffer = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><rect width="100" height="100"/></svg>');
    const svgUploadRes = await app.inject({
      method: 'POST',
      url: '/api/v1/classrooms/cover-image',
      cookies: { pk_lms_session: dosenCookie },
      payload: { imageBase64: `data:image/svg+xml;base64,${svgBuffer.toString('base64')}` },
    });
    expect(svgUploadRes.statusCode).toBe(400);

    // 3.8 Serve optimized image via GET endpoint
    const filename = optJpeg.coverImagePath.replace('covers/', '');
    const serveCoverRes = await app.inject({
      method: 'GET',
      url: `/api/v1/storage/covers/${filename}`,
    });
    expect(serveCoverRes.statusCode).toBe(200);
    expect(serveCoverRes.headers['content-type']).toBe('image/webp');
    expect(serveCoverRes.rawPayload.length).toBeGreaterThan(0);

    // 4. Create Classroom with 5-Step Configuration, CPMK & Cover Image (NO Schedules)
    const testClassName = `Kelas Cloud Wizard 5-Step ${Date.now().toString().slice(-4)}`;
    const createClassRes = await app.inject({
      method: 'POST',
      url: '/api/v1/classrooms/builder',
      cookies: { pk_lms_session: dosenCookie },
      headers: { 'x-csrf-token': dosenCsrf },
      payload: {
        name: testClassName,
        classroomCode: `PKM-CW${Date.now().toString().slice(-3)}`,
        subjectName: 'Arsitektur Cloud & Komputasi Modern',
        subjectCode: 'AKM-501',
        cpmk: '1. Menguasai konfigurasi multi-region cloud cluster.\n2. Mengimplementasikan CI/CD pipeline otomatis.',
        description: '<p>Kelas pengantar arsitektur cloud terdistribusi dengan praktik langsung.</p>',
        coverImagePath: optJpeg.coverImagePath,
        coverThumbnailPath: optJpeg.coverThumbnailPath,
        coverMimeType: optJpeg.coverMimeType,
        coverFileSize: optJpeg.coverFileSize,
        coverWidth: optJpeg.coverWidth,
        coverHeight: optJpeg.coverHeight,
        academicYear: '2025/2026',
        section: 'A',
        cohort: '2026',
        classroomType: 'REGULAR',
        minCapacity: 5,
        maxCapacity: 35,
        policy: {
          enrollmentMode: 'AUTO',
          minParticipants: 5,
          maxParticipants: 35,
          waitingListEnabled: true,
          maxWaitingList: 10,
          joinCodeMaxUses: 50,
        },
        lifecycleStatus: 'active',
      },
    });
    expect(createClassRes.statusCode).toBe(201);
    const createdClass = createClassRes.json().data;
    expect(createdClass.id).toBeDefined();
    expect(createdClass.name).toBe(testClassName);
    expect(createdClass.cpmk).toContain('Menguasai konfigurasi multi-region');
    expect(createdClass.coverImagePath).toBe(optJpeg.coverImagePath);

    // 5. Query Classroom Detail: Verifies CPMK and Cover Image are returned
    const detailRes = await app.inject({
      method: 'GET',
      url: `/api/v1/classrooms/${createdClass.id}`,
      cookies: { pk_lms_session: dosenCookie },
    });
    expect(detailRes.statusCode).toBe(200);
    const detailClass = detailRes.json().data.classroom;
    expect(detailClass.cpmk).toBe(createdClass.cpmk);
    expect(detailClass.coverImagePath).toBe(optJpeg.coverImagePath);

    // 6. Optional Cover Image: Classroom creation without cover succeeds
    const noCoverClassRes = await app.inject({
      method: 'POST',
      url: '/api/v1/classrooms/builder',
      cookies: { pk_lms_session: dosenCookie },
      headers: { 'x-csrf-token': dosenCsrf },
      payload: {
        name: `Kelas Tanpa Cover ${Date.now().toString().slice(-4)}`,
        subjectName: 'Basis Data Lanjut',
        subjectCode: 'BDL-201',
        cpmk: 'Memahami optimasi query dan replikasi database.',
        description: '<p>Deskripsi kelas tanpa cover image.</p>',
        academicYear: '2025/2026',
        section: 'B',
        cohort: '2026',
        classroomType: 'REGULAR',
        minCapacity: 5,
        maxCapacity: 30,
        lifecycleStatus: 'active',
      },
    });
    expect(noCoverClassRes.statusCode).toBe(201);
    expect(noCoverClassRes.json().data.coverImagePath).toBeNull();

    // 7. Cover Image Deletion Endpoint Verification
    const deleteCoverRes = await app.inject({
      method: 'DELETE',
      url: `/api/v1/classrooms/${createdClass.id}/cover-image`,
      cookies: { pk_lms_session: dosenCookie },
    });
    expect(deleteCoverRes.statusCode).toBe(200);

    const checkDeletedRes = await app.inject({
      method: 'GET',
      url: `/api/v1/classrooms/${createdClass.id}`,
      cookies: { pk_lms_session: dosenCookie },
    });
    expect(checkDeletedRes.statusCode).toBe(200);
    expect(checkDeletedRes.json().data.classroom.coverImagePath).toBeNull();
  }, 60000);

  it('Phase 18: Advanced Digital Classroom Refactoring — Analytics, RBAC Ownership, Progress, History, Versioning & Quick Nav', async () => {
    const { db } = await import('../db/index.ts');
    const { users, roles, userRoles, classroomInstructors, classroomEnrollments } = await import('../db/schema.ts');
    const { eq } = await import('drizzle-orm');
    const { hashPassword } = await import('../server/security.ts');

    // 1. Login as Dosen (Creator) and Mahasiswa (Student)
    const dosenLogin = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'fitriani.dosen@poltek-kampar.ac.id', password: 'DosenPolkam#2026' },
    });
    expect(dosenLogin.statusCode).toBe(200);
    const dosenCookie = dosenLogin.cookies.find((c) => c.name === 'pk_lms_session')!.value;
    const dosenCsrf = dosenLogin.json().data.csrfToken;

    const mhsLogin = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'ahmad.mhs@student.poltek-kampar.ac.id', password: 'MhsPolkam#2026' },
    });
    expect(mhsLogin.statusCode).toBe(200);
    const mhsCookie = mhsLogin.cookies.find((c) => c.name === 'pk_lms_session')!.value;
    const mhsCsrf = mhsLogin.json().data.csrfToken;
    const mhsUserId = mhsLogin.json().data.user.id;

    // Create a temporary Co-Instructor user for RBAC ownership tests
    const coEmail = `co.instructor.${Date.now()}@polkam.ac.id`;
    const pwHash = await hashPassword('Password123!');
    const [coUser] = await db
      .insert(users)
      .values({
        email: coEmail,
        passwordHash: pwHash,
        fullName: 'Co-Instructor Uji',
        identityNumber: `NIDN-CO-${Date.now().toString().slice(-5)}`,
        isActive: true,
      })
      .returning();
    const [dosenRole] = await db.select().from(roles).where(eq(roles.code, 'DOSEN'));
    await db.insert(userRoles).values({ userId: coUser.id, roleId: dosenRole.id });

    const coLogin = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: coEmail, password: 'Password123!' },
    });
    expect(coLogin.statusCode).toBe(200);
    const coCookie = coLogin.cookies.find((c) => c.name === 'pk_lms_session')!.value;
    const coCsrf = coLogin.json().data.csrfToken;

    // 2. Creator creates a classroom
    const classRes = await app.inject({
      method: 'POST',
      url: '/api/v1/classrooms/builder',
      cookies: { pk_lms_session: dosenCookie },
      headers: { 'x-csrf-token': dosenCsrf },
      payload: {
        name: `Kelas Workspace Phase18 ${Date.now().toString().slice(-4)}`,
        subjectName: 'Arsitektur Enterprise',
        subjectCode: 'AE-301',
        academicYear: '2025/2026',
        section: 'A',
        cohort: '2026',
        classroomType: 'REGULAR',
        minCapacity: 5,
        maxCapacity: 40,
        lifecycleStatus: 'active',
      },
    });
    expect(classRes.statusCode).toBe(201);
    const classroomId = classRes.json().data.id;

    // Assign Co-Instructor (without manage_all_resources) & Enroll Student
    await db.insert(classroomInstructors).values({
      classroomId,
      instructorId: coUser.id,
      isPrimary: false,
      role: 'CO_INSTRUCTOR',
      permissionScopes: ['teach'],
    });
    await db.insert(classroomEnrollments).values({
      classroomId,
      studentId: mhsUserId,
      status: 'active',
    });

    // 3. Creator creates Module 1 & Module 2
    const mod1Res = await app.inject({
      method: 'POST',
      url: `/api/v1/classrooms/${classroomId}/modules`,
      cookies: { pk_lms_session: dosenCookie },
      headers: { 'x-csrf-token': dosenCsrf },
      payload: { title: 'Modul 01: Pengantar', description: 'Dasar-dasar', sortOrder: 1, status: 'PUBLISHED' },
    });
    expect(mod1Res.statusCode).toBe(200);
    const mod1 = mod1Res.json().data;

    const mod2Res = await app.inject({
      method: 'POST',
      url: `/api/v1/classrooms/${classroomId}/modules`,
      cookies: { pk_lms_session: dosenCookie },
      headers: { 'x-csrf-token': dosenCsrf },
      payload: { title: 'Modul 02: Lanjutan', description: 'Topik lanjut', sortOrder: 2, status: 'PUBLISHED' },
    });
    expect(mod2Res.statusCode).toBe(200);
    const mod2 = mod2Res.json().data;

    // 4. Co-Instructor creates their own Module 3 and CAN edit it, but CANNOT edit/delete Creator's Module 1
    const coModRes = await app.inject({
      method: 'POST',
      url: `/api/v1/classrooms/${classroomId}/modules`,
      cookies: { pk_lms_session: coCookie },
      headers: { 'x-csrf-token': coCsrf },
      payload: { title: 'Modul 03: Milik Co-Instructor', sortOrder: 3, status: 'PUBLISHED' },
    });
    expect(coModRes.statusCode).toBe(200);
    const coMod = coModRes.json().data;

    const coEditOwn = await app.inject({
      method: 'PATCH',
      url: `/api/v1/classrooms/${classroomId}/modules/${coMod.id}`,
      cookies: { pk_lms_session: coCookie },
      headers: { 'x-csrf-token': coCsrf },
      payload: { title: 'Modul 03: Diedit Pemilik' },
    });
    expect(coEditOwn.statusCode).toBe(200);

    const coEditCreator = await app.inject({
      method: 'PATCH',
      url: `/api/v1/classrooms/${classroomId}/modules/${mod1.id}`,
      cookies: { pk_lms_session: coCookie },
      headers: { 'x-csrf-token': coCsrf },
      payload: { title: 'Pembajakan Modul' },
    });
    expect(coEditCreator.statusCode).toBe(403);
    expect(coEditCreator.json().error.code).toBe('FORBIDDEN_CO_INSTRUCTOR_RESOURCE_OWNERSHIP');

    const coDeleteCreator = await app.inject({
      method: 'DELETE',
      url: `/api/v1/classrooms/${classroomId}/modules/${mod1.id}`,
      cookies: { pk_lms_session: coCookie },
      headers: { 'x-csrf-token': coCsrf },
    });
    expect(coDeleteCreator.statusCode).toBe(403);

    // Student cannot create/edit/delete/reorder modules
    const mhsCreateMod = await app.inject({
      method: 'POST',
      url: `/api/v1/classrooms/${classroomId}/modules`,
      cookies: { pk_lms_session: mhsCookie },
      headers: { 'x-csrf-token': mhsCsrf },
      payload: { title: 'Modul Ilegal' },
    });
    expect(mhsCreateMod.statusCode).toBe(403);

    // 5. Archive, Restore, Reorder, Duplicate Module
    const archiveRes = await app.inject({
      method: 'PATCH',
      url: `/api/v1/classrooms/${classroomId}/modules/${mod2.id}`,
      cookies: { pk_lms_session: dosenCookie },
      headers: { 'x-csrf-token': dosenCsrf },
      payload: { status: 'ARCHIVED' },
    });
    expect(archiveRes.statusCode).toBe(200);
    expect(archiveRes.json().data.status).toBe('ARCHIVED');

    const restoreRes = await app.inject({
      method: 'PATCH',
      url: `/api/v1/classrooms/${classroomId}/modules/${mod2.id}`,
      cookies: { pk_lms_session: dosenCookie },
      headers: { 'x-csrf-token': dosenCsrf },
      payload: { status: 'PUBLISHED' },
    });
    expect(restoreRes.statusCode).toBe(200);
    expect(restoreRes.json().data.status).toBe('PUBLISHED');

    const reorderRes = await app.inject({
      method: 'POST',
      url: `/api/v1/classrooms/${classroomId}/modules/reorder`,
      cookies: { pk_lms_session: dosenCookie },
      headers: { 'x-csrf-token': dosenCsrf },
      payload: { moduleIds: [mod2.id, mod1.id, coMod.id] },
    });
    expect(reorderRes.statusCode).toBe(200);

    const dupModRes = await app.inject({
      method: 'POST',
      url: `/api/v1/classrooms/${classroomId}/modules/${mod1.id}/duplicate`,
      cookies: { pk_lms_session: dosenCookie },
      headers: { 'x-csrf-token': dosenCsrf },
    });
    expect(dupModRes.statusCode).toBe(200);
    const dupModId = dupModRes.json().data.id;

    // Delete duplicated module
    const delDupMod = await app.inject({
      method: 'DELETE',
      url: `/api/v1/classrooms/${classroomId}/modules/${dupModId}`,
      cookies: { pk_lms_session: dosenCookie },
      headers: { 'x-csrf-token': dosenCsrf },
    });
    expect(delDupMod.statusCode).toBe(200);

    // 6. Create 1 Required Material + 1 Optional Material in Module 1, test Versioning & Restore
    const reqMatRes = await app.inject({
      method: 'POST',
      url: `/api/v1/topics/${mod1.id}/materials`,
      cookies: { pk_lms_session: dosenCookie },
      headers: { 'x-csrf-token': dosenCsrf },
      payload: {
        title: 'Materi Wajib 01',
        description: 'Materi inti',
        contentJson: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Versi awal' }] }] },
        isRequired: true,
        status: 'PUBLISHED',
      },
    });
    expect(reqMatRes.statusCode).toBe(201);
    const reqMat = reqMatRes.json().data;

    const optMatRes = await app.inject({
      method: 'POST',
      url: `/api/v1/topics/${mod1.id}/materials`,
      cookies: { pk_lms_session: dosenCookie },
      headers: { 'x-csrf-token': dosenCsrf },
      payload: {
        title: 'Materi Opsional 01',
        description: 'Bacaan tambahan',
        contentJson: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Opsional' }] }] },
        isRequired: false,
        status: 'PUBLISHED',
      },
    });
    expect(optMatRes.statusCode).toBe(201);

    // Update required material to create v2, then check versions & restore v1
    const patchMatRes = await app.inject({
      method: 'PATCH',
      url: `/api/v1/materials/${reqMat.id}`,
      cookies: { pk_lms_session: dosenCookie },
      headers: { 'x-csrf-token': dosenCsrf },
      payload: { title: 'Materi Wajib 01 (Revisi)' },
    });
    expect(patchMatRes.statusCode).toBe(200);

    const versionsRes = await app.inject({
      method: 'GET',
      url: `/api/v1/materials/${reqMat.id}/versions`,
      cookies: { pk_lms_session: dosenCookie },
    });
    expect(versionsRes.statusCode).toBe(200);
    const versions = versionsRes.json().data.versions;
    expect(versions.length).toBeGreaterThanOrEqual(2);
    const v1 = versions.find((v: any) => v.versionNumber === 1);
    expect(v1).toBeTruthy();

    const restoreMatRes = await app.inject({
      method: 'POST',
      url: `/api/v1/materials/${reqMat.id}/versions/${v1.id}/restore`,
      cookies: { pk_lms_session: dosenCookie },
      headers: { 'x-csrf-token': dosenCsrf },
    });
    expect(restoreMatRes.statusCode).toBe(200);
    expect(restoreMatRes.json().data.title).toBe('Materi Wajib 01');

    // 7. Student View, Completion, Bookmarks, Personal Notes & Module Progress Calculation
    const viewRes = await app.inject({
      method: 'POST',
      url: `/api/v1/materials/${reqMat.id}/view`,
      cookies: { pk_lms_session: mhsCookie },
      headers: { 'x-csrf-token': mhsCsrf },
    });
    expect(viewRes.statusCode).toBe(200);

    // Before completing required material, student analytics should show continueLearning = reqMat
    const mhsAnalyticsBefore = await app.inject({
      method: 'GET',
      url: `/api/v1/classrooms/${classroomId}/analytics`,
      cookies: { pk_lms_session: mhsCookie },
    });
    expect(mhsAnalyticsBefore.statusCode).toBe(200);
    expect(mhsAnalyticsBefore.json().data.studentDashboard.continueLearning.materialId).toBe(reqMat.id);

    // Mark required material complete (optional material remains incomplete -> module progress must be 100%)
    const completeRes = await app.inject({
      method: 'POST',
      url: `/api/v1/materials/${reqMat.id}/completion`,
      cookies: { pk_lms_session: mhsCookie },
      headers: { 'x-csrf-token': mhsCsrf },
      payload: { completed: true },
    });
    expect(completeRes.statusCode).toBe(200);
    expect(completeRes.json().data.status).toBe('COMPLETED');

    const mhsAnalyticsAfter = await app.inject({
      method: 'GET',
      url: `/api/v1/classrooms/${classroomId}/analytics`,
      cookies: { pk_lms_session: mhsCookie },
    });
    expect(mhsAnalyticsAfter.statusCode).toBe(200);
    expect(mhsAnalyticsAfter.json().data.studentDashboard.overallProgress).toBe(100);

    // Bookmark & Private Note
    const bmRes = await app.inject({
      method: 'POST',
      url: `/api/v1/materials/${reqMat.id}/bookmark`,
      cookies: { pk_lms_session: mhsCookie },
      headers: { 'x-csrf-token': mhsCsrf },
    });
    expect(bmRes.statusCode).toBe(200);

    const notePutRes = await app.inject({
      method: 'PUT',
      url: `/api/v1/materials/${reqMat.id}/note`,
      cookies: { pk_lms_session: mhsCookie },
      headers: { 'x-csrf-token': mhsCsrf },
      payload: { content: 'Catatan rahasia mahasiswa' },
    });
    expect(notePutRes.statusCode).toBe(200);

    // Instructor cannot read student's personal note or get 403/empty; another student cannot read mhsUserId's progress
    const instProgressRes = await app.inject({
      method: 'GET',
      url: `/api/v1/classrooms/${classroomId}/learning-progress`,
      cookies: { pk_lms_session: dosenCookie },
    });
    expect(instProgressRes.statusCode).toBe(200);
    expect(instProgressRes.json().data.students[0].overallProgressPercent).toBe(100);

    const mhsForbiddenOtherProgress = await app.inject({
      method: 'GET',
      url: `/api/v1/classrooms/${classroomId}/students/${coUser.id}/progress`,
      cookies: { pk_lms_session: mhsCookie },
    });
    expect(mhsForbiddenOtherProgress.statusCode).toBe(403);

    // 8. Change History, Quick Navigation, Instructor Analytics & Search
    const historyRes = await app.inject({
      method: 'GET',
      url: `/api/v1/classrooms/${classroomId}/change-history?resourceType=MODULE`,
      cookies: { pk_lms_session: dosenCookie },
    });
    expect(historyRes.statusCode).toBe(200);
    expect(historyRes.json().data.items.length).toBeGreaterThanOrEqual(4);

    // Student cannot access change history
    const mhsHistoryForbidden = await app.inject({
      method: 'GET',
      url: `/api/v1/classrooms/${classroomId}/change-history`,
      cookies: { pk_lms_session: mhsCookie },
    });
    expect(mhsHistoryForbidden.statusCode).toBe(403);

    const navRes = await app.inject({
      method: 'GET',
      url: `/api/v1/classrooms/${classroomId}/classwork-navigation`,
      cookies: { pk_lms_session: mhsCookie },
    });
    expect(navRes.statusCode).toBe(200);
    expect(navRes.json().data.modules.length).toBeGreaterThanOrEqual(2);

    const instAnalyticsRes = await app.inject({
      method: 'GET',
      url: `/api/v1/classrooms/${classroomId}/analytics`,
      cookies: { pk_lms_session: dosenCookie },
    });
    expect(instAnalyticsRes.statusCode).toBe(200);
    expect(instAnalyticsRes.json().data.overview.activeStudents).toBe(1);
    expect(instAnalyticsRes.json().data.overview.totalModules).toBe(3);

    const searchRes = await app.inject({
      method: 'GET',
      url: `/api/v1/classrooms/${classroomId}/search?q=Wajib`,
      cookies: { pk_lms_session: mhsCookie },
    });
    expect(searchRes.statusCode).toBe(200);
    expect(searchRes.json().data.results.some((r: any) => r.id === reqMat.id)).toBe(true);

    // Cleanup temporary Co-Instructor user
    await db.delete(users).where(eq(users.id, coUser.id));
  }, 60000);

  it('Phase 20: Advanced Classroom Settings Center — Identity, Enrollment, Join Codes, Instructors, Privacy, Notifications, Audit History & Lifecycle', async () => {
    const { db } = await import('../db/index.ts');
    const { users } = await import('../db/schema.ts');
    const { eq } = await import('drizzle-orm');
    const { hashPassword } = await import('../server/security.ts');

    const dosenLogin = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'fitriani.dosen@poltek-kampar.ac.id', password: 'DosenPolkam#2026' },
    });
    expect(dosenLogin.statusCode).toBe(200);
    const dosenCookie = dosenLogin.cookies.find((c) => c.name === 'pk_lms_session')!.value;
    const dosenCsrf = dosenLogin.json().data.csrfToken;
    const dosenId = dosenLogin.json().data.user.id;

    const mhsLogin = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'ahmad.mhs@student.poltek-kampar.ac.id', password: 'MhsPolkam#2026' },
    });
    expect(mhsLogin.statusCode).toBe(200);
    const mhsCookie = mhsLogin.cookies.find((c) => c.name === 'pk_lms_session')!.value;
    const mhsCsrf = mhsLogin.json().data.csrfToken;
    const mhsId = mhsLogin.json().data.user.id;

    // Create a temporary Co-Instructor user
    const coEmail = `co.settings.${Date.now()}@poltek-kampar.ac.id`;
    const pwHash = await hashPassword('Password123!');
    const [coUser] = await db
      .insert(users)
      .values({
        email: coEmail,
        fullName: 'Dr. Co-Instructor Settings',
        passwordHash: pwHash,
        identityNumber: `NIDN-SET-${Date.now().toString().slice(-5)}`,
        isActive: true,
      })
      .returning();

    // Create an isolated classroom for Settings Center tests
    const createClsRes = await app.inject({
      method: 'POST',
      url: '/api/v1/classrooms',
      cookies: { pk_lms_session: dosenCookie },
      headers: { 'x-csrf-token': dosenCsrf },
      payload: {
        name: 'Kelas Uji Pengaturan Lanjutan',
        section: 'TIF-5A',
        subjectName: 'Arsitektur Enterprise',
        subjectCode: 'TIF501',
        academicYear: '2025/2026',
        semesterName: 'Ganjil',
        capacity: 30,
        enrollmentPolicy: 'AUTO',
      },
    });
    expect([200, 201]).toContain(createClsRes.statusCode);
    const classroomId = createClsRes.json().data.id;

    // 1. Student cannot access GET /settings or PATCH /settings (403)
    const mhsSettingsForbidden = await app.inject({
      method: 'GET',
      url: `/api/v1/classrooms/${classroomId}/settings`,
      cookies: { pk_lms_session: mhsCookie },
    });
    expect(mhsSettingsForbidden.statusCode).toBe(403);

    // 2. Instructor fetches full Settings Center payload
    const getSettingsRes = await app.inject({
      method: 'GET',
      url: `/api/v1/classrooms/${classroomId}/settings`,
      cookies: { pk_lms_session: dosenCookie },
    });
    expect(getSettingsRes.statusCode).toBe(200);
    const settingsData = getSettingsRes.json().data;
    expect(settingsData.classroom.name).toBe('Kelas Uji Pengaturan Lanjutan');
    expect(settingsData.dashboardStats).toBeTruthy();

    // 3. Section 1: Update Classroom Identity (name, classroomCode, subjectName, description, cpmk)
    const patchIdentityRes = await app.inject({
      method: 'PATCH',
      url: `/api/v1/classrooms/${classroomId}/settings`,
      cookies: { pk_lms_session: dosenCookie },
      headers: { 'x-csrf-token': dosenCsrf },
      payload: {
        section: 'identity',
        payload: {
          name: 'Kelas Uji Pengaturan Lanjutan (Revisi)',
          classroomCode: 'TIF501-REV',
          subjectName: 'Arsitektur Enterprise Modern',
          section: 'TIF-5A',
          description: '<p>Deskripsi terstruktur tanpa gambar.</p>',
          cpmk: 'CPMK-1: Mahasiswa mampu merancang sistem terdistribusi.',
        },
      },
    });
    expect(patchIdentityRes.statusCode).toBe(200);
    expect(patchIdentityRes.json().data.name).toBe('Kelas Uji Pengaturan Lanjutan (Revisi)');
    expect(patchIdentityRes.json().data.cpmk).toContain('CPMK-1');

    // 4. Section 2: Enrollment Policy + Join Code Regenerate & Revoke
    const patchEnrollRes = await app.inject({
      method: 'PATCH',
      url: `/api/v1/classrooms/${classroomId}/settings`,
      cookies: { pk_lms_session: dosenCookie },
      headers: { 'x-csrf-token': dosenCsrf },
      payload: {
        section: 'enrollment',
        payload: {
          enrollmentPolicy: 'APPROVAL_REQUIRED',
          capacity: 45,
          allowLateEnrollment: true,
          waitingListEnabled: true,
        },
      },
    });
    expect(patchEnrollRes.statusCode).toBe(200);
    expect(patchEnrollRes.json().data.enrollmentPolicy).toBe('APPROVAL_REQUIRED');
    expect(patchEnrollRes.json().data.capacity).toBe(45);

    const regenCodeRes = await app.inject({
      method: 'POST',
      url: `/api/v1/classrooms/${classroomId}/join-codes/regenerate`,
      cookies: { pk_lms_session: dosenCookie },
      headers: { 'x-csrf-token': dosenCsrf },
      payload: { maxUses: 10 },
    });
    expect([200, 201]).toContain(regenCodeRes.statusCode);
    const activeCode = regenCodeRes.json().data.code;
    expect(activeCode).toMatch(/^PKM-/);

    // Student joins using active join code -> enters pending_approval under APPROVAL_REQUIRED
    const mhsJoinRes = await app.inject({
      method: 'POST',
      url: `/api/v1/classrooms/${classroomId}/join`,
      cookies: { pk_lms_session: mhsCookie },
      headers: { 'x-csrf-token': mhsCsrf },
      payload: { code: activeCode },
    });
    expect([200, 201]).toContain(mhsJoinRes.statusCode);

    const reqListRes = await app.inject({
      method: 'GET',
      url: `/api/v1/classrooms/${classroomId}/enrollment-requests`,
      cookies: { pk_lms_session: dosenCookie },
    });
    expect(reqListRes.statusCode).toBe(200);
    const mhsReq = reqListRes.json().data.requests.find((r: any) => r.studentId === mhsId);
    expect(mhsReq).toBeTruthy();

    if (mhsReq.status === 'pending_approval') {
      const approveRes = await app.inject({
        method: 'POST',
        url: `/api/v1/classrooms/${classroomId}/enrollment-requests/${mhsReq.id}/approve`,
        cookies: { pk_lms_session: dosenCookie },
        headers: { 'x-csrf-token': dosenCsrf },
        payload: {},
      });
      expect(approveRes.statusCode).toBe(200);
    }

    // Revoke active join code
    const revokeRes = await app.inject({
      method: 'POST',
      url: `/api/v1/classrooms/${classroomId}/join-codes/revoke`,
      cookies: { pk_lms_session: dosenCookie },
      headers: { 'x-csrf-token': dosenCsrf },
      payload: {},
    });
    expect(revokeRes.statusCode).toBe(200);

    // 5. Section 3: Instructors — Add Co-Instructor, Update Permissions, Protect Creator, Remove Co-Instructor
    const addCoRes = await app.inject({
      method: 'POST',
      url: `/api/v1/classrooms/${classroomId}/instructors`,
      cookies: { pk_lms_session: dosenCookie },
      headers: { 'x-csrf-token': dosenCsrf },
      payload: {
        email: coEmail,
        permissionScopes: ['manage_modules', 'manage_materials'],
      },
    });
    expect(addCoRes.statusCode).toBe(201);

    const patchCoRes = await app.inject({
      method: 'PATCH',
      url: `/api/v1/classrooms/${classroomId}/instructors/${coUser.id}`,
      cookies: { pk_lms_session: dosenCookie },
      headers: { 'x-csrf-token': dosenCsrf },
      payload: { permissionScopes: ['manage_modules', 'grade_submissions'] },
    });
    expect(patchCoRes.statusCode).toBe(200);

    // Creator cannot be removed
    const deleteCreatorBlocked = await app.inject({
      method: 'DELETE',
      url: `/api/v1/classrooms/${classroomId}/instructors/${dosenId}`,
      cookies: { pk_lms_session: dosenCookie },
      headers: { 'x-csrf-token': dosenCsrf },
    });
    expect([400, 403]).toContain(deleteCreatorBlocked.statusCode);

    // Remove Co-Instructor succeeds
    const deleteCoRes = await app.inject({
      method: 'DELETE',
      url: `/api/v1/classrooms/${classroomId}/instructors/${coUser.id}`,
      cookies: { pk_lms_session: dosenCookie },
      headers: { 'x-csrf-token': dosenCsrf },
    });
    expect(deleteCoRes.statusCode).toBe(200);

    // 6. Section 4 & 5: Privacy & Notifications
    const patchPrivacyRes = await app.inject({
      method: 'PATCH',
      url: `/api/v1/classrooms/${classroomId}/settings`,
      cookies: { pk_lms_session: dosenCookie },
      headers: { 'x-csrf-token': dosenCsrf },
      payload: {
        section: 'privacy',
        payload: {
          discoverability: 'LINK_OR_CODE_ONLY',
          contentVisibility: 'enrolled_only',
          rosterVisibility: 'INSTRUCTORS_ONLY',
          hideGradesFromPeers: true,
        },
      },
    });
    expect(patchPrivacyRes.statusCode).toBe(200);

    const patchNotifRes = await app.inject({
      method: 'PATCH',
      url: `/api/v1/classrooms/${classroomId}/settings`,
      cookies: { pk_lms_session: dosenCookie },
      headers: { 'x-csrf-token': dosenCsrf },
      payload: {
        section: 'notifications',
        payload: {
          channelInApp: true,
          channelEmail: true,
          onStudentEnroll: true,
          onLateSubmission: true,
        },
      },
    });
    expect(patchNotifRes.statusCode).toBe(200);

    // 7. Section 6: Settings Activity Audit History
    const auditHistoryRes = await app.inject({
      method: 'GET',
      url: `/api/v1/classrooms/${classroomId}/settings-history?page=1&limit=20`,
      cookies: { pk_lms_session: dosenCookie },
    });
    expect(auditHistoryRes.statusCode).toBe(200);
    expect(auditHistoryRes.json().data.items.length).toBeGreaterThanOrEqual(4);

    // 8. Section 7: Archive, Restore, Deletion Impact & Controlled Delete
    const archiveRes = await app.inject({
      method: 'POST',
      url: `/api/v1/classrooms/${classroomId}/archive`,
      cookies: { pk_lms_session: dosenCookie },
      headers: { 'x-csrf-token': dosenCsrf },
      payload: {},
    });
    expect(archiveRes.statusCode).toBe(200);
    expect(archiveRes.json().data.lifecycleStatus).toBe('archived');

    const restoreRes = await app.inject({
      method: 'POST',
      url: `/api/v1/classrooms/${classroomId}/restore`,
      cookies: { pk_lms_session: dosenCookie },
      headers: { 'x-csrf-token': dosenCsrf },
      payload: {},
    });
    expect(restoreRes.statusCode).toBe(200);
    expect(restoreRes.json().data.lifecycleStatus).toBe('active');

    const impactRes = await app.inject({
      method: 'GET',
      url: `/api/v1/classrooms/${classroomId}/deletion-impact`,
      cookies: { pk_lms_session: dosenCookie },
    });
    expect(impactRes.statusCode).toBe(200);
    expect(impactRes.json().data.enrolledStudents).toBeGreaterThanOrEqual(1);

    // Student cannot delete classroom
    const mhsDeleteForbidden = await app.inject({
      method: 'DELETE',
      url: `/api/v1/classrooms/${classroomId}`,
      cookies: { pk_lms_session: mhsCookie },
      headers: { 'x-csrf-token': mhsCsrf },
    });
    expect(mhsDeleteForbidden.statusCode).toBe(403);

    // Controlled deletion blocks accidental delete when active enrollments exist (409)
    const delBlockedRes = await app.inject({
      method: 'DELETE',
      url: `/api/v1/classrooms/${classroomId}`,
      cookies: { pk_lms_session: dosenCookie },
      headers: { 'x-csrf-token': dosenCsrf },
    });
    expect(delBlockedRes.statusCode).toBe(409);

    // Cleanup classroom with explicit confirmForce=true and temporary user
    const delClsRes = await app.inject({
      method: 'DELETE',
      url: `/api/v1/classrooms/${classroomId}?confirmForce=true`,
      cookies: { pk_lms_session: dosenCookie },
      headers: { 'x-csrf-token': dosenCsrf },
    });
    expect(delClsRes.statusCode).toBe(200);
    await db.delete(users).where(eq(users.id, coUser.id));
  }, 60000);

  it('Phase 21: Advanced Assessment & Examination Builder — Media, Question Repository, Immutable Snapshots, >200-Row Import & RBAC', async () => {
    const { db } = await import('../db/index.ts');
    const { users, assessments, assessmentQuestions, questions } = await import('../db/schema.ts');
    const { eq, like } = await import('drizzle-orm');
    const { hashPassword } = await import('../server/security.ts');
    const sharp = (await import('sharp')).default;

    const dosenLogin = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'fitriani.dosen@poltek-kampar.ac.id', password: 'DosenPolkam#2026' },
    });
    expect(dosenLogin.statusCode).toBe(200);
    const dosenCookie = dosenLogin.cookies.find((c) => c.name === 'pk_lms_session')!.value;
    const dosenCsrf = dosenLogin.json().data.csrfToken;

    const mhsLogin = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'ahmad.mhs@student.poltek-kampar.ac.id', password: 'MhsPolkam#2026' },
    });
    expect(mhsLogin.statusCode).toBe(200);
    const mhsCookie = mhsLogin.cookies.find((c) => c.name === 'pk_lms_session')!.value;

    // Temporary other lecturer for ownership check
    const otherEmail = `other.dosen.${Date.now()}@poltek-kampar.ac.id`;
    const pwHash = await hashPassword('Password123!');
    const [otherDosen] = await db
      .insert(users)
      .values({
        email: otherEmail,
        fullName: 'Dosen Lain',
        passwordHash: pwHash,
        identityNumber: `NIDN-OTH-${Date.now().toString().slice(-5)}`,
        isActive: true,
      })
      .returning();
    const { roles, userRoles } = await import('../db/schema.ts');
    const [dosenRole] = await db.select().from(roles).where(eq(roles.code, 'DOSEN'));
    await db.insert(userRoles).values({ userId: otherDosen.id, roleId: dosenRole.id });

    const otherLogin = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: otherEmail, password: 'Password123!' },
    });
    const otherCookie = otherLogin.cookies.find((c) => c.name === 'pk_lms_session')!.value;
    const otherCsrf = otherLogin.json().data.csrfToken;

    // 1. Student blocked from Question Repository & Import Center
    const mhsRepoRes = await app.inject({
      method: 'GET',
      url: '/api/v1/question-repository',
      cookies: { pk_lms_session: mhsCookie },
    });
    expect(mhsRepoRes.statusCode).toBe(403);

    // 2. Upload & Optimize Question Image (PNG -> WebP + Thumbnail)
    const pngBuf = await sharp({
      create: { width: 200, height: 120, channels: 3, background: { r: 30, g: 64, b: 175 } },
    })
      .png()
      .toBuffer();
    const boundary = '----PolkamTestBoundary';
    const imgPayload = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="diagram.png"\r\nContent-Type: image/png\r\n\r\n`
      ),
      pngBuf,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
    const imgUpRes = await app.inject({
      method: 'POST',
      url: '/api/v1/questions/media/upload-image',
      cookies: { pk_lms_session: dosenCookie },
      headers: {
        'content-type': `multipart/form-data; boundary=${boundary}`,
        'x-csrf-token': dosenCsrf,
      },
      payload: imgPayload,
    });
    expect(imgUpRes.statusCode).toBe(200);
    const imgData = imgUpRes.json().data;
    expect(imgData.mimeType).toBe('image/webp');
    expect(imgData.width).toBe(200);
    expect(imgData.thumbnailKey).toBeTruthy();

    // Stream uploaded image
    const streamRes = await app.inject({
      method: 'GET',
      url: `/api/v1/questions/media/stream?key=${encodeURIComponent(imgData.objectKey)}`,
      cookies: { pk_lms_session: dosenCookie },
    });
    expect(streamRes.statusCode).toBe(200);

    // 3. Upload Audio Attachment (MP3)
    const fakeMp3 = Buffer.from('ID3\x03\x00\x00\x00\x00\x00\x10FAKE_MP3_FRAMES');
    const audioPayload = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="listening.mp3"\r\nContent-Type: audio/mpeg\r\n\r\n`
      ),
      fakeMp3,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
    const audioUpRes = await app.inject({
      method: 'POST',
      url: '/api/v1/questions/media/upload-audio',
      cookies: { pk_lms_session: dosenCookie },
      headers: {
        'content-type': `multipart/form-data; boundary=${boundary}`,
        'x-csrf-token': dosenCsrf,
      },
      payload: audioPayload,
    });
    expect(audioUpRes.statusCode).toBe(200);
    expect(audioUpRes.json().data.mediaType).toBe('AUDIO');

    // 4. Create Question via Editor -> Automatically enters Question Repository
    const createQRes = await app.inject({
      method: 'POST',
      url: '/api/v1/questions',
      cookies: { pk_lms_session: dosenCookie },
      headers: { 'x-csrf-token': dosenCsrf },
      payload: {
        title: 'Soal Toleransi Numerik',
        questionMode: 'OBJECTIVE',
        questionType: 'NUMERIC_TOLERANCE',
        topic: 'Fisika Komputasi',
        learningOutcome: 'CPMK-2',
        difficulty: 'MEDIUM',
        promptText: 'Hitung percepatan gravitasi standar (m/s^2) dengan toleransi 0.1.',
        points: 15,
        answerConfig: { expectedValue: 9.81, tolerance: 0.1 },
        tags: ['fisika', 'numerik'],
        media: [
          {
            mediaType: 'IMAGE',
            objectKey: imgData.objectKey,
            thumbnailKey: imgData.thumbnailKey,
            originalName: 'diagram.png',
            mimeType: 'image/webp',
            fileSize: imgData.fileSize,
            width: imgData.width,
            height: imgData.height,
          },
        ],
      },
    });
    expect(createQRes.statusCode).toBe(201);
    const createdQ = createQRes.json().data.question;
    expect(createdQ.questionCode).toMatch(/^SOAL-/);

    const repoSearchRes = await app.inject({
      method: 'GET',
      url: `/api/v1/question-repository?search=${encodeURIComponent(createdQ.questionCode)}`,
      cookies: { pk_lms_session: dosenCookie },
    });
    expect(repoSearchRes.statusCode).toBe(200);
    expect(repoSearchRes.json().data.items.some((q: any) => q.id === createdQ.id)).toBe(true);

    // 5. Ownership restriction: otherDosen cannot archive Fitrianis's question (403)
    const otherArchiveRes = await app.inject({
      method: 'PATCH',
      url: `/api/v1/question-repository/${createdQ.id}/status`,
      cookies: { pk_lms_session: otherCookie },
      headers: { 'x-csrf-token': otherCsrf },
      payload: { status: 'ARCHIVED' },
    });
    expect(otherArchiveRes.statusCode).toBe(403);

    // 6. Reuse Question into an Assessment -> Verify Immutable Snapshot
    const [existingAsmt] = await db
      .select()
      .from(assessments)
      .limit(1);
    if (existingAsmt) {
      const importRepoRes = await app.inject({
        method: 'POST',
        url: `/api/v1/assessments/${existingAsmt.id}/import-from-repository`,
        cookies: { pk_lms_session: dosenCookie },
        headers: { 'x-csrf-token': dosenCsrf },
        payload: { questionIds: [createdQ.id] },
      });
      expect(importRepoRes.statusCode).toBe(200);
      expect(importRepoRes.json().data.importedCount).toBe(1);

      const [aqRow] = await db
        .select()
        .from(assessmentQuestions)
        .where(eq(assessmentQuestions.questionId, createdQ.id));
      expect(aqRow?.questionSnapshot).toBeTruthy();

      // Assessment history endpoint
      const histRes = await app.inject({
        method: 'GET',
        url: `/api/v1/assessments/${existingAsmt.id}/history`,
        cookies: { pk_lms_session: dosenCookie },
      });
      expect(histRes.statusCode).toBe(200);

      // Cleanup assessment_questions link
      await db.delete(assessmentQuestions).where(eq(assessmentQuestions.questionId, createdQ.id));
    }

    // 7. Download Official XLSX & CSV Templates
    const xlsxTplRes = await app.inject({
      method: 'GET',
      url: '/api/v1/question-imports/templates/xlsx',
      cookies: { pk_lms_session: dosenCookie },
    });
    expect(xlsxTplRes.statusCode).toBe(200);

    const csvTplRes = await app.inject({
      method: 'GET',
      url: '/api/v1/question-imports/templates/csv',
      cookies: { pk_lms_session: dosenCookie },
    });
    expect(csvTplRes.statusCode).toBe(200);
    expect(csvTplRes.body).toContain('external_question_id');

    // 8. Preview & Background Import >200 Questions via CSV (205 valid + 2 invalid rows)
    const csvRows = [
      'external_question_id,question_type,question_text,topic,cpmk,difficulty,default_score,option_a,option_b,option_c,option_d,correct_answers,explanation',
    ];
    for (let i = 1; i <= 205; i++) {
      csvRows.push(
        `IMP21-${i},SINGLE_CHOICE,"Pertanyaan uji massal nomor ${i}?",Algoritma,CPMK-1,EASY,5,"Opsi A","Opsi B","Opsi C","Opsi D",A,"Penjelasan ${i}"`
      );
    }
    csvRows.push('IMP21-ERR1,INVALID_TYPE,"Soal tipe salah",Algoritma,CPMK-1,EASY,5,"A","B",,,A,"Err"');
    csvRows.push('IMP21-ERR2,SINGLE_CHOICE,"Soal dua kunci",Algoritma,CPMK-1,EASY,5,"A","B","C",,"A,B","Err"');

    const csvBuf = Buffer.from(`\uFEFF${csvRows.join('\n')}`, 'utf-8');
    const csvPayload = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="bulk_205.csv"\r\nContent-Type: text/csv\r\n\r\n`
      ),
      csvBuf,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);

    const prevRes = await app.inject({
      method: 'POST',
      url: '/api/v1/question-imports/preview',
      cookies: { pk_lms_session: dosenCookie },
      headers: {
        'content-type': `multipart/form-data; boundary=${boundary}`,
        'x-csrf-token': dosenCsrf,
      },
      payload: csvPayload,
    });
    expect(prevRes.statusCode).toBe(200);
    const prevData = prevRes.json().data;
    expect(prevData.totalRows).toBe(207);
    expect(prevData.validCount).toBe(205);
    expect(prevData.invalidCount).toBe(2);

    const jobStartRes = await app.inject({
      method: 'POST',
      url: '/api/v1/question-imports/jobs',
      cookies: { pk_lms_session: dosenCookie },
      headers: { 'x-csrf-token': dosenCsrf },
      payload: {
        filename: 'bulk_205.csv',
        fileFormat: 'CSV',
        importMode: 'SKIP_DUPLICATES',
        fingerprint: prevData.fingerprint,
        batchSize: 100,
        rows: prevData.validRows,
      },
    });
    expect(jobStartRes.statusCode).toBe(202);
    const jobId = jobStartRes.json().data.jobId;

    // Poll until background job completes
    let finalJob: any = null;
    for (let attempt = 0; attempt < 25; attempt++) {
      await new Promise((r) => setTimeout(r, 150));
      const jobRes = await app.inject({
        method: 'GET',
        url: `/api/v1/question-imports/jobs/${jobId}`,
        cookies: { pk_lms_session: dosenCookie },
      });
      if (jobRes.json().data.status === 'COMPLETED') {
        finalJob = jobRes.json().data;
        break;
      }
    }
    expect(finalJob).toBeTruthy();
    expect(finalJob.successfulRows).toBe(205);
    expect(finalJob.totalRows).toBe(205);

    // Cleanup Phase 21 test questions & temporary user
    await db.delete(questions).where(like(questions.externalQuestionId, 'IMP21-%'));
    await db.delete(questions).where(eq(questions.id, createdQ.id));
    await db.delete(users).where(eq(users.id, otherDosen.id));
  }, 60000);

  it('Phase 22: Complete RBAC Refactoring — Canonical Roles, Protected Superadmin, Contextual Access & Strict Auditor Read-Only Enforcement', async () => {
    const { db } = await import('../db/index.ts');
    const { users, userRoles } = await import('../db/schema.ts');
    const { eq } = await import('drizzle-orm');
    const { hashPassword } = await import('../server/security.ts');

    const doLogin = async (email: string, password: string) => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { email, password },
      });
      expect(res.statusCode).toBe(200);
      return {
        cookie: res.cookies.find((c) => c.name === 'pk_lms_session')!.value,
        csrf: res.json().data.csrfToken as string,
      };
    };

    const adminLogin = await doLogin('superadmin@poltek-kampar.ac.id', 'AdminPolkam#2026');
    const dosenLogin = await doLogin('fitriani.dosen@poltek-kampar.ac.id', 'DosenPolkam#2026');
    const mhsLogin = await doLogin('ahmad.mhs@student.poltek-kampar.ac.id', 'MhsPolkam#2026');

    // 1. Verify /api/v1/rbac/roles returns all 4 canonical roles + enriched permission metadata + stats + history
    const rbacRes = await app.inject({
      method: 'GET',
      url: '/api/v1/rbac/roles',
      cookies: { pk_lms_session: adminLogin.cookie },
    });
    expect(rbacRes.statusCode).toBe(200);
    const rbacData = rbacRes.json().data;
    const roleCodes = rbacData.roles.map((r: any) => r.code);
    expect(roleCodes).toContain('SUPERADMIN');
    expect(roleCodes).toContain('DOSEN');
    expect(roleCodes).toContain('MAHASISWA');
    expect(roleCodes).toContain('AUDITOR');
    expect(rbacData.stats.totalRoles).toBeGreaterThanOrEqual(4);
    expect(rbacData.stats.totalPermissions).toBeGreaterThanOrEqual(30);
    for (const perm of rbacData.permissions) {
      expect(typeof perm.name).toBe('string');
      expect(typeof perm.module).toBe('string');
      expect(typeof perm.description).toBe('string');
      expect(Array.isArray(perm.allowedContext)).toBe(true);
      expect(perm.allowedContext.length).toBeGreaterThan(0);
    }

    const superadminRole = rbacData.roles.find((r: any) => r.code === 'SUPERADMIN');
    const auditorRole = rbacData.roles.find((r: any) => r.code === 'AUDITOR');
    const usersManagePerm = rbacData.permissions.find((p: any) => p.code === 'users:manage');
    const classroomsCreatePerm = rbacData.permissions.find((p: any) => p.code === 'classrooms:create');
    expect(usersManagePerm.isProtected).toBe(true);
    expect(classroomsCreatePerm.auditorAllowed).toBe(false);

    // 2. Protected Superadmin Permission: cannot disable SUPERADMIN permission
    const disableSuperRes = await app.inject({
      method: 'POST',
      url: '/api/v1/rbac/roles/permissions',
      cookies: { pk_lms_session: adminLogin.cookie },
      headers: { 'x-csrf-token': adminLogin.csrf },
      payload: {
        roleId: superadminRole.id,
        permissionId: usersManagePerm.id,
        enabled: false,
      },
    });
    expect(disableSuperRes.statusCode).toBe(403);
    expect(disableSuperRes.json().error.code).toBe('FORBIDDEN_PROTECTED_SUPERADMIN_PERMISSION');

    // 3. Cannot grant mutation permission to AUDITOR
    const grantMutToAuditorRes = await app.inject({
      method: 'POST',
      url: '/api/v1/rbac/roles/permissions',
      cookies: { pk_lms_session: adminLogin.cookie },
      headers: { 'x-csrf-token': adminLogin.csrf },
      payload: {
        roleId: auditorRole.id,
        permissionId: classroomsCreatePerm.id,
        enabled: true,
      },
    });
    expect(grantMutToAuditorRes.statusCode).toBe(403);
    expect(grantMutToAuditorRes.json().error.code).toBe('FORBIDDEN_AUDITOR_READ_ONLY');

    // 4. DOSEN and MAHASISWA cannot access RBAC management
    const dosenRbacRes = await app.inject({
      method: 'GET',
      url: '/api/v1/rbac/roles',
      cookies: { pk_lms_session: dosenLogin.cookie },
    });
    expect(dosenRbacRes.statusCode).toBe(403);

    const mhsRbacRes = await app.inject({
      method: 'GET',
      url: '/api/v1/rbac/roles',
      cookies: { pk_lms_session: mhsLogin.cookie },
    });
    expect(mhsRbacRes.statusCode).toBe(403);

    // 5. Create temporary AUDITOR user & verify strict read-only behavior
    const auditorEmail = `auditor.test.${Date.now()}@poltek-kampar.ac.id`;
    const [auditorUser] = await db
      .insert(users)
      .values({
        email: auditorEmail,
        passwordHash: await hashPassword('AuditorTest#2026'),
        fullName: 'Auditor Test Polkam',
        identityNumber: `AUD-${Date.now()}`,
        isActive: true,
      })
      .returning();

    await db.insert(userRoles).values({
      userId: auditorUser.id,
      roleId: auditorRole.id,
    });

    const auditorLogin = await doLogin(auditorEmail, 'AuditorTest#2026');

    // 5A. Auditor CAN read authorized views
    const audReadUsers = await app.inject({
      method: 'GET',
      url: '/api/v1/users',
      cookies: { pk_lms_session: auditorLogin.cookie },
    });
    expect(audReadUsers.statusCode).toBe(200);

    const audReadRbac = await app.inject({
      method: 'GET',
      url: '/api/v1/rbac/roles',
      cookies: { pk_lms_session: auditorLogin.cookie },
    });
    expect(audReadRbac.statusCode).toBe(200);

    const audReadAudit = await app.inject({
      method: 'GET',
      url: '/api/v1/audit-logs',
      cookies: { pk_lms_session: auditorLogin.cookie },
    });
    expect(audReadAudit.statusCode).toBe(200);

    const audReadClassrooms = await app.inject({
      method: 'GET',
      url: '/api/v1/classrooms',
      cookies: { pk_lms_session: auditorLogin.cookie },
    });
    expect(audReadClassrooms.statusCode).toBe(200);
    const firstClassroom = audReadClassrooms.json().data[0];
    expect(firstClassroom).toBeTruthy();
    expect(firstClassroom.canManage).toBe(false);
    expect(firstClassroom.joinCode).toBeNull();

    // 5B. MANDATORY AUDITOR NEGATIVE TESTS — Every mutation & export must fail with 403
    const mutationAttempts: Array<{
      method: 'POST' | 'PUT' | 'PATCH' | 'DELETE';
      url: string;
      payload?: Record<string, unknown>;
    }> = [
      {
        method: 'POST',
        url: '/api/v1/classrooms',
        payload: { name: 'Auditor Illegal Class', section: 'A', roomNumber: '101', scheduleText: 'Senin', capacity: 30 },
      },
      {
        method: 'POST',
        url: '/api/v1/users',
        payload: { email: 'illegal@poltek-kampar.ac.id', fullName: 'Illegal', password: 'Password#123', roleCode: 'DOSEN' },
      },
      {
        method: 'POST',
        url: '/api/v1/rbac/roles/permissions',
        payload: { roleId: auditorRole.id, permissionId: usersManagePerm.id, enabled: true },
      },
      {
        method: 'POST',
        url: '/api/v1/admin/academic-periods',
        payload: { code: '2099-1', name: 'Illegal Period', academicYear: '2099/2100', semesterType: 'GANJIL', startDate: '2099-09-01', endDate: '2100-01-31' },
      },
      {
        method: 'POST',
        url: '/api/v1/classrooms/join',
        payload: { code: 'TEST1234' },
      },
      {
        method: 'POST',
        url: `/api/v1/classrooms/${firstClassroom.id}/announcements`,
        payload: { title: 'Illegal', content: 'Auditor cannot post' },
      },
      {
        method: 'PATCH',
        url: `/api/v1/classrooms/${firstClassroom.id}/settings`,
        payload: { section: 'identity', payload: { name: 'Hijacked' } },
      },
      {
        method: 'DELETE',
        url: `/api/v1/classrooms/${firstClassroom.id}/modules/00000000-0000-0000-0000-000000000000`,
      },
    ];

    for (const attempt of mutationAttempts) {
      const res = await app.inject({
        method: attempt.method,
        url: attempt.url,
        cookies: { pk_lms_session: auditorLogin.cookie },
        headers: { 'x-csrf-token': auditorLogin.csrf },
        payload: attempt.payload,
      });
      expect(res.statusCode).toBe(403);
      expect(res.json().error.code).toBe('FORBIDDEN_AUDITOR_READ_ONLY');
    }

    // Cleanup temporary auditor user
    await db.delete(users).where(eq(users.id, auditorUser.id));
  }, 60000);

  it('Phase 23: Academic Identity & User Administration Center (lifecycle, sessions, bulk, XLSX/CSV import, and Auditor read-only)', async () => {
    const { db } = await import('../db/index.ts');
    const { users } = await import('../db/schema.ts');
    const { eq } = await import('drizzle-orm');

    const doLogin = async (email: string, password: string) => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { email, password },
      });
      expect(res.statusCode).toBe(200);
      return {
        cookie: res.cookies.find((c) => c.name === 'pk_lms_session')!.value,
        csrf: res.json().data.csrfToken as string,
        userId: res.json().data.user.id as string,
      };
    };

    const adminLogin = await doLogin('superadmin@poltek-kampar.ac.id', 'AdminPolkam#2026');
    const suffix = Date.now();

    // 1. Directory query with search/filter/stats
    const listRes = await app.inject({
      method: 'GET',
      url: '/api/v1/users?page=1&limit=10&sortBy=createdAt&sortDir=desc',
      cookies: { pk_lms_session: adminLogin.cookie },
    });
    expect(listRes.statusCode).toBe(200);
    const listBody = listRes.json();
    expect(Array.isArray(listBody.data)).toBe(true);
    expect(listBody.meta.stats.totalUsers).toBeGreaterThanOrEqual(3);
    expect(listBody.meta.stats.superadminCount).toBeGreaterThanOrEqual(1);

    // 2. Create DOSEN via PASSWORD_INIT and MAHASISWA via INVITATION
    const dosenEmail = `dosen.test.${suffix}@poltek-kampar.ac.id`;
    const mhsEmail = `mhs.test.${suffix}@student.poltek-kampar.ac.id`;

    const createDosenRes = await app.inject({
      method: 'POST',
      url: '/api/v1/users',
      cookies: { pk_lms_session: adminLogin.cookie },
      headers: { 'x-csrf-token': adminLogin.csrf },
      payload: {
        fullName: 'Dr. Budi Test, M.Kom',
        email: dosenEmail,
        identityNumber: `NIDN-${suffix}`,
        nidn: `1012${String(suffix).slice(-6)}`,
        academicTitle: 'M.Kom',
        roleCode: 'DOSEN',
        accountStatus: 'ACTIVE',
        activationMethod: 'PASSWORD_INIT',
        password: 'DosenTest#2026',
        studyProgram: 'Teknik Informatika',
        organizationalUnit: 'Jurusan TI',
      },
    });
    expect(createDosenRes.statusCode).toBe(201);
    const createdDosenId = createDosenRes.json().data.id as string;

    const createMhsRes = await app.inject({
      method: 'POST',
      url: '/api/v1/users',
      cookies: { pk_lms_session: adminLogin.cookie },
      headers: { 'x-csrf-token': adminLogin.csrf },
      payload: {
        fullName: 'Siti Mahasiswa Test',
        email: mhsEmail,
        identityNumber: `2026${String(suffix).slice(-5)}`,
        nim: `2026${String(suffix).slice(-5)}`,
        roleCode: 'MAHASISWA',
        accountStatus: 'PENDING_ACTIVATION',
        activationMethod: 'INVITATION',
        studyProgram: 'Teknik Informatika',
        admissionYear: 2026,
        semesterLevel: 1,
      },
    });
    expect(createMhsRes.statusCode).toBe(201);
    const createdMhsId = createMhsRes.json().data.id as string;

    // 3. Log in as the created Dosen so there is an active session, then inspect 5-tab detail
    const newDosenLogin = await doLogin(dosenEmail, 'DosenTest#2026');
    const detailRes = await app.inject({
      method: 'GET',
      url: `/api/v1/users/${createdDosenId}`,
      cookies: { pk_lms_session: adminLogin.cookie },
    });
    expect(detailRes.statusCode).toBe(200);
    const detailData = detailRes.json().data;
    expect(detailData.email).toBe(dosenEmail);
    expect(detailData.passwordHash).toBeUndefined();
    expect(Array.isArray(detailData.sessions)).toBe(true);
    expect(detailData.sessions.length).toBeGreaterThanOrEqual(1);
    for (const s of detailData.sessions) {
      expect(s.sessionTokenHash).toBeUndefined();
    }

    // 4. Edit user profile & academic identity
    const editRes = await app.inject({
      method: 'PATCH',
      url: `/api/v1/users/${createdDosenId}`,
      cookies: { pk_lms_session: adminLogin.cookie },
      headers: { 'x-csrf-token': adminLogin.csrf },
      payload: {
        fullName: 'Dr. Budi Test Updated, M.Kom',
        organizationalUnit: 'LPPM',
        reason: 'Unit update test',
      },
    });
    expect(editRes.statusCode).toBe(200);

    // 5. Reset password + revoke sessions
    const resetRes = await app.inject({
      method: 'POST',
      url: `/api/v1/users/${createdDosenId}/reset-password`,
      cookies: { pk_lms_session: adminLogin.cookie },
      headers: { 'x-csrf-token': adminLogin.csrf },
      payload: {
        mode: 'BOTH',
        revokeSessions: true,
        reason: 'Security rotation test',
      },
    });
    expect(resetRes.statusCode).toBe(200);
    expect(resetRes.json().data.mustResetPassword).toBe(true);
    expect(resetRes.json().data.sessionsRevoked).toBe(true);

    // Verify revoked session is no longer valid
    const revokedCheckRes = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      cookies: { pk_lms_session: newDosenLogin.cookie },
    });
    expect(revokedCheckRes.statusCode).toBe(401);

    // 6. Status toggle & Bulk actions
    const statusRes = await app.inject({
      method: 'PATCH',
      url: `/api/v1/users/${createdDosenId}/status`,
      cookies: { pk_lms_session: adminLogin.cookie },
      headers: { 'x-csrf-token': adminLogin.csrf },
      payload: { accountStatus: 'INACTIVE', isActive: false },
    });
    expect(statusRes.statusCode).toBe(200);

    const bulkRes = await app.inject({
      method: 'POST',
      url: '/api/v1/users/bulk',
      cookies: { pk_lms_session: adminLogin.cookie },
      headers: { 'x-csrf-token': adminLogin.csrf },
      payload: {
        action: 'ACTIVATE',
        userIds: [createdDosenId, createdMhsId],
      },
    });
    expect(bulkRes.statusCode).toBe(200);

    // 7. Template download (XLSX & CSV)
    const tplXlsxRes = await app.inject({
      method: 'GET',
      url: '/api/v1/users/import/templates/dosen-xlsx',
      cookies: { pk_lms_session: adminLogin.cookie },
    });
    expect(tplXlsxRes.statusCode).toBe(200);
    expect(tplXlsxRes.headers['content-type']).toContain('spreadsheetml.sheet');

    const tplCsvRes = await app.inject({
      method: 'GET',
      url: '/api/v1/users/import/templates/general-csv',
      cookies: { pk_lms_session: adminLogin.cookie },
    });
    expect(tplCsvRes.statusCode).toBe(200);
    expect(tplCsvRes.headers['content-type']).toContain('text/csv');

    // 8. Import Preview (multipart CSV) + Commit (with 1 valid, 1 duplicate, 1 invalid email)
    const importedEmail = `import.mhs.${suffix}@student.poltek-kampar.ac.id`;
    const csvContent = [
      'fullName,email,identityNumber,roleCode,studyProgram,admissionYear',
      `Imported Mahasiswa,${importedEmail},IMP${String(suffix).slice(-6)},MAHASISWA,Teknik Informatika,2026`,
      `Duplicate Mahasiswa,${mhsEmail},DUP${String(suffix).slice(-6)},MAHASISWA,Teknik Informatika,2026`,
      `Invalid Email Row,not-an-email,INV${String(suffix).slice(-6)},MAHASISWA,Teknik Informatika,2026`,
    ].join('\n');
    const boundary = `----VitestBoundary${suffix}`;
    const multipartPayload = [
      `--${boundary}`,
      `Content-Disposition: form-data; name="file"; filename="test-import-${suffix}.csv"`,
      'Content-Type: text/csv',
      '',
      csvContent,
      `--${boundary}--`,
      '',
    ].join('\r\n');

    const previewRes = await app.inject({
      method: 'POST',
      url: '/api/v1/users/import/preview',
      cookies: { pk_lms_session: adminLogin.cookie },
      headers: {
        'x-csrf-token': adminLogin.csrf,
        'content-type': `multipart/form-data; boundary=${boundary}`,
      },
      payload: multipartPayload,
    });
    expect(previewRes.statusCode).toBe(200);
    const previewBody = previewRes.json().data;
    expect(previewBody.totalRows).toBe(3);
    expect(previewBody.validRows).toBe(2);
    expect(previewBody.duplicateRows).toBe(1);
    expect(previewBody.invalidRows).toBe(1);

    const commitRes = await app.inject({
      method: 'POST',
      url: '/api/v1/users/import/commit',
      cookies: { pk_lms_session: adminLogin.cookie },
      headers: { 'x-csrf-token': adminLogin.csrf },
      payload: {
        filename: previewBody.filename,
        fingerprint: previewBody.fingerprint,
        importType: 'MAHASISWA',
        importMode: 'SKIP_DUPLICATES',
        rows: previewBody.rows.filter((r: any) => r.isValid && !r.isDuplicateDb),
      },
    });
    expect(commitRes.statusCode).toBe(201);
    expect(commitRes.json().data.successfulRecords).toBe(1);

    const historyRes = await app.inject({
      method: 'GET',
      url: '/api/v1/users/import/history',
      cookies: { pk_lms_session: adminLogin.cookie },
    });
    expect(historyRes.statusCode).toBe(200);
    expect(historyRes.json().data.length).toBeGreaterThanOrEqual(1);

    // 9. Auditor Read-Only Enforcement on User Management endpoints
    const auditorEmail = `auditor.um.${suffix}@poltek-kampar.ac.id`;
    const createAuditorRes = await app.inject({
      method: 'POST',
      url: '/api/v1/users',
      cookies: { pk_lms_session: adminLogin.cookie },
      headers: { 'x-csrf-token': adminLogin.csrf },
      payload: {
        fullName: 'Auditor UserMgmt Test',
        email: auditorEmail,
        identityNumber: `AUD-${suffix}`,
        roleCode: 'AUDITOR',
        accountStatus: 'ACTIVE',
        activationMethod: 'PASSWORD_INIT',
        password: 'AuditorTest#2026',
        studyProgram: 'Penjaminan Mutu',
        auditScope: 'All Programs',
      },
    });
    expect(createAuditorRes.statusCode).toBe(201);
    const createdAuditorId = createAuditorRes.json().data.id as string;

    const auditorLogin = await doLogin(auditorEmail, 'AuditorTest#2026');

    const auditorListRes = await app.inject({
      method: 'GET',
      url: '/api/v1/users',
      cookies: { pk_lms_session: auditorLogin.cookie },
    });
    expect(auditorListRes.statusCode).toBe(200);

    const auditorBlockedCreate = await app.inject({
      method: 'POST',
      url: '/api/v1/users',
      cookies: { pk_lms_session: auditorLogin.cookie },
      headers: { 'x-csrf-token': auditorLogin.csrf },
      payload: {
        fullName: 'Blocked',
        email: `blocked.${suffix}@poltek-kampar.ac.id`,
        roleCode: 'MAHASISWA',
        studyProgram: 'TI',
      },
    });
    expect(auditorBlockedCreate.statusCode).toBe(403);

    const auditorBlockedTpl = await app.inject({
      method: 'GET',
      url: '/api/v1/users/import/templates/dosen-xlsx',
      cookies: { pk_lms_session: auditorLogin.cookie },
    });
    expect(auditorBlockedTpl.statusCode).toBe(403);

    // Cleanup temporary test users
    await db
      .delete(users)
      .where(eq(users.email, importedEmail));
    await db.delete(users).where(eq(users.id, createdDosenId));
    await db.delete(users).where(eq(users.id, createdMhsId));
    await db.delete(users).where(eq(users.id, createdAuditorId));
  }, 60000);

  it('Phase 24: Advanced Password Reset & Account Security (Automatic, Manual, NIM/NIDN/NIP Identity-Based, Mandatory Change Enforcement, Expiration, Password History, Bulk Reset & Audit Integrity)', async () => {
    const { db } = await import('../db/index.ts');
    const { users, auditLogs } = await import('../db/schema.ts');
    const { eq, desc } = await import('drizzle-orm');

    const doLogin = async (email: string, password: string) => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { email, password },
      });
      return res;
    };

    const adminRes = await doLogin('superadmin@poltek-kampar.ac.id', 'AdminPolkam#2026');
    expect(adminRes.statusCode).toBe(200);
    const adminCookie = adminRes.cookies.find((c) => c.name === 'pk_lms_session')!.value;
    const adminCsrf = adminRes.json().data.csrfToken as string;

    const suffix = Date.now();
    const mhsEmail = `sec.mhs.${suffix}@student.poltek-kampar.ac.id`;
    const dosenEmail = `sec.dosen.${suffix}@poltek-kampar.ac.id`;
    const nipEmail = `sec.nip.${suffix}@poltek-kampar.ac.id`;
    const mhsNim = `NIM${String(suffix).slice(-6)}`;
    const dosenNidn = `NIDN${String(suffix).slice(-6)}`;
    const empNip = `NIP${String(suffix).slice(-6)}`;

    // Create 3 test accounts (Student with NIM, Lecturer with NIDN, Employee/Dosen with NIP)
    const createMhs = await app.inject({
      method: 'POST',
      url: '/api/v1/users',
      cookies: { pk_lms_session: adminCookie },
      headers: { 'x-csrf-token': adminCsrf },
      payload: {
        fullName: 'Mahasiswa Security Test',
        email: mhsEmail,
        identityNumber: mhsNim,
        nim: mhsNim,
        roleCode: 'MAHASISWA',
        accountStatus: 'ACTIVE',
        activationMethod: 'PASSWORD_INIT',
        password: 'InitPassword#2026',
        studyProgram: 'Teknik Informatika',
      },
    });
    expect(createMhs.statusCode).toBe(201);
    const mhsId = createMhs.json().data.id as string;

    const createDosen = await app.inject({
      method: 'POST',
      url: '/api/v1/users',
      cookies: { pk_lms_session: adminCookie },
      headers: { 'x-csrf-token': adminCsrf },
      payload: {
        fullName: 'Dosen Security Test',
        email: dosenEmail,
        identityNumber: dosenNidn,
        nidn: dosenNidn,
        roleCode: 'DOSEN',
        accountStatus: 'ACTIVE',
        activationMethod: 'PASSWORD_INIT',
        password: 'InitPassword#2026',
        studyProgram: 'Teknik Informatika',
      },
    });
    expect(createDosen.statusCode).toBe(201);
    const dosenId = createDosen.json().data.id as string;

    const createNipUser = await app.inject({
      method: 'POST',
      url: '/api/v1/users',
      cookies: { pk_lms_session: adminCookie },
      headers: { 'x-csrf-token': adminCsrf },
      payload: {
        fullName: 'Pegawai NIP Security Test',
        email: nipEmail,
        identityNumber: empNip,
        nip: empNip,
        roleCode: 'AUDITOR',
        accountStatus: 'ACTIVE',
        activationMethod: 'PASSWORD_INIT',
        password: 'InitPassword#2026',
        studyProgram: 'Teknik Informatika',
      },
    });
    expect(createNipUser.statusCode).toBe(201);
    const nipUserId = createNipUser.json().data.id as string;

    // 1. Unauthorized reset attempt by non-admin (Mahasiswa) -> 403
    const mhsLoginBefore = await doLogin(mhsEmail, 'InitPassword#2026');
    expect(mhsLoginBefore.statusCode).toBe(200);
    const mhsCookieBefore = mhsLoginBefore.cookies.find((c) => c.name === 'pk_lms_session')!.value;
    const mhsCsrfBefore = mhsLoginBefore.json().data.csrfToken as string;

    const unauthorizedReset = await app.inject({
      method: 'POST',
      url: `/api/v1/users/${dosenId}/reset-password`,
      cookies: { pk_lms_session: mhsCookieBefore },
      headers: { 'x-csrf-token': mhsCsrfBefore },
      payload: { method: 'AUTOMATIC' },
    });
    expect(unauthorizedReset.statusCode).toBe(403);

    // 2. Automatic 16-char cryptographic password reset + session revocation
    const autoResetRes = await app.inject({
      method: 'POST',
      url: `/api/v1/users/${mhsId}/reset-password`,
      cookies: { pk_lms_session: adminCookie },
      headers: { 'x-csrf-token': adminCsrf },
      payload: {
        method: 'AUTOMATIC',
        expirationHours: 24,
        revokeSessions: true,
        reason: 'Automated cryptographic reset test',
      },
    });
    expect(autoResetRes.statusCode).toBe(200);
    const autoData = autoResetRes.json().data;
    expect(autoData.method).toBe('AUTOMATIC');
    expect(autoData.mustResetPassword).toBe(true);
    expect(autoData.sessionsRevoked).toBe(true);
    expect(typeof autoData.temporaryPassword).toBe('string');
    expect(autoData.temporaryPassword.length).toBe(16);

    // Prior session must be revoked (401)
    const oldSessionCheck = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      cookies: { pk_lms_session: mhsCookieBefore },
    });
    expect(oldSessionCheck.statusCode).toBe(401);

    // 3. Login with automatic temporary password -> mustResetPassword = true & protected APIs blocked (403 PASSWORD_CHANGE_REQUIRED)
    const tempLogin = await doLogin(mhsEmail, autoData.temporaryPassword);
    expect(tempLogin.statusCode).toBe(200);
    expect(tempLogin.json().data.user.mustResetPassword).toBe(true);
    const tempCookie = tempLogin.cookies.find((c) => c.name === 'pk_lms_session')!.value;
    const tempCsrf = tempLogin.json().data.csrfToken as string;

    const blockedClassrooms = await app.inject({
      method: 'GET',
      url: '/api/v1/classrooms',
      cookies: { pk_lms_session: tempCookie },
    });
    expect(blockedClassrooms.statusCode).toBe(403);
    expect(blockedClassrooms.json().error.code).toBe('PASSWORD_CHANGE_REQUIRED');

    // 4. Reject weak/identity-based permanent password & history reuse
    const identityPermAttempt = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/change-password',
      cookies: { pk_lms_session: tempCookie },
      headers: { 'x-csrf-token': tempCsrf },
      payload: {
        currentPassword: autoData.temporaryPassword,
        newPassword: `Pass_${mhsNim}_2026!`,
        confirmPassword: `Pass_${mhsNim}_2026!`,
      },
    });
    expect(identityPermAttempt.statusCode).toBe(400);
    expect(identityPermAttempt.json().error.code).toBe('WEAK_PASSWORD');

    const reuseAttempt = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/change-password',
      cookies: { pk_lms_session: tempCookie },
      headers: { 'x-csrf-token': tempCsrf },
      payload: {
        currentPassword: autoData.temporaryPassword,
        newPassword: 'InitPassword#2026',
        confirmPassword: 'InitPassword#2026',
      },
    });
    expect(reuseAttempt.statusCode).toBe(400);
    expect(reuseAttempt.json().error.code).toBe('PASSWORD_REUSE_FORBIDDEN');

    // 5. Complete mandatory password change -> fresh session issued & protected APIs unlocked
    const strongNewPass = `PolkamStrong#${suffix}!`;
    const changeOk = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/change-password',
      cookies: { pk_lms_session: tempCookie },
      headers: { 'x-csrf-token': tempCsrf },
      payload: {
        currentPassword: autoData.temporaryPassword,
        newPassword: strongNewPass,
        confirmPassword: strongNewPass,
      },
    });
    expect(changeOk.statusCode).toBe(200);
    expect(changeOk.json().data.passwordChanged).toBe(true);
    expect(changeOk.json().data.user.mustResetPassword).toBe(false);
    const freshCookie = changeOk.cookies.find((c) => c.name === 'pk_lms_session')!.value;

    // Old temporary session must be invalidated
    const oldTempCheck = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      cookies: { pk_lms_session: tempCookie },
    });
    expect(oldTempCheck.statusCode).toBe(401);

    // Fresh session works on protected APIs
    const unlockedClassrooms = await app.inject({
      method: 'GET',
      url: '/api/v1/classrooms',
      cookies: { pk_lms_session: freshCookie },
    });
    expect(unlockedClassrooms.statusCode).toBe(200);

    // 6. Manual weak password rejected, strong manual password accepted
    const weakManual = await app.inject({
      method: 'POST',
      url: `/api/v1/users/${dosenId}/reset-password`,
      cookies: { pk_lms_session: adminCookie },
      headers: { 'x-csrf-token': adminCsrf },
      payload: {
        method: 'MANUAL',
        manualPassword: 'weak',
        confirmPassword: 'weak',
      },
    });
    expect(weakManual.statusCode).toBe(400);

    const strongManualPass = `ManualTmp#${suffix}!`;
    const strongManual = await app.inject({
      method: 'POST',
      url: `/api/v1/users/${dosenId}/reset-password`,
      cookies: { pk_lms_session: adminCookie },
      headers: { 'x-csrf-token': adminCsrf },
      payload: {
        method: 'MANUAL',
        manualPassword: strongManualPass,
        confirmPassword: strongManualPass,
        reason: 'Manual reset test',
      },
    });
    expect(strongManual.statusCode).toBe(200);
    expect(strongManual.json().data.temporaryPassword).toBeNull();

    // 7. Identity-based reset for Student (NIM), Lecturer (NIDN), and Employee (NIP)
    const nimReset = await app.inject({
      method: 'POST',
      url: `/api/v1/users/${mhsId}/reset-password`,
      cookies: { pk_lms_session: adminCookie },
      headers: { 'x-csrf-token': adminCsrf },
      payload: { method: 'IDENTITY_BASED', reason: 'NIM bootstrap test' },
    });
    expect(nimReset.statusCode).toBe(200);
    expect(nimReset.json().data.identityTypeUsed).toBe('NIM');
    const nimLogin = await doLogin(mhsEmail, mhsNim);
    expect(nimLogin.statusCode).toBe(200);
    expect(nimLogin.json().data.user.mustResetPassword).toBe(true);

    const nidnReset = await app.inject({
      method: 'POST',
      url: `/api/v1/users/${dosenId}/reset-password`,
      cookies: { pk_lms_session: adminCookie },
      headers: { 'x-csrf-token': adminCsrf },
      payload: { method: 'IDENTITY_BASED', reason: 'NIDN bootstrap test' },
    });
    expect(nidnReset.statusCode).toBe(200);
    expect(nidnReset.json().data.identityTypeUsed).toBe('NIDN');
    const nidnLogin = await doLogin(dosenEmail, dosenNidn);
    expect(nidnLogin.statusCode).toBe(200);
    expect(nidnLogin.json().data.user.mustResetPassword).toBe(true);

    const nipReset = await app.inject({
      method: 'POST',
      url: `/api/v1/users/${nipUserId}/reset-password`,
      cookies: { pk_lms_session: adminCookie },
      headers: { 'x-csrf-token': adminCsrf },
      payload: { method: 'IDENTITY_BASED', reason: 'NIP bootstrap test' },
    });
    expect(nipReset.statusCode).toBe(200);
    expect(nipReset.json().data.identityTypeUsed).toBe('NIP');
    const nipLogin = await doLogin(nipEmail, empNip);
    expect(nipLogin.statusCode).toBe(200);
    expect(nipLogin.json().data.user.mustResetPassword).toBe(true);

    // 8. Temporary credential expiration -> 401 TEMPORARY_PASSWORD_EXPIRED
    await db
      .update(users)
      .set({ temporaryPasswordExpiresAt: new Date(Date.now() - 60_000) })
      .where(eq(users.id, nipUserId));
    const expiredLogin = await doLogin(nipEmail, empNip);
    expect(expiredLogin.statusCode).toBe(401);
    expect(expiredLogin.json().error.code).toBe('TEMPORARY_PASSWORD_EXPIRED');

    // 9. Bulk reset preview & execution (unique passwords per user)
    const bulkPreview = await app.inject({
      method: 'POST',
      url: '/api/v1/users/bulk-reset-password',
      cookies: { pk_lms_session: adminCookie },
      headers: { 'x-csrf-token': adminCsrf },
      payload: {
        userIds: [mhsId, dosenId, nipUserId],
        method: 'AUTOMATIC',
        previewOnly: true,
      },
    });
    expect(bulkPreview.statusCode).toBe(200);
    expect(bulkPreview.json().data.eligibleCount).toBe(3);

    const bulkExec = await app.inject({
      method: 'POST',
      url: '/api/v1/users/bulk-reset-password',
      cookies: { pk_lms_session: adminCookie },
      headers: { 'x-csrf-token': adminCsrf },
      payload: {
        userIds: [mhsId, dosenId, nipUserId],
        method: 'AUTOMATIC',
        revokeSessions: true,
        reason: 'Bulk security rotation',
        previewOnly: false,
      },
    });
    expect(bulkExec.statusCode).toBe(200);
    const bulkData = bulkExec.json().data;
    expect(bulkData.successCount).toBe(3);
    const uniquePasswords = new Set(bulkData.results.map((r: any) => r.temporaryPassword));
    expect(uniquePasswords.size).toBe(3);

    // 10. Audit log integrity (no plaintext passwords stored in metadata)
    const recentAudit = await db
      .select()
      .from(auditLogs)
      .orderBy(desc(auditLogs.createdAt))
      .limit(10);
    const serializedAudit = JSON.stringify(recentAudit);
    for (const pw of uniquePasswords) {
      expect(serializedAudit).not.toContain(pw as string);
    }
    expect(serializedAudit).not.toContain(strongManualPass);

    // Cleanup temporary test users
    await db.delete(users).where(eq(users.id, mhsId));
    await db.delete(users).where(eq(users.id, dosenId));
    await db.delete(users).where(eq(users.id, nipUserId));
  }, 60000);

  it('Phase 25: Digital Classroom Management & Visibility System (Role-Scoped Views, PUBLIC vs PRIVATE Discovery, Invitation Validation, Real Student Progress & IDOR Protection)', async () => {
    const { db } = await import('../db/index.ts');
    const {
      users,
      classrooms,
      classroomJoinCodes,
      classroomInstructors,
      learningMaterials,
      materialProgress,
    } = await import('../db/schema.ts');
    const { eq } = await import('drizzle-orm');

    const doLogin = async (email: string, password: string) => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { email, password },
      });
      expect(res.statusCode).toBe(200);
      return {
        cookie: res.cookies.find((c) => c.name === 'pk_lms_session')!.value,
        csrf: res.json().data.csrfToken as string,
        userId: res.json().data.user.id as string,
      };
    };

    const adminLogin = await doLogin('superadmin@poltek-kampar.ac.id', 'AdminPolkam#2026');
    const dosen1Login = await doLogin('fitriani.dosen@poltek-kampar.ac.id', 'DosenPolkam#2026');
    const suffix = Date.now();

    // Create a second Dosen & a fresh Mahasiswa for strict isolation testing
    const dosen2Email = `dosen2.vis.${suffix}@poltek-kampar.ac.id`;
    const mhsEmail = `mhs.vis.${suffix}@student.poltek-kampar.ac.id`;

    const createD2 = await app.inject({
      method: 'POST',
      url: '/api/v1/users',
      cookies: { pk_lms_session: adminLogin.cookie },
      headers: { 'x-csrf-token': adminLogin.csrf },
      payload: {
        fullName: 'Dosen Dua Isolation',
        email: dosen2Email,
        identityNumber: `NIDN2-${suffix}`,
        roleCode: 'DOSEN',
        accountStatus: 'ACTIVE',
        activationMethod: 'PASSWORD_INIT',
        password: 'DosenDua#2026',
        studyProgram: 'Teknik Informatika',
      },
    });
    expect(createD2.statusCode).toBe(201);
    const dosen2Id = createD2.json().data.id as string;

    const createMhs = await app.inject({
      method: 'POST',
      url: '/api/v1/users',
      cookies: { pk_lms_session: adminLogin.cookie },
      headers: { 'x-csrf-token': adminLogin.csrf },
      payload: {
        fullName: 'Mahasiswa Visibility Test',
        email: mhsEmail,
        identityNumber: `NIMV-${suffix}`,
        roleCode: 'MAHASISWA',
        accountStatus: 'ACTIVE',
        activationMethod: 'PASSWORD_INIT',
        password: 'MhsVis#2026',
        studyProgram: 'Teknik Informatika',
      },
    });
    expect(createMhs.statusCode).toBe(201);
    const mhsId = createMhs.json().data.id as string;

    const dosen2Login = await doLogin(dosen2Email, 'DosenDua#2026');
    const mhsLogin = await doLogin(mhsEmail, 'MhsVis#2026');

    // Dosen 1 creates a PUBLIC classroom; Dosen 2 creates a PRIVATE classroom (capacity 5)
    const pubClassRes = await app.inject({
      method: 'POST',
      url: '/api/v1/classrooms',
      cookies: { pk_lms_session: dosen1Login.cookie },
      headers: { 'x-csrf-token': dosen1Login.csrf },
      payload: {
        name: `Kelas Publik ${suffix}`,
        section: 'A',
        subjectCode: `PUB-${String(suffix).slice(-4)}`,
        subjectName: 'Algoritma Publik',
        visibility: 'PUBLIC',
        capacity: 5,
        enrollmentPolicy: 'AUTO',
      },
    });
    expect(pubClassRes.statusCode).toBe(201);
    const pubClassId = pubClassRes.json().data.id as string;
    const pubJoinCode = pubClassRes.json().data.joinCode as string;

    const privClassRes = await app.inject({
      method: 'POST',
      url: '/api/v1/classrooms',
      cookies: { pk_lms_session: dosen2Login.cookie },
      headers: { 'x-csrf-token': dosen2Login.csrf },
      payload: {
        name: `Kelas Private ${suffix}`,
        section: 'B',
        subjectCode: `PRV-${String(suffix).slice(-4)}`,
        subjectName: 'Keamanan Private',
        visibility: 'PRIVATE',
        capacity: 5,
        enrollmentPolicy: 'AUTO',
      },
    });
    expect(privClassRes.statusCode).toBe(201);
    const privClassId = privClassRes.json().data.id as string;
    const privJoinCode = privClassRes.json().data.joinCode as string;

    // 1. SUPERADMIN sees BOTH classrooms & can filter by lecturer
    const adminListRes = await app.inject({
      method: 'GET',
      url: `/api/v1/classrooms?limit=50&instructorId=${dosen2Id}`,
      cookies: { pk_lms_session: adminLogin.cookie },
    });
    expect(adminListRes.statusCode).toBe(200);
    const adminIds = adminListRes.json().data.map((c: any) => c.id);
    expect(adminIds).toContain(privClassId);
    expect(adminIds).not.toContain(pubClassId);

    // 2. DOSEN isolation: Dosen 1 sees ONLY own classrooms even if trying ?view=superadmin
    const d1ListRes = await app.inject({
      method: 'GET',
      url: '/api/v1/classrooms?view=superadmin&limit=50',
      cookies: { pk_lms_session: dosen1Login.cookie },
    });
    expect(d1ListRes.statusCode).toBe(200);
    const d1Ids = d1ListRes.json().data.map((c: any) => c.id);
    expect(d1Ids).toContain(pubClassId);
    expect(d1Ids).not.toContain(privClassId);

    // Dosen 1 cannot edit Dosen 2's classroom settings (403)
    const d1EditD2 = await app.inject({
      method: 'PATCH',
      url: `/api/v1/classrooms/${privClassId}/settings`,
      cookies: { pk_lms_session: dosen1Login.cookie },
      headers: { 'x-csrf-token': dosen1Login.csrf },
      payload: { section: 'identity', payload: { name: 'Hijacked' } },
    });
    expect(d1EditD2.statusCode).toBe(403);

    // Co-lecturer assignment appears ONLY in co_taught view, not owned view
    await db.insert(classroomInstructors).values({
      classroomId: privClassId,
      instructorId: dosen1Login.userId,
      isPrimary: false,
      role: 'CO_INSTRUCTOR',
    });
    const d1CoTaught = await app.inject({
      method: 'GET',
      url: '/api/v1/classrooms?view=co_taught&limit=50',
      cookies: { pk_lms_session: dosen1Login.cookie },
    });
    expect(d1CoTaught.statusCode).toBe(200);
    const coTaughtIds = d1CoTaught.json().data.map((c: any) => c.id);
    expect(coTaughtIds).toContain(privClassId);
    expect(coTaughtIds).not.toContain(pubClassId);

    // 3. MAHASISWA: enrolled view is empty initially; public_discovery shows PUBLIC only & hides joinCode
    const mhsEnrolled0 = await app.inject({
      method: 'GET',
      url: '/api/v1/classrooms?view=enrolled',
      cookies: { pk_lms_session: mhsLogin.cookie },
    });
    expect(mhsEnrolled0.statusCode).toBe(200);
    expect(mhsEnrolled0.json().data.length).toBe(0);

    const mhsPublic = await app.inject({
      method: 'GET',
      url: '/api/v1/classrooms?view=public_discovery&limit=50',
      cookies: { pk_lms_session: mhsLogin.cookie },
    });
    expect(mhsPublic.statusCode).toBe(200);
    const publicItems = mhsPublic.json().data;
    const foundPub = publicItems.find((c: any) => c.id === pubClassId);
    const foundPriv = publicItems.find((c: any) => c.id === privClassId);
    expect(foundPub).toBeTruthy();
    expect(foundPub.joinCode).toBeNull();
    expect(foundPriv).toBeUndefined();

    // Student cannot access classroom content before enrollment (403)
    const mhsBlocked = await app.inject({
      method: 'GET',
      url: `/api/v1/classrooms/${pubClassId}`,
      cookies: { pk_lms_session: mhsLogin.cookie },
    });
    expect(mhsBlocked.statusCode).toBe(403);

    // 4. Invitation validation & join rules
    const invalidCodeRes = await app.inject({
      method: 'POST',
      url: '/api/v1/classrooms/join/validate',
      cookies: { pk_lms_session: mhsLogin.cookie },
      headers: { 'x-csrf-token': mhsLogin.csrf },
      payload: { code: 'NOT-FOUND-999' },
    });
    expect(invalidCodeRes.statusCode).toBe(404);
    expect(invalidCodeRes.json().error.code).toBe('CODE_NOT_FOUND');

    // Validate valid PUBLIC code -> preview returned, then join
    const validPreview = await app.inject({
      method: 'POST',
      url: '/api/v1/classrooms/join/validate',
      cookies: { pk_lms_session: mhsLogin.cookie },
      headers: { 'x-csrf-token': mhsLogin.csrf },
      payload: { code: pubJoinCode },
    });
    expect(validPreview.statusCode).toBe(200);
    expect(validPreview.json().data.classroom.id).toBe(pubClassId);

    const joinOk = await app.inject({
      method: 'POST',
      url: '/api/v1/classrooms/join',
      cookies: { pk_lms_session: mhsLogin.cookie },
      headers: { 'x-csrf-token': mhsLogin.csrf },
      payload: { code: pubJoinCode },
    });
    expect(joinOk.statusCode).toBe(201);

    // Duplicate enrollment rejected (409 ALREADY_ENROLLED)
    const joinDup = await app.inject({
      method: 'POST',
      url: '/api/v1/classrooms/join',
      cookies: { pk_lms_session: mhsLogin.cookie },
      headers: { 'x-csrf-token': mhsLogin.csrf },
      payload: { code: pubJoinCode },
    });
    expect(joinDup.statusCode).toBe(409);
    expect(joinDup.json().error.code).toBe('ALREADY_ENROLLED');

    // Revoked / Expired code rejected
    await db
      .update(classroomJoinCodes)
      .set({ isActive: false, revokedAt: new Date() })
      .where(eq(classroomJoinCodes.code, privJoinCode));
    const revokedJoin = await app.inject({
      method: 'POST',
      url: '/api/v1/classrooms/join',
      cookies: { pk_lms_session: mhsLogin.cookie },
      headers: { 'x-csrf-token': mhsLogin.csrf },
      payload: { code: privJoinCode },
    });
    expect(revokedJoin.statusCode).toBe(400);
    expect(revokedJoin.json().error.code).toBe('CODE_REVOKED');

    // 5. Real student learning progress calculation (published material + completion)
    const [mat1] = await db
      .insert(learningMaterials)
      .values({
        classroomId: pubClassId,
        authorId: dosen1Login.userId,
        title: 'Materi Wajib 1',
        content: 'Konten materi 1',
        status: 'PUBLISHED',
        isRequired: true,
      })
      .returning();
    await db.insert(learningMaterials).values({
      classroomId: pubClassId,
      authorId: dosen1Login.userId,
      title: 'Materi Wajib 2',
      content: 'Konten materi 2',
      status: 'PUBLISHED',
      isRequired: true,
    });
    await db.insert(materialProgress).values({
      materialId: mat1.id,
      studentId: mhsId,
      classroomId: pubClassId,
      progressPercent: 100,
      status: 'COMPLETED',
      completedAt: new Date(),
    });

    const mhsEnrolledAfter = await app.inject({
      method: 'GET',
      url: '/api/v1/classrooms?view=enrolled',
      cookies: { pk_lms_session: mhsLogin.cookie },
    });
    expect(mhsEnrolledAfter.statusCode).toBe(200);
    const enrolledPub = mhsEnrolledAfter
      .json()
      .data.find((c: any) => c.id === pubClassId);
    expect(enrolledPub).toBeTruthy();
    expect(enrolledPub.studentProgress.totalRequiredItems).toBe(2);
    expect(enrolledPub.studentProgress.completedItems).toBe(1);
    expect(enrolledPub.studentProgress.progressPercent).toBe(50);
    expect(enrolledPub.studentProgress.progressStatus).toBe('IN_PROGRESS');

    // Cleanup temporary classrooms & users
    await db.delete(classrooms).where(eq(classrooms.id, pubClassId));
    await db.delete(classrooms).where(eq(classrooms.id, privClassId));
    await db.delete(users).where(eq(users.id, dosen2Id));
    await db.delete(users).where(eq(users.id, mhsId));
  }, 60000);

  it('Phase 26: Role-Based Academic Dashboard Refactoring (SUPERADMIN, DOSEN, MAHASISWA, AUDITOR Read-Only, Preferences & RBAC Isolation)', async () => {
    const { db } = await import('../db/index.ts');
    const { users } = await import('../db/schema.ts');
    const { eq } = await import('drizzle-orm');

    const doLogin = async (email: string, password: string) => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { email, password },
      });
      expect(res.statusCode).toBe(200);
      return {
        cookie: res.cookies.find((c) => c.name === 'pk_lms_session')!.value,
        csrf: res.json().data.csrfToken as string,
        userId: res.json().data.user.id as string,
      };
    };

    const adminLogin = await doLogin('superadmin@poltek-kampar.ac.id', 'AdminPolkam#2026');
    const dosenLogin = await doLogin('fitriani.dosen@poltek-kampar.ac.id', 'DosenPolkam#2026');
    const mhsLogin = await doLogin('ahmad.mhs@student.poltek-kampar.ac.id', 'MhsPolkam#2026');

    const suffix = Date.now();
    const auditorEmail = `auditor.dash.${suffix}@poltek-kampar.ac.id`;
    const createAuditor = await app.inject({
      method: 'POST',
      url: '/api/v1/users',
      cookies: { pk_lms_session: adminLogin.cookie },
      headers: { 'x-csrf-token': adminLogin.csrf },
      payload: {
        fullName: 'Auditor Internal Polkam',
        email: auditorEmail,
        password: 'AuditorPolkam#2026',
        roleCode: 'AUDITOR',
        identityNumber: `AUD-${suffix}`,
        studyProgram: 'Satuan Pengawas Internal',
      },
    });
    expect(createAuditor.statusCode).toBe(201);
    const auditorId = createAuditor.json().data.id;
    const auditorLogin = await doLogin(auditorEmail, 'AuditorPolkam#2026');

    // 1. SUPERADMIN: /dashboards/me, /dashboards/superadmin, preferences persistence
    const adminMe = await app.inject({
      method: 'GET',
      url: '/api/v1/dashboards/me',
      cookies: { pk_lms_session: adminLogin.cookie },
    });
    expect(adminMe.statusCode).toBe(200);
    expect(adminMe.json().data.primaryRole).toBe('SUPERADMIN');
    expect(adminMe.json().data.profileSummary.email).toBe('superadmin@poltek-kampar.ac.id');

    const adminDash = await app.inject({
      method: 'GET',
      url: '/api/v1/dashboards/superadmin',
      cookies: { pk_lms_session: adminLogin.cookie },
    });
    expect(adminDash.statusCode).toBe(200);
    expect(adminDash.json().data.overview.totalUsers).toBeGreaterThan(0);
    expect(adminDash.json().data.classroomOverview).toBeTruthy();
    expect(adminDash.json().data.auditFeed.canViewAudit).toBe(true);

    const prefSave = await app.inject({
      method: 'PUT',
      url: '/api/v1/dashboards/preferences',
      cookies: { pk_lms_session: adminLogin.cookie },
      headers: { 'x-csrf-token': adminLogin.csrf },
      payload: {
        viewDensity: 'compact',
        hiddenWidgets: ['audit_feed'],
      },
    });
    expect(prefSave.statusCode).toBe(200);
    expect(prefSave.json().data.viewDensity).toBe('compact');

    // 2. DOSEN: /dashboards/me, /dashboards/lecturer, blocked from /superadmin & /auditor
    const dosenMe = await app.inject({
      method: 'GET',
      url: '/api/v1/dashboards/me',
      cookies: { pk_lms_session: dosenLogin.cookie },
    });
    expect(dosenMe.statusCode).toBe(200);
    expect(dosenMe.json().data.primaryRole).toBe('DOSEN');

    const dosenDash = await app.inject({
      method: 'GET',
      url: '/api/v1/dashboards/lecturer',
      cookies: { pk_lms_session: dosenLogin.cookie },
    });
    expect(dosenDash.statusCode).toBe(200);
    expect(dosenDash.json().data.overview).toBeTruthy();
    expect(Array.isArray(dosenDash.json().data.classrooms)).toBe(true);
    expect(dosenDash.json().data.studentMonitoring).toBeTruthy();

    const dosenForbiddenSuper = await app.inject({
      method: 'GET',
      url: '/api/v1/dashboards/superadmin',
      cookies: { pk_lms_session: dosenLogin.cookie },
    });
    expect(dosenForbiddenSuper.statusCode).toBe(403);

    // 3. MAHASISWA: /dashboards/me, /dashboards/student, blocked from /superadmin, /lecturer, /auditor
    const mhsMe = await app.inject({
      method: 'GET',
      url: '/api/v1/dashboards/me',
      cookies: { pk_lms_session: mhsLogin.cookie },
    });
    expect(mhsMe.statusCode).toBe(200);
    expect(mhsMe.json().data.primaryRole).toBe('MAHASISWA');

    const mhsDash = await app.inject({
      method: 'GET',
      url: '/api/v1/dashboards/student',
      cookies: { pk_lms_session: mhsLogin.cookie },
    });
    expect(mhsDash.statusCode).toBe(200);
    expect(mhsDash.json().data.overview).toBeTruthy();
    expect(Array.isArray(mhsDash.json().data.learningProgress)).toBe(true);
    expect(mhsDash.json().data.academicActivities).toBeTruthy();

    const mhsForbiddenLect = await app.inject({
      method: 'GET',
      url: '/api/v1/dashboards/lecturer',
      cookies: { pk_lms_session: mhsLogin.cookie },
    });
    expect(mhsForbiddenLect.statusCode).toBe(403);

    const mhsForbiddenAudit = await app.inject({
      method: 'GET',
      url: '/api/v1/dashboards/auditor',
      cookies: { pk_lms_session: mhsLogin.cookie },
    });
    expect(mhsForbiddenAudit.statusCode).toBe(403);

    // 4. AUDITOR: /dashboards/me, /dashboards/auditor, strictly READ-ONLY on mutations
    const audMe = await app.inject({
      method: 'GET',
      url: '/api/v1/dashboards/me',
      cookies: { pk_lms_session: auditorLogin.cookie },
    });
    expect(audMe.statusCode).toBe(200);
    expect(audMe.json().data.primaryRole).toBe('AUDITOR');

    const audDash = await app.inject({
      method: 'GET',
      url: '/api/v1/dashboards/auditor',
      cookies: { pk_lms_session: auditorLogin.cookie },
    });
    expect(audDash.statusCode).toBe(200);
    expect(audDash.json().data.readOnly).toBe(true);
    expect(audDash.json().data.overview.totalUsers).toBeGreaterThan(0);
    expect(Array.isArray(audDash.json().data.timeline)).toBe(true);

    // Auditor must be blocked from mutating preferences (strict read-only)
    const audMutatePref = await app.inject({
      method: 'PUT',
      url: '/api/v1/dashboards/preferences',
      cookies: { pk_lms_session: auditorLogin.cookie },
      headers: { 'x-csrf-token': auditorLogin.csrf },
      payload: { viewDensity: 'compact' },
    });
    expect(audMutatePref.statusCode).toBe(403);

    // 5. PeriodId validation (valid, invalid UUID -> 400, non-existent UUID -> 404)
    const activePeriodId = mhsMe.json().data.activePeriod?.id;
    if (activePeriodId) {
      const mhsValidPeriod = await app.inject({
        method: 'GET',
        url: `/api/v1/dashboards/student?periodId=${activePeriodId}`,
        cookies: { pk_lms_session: mhsLogin.cookie },
      });
      expect(mhsValidPeriod.statusCode).toBe(200);
      expect(mhsValidPeriod.json().data.profile).toBeTruthy();

      const dosenValidPeriod = await app.inject({
        method: 'GET',
        url: `/api/v1/dashboards/lecturer?periodId=${activePeriodId}`,
        cookies: { pk_lms_session: dosenLogin.cookie },
      });
      expect(dosenValidPeriod.statusCode).toBe(200);
      expect(dosenValidPeriod.json().data.profile).toBeTruthy();
    }

    const mhsInvalidPeriod = await app.inject({
      method: 'GET',
      url: '/api/v1/dashboards/student?periodId=invalid-uuid',
      cookies: { pk_lms_session: mhsLogin.cookie },
    });
    expect(mhsInvalidPeriod.statusCode).toBe(400);

    const dosenNotFoundPeriod = await app.inject({
      method: 'GET',
      url: '/api/v1/dashboards/lecturer?periodId=00000000-0000-4000-8000-000000000999',
      cookies: { pk_lms_session: dosenLogin.cookie },
    });
    expect(dosenNotFoundPeriod.statusCode).toBe(404);

    // 6. Student with 0 enrollments & Lecturer with 0 classrooms
    const emptyMhsEmail = `empty.mhs.${suffix}@student.poltek-kampar.ac.id`;
    const emptyDosenEmail = `empty.dosen.${suffix}@poltek-kampar.ac.id`;
    const createEmptyMhs = await app.inject({
      method: 'POST',
      url: '/api/v1/users',
      cookies: { pk_lms_session: adminLogin.cookie },
      headers: { 'x-csrf-token': adminLogin.csrf },
      payload: {
        fullName: 'Mahasiswa Kosong',
        email: emptyMhsEmail,
        password: 'MhsPolkam#2026',
        roleCode: 'MAHASISWA',
        identityNumber: `NIM-EMP-${suffix}`,
        studyProgram: 'Teknik Informatika',
      },
    });
    expect(createEmptyMhs.statusCode).toBe(201);
    const emptyMhsId = createEmptyMhs.json().data.id;
    const emptyMhsLogin = await doLogin(emptyMhsEmail, 'MhsPolkam#2026');
    const emptyMhsDash = await app.inject({
      method: 'GET',
      url: '/api/v1/dashboards/student',
      cookies: { pk_lms_session: emptyMhsLogin.cookie },
    });
    expect(emptyMhsDash.statusCode).toBe(200);
    expect(emptyMhsDash.json().data.enrolledCount).toBe(0);

    const createEmptyDosen = await app.inject({
      method: 'POST',
      url: '/api/v1/users',
      cookies: { pk_lms_session: adminLogin.cookie },
      headers: { 'x-csrf-token': adminLogin.csrf },
      payload: {
        fullName: 'Dosen Kosong',
        email: emptyDosenEmail,
        password: 'DosenPolkam#2026',
        roleCode: 'DOSEN',
        identityNumber: `NIDN-EMP-${suffix}`,
        studyProgram: 'Teknik Informatika',
      },
    });
    expect(createEmptyDosen.statusCode).toBe(201);
    const emptyDosenId = createEmptyDosen.json().data.id;
    const emptyDosenLogin = await doLogin(emptyDosenEmail, 'DosenPolkam#2026');
    const emptyDosenDash = await app.inject({
      method: 'GET',
      url: '/api/v1/dashboards/lecturer',
      cookies: { pk_lms_session: emptyDosenLogin.cookie },
    });
    expect(emptyDosenDash.statusCode).toBe(200);
    expect(emptyDosenDash.json().data.myClassroomsCount).toBe(0);

    // Cleanup temporary users
    await db.delete(users).where(eq(users.id, auditorId));
    await db.delete(users).where(eq(users.id, emptyMhsId));
    await db.delete(users).where(eq(users.id, emptyDosenId));
  }, 60000);

  it('Phase 27: Classroom Wizard Delegated Creation & Instructor Assignment (TEST 1–11)', async () => {
    const { db } = await import('../db/index.ts');
    const {
      users,
      classrooms,
      classroomInstructors,
      academicPeriods,
      auditLogs,
    } = await import('../db/schema.ts');
    const { eq, and, inArray } = await import('drizzle-orm');

    const doLogin = async (email: string, password: string) => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { email, password },
      });
      expect(res.statusCode).toBe(200);
      return {
        cookie: res.cookies.find((c) => c.name === 'pk_lms_session')!.value,
        csrf: res.json().data.csrfToken as string,
        userId: res.json().data.user.id as string,
      };
    };

    const adminLogin = await doLogin('superadmin@poltek-kampar.ac.id', 'AdminPolkam#2026');
    const dosen1Login = await doLogin('fitriani.dosen@poltek-kampar.ac.id', 'DosenPolkam#2026');
    const mhsLogin = await doLogin('ahmad.mhs@student.poltek-kampar.ac.id', 'MhsPolkam#2026');

    const suffix = Date.now();

    // Create a second active DOSEN (co-instructor), an inactive DOSEN, and an AUDITOR
    const coDosenEmail = `codosen.p27.${suffix}@poltek-kampar.ac.id`;
    const inactiveDosenEmail = `inactivedosen.p27.${suffix}@poltek-kampar.ac.id`;
    const auditorEmail = `auditor.p27.${suffix}@poltek-kampar.ac.id`;

    const createCoRes = await app.inject({
      method: 'POST',
      url: '/api/v1/users',
      cookies: { pk_lms_session: adminLogin.cookie },
      headers: { 'x-csrf-token': adminLogin.csrf },
      payload: {
        fullName: 'Dosen Pendamping P27',
        email: coDosenEmail,
        password: 'DosenPolkam#2026',
        roleCode: 'DOSEN',
        identityNumber: `NIDN-CO-${suffix}`,
        studyProgram: 'Teknik Informatika',
      },
    });
    expect(createCoRes.statusCode).toBe(201);
    const coDosenId = createCoRes.json().data.id as string;
    const coDosenLogin = await doLogin(coDosenEmail, 'DosenPolkam#2026');

    const createInactiveRes = await app.inject({
      method: 'POST',
      url: '/api/v1/users',
      cookies: { pk_lms_session: adminLogin.cookie },
      headers: { 'x-csrf-token': adminLogin.csrf },
      payload: {
        fullName: 'Dosen Nonaktif P27',
        email: inactiveDosenEmail,
        password: 'DosenPolkam#2026',
        roleCode: 'DOSEN',
        identityNumber: `NIDN-INA-${suffix}`,
        studyProgram: 'Teknik Informatika',
        isActive: false,
      },
    });
    expect(createInactiveRes.statusCode).toBe(201);
    const inactiveDosenId = createInactiveRes.json().data.id as string;
    await db
      .update(users)
      .set({ isActive: false, accountStatus: 'INACTIVE' })
      .where(eq(users.id, inactiveDosenId));

    const createAuditorRes = await app.inject({
      method: 'POST',
      url: '/api/v1/users',
      cookies: { pk_lms_session: adminLogin.cookie },
      headers: { 'x-csrf-token': adminLogin.csrf },
      payload: {
        fullName: 'Auditor P27',
        email: auditorEmail,
        password: 'AuditorPolkam#2026',
        roleCode: 'AUDITOR',
        identityNumber: `AUD-P27-${suffix}`,
      },
    });
    expect(createAuditorRes.statusCode).toBe(201);
    const auditorId = createAuditorRes.json().data.id as string;
    const auditorLogin = await doLogin(auditorEmail, 'AuditorPolkam#2026');

    // Fetch an existing academic period
    const [period] = await db.select().from(academicPeriods).limit(1);
    expect(period).toBeDefined();

    // TEST 8a: MAHASISWA cannot access eligible-instructors (403)
    const mhsEligibleRes = await app.inject({
      method: 'GET',
      url: '/api/v1/classrooms/eligible-instructors',
      cookies: { pk_lms_session: mhsLogin.cookie },
    });
    expect(mhsEligibleRes.statusCode).toBe(403);

    // SUPERADMIN & DOSEN can access eligible-instructors (200), inactive dosen excluded
    const adminEligibleRes = await app.inject({
      method: 'GET',
      url: '/api/v1/classrooms/eligible-instructors?status=ACTIVE&limit=100',
      cookies: { pk_lms_session: adminLogin.cookie },
    });
    expect(adminEligibleRes.statusCode).toBe(200);
    const eligibleIds = (adminEligibleRes.json().data as any[]).map((d) => d.id);
    expect(eligibleIds).toContain(dosen1Login.userId);
    expect(eligibleIds).toContain(coDosenId);
    expect(eligibleIds).not.toContain(inactiveDosenId);
    expect(eligibleIds).not.toContain(adminLogin.userId);

    const dosenEligibleRes = await app.inject({
      method: 'GET',
      url: '/api/v1/classrooms/eligible-instructors?status=ACTIVE&limit=100',
      cookies: { pk_lms_session: dosen1Login.cookie },
    });
    expect(dosenEligibleRes.statusCode).toBe(200);

    // TEST 1: DOSEN self-service creation -> primary automatically logged-in DOSEN
    const selfServiceRes = await app.inject({
      method: 'POST',
      url: '/api/v1/classrooms/builder',
      cookies: { pk_lms_session: dosen1Login.cookie },
      headers: { 'x-csrf-token': dosen1Login.csrf },
      payload: {
        name: `Self Service Class ${suffix}`,
        classroomCode: `PKM-SS-${suffix}`,
        subjectName: 'Rekayasa Perangkat Lunak',
        subjectCode: 'RPL-301',
        academicPeriodId: period.id,
        section: 'A',
        classroomType: 'REGULAR',
        visibility: 'PRIVATE',
        coInstructorIds: [coDosenId],
        lifecycleStatus: 'active',
      },
    });
    expect(selfServiceRes.statusCode).toBe(201);
    const selfClassId = selfServiceRes.json().data.id as string;

    const selfInstructors = await db
      .select()
      .from(classroomInstructors)
      .where(eq(classroomInstructors.classroomId, selfClassId));
    expect(
      selfInstructors.find((i) => i.isPrimary && i.instructorId === dosen1Login.userId)
    ).toBeDefined();
    expect(
      selfInstructors.find((i) => i.role === 'CO_INSTRUCTOR' && i.instructorId === coDosenId)
    ).toBeDefined();

    // TEST 10: DOSEN attempting to manipulate primaryInstructorId to another user -> 403
    const dosenManipRes = await app.inject({
      method: 'POST',
      url: '/api/v1/classrooms/builder',
      cookies: { pk_lms_session: dosen1Login.cookie },
      headers: { 'x-csrf-token': dosen1Login.csrf },
      payload: {
        name: `Manipulated Class ${suffix}`,
        classroomCode: `PKM-MANIP-${suffix}`,
        subjectName: 'Keamanan Informasi',
        academicPeriodId: period.id,
        primaryInstructorId: coDosenId,
      },
    });
    expect(dosenManipRes.statusCode).toBe(403);
    expect(dosenManipRes.json().error.code).toBe('FORBIDDEN_PRIMARY_ASSIGNMENT');

    // TEST 3: SUPERADMIN creating without primaryInstructorId -> 400
    const adminMissingPrimaryRes = await app.inject({
      method: 'POST',
      url: '/api/v1/classrooms/builder',
      cookies: { pk_lms_session: adminLogin.cookie },
      headers: { 'x-csrf-token': adminLogin.csrf },
      payload: {
        name: `Missing Primary ${suffix}`,
        classroomCode: `PKM-MP-${suffix}`,
        subjectName: 'Basis Data',
        academicPeriodId: period.id,
      },
    });
    expect(adminMissingPrimaryRes.statusCode).toBe(400);
    expect(adminMissingPrimaryRes.json().error.code).toBe('PRIMARY_INSTRUCTOR_REQUIRED');

    // TEST 4: Duplicate primary and co-instructor -> 400
    const adminDupRes = await app.inject({
      method: 'POST',
      url: '/api/v1/classrooms/builder',
      cookies: { pk_lms_session: adminLogin.cookie },
      headers: { 'x-csrf-token': adminLogin.csrf },
      payload: {
        name: `Duplicate Primary ${suffix}`,
        classroomCode: `PKM-DUP-${suffix}`,
        subjectName: 'Basis Data',
        academicPeriodId: period.id,
        primaryInstructorId: dosen1Login.userId,
        coInstructorIds: [dosen1Login.userId],
      },
    });
    expect(adminDupRes.statusCode).toBe(400);
    expect(adminDupRes.json().error.code).toBe('DUPLICATE_PRIMARY_INSTRUCTOR');

    // TEST 6: Assigning inactive DOSEN as primaryInstructorId -> 400
    const adminInactiveRes = await app.inject({
      method: 'POST',
      url: '/api/v1/classrooms/builder',
      cookies: { pk_lms_session: adminLogin.cookie },
      headers: { 'x-csrf-token': adminLogin.csrf },
      payload: {
        name: `Inactive Primary ${suffix}`,
        classroomCode: `PKM-INA-${suffix}`,
        subjectName: 'Basis Data',
        academicPeriodId: period.id,
        primaryInstructorId: inactiveDosenId,
      },
    });
    expect(adminInactiveRes.statusCode).toBe(400);
    expect(adminInactiveRes.json().error.code).toBe('INVALID_PRIMARY_INSTRUCTOR');

    // TEST 2: SUPERADMIN delegated creation -> Superadmin NOT in classroomInstructors, selected DOSEN is PRIMARY
    const delegatedRes = await app.inject({
      method: 'POST',
      url: '/api/v1/classrooms/builder',
      cookies: { pk_lms_session: adminLogin.cookie },
      headers: { 'x-csrf-token': adminLogin.csrf },
      payload: {
        name: `Delegated Class ${suffix}`,
        classroomCode: `PKM-DEL-${suffix}`,
        subjectName: 'Arsitektur Enterprise',
        subjectCode: 'AE-401',
        academicPeriodId: period.id,
        section: 'B',
        classroomType: 'REGULAR',
        visibility: 'PRIVATE',
        primaryInstructorId: dosen1Login.userId,
        coInstructorIds: [coDosenId],
        lifecycleStatus: 'active',
      },
    });
    expect(delegatedRes.statusCode).toBe(201);
    const delegatedClassId = delegatedRes.json().data.id as string;

    const [delegatedClassroom] = await db
      .select()
      .from(classrooms)
      .where(eq(classrooms.id, delegatedClassId));
    expect(delegatedClassroom.createdById).toBe(adminLogin.userId);

    const delInstructors = await db
      .select()
      .from(classroomInstructors)
      .where(eq(classroomInstructors.classroomId, delegatedClassId));
    expect(delInstructors.some((i) => i.instructorId === adminLogin.userId)).toBe(false);
    expect(
      delInstructors.find(
        (i) =>
          i.instructorId === dosen1Login.userId &&
          i.isPrimary === true &&
          i.role === 'PRIMARY_INSTRUCTOR'
      )
    ).toBeDefined();
    expect(
      delInstructors.find(
        (i) =>
          i.instructorId === coDosenId &&
          i.isPrimary === false &&
          i.role === 'CO_INSTRUCTOR'
      )
    ).toBeDefined();

    // TEST 7: Delegated classroom is visible to assigned Primary & Co-Instructor
    const primaryListRes = await app.inject({
      method: 'GET',
      url: `/api/v1/classrooms?search=Delegated%20Class%20${suffix}&limit=50`,
      cookies: { pk_lms_session: dosen1Login.cookie },
    });
    expect(primaryListRes.statusCode).toBe(200);
    expect((primaryListRes.json().data as any[]).some((c) => c.id === delegatedClassId)).toBe(
      true
    );

    const coListRes = await app.inject({
      method: 'GET',
      url: `/api/v1/classrooms?view=co_taught&search=Delegated%20Class%20${suffix}&limit=50`,
      cookies: { pk_lms_session: coDosenLogin.cookie },
    });
    expect(coListRes.statusCode).toBe(200);
    expect((coListRes.json().data as any[]).some((c) => c.id === delegatedClassId)).toBe(true);

    // TEST 5: Removing co-instructor preserves primary instructor
    await db
      .delete(classroomInstructors)
      .where(
        and(
          eq(classroomInstructors.classroomId, delegatedClassId),
          eq(classroomInstructors.instructorId, coDosenId)
        )
      );
    const remainingDelInstructors = await db
      .select()
      .from(classroomInstructors)
      .where(eq(classroomInstructors.classroomId, delegatedClassId));
    expect(remainingDelInstructors.length).toBe(1);
    expect(remainingDelInstructors[0].instructorId).toBe(dosen1Login.userId);
    expect(remainingDelInstructors[0].isPrimary).toBe(true);

    // TEST 8b & TEST 9: MAHASISWA & AUDITOR cannot create classroom (403)
    const mhsCreateRes = await app.inject({
      method: 'POST',
      url: '/api/v1/classrooms/builder',
      cookies: { pk_lms_session: mhsLogin.cookie },
      headers: { 'x-csrf-token': mhsLogin.csrf },
      payload: {
        name: `Mhs Forbidden ${suffix}`,
        classroomCode: `PKM-MHS-${suffix}`,
        subjectName: 'Forbidden',
        academicPeriodId: period.id,
      },
    });
    expect(mhsCreateRes.statusCode).toBe(403);

    const auditorCreateRes = await app.inject({
      method: 'POST',
      url: '/api/v1/classrooms/builder',
      cookies: { pk_lms_session: auditorLogin.cookie },
      headers: { 'x-csrf-token': auditorLogin.csrf },
      payload: {
        name: `Auditor Forbidden ${suffix}`,
        classroomCode: `PKM-AUD-${suffix}`,
        subjectName: 'Forbidden',
        academicPeriodId: period.id,
      },
    });
    expect(auditorCreateRes.statusCode).toBe(403);

    // TEST 11: Audit logs recorded for delegated & self-service creation
    const delLogs = await db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.entityId, delegatedClassId));
    const delActions = delLogs.map((l) => l.action);
    expect(delActions).toContain('CLASSROOM_CREATED_ON_BEHALF');
    expect(delActions).toContain('PRIMARY_INSTRUCTOR_ASSIGNED');
    expect(delActions).toContain('CO_INSTRUCTOR_ASSIGNED');
    expect(delActions).toContain('CLASSROOM_PUBLISHED');

    const selfLogs = await db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.entityId, selfClassId));
    expect(selfLogs.map((l) => l.action)).toContain('CLASSROOM_CREATED');

    // Cleanup test classrooms, logs, and temporary users
    await db
      .delete(auditLogs)
      .where(inArray(auditLogs.entityId, [selfClassId, delegatedClassId]));
    await db
      .delete(classrooms)
      .where(inArray(classrooms.id, [selfClassId, delegatedClassId]));
    await db
      .delete(users)
      .where(inArray(users.id, [coDosenId, inactiveDosenId, auditorId]));
  }, 60000);

  it('Phase 28: Account Switching / User Impersonation (Switch to Dosen/Mahasiswa, Stop, Inactive/Unauthorized/Nested Rejection, Expiry, Logout & Audit Logs)', async () => {
    const { db } = await import('../db/index.ts');
    const { users, impersonationSessions, auditLogs } = await import('../db/schema.ts');
    const { eq, and, inArray } = await import('drizzle-orm');

    const doLogin = async (email: string, password: string) => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { email, password },
      });
      expect(res.statusCode).toBe(200);
      return {
        cookie: res.cookies.find((c) => c.name === 'pk_lms_session')!.value,
        csrf: res.json().data.csrfToken as string,
        userId: res.json().data.user.id as string,
      };
    };

    const adminLogin = await doLogin('superadmin@poltek-kampar.ac.id', 'AdminPolkam#2026');
    const dosenLogin = await doLogin('fitriani.dosen@poltek-kampar.ac.id', 'DosenPolkam#2026');
    const mhsLogin = await doLogin('ahmad.mhs@student.poltek-kampar.ac.id', 'MhsPolkam#2026');

    const suffix = Date.now();
    const inactiveEmail = `inactive.p28.${suffix}@poltek-kampar.ac.id`;
    const auditorEmail = `auditor.p28.${suffix}@poltek-kampar.ac.id`;

    const createInactiveRes = await app.inject({
      method: 'POST',
      url: '/api/v1/users',
      cookies: { pk_lms_session: adminLogin.cookie },
      headers: { 'x-csrf-token': adminLogin.csrf },
      payload: {
        fullName: 'Inactive User P28',
        email: inactiveEmail,
        password: 'DosenPolkam#2026',
        roleCode: 'DOSEN',
        identityNumber: `NIDN-P28-${suffix}`,
        studyProgram: 'Teknik Informatika',
      },
    });
    expect(createInactiveRes.statusCode).toBe(201);
    const inactiveId = createInactiveRes.json().data.id as string;
    await db
      .update(users)
      .set({ isActive: false, accountStatus: 'INACTIVE' })
      .where(eq(users.id, inactiveId));

    const createAuditorRes = await app.inject({
      method: 'POST',
      url: '/api/v1/users',
      cookies: { pk_lms_session: adminLogin.cookie },
      headers: { 'x-csrf-token': adminLogin.csrf },
      payload: {
        fullName: 'Auditor P28',
        email: auditorEmail,
        password: 'AuditorPolkam#2026',
        roleCode: 'AUDITOR',
        identityNumber: `AUD-P28-${suffix}`,
      },
    });
    expect(createAuditorRes.statusCode).toBe(201);
    const auditorId = createAuditorRes.json().data.id as string;

    // 5. Unauthorized users (DOSEN, MAHASISWA) rejected with 403
    const dosenStartRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/impersonation/start',
      cookies: { pk_lms_session: dosenLogin.cookie },
      headers: { 'x-csrf-token': dosenLogin.csrf },
      payload: { targetUserId: mhsLogin.userId },
    });
    expect(dosenStartRes.statusCode).toBe(403);

    const mhsStartRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/impersonation/start',
      cookies: { pk_lms_session: mhsLogin.cookie },
      headers: { 'x-csrf-token': mhsLogin.csrf },
      payload: { targetUserId: dosenLogin.userId },
    });
    expect(mhsStartRes.statusCode).toBe(403);

    // 4. Inactive user rejected with 400 TARGET_USER_INACTIVE
    const inactiveStartRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/impersonation/start',
      cookies: { pk_lms_session: adminLogin.cookie },
      headers: { 'x-csrf-token': adminLogin.csrf },
      payload: { targetUserId: inactiveId, reason: 'Test inactive' },
    });
    expect(inactiveStartRes.statusCode).toBe(400);
    expect(inactiveStartRes.json().error.code).toBe('TARGET_USER_INACTIVE');

    // Cannot impersonate self
    const selfStartRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/impersonation/start',
      cookies: { pk_lms_session: adminLogin.cookie },
      headers: { 'x-csrf-token': adminLogin.csrf },
      payload: { targetUserId: adminLogin.userId },
    });
    expect(selfStartRes.statusCode).toBe(400);
    expect(selfStartRes.json().error.code).toBe('CANNOT_IMPERSONATE_SELF');

    // 1. Superadmin switches to DOSEN
    const startDosenRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/impersonation/start',
      cookies: { pk_lms_session: adminLogin.cookie },
      headers: { 'x-csrf-token': adminLogin.csrf },
      payload: { targetUserId: dosenLogin.userId, reason: 'Troubleshooting kelas dosen' },
    });
    expect(startDosenRes.statusCode).toBe(200);
    expect(startDosenRes.json().data.user.id).toBe(dosenLogin.userId);
    expect(startDosenRes.json().data.impersonation.isImpersonating).toBe(true);
    expect(startDosenRes.json().data.impersonation.originalUserId).toBe(adminLogin.userId);
    const dosenImpSessionId = startDosenRes.json().data.impersonation.impersonationSessionId as string;

    // 7 & 8. Refresh (/auth/me & /impersonation/status) and navigate across pages while impersonating DOSEN
    const meDuringDosen = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      cookies: { pk_lms_session: adminLogin.cookie },
    });
    expect(meDuringDosen.statusCode).toBe(200);
    expect(meDuringDosen.json().data.user.id).toBe(dosenLogin.userId);
    expect(meDuringDosen.json().data.impersonation.isImpersonating).toBe(true);

    const statusDuringDosen = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/impersonation/status',
      cookies: { pk_lms_session: adminLogin.cookie },
    });
    expect(statusDuringDosen.statusCode).toBe(200);
    expect(statusDuringDosen.json().data.isImpersonating).toBe(true);

    const lecturerDashDuringImp = await app.inject({
      method: 'GET',
      url: '/api/v1/dashboards/lecturer',
      cookies: { pk_lms_session: adminLogin.cookie },
    });
    expect(lecturerDashDuringImp.statusCode).toBe(200);

    // 11. No permission leakage: while impersonating DOSEN, cannot perform admin user management (403)
    const usersDuringDosenImp = await app.inject({
      method: 'POST',
      url: '/api/v1/users',
      cookies: { pk_lms_session: adminLogin.cookie },
      headers: { 'x-csrf-token': adminLogin.csrf },
      payload: {
        fullName: 'Leak Test',
        email: `leak.${suffix}@poltek-kampar.ac.id`,
        password: 'LeakTest#2026',
        roleCode: 'MAHASISWA',
      },
    });
    expect(usersDuringDosenImp.statusCode).toBe(403);

    // Cannot change password during impersonation (403 FORBIDDEN_DURING_IMPERSONATION)
    const changePwDuringImp = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/change-password',
      cookies: { pk_lms_session: adminLogin.cookie },
      headers: { 'x-csrf-token': adminLogin.csrf },
      payload: {
        currentPassword: 'DosenPolkam#2026',
        newPassword: 'NewDosenPass#2026',
        confirmPassword: 'NewDosenPass#2026',
      },
    });
    expect(changePwDuringImp.statusCode).toBe(403);
    expect(changePwDuringImp.json().error.code).toBe('FORBIDDEN_DURING_IMPERSONATION');

    // 12. Nested impersonation blocked (403)
    const nestedRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/impersonation/start',
      cookies: { pk_lms_session: adminLogin.cookie },
      headers: { 'x-csrf-token': adminLogin.csrf },
      payload: { targetUserId: mhsLogin.userId },
    });
    expect(nestedRes.statusCode).toBe(403);

    // 3. Return to original Superadmin account
    const stopDosenRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/impersonation/stop',
      cookies: { pk_lms_session: adminLogin.cookie },
      headers: { 'x-csrf-token': adminLogin.csrf },
      payload: {},
    });
    expect(stopDosenRes.statusCode).toBe(200);
    expect(stopDosenRes.json().data.user.id).toBe(adminLogin.userId);
    expect(stopDosenRes.json().data.impersonation).toBeNull();

    // Superadmin permissions restored
    const usersAfterStop = await app.inject({
      method: 'GET',
      url: '/api/v1/users?limit=5',
      cookies: { pk_lms_session: adminLogin.cookie },
    });
    expect(usersAfterStop.statusCode).toBe(200);

    // 2. Superadmin switches to MAHASISWA
    const startMhsRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/impersonation/start',
      cookies: { pk_lms_session: adminLogin.cookie },
      headers: { 'x-csrf-token': adminLogin.csrf },
      payload: { targetUserId: mhsLogin.userId, reason: 'Cek dashboard mahasiswa' },
    });
    expect(startMhsRes.statusCode).toBe(200);
    expect(startMhsRes.json().data.user.id).toBe(mhsLogin.userId);
    const mhsImpSessionId = startMhsRes.json().data.impersonation.impersonationSessionId as string;

    const studentDashDuringImp = await app.inject({
      method: 'GET',
      url: '/api/v1/dashboards/student',
      cookies: { pk_lms_session: adminLogin.cookie },
    });
    expect(studentDashDuringImp.statusCode).toBe(200);

    // 6. Session expired -> auto-restores original Superadmin and logs USER_IMPERSONATION_EXPIRED
    await db
      .update(impersonationSessions)
      .set({ expiresAt: new Date(Date.now() - 60_000) })
      .where(eq(impersonationSessions.id, mhsImpSessionId));

    const meAfterExpiry = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      cookies: { pk_lms_session: adminLogin.cookie },
    });
    expect(meAfterExpiry.statusCode).toBe(200);
    expect(meAfterExpiry.json().data.user.id).toBe(adminLogin.userId);
    expect(meAfterExpiry.json().data.impersonation).toBeNull();

    // Superadmin can impersonate AUDITOR and still stop impersonation (even though AUDITOR is read-only)
    const startAuditorRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/impersonation/start',
      cookies: { pk_lms_session: adminLogin.cookie },
      headers: { 'x-csrf-token': adminLogin.csrf },
      payload: { targetUserId: auditorId, reason: 'Verifikasi tampilan auditor' },
    });
    expect(startAuditorRes.statusCode).toBe(200);
    const stopAuditorRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/impersonation/stop',
      cookies: { pk_lms_session: adminLogin.cookie },
      headers: { 'x-csrf-token': adminLogin.csrf },
      payload: {},
    });
    expect(stopAuditorRes.statusCode).toBe(200);
    expect(stopAuditorRes.json().data.user.id).toBe(adminLogin.userId);

    // 9. Logout during active impersonation ends both impersonation and user session
    const adminLogin2 = await doLogin('superadmin@poltek-kampar.ac.id', 'AdminPolkam#2026');
    const startBeforeLogout = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/impersonation/start',
      cookies: { pk_lms_session: adminLogin2.cookie },
      headers: { 'x-csrf-token': adminLogin2.csrf },
      payload: { targetUserId: dosenLogin.userId },
    });
    expect(startBeforeLogout.statusCode).toBe(200);
    const logoutImpId = startBeforeLogout.json().data.impersonation.impersonationSessionId as string;

    const logoutRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/logout',
      cookies: { pk_lms_session: adminLogin2.cookie },
      headers: { 'x-csrf-token': adminLogin2.csrf },
    });
    expect(logoutRes.statusCode).toBe(200);

    const [endedImpRow] = await db
      .select()
      .from(impersonationSessions)
      .where(eq(impersonationSessions.id, logoutImpId));
    expect(endedImpRow.isActive).toBe(false);
    expect(endedImpRow.endReason).toBe('LOGOUT');

    const meAfterLogout = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      cookies: { pk_lms_session: adminLogin2.cookie },
    });
    expect(meAfterLogout.statusCode).toBe(401);

    // 10. Verify all 4 audit log actions exist
    const impAuditRows = await db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.entityType, 'USER_IMPERSONATION'));
    const impActions = impAuditRows.map((r) => r.action);
    expect(impActions).toContain('USER_IMPERSONATION_STARTED');
    expect(impActions).toContain('USER_IMPERSONATION_ENDED');
    expect(impActions).toContain('USER_IMPERSONATION_EXPIRED');
    expect(impActions).toContain('USER_IMPERSONATION_FAILED');

    // Cleanup temporary test records
    await db
      .delete(impersonationSessions)
      .where(inArray(impersonationSessions.id, [dosenImpSessionId, mhsImpSessionId, logoutImpId]));
    await db.delete(users).where(inArray(users.id, [inactiveId, auditorId]));
  }, 60000);

  it('Phase 29: Complete Auditor Read-Only Enforcement (Granular auditor.*.view Permissions, Material/Classwork/Assignment/Grade/RBAC/Config Mutation Blocking & Impersonated Auditor Guard)', async () => {
    const { db } = await import('../db/index.ts');
    const { users, learningMaterials, roles, impersonationSessions } = await import('../db/schema.ts');
    const { eq, inArray } = await import('drizzle-orm');

    const doLogin = async (email: string, password: string) => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { email, password },
      });
      expect(res.statusCode).toBe(200);
      return {
        cookie: res.cookies.find((c) => c.name === 'pk_lms_session')!.value,
        csrf: res.json().data.csrfToken as string,
        userId: res.json().data.user.id as string,
        permissions: res.json().data.user.permissions as string[],
      };
    };

    const adminLogin = await doLogin('superadmin@poltek-kampar.ac.id', 'AdminPolkam#2026');
    const suffix = Date.now();
    const auditorEmail = `auditor.p29.${suffix}@poltek-kampar.ac.id`;

    const createAuditorRes = await app.inject({
      method: 'POST',
      url: '/api/v1/users',
      cookies: { pk_lms_session: adminLogin.cookie },
      headers: { 'x-csrf-token': adminLogin.csrf },
      payload: {
        fullName: 'Auditor P29',
        email: auditorEmail,
        password: 'AuditorPolkam#2026',
        roleCode: 'AUDITOR',
        identityNumber: `AUD-P29-${suffix}`,
      },
    });
    expect(createAuditorRes.statusCode).toBe(201);
    const auditorId = createAuditorRes.json().data.id as string;
    const auditorLogin = await doLogin(auditorEmail, 'AuditorPolkam#2026');

    // Verify all 10 auditor.*.view permissions are granted
    const expectedAuditorPerms = [
      'auditor.dashboard.view',
      'auditor.academic.view',
      'auditor.classrooms.view',
      'auditor.classwork.view',
      'auditor.assignments.view',
      'auditor.assessments.view',
      'auditor.grades.view',
      'auditor.users.view',
      'auditor.audit_logs.view',
      'auditor.reports.view',
    ];
    for (const perm of expectedAuditorPerms) {
      expect(auditorLogin.permissions).toContain(perm);
    }

    // Read operations allowed (200)
    const [sampleMaterial] = await db
      .select()
      .from(learningMaterials)
      .where(eq(learningMaterials.status, 'PUBLISHED'))
      .limit(1);
    expect(sampleMaterial).toBeDefined();

    const readChecks = await Promise.all([
      app.inject({
        method: 'GET',
        url: '/api/v1/dashboards/auditor',
        cookies: { pk_lms_session: auditorLogin.cookie },
      }),
      app.inject({
        method: 'GET',
        url: '/api/v1/academic-periods',
        cookies: { pk_lms_session: auditorLogin.cookie },
      }),
      app.inject({
        method: 'GET',
        url: '/api/v1/classrooms',
        cookies: { pk_lms_session: auditorLogin.cookie },
      }),
      app.inject({
        method: 'GET',
        url: `/api/v1/materials/${sampleMaterial.id}`,
        cookies: { pk_lms_session: auditorLogin.cookie },
      }),
      app.inject({
        method: 'GET',
        url: '/api/v1/users?limit=5',
        cookies: { pk_lms_session: auditorLogin.cookie },
      }),
      app.inject({
        method: 'GET',
        url: '/api/v1/audit-logs?limit=5',
        cookies: { pk_lms_session: auditorLogin.cookie },
      }),
    ]);
    for (const r of readChecks) {
      expect(r.statusCode).toBe(200);
    }

    const [auditorRoleRow] = await db.select().from(roles).where(eq(roles.code, 'AUDITOR')).limit(1);

    // All mutation attempts rejected with 403 FORBIDDEN_AUDITOR_READ_ONLY
    const mutationRequests = [
      { method: 'POST' as const, url: `/api/v1/materials/${sampleMaterial.id}/completion`, payload: { completed: true } },
      { method: 'POST' as const, url: `/api/v1/materials/${sampleMaterial.id}/bookmark`, payload: {} },
      { method: 'PUT' as const, url: `/api/v1/materials/${sampleMaterial.id}/note`, payload: { content: 'test' } },
      { method: 'PATCH' as const, url: `/api/v1/materials/${sampleMaterial.id}/progress`, payload: { progressPercent: 100 } },
      { method: 'POST' as const, url: `/api/v1/materials/${sampleMaterial.id}/view`, payload: {} },
      { method: 'PATCH' as const, url: `/api/v1/materials/${sampleMaterial.id}`, payload: { title: 'Hacked' } },
      { method: 'DELETE' as const, url: `/api/v1/materials/${sampleMaterial.id}` },
      { method: 'POST' as const, url: `/api/v1/classrooms/${sampleMaterial.classroomId}/assignments`, payload: { title: 'Hacked' } },
      { method: 'POST' as const, url: '/api/v1/classrooms/builder', payload: { name: 'Hacked' } },
      { method: 'POST' as const, url: '/api/v1/rbac/roles/permissions', payload: { roleId: auditorRoleRow.id, permissionKey: 'auditor.dashboard.view', granted: false } },
      { method: 'POST' as const, url: '/api/v1/admin/academic-periods', payload: { code: 'HACK' } },
      { method: 'POST' as const, url: '/api/v1/users', payload: { fullName: 'Hacked' } },
    ];

    for (const reqSpec of mutationRequests) {
      const res = await app.inject({
        method: reqSpec.method,
        url: reqSpec.url,
        cookies: { pk_lms_session: auditorLogin.cookie },
        headers: { 'x-csrf-token': auditorLogin.csrf },
        payload: reqSpec.payload,
      });
      expect(res.statusCode).toBe(403);
      expect(res.json().error.code).toBe('FORBIDDEN_AUDITOR_READ_ONLY');
    }

    // Impersonated Auditor still enforces strict read-only, while stop impersonation remains allowed
    const startImpRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/impersonation/start',
      cookies: { pk_lms_session: adminLogin.cookie },
      headers: { 'x-csrf-token': adminLogin.csrf },
      payload: { targetUserId: auditorId },
    });
    expect(startImpRes.statusCode).toBe(200);
    const impId = startImpRes.json().data.impersonation.impersonationSessionId as string;

    const impMutRes = await app.inject({
      method: 'POST',
      url: `/api/v1/materials/${sampleMaterial.id}/completion`,
      cookies: { pk_lms_session: adminLogin.cookie },
      headers: { 'x-csrf-token': adminLogin.csrf },
      payload: { completed: true },
    });
    expect(impMutRes.statusCode).toBe(403);
    expect(impMutRes.json().error.code).toBe('FORBIDDEN_AUDITOR_READ_ONLY');

    const stopImpRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/impersonation/stop',
      cookies: { pk_lms_session: adminLogin.cookie },
      headers: { 'x-csrf-token': adminLogin.csrf },
      payload: {},
    });
    expect(stopImpRes.statusCode).toBe(200);

    // Cleanup
    await db.delete(impersonationSessions).where(eq(impersonationSessions.id, impId));
    await db.delete(users).where(inArray(users.id, [auditorId]));
  }, 60000);

  it('Phase 30: System Settings, Institutional Branding, SVG Sanitization, SEO, Academic Theme Presets & Superadmin RBAC', async () => {
    const { db } = await import('../db/index.ts');
    const { users } = await import('../db/schema.ts');
    const { eq } = await import('drizzle-orm');

    const doLogin = async (email: string, password: string) => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { email, password },
      });
      expect(res.statusCode).toBe(200);
      return {
        cookie: res.cookies.find((c) => c.name === 'pk_lms_session')!.value,
        csrf: res.json().data.csrfToken as string,
        userId: res.json().data.user.id as string,
      };
    };

    const adminLogin = await doLogin(
      'superadmin@poltek-kampar.ac.id',
      'AdminPolkam#2026'
    );
    const dosenLogin = await doLogin(
      'fitriani.dosen@poltek-kampar.ac.id',
      'DosenPolkam#2026'
    );
    const mhsLogin = await doLogin(
      'ahmad.mhs@student.poltek-kampar.ac.id',
      'MhsPolkam#2026'
    );

    // Create temporary Auditor user via API for RBAC check
    const suffix = Date.now();
    const auditorEmail = `auditor.sysset.${suffix}@poltek-kampar.ac.id`;
    const createAuditorRes = await app.inject({
      method: 'POST',
      url: '/api/v1/users',
      cookies: { pk_lms_session: adminLogin.cookie },
      headers: { 'x-csrf-token': adminLogin.csrf },
      payload: {
        fullName: 'Auditor System Settings Test',
        email: auditorEmail,
        password: 'AuditorPass#2026',
        roleCode: 'AUDITOR',
        identityNumber: `AUD-P30-${suffix}`,
      },
    });
    expect(createAuditorRes.statusCode).toBe(201);
    const auditorUserId = createAuditorRes.json().data.id as string;
    const auditorLogin = await doLogin(auditorEmail, 'AuditorPass#2026');

    try {
      // 1. RBAC Isolation: Dosen, Mahasiswa, Auditor cannot access /api/v1/admin/system-settings
      for (const actor of [dosenLogin, mhsLogin, auditorLogin]) {
        const denyGet = await app.inject({
          method: 'GET',
          url: '/api/v1/admin/system-settings',
          cookies: { pk_lms_session: actor.cookie },
        });
        expect(denyGet.statusCode).toBe(403);

        const denyTheme = await app.inject({
          method: 'PUT',
          url: '/api/v1/admin/system-settings/theme',
          cookies: { pk_lms_session: actor.cookie },
          headers: { 'x-csrf-token': actor.csrf },
          payload: { presetKey: 'academic_teal' },
        });
        expect(denyTheme.statusCode).toBe(403);
      }

      // 2. Superadmin can read full system settings & system info (without DB credentials)
      const adminGet = await app.inject({
        method: 'GET',
        url: '/api/v1/admin/system-settings',
        cookies: { pk_lms_session: adminLogin.cookie },
      });
      expect(adminGet.statusCode).toBe(200);
      const adminPayload = adminGet.json().data;
      expect(adminPayload.presets.length).toBe(6);
      expect(adminPayload.systemInfo.databaseStatus).toBe('CONNECTED');
      expect(JSON.stringify(adminPayload.systemInfo)).not.toContain('SQL_ADMIN_PASSWORD');

      // 3. Institutional Identity Update, EduCoreLMS Immutability & Persistence
      const origIdentity = adminPayload.config.identity;
      const updatedIdentity = {
        ...origIdentity,
        institutionName: 'Politeknik Kampar — Teruji',
        applicationBrand: 'AttemptedOverride',
      };
      const idRes = await app.inject({
        method: 'PUT',
        url: '/api/v1/admin/system-settings/identity',
        cookies: { pk_lms_session: adminLogin.cookie },
        headers: { 'x-csrf-token': adminLogin.csrf },
        payload: updatedIdentity,
      });
      expect(idRes.statusCode).toBe(200);
      expect(idRes.json().data.identity.institutionName).toBe('Politeknik Kampar — Teruji');
      expect(idRes.json().data.identity.applicationBrand).toBe('EduCoreLMS');

      // Public /api/v1/app/config reflects identity, no-store cache, and brandingUpdatedAt
      const pubCfg1 = await app.inject({ method: 'GET', url: '/api/v1/app/config' });
      expect(pubCfg1.statusCode).toBe(200);
      expect(pubCfg1.headers['cache-control']).toBe('no-store, no-cache, must-revalidate');
      expect(pubCfg1.json().data.identity.institutionName).toBe('Politeknik Kampar — Teruji');
      expect(pubCfg1.json().data.identity.applicationBrand).toBe('EduCoreLMS');
      expect(pubCfg1.json().data.brandingUpdatedAt).toBeTruthy();

      // All 4 roles receive identical global branding & theme configuration
      for (const actor of [adminLogin, dosenLogin, mhsLogin, auditorLogin]) {
        const roleCfg = await app.inject({
          method: 'GET',
          url: '/api/v1/app/config',
          cookies: { pk_lms_session: actor.cookie },
        });
        expect(roleCfg.statusCode).toBe(200);
        expect(roleCfg.json().data.identity.applicationBrand).toBe('EduCoreLMS');
        expect(roleCfg.json().data.identity.institutionName).toBe('Politeknik Kampar — Teruji');
      }

      // 4. Logo Upload (Sharp PNG optimization + SVG Sanitization)
      const sharp = (await import('sharp')).default;
      const pngLogoBuf = await sharp({
        create: { width: 320, height: 120, channels: 4, background: { r: 20, g: 33, b: 61, alpha: 1 } },
      })
        .png()
        .toBuffer();

      const boundary = '----EduCoreTestBoundary';
      const buildMultipart = (filename: string, contentType: string, content: Buffer) =>
        Buffer.concat([
          Buffer.from(
            `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${contentType}\r\n\r\n`
          ),
          content,
          Buffer.from(`\r\n--${boundary}--\r\n`),
        ]);

      const logoUploadRes = await app.inject({
        method: 'POST',
        url: '/api/v1/admin/system-settings/branding/upload?assetKind=applicationLogo',
        cookies: { pk_lms_session: adminLogin.cookie },
        headers: {
          'x-csrf-token': adminLogin.csrf,
          'content-type': `multipart/form-data; boundary=${boundary}`,
        },
        payload: buildMultipart('logo.png', 'image/png', pngLogoBuf),
      });
      expect(logoUploadRes.statusCode).toBe(200);
      const uploadedLogoUrl: string = logoUploadRes.json().data.asset.url;
      expect(uploadedLogoUrl).toContain('/api/v1/storage/branding/');
      expect(logoUploadRes.json().data.asset.variants.sm).toBeTruthy();

      // Fetch served branding file
      const logoFileRes = await app.inject({
        method: 'GET',
        url: uploadedLogoUrl.split('?')[0],
      });
      expect(logoFileRes.statusCode).toBe(200);
      expect(logoFileRes.headers['content-type']).toBe('image/webp');

      // SVG Upload with <script> tag must be sanitized
      const dirtySvg = Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><script>alert(1)</script><circle cx="16" cy="16" r="12" onclick="evil()" fill="#1d4ed8"/></svg>'
      );
      const svgUploadRes = await app.inject({
        method: 'POST',
        url: '/api/v1/admin/system-settings/branding/upload?assetKind=faviconSvg',
        cookies: { pk_lms_session: adminLogin.cookie },
        headers: {
          'x-csrf-token': adminLogin.csrf,
          'content-type': `multipart/form-data; boundary=${boundary}`,
        },
        payload: buildMultipart('favicon.svg', 'image/svg+xml', dirtySvg),
      });
      expect(svgUploadRes.statusCode).toBe(200);
      const favSvgUrl: string = svgUploadRes.json().data.asset.url;
      const favFileRes = await app.inject({
        method: 'GET',
        url: favSvgUrl.split('?')[0],
      });
      expect(favFileRes.statusCode).toBe(200);
      expect(favFileRes.body).not.toContain('<script>');
      expect(favFileRes.body).not.toContain('onclick');

      // Manifest reflects updated cache-busted favicon
      const manifestRes = await app.inject({
        method: 'GET',
        url: '/api/v1/app/manifest.webmanifest',
      });
      expect(manifestRes.statusCode).toBe(200);
      expect(JSON.stringify(manifestRes.json().icons)).toContain(favSvgUrl);

      // 5. SEO Metadata Update
      const seoRes = await app.inject({
        method: 'PUT',
        url: '/api/v1/admin/system-settings/seo',
        cookies: { pk_lms_session: adminLogin.cookie },
        headers: { 'x-csrf-token': adminLogin.csrf },
        payload: {
          ...adminPayload.config.seo,
          defaultPageTitle: 'EduCoreLMS — Portal Akademik Terpadu',
          robotsPolicy: 'noindex, nofollow',
        },
      });
      expect(seoRes.statusCode).toBe(200);
      expect(seoRes.json().data.seo.defaultPageTitle).toBe(
        'EduCoreLMS — Portal Akademik Terpadu'
      );

      // 6. Fixed Preset Policy & Theme Persistence
      const customReject = await app.inject({
        method: 'PUT',
        url: '/api/v1/admin/system-settings/theme',
        cookies: { pk_lms_session: adminLogin.cookie },
        headers: { 'x-csrf-token': adminLogin.csrf },
        payload: { presetKey: 'academic_modern', customTokens: { primaryColor: '#ff00ff' } },
      });
      expect(customReject.statusCode).toBe(400);
      expect(customReject.json().error.code).toBe('CUSTOM_THEME_FORBIDDEN');

      const invalidPreset = await app.inject({
        method: 'PUT',
        url: '/api/v1/admin/system-settings/theme',
        cookies: { pk_lms_session: adminLogin.cookie },
        headers: { 'x-csrf-token': adminLogin.csrf },
        payload: { presetKey: 'arbitrary_neon_hack' },
      });
      expect(invalidPreset.statusCode).toBe(400);
      expect(invalidPreset.json().error.code).toBe('INVALID_THEME_PRESET');

      for (const presetKey of ['academic_classic', 'academic_teal', 'academic_indigo']) {
        const themeRes = await app.inject({
          method: 'PUT',
          url: '/api/v1/admin/system-settings/theme',
          cookies: { pk_lms_session: adminLogin.cookie },
          headers: { 'x-csrf-token': adminLogin.csrf },
          payload: { presetKey },
        });
        expect(themeRes.statusCode).toBe(200);
        expect(themeRes.json().data.theme.presetKey).toBe(presetKey);

        // Fresh unauthenticated config fetch (simulates refresh / new browser)
        const cfgCheck = await app.inject({ method: 'GET', url: '/api/v1/app/config' });
        expect(cfgCheck.json().data.theme.presetKey).toBe(presetKey);
      }

      // Reset theme back to academic_modern & restore original identity
      const resetRes = await app.inject({
        method: 'POST',
        url: '/api/v1/admin/system-settings/theme/reset',
        cookies: { pk_lms_session: adminLogin.cookie },
        headers: { 'x-csrf-token': adminLogin.csrf },
        payload: {},
      });
      expect(resetRes.statusCode).toBe(200);
      expect(resetRes.json().data.theme.presetKey).toBe('academic_modern');

      await app.inject({
        method: 'PUT',
        url: '/api/v1/admin/system-settings/identity',
        cookies: { pk_lms_session: adminLogin.cookie },
        headers: { 'x-csrf-token': adminLogin.csrf },
        payload: origIdentity,
      });

      // 7. Audit logs & settings history recorded
      const finalAdminGet = await app.inject({
        method: 'GET',
        url: '/api/v1/admin/system-settings',
        cookies: { pk_lms_session: adminLogin.cookie },
      });
      expect(finalAdminGet.json().data.history.length).toBeGreaterThan(0);
    } finally {
      await db.delete(users).where(eq(users.id, auditorUserId));
    }
  }, 60000);

  it('Phase 31: EduCoreLMS Knowledge Center — Role-Based Documentation, Search, Superadmin CMS, Versioning & Auditor Read-Only', async () => {
    const { db } = await import('../db');
    const {
      users,
      knowledgeArticles,
    } = await import('../db/schema');
    const { eq } = await import('drizzle-orm');

    const doLogin = async (email: string, password: string) => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { email, password },
      });
      expect(res.statusCode).toBe(200);
      return {
        cookie: res.cookies.find((c) => c.name === 'pk_lms_session')!.value,
        csrf: res.json().data.csrfToken as string,
      };
    };

    const adminLogin = await doLogin('superadmin@poltek-kampar.ac.id', 'AdminPolkam#2026');
    const dosenLogin = await doLogin('fitriani.dosen@poltek-kampar.ac.id', 'DosenPolkam#2026');
    const mhsLogin = await doLogin('ahmad.mhs@student.poltek-kampar.ac.id', 'MhsPolkam#2026');

    const suffix = Date.now();
    const auditorEmail = `auditor-kc-${suffix}@poltek-kampar.ac.id`;
    const createAuditorRes = await app.inject({
      method: 'POST',
      url: '/api/v1/users',
      cookies: { pk_lms_session: adminLogin.cookie },
      headers: { 'x-csrf-token': adminLogin.csrf },
      payload: {
        fullName: 'Auditor Knowledge Center Test',
        email: auditorEmail,
        password: 'AuditorPass#2026',
        roleCode: 'AUDITOR',
        identityNumber: `AUD-P31-${suffix}`,
      },
    });
    expect(createAuditorRes.statusCode).toBe(201);
    const auditorUserId = createAuditorRes.json().data.id as string;

    let createdArticleId: string | null = null;

    try {
      const auditorLogin = await doLogin(auditorEmail, 'AuditorPass#2026');

      // 1. All 4 roles can open Knowledge Center overview & receive role-filtered categories/articles
      const [adminOv, dosenOv, mhsOv, auditorOv] = await Promise.all([
        app.inject({
          method: 'GET',
          url: '/api/v1/knowledge/overview',
          cookies: { pk_lms_session: adminLogin.cookie },
        }),
        app.inject({
          method: 'GET',
          url: '/api/v1/knowledge/overview',
          cookies: { pk_lms_session: dosenLogin.cookie },
        }),
        app.inject({
          method: 'GET',
          url: '/api/v1/knowledge/overview',
          cookies: { pk_lms_session: mhsLogin.cookie },
        }),
        app.inject({
          method: 'GET',
          url: '/api/v1/knowledge/overview',
          cookies: { pk_lms_session: auditorLogin.cookie },
        }),
      ]);

      expect(adminOv.statusCode).toBe(200);
      expect(adminOv.json().data.canManage).toBe(true);
      expect(adminOv.json().data.totalArticles).toBeGreaterThanOrEqual(20);

      expect(dosenOv.statusCode).toBe(200);
      expect(dosenOv.json().data.canManage).toBe(false);
      const dosenCatSlugs = dosenOv.json().data.categories.map((c: any) => c.slug);
      expect(dosenCatSlugs).toContain('panduan-dosen');
      expect(dosenCatSlugs).not.toContain('panduan-superadmin');

      expect(mhsOv.statusCode).toBe(200);
      const mhsCatSlugs = mhsOv.json().data.categories.map((c: any) => c.slug);
      expect(mhsCatSlugs).toContain('panduan-mahasiswa');
      expect(mhsCatSlugs).not.toContain('panduan-superadmin');
      expect(mhsCatSlugs).not.toContain('panduan-auditor');

      expect(auditorOv.statusCode).toBe(200);
      expect(auditorOv.json().data.isReadOnlyAuditor).toBe(true);
      const auditorCatSlugs = auditorOv.json().data.categories.map((c: any) => c.slug);
      expect(auditorCatSlugs).toContain('panduan-auditor');
      expect(auditorCatSlugs).not.toContain('panduan-superadmin');

      // 2. Backend enforces role audience on article detail (Mahasiswa cannot read Superadmin RBAC guide)
      const mhsBlocked = await app.inject({
        method: 'GET',
        url: '/api/v1/knowledge/articles/superadmin-rbac-hak-akses',
        cookies: { pk_lms_session: mhsLogin.cookie },
      });
      expect(mhsBlocked.statusCode).toBe(403);

      // Mahasiswa CAN read Mahasiswa guide
      const mhsAllowed = await app.inject({
        method: 'GET',
        url: '/api/v1/knowledge/articles/mahasiswa-jelajah-kelas-invitation-code',
        cookies: { pk_lms_session: mhsLogin.cookie },
      });
      expect(mhsAllowed.statusCode).toBe(200);
      expect(mhsAllowed.json().data.article.title).toContain('Invitation Code');

      // 3. Search works & respects role scoping
      const dosenSearch = await app.inject({
        method: 'GET',
        url: '/api/v1/knowledge/articles?q=Wizard',
        cookies: { pk_lms_session: dosenLogin.cookie },
      });
      expect(dosenSearch.statusCode).toBe(200);
      expect(dosenSearch.json().data.items.length).toBeGreaterThan(0);

      // 4. Auditor cannot submit feedback or access admin CMS
      const auditorFeedback = await app.inject({
        method: 'POST',
        url: `/api/v1/knowledge/articles/${mhsAllowed.json().data.article.id}/feedback`,
        cookies: { pk_lms_session: auditorLogin.cookie },
        headers: { 'x-csrf-token': auditorLogin.csrf },
        payload: { helpful: true },
      });
      expect(auditorFeedback.statusCode).toBe(403);

      const dosenAdminBlocked = await app.inject({
        method: 'GET',
        url: '/api/v1/admin/knowledge/articles',
        cookies: { pk_lms_session: dosenLogin.cookie },
      });
      expect(dosenAdminBlocked.statusCode).toBe(403);

      // 5. Superadmin CMS Create, Update, Version History & Publish
      const catId = adminOv.json().data.categories[0].id;
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/v1/admin/knowledge/articles',
        cookies: { pk_lms_session: adminLogin.cookie },
        headers: { 'x-csrf-token': adminLogin.csrf },
        payload: {
          categoryId: catId,
          title: 'Panduan Uji Integrasi Knowledge Center',
          excerpt: 'Artikel pengujian otomatis untuk CMS Knowledge Center.',
          content: '<h2>Ringkasan</h2><p>Konten panduan uji.</p>',
          contentJson: {
            type: 'doc',
            content: [
              { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Ringkasan' }] },
              { type: 'paragraph', content: [{ type: 'text', text: 'Konten panduan uji.' }] },
            ],
          },
          status: 'PUBLISHED',
          difficulty: 'PEMULA',
          estimatedReadingMinutes: 3,
          roles: ['SUPERADMIN', 'DOSEN'],
          keywords: 'uji integrasi knowledge',
        },
      });
      expect(createRes.statusCode).toBe(200);
      createdArticleId = createRes.json().data.id;
      const createdSlug = createRes.json().data.slug;

      const updateRes = await app.inject({
        method: 'PUT',
        url: `/api/v1/admin/knowledge/articles/${createdArticleId}`,
        cookies: { pk_lms_session: adminLogin.cookie },
        headers: { 'x-csrf-token': adminLogin.csrf },
        payload: {
          categoryId: catId,
          title: 'Panduan Uji Integrasi Knowledge Center (Rev 2)',
          excerpt: 'Artikel pengujian otomatis revisi 2.',
          content: '<h2>Ringkasan</h2><p>Konten revisi 2.</p>',
          status: 'PUBLISHED',
          difficulty: 'MENENGAH',
          estimatedReadingMinutes: 4,
          roles: ['SUPERADMIN', 'DOSEN'],
          changeSummary: 'Pembaruan konten revisi 2',
        },
      });
      expect(updateRes.statusCode).toBe(200);
      expect(updateRes.json().data.version).toBe(2);

      const versionsRes = await app.inject({
        method: 'GET',
        url: `/api/v1/admin/knowledge/articles/${createdArticleId}/versions`,
        cookies: { pk_lms_session: adminLogin.cookie },
      });
      expect(versionsRes.statusCode).toBe(200);
      expect(versionsRes.json().data.length).toBe(2);

      // Mahasiswa blocked from SUPERADMIN+DOSEN article, Dosen allowed
      const mhsBlockedCustom = await app.inject({
        method: 'GET',
        url: `/api/v1/knowledge/articles/${createdSlug}`,
        cookies: { pk_lms_session: mhsLogin.cookie },
      });
      expect(mhsBlockedCustom.statusCode).toBe(403);

      const dosenAllowedCustom = await app.inject({
        method: 'GET',
        url: `/api/v1/knowledge/articles/${createdSlug}`,
        cookies: { pk_lms_session: dosenLogin.cookie },
      });
      expect(dosenAllowedCustom.statusCode).toBe(200);

      // Analytics endpoint works
      const analyticsRes = await app.inject({
        method: 'GET',
        url: '/api/v1/admin/knowledge/analytics',
        cookies: { pk_lms_session: adminLogin.cookie },
      });
      expect(analyticsRes.statusCode).toBe(200);
      expect(analyticsRes.json().data.totalArticles).toBeGreaterThanOrEqual(20);
    } finally {
      if (createdArticleId) {
        await db.delete(knowledgeArticles).where(eq(knowledgeArticles.id, createdArticleId));
      }
      await db.delete(users).where(eq(users.id, auditorUserId));
    }
  }, 60000);

  it('Phase 32: Superadmin Emergency Account Recovery — CLI Service, Transaction Rollback, Session Revocation, Forced Password Change & Audit Logs', async () => {
    const { db } = await import('../db');
    const {
      users,
      roles,
      userRoles,
      auditLogs,
      userSessions,
    } = await import('../db/schema');
    const { eq, desc, and } = await import('drizzle-orm');
    const { hashPassword, verifyPassword } = await import('../server/security');
    const {
      findSuperadminRecoveryTarget,
      executeSuperadminRecovery,
    } = await import('../server/superadminRecovery');

    const suffix = Date.now();
    const tempAdminEmail = `recovery-superadmin-${suffix}@poltek-kampar.ac.id`;
    const inactiveAdminEmail = `inactive-superadmin-${suffix}@poltek-kampar.ac.id`;
    const originalPassword = 'OldAdminPass#2026';
    const originalHash = await hashPassword(originalPassword);

    const [superadminRole] = await db
      .select()
      .from(roles)
      .where(eq(roles.code, 'SUPERADMIN'));

    const [tempAdmin] = await db
      .insert(users)
      .values({
        email: tempAdminEmail,
        passwordHash: originalHash,
        fullName: 'Emergency Recovery Test Superadmin',
        isActive: true,
        accountStatus: 'ACTIVE',
      })
      .returning();
    await db
      .insert(userRoles)
      .values({ userId: tempAdmin.id, roleId: superadminRole.id });

    const [inactiveAdmin] = await db
      .insert(users)
      .values({
        email: inactiveAdminEmail,
        passwordHash: originalHash,
        fullName: 'Inactive Superadmin',
        isActive: false,
        accountStatus: 'INACTIVE',
      })
      .returning();
    await db
      .insert(userRoles)
      .values({ userId: inactiveAdmin.id, roleId: superadminRole.id });

    try {
      // 1 & 2. Email not found rejected
      await expect(
        findSuperadminRecoveryTarget(`nonexistent-${suffix}@poltek-kampar.ac.id`)
      ).rejects.toThrow();

      // 3. Non-Superadmin accounts (Dosen, Mahasiswa) rejected
      await expect(
        findSuperadminRecoveryTarget('fitriani.dosen@poltek-kampar.ac.id')
      ).rejects.toThrow(/SUPERADMIN/);
      await expect(
        findSuperadminRecoveryTarget('ahmad.mhs@student.poltek-kampar.ac.id')
      ).rejects.toThrow(/SUPERADMIN/);

      // 4. Inactive Superadmin rejected
      await expect(
        findSuperadminRecoveryTarget(inactiveAdminEmail)
      ).rejects.toThrow(/tidak aktif/);

      // Log in as tempAdmin first to create an active session
      const preLoginRes = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { email: tempAdminEmail, password: originalPassword },
      });
      expect(preLoginRes.statusCode).toBe(200);
      const oldSessionCookie = preLoginRes.cookies.find(
        (c) => c.name === 'pk_lms_session'
      )!.value;

      // 5. Cancelled confirmation aborts without changing password or revoking session
      await expect(
        executeSuperadminRecovery({
          email: tempAdminEmail,
          confirmed: false,
          operatorIdentity: 'test-operator',
        })
      ).rejects.toThrow(/dibatalkan/);

      const stillValidMe = await app.inject({
        method: 'GET',
        url: '/api/v1/auth/me',
        cookies: { pk_lms_session: oldSessionCookie },
      });
      expect(stillValidMe.statusCode).toBe(200);

      // 14. Simulated transaction failure rolls back everything cleanly
      await expect(
        executeSuperadminRecovery({
          email: tempAdminEmail,
          confirmed: true,
          operatorIdentity: 'test-operator',
          _simulateTxFailure: true,
        })
      ).rejects.toThrow(/SIMULATED_TRANSACTION_FAILURE/);

      const [afterRollbackUser] = await db
        .select()
        .from(users)
        .where(eq(users.id, tempAdmin.id));
      expect(
        await verifyPassword(afterRollbackUser.passwordHash, originalPassword)
      ).toBe(true);
      expect(afterRollbackUser.mustResetPassword).toBe(false);

      // 6. Successful recovery
      const recovery = await executeSuperadminRecovery({
        email: tempAdminEmail,
        confirmed: true,
        operatorIdentity: 'test-operator',
      });
      expect(recovery.temporaryPassword.length).toBeGreaterThanOrEqual(12);
      expect(recovery.revokedSessionsCount).toBeGreaterThanOrEqual(1);

      // 9. All old sessions revoked (pre-recovery cookie returns 401)
      const revokedMe = await app.inject({
        method: 'GET',
        url: '/api/v1/auth/me',
        cookies: { pk_lms_session: oldSessionCookie },
      });
      expect(revokedMe.statusCode).toBe(401);

      const remainingSessions = await db
        .select()
        .from(userSessions)
        .where(eq(userSessions.userId, tempAdmin.id));
      expect(remainingSessions.length).toBe(0);

      // 8. Old password can no longer be used
      const oldPassLogin = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { email: tempAdminEmail, password: originalPassword },
      });
      expect(oldPassLogin.statusCode).toBe(401);

      // 7 & 10. Temporary password works and enforces mustResetPassword
      const tempLogin = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: {
          email: tempAdminEmail,
          password: recovery.temporaryPassword,
        },
      });
      expect(tempLogin.statusCode).toBe(200);
      expect(tempLogin.json().data.user.mustResetPassword).toBe(true);
      const tempCookie = tempLogin.cookies.find(
        (c) => c.name === 'pk_lms_session'
      )!.value;
      const tempCsrf = tempLogin.json().data.csrfToken as string;

      // Cannot reuse old password during forced password change
      const reuseReject = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/change-password',
        cookies: { pk_lms_session: tempCookie },
        headers: { 'x-csrf-token': tempCsrf },
        payload: {
          currentPassword: recovery.temporaryPassword,
          newPassword: originalPassword,
          confirmPassword: originalPassword,
        },
      });
      expect(reuseReject.statusCode).toBe(400);

      // Complete forced password change with strong new password
      const newPassword = `NewAdminStrong#${suffix}`;
      const forceChangeRes = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/change-password',
        cookies: { pk_lms_session: tempCookie },
        headers: { 'x-csrf-token': tempCsrf },
        payload: {
          currentPassword: recovery.temporaryPassword,
          newPassword,
          confirmPassword: newPassword,
        },
      });
      expect(forceChangeRes.statusCode).toBe(200);

      // 11 & 12. New password works and SUPERADMIN role & permissions remain intact
      const newLogin = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { email: tempAdminEmail, password: newPassword },
      });
      expect(newLogin.statusCode).toBe(200);
      expect(newLogin.json().data.user.mustResetPassword).toBe(false);
      expect(newLogin.json().data.user.roles).toContain('SUPERADMIN');

      // 13. Audit log recorded without storing password or hash
      const logs = await db
        .select()
        .from(auditLogs)
        .where(
          and(
            eq(auditLogs.entityId, tempAdmin.id),
            eq(auditLogs.action, 'SUPERADMIN_PASSWORD_RECOVERY')
          )
        )
        .orderBy(desc(auditLogs.createdAt));
      expect(logs.length).toBeGreaterThanOrEqual(1);
      const latestSuccessLog = logs.find(
        (l) => (l.metadata as any)?.result === 'SUCCESS'
      );
      expect(latestSuccessLog).toBeTruthy();
      expect((latestSuccessLog!.metadata as any).recoveryMethod).toBe('CLI');
      const serializedLog = JSON.stringify(latestSuccessLog);
      expect(serializedLog).not.toContain(recovery.temporaryPassword);
      expect(serializedLog).not.toContain(originalPassword);
    } finally {
      await db.delete(users).where(eq(users.id, tempAdmin.id));
      await db.delete(users).where(eq(users.id, inactiveAdmin.id));
    }
  }, 60000);
});

