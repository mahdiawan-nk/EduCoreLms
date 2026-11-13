import React, { useRef, useState } from 'react';
import { Image as ImageIcon, Music, UploadCloud, Trash2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { apiFetch } from '../../lib/api';
import { Button } from '../ui/primitives';

export interface UploadedQuestionMedia {
  mediaType: 'IMAGE' | 'AUDIO';
  objectKey: string;
  thumbnailKey?: string | null;
  mimeType: string;
  fileSize: number;
  width?: number | null;
  height?: number | null;
  durationSeconds?: number | null;
  originalName: string;
  optimizedFilename?: string | null;
  url: string;
  thumbnailUrl?: string | null;
}

export function QuestionMediaUploader({
  value,
  onAdd,
  onRemove,
}: {
  value: UploadedQuestionMedia[];
  onAdd: (media: UploadedQuestionMedia) => void;
  onRemove: (index: number) => void;
}) {
  const imgInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const [uploadingType, setUploadingType] = useState<'IMAGE' | 'AUDIO' | null>(null);

  const handleUpload = async (file: File, kind: 'IMAGE' | 'AUDIO') => {
    setUploadingType(kind);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const endpoint =
        kind === 'IMAGE'
          ? '/api/v1/questions/media/upload-image'
          : '/api/v1/questions/media/upload-audio';
      const uploaded = await apiFetch<UploadedQuestionMedia>(endpoint, {
        method: 'POST',
        body: formData,
      });
      onAdd(uploaded);
      toast.success(
        kind === 'IMAGE'
          ? 'Gambar soal berhasil dioptimalkan (WebP) & diunggah.'
          : 'Audio soal berhasil diunggah.'
      );
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Gagal mengunggah media.');
    } finally {
      setUploadingType(null);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={imgInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleUpload(f, 'IMAGE');
            e.target.value = '';
          }}
        />
        <input
          ref={audioInputRef}
          type="file"
          accept="audio/mpeg,audio/wav,audio/mp4,audio/ogg,audio/webm,.mp3,.wav,.m4a,.ogg,.webm"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleUpload(f, 'AUDIO');
            e.target.value = '';
          }}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={uploadingType !== null}
          onClick={() => imgInputRef.current?.click()}
        >
          <ImageIcon className="h-3.5 w-3.5 mr-1.5" />
          {uploadingType === 'IMAGE' ? 'Mengoptimalkan Gambar...' : 'Sisipkan Gambar (WebP)'}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={uploadingType !== null}
          onClick={() => audioInputRef.current?.click()}
        >
          <Music className="h-3.5 w-3.5 mr-1.5" />
          {uploadingType === 'AUDIO' ? 'Mengunggah Audio...' : 'Sisipkan Audio (MP3/WAV/OGG)'}
        </Button>
      </div>

      {value.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {value.map((m, idx) => (
            <div
              key={`${m.objectKey}-${idx}`}
              className="p-3 rounded-lg border border-slate-200 bg-slate-50 flex flex-col gap-2"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-semibold text-slate-700 truncate">
                  {m.originalName} ({Math.max(1, Math.round(m.fileSize / 1024))} KB)
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => onRemove(idx)}
                  title="Hapus lampiran media"
                >
                  <Trash2 className="h-3.5 w-3.5 text-rose-600" />
                </Button>
              </div>
              {m.mediaType === 'IMAGE' ? (
                <img
                  src={m.thumbnailUrl || m.url}
                  alt={m.originalName}
                  loading="lazy"
                  className="w-full h-32 object-contain rounded border border-slate-200 bg-white"
                />
              ) : (
                <audio controls preload="metadata" className="w-full h-9" src={m.url} />
              )}
              {m.width && m.height ? (
                <div className="text-[10px] text-slate-400">
                  Dimensi teroptimasi: {m.width} × {m.height} px
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
