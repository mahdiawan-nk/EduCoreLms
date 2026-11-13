import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, Save, Send, Calendar, Archive, Eye, EyeOff, UploadCloud,
  FileText, FileSpreadsheet, Presentation, Image as ImageIcon, Film,
  Trash2, CheckCircle2, AlertCircle, Clock, ShieldCheck, Plus, Youtube,
  Play, RefreshCw, Download, ChevronUp, ChevronDown, Sparkles, BookOpen,
  Settings2, Layers, Lock
} from 'lucide-react';
import { JSONContent } from '@tiptap/react';
import { apiFetch } from '../lib/api';
import { AppShell } from '../components/AppShell';
import { uploadMaterialAttachmentToS3, PresignedUploadResult } from '../lib/s3Upload';
import { TiptapMaterialEditor, TiptapReadOnlyRenderer } from '../components/TiptapMaterialEditor';
import { DocumentPreviewModal, formatBytes } from '../components/DocumentPreviewModal';
import { ConfirmDialog } from '../components/ui/primitives';
import { useDeleteConfirmation } from '../hooks/useDeleteConfirmation';

interface UploadQueueItem {
  uid: string;
  fileName: string;
  fileSize: number;
  progress: number;
  status: 'UPLOADING' | 'DONE' | 'ERROR';
  errorMessage?: string;
}

