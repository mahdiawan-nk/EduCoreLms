import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  X, Download, ZoomIn, ZoomOut, RotateCcw, FileText, FileSpreadsheet,
  Presentation, Image as ImageIcon, Film, AlertTriangle, Loader2, CheckCircle2,
  ExternalLink
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import { useModalBehavior } from './ui/modalUtils';

export interface PreviewAttachmentInfo {
  id: string;
  materialId: string;
  originalFileName?: string | null;
  fileName: string;
  mimeType: string;
  fileExtension?: string | null;
  fileSize: number;
  attachmentType?: string;
  description?: string | null;
  previewMode?: string | null;
  streamUrl?: string | null;
  downloadUrl?: string | null;
}

interface PreviewPayloadResponse {
  attachment: PreviewAttachmentInfo;
  preview: {
    mode: 'PDF' | 'DOCX_HTML' | 'SPREADSHEET' | 'IMAGE' | 'VIDEO' | 'PRESENTATION_FALLBACK' | 'FALLBACK';
    streamUrl: string;
    downloadUrl: string;
    html?: string;
    warnings?: string[];
    sheets?: Array<{ name: string; rows: string[][] }>;
    slides?: Array<{ slideNumber: number; text: string }>;
    message?: string;
  };
}

interface DocumentPreviewModalProps {
  materialId?: string;
  submissionId?: string;
  assignmentId?: string;
  attachmentId?: string | null;
  open?: boolean;
  isOpen?: boolean;
  attachment?: PreviewAttachmentInfo | null;
  preview?: PreviewPayloadResponse['preview'] | null;
  onClose: () => void;
  allowDownload?: boolean;
  initialVideoPosition?: number;
  onVideoProgress?: (currentTime: number, duration: number) => void;
}

