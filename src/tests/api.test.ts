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

    // Mahasiswa attempting Superadmin course creation must fail with 403 FORBIDDEN_INSUFFICIENT_PERMISSIONS
    const rbacRes = await app.inject({
      method: 'POST',
      url: '/api/v1/academic/courses',
      cookies: { pk_lms_session: sessionCookie! },
      headers: { 'x-csrf-token': csrfToken },
      payload: {
        code: 'HACK-101',
        title: 'Unauthorized Course',
        studyProgram: 'Teknik Informatika',
        credits: 3,
        semesterNumber: 1,
        description: 'Should be blocked by RBAC',
      },
    });
    expect(rbacRes.statusCode).toBe(403);
    expect(rbacRes.json().error.code).toBe('FORBIDDEN_INSUFFICIENT_PERMISSIONS');

    // Mahasiswa fetching enrolled classroom never receives quiz answer keys (isCorrect)
    const clsListRes = await app.inject({
      method: 'GET',
      url: '/api/v1/classrooms?scope=mine',
      cookies: { pk_lms_session: sessionCookie! },
    });
    const enrolledClass = clsListRes
      .json()
      .data.find((c: any) => c.myEnrollmentStatus === 'active');
    expect(enrolledClass).toBeTruthy();

    const detailRes = await app.inject({
      method: 'GET',
      url: `/api/v1/classrooms/${enrolledClass.id}`,
      cookies: { pk_lms_session: sessionCookie! },
    });
    expect(detailRes.statusCode).toBe(200);
    const quizzes = detailRes.json().data.quizzes;
    expect(quizzes.length).toBeGreaterThan(0);
    const firstOption = quizzes[0].questions[0].options[0];
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
      url: '/api/v1/classrooms?scope=mine',
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
    const sitiClassroomsRes = await app.inject({
      method: 'GET',
      url: '/api/v1/classrooms',
      cookies: { pk_lms_session: sitiCookie },
    });
    const unEnrolledClass = sitiClassroomsRes
      .json()
      .data.find((c: any) => !c.canEnter);
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
        registrationStart: '2027-01-01T00:00:00Z',
        registrationEnd: '2027-02-15T23:59:59Z',
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
        registrationStart: '2027-01-01T00:00:00Z',
        registrationEnd: '2027-02-15T23:59:59Z',
        status: 'scheduled',
        isDefault: false,
      },
    });
    expect(createPeriodRes.statusCode).toBe(201);
    const createdPeriod = createPeriodRes.json().data;
    expect(createdPeriod.code).toBe(newPeriodCode);
    expect(createdPeriod.status).toBe('scheduled');

    // 1.4 Superadmin transitions: activate, close-registration, set-default
    const activatePeriodRes = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/academic-periods/${createdPeriod.id}/activate`,
      cookies: { pk_lms_session: adminCookie },
      headers: { 'x-csrf-token': adminCsrf },
    });
    expect(activatePeriodRes.statusCode).toBe(200);
    expect(activatePeriodRes.json().data.status).toBe('active');

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

    // 2. MODULE B: Academic Calendar
    const calendarEventsRes = await app.inject({
      method: 'GET',
      url: `/api/v1/academic-calendar?periodId=${defaultPeriod.id}`,
      cookies: { pk_lms_session: dosenCookie },
    });
    expect(calendarEventsRes.statusCode).toBe(200);
    expect(Array.isArray(calendarEventsRes.json().data)).toBe(true);
    expect(calendarEventsRes.json().data.length).toBeGreaterThan(0);

    // 3. MODULE C: Course Offerings
    const offeringsRes = await app.inject({
      method: 'GET',
      url: `/api/v1/course-offerings?periodId=${defaultPeriod.id}`,
      cookies: { pk_lms_session: dosenCookie },
    });
    expect(offeringsRes.statusCode).toBe(200);
    const offerings = offeringsRes.json().data;
    expect(Array.isArray(offerings)).toBe(true);
    expect(offerings.length).toBeGreaterThan(0);
    const targetOffering = offerings[0];

    // 4. MODULE D: Facilities & Schedule Conflict Detection
    const buildingsRes = await app.inject({
      method: 'GET',
      url: '/api/v1/campus/buildings',
      cookies: { pk_lms_session: dosenCookie },
    });
    expect(buildingsRes.statusCode).toBe(200);
    expect(buildingsRes.json().data.length).toBeGreaterThan(0);
    const building1 = buildingsRes.json().data[0];

    const roomsRes = await app.inject({
      method: 'GET',
      url: `/api/v1/campus/rooms?buildingId=${building1.id}`,
      cookies: { pk_lms_session: dosenCookie },
    });
    expect(roomsRes.statusCode).toBe(200);
    expect(roomsRes.json().data.length).toBeGreaterThan(0);
    const room1 = roomsRes.json().data[0];

    // Test Conflict Detection Endpoint
    const conflictCheckRes = await app.inject({
      method: 'POST',
      url: '/api/v1/schedules/conflicts',
      cookies: { pk_lms_session: dosenCookie },
      headers: { 'x-csrf-token': dosenCsrf },
      payload: {
        dayOfWeek: 1, // Monday
        startTime: '08:00',
        endTime: '10:30',
        roomId: room1.id,
      },
    });
    expect(conflictCheckRes.statusCode).toBe(200);
    expect(conflictCheckRes.json().data).toHaveProperty('hasConflict');

    // 5. MODULE E: Advanced Classroom Builder (6-step Wizard)
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
        courseId: targetOffering.courseId,
        courseOfferingId: targetOffering.id,
        academicPeriodId: defaultPeriod.id,
        name: testClassName,
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
            buildingId: building1.id,
            roomId: room1.id,
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
    // 6.1 Catalog discovery
    const catalogRes = await app.inject({
      method: 'GET',
      url: `/api/v1/classrooms/catalog?periodId=${defaultPeriod.id}`,
      cookies: { pk_lms_session: ahmadCookie },
    });
    expect(catalogRes.statusCode).toBe(200);
    const catalogItem = catalogRes.json().data.find((c: any) => c.id === builtClass.id);
    expect(catalogItem).toBeDefined();
    expect(catalogItem.maxCapacity).toBe(1);

    // 6.2 Ahmad enrolls (Seats available: takes the 1 seat)
    const ahmadEnrollRes = await app.inject({
      method: 'POST',
      url: `/api/v1/classrooms/${builtClass.id}/enroll`,
      cookies: { pk_lms_session: ahmadCookie },
      headers: { 'x-csrf-token': ahmadCsrf },
    });
    expect(ahmadEnrollRes.statusCode).toBe(200);
    expect(ahmadEnrollRes.json().data.enrolled).toBe(true);
    expect(ahmadEnrollRes.json().data.status).toBe('active');

    // 6.3 Siti enrolls (Capacity full: must be routed to Waitlist!)
    const sitiEnrollRes = await app.inject({
      method: 'POST',
      url: `/api/v1/classrooms/${builtClass.id}/enroll`,
      cookies: { pk_lms_session: sitiCookie },
      headers: { 'x-csrf-token': sitiCsrf },
    });
    expect(sitiEnrollRes.statusCode).toBe(200);
    expect(sitiEnrollRes.json().data.enrolled).toBe(false);
    expect(sitiEnrollRes.json().data.waitlisted).toBe(true);
    expect(sitiEnrollRes.json().data.queueNumber).toBe(1);

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
  }, 45000);
});

