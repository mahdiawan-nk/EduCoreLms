import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import mammoth from 'mammoth';
import * as XLSX from 'xlsx';

const PRIVATE_S3_ROOT = path.resolve('/tmp', 'poltek-kampar-s3-private-bucket');

if (!fs.existsSync(PRIVATE_S3_ROOT)) {
  fs.mkdirSync(PRIVATE_S3_ROOT, { recursive: true });
}

const SIGNING_SECRET =
  process.env.SESSION_SECRET ||
  'politeknik-kampar-lms-s3-presigned-secret-2026';

export interface AllowedFileTypeSpec {
  ext: string;
  category: 'DOCUMENT' | 'SPREADSHEET' | 'PRESENTATION' | 'IMAGE' | 'VIDEO';
  mimes: string[];
  maxBytes: number;
}

export const ALLOWED_FILE_SPECS: Record<string, AllowedFileTypeSpec> = {
  pdf: {
    ext: 'pdf',
    category: 'DOCUMENT',
    mimes: ['application/pdf'],
    maxBytes: 50 * 1024 * 1024,
  },
  doc: {
    ext: 'doc',
    category: 'DOCUMENT',
    mimes: ['application/msword', 'application/octet-stream'],
    maxBytes: 35 * 1024 * 1024,
  },
  docx: {
    ext: 'docx',
    category: 'DOCUMENT',
    mimes: [
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/octet-stream',
      'application/zip',
    ],
    maxBytes: 35 * 1024 * 1024,
  },
  xls: {
    ext: 'xls',
    category: 'SPREADSHEET',
    mimes: ['application/vnd.ms-excel', 'application/octet-stream'],
    maxBytes: 35 * 1024 * 1024,
  },
  xlsx: {
    ext: 'xlsx',
    category: 'SPREADSHEET',
    mimes: [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/octet-stream',
      'application/zip',
    ],
    maxBytes: 35 * 1024 * 1024,
  },
  ppt: {
    ext: 'ppt',
    category: 'PRESENTATION',
    mimes: ['application/vnd.ms-powerpoint', 'application/octet-stream'],
    maxBytes: 50 * 1024 * 1024,
  },
  pptx: {
    ext: 'pptx',
    category: 'PRESENTATION',
    mimes: [
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'application/octet-stream',
      'application/zip',
    ],
    maxBytes: 50 * 1024 * 1024,
  },
  jpg: {
    ext: 'jpg',
    category: 'IMAGE',
    mimes: ['image/jpeg'],
    maxBytes: 15 * 1024 * 1024,
  },
  jpeg: {
    ext: 'jpeg',
    category: 'IMAGE',
    mimes: ['image/jpeg'],
    maxBytes: 15 * 1024 * 1024,
  },
  png: {
    ext: 'png',
    category: 'IMAGE',
    mimes: ['image/png'],
    maxBytes: 15 * 1024 * 1024,
  },
  webp: {
    ext: 'webp',
    category: 'IMAGE',
    mimes: ['image/webp'],
    maxBytes: 15 * 1024 * 1024,
  },
  mp4: {
    ext: 'mp4',
    category: 'VIDEO',
    mimes: ['video/mp4', 'application/mp4'],
    maxBytes: 250 * 1024 * 1024,
  },
  webm: {
    ext: 'webm',
    category: 'VIDEO',
    mimes: ['video/webm', 'audio/webm'],
    maxBytes: 250 * 1024 * 1024,
  },
};

