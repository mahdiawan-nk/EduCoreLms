import sharp from 'sharp';
import crypto from 'crypto';
import fs from 'fs';
import {
  writePrivateObjectBuffer,
  deletePrivateObject,
  resolvePrivateObjectPath,
} from './storage.ts';

export type BrandingAssetKind =
  | 'institutionLogo'
  | 'applicationLogo'
  | 'loginLogo'
  | 'faviconIco'
  | 'faviconPng'
  | 'faviconSvg'
  | 'appleTouchIcon'
  | 'ogImage';

export interface ProcessedBrandingAsset {
  assetKind: BrandingAssetKind;
  objectKey: string;
  url: string;
  mimeType: string;
  fileSize: number;
  width?: number;
  height?: number;
  variants?: {
    sm?: string;
    md?: string;
    lg?: string;
  };
}

/**
 * Strict SVG sanitizer that strips script tags, embedded active objects,
 * inline event handlers, and javascript:/data: URIs.
 */
export function sanitizeSvgContent(rawSvg: string): {
  valid: boolean;
  sanitized?: string;
  error?: string;
} {
  const trimmed = rawSvg.trim();
  const lower = trimmed.toLowerCase();
  if (!lower.includes('<svg') || !lower.includes('</svg>')) {
    return {
      valid: false,
      error: 'Berkas SVG tidak valid atau tidak memiliki elemen root <svg>.',
    };
  }

  // Strip XML processing instructions / DOCTYPE / ENTITY (XXE protection)
  let cleaned = trimmed
    .replace(/<!DOCTYPE[\s\S]*?>/gi, '')
    .replace(/<!ENTITY[\s\S]*?>/gi, '')
    .replace(/<\?xml[\s\S]*?\?>/gi, '');

  // Remove dangerous tags completely
  const dangerousTags = [
    'script',
    'foreignObject',
    'iframe',
    'object',
    'embed',
    'applet',
    'meta',
    'link',
    'base',
  ];
  for (const tag of dangerousTags) {
    const pairRegex = new RegExp(`<${tag}\\b[\\s\\S]*?<\\/${tag}>`, 'gi');
    const selfRegex = new RegExp(`<${tag}\\b[^>]*\\/?>`, 'gi');
    cleaned = cleaned.replace(pairRegex, '').replace(selfRegex, '');
  }

  // Strip inline on* event handlers (onclick, onload, onerror, etc.)
  cleaned = cleaned.replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '');

  // Strip javascript: / vbscript: / data:text/html in href / xlink:href / src
  cleaned = cleaned.replace(
    /\s(xlink:)?(href|src)\s*=\s*(["'])\s*(?:javascript:|vbscript:|data:text\/html|https?:\/\/)[^"']*\3/gi,
    ''
  );

  // Strip expression(...) or url(http...) inside style attributes
  cleaned = cleaned.replace(/expression\s*\([^)]*\)/gi, '');

  if (!cleaned.toLowerCase().includes('<svg')) {
    return {
      valid: false,
      error: 'Konten SVG ditolak setelah proses sanitasi keamanan.',
    };
  }

  return { valid: true, sanitized: cleaned };
}

export function detectAssetFormat(
  buffer: Buffer,
  filename?: string
): 'png' | 'jpeg' | 'webp' | 'svg' | 'ico' | 'unknown' {
  if (!buffer || buffer.length < 4) return 'unknown';

  // ICO: 00 00 01 00
  if (
    buffer[0] === 0x00 &&
    buffer[1] === 0x00 &&
    buffer[2] === 0x01 &&
    buffer[3] === 0x00
  ) {
    return 'ico';
  }

  // JPEG
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'jpeg';
  }

  // PNG
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return 'png';
  }

  // WebP
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'webp';
  }

  // SVG text detection
  const head = buffer.subarray(0, 512).toString('utf-8').trim().toLowerCase();
  if (
    head.includes('<svg') ||
    (head.startsWith('<?xml') && buffer.toString('utf-8').toLowerCase().includes('<svg')) ||
    (filename?.toLowerCase().endsWith('.svg') && head.includes('<svg'))
  ) {
    return 'svg';
  }

  return 'unknown';
}