export function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function DocumentPreviewModal({
  materialId,
  submissionId,
  assignmentId,
  attachmentId,
  open,
  isOpen,
  attachment: directAttachment,
  preview: directPreview,
  onClose,
  allowDownload = true,
  initialVideoPosition = 0,
  onVideoProgress,
}: DocumentPreviewModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<PreviewPayloadResponse | null>(null);
  const [activeSheetIdx, setActiveSheetIdx] = useState(0);
  const [imageZoom, setImageZoom] = useState(100);
  const [playbackRate, setPlaybackRate] = useState(1);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);

  useModalBehavior({
    open: Boolean(open),
    containerRef: dialogRef,
    onClose,
  });

  useEffect(() => {
    if (directAttachment && directPreview) {
      setData({ attachment: directAttachment, preview: directPreview });
      setLoading(false);
      setError(null);
      return;
    }
    if (!attachmentId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setData(null);
    setActiveSheetIdx(0);
    setImageZoom(100);

    const previewEndpoint = submissionId
      ? `/api/v1/submissions/${submissionId}/preview?attachmentId=${attachmentId}`
      : assignmentId
      ? `/api/v1/assignments/${assignmentId}/preview?attachmentId=${attachmentId}`
      : `/api/v1/materials/${materialId}/preview?attachmentId=${attachmentId}`;

    apiFetch<PreviewPayloadResponse>(previewEndpoint)
      .then((res) => {
        if (!cancelled) {
          setData(res);
          setLoading(false);
        }
      })
      .catch((err: any) => {
        if (!cancelled) {
          setError(err.message || 'Gagal memuat pratinjau dokumen.');
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [materialId, submissionId, assignmentId, attachmentId, directAttachment, directPreview]);

  const isVisible =
    open !== undefined
      ? open
      : isOpen !== undefined
      ? isOpen
      : Boolean(attachmentId || (directAttachment && directPreview));

  if (!isVisible) return null;

  const att = data?.attachment || directAttachment;
  const preview = data?.preview || directPreview;
  const displayName = att?.originalFileName || att?.fileName || 'Berkas Lampiran';

  const handleVideoLoadedMetadata = () => {
    if (videoRef.current && initialVideoPosition > 0) {
      if (initialVideoPosition < videoRef.current.duration - 2) {
        videoRef.current.currentTime = initialVideoPosition;
      }
    }
  };

  const handleVideoRateChange = (rate: number) => {
    setPlaybackRate(rate);
    if (videoRef.current) {
      videoRef.current.playbackRate = rate;
    }
  };

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[1000] bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={displayName || 'Pratinjau Dokumen'}
        tabIndex={-1}
        className="bg-white rounded-xl border border-slate-200 shadow-2xl w-full max-w-6xl h-[calc(100dvh-1.5rem)] sm:h-[calc(100dvh-3rem)] my-auto flex flex-col overflow-hidden outline-none"
      >
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-slate-200 bg-slate-900 text-white flex items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center shrink-0">
              {preview?.mode === 'PDF' && <FileText className="w-4 h-4 text-rose-400" />}
              {preview?.mode === 'DOCX_HTML' && <FileText className="w-4 h-4 text-blue-400" />}
              {preview?.mode === 'SPREADSHEET' && <FileSpreadsheet className="w-4 h-4 text-emerald-400" />}
              {preview?.mode === 'IMAGE' && <ImageIcon className="w-4 h-4 text-amber-400" />}
              {preview?.mode === 'VIDEO' && <Film className="w-4 h-4 text-purple-400" />}
              {(!preview || preview.mode === 'PRESENTATION_FALLBACK' || preview.mode === 'FALLBACK') && (
                <Presentation className="w-4 h-4 text-amber-400" />
              )}
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-white truncate">{displayName}</h3>
              <div className="flex items-center gap-3 text-[11px] font-mono tabular-nums text-slate-400">
                {att && (
                  <>
                    <span className="uppercase">{att.fileExtension || att.mimeType}</span>
                    <span>•</span>
                    <span>{formatBytes(att.fileSize)}</span>
                  </>
                )}
                <span>•</span>
                <span className="text-emerald-400">S3 Signed Protected Stream</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {preview?.mode === 'IMAGE' && (
              <div className="flex items-center gap-1 bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 mr-2">
                <button
                  type="button"
                  onClick={() => setImageZoom((z) => Math.max(50, z - 25))}
                  className="p-1 text-slate-300 hover:text-white"
                  title="Perkecil"
                >
                  <ZoomOut className="w-4 h-4" />
                </button>
                <span className="text-xs font-mono tabular-nums px-1.5 text-slate-200">{imageZoom}%</span>
                <button
                  type="button"
                  onClick={() => setImageZoom((z) => Math.min(250, z + 25))}
                  className="p-1 text-slate-300 hover:text-white"
                  title="Perbesar"
                >
                  <ZoomIn className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setImageZoom(100)}
                  className="p-1 text-slate-300 hover:text-white"
                  title="Reset Zoom"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {preview?.mode === 'VIDEO' && (
              <div className="flex items-center gap-1 bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 mr-2">
                <span className="text-[11px] text-slate-400 mr-1">Kecepatan:</span>
                {[0.75, 1, 1.25, 1.5, 2].map((rate) => (
                  <button
                    key={rate}
                    type="button"
                    onClick={() => handleVideoRateChange(rate)}
                    className={`px-1.5 py-0.5 rounded text-[11px] font-mono tabular-nums transition ${
                      playbackRate === rate
                        ? 'bg-amber-500 text-slate-950 font-bold'
                        : 'text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    {rate}x
                  </button>
                ))}
              </div>
            )}

            {allowDownload && preview?.downloadUrl && (
              <a
                href={preview.downloadUrl}
                download={displayName}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold transition"
              >
                <Download className="w-3.5 h-3.5" /> Unduh Berkas
              </a>
            )}

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition"
              title="Tutup Pratinjau"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 bg-slate-100 overflow-auto relative flex flex-col">
          {loading && (
            <div className="flex-1 flex flex-col items-center justify-center p-12 text-slate-600">
              <Loader2 className="w-8 h-8 animate-spin text-slate-900 mb-3" />
              <p className="text-sm font-semibold">Memproses pratinjau dokumen terisolasi...</p>
              <p className="text-xs text-slate-500 mt-1">Mengambil stream terotorisasi dari penyimpanan objek S3 privat</p>
            </div>
          )}

          {error && (
            <div className="flex-1 flex flex-col items-center justify-center p-12 text-center">
              <div className="w-12 h-12 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center mb-3">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <h4 className="text-base font-bold text-slate-900">Gagal Memuat Pratinjau</h4>
              <p className="text-xs text-slate-600 max-w-md mt-1">{error}</p>
            </div>
          )}

          {!loading && !error && preview && (
            <>
              {/* PDF Embedded Viewer */}
              {preview.mode === 'PDF' && (
                <div className="flex-1 w-full h-full flex flex-col bg-slate-800">
                  <iframe
                    src={preview.streamUrl}
                    title={displayName}
                    className="w-full flex-1 border-0"
                  />
                </div>
              )}

              {/* DOCX Sanitized HTML Viewer */}
              {preview.mode === 'DOCX_HTML' && (
                <div className="flex-1 overflow-y-auto p-6 sm:p-10">
                  <div className="max-w-4xl mx-auto bg-white border border-slate-200 rounded-xl shadow-xs p-8 sm:p-12">
                    <div className="pb-4 mb-6 border-b border-slate-100 flex items-center justify-between text-xs text-slate-500">
                      <span className="font-semibold uppercase tracking-wider text-slate-700">
                        Pratinjau Dokumen Word (Konversi HTML Terisolasi)
                      </span>
                      <span className="font-mono text-[11px] text-emerald-700 flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Sanitized via Mammoth Engine
                      </span>
                    </div>
                    <div
                      className="tiptap-editor-content prose max-w-none text-slate-800 leading-relaxed"
                      dangerouslySetInnerHTML={{ __html: preview.html || '<p>Dokumen kosong.</p>' }}
                    />
                  </div>
                </div>
              )}

              {/* XLSX / XLS Spreadsheet Table Viewer */}
              {preview.mode === 'SPREADSHEET' && (
                <div className="flex-1 flex flex-col overflow-hidden bg-white">
                  {/* Sheet Selector Tabs */}
                  {preview.sheets && preview.sheets.length > 0 && (
                    <div className="px-4 py-2 bg-slate-100 border-b border-slate-200 flex items-center gap-2 overflow-x-auto shrink-0">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mr-2">
                        Lembar Kerja (Sheet):
                      </span>
                      {preview.sheets.map((sh, idx) => (
                        <button
                          key={sh.name}
                          type="button"
                          onClick={() => setActiveSheetIdx(idx)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                            activeSheetIdx === idx
                              ? 'bg-slate-900 text-white shadow-xs'
                              : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
                          }`}
                        >
                          {sh.name}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Data Table */}
                  <div className="flex-1 overflow-auto p-4">
                    {preview.sheets && preview.sheets[activeSheetIdx] ? (
                      <div className="border border-slate-200 rounded-lg overflow-hidden inline-block min-w-full">
                        <table className="min-w-full border-collapse text-xs">
                          <tbody>
                            {preview.sheets[activeSheetIdx].rows.map((row, rIdx) => (
                              <tr
                                key={rIdx}
                                className={
                                  rIdx === 0
                                    ? 'bg-slate-900 text-white font-bold'
                                    : rIdx % 2 === 0
                                    ? 'bg-white'
                                    : 'bg-slate-50/80'
                                }
                              >
                                <td className="px-2.5 py-1.5 border border-slate-200 text-[10px] font-mono tabular-nums text-slate-400 bg-slate-100 text-center select-none w-10">
                                  {rIdx + 1}
                                </td>
                                {row.map((cell, cIdx) => (
                                  <td
                                    key={cIdx}
                                    className={`px-3 py-2 border ${
                                      rIdx === 0
                                        ? 'border-slate-700 text-white font-semibold'
                                        : 'border-slate-200 text-slate-800 font-mono tabular-nums'
                                    }`}
                                  >
                                    {cell !== '' ? cell : <span className="text-slate-300">—</span>}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <p className="text-sm text-slate-500 p-6">Tidak ada baris data pada lembar kerja ini.</p>
                    )}
                  </div>
                </div>
              )}

              {/* Image Zoom Viewer */}
              {preview.mode === 'IMAGE' && (
                <div className="flex-1 overflow-auto flex items-center justify-center p-6 bg-slate-900/95">
                  <img
                    src={preview.streamUrl}
                    alt={displayName}
                    style={{ width: `${imageZoom}%`, maxWidth: 'none' }}
                    className="rounded-lg shadow-xl transition-all duration-150 object-contain"
                  />
                </div>
              )}

              {/* Video Player with Range Streaming & Resume Playback */}
              {preview.mode === 'VIDEO' && (
                <div className="flex-1 flex flex-col items-center justify-center bg-slate-950 p-6">
                  <video
                    ref={videoRef}
                    src={preview.streamUrl}
                    controls
                    controlsList={allowDownload ? undefined : 'nodownload'}
                    onLoadedMetadata={handleVideoLoadedMetadata}
                    onTimeUpdate={(e) => {
                      if (onVideoProgress) {
                        const el = e.currentTarget;
                        onVideoProgress(el.currentTime, el.duration || 0);
                      }
                    }}
                    className="max-h-[72vh] w-full max-w-4xl rounded-xl border border-slate-800 shadow-2xl bg-black"
                  >
                    Browser Anda tidak mendukung pemutaran video HTML5.
                  </video>
                </div>
              )}

              {/* Presentation / Legacy Office Fallback with Slide Text Extraction */}
              {(preview.mode === 'PRESENTATION_FALLBACK' || preview.mode === 'FALLBACK') && (
                <div className="flex-1 overflow-y-auto p-6 sm:p-10">
                  <div className="max-w-3xl mx-auto bg-white border border-slate-200 rounded-xl p-6 sm:p-8 shadow-xs">
                    <div className="flex items-start gap-4 pb-6 border-b border-slate-200">
                      <div className="w-12 h-12 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center shrink-0">
                        <Presentation className="w-6 h-6" />
                      </div>
                      <div className="flex-1">
                        <h4 className="text-base font-bold text-slate-900">{displayName}</h4>
                        <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                          {preview.message ||
                            'Format dokumen ini memerlukan aplikasi desktop atau unduhan langsung untuk menampilkan tata letak penuh.'}
                        </p>
                        {allowDownload && preview.downloadUrl && (
                          <div className="mt-4 flex flex-wrap items-center gap-3">
                            <a
                              href={preview.downloadUrl}
                              download={displayName}
                              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition"
                            >
                              <Download className="w-4 h-4" /> Unduh Berkas Asli ({formatBytes(att?.fileSize || 0)})
                            </a>
                            <a
                              href={preview.streamUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-semibold transition"
                            >
                              <ExternalLink className="w-3.5 h-3.5" /> Buka Stream Langsung
                            </a>
                          </div>
                        )}
                      </div>
                    </div>

                    {preview.slides && preview.slides.length > 0 && (
                      <div className="mt-6 space-y-4">
                        <h5 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                          Ekstraksi Ringkasan Teks Slide ({preview.slides.length} Slide Terdeteksi)
                        </h5>
                        <div className="space-y-3">
                          {preview.slides.map((sl) => (
                            <div
                              key={sl.slideNumber}
                              className="p-4 rounded-lg bg-slate-50 border border-slate-200"
                            >
                              <div className="text-[11px] font-mono font-bold text-amber-700 uppercase mb-1">
                                Slide #{sl.slideNumber}
                              </div>
                              <p className="text-xs text-slate-800 leading-relaxed">{sl.text}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