export function MaterialBuilderPage() {
  const { classroomId, materialId: routeMaterialId } = useParams<{
    classroomId: string;
    materialId?: string;
  }>();
  const [searchParams] = useSearchParams();
  const initialTopicParam = searchParams.get('topicId') || '';
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const deleteConfirm = useDeleteConfirmation();

  const [activeMaterialId, setActiveMaterialId] = useState<string | null>(routeMaterialId || null);
  const [selectedClassroomId, setSelectedClassroomId] = useState<string>(classroomId || '');
  const [selectedTopicId, setSelectedTopicId] = useState<string>(initialTopicParam);

  // A. General Information State
  const [meetingNumber, setMeetingNumber] = useState<number>(1);
  const [title, setTitle] = useState<string>('');
  const [subtitle, setSubtitle] = useState<string>('');
  const [shortDescription, setShortDescription] = useState<string>('');
  const [coverImageUrl, setCoverImageUrl] = useState<string>('');
  const [estimatedDurationMinutes, setEstimatedDurationMinutes] = useState<number>(45);
  const [isRequired, setIsRequired] = useState<boolean>(true);
  const [sequenceOrder, setSequenceOrder] = useState<number>(1);

  // B. Content Editor State (Canonical Tiptap JSON)
  const [contentJson, setContentJson] = useState<JSONContent>({
    type: 'doc',
    content: [
      {
        type: 'heading',
        attrs: { level: 2 },
        content: [{ type: 'text', text: 'Tujuan Pembelajaran' }],
      },
      {
        type: 'paragraph',
        content: [
          {
            type: 'text',
            text: 'Tuliskan pengantar materi, konsep inti, studi kasus, dan instruksi praktikum pada editor di bawah ini.',
          },
        ],
      },
    ],
  });
  const [contentHtml, setContentHtml] = useState<string>('');
  const [plainText, setPlainText] = useState<string>('');

  // C & E. Attachments and Videos
  const [attachments, setAttachments] = useState<any[]>([]);
  const [videos, setVideos] = useState<any[]>([]);
  const [uploadQueue, setUploadQueue] = useState<UploadQueueItem[]>([]);
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  // External Video Input
  const [videoTitleInput, setVideoTitleInput] = useState('');
  const [videoTypeInput, setVideoTypeInput] = useState<'YOUTUBE' | 'VIMEO' | 'UPLOAD'>('YOUTUBE');
  const [videoUrlInput, setVideoUrlInput] = useState('');
  const [videoDescInput, setVideoDescInput] = useState('');
  const [videoRequiredInput, setVideoRequiredInput] = useState(true);
  const [videoSubmitting, setVideoSubmitting] = useState(false);

  // F. Learning Settings
  const [completionRule, setCompletionRule] = useState<
    'VIEW' | 'SCROLL' | 'MANUAL_MARK' | 'VIDEO_PROGRESS' | 'ATTACHMENT_OPEN'
  >('MANUAL_MARK');
  const [minCompletionPercent, setMinCompletionPercent] = useState<number>(100);
  const [enableComments, setEnableComments] = useState<boolean>(true);
  const [enableDownloads, setEnableDownloads] = useState<boolean>(true);
  const [allowAccessAfterPublish, setAllowAccessAfterPublish] = useState<boolean>(true);
  const [prerequisiteMaterialId, setPrerequisiteMaterialId] = useState<string>('');

  // G. Publication Settings
  const [status, setStatus] = useState<'DRAFT' | 'PUBLISHED' | 'SCHEDULED' | 'ARCHIVED'>('DRAFT');
  const [scheduledAt, setScheduledAt] = useState<string>('');
  const [versionNumber, setVersionNumber] = useState<number>(1);

  // UI & Autosave State
  const [studentPreviewMode, setStudentPreviewMode] = useState<boolean>(false);
  const [previewAttachmentId, setPreviewAttachmentId] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState<boolean>(false);
  const [savingState, setSavingState] = useState<'IDLE' | 'SAVING' | 'SAVED' | 'ERROR'>('IDLE');
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [feedbackBanner, setFeedbackBanner] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  const isSavingLockRef = useRef(false);
  const hydratedMaterialRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const coverInputRef = useRef<HTMLInputElement | null>(null);
  const videoFileInputRef = useRef<HTMLInputElement | null>(null);

  // Fetch instructor's classrooms
  const { data: classrooms = [] } = useQuery({
    queryKey: ['classrooms'],
    queryFn: () => apiFetch<any[]>('/api/v1/classrooms'),
  });

  // Fetch classroom details + topics + existing materials for prerequisite list
  const { data: classroomDetail } = useQuery({
    queryKey: ['classroom', selectedClassroomId],
    queryFn: () => apiFetch<any>(`/api/v1/classrooms/${selectedClassroomId}`),
    enabled: Boolean(selectedClassroomId),
  });

  const { data: topics = [] } = useQuery({
    queryKey: ['classroom-topics', selectedClassroomId],
    queryFn: () => apiFetch<any[]>(`/api/v1/classrooms/${selectedClassroomId}/topics`),
    enabled: Boolean(selectedClassroomId),
  });

  // Default topic selection when topics load
  useEffect(() => {
    if (topics.length > 0 && !selectedTopicId) {
      setSelectedTopicId(topics[0].id);
    }
  }, [topics, selectedTopicId]);

  // Fetch existing material if editing
  const { data: existingMaterial, isLoading: loadingExisting } = useQuery({
    queryKey: ['material-detail', routeMaterialId],
    queryFn: () => apiFetch<any>(`/api/v1/materials/${routeMaterialId}`),
    enabled: Boolean(routeMaterialId),
  });

  useEffect(() => {
    if (existingMaterial && !hydratedMaterialRef.current) {
      hydratedMaterialRef.current = true;
      setActiveMaterialId(existingMaterial.id);
      setSelectedClassroomId(existingMaterial.classroomId);
      setSelectedTopicId(existingMaterial.topicId || '');
      setMeetingNumber(existingMaterial.meetingNumber || 1);
      setTitle(existingMaterial.title || '');
      setSubtitle(existingMaterial.subtitle || '');
      setShortDescription(existingMaterial.shortDescription || '');
      setCoverImageUrl(existingMaterial.coverImageUrl || '');
      setEstimatedDurationMinutes(existingMaterial.estimatedDurationMinutes || 45);
      setIsRequired(existingMaterial.isRequired ?? true);
      setSequenceOrder(existingMaterial.sequenceOrder || 1);
      if (existingMaterial.contentJson && existingMaterial.contentJson.type === 'doc') {
        setContentJson(existingMaterial.contentJson);
      }
      setContentHtml(existingMaterial.contentHtml || '');
      setAttachments(existingMaterial.attachments || []);
      setVideos(existingMaterial.videos || []);
      setCompletionRule(existingMaterial.completionRule || 'MANUAL_MARK');
      setMinCompletionPercent(existingMaterial.minCompletionPercent ?? 100);
      setEnableComments(existingMaterial.enableComments ?? true);
      setEnableDownloads(existingMaterial.enableDownloads ?? true);
      setAllowAccessAfterPublish(existingMaterial.allowAccessAfterPublish ?? true);
      setPrerequisiteMaterialId(existingMaterial.prerequisiteMaterialId || '');
      setStatus(existingMaterial.status || 'DRAFT');
      if (existingMaterial.scheduledAt) {
        const dt = new Date(existingMaterial.scheduledAt);
        setScheduledAt(dt.toISOString().slice(0, 16));
      }
      setVersionNumber(existingMaterial.versionNumber || 1);
      setIsDirty(false);
    }
  }, [existingMaterial]);

  // Warn before unload if unsaved changes
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  const buildPayload = useCallback(
    (overrideStatus?: 'DRAFT' | 'PUBLISHED' | 'SCHEDULED' | 'ARCHIVED') => {
      const targetStatus = overrideStatus || status;
      return {
        classroomId: selectedClassroomId,
        topicId: selectedTopicId || null,
        meetingNumber: Number(meetingNumber) || 1,
        title: title.trim() || 'Draf Materi Pembelajaran Baru',
        subtitle: subtitle.trim() || null,
        shortDescription: shortDescription.trim() || null,
        coverImageUrl: coverImageUrl.trim() || null,
        estimatedDurationMinutes: Number(estimatedDurationMinutes) || 30,
        isRequired,
        sequenceOrder: Number(sequenceOrder) || 1,
        contentJson,
        contentHtml:
          contentHtml ||
          `<p>${plainText || shortDescription || 'Materi Pembelajaran Politeknik Kampar'}</p>`,
        status: targetStatus,
        scheduledAt:
          targetStatus === 'SCHEDULED' && scheduledAt
            ? new Date(scheduledAt).toISOString()
            : null,
        completionRule,
        minCompletionPercent: Number(minCompletionPercent) || 100,
        enableComments,
        enableDownloads,
        allowAccessAfterPublish,
        prerequisiteMaterialId: prerequisiteMaterialId || null,
      };
    },
    [
      status,
      selectedClassroomId,
      selectedTopicId,
      meetingNumber,
      title,
      subtitle,
      shortDescription,
      coverImageUrl,
      estimatedDurationMinutes,
      isRequired,
      sequenceOrder,
      contentJson,
      contentHtml,
      plainText,
      scheduledAt,
      completionRule,
      minCompletionPercent,
      enableComments,
      enableDownloads,
      allowAccessAfterPublish,
      prerequisiteMaterialId,
    ]
  );

  // Ensure a material record exists in DB before uploading attachments/videos
  const ensureMaterialRecord = useCallback(async (): Promise<string> => {
    if (activeMaterialId) return activeMaterialId;
    const topicToUse = selectedTopicId || topics[0]?.id;
    if (!topicToUse) {
      throw new Error('Pilih Topik/Modul terlebih dahulu sebelum mengunggah berkas.');
    }
    const payload = buildPayload('DRAFT');
    const created = await apiFetch<any>(`/api/v1/topics/${topicToUse}/materials`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    setActiveMaterialId(created.id);
    setVersionNumber(created.versionNumber || 1);
    return created.id;
  }, [activeMaterialId, selectedTopicId, topics, buildPayload]);

  // Save or update material
  const handleSaveMaterial = useCallback(
    async (
      targetStatus?: 'DRAFT' | 'PUBLISHED' | 'SCHEDULED' | 'ARCHIVED',
      isAutoSave = false
    ) => {
      if (isSavingLockRef.current) return;
      if (!title.trim() && !isAutoSave) {
        setFeedbackBanner({
          type: 'error',
          message: 'Judul materi pembelajaran wajib diisi minimal 3 karakter.',
        });
        return;
      }
      const topicToUse = selectedTopicId || topics[0]?.id;
      if (!topicToUse) {
        if (!isAutoSave) {
          setFeedbackBanner({
            type: 'error',
            message: 'Pastikan kelas memiliki minimal satu Topik/Modul yang dipilih.',
          });
        }
        return;
      }

      if (targetStatus === 'SCHEDULED' && !scheduledAt) {
        setFeedbackBanner({
          type: 'error',
          message: 'Tentukan tanggal & waktu publikasi terjadwal terlebih dahulu.',
        });
        return;
      }

      try {
        isSavingLockRef.current = true;
        setSavingState('SAVING');
        const payload = buildPayload(targetStatus);

        let saved: any;
        if (!activeMaterialId) {
          saved = await apiFetch<any>(`/api/v1/topics/${topicToUse}/materials`, {
            method: 'POST',
            body: JSON.stringify(payload),
          });
          setActiveMaterialId(saved.id);
        } else {
          saved = await apiFetch<any>(`/api/v1/materials/${activeMaterialId}`, {
            method: 'PATCH',
            body: JSON.stringify(payload),
          });
        }

        if (targetStatus) {
          setStatus(targetStatus);
        }
        setVersionNumber(saved.versionNumber || versionNumber);
        setIsDirty(false);
        setSavingState('SAVED');
        setLastSavedAt(new Date().toLocaleTimeString('id-ID'));

        queryClient.invalidateQueries({ queryKey: ['classroom', selectedClassroomId] });
        queryClient.invalidateQueries({ queryKey: ['material-detail', saved.id] });

        if (!isAutoSave) {
          const statusLabels: Record<string, string> = {
            DRAFT: 'Materi berhasil disimpan sebagai Draf.',
            PUBLISHED: 'Materi berhasil diterbitkan dan kini dapat diakses oleh mahasiswa.',
            SCHEDULED: 'Publikasi materi berhasil dijadwalkan.',
            ARCHIVED: 'Materi berhasil diarsipkan.',
          };
          setFeedbackBanner({
            type: 'success',
            message: statusLabels[targetStatus || status] || 'Perubahan materi berhasil disimpan.',
          });
        }
      } catch (err: any) {
        setSavingState('ERROR');
        if (!isAutoSave) {
          setFeedbackBanner({
            type: 'error',
            message: err.message || 'Gagal menyimpan materi pembelajaran.',
          });
        }
      } finally {
        isSavingLockRef.current = false;
      }
    },
    [
      title,
      selectedTopicId,
      topics,
      scheduledAt,
      buildPayload,
      activeMaterialId,
      versionNumber,
      selectedClassroomId,
      status,
      queryClient,
    ]
  );

  // Debounced Autosave for Drafts
  useEffect(() => {
    if (!isDirty || !title.trim() || title.trim().length < 3) return;
    const timer = setTimeout(() => {
      handleSaveMaterial(undefined, true);
    }, 4000);
    return () => clearTimeout(timer);
  }, [
    isDirty,
    title,
    subtitle,
    shortDescription,
    contentJson,
    meetingNumber,
    estimatedDurationMinutes,
    handleSaveMaterial,
  ]);

  // Multi-file Upload Handler
  const handleFilesSelected = async (fileList: FileList | File[]) => {
    const files = Array.from(fileList);
    if (files.length === 0) return;

    try {
      const matId = await ensureMaterialRecord();

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const uid = `${Date.now()}-${i}-${file.name}`;
        setUploadQueue((prev) => [
          ...prev,
          {
            uid,
            fileName: file.name,
            fileSize: file.size,
            progress: 0,
            status: 'UPLOADING',
          },
        ]);

        try {
          const uploaded = await uploadMaterialAttachmentToS3({
            materialId: matId,
            file,
            sortOrder: attachments.length + i + 1,
            onProgress: (pct) => {
              setUploadQueue((prev) =>
                prev.map((item) => (item.uid === uid ? { ...item, progress: pct } : item))
              );
            },
          });

          setAttachments((prev) => [...prev, uploaded]);
          setUploadQueue((prev) =>
            prev.map((item) =>
              item.uid === uid ? { ...item, progress: 100, status: 'DONE' } : item
            )
          );
        } catch (err: any) {
          setUploadQueue((prev) =>
            prev.map((item) =>
              item.uid === uid
                ? { ...item, status: 'ERROR', errorMessage: err.message || 'Gagal mengunggah' }
                : item
            )
          );
        }
      }
    } catch (err: any) {
      setFeedbackBanner({
        type: 'error',
        message: err.message || 'Gagal menyiapkan penyimpanan materi.',
      });
    }
  };

  // Replace existing attachment
  const handleReplaceAttachment = async (oldAttachmentId: string, file: File) => {
    try {
      const matId = await ensureMaterialRecord();
      const uploaded = await uploadMaterialAttachmentToS3({
        materialId: matId,
        file,
      });
      await apiFetch(`/api/v1/material-attachments/${oldAttachmentId}`, {
        method: 'DELETE',
      });
      setAttachments((prev) => prev.map((a) => (a.id === oldAttachmentId ? uploaded : a)));
      setFeedbackBanner({
        type: 'success',
        message: `Berkas lampiran berhasil diganti dengan "${file.name}".`,
      });
    } catch (err: any) {
      setFeedbackBanner({
        type: 'error',
        message: err.message || 'Gagal mengganti berkas lampiran.',
      });
    }
  };

  // Delete attachment with confirmation modal
  const handleDeleteAttachment = (attachmentId: string, fileName?: string) => {
    deleteConfirm.requestConfirmation({
      item: attachmentId,
      title: 'Hapus Lampiran Materi?',
      description: 'Apakah Anda yakin ingin menghapus berkas lampiran ini dari materi pembelajaran?',
      itemName: fileName || 'Berkas Lampiran',
      warningText: 'Berkas akan dihapus dari penyimpanan S3 dan tidak lagi tersedia untuk mahasiswa.',
      actionLabel: 'Ya, Hapus Lampiran',
      successMessage: 'Lampiran materi berhasil dihapus.',
      onConfirm: async (id) => {
        await apiFetch(`/api/v1/material-attachments/${id}`, {
          method: 'DELETE',
        });
        setAttachments((prev) => prev.filter((a) => a.id !== id));
      },
    });
  };

  // Update attachment metadata (description / sortOrder)
  const handleUpdateAttachmentMeta = async (
    attachmentId: string,
    updates: { description?: string; sortOrder?: number }
  ) => {
    try {
      const updated = await apiFetch<any>(`/api/v1/material-attachments/${attachmentId}`, {
        method: 'PATCH',
        body: JSON.stringify(updates),
      });
      setAttachments((prev) =>
        prev
          .map((a) => (a.id === attachmentId ? { ...a, ...updated } : a))
          .sort((a, b) => (a.sortOrder ?? 1) - (b.sortOrder ?? 1))
      );
    } catch (err: any) {
      setFeedbackBanner({
        type: 'error',
        message: err.message || 'Gagal memperbarui metadata lampiran.',
      });
    }
  };

  // Upload Cover Image via S3
  const handleCoverUpload = async (file: File) => {
    try {
      const matId = await ensureMaterialRecord();
      const uploaded = await uploadMaterialAttachmentToS3({
        materialId: matId,
        file,
        description: 'Cover Image Materi',
      });
      setCoverImageUrl(uploaded.streamUrl);
      setAttachments((prev) => [...prev, uploaded]);
      setIsDirty(true);
    } catch (err: any) {
      setFeedbackBanner({
        type: 'error',
        message: err.message || 'Gagal mengunggah gambar sampul.',
      });
    }
  };

  // Inline Editor Image Upload via S3
  const handleEditorImageUpload = async (file: File): Promise<{ url: string; title: string }> => {
    const matId = await ensureMaterialRecord();
    const uploaded = await uploadMaterialAttachmentToS3({
      materialId: matId,
      file,
      description: 'Gambar Konten Inline',
    });
    setAttachments((prev) => [...prev, uploaded]);
    return { url: uploaded.streamUrl, title: uploaded.originalFileName || file.name };
  };

  // Inline Editor Video Upload via S3
  const handleEditorVideoUpload = async (file: File): Promise<{ url: string; title: string }> => {
    const matId = await ensureMaterialRecord();
    const uploaded = await uploadMaterialAttachmentToS3({
      materialId: matId,
      file,
      description: 'Video Pembelajaran Terunggah',
    });
    setAttachments((prev) => [...prev, uploaded]);

    // Also register in material_videos
    const vid = await apiFetch<any>(`/api/v1/materials/${matId}/videos`, {
      method: 'POST',
      body: JSON.stringify({
        title: file.name,
        description: 'Video MP4/WEBM terunggah langsung ke S3',
        videoType: 'UPLOAD',
        storageKey: uploaded.storageKey,
        sortOrder: videos.length + 1,
        isRequired: true,
      }),
    });
    setVideos((prev) => [...prev, vid]);

    return { url: uploaded.streamUrl, title: file.name };
  };

  // Add External or Uploaded Video in Video Management Section
  const handleAddExternalVideo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!videoTitleInput.trim() || !videoUrlInput.trim()) return;
    try {
      setVideoSubmitting(true);
      const matId = await ensureMaterialRecord();
      const created = await apiFetch<any>(`/api/v1/materials/${matId}/videos`, {
        method: 'POST',
        body: JSON.stringify({
          title: videoTitleInput.trim(),
          description: videoDescInput.trim() || null,
          videoType: videoTypeInput,
          externalUrl: videoUrlInput.trim(),
          sortOrder: videos.length + 1,
          isRequired: videoRequiredInput,
        }),
      });
      setVideos((prev) => [...prev, created]);
      setVideoTitleInput('');
      setVideoUrlInput('');
      setVideoDescInput('');
      setFeedbackBanner({
        type: 'success',
        message: 'Video pembelajaran berhasil divalidasi dan ditambahkan.',
      });
    } catch (err: any) {
      setFeedbackBanner({
        type: 'error',
        message: err.message || 'Tautan video tidak valid.',
      });
    } finally {
      setVideoSubmitting(false);
    }
  };

  const handleUploadDedicatedVideoFile = async (file: File) => {
    try {
      setVideoSubmitting(true);
      const matId = await ensureMaterialRecord();
      const uploaded = await uploadMaterialAttachmentToS3({
        materialId: matId,
        file,
        description: videoDescInput.trim() || 'Berkas Video S3',
      });
      setAttachments((prev) => [...prev, uploaded]);

      const created = await apiFetch<any>(`/api/v1/materials/${matId}/videos`, {
        method: 'POST',
        body: JSON.stringify({
          title: videoTitleInput.trim() || file.name,
          description: videoDescInput.trim() || null,
          videoType: 'UPLOAD',
          storageKey: uploaded.storageKey,
          sortOrder: videos.length + 1,
          isRequired: videoRequiredInput,
        }),
      });
      setVideos((prev) => [...prev, created]);
      setVideoTitleInput('');
      setVideoDescInput('');
      setFeedbackBanner({
        type: 'success',
        message: `Berkas video "${file.name}" berhasil diunggah ke S3 dan didaftarkan.`,
      });
    } catch (err: any) {
      setFeedbackBanner({
        type: 'error',
        message: err.message || 'Gagal mengunggah video pembelajaran.',
      });
    } finally {
      setVideoSubmitting(false);
    }
  };

  const handleDeleteVideo = (videoId: string, videoTitle?: string) => {
    deleteConfirm.requestConfirmation({
      item: videoId,
      title: 'Hapus Video Pembelajaran?',
      description: 'Apakah Anda yakin ingin menghapus tautan/rekaman video ini dari materi?',
      itemName: videoTitle || 'Video Pembelajaran',
      warningText: 'Video akan dihapus dari daftar materi pembelajaran.',
      actionLabel: 'Ya, Hapus Video',
      successMessage: 'Video pembelajaran berhasil dihapus.',
      onConfirm: async (id) => {
        await apiFetch(`/api/v1/material-videos/${id}`, {
          method: 'DELETE',
        });
        setVideos((prev) => prev.filter((v) => v.id !== id));
      },
    });
  };

  if (routeMaterialId && loadingExisting) {
    return (
      <AppShell breadcrumb="Advanced Learning Material Builder">
        <div className="p-12 text-center text-slate-600 font-medium">
          Memuat ruang kerja Advanced Learning Material Builder...
        </div>
      </AppShell>
    );
  }

  const otherMaterials = (classroomDetail?.materials || []).filter(
    (m: any) => m.id !== activeMaterialId
  );

  return (
    <AppShell breadcrumb={title || 'Advanced Learning Material Builder'}>
      <div className="max-w-7xl mx-auto space-y-6 pb-16">
      {/* Top Sticky Action Bar */}
      <div className="sticky top-0 z-30 bg-white/95 backdrop-blur-xs border border-slate-200 rounded-xl px-5 py-3.5 shadow-xs flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            to={`/classrooms/${selectedClassroomId || classroomId}`}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-xs font-semibold text-slate-700 transition"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Kembali ke Kelas
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-bold text-slate-900">
                {routeMaterialId || activeMaterialId
                  ? 'Editor Materi Pembelajaran Terpadu'
                  : 'Buat Materi Pembelajaran Baru'}
              </h1>
              <span className="text-[11px] font-mono tabular-nums uppercase tracking-wider px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-bold">
                STATUS: {status} • REV #{versionNumber}
              </span>
            </div>
            <div className="flex items-center gap-3 text-[11px] text-slate-500 mt-0.5 font-mono tabular-nums">
              {savingState === 'SAVING' && (
                <span className="text-amber-600 flex items-center gap-1">
                  <RefreshCw className="w-3 h-3 animate-spin" /> Menyimpan ke PostgreSQL...
                </span>
              )}
              {savingState === 'SAVED' && lastSavedAt && (
                <span className="text-emerald-700 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" /> Tersimpan otomatis pukul {lastSavedAt}
                </span>
              )}
              {isDirty && savingState !== 'SAVING' && (
                <span className="text-amber-700">• Perubahan belum disimpan</span>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setStudentPreviewMode((p) => !p)}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold border transition ${
              studentPreviewMode
                ? 'bg-amber-500 text-slate-950 border-amber-500'
                : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
            }`}
          >
            {studentPreviewMode ? (
              <>
                <EyeOff className="w-3.5 h-3.5" /> Kembali ke Mode Editor
              </>
            ) : (
              <>
                <Eye className="w-3.5 h-3.5" /> Pratinjau Tampilan Mahasiswa
              </>
            )}
          </button>

          <button
            type="button"
            onClick={() => handleSaveMaterial('DRAFT', false)}
            disabled={savingState === 'SAVING'}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-xs font-bold transition disabled:opacity-50"
          >
            <Save className="w-3.5 h-3.5" /> Simpan Draf
          </button>

          <button
            type="button"
            onClick={() => handleSaveMaterial('PUBLISHED', false)}
            disabled={savingState === 'SAVING'}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition shadow-xs disabled:opacity-50"
          >
            <Send className="w-3.5 h-3.5 text-amber-400" /> Terbitkan Sekarang
          </button>

          {activeMaterialId && (
            <Link
              to={`/classrooms/${selectedClassroomId}/materials/${activeMaterialId}`}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold transition"
            >
              Buka Halaman Materi
            </Link>
          )}
        </div>
      </div>

      {/* Feedback Notification Banner */}
      {feedbackBanner && (
        <div
          className={`p-4 rounded-xl border flex items-center justify-between gap-3 ${
            feedbackBanner.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-rose-50 border-rose-200 text-rose-900'
          }`}
        >
          <div className="flex items-center gap-2.5 text-xs font-semibold">
            {feedbackBanner.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            )}
            <span>{feedbackBanner.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedbackBanner(null)}
            className="text-xs font-bold underline"
          >
            Tutup
          </button>
        </div>
      )}

      {/* PREVIEW AS STUDENT MODE */}
      {studentPreviewMode ? (
        <div className="bg-white rounded-xl border-2 border-amber-400 shadow-sm overflow-hidden">
          <div className="bg-amber-500 text-slate-950 px-6 py-2.5 flex items-center justify-between text-xs font-bold">
            <span className="flex items-center gap-2">
              <Eye className="w-4 h-4" /> MODE SIMULASI PRATINJAU MAHASISWA — Menampilkan tata letak persis seperti yang dilihat mahasiswa
            </span>
            <span>Status Publikasi: {status}</span>
          </div>

          <div className="p-6 sm:p-10 space-y-8">
            {/* Header Info */}
            <div className="border-b border-slate-200 pb-6">
              <div className="flex flex-wrap items-center gap-3 text-xs font-mono tabular-nums text-slate-500 uppercase tracking-wider mb-2">
                <span>Pertemuan #{meetingNumber}</span>
                <span>•</span>
                <span>Estimasi Belajar: {estimatedDurationMinutes} Menit</span>
                <span>•</span>
                <span>{isRequired ? 'Wajib Dipelajari' : 'Materi Pengayaan (Opsional)'}</span>
              </div>
              <h2 className="text-2xl sm:text-3xl font-bold text-slate-900">
                {title || 'Judul Materi Pembelajaran'}
              </h2>
              {subtitle && <p className="text-base text-slate-600 mt-1 font-medium">{subtitle}</p>}
              {shortDescription && (
                <p className="text-sm text-slate-500 mt-3 leading-relaxed bg-slate-50 p-4 rounded-lg border border-slate-200">
                  {shortDescription}
                </p>
              )}
            </div>

            {coverImageUrl && (
              <div className="rounded-xl overflow-hidden border border-slate-200 max-h-80 bg-slate-900 flex items-center justify-center">
                <img
                  src={coverImageUrl}
                  alt={title}
                  className="w-full max-h-80 object-cover"
                />
              </div>
            )}

            {/* Rich Text Content */}
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">
                Konten Materi Pembelajaran
              </h3>
              <div className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8">
                <TiptapReadOnlyRenderer contentJson={contentJson} fallbackHtml={contentHtml} />
              </div>
            </div>

            {/* Videos Preview */}
            {videos.length > 0 && (
              <div className="space-y-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Video Pembelajaran Terintegrasi ({videos.length})
                </h3>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {videos.map((v) => (
                    <div
                      key={v.id}
                      className="border border-slate-200 rounded-xl overflow-hidden bg-slate-950 text-white"
                    >
                      <div className="aspect-video w-full bg-black flex items-center justify-center">
                        {v.videoType === 'UPLOAD' && v.streamUrl ? (
                          <video src={v.streamUrl} controls className="w-full h-full" />
                        ) : v.embedUrl ? (
                          <iframe
                            src={v.embedUrl}
                            title={v.title}
                            className="w-full h-full border-0"
                            allowFullScreen
                          />
                        ) : null}
                      </div>
                      <div className="p-4 bg-slate-900">
                        <div className="text-sm font-bold">{v.title}</div>
                        {v.description && (
                          <p className="text-xs text-slate-400 mt-1">{v.description}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Attachments Preview */}
            {attachments.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Dokumen & Berkas Lampiran ({attachments.length})
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {attachments.map((att) => (
                    <div
                      key={att.id}
                      className="p-4 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-slate-900 truncate">
                          {att.originalFileName || att.fileName}
                        </div>
                        <div className="text-[11px] font-mono tabular-nums text-slate-500 mt-0.5">
                          {(att.fileExtension || att.mimeType || '').toUpperCase()} •{' '}
                          {formatBytes(att.fileSize)}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => setPreviewAttachmentId(att.id)}
                          className="px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 transition"
                        >
                          Pratinjau
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* EDITOR WORKSPACE GRID */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Main Left Column (8 cols): Sections A, B, C, E */}
          <div className="lg:col-span-8 space-y-6">
            {/* SECTION A: GENERAL INFORMATION */}
            <section className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs space-y-5">
              <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-slate-900 text-amber-400 flex items-center justify-center font-mono text-xs font-bold">
                    A
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-slate-900">
                      Informasi Umum & Struktur Akademik
                    </h2>
                    <p className="text-xs text-slate-500">
                      Klasifikasi kelas, modul silabus, pertemuan, dan identitas materi
                    </p>
                  </div>
                </div>
                <span className="text-[11px] font-mono text-slate-500">Wajib Tervalidasi RBAC</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Ruang Kelas Digital *
                  </label>
                  <select
                    value={selectedClassroomId}
                    onChange={(e) => {
                      setSelectedClassroomId(e.target.value);
                      setSelectedTopicId('');
                      setIsDirty(true);
                    }}
                    className="w-full px-3.5 py-2 text-xs rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-slate-900 font-medium"
                  >
                    {classrooms
                      .filter((c: any) => c.canManage)
                      .map((c: any) => (
                        <option key={c.id} value={c.id}>
                          {c.courseCode} — {c.name || c.title} ({c.section || c.sectionCode})
                        </option>
                      ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Topik / Modul Silabus *
                  </label>
                  <select
                    value={selectedTopicId}
                    onChange={(e) => {
                      setSelectedTopicId(e.target.value);
                      setIsDirty(true);
                    }}
                    className="w-full px-3.5 py-2 text-xs rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-slate-900 font-medium"
                  >
                    {topics.map((t: any) => (
                      <option key={t.id} value={t.id}>
                        Modul #{t.sequenceOrder}: {t.title}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Pertemuan Ke- *
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={32}
                    value={meetingNumber}
                    onChange={(e) => {
                      setMeetingNumber(Number(e.target.value));
                      setIsDirty(true);
                    }}
                    className="w-full px-3.5 py-2 text-xs font-mono tabular-nums rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-900"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Urutan Materi (Sequence)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={sequenceOrder}
                    onChange={(e) => {
                      setSequenceOrder(Number(e.target.value));
                      setIsDirty(true);
                    }}
                    className="w-full px-3.5 py-2 text-xs font-mono tabular-nums rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-900"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Estimasi Durasi Belajar (Menit)
                  </label>
                  <input
                    type="number"
                    min={5}
                    max={600}
                    value={estimatedDurationMinutes}
                    onChange={(e) => {
                      setEstimatedDurationMinutes(Number(e.target.value));
                      setIsDirty(true);
                    }}
                    className="w-full px-3.5 py-2 text-xs font-mono tabular-nums rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-900"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Judul Materi Pembelajaran *
                </label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => {
                    setTitle(e.target.value);
                    setIsDirty(true);
                  }}
                  placeholder="Contoh: Arsitektur RESTful API, JSON Schema Validation & Keamanan Sesi"
                  className="w-full px-3.5 py-2.5 text-sm font-semibold rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-900"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Subjudul / Fokus Kompetensi
                </label>
                <input
                  type="text"
                  value={subtitle}
                  onChange={(e) => {
                    setSubtitle(e.target.value);
                    setIsDirty(true);
                  }}
                  placeholder="Contoh: Studi Kasus Implementasi Fastify, Zod, dan PostgreSQL di Politeknik Kampar"
                  className="w-full px-3.5 py-2 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-900"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Deskripsi Singkat (Abstrak / Ringkasan Modul)
                </label>
                <textarea
                  rows={2}
                  value={shortDescription}
                  onChange={(e) => {
                    setShortDescription(e.target.value);
                    setIsDirty(true);
                  }}
                  placeholder="Ringkasan kompetensi yang akan dicapai mahasiswa setelah mempelajari modul ini..."
                  className="w-full px-3.5 py-2 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-900"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Gambar Sampul Materi (Cover Image S3 / URL)
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={coverImageUrl}
                      onChange={(e) => {
                        setCoverImageUrl(e.target.value);
                        setIsDirty(true);
                      }}
                      placeholder="https://... atau unggah ke S3 ->"
                      className="flex-1 px-3 py-2 text-xs rounded-lg border border-slate-300"
                    />
                    <input
                      ref={coverInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) handleCoverUpload(f);
                        e.target.value = '';
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => coverInputRef.current?.click()}
                      className="px-3 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold shrink-0 transition"
                    >
                      Unggah S3
                    </button>
                  </div>
                </div>

                <div className="flex items-end pb-1">
                  <label className="flex items-center gap-2.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={isRequired}
                      onChange={(e) => {
                        setIsRequired(e.target.checked);
                        setIsDirty(true);
                      }}
                      className="w-4 h-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900"
                    />
                    <div>
                      <div className="text-xs font-bold text-slate-800">
                        Materi Wajib (Required Material)
                      </div>
                      <div className="text-[11px] text-slate-500">
                        Dihitung dalam kalkulasi ketuntasan belajar mahasiswa
                      </div>
                    </div>
                  </label>
                </div>
              </div>
            </section>

            {/* SECTION B: TIPTAP RICH CONTENT EDITOR */}
            <section className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-slate-900 text-amber-400 flex items-center justify-center font-mono text-xs font-bold">
                    B
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-slate-900">
                      Editor Konten Edukasi Terstruktur (Tiptap JSONB)
                    </h2>
                    <p className="text-xs text-slate-500">
                      Mendukung Heading H1-H4, Tabel, Code Block Syntax Highlighting, Task List, YouTube, Vimeo, dan Drag-and-Drop Gambar S3
                    </p>
                  </div>
                </div>
              </div>

              <TiptapMaterialEditor
                initialJson={contentJson}
                onChange={(json, html, text) => {
                  setContentJson(json);
                  setContentHtml(html);
                  setPlainText(text);
                  setIsDirty(true);
                }}
                onUploadImageFile={handleEditorImageUpload}
                onUploadVideoFile={handleEditorVideoUpload}
              />
            </section>

            {/* SECTION C: MEDIA & ATTACHMENTS (S3 PRESIGNED UPLOAD + PREVIEW) */}
            <section className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs space-y-5">
              <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-slate-900 text-amber-400 flex items-center justify-center font-mono text-xs font-bold">
                    C
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-slate-900">
                      Manajemen Berkas & Lampiran Objek S3 Privat
                    </h2>
                    <p className="text-xs text-slate-500">
                      Unggah PDF, DOCX, XLSX, PPTX, Gambar, atau Video melalui Presigned URL tervalidasi SHA-256 & Magic Bytes
                    </p>
                  </div>
                </div>
                <span className="text-xs font-mono tabular-nums font-bold text-slate-700">
                  {attachments.length} Berkas Terlampir
                </span>
              </div>

              {/* Drag and Drop Upload Zone */}
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDraggingOver(true);
                }}
                onDragLeave={() => setIsDraggingOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDraggingOver(false);
                  if (e.dataTransfer.files?.length) {
                    handleFilesSelected(e.dataTransfer.files);
                  }
                }}
                className={`border-2 border-dashed rounded-xl p-6 text-center transition ${
                  isDraggingOver
                    ? 'border-amber-500 bg-amber-50/60'
                    : 'border-slate-300 bg-slate-50/60 hover:bg-slate-50'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.jpg,.jpeg,.png,.webp,.mp4,.webm"
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files?.length) {
                      handleFilesSelected(e.target.files);
                    }
                    e.target.value = '';
                  }}
                />
                <div className="w-11 h-11 rounded-xl bg-slate-900 text-amber-400 flex items-center justify-center mx-auto mb-3">
                  <UploadCloud className="w-5 h-5" />
                </div>
                <p className="text-xs font-bold text-slate-900">
                  Tarik & lepaskan berkas ke area ini, atau{' '}
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="text-amber-700 underline hover:text-amber-800"
                  >
                    pilih berkas dari komputer Anda
                  </button>
                </p>
                <p className="text-[11px] font-mono text-slate-500 mt-1">
                  Format Didukung: PDF, DOC, DOCX, XLS, XLSX, PPT, PPTX (Maks 50MB) • JPG, PNG, WEBP (Maks 10MB) • MP4, WEBM (Maks 250MB)
                </p>
              </div>

              {/* Active Upload Progress Queue */}
              {uploadQueue.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    <span>Antrean Transmisi Presigned S3</span>
                    <button
                      type="button"
                      onClick={() =>
                        setUploadQueue((q) => q.filter((item) => item.status === 'UPLOADING'))
                      }
                      className="text-slate-600 hover:text-slate-900 underline"
                    >
                      Bersihkan Selesai
                    </button>
                  </div>
                  {uploadQueue.map((item) => (
                    <div
                      key={item.uid}
                      className="p-3 rounded-lg border border-slate-200 bg-white flex flex-col gap-1.5"
                    >
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-slate-800 truncate">
                          {item.fileName}{' '}
                          <span className="text-slate-400 font-mono">
                            ({formatBytes(item.fileSize)})
                          </span>
                        </span>
                        <span className="font-mono tabular-nums text-[11px] font-bold">
                          {item.status === 'UPLOADING' && `${item.progress}%`}
                          {item.status === 'DONE' && (
                            <span className="text-emerald-700">TERVERIFIKASI SHA-256</span>
                          )}
                          {item.status === 'ERROR' && (
                            <span className="text-rose-600">{item.errorMessage}</span>
                          )}
                        </span>
                      </div>
                      <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full transition-all duration-200 ${
                            item.status === 'ERROR'
                              ? 'bg-rose-500'
                              : item.status === 'DONE'
                              ? 'bg-emerald-600'
                              : 'bg-amber-500'
                          }`}
                          style={{ width: `${item.progress}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Uploaded Attachments List */}
              {attachments.length > 0 ? (
                <div className="space-y-3">
                  {attachments.map((att, idx) => {
                    const ext = (att.fileExtension || '').toLowerCase();
                    return (
                      <div
                        key={att.id}
                        className="p-4 rounded-xl border border-slate-200 bg-slate-50/70 hover:bg-white transition flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                      >
                        <div className="flex items-start gap-3 min-w-0 flex-1">
                          <div className="w-10 h-10 rounded-lg bg-slate-900 text-white flex items-center justify-center shrink-0 font-mono text-xs font-bold uppercase">
                            {ext || 'FILE'}
                          </div>
                          <div className="min-w-0 flex-1 space-y-1.5">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold text-slate-900 truncate">
                                {att.originalFileName || att.fileName}
                              </span>
                              <span className="text-[11px] font-mono tabular-nums text-slate-500">
                                ({formatBytes(att.fileSize)})
                              </span>
                            </div>
                            <div className="flex flex-wrap items-center gap-3 text-[11px] font-mono text-slate-500">
                              <span>Mode Pratinjau: {att.previewMode || 'FALLBACK'}</span>
                              {att.checksum && (
                                <span>SHA256: {String(att.checksum).slice(0, 12)}...</span>
                              )}
                            </div>
                            <input
                              type="text"
                              defaultValue={att.description || ''}
                              onBlur={(e) => {
                                if (e.target.value !== (att.description || '')) {
                                  handleUpdateAttachmentMeta(att.id, {
                                    description: e.target.value,
                                  });
                                }
                              }}
                              placeholder="Tambahkan keterangan berkas (misal: Modul Praktikum Bab 2)..."
                              className="w-full px-2.5 py-1 text-xs rounded border border-slate-200 bg-white focus:outline-none focus:border-slate-900"
                            />
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() =>
                              handleUpdateAttachmentMeta(att.id, {
                                sortOrder: Math.max(1, (att.sortOrder || idx + 1) - 1),
                              })
                            }
                            className="p-1.5 rounded border border-slate-200 bg-white hover:bg-slate-100 text-slate-600"
                            title="Naikkan Urutan"
                          >
                            <ChevronUp className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              handleUpdateAttachmentMeta(att.id, {
                                sortOrder: (att.sortOrder || idx + 1) + 1,
                              })
                            }
                            className="p-1.5 rounded border border-slate-200 bg-white hover:bg-slate-100 text-slate-600"
                            title="Turunkan Urutan"
                          >
                            <ChevronDown className="w-3.5 h-3.5" />
                          </button>

                          <button
                            type="button"
                            onClick={() => setPreviewAttachmentId(att.id)}
                            className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition"
                          >
                            Pratinjau
                          </button>

                          <label className="px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold cursor-pointer transition">
                            Ganti
                            <input
                              type="file"
                              className="hidden"
                              onChange={(e) => {
                                const f = e.target.files?.[0];
                                if (f) handleReplaceAttachment(att.id, f);
                                e.target.value = '';
                              }}
                            />
                          </label>

                          <button
                            type="button"
                            onClick={() => handleDeleteAttachment(att.id)}
                            className="p-1.5 rounded-lg border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 transition"
                            title="Hapus Lampiran"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-xs text-slate-500 text-center py-2">
                  Belum ada berkas dokumen atau media yang dilampirkan pada materi ini.
                </p>
              )}
            </section>

            {/* SECTION E: VIDEO MANAGEMENT */}
            <section className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs space-y-5">
              <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-slate-900 text-amber-400 flex items-center justify-center font-mono text-xs font-bold">
                    E
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-slate-900">
                      Manajemen Video Pembelajaran (S3 Upload, YouTube & Vimeo)
                    </h2>
                    <p className="text-xs text-slate-500">
                      Sematkan video kuliah dari YouTube/Vimeo tervalidasi atau unggah berkas MP4/WEBM ke S3
                    </p>
                  </div>
                </div>
                <span className="text-xs font-mono tabular-nums font-bold text-slate-700">
                  {videos.length} Video Terdaftar
                </span>
              </div>

              <form
                onSubmit={handleAddExternalVideo}
                className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-4"
              >
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold uppercase text-slate-600 mb-1">
                      Sumber Video
                    </label>
                    <select
                      value={videoTypeInput}
                      onChange={(e) =>
                        setVideoTypeInput(e.target.value as 'YOUTUBE' | 'VIMEO' | 'UPLOAD')
                      }
                      className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 bg-white font-semibold"
                    >
                      <option value="YOUTUBE">YouTube (Embed Tervalidasi)</option>
                      <option value="VIMEO">Vimeo (Embed Tervalidasi)</option>
                      <option value="UPLOAD">Unggah Berkas MP4 / WEBM ke S3</option>
                    </select>
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-[11px] font-bold uppercase text-slate-600 mb-1">
                      Judul Video Pembelajaran *
                    </label>
                    <input
                      type="text"
                      value={videoTitleInput}
                      onChange={(e) => setVideoTitleInput(e.target.value)}
                      placeholder="Contoh: Rekaman Kuliah Minggu 3 — Demonstrasi Live Coding Fastify"
                      className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 bg-white"
                    />
                  </div>
                </div>

                {videoTypeInput === 'UPLOAD' ? (
                  <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                    <input
                      ref={videoFileInputRef}
                      type="file"
                      accept="video/mp4,video/webm"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) handleUploadDedicatedVideoFile(f);
                        e.target.value = '';
                      }}
                    />
                    <span className="text-xs text-slate-600">
                      Pilih berkas video MP4 atau WEBM (Maks 250MB) untuk diunggah ke S3 Privat:
                    </span>
                    <button
                      type="button"
                      disabled={videoSubmitting}
                      onClick={() => videoFileInputRef.current?.click()}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition"
                    >
                      <Film className="w-3.5 h-3.5 text-amber-400" />
                      {videoSubmitting ? 'Mengunggah Video...' : 'Pilih & Unggah MP4/WEBM'}
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
                    <div className="sm:col-span-9">
                      <label className="block text-[11px] font-bold uppercase text-slate-600 mb-1">
                        URL {videoTypeInput === 'YOUTUBE' ? 'YouTube' : 'Vimeo'} *
                      </label>
                      <input
                        type="url"
                        value={videoUrlInput}
                        onChange={(e) => setVideoUrlInput(e.target.value)}
                        placeholder={
                          videoTypeInput === 'YOUTUBE'
                            ? 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
                            : 'https://vimeo.com/76979871'
                        }
                        className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-slate-300 bg-white"
                      />
                    </div>
                    <div className="sm:col-span-3">
                      <button
                        type="submit"
                        disabled={videoSubmitting}
                        className="w-full py-2 px-3 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition"
                      >
                        + Tambah Video
                      </button>
                    </div>
                  </div>
                )}
              </form>

              {videos.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {videos.map((v) => (
                    <div
                      key={v.id}
                      className="rounded-xl border border-slate-200 overflow-hidden bg-slate-900 text-white flex flex-col"
                    >
                      <div className="aspect-video bg-black">
                        {v.videoType === 'UPLOAD' && v.streamUrl ? (
                          <video src={v.streamUrl} controls className="w-full h-full" />
                        ) : v.embedUrl ? (
                          <iframe
                            src={v.embedUrl}
                            title={v.title}
                            className="w-full h-full border-0"
                            allowFullScreen
                          />
                        ) : null}
                      </div>
                      <div className="p-3.5 flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-xs font-bold truncate">{v.title}</div>
                          <div className="text-[10px] font-mono text-amber-400 uppercase mt-0.5">
                            {v.videoType} • {v.isRequired ? 'Wajib Ditonton' : 'Opsional'}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleDeleteVideo(v.id)}
                          className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-600 text-slate-300 hover:text-white transition shrink-0"
                          title="Hapus Video"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>

          {/* Right Sidebar Column (4 cols): Sections F & G */}
          <div className="lg:col-span-4 space-y-6">
            {/* SECTION G: PUBLICATION SETTINGS */}
            <section className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs space-y-4">
              <div className="flex items-center gap-2.5 border-b border-slate-100 pb-3.5">
                <div className="w-7 h-7 rounded-lg bg-slate-900 text-amber-400 flex items-center justify-center font-mono text-xs font-bold">
                  G
                </div>
                <div>
                  <h2 className="text-sm font-bold text-slate-900">Pengaturan Publikasi</h2>
                  <p className="text-[11px] text-slate-500">
                    Kontrol visibilitas dan penjadwalan rilis materi
                  </p>
                </div>
              </div>

              <div className="space-y-2.5">
                {(
                  [
                    {
                      id: 'DRAFT',
                      label: 'Simpan sebagai Draf (Tersembunyi)',
                      desc: 'Hanya dapat dilihat oleh Dosen pengampu kelas',
                    },
                    {
                      id: 'PUBLISHED',
                      label: 'Terbitkan Langsung (Published)',
                      desc: 'Langsung terlihat oleh mahasiswa terdaftar aktif',
                    },
                    {
                      id: 'SCHEDULED',
                      label: 'Jadwalkan Publikasi Otomatis',
                      desc: 'Terbuka otomatis sesuai tanggal & waktu rilis',
                    },
                    {
                      id: 'ARCHIVED',
                      label: 'Arsipkan Materi (Archived)',
                      desc: 'Disembunyikan dari daftar aktif kelas',
                    },
                  ] as const
                ).map((opt) => (
                  <label
                    key={opt.id}
                    className={`flex items-start gap-2.5 p-3 rounded-lg border cursor-pointer transition ${
                      status === opt.id
                        ? 'border-slate-900 bg-slate-50'
                        : 'border-slate-200 hover:bg-slate-50/50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="pubStatus"
                      checked={status === opt.id}
                      onChange={() => {
                        setStatus(opt.id);
                        setIsDirty(true);
                      }}
                      className="mt-0.5 text-slate-900 focus:ring-slate-900"
                    />
                    <div>
                      <div className="text-xs font-bold text-slate-900">{opt.label}</div>
                      <div className="text-[11px] text-slate-500">{opt.desc}</div>
                    </div>
                  </label>
                ))}
              </div>

              {status === 'SCHEDULED' && (
                <div className="pt-2">
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Tanggal & Waktu Publikasi *
                  </label>
                  <input
                    type="datetime-local"
                    value={scheduledAt}
                    onChange={(e) => {
                      setScheduledAt(e.target.value);
                      setIsDirty(true);
                    }}
                    className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-slate-300"
                  />
                </div>
              )}

              <div className="pt-2 flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => handleSaveMaterial(status, false)}
                  disabled={savingState === 'SAVING'}
                  className="w-full py-2.5 px-4 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition shadow-xs"
                >
                  Simpan & Terapkan Status ({status})
                </button>
              </div>
            </section>

            {/* SECTION F: LEARNING SETTINGS & PROGRESS TRACKING */}
            <section className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs space-y-4">
              <div className="flex items-center gap-2.5 border-b border-slate-100 pb-3.5">
                <div className="w-7 h-7 rounded-lg bg-slate-900 text-amber-400 flex items-center justify-center font-mono text-xs font-bold">
                  F
                </div>
                <div>
                  <h2 className="text-sm font-bold text-slate-900">
                    Pengaturan Pembelajaran & Ketuntasan
                  </h2>
                  <p className="text-[11px] text-slate-500">
                    Aturan pelacakan progres belajar mahasiswa
                  </p>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Metode Ketuntasan Belajar (Completion Rule)
                </label>
                <select
                  value={completionRule}
                  onChange={(e) => {
                    setCompletionRule(e.target.value as any);
                    setIsDirty(true);
                  }}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 bg-white font-medium"
                >
                  <option value="MANUAL_MARK">Tandai Selesai Mandiri oleh Mahasiswa</option>
                  <option value="VIEW">Otomatis Saat Halaman Materi Dibuka</option>
                  <option value="SCROLL">Baca & Gulir Konten Sampai Selesai</option>
                  <option value="VIDEO_PROGRESS">Tonton Video Pembelajaran Sampai Target</option>
                  <option value="ATTACHMENT_OPEN">Buka / Pratinjau Dokumen Lampiran</option>
                </select>
              </div>

              <div>
                <div className="flex items-center justify-between text-xs font-bold text-slate-700 mb-1">
                  <span>Batas Minimum Progres Ketuntasan</span>
                  <span className="font-mono tabular-nums text-slate-900">
                    {minCompletionPercent}%
                  </span>
                </div>
                <input
                  type="range"
                  min={10}
                  max={100}
                  step={5}
                  value={minCompletionPercent}
                  onChange={(e) => {
                    setMinCompletionPercent(Number(e.target.value));
                    setIsDirty(true);
                  }}
                  className="w-full accent-slate-900"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Materi Prasyarat (Prerequisite Material)
                </label>
                <select
                  value={prerequisiteMaterialId}
                  onChange={(e) => {
                    setPrerequisiteMaterialId(e.target.value);
                    setIsDirty(true);
                  }}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 bg-white"
                >
                  <option value="">— Tanpa Prasyarat (Langsung Terbuka) —</option>
                  {otherMaterials.map((m: any) => (
                    <option key={m.id} value={m.id}>
                      Pertemuan #{m.meetingNumber || 1}: {m.title}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-3 pt-2 border-t border-slate-100">
                <label className="flex items-center justify-between gap-2 cursor-pointer">
                  <span className="text-xs font-semibold text-slate-700">
                    Aktifkan Diskusi & Komentar Mahasiswa
                  </span>
                  <input
                    type="checkbox"
                    checked={enableComments}
                    onChange={(e) => {
                      setEnableComments(e.target.checked);
                      setIsDirty(true);
                    }}
                    className="w-4 h-4 rounded border-slate-300 text-slate-900"
                  />
                </label>

                <label className="flex items-center justify-between gap-2 cursor-pointer">
                  <span className="text-xs font-semibold text-slate-700">
                    Izinkan Mahasiswa Mengunduh Lampiran S3
                  </span>
                  <input
                    type="checkbox"
                    checked={enableDownloads}
                    onChange={(e) => {
                      setEnableDownloads(e.target.checked);
                      setIsDirty(true);
                    }}
                    className="w-4 h-4 rounded border-slate-300 text-slate-900"
                  />
                </label>

                <label className="flex items-center justify-between gap-2 cursor-pointer">
                  <span className="text-xs font-semibold text-slate-700">
                    Izinkan Akses Berkelanjutan Setelah Rilis
                  </span>
                  <input
                    type="checkbox"
                    checked={allowAccessAfterPublish}
                    onChange={(e) => {
                      setAllowAccessAfterPublish(e.target.checked);
                      setIsDirty(true);
                    }}
                    className="w-4 h-4 rounded border-slate-300 text-slate-900"
                  />
                </label>
              </div>
            </section>
          </div>
        </div>
      )}

      {/* Isolated Document Preview Modal */}
      {activeMaterialId && previewAttachmentId && (
        <DocumentPreviewModal
          materialId={activeMaterialId}
          attachmentId={previewAttachmentId}
          onClose={() => setPreviewAttachmentId(null)}
          allowDownload={enableDownloads}
        />
      )}
      <ConfirmDialog {...deleteConfirm.dialogProps} />
      </div>
    </AppShell>
  );
}