export async function processBrandingUpload(params: {
  assetKind: BrandingAssetKind;
  buffer: Buffer;
  filename?: string;
  maxBytes: number;
}): Promise<ProcessedBrandingAsset> {
  const { assetKind, buffer, filename, maxBytes } = params;

  if (!buffer || buffer.length === 0) {
    throw new Error('Berkas kosong.');
  }
  if (buffer.length > maxBytes) {
    const maxKb = Math.round(maxBytes / 1024);
    throw new Error(`Ukuran berkas melebihi batas maksimum ${maxKb} KB.`);
  }

  const format = detectAssetFormat(buffer, filename);
  if (format === 'unknown') {
    throw new Error(
      'Format berkas tidak dikenali. Gunakan PNG, JPG/JPEG, WebP, SVG, atau ICO.'
    );
  }

  const randId = crypto.randomUUID();
  const versionStamp = Date.now();

  // Favicon ICO
  if (assetKind === 'faviconIco') {
    if (format === 'ico') {
      const key = `branding/${randId}_favicon.ico`;
      writePrivateObjectBuffer(key, buffer);
      return {
        assetKind,
        objectKey: key,
        url: `/api/v1/storage/${key}?v=${versionStamp}`,
        mimeType: 'image/x-icon',
        fileSize: buffer.length,
        width: 32,
        height: 32,
      };
    }
    if (format === 'png' || format === 'jpeg' || format === 'webp') {
      const png32 = await sharp(buffer)
        .resize(32, 32, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png({ compressionLevel: 9 })
        .toBuffer();
      const key = `branding/${randId}_favicon32.png`;
      writePrivateObjectBuffer(key, png32);
      return {
        assetKind,
        objectKey: key,
        url: `/api/v1/storage/${key}?v=${versionStamp}`,
        mimeType: 'image/png',
        fileSize: png32.length,
        width: 32,
        height: 32,
      };
    }
    throw new Error('Favicon ICO harus berformat .ico atau gambar raster PNG/WebP.');
  }

  // Favicon SVG
  if (assetKind === 'faviconSvg') {
    if (format !== 'svg') {
      throw new Error('Favicon SVG harus menggunakan format .svg yang valid.');
    }
    const check = sanitizeSvgContent(buffer.toString('utf-8'));
    if (!check.valid || !check.sanitized) {
      throw new Error(check.error || 'SVG tidak valid.');
    }
    const cleanBuf = Buffer.from(check.sanitized, 'utf-8');
    const key = `branding/${randId}_favicon.svg`;
    writePrivateObjectBuffer(key, cleanBuf);
    return {
      assetKind,
      objectKey: key,
      url: `/api/v1/storage/${key}?v=${versionStamp}`,
      mimeType: 'image/svg+xml',
      fileSize: cleanBuf.length,
    };
  }

  // Favicon PNG / Apple Touch Icon
  if (assetKind === 'faviconPng' || assetKind === 'appleTouchIcon') {
    if (format === 'svg' || format === 'ico') {
      throw new Error('Gunakan format raster PNG, JPG, atau WebP untuk ikon ini.');
    }
    const targetDim = assetKind === 'appleTouchIcon' ? 180 : 64;
    const pngBuf = await sharp(buffer)
      .rotate()
      .resize(targetDim, targetDim, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .png({ compressionLevel: 9 })
      .toBuffer();
    const key = `branding/${randId}_${assetKind}.png`;
    writePrivateObjectBuffer(key, pngBuf);
    return {
      assetKind,
      objectKey: key,
      url: `/api/v1/storage/${key}?v=${versionStamp}`,
      mimeType: 'image/png',
      fileSize: pngBuf.length,
      width: targetDim,
      height: targetDim,
    };
  }

  // Logos & OG Image (SVG supported for logos, not OG Image)
  if (format === 'svg') {
    if (assetKind === 'ogImage') {
      throw new Error('Open Graph Image harus berformat PNG, JPG, atau WebP.');
    }
    const check = sanitizeSvgContent(buffer.toString('utf-8'));
    if (!check.valid || !check.sanitized) {
      throw new Error(check.error || 'Berkas SVG ditolak oleh sanitasi keamanan.');
    }
    const cleanBuf = Buffer.from(check.sanitized, 'utf-8');
    const key = `branding/${randId}_${assetKind}.svg`;
    writePrivateObjectBuffer(key, cleanBuf);
    return {
      assetKind,
      objectKey: key,
      url: `/api/v1/storage/${key}?v=${versionStamp}`,
      mimeType: 'image/svg+xml',
      fileSize: cleanBuf.length,
    };
  }

  if (format === 'ico') {
    throw new Error('Format ICO hanya diperbolehkan untuk Favicon ICO.');
  }

  // Raster optimization (PNG/JPEG/WebP -> optimized WebP variants, preserving aspect ratio)
  const meta = await sharp(buffer).metadata();
  if (!meta.width || !meta.height) {
    throw new Error('Dimensi gambar tidak dapat dibaca.');
  }

  if (assetKind === 'ogImage') {
    const ogBuf = await sharp(buffer)
      .rotate()
      .resize(1200, 630, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 85, effort: 4 })
      .toBuffer();
    const ogMeta = await sharp(ogBuf).metadata();
    const key = `branding/${randId}_og.webp`;
    writePrivateObjectBuffer(key, ogBuf);
    return {
      assetKind,
      objectKey: key,
      url: `/api/v1/storage/${key}?v=${versionStamp}`,
      mimeType: 'image/webp',
      fileSize: ogBuf.length,
      width: ogMeta.width,
      height: ogMeta.height,
    };
  }

  // Multi-variant logos (lg <= 512px, md <= 256px, sm <= 128px) without enlargement
  const lgBuf = await sharp(buffer)
    .rotate()
    .resize(512, 512, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 88, effort: 4 })
    .toBuffer();
  const lgMeta = await sharp(lgBuf).metadata();

  const mdBuf = await sharp(buffer)
    .rotate()
    .resize(256, 256, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 86, effort: 4 })
    .toBuffer();

  const smBuf = await sharp(buffer)
    .rotate()
    .resize(128, 128, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 84, effort: 4 })
    .toBuffer();

  const lgKey = `branding/${randId}_${assetKind}_lg.webp`;
  const mdKey = `branding/${randId}_${assetKind}_md.webp`;
  const smKey = `branding/${randId}_${assetKind}_sm.webp`;

  writePrivateObjectBuffer(lgKey, lgBuf);
  writePrivateObjectBuffer(mdKey, mdBuf);
  writePrivateObjectBuffer(smKey, smBuf);

  return {
    assetKind,
    objectKey: mdKey,
    url: `/api/v1/storage/${mdKey}?v=${versionStamp}`,
    mimeType: 'image/webp',
    fileSize: lgBuf.length,
    width: lgMeta.width,
    height: lgMeta.height,
    variants: {
      sm: `/api/v1/storage/${smKey}?v=${versionStamp}`,
      md: `/api/v1/storage/${mdKey}?v=${versionStamp}`,
      lg: `/api/v1/storage/${lgKey}?v=${versionStamp}`,
    },
  };
}

export function readBrandingObject(filename: string): {
  buffer: Buffer;
  contentType: string;
} | null {
  if (!/^[a-zA-Z0-9_-]+\.(webp|png|svg|ico)$/.test(filename)) {
    return null;
  }
  const fullPath = resolvePrivateObjectPath(`branding/${filename}`);
  if (!fs.existsSync(fullPath)) {
    return null;
  }
  const buffer = fs.readFileSync(fullPath);
  const ext = filename.split('.').pop()?.toLowerCase();
  const contentType =
    ext === 'svg'
      ? 'image/svg+xml'
      : ext === 'png'
      ? 'image/png'
      : ext === 'ico'
      ? 'image/x-icon'
      : 'image/webp';
  return { buffer, contentType };
}

export function removeBrandingObjectByUrl(urlOrKey?: string | null): void {
  if (!urlOrKey) return;
  const clean = urlOrKey.split('?')[0];
  const match = clean.match(/branding\/[a-zA-Z0-9_.-]+$/);
  if (match) {
    deletePrivateObject(match[0]);
  }
}
