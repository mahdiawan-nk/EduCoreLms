import { apiFetch } from './api';

export interface PresignedUploadResult {
  id: string;
  materialId: string;
  originalFileName: string;
  fileName: string;
  mimeType: string;
  fileExtension: string;
  fileSize: number;
  storageKey: string;
  attachmentType: 'DOCUMENT' | 'IMAGE' | 'VIDEO' | 'ARCHIVE';
  previewMode: string;
  description: string | null;
  sortOrder: number;
  checksum: string;
  streamUrl: string;
  downloadUrl: string;
}

export async function computeFileSha256(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function uploadMaterialAttachmentToS3(params: {
  materialId: string;
  file: File;
  description?: string;
  sortOrder?: number;
  onProgress?: (percent: number) => void;
}): Promise<PresignedUploadResult> {
  const { materialId, file, description, sortOrder = 1, onProgress } = params;

  if (onProgress) onProgress(5);

  // 1. Request signed PUT URL from backend
  const presigned = await apiFetch<{
    uploadUrl: string;
    objectKey: string;
    bucketName: string;
    storageProvider: string;
    attachmentType: 'DOCUMENT' | 'IMAGE' | 'VIDEO' | 'ARCHIVE';
    previewMode: string;
    extension: string;
    mimeType: string;
  }>(`/api/v1/materials/${materialId}/attachments/upload-url`, {
    method: 'POST',
    body: JSON.stringify({
      fileName: file.name,
      mimeType: file.type || 'application/octet-stream',
      fileSize: file.size,
    }),
  });

  if (onProgress) onProgress(15);

  // 2. Compute SHA-256 checksum
  const checksum = await computeFileSha256(file);

  // 3. Upload raw binary via XMLHttpRequest PUT to signed S3 URL with progress events
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', presigned.uploadUrl, true);
    xhr.setRequestHeader('Content-Type', presigned.mimeType || file.type || 'application/octet-stream');

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) {
        const ratio = event.loaded / event.total;
        const pct = Math.min(90, Math.round(15 + ratio * 75));
        onProgress(pct);
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        try {
          const errJson = JSON.parse(xhr.responseText);
          reject(new Error(errJson?.error?.message || `Unggah S3 gagal (${xhr.status})`));
        } catch {
          reject(new Error(`Unggah S3 gagal dengan status ${xhr.status}`));
        }
      }
    };

    xhr.onerror = () => {
      reject(new Error('Koneksi jaringan terputus saat mengunggah ke penyimpanan objek S3.'));
    };

    xhr.send(file);
  });

  if (onProgress) onProgress(95);

  // 4. Confirm upload and verify magic bytes + SHA-256 checksum on server
  const confirmed = await apiFetch<PresignedUploadResult>(
    `/api/v1/materials/${materialId}/attachments/confirm`,
    {
      method: 'POST',
      body: JSON.stringify({
        objectKey: presigned.objectKey,
        originalFileName: file.name,
        mimeType: presigned.mimeType || file.type || 'application/octet-stream',
        fileSize: file.size,
        checksum,
        description: description || null,
        sortOrder,
      }),
    }
  );

  if (onProgress) onProgress(100);
  return confirmed;
}

export async function uploadAssignmentAttachmentToS3(params: {
  assignmentId: string;
  file: File;
  description?: string;
  sortOrder?: number;
  onProgress?: (percent: number) => void;
}): Promise<any> {
  const { assignmentId, file, description, sortOrder = 1, onProgress } = params;

  if (onProgress) onProgress(10);

  const presigned = await apiFetch<{
    uploadUrl: string;
    objectKey: string;
    extension: string;
    mimeType: string;
  }>(`/api/v1/assignments/${assignmentId}/attachments/upload-url`, {
    method: 'POST',
    body: JSON.stringify({
      fileName: file.name,
      mimeType: file.type || 'application/octet-stream',
      fileSize: file.size,
    }),
  });

  if (onProgress) onProgress(20);
  const checksum = await computeFileSha256(file);

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', presigned.uploadUrl, true);
    xhr.setRequestHeader(
      'Content-Type',
      presigned.mimeType || file.type || 'application/octet-stream'
    );
    xhr.upload.onprogress = (ev) => {
      if (ev.lengthComputable && onProgress) {
        onProgress(Math.min(90, Math.round(20 + (ev.loaded / ev.total) * 70)));
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`Unggah berkas tugas gagal (${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error('Koneksi terputus saat mengunggah ke S3.'));
    xhr.send(file);
  });

  if (onProgress) onProgress(95);

  const confirmed = await apiFetch<any>(
    `/api/v1/assignments/${assignmentId}/attachments/confirm`,
    {
      method: 'POST',
      body: JSON.stringify({
        objectKey: presigned.objectKey,
        originalFileName: file.name,
        mimeType: presigned.mimeType || file.type || 'application/octet-stream',
        fileSize: file.size,
        checksum,
        description: description || '',
        sortOrder,
      }),
    }
  );

  if (onProgress) onProgress(100);
  return confirmed;
}

export async function uploadSubmissionAttachmentToS3(params: {
  assignmentId: string;
  file: File;
  description?: string;
  onProgress?: (percent: number) => void;
}): Promise<any> {
  const { assignmentId, file, description, onProgress } = params;

  if (onProgress) onProgress(10);

  const presigned = await apiFetch<{
    uploadUrl: string;
    objectKey: string;
    extension: string;
    mimeType: string;
  }>(`/api/v1/assignments/${assignmentId}/submission-upload-url`, {
    method: 'POST',
    body: JSON.stringify({
      fileName: file.name,
      mimeType: file.type || 'application/octet-stream',
      fileSize: file.size,
    }),
  });

  if (onProgress) onProgress(25);

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', presigned.uploadUrl, true);
    xhr.setRequestHeader(
      'Content-Type',
      presigned.mimeType || file.type || 'application/octet-stream'
    );
    xhr.upload.onprogress = (ev) => {
      if (ev.lengthComputable && onProgress) {
        onProgress(Math.min(90, Math.round(25 + (ev.loaded / ev.total) * 65)));
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`Unggah berkas jawaban gagal (${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error('Koneksi terputus saat mengunggah ke S3.'));
    xhr.send(file);
  });

  if (onProgress) onProgress(95);

  const confirmed = await apiFetch<any>(
    `/api/v1/assignments/${assignmentId}/submission-upload-confirm`,
    {
      method: 'POST',
      body: JSON.stringify({
        objectKey: presigned.objectKey,
        originalFileName: file.name,
        mimeType: presigned.mimeType || file.type || 'application/octet-stream',
        fileSize: file.size,
        description: description || '',
      }),
    }
  );

  if (onProgress) onProgress(100);
  return confirmed;
}

