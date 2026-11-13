import sharp from 'sharp';
import crypto from 'crypto';
import {
  writePrivateObjectBuffer,
  deletePrivateObject,
  resolvePrivateObjectPath,
} from './storage.ts';

export interface OptimizedCoverResult {
  coverImagePath: string;
  coverThumbnailPath: string;
  coverMimeType: string;
  coverFileSize: number;
  coverWidth: number;
  coverHeight: number;
  coverUrl: string;
  thumbnailUrl: string;
}

export function validateImageMagicBytes(buffer: Buffer): {
  valid: boolean;
  format?: string;
  error?: string;
} {
  if (!buffer || buffer.length < 12) {
    return { valid: false, error: 'Berkas tidak valid atau terlalu kecil.' };
  }

  // Reject SVG if buffer contains svg text or xml declaration
  const headerText = buffer.subarray(0, 100).toString('utf-8').toLowerCase();
  if (headerText.includes('<svg') || headerText.includes('<?xml')) {
    return { valid: false, error: 'Format SVG dilarang demi keamanan sistem.' };
  }

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { valid: true, format: 'jpeg' };
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return { valid: true, format: 'png' };
  }

  // WebP: RIFF .... WEBP
  if (
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return { valid: true, format: 'webp' };
  }

  return {
    valid: false,
    error:
      'Format berkas tidak didukung. Harap unggah gambar bertipe JPG, JPEG, PNG, atau WebP.',
  };
}

export async function processAndOptimizeCoverImage(
  inputBuffer: Buffer,
  maxBytes = 5 * 1024 * 1024
): Promise<OptimizedCoverResult> {
  if (inputBuffer.length > maxBytes) {
    throw new Error('Ukuran berkas melebihi batas maksimum 5 MB.');
  }

  const magic = validateImageMagicBytes(inputBuffer);
  if (!magic.valid) {
    throw new Error(magic.error || 'Format berkas gambar tidak valid.');
  }

  const image = sharp(inputBuffer);
  const metadata = await image.metadata();

  if (!metadata.width || !metadata.height) {
    throw new Error('Dimensi gambar tidak dapat dibaca atau berkas rusak.');
  }

  if (metadata.width < 400 || metadata.height < 200) {
    throw new Error(
      'Resolusi gambar terlalu kecil. Minimal ukuran gambar adalah 400 × 200 piksel.'
    );
  }

  const randId = crypto.randomUUID();
  const standardKey = `covers/${randId}_standard.webp`;
  const thumbKey = `covers/${randId}_thumb.webp`;

  // Standard Cover (1280x720, WebP Q82)
  const standardBuffer = await sharp(inputBuffer)
    .rotate() // Apply EXIF orientation and strip EXIF/GPS
    .resize(1280, 720, {
      fit: 'inside',
      withoutEnlargement: true,
    })
    .webp({ quality: 82, effort: 4 })
    .toBuffer();

  const standardMeta = await sharp(standardBuffer).metadata();

  // Thumbnail (480x270, WebP Q80)
  const thumbBuffer = await sharp(inputBuffer)
    .rotate()
    .resize(480, 270, {
      fit: 'cover',
    })
    .webp({ quality: 80, effort: 4 })
    .toBuffer();

  // Write to private storage
  writePrivateObjectBuffer(standardKey, standardBuffer);
  writePrivateObjectBuffer(thumbKey, thumbBuffer);

  return {
    coverImagePath: standardKey,
    coverThumbnailPath: thumbKey,
    coverMimeType: 'image/webp',
    coverFileSize: standardBuffer.length,
    coverWidth: standardMeta.width || 1280,
    coverHeight: standardMeta.height || 720,
    coverUrl: `/api/v1/storage/${standardKey}`,
    thumbnailUrl: `/api/v1/storage/${thumbKey}`,
  };
}

export function removeCoverImageFiles(
  coverImagePath?: string | null,
  coverThumbnailPath?: string | null
): void {
  if (coverImagePath && coverImagePath.startsWith('covers/')) {
    deletePrivateObject(coverImagePath);
  }
  if (coverThumbnailPath && coverThumbnailPath.startsWith('covers/')) {
    deletePrivateObject(coverThumbnailPath);
  }
}