export function validateAttachmentRequest(
  fileName: string,
  mimeType: string,
  fileSize: number
): {
  valid: boolean;
  error?: string;
  spec?: AllowedFileTypeSpec;
  extension?: string;
} {
  const parts = fileName.toLowerCase().trim().split('.');
  if (parts.length < 2) {
    return { valid: false, error: 'Nama berkas harus memiliki ekstensi yang valid.' };
  }
  const ext = parts[parts.length - 1];

  // Explicitly block dangerous executable / script / SVG / HTML extensions
  if (['html', 'htm', 'svg', 'xml', 'js', 'mjs', 'sh', 'exe', 'php'].includes(ext)) {
    return {
      valid: false,
      error: `Ekstensi berkas .${ext} dilarang demi keamanan penyimpanan objek.`,
    };
  }

  const spec = ALLOWED_FILE_SPECS[ext];
  if (!spec) {
    return {
      valid: false,
      error: `Tipe berkas .${ext} tidak didukung. Gunakan PDF, DOC, DOCX, XLS, XLSX, PPT, PPTX, JPG, PNG, WEBP, MP4, atau WEBM.`,
    };
  }

  if (fileSize <= 0) {
    return { valid: false, error: 'Ukuran berkas tidak boleh 0 byte.' };
  }

  if (fileSize > spec.maxBytes) {
    return {
      valid: false,
      error: `Ukuran berkas melebihi batas maksimum (${Math.round(
        spec.maxBytes / (1024 * 1024)
      )} MB).`,
    };
  }

  const normalizedMime = (mimeType || '').toLowerCase().trim();
  if (
    normalizedMime.includes('text/html') ||
    normalizedMime.includes('image/svg') ||
    normalizedMime.includes('javascript')
  ) {
    return {
      valid: false,
      error: 'MIME type HTML, SVG, atau Script tidak diizinkan.',
    };
  }

  return { valid: true, spec, extension: ext };
}

export function generateObjectKey(materialId: string, extension: string): string {
  const rand = crypto.randomUUID();
  const cleanExt = extension.replace(/[^a-z0-9]/gi, '').toLowerCase();
  return `materials/${materialId}/${rand}.${cleanExt}`;
}

export function signPresignedPutUrl(params: {
  objectKey: string;
  mimeType: string;
  maxBytes: number;
  expiresInSeconds?: number;
}): { uploadUrl: string; expiresAt: string } {
  const exp = Math.floor(Date.now() / 1000) + (params.expiresInSeconds || 900);
  const payload = `PUT:${params.objectKey}:${params.mimeType}:${params.maxBytes}:${exp}`;
  const sig = crypto
    .createHmac('sha256', SIGNING_SECRET)
    .update(payload)
    .digest('hex');

  const query = new URLSearchParams({
    key: params.objectKey,
    mime: params.mimeType,
    max: String(params.maxBytes),
    exp: String(exp),
    sig,
  });

  return {
    uploadUrl: `/api/v1/s3-presigned/upload?${query.toString()}`,
    expiresAt: new Date(exp * 1000).toISOString(),
  };
}

export function verifyPresignedPutSignature(params: {
  objectKey: string;
  mimeType: string;
  maxBytes: number;
  exp: number;
  sig: string;
}): boolean {
  const now = Math.floor(Date.now() / 1000);
  if (params.exp < now) return false;
  const payload = `PUT:${params.objectKey}:${params.mimeType}:${params.maxBytes}:${params.exp}`;
  const expected = crypto
    .createHmac('sha256', SIGNING_SECRET)
    .update(payload)
    .digest('hex');
  return crypto.timingSafeEqual(
    Buffer.from(expected),
    Buffer.from(params.sig.padEnd(expected.length, '0').slice(0, expected.length))
  );
}

export function signPresignedGetUrl(params: {
  objectKey: string;
  fileName: string;
  mimeType: string;
  disposition?: 'inline' | 'attachment';
  expiresInSeconds?: number;
}): string {
  const exp = Math.floor(Date.now() / 1000) + (params.expiresInSeconds || 900);
  const disp = params.disposition || 'inline';
  const payload = `GET:${params.objectKey}:${disp}:${exp}`;
  const sig = crypto
    .createHmac('sha256', SIGNING_SECRET)
    .update(payload)
    .digest('hex');

  const query = new URLSearchParams({
    key: params.objectKey,
    name: params.fileName,
    mime: params.mimeType,
    disp,
    exp: String(exp),
    sig,
  });

  return `/api/v1/s3-presigned/object?${query.toString()}`;
}

