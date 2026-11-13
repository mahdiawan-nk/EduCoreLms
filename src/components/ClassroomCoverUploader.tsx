import React, { useState, useRef } from 'react';
import {
  UploadCloud,
  Image as ImageIcon,
  Trash2,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  FileImage,
} from 'lucide-react';
import { Button, ConfirmDialog } from './ui/primitives';
import { toast } from 'sonner';
import { useDeleteConfirmation } from '../hooks/useDeleteConfirmation';

export interface CoverMetadata {
  coverImagePath: string;
  coverThumbnailPath: string;
  coverMimeType: string;
  coverFileSize: number;
  coverWidth: number;
  coverHeight: number;
  coverUrl: string;
  thumbnailUrl: string;
}

interface ClassroomCoverUploaderProps {
  value?: CoverMetadata | null;
  onChange: (meta: CoverMetadata | null) => void;
  disabled?: boolean;
}

export function ClassroomCoverUploader({
  value,
  onChange,
  disabled = false,
}: ClassroomCoverUploaderProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const deleteConfirm = useDeleteConfirmation();

  const handleUploadFile = async (file: File) => {
    setErrorMsg(null);

    // Validate size (5MB max)
    const maxBytes = 5 * 1024 * 1024;
    if (file.size > maxBytes) {
      const err = `Ukuran berkas (${(file.size / (1024 * 1024)).toFixed(1)} MB) melebihi batas maksimal 5 MB.`;
      setErrorMsg(err);
      toast.error(err);
      return;
    }

    // Validate extension & mime
    const validTypes = ['image/jpeg', 'image/png', 'image/webp'];
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!validTypes.includes(file.type) && !['jpg', 'jpeg', 'png', 'webp'].includes(ext || '')) {
      const err = 'Format berkas tidak didukung. Harap gunakan JPG, PNG, atau WebP.';
      setErrorMsg(err);
      toast.error(err);
      return;
    }

    try {
      setIsUploading(true);
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/v1/classrooms/cover-image', {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error?.message || 'Gagal mengunggah dan mengoptimasi gambar.');
      }

      onChange(json.data);
      toast.success('Gambar sampul berhasil diunggah dan dioptimasi (WebP)!');
    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal mengunggah gambar sampul.');
      toast.error(err.message || 'Gagal mengunggah gambar.');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (!disabled && !isUploading) setIsDragging(true);
  };

  const onDragLeave = () => {
    setIsDragging(false);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (disabled || isUploading) return;
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleUploadFile(e.dataTransfer.files[0]);
    }
  };

  const handleRemove = () => {
    deleteConfirm.requestConfirmation({
      item: null,
      title: 'Hapus Gambar Sampul Kelas?',
      description: 'Apakah Anda yakin ingin menghapus gambar sampul ruang kelas ini?',
      itemName: 'Gambar Sampul Kelas (16:9 WebP)',
      warningText: 'Ruang kelas akan kembali menggunakan sampul default.',
      actionLabel: 'Ya, Hapus Sampul',
      successMessage: 'Gambar sampul dihapus.',
      onConfirm: () => {
        onChange(null);
        setErrorMsg(null);
      },
    });
  };

  return (
    <div className="space-y-3">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) {
            handleUploadFile(e.target.files[0]);
          }
        }}
        className="hidden"
        disabled={disabled || isUploading}
      />

      {value ? (
        /* Preview State */
        <div className="rounded-xl border border-slate-200 overflow-hidden bg-white shadow-2xs">
          <div className="relative aspect-16/9 w-full bg-slate-900 overflow-hidden group">
            <img
              src={value.coverUrl}
              alt="Classroom Cover Preview"
              className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-102"
            />
            <div className="absolute inset-0 bg-linear-to-t from-black/70 via-black/20 to-transparent flex items-end p-4">
              <div className="text-white space-y-1">
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold bg-emerald-500/90 text-white px-2 py-0.5 rounded-full backdrop-blur-xs">
                  <CheckCircle2 className="w-3 h-3" /> WebP Teroptimasi
                </span>
                <p className="text-xs font-medium text-slate-200">
                  {value.coverWidth} × {value.coverHeight} px • {(value.coverFileSize / 1024).toFixed(1)} KB
                </p>
              </div>
            </div>

            {/* Hover Actions */}
            <div className="absolute top-3 right-3 flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={disabled || isUploading}
                className="bg-white/90 hover:bg-white text-slate-800 text-xs shadow-md backdrop-blur-xs flex items-center gap-1.5 cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Ganti Cover
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleRemove}
                disabled={disabled || isUploading}
                className="bg-red-600 hover:bg-red-700 text-white border-red-600 text-xs shadow-md flex items-center gap-1.5 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" /> Hapus
              </Button>
            </div>
          </div>

          <div className="p-3 bg-slate-50 flex items-center justify-between text-xs text-slate-500 border-t border-slate-100">
            <span className="flex items-center gap-1.5">
              <FileImage className="w-4 h-4 text-blue-600" />
              Sampul kelas siap diterbitkan
            </span>
            <span className="font-mono text-[11px] text-slate-400">Rasio Aspek 16:9</span>
          </div>
        </div>
      ) : (
        /* Empty / Dropzone State */
        <div
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          onClick={() => !disabled && !isUploading && fileInputRef.current?.click()}
          className={`relative rounded-xl border-2 border-dashed p-6 text-center transition-all cursor-pointer ${
            isDragging
              ? 'border-blue-500 bg-blue-50/70 ring-4 ring-blue-500/10'
              : 'border-slate-300 hover:border-blue-400 bg-slate-50/50 hover:bg-white'
          } ${isUploading ? 'opacity-60 cursor-not-allowed' : ''}`}
        >
          <div className="mx-auto flex max-w-sm flex-col items-center justify-center space-y-2">
            <div className="p-3 rounded-full bg-blue-100/80 text-blue-600 mb-1">
              {isUploading ? (
                <RefreshCw className="w-6 h-6 animate-spin text-blue-600" />
              ) : (
                <UploadCloud className="w-6 h-6" />
              )}
            </div>

            <div className="text-sm font-semibold text-slate-800">
              {isUploading ? (
                'Mengoptimasi dan memproses gambar sampul...'
              ) : (
                <>
                  <span className="text-blue-600 hover:underline">Klik untuk telusuri</span> atau seret gambar ke sini
                </>
              )}
            </div>

            <p className="text-xs text-slate-500">
              Format didukung: <strong>JPG, JPEG, PNG, WebP</strong> (Maks. 5 MB).
              <br />
              Rekomendasi ukuran: <strong>1600 × 900 px (16:9)</strong>.
            </p>

            <span className="inline-block text-[11px] text-slate-400 bg-white px-2 py-0.5 rounded border border-slate-200 mt-2">
              Opsional • Sistem menyediakan sampul default jika dikosongkan
            </span>
          </div>
        </div>
      )}

      {errorMsg && (
        <div className="flex items-center gap-2 p-2.5 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
          <AlertCircle className="w-4 h-4 shrink-0 text-red-500" />
          <span>{errorMsg}</span>
        </div>
      )}
      <ConfirmDialog {...deleteConfirm.dialogProps} />
    </div>
  );
}
