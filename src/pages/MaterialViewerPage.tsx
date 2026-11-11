import React, { useState, useEffect, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, ArrowRight, CheckCircle2, Clock, FileText, FileSpreadsheet,
  Presentation, Image as ImageIcon, Film, Download, Eye, MessageSquare,
  Send, Edit3, ShieldCheck, BookOpen, Play, Sparkles, ZoomIn
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import { AppShell } from '../components/AppShell';
import { useAuth } from '../context/AuthContext';
import { TiptapReadOnlyRenderer } from '../components/TiptapMaterialEditor';
import { DocumentPreviewModal, formatBytes } from '../components/DocumentPreviewModal';

export function MaterialViewerPage() {
  const { classroomId, materialId } = useParams<{
    classroomId: string;
    materialId: string;
  }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [previewAttachmentId, setPreviewAttachmentId] = useState<string | null>(null);
  const [commentText, setCommentText] = useState('');
  const [videoPlaybackRates, setVideoPlaybackRates] = useState<Record<string, number>>({});
  const videoRefs = useRef<Record<string, HTMLVideoElement | null>>({});
  const lastProgressSyncRef = useRef<number>(0);

  const isInstructorOrAdmin =
    user?.roles.includes('SUPERADMIN') || user?.roles.includes('DOSEN');

  const {
    data: material,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['material-detail', materialId],
    queryFn: () => apiFetch<any>(`/api/v1/materials/${materialId}`),
    enabled: Boolean(materialId),
  });

  // Update progress mutation
  const progressMutation = useMutation({
    mutationFn: (payload: {
      status?: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED';
      progressPercent?: number;
      lastPosition?: number;
      scrollPercent?: number;
      videoWatchSeconds?: number;
    }) =>
      apiFetch<any>(`/api/v1/materials/${materialId}/progress`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['material-detail', materialId] });
      queryClient.invalidateQueries({ queryKey: ['classroom-detail', classroomId] });
    },
  });

  // Record initial view / scroll progress when student opens material
  useEffect(() => {
    if (!material || !materialId) return;
    const currentProgress = material.myProgress;
    if (!currentProgress || currentProgress.status === 'NOT_STARTED') {
      const targetPct = material.completionRule === 'VIEW' ? 100 : 25;
      progressMutation.mutate({
        status: material.completionRule === 'VIEW' ? 'COMPLETED' : 'IN_PROGRESS',
        progressPercent: targetPct,
        scrollPercent: 25,
      });
    }
  }, [material?.id]);

  // Comment mutation
  const commentMutation = useMutation({
    mutationFn: (body: string) =>
      apiFetch(`/api/v1/materials/${materialId}/comments`, {
        method: 'POST',
        body: JSON.stringify({ body }),
      }),
    onSuccess: () => {
      setCommentText('');
      queryClient.invalidateQueries({ queryKey: ['material-detail', materialId] });
    },
  });

  if (isLoading) {
    return (
      <AppShell breadcrumb="Memuat Materi Pembelajaran...">
        <div className="p-12 text-center text-slate-600 font-medium">
          Memuat materi pembelajaran dan memverifikasi akses kelas...
        </div>
      </AppShell>
    );
  }

  if (error || !material) {
    return (
      <AppShell breadcrumb="Materi Tidak Dapat Diakses">
        <div className="max-w-3xl mx-auto p-8 bg-white rounded-xl border border-rose-200 text-center space-y-4">
          <h2 className="text-lg font-bold text-slate-900">Materi Tidak Dapat Diakses</h2>
          <p className="text-xs text-slate-600">
            {(error as any)?.message || 'Materi pembelajaran tidak ditemukan atau belum diterbitkan.'}
          </p>
          <Link
            to={`/classrooms/${classroomId}`}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-slate-900 text-white text-xs font-bold"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Kembali ke Ruang Kelas
          </Link>
        </div>
      </AppShell>
    );
  }

  const attachments: any[] = material.attachments || [];
  const imageAttachments = attachments.filter((a) => a.attachmentType === 'IMAGE');
  const documentAttachments = attachments.filter((a) => a.attachmentType !== 'IMAGE');
  const videos: any[] = material.videos || [];
  const myProgress = material.myProgress || {
    status: 'NOT_STARTED',
    progressPercent: 0,
    lastPosition: 0,
    videoWatchSeconds: 0,
  };

  const handleOpenPreview = (attId: string) => {
    setPreviewAttachmentId(attId);
    const nextPct =
      material.completionRule === 'ATTACHMENT_OPEN'
        ? 100
        : Math.max(myProgress.progressPercent || 0, 60);
    progressMutation.mutate({
      progressPercent: nextPct,
      status: nextPct >= (material.minCompletionPercent || 100) ? 'COMPLETED' : 'IN_PROGRESS',
    });
  };

  const handleVideoTimeUpdate = (currentTime: number, duration: number) => {
    const now = Date.now();
    if (now - lastProgressSyncRef.current < 5000) return;
    lastProgressSyncRef.current = now;

    const watchRatio = duration > 0 ? Math.min(100, Math.round((currentTime / duration) * 100)) : 50;
    const nextPct = Math.max(myProgress.progressPercent || 0, watchRatio);
    progressMutation.mutate({
      lastPosition: Math.floor(currentTime),
      videoWatchSeconds: Math.max(myProgress.videoWatchSeconds || 0, Math.floor(currentTime)),
      progressPercent: nextPct,
    });
  };

  return (
    <AppShell breadcrumb={material.title}>
      <div className="max-w-6xl mx-auto space-y-6 pb-16">
        {/* Top Navigation & Progress Status Bar */}
      <div className="bg-white rounded-xl border border-slate-200 px-5 py-4 shadow-xs flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            to={`/classrooms/${classroomId || material.classroomId}`}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-xs font-semibold text-slate-700 transition"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Daftar Modul Kelas
          </Link>
          <div className="text-xs text-slate-500 font-mono tabular-nums">
            {material.topic?.title ? (
              <span>
                Modul #{material.topic.sequenceOrder}: <strong className="text-slate-800">{material.topic.title}</strong>
              </span>
            ) : (
              <span>Materi Umum Kelas</span>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Progress Meter */}
          <div className="flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-lg px-3.5 py-1.5">
            <div className="text-right">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Progres Belajar Anda
              </div>
              <div className="text-xs font-mono tabular-nums font-bold text-slate-900">
                {myProgress.progressPercent || 0}% •{' '}
                {myProgress.status === 'COMPLETED' ? (
                  <span className="text-emerald-700">SELESAI</span>
                ) : (
                  <span className="text-amber-700">SEDANG DIPELAJARI</span>
                )}
              </div>
            </div>
            <div className="w-20 h-2 bg-slate-200 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all duration-300 ${
                  myProgress.status === 'COMPLETED' ? 'bg-emerald-600' : 'bg-amber-500'
                }`}
                style={{ width: `${myProgress.progressPercent || 0}%` }}
              />
            </div>
          </div>

          {/* Mark Completed Button */}
          {myProgress.status !== 'COMPLETED' ? (
            <button
              type="button"
              onClick={() =>
                progressMutation.mutate({
                  status: 'COMPLETED',
                  progressPercent: 100,
                  scrollPercent: 100,
                })
              }
              disabled={progressMutation.isPending}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold transition shadow-xs"
            >
              <CheckCircle2 className="w-4 h-4" /> Tandai Selesai Dipelajari
            </button>
          ) : (
            <button
              type="button"
              onClick={() =>
                progressMutation.mutate({
                  status: 'IN_PROGRESS',
                  progressPercent: 50,
                })
              }
              disabled={progressMutation.isPending}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-800 text-xs font-bold transition"
            >
              <CheckCircle2 className="w-4 h-4 text-emerald-600" /> Materi Telah Tuntas
            </button>
          )}

          {isInstructorOrAdmin && (
            <Link
              to={`/classrooms/${classroomId || material.classroomId}/materials/${material.id}/edit`}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition"
            >
              <Edit3 className="w-3.5 h-3.5 text-amber-400" /> Edit di Material Builder
            </Link>
          )}
        </div>
      </div>

      {/* Main Material Hero & Metadata Header */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
        {material.coverImageUrl && (
          <div className="max-h-72 w-full overflow-hidden bg-slate-900 border-b border-slate-200">
            <img
              src={material.coverImageUrl}
              alt={material.title}
              className="w-full max-h-72 object-cover"
            />
          </div>
        )}

        <div className="p-6 sm:p-8 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-mono tabular-nums text-slate-500">
            <div className="flex flex-wrap items-center gap-2.5 uppercase tracking-wider">
              <span className="font-bold text-slate-900">
                PERTEMUAN #{material.meetingNumber || 1}
              </span>
              <span>•</span>
              <span className="flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-amber-600" /> Estimasi{' '}
                {material.estimatedDurationMinutes || 45} Menit
              </span>
              <span>•</span>
              <span>
                {material.isRequired ? 'Wajib Dipelajari' : 'Materi Pengayaan Opsional'}
              </span>
              <span>•</span>
              <span>Revisi v{material.versionNumber || 1}</span>
            </div>
            <div>
              Status: <strong className="text-slate-800">{material.status}</strong>
            </div>
          </div>

          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 leading-tight">
              {material.title}
            </h1>
            {material.subtitle && (
              <p className="text-base font-medium text-slate-600 mt-1.5">
                {material.subtitle}
              </p>
            )}
          </div>

          {material.shortDescription && (
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-700 leading-relaxed">
              <span className="font-bold text-slate-900 uppercase tracking-wider block mb-1 text-[11px]">
                Ringkasan Capaian Pembelajaran:
              </span>
              {material.shortDescription}
            </div>
          )}

          <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-4 text-xs text-slate-500">
            <div>
              Disusun oleh:{' '}
              <strong className="text-slate-800">
                {material.authorName || 'Dosen Pengampu Politeknik Kampar'}
              </strong>
            </div>
            {material.publishedAt && (
              <div className="font-mono tabular-nums">
                Diterbitkan: {new Date(material.publishedAt).toLocaleString('id-ID')}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Rich Text Educational Content (Canonical Tiptap JSON Renderer) */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 sm:p-10 shadow-xs">
        <div className="flex items-center justify-between pb-4 mb-6 border-b border-slate-100">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500">
            <BookOpen className="w-4 h-4 text-slate-900" /> Uraian Materi & Modul Perkuliahan
          </div>
          <span className="text-[11px] font-mono text-slate-400">
            Structured Tiptap Document
          </span>
        </div>

        <TiptapReadOnlyRenderer
          contentJson={material.contentJson}
          fallbackHtml={material.contentHtml}
        />
      </div>

      {/* Embedded Videos Section */}
      {videos.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-6 sm:p-8 shadow-xs space-y-5">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <div className="flex items-center gap-2.5">
              <Film className="w-5 h-5 text-slate-900" />
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  Video Pembelajaran Terintegrasi ({videos.length})
                </h2>
                <p className="text-xs text-slate-500">
                  Pemutaran mendukung pelacakan durasi tontonan dan melanjutkan posisi terakhir (Resume Playback)
                </p>
              </div>
            </div>
            {myProgress.lastPosition > 0 && (
              <span className="text-xs font-mono tabular-nums text-amber-700 font-semibold">
                Posisi Terakhir Tersimpan: Detik ke-{myProgress.lastPosition}
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 gap-6">
            {videos.map((v) => {
              const currentRate = videoPlaybackRates[v.id] || 1;
              return (
                <div
                  key={v.id}
                  className="rounded-xl border border-slate-200 overflow-hidden bg-slate-950 text-white"
                >
                  <div className="px-5 py-3 bg-slate-900 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-bold text-white">{v.title}</h3>
                      {v.description && (
                        <p className="text-xs text-slate-400 mt-0.5">{v.description}</p>
                      )}
                    </div>

                    {v.videoType === 'UPLOAD' && (
                      <div className="flex items-center gap-1.5 bg-slate-800 px-2.5 py-1 rounded-lg border border-slate-700">
                        <span className="text-[11px] text-slate-400 mr-1">Kecepatan:</span>
                        {[0.75, 1, 1.25, 1.5, 2].map((rate) => (
                          <button
                            key={rate}
                            type="button"
                            onClick={() => {
                              setVideoPlaybackRates((prev) => ({ ...prev, [v.id]: rate }));
                              const el = videoRefs.current[v.id];
                              if (el) el.playbackRate = rate;
                            }}
                            className={`px-1.5 py-0.5 rounded text-[11px] font-mono tabular-nums ${
                              currentRate === rate
                                ? 'bg-amber-500 text-slate-950 font-bold'
                                : 'text-slate-300 hover:bg-slate-700'
                            }`}
                          >
                            {rate}x
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="aspect-video w-full bg-black flex items-center justify-center">
                    {v.videoType === 'UPLOAD' && v.streamUrl ? (
                      <video
                        ref={(el) => {
                          videoRefs.current[v.id] = el;
                        }}
                        src={v.streamUrl}
                        controls
                        onLoadedMetadata={(e) => {
                          if (myProgress.lastPosition > 0) {
                            const vidEl = e.currentTarget;
                            if (myProgress.lastPosition < (vidEl.duration || 0) - 2) {
                              vidEl.currentTime = myProgress.lastPosition;
                            }
                          }
                        }}
                        onTimeUpdate={(e) => {
                          handleVideoTimeUpdate(
                            e.currentTarget.currentTime,
                            e.currentTarget.duration || 0
                          );
                        }}
                        className="w-full h-full max-h-[540px]"
                      />
                    ) : v.embedUrl ? (
                      <iframe
                        src={v.embedUrl}
                        title={v.title}
                        className="w-full h-full border-0"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                      />
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Image Gallery Section with Zoom Preview */}
      {imageAttachments.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-6 sm:p-8 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3.5">
            <div className="flex items-center gap-2">
              <ImageIcon className="w-5 h-5 text-slate-900" />
              <h2 className="text-base font-bold text-slate-900">
                Galeri Gambar & Diagram Visual ({imageAttachments.length})
              </h2>
            </div>
            <span className="text-xs text-slate-500">
              Klik gambar untuk membuka peninjau dengan kontrol perbesaran (Zoom)
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {imageAttachments.map((img) => (
              <div
                key={img.id}
                className="group rounded-xl border border-slate-200 overflow-hidden bg-slate-50 flex flex-col justify-between"
              >
                <div
                  onClick={() => handleOpenPreview(img.id)}
                  className="aspect-video bg-slate-900 overflow-hidden relative cursor-pointer flex items-center justify-center"
                >
                  <img
                    src={img.streamUrl}
                    alt={img.originalFileName || img.fileName}
                    className="w-full h-full object-cover group-hover:scale-105 transition duration-200"
                  />
                  <div className="absolute inset-0 bg-slate-950/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center">
                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white text-slate-900 text-xs font-bold shadow">
                      <ZoomIn className="w-3.5 h-3.5" /> Perbesar Gambar
                    </span>
                  </div>
                </div>
                <div className="p-3 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-slate-900 truncate">
                      {img.originalFileName || img.fileName}
                    </div>
                    <div className="text-[11px] font-mono tabular-nums text-slate-500">
                      {formatBytes(img.fileSize)}
                    </div>
                  </div>
                  {material.enableDownloads !== false && img.downloadUrl && (
                    <a
                      href={img.downloadUrl}
                      download={img.originalFileName || img.fileName}
                      className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-700"
                      title="Unduh Gambar"
                    >
                      <Download className="w-3.5 h-3.5" />
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Document Preview Cards & Attachment Download List */}
      {documentAttachments.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-6 sm:p-8 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3.5">
            <div className="flex items-center gap-2.5">
              <FileText className="w-5 h-5 text-slate-900" />
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  Dokumen Referensi, Modul & Spreadsheet ({documentAttachments.length})
                </h2>
                <p className="text-xs text-slate-500">
                  Mendukung pratinjau langsung untuk PDF, Word (DOCX), Excel (XLSX/XLS), PowerPoint (PPTX), dan Video
                </p>
              </div>
            </div>
            <span className="text-[11px] font-mono text-emerald-700 flex items-center gap-1">
              <ShieldCheck className="w-4 h-4" /> S3 Presigned Access
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {documentAttachments.map((att) => {
              const ext = (att.fileExtension || '').toLowerCase();
              const isSheet = ext === 'xlsx' || ext === 'xls';
              const isPres = ext === 'pptx' || ext === 'ppt';
              const isVid = att.attachmentType === 'VIDEO';

              return (
                <div
                  key={att.id}
                  className="p-4 rounded-xl border border-slate-200 bg-slate-50/70 hover:bg-white transition flex flex-col justify-between gap-4"
                >
                  <div className="flex items-start gap-3.5">
                    <div
                      className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 font-mono text-xs font-bold uppercase ${
                        isSheet
                          ? 'bg-emerald-900 text-emerald-300'
                          : isPres
                          ? 'bg-amber-900 text-amber-300'
                          : isVid
                          ? 'bg-purple-900 text-purple-300'
                          : 'bg-slate-900 text-white'
                      }`}
                    >
                      {ext || 'DOC'}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="text-xs font-bold text-slate-900 truncate">
                        {att.originalFileName || att.fileName}
                      </h3>
                      {att.description && (
                        <p className="text-xs text-slate-600 mt-0.5">{att.description}</p>
                      )}
                      <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono tabular-nums text-slate-500 mt-1.5">
                        <span className="uppercase">{ext || att.mimeType}</span>
                        <span>•</span>
                        <span>{formatBytes(att.fileSize)}</span>
                        <span>•</span>
                        <span>Mode: {att.previewMode || 'STREAM'}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200/70">
                    <button
                      type="button"
                      onClick={() => handleOpenPreview(att.id)}
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition"
                    >
                      <Eye className="w-3.5 h-3.5 text-amber-400" /> Buka Pratinjau Dokumen
                    </button>

                    {material.enableDownloads !== false && att.downloadUrl && (
                      <a
                        href={att.downloadUrl}
                        download={att.originalFileName || att.fileName}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-xs font-semibold transition"
                      >
                        <Download className="w-3.5 h-3.5" /> Unduh
                      </a>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Previous / Next Material Navigation */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {material.navigation?.previous ? (
          <Link
            to={`/classrooms/${classroomId || material.classroomId}/materials/${material.navigation.previous.id}`}
            className="p-4 rounded-xl border border-slate-200 bg-white hover:border-slate-900 transition flex items-center gap-3"
          >
            <div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
              <ArrowLeft className="w-4 h-4 text-slate-700" />
            </div>
            <div className="min-w-0">
              <div className="text-[11px] font-mono uppercase text-slate-400">
                Materi Sebelumnya (Pertemuan #{material.navigation.previous.meetingNumber || 1})
              </div>
              <div className="text-xs font-bold text-slate-900 truncate">
                {material.navigation.previous.title}
              </div>
            </div>
          </Link>
        ) : (
          <div />
        )}

        {material.navigation?.next ? (
          <Link
            to={`/classrooms/${classroomId || material.classroomId}/materials/${material.navigation.next.id}`}
            className="p-4 rounded-xl border border-slate-200 bg-white hover:border-slate-900 transition flex items-center justify-end gap-3 text-right"
          >
            <div className="min-w-0">
              <div className="text-[11px] font-mono uppercase text-slate-400">
                Materi Selanjutnya (Pertemuan #{material.navigation.next.meetingNumber || 1})
              </div>
              <div className="text-xs font-bold text-slate-900 truncate">
                {material.navigation.next.title}
              </div>
            </div>
            <div className="w-9 h-9 rounded-lg bg-slate-900 text-amber-400 flex items-center justify-center shrink-0">
              <ArrowRight className="w-4 h-4" />
            </div>
          </Link>
        ) : (
          <div />
        )}
      </div>

      {/* Material Comments / Academic Discussion */}
      {material.enableComments !== false && (
        <div className="bg-white rounded-xl border border-slate-200 p-6 sm:p-8 shadow-xs space-y-5">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3.5">
            <div className="flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-slate-900" />
              <h2 className="text-base font-bold text-slate-900">
                Diskusi & Tanya Jawab Materi ({(material.comments || []).length})
              </h2>
            </div>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!commentText.trim()) return;
              commentMutation.mutate(commentText.trim());
            }}
            className="flex gap-3"
          >
            <input
              type="text"
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              placeholder="Ajukan pertanyaan atau tanggapan akademik mengenai materi ini..."
              className="flex-1 px-4 py-2.5 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-900"
            />
            <button
              type="submit"
              disabled={commentMutation.isPending}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition shrink-0"
            >
              <Send className="w-3.5 h-3.5 text-amber-400" /> Kirim Tanggapan
            </button>
          </form>

          <div className="space-y-3">
            {(material.comments || []).length === 0 ? (
              <p className="text-xs text-slate-500 py-2">
                Belum ada diskusi pada materi ini. Jadilah yang pertama mengajukan pertanyaan!
              </p>
            ) : (
              (material.comments || []).map((c: any) => (
                <div
                  key={c.id}
                  className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-1"
                >
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-900">{c.authorName}</span>
                    <span className="font-mono text-[11px] text-slate-400">
                      {new Date(c.createdAt).toLocaleString('id-ID')}
                    </span>
                  </div>
                  <p className="text-xs text-slate-700 leading-relaxed">{c.body}</p>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Document Preview Modal */}
      {previewAttachmentId && (
        <DocumentPreviewModal
          materialId={material.id}
          attachmentId={previewAttachmentId}
          onClose={() => setPreviewAttachmentId(null)}
          allowDownload={material.enableDownloads !== false}
          initialVideoPosition={myProgress.lastPosition || 0}
          onVideoProgress={handleVideoTimeUpdate}
        />
      )}
      </div>
    </AppShell>
  );
}