export function verifyPresignedGetSignature(params: {
  objectKey: string;
  disposition: string;
  exp: number;
  sig: string;
}): boolean {
  const now = Math.floor(Date.now() / 1000);
  if (params.exp < now) return false;
  const payload = `GET:${params.objectKey}:${params.disposition}:${params.exp}`;
  const expected = crypto
    .createHmac('sha256', SIGNING_SECRET)
    .update(payload)
    .digest('hex');
  return crypto.timingSafeEqual(
    Buffer.from(expected),
    Buffer.from(params.sig.padEnd(expected.length, '0').slice(0, expected.length))
  );
}

export function resolvePrivateObjectPath(objectKey: string): string {
  const normalized = path.normalize(objectKey).replace(/^(\.\.(\/|\\|$))+/, '');
  const fullPath = path.join(PRIVATE_S3_ROOT, normalized);
  if (!fullPath.startsWith(PRIVATE_S3_ROOT)) {
    throw new Error('Invalid object key path traversal blocked');
  }
  return fullPath;
}

export function writePrivateObjectBuffer(objectKey: string, buffer: Buffer): void {
  const targetPath = resolvePrivateObjectPath(objectKey);
  const dir = path.dirname(targetPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(targetPath, buffer);
}

export function deletePrivateObject(objectKey: string): void {
  try {
    const targetPath = resolvePrivateObjectPath(objectKey);
    if (fs.existsSync(targetPath)) {
      fs.unlinkSync(targetPath);
    }
  } catch {
    // Ignore cleanup errors
  }
}

export function verifyUploadedObject(
  objectKey: string,
  expectedExtension: string
): {
  exists: boolean;
  sizeBytes: number;
  checksum: string;
  detectedMime: string;
  error?: string;
} {
  const targetPath = resolvePrivateObjectPath(objectKey);
  if (!fs.existsSync(targetPath)) {
    return {
      exists: false,
      sizeBytes: 0,
      checksum: '',
      detectedMime: '',
      error: 'Objek belum diunggah ke penyimpanan S3 privat.',
    };
  }

  const buffer = fs.readFileSync(targetPath);
  if (buffer.length === 0) {
    return {
      exists: false,
      sizeBytes: 0,
      checksum: '',
      detectedMime: '',
      error: 'Berkas yang diunggah kosong (0 byte).',
    };
  }

  // Inspect magic bytes / first 512 bytes for disguised HTML / SVG / Script execution
  const headText = buffer.subarray(0, Math.min(512, buffer.length)).toString('utf8').toLowerCase();
  if (
    headText.includes('<script') ||
    headText.includes('<!doctype html') ||
    headText.includes('<html') ||
    headText.includes('<svg')
  ) {
    fs.unlinkSync(targetPath);
    return {
      exists: false,
      sizeBytes: 0,
      checksum: '',
      detectedMime: '',
      error: 'Berkas ditolak oleh pemindai keamanan: Terdeteksi konten HTML/SVG/Script aktif.',
    };
  }

  const checksum = crypto.createHash('sha256').update(buffer).digest('hex');
  const ext = expectedExtension.toLowerCase();

  let detectedMime = ALLOWED_FILE_SPECS[ext]?.mimes[0] || 'application/octet-stream';
  if (buffer.length >= 4) {
    const hex4 = buffer.subarray(0, 4).toString('hex').toLowerCase();
    if (hex4 === '25504446') detectedMime = 'application/pdf'; // %PDF
    else if (hex4 === '89504e47') detectedMime = 'image/png';
    else if (hex4.startsWith('ffd8ff')) detectedMime = 'image/jpeg';
    else if (hex4 === '52494646') detectedMime = 'image/webp';
    else if (hex4 === '504b0304') {
      // ZIP container (DOCX / XLSX / PPTX)
      if (ext === 'docx') {
        detectedMime =
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      } else if (ext === 'xlsx') {
        detectedMime =
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      } else if (ext === 'pptx') {
        detectedMime =
          'application/vnd.openxmlformats-officedocument.presentationml.presentation';
      }
    }
  }

  return {
    exists: true,
    sizeBytes: buffer.length,
    checksum,
    detectedMime,
  };
}

// Sanitize extracted HTML from Mammoth or Tiptap to prevent XSS
export function sanitizePreviewHtml(rawHtml: string): string {
  return rawHtml
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
    .replace(/<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi, '')
    .replace(/\son\w+\s*=\s*(['"]).*?\1/gi, '')
    .replace(/javascript:/gi, '');
}

// Generate isolated preview data for PDF, DOCX, XLSX, PPTX, Images, Videos
export async function generateAttachmentPreviewPayload(params: {
  objectKey: string;
  originalName: string;
  fileExtension: string;
  mimeType: string;
}) {
  const ext = params.fileExtension.toLowerCase();
  const targetPath = resolvePrivateObjectPath(params.objectKey);

  const signedStreamUrl = signPresignedGetUrl({
    objectKey: params.objectKey,
    fileName: params.originalName,
    mimeType: params.mimeType,
    disposition: 'inline',
  });

  const signedDownloadUrl = signPresignedGetUrl({
    objectKey: params.objectKey,
    fileName: params.originalName,
    mimeType: params.mimeType,
    disposition: 'attachment',
  });

  if (!fs.existsSync(targetPath)) {
    return {
      mode: 'FALLBACK' as const,
      previewType: 'FALLBACK' as const,
      streamUrl: signedStreamUrl,
      downloadUrl: signedDownloadUrl,
      message: 'Berkas asli siap diunduh melalui tautan terotorisasi.',
    };
  }

  const buffer = fs.readFileSync(targetPath);

  if (ext === 'pdf') {
    return {
      mode: 'PDF' as const,
      previewType: 'PDF' as const,
      streamUrl: signedStreamUrl,
      downloadUrl: signedDownloadUrl,
    };
  }

  if (['jpg', 'jpeg', 'png', 'webp'].includes(ext)) {
    return {
      mode: 'IMAGE' as const,
      previewType: 'IMAGE' as const,
      streamUrl: signedStreamUrl,
      downloadUrl: signedDownloadUrl,
    };
  }

  if (['mp4', 'webm'].includes(ext)) {
    return {
      mode: 'VIDEO' as const,
      previewType: 'VIDEO' as const,
      streamUrl: signedStreamUrl,
      downloadUrl: signedDownloadUrl,
    };
  }

  if (ext === 'docx') {
    try {
      const result = await mammoth.convertToHtml({ buffer });
      return {
        mode: 'DOCX_HTML' as const,
        previewType: 'DOCX_HTML' as const,
        html: sanitizePreviewHtml(result.value || '<p>Dokumen kosong.</p>'),
        messages: result.messages,
        streamUrl: signedStreamUrl,
        downloadUrl: signedDownloadUrl,
      };
    } catch {
      return {
        mode: 'FALLBACK' as const,
        previewType: 'FALLBACK' as const,
        streamUrl: signedStreamUrl,
        downloadUrl: signedDownloadUrl,
        message:
          'Pratinjau langsung DOCX tidak dapat dirender untuk berkas ini. Silakan unduh berkas asli.',
      };
    }
  }

  if (ext === 'xlsx' || ext === 'xls') {
    try {
      const workbook = XLSX.read(buffer, { type: 'buffer' });
      const sheets = workbook.SheetNames.map((sheetName) => {
        const sheet = workbook.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json<string[]>(sheet, {
          header: 1,
          defval: '',
        });
        return {
          name: sheetName,
          rows: rows.slice(0, 100), // Limit preview rows for UI responsiveness
        };
      });
      return {
        mode: 'SPREADSHEET' as const,
        previewType: 'SPREADSHEET' as const,
        sheets,
        streamUrl: signedStreamUrl,
        downloadUrl: signedDownloadUrl,
      };
    } catch {
      return {
        mode: 'FALLBACK' as const,
        previewType: 'FALLBACK' as const,
        streamUrl: signedStreamUrl,
        downloadUrl: signedDownloadUrl,
        message:
          'Pratinjau lembar kerja tidak dapat dirender. Silakan unduh berkas asli.',
      };
    }
  }

  if (ext === 'pptx' || ext === 'ppt' || ext === 'doc') {
    // Extract readable text segments if possible or provide structured presentation summary + secure download
    const extractedStrings =
      buffer
        .toString('utf8')
        .match(/[A-Za-z0-9\s.,:;()-]{12,120}/g)
        ?.slice(0, 20) || [];

    const slides = extractedStrings.map((text, idx) => ({
      slideNumber: idx + 1,
      text: text.trim(),
    }));

    return {
      mode: 'PRESENTATION_FALLBACK' as const,
      previewType: 'PRESENTATION_FALLBACK' as const,
      extractedTextSnippets: extractedStrings,
      slides,
      streamUrl: signedStreamUrl,
      downloadUrl: signedDownloadUrl,
      message: `Pratinjau terisolasi untuk berkas .${ext.toUpperCase()}. Gunakan tombol Unduh Berkas Asli untuk membuka dengan aplikasi penuh.`,
    };
  }

  return {
    mode: 'FALLBACK' as const,
    previewType: 'FALLBACK' as const,
    streamUrl: signedStreamUrl,
    downloadUrl: signedDownloadUrl,
    message: 'Silakan unduh berkas asli melalui tautan terotorisasi.',
  };
}

// Validate & extract external YouTube / Vimeo video IDs safely (prevent arbitrary iframe injection)
export function validateAndExtractExternalVideo(
  sourceType: 'YOUTUBE' | 'VIMEO',
  rawUrl: string
): {
  valid: boolean;
  videoId?: string;
  embedUrl?: string;
  canonicalUrl?: string;
  error?: string;
} {
  try {
    const parsed = new URL(rawUrl.trim());
    const host = parsed.hostname.toLowerCase();

    if (sourceType === 'YOUTUBE') {
      const allowedHosts = [
        'www.youtube.com',
        'youtube.com',
        'm.youtube.com',
        'youtu.be',
        'www.youtube-nocookie.com',
      ];
      if (!allowedHosts.includes(host)) {
        return {
          valid: false,
          error: 'Domain YouTube tidak valid. Hanya youtube.com dan youtu.be yang diizinkan.',
        };
      }

      let videoId = '';
      if (host === 'youtu.be') {
        videoId = parsed.pathname.replace(/^\//, '').split('/')[0];
      } else if (parsed.pathname.startsWith('/embed/')) {
        videoId = parsed.pathname.replace('/embed/', '').split('/')[0];
      } else if (parsed.pathname.startsWith('/shorts/')) {
        videoId = parsed.pathname.replace('/shorts/', '').split('/')[0];
      } else {
        videoId = parsed.searchParams.get('v') || '';
      }

      if (!/^[a-zA-Z0-9_-]{6,15}$/.test(videoId)) {
        return {
          valid: false,
          error: 'ID Video YouTube tidak ditemukan atau tidak valid.',
        };
      }

      return {
        valid: true,
        videoId,
        embedUrl: `https://www.youtube-nocookie.com/embed/${videoId}`,
        canonicalUrl: `https://www.youtube.com/watch?v=${videoId}`,
      };
    }

    if (sourceType === 'VIMEO') {
      const allowedHosts = ['vimeo.com', 'www.vimeo.com', 'player.vimeo.com'];
      if (!allowedHosts.includes(host)) {
        return {
          valid: false,
          error: 'Domain Vimeo tidak valid. Hanya vimeo.com dan player.vimeo.com yang diizinkan.',
        };
      }

      const match = parsed.pathname.match(/\/(?:video\/)?(\d{5,15})/);
      const videoId = match ? match[1] : '';
      if (!videoId) {
        return {
          valid: false,
          error: 'ID Video Vimeo numerik tidak valid.',
        };
      }

      return {
        valid: true,
        videoId,
        embedUrl: `https://player.vimeo.com/video/${videoId}`,
        canonicalUrl: `https://vimeo.com/${videoId}`,
      };
    }

    return { valid: false, error: 'Tipe sumber video tidak dikenali.' };
  } catch {
    return { valid: false, error: 'Format URL video tidak valid.' };
  }
}
