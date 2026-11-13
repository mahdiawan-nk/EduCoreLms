import { useState, useCallback } from 'react';
import { toast } from 'sonner';
import type { ConfirmDialogProps } from '../components/ui/ConfirmDialog';

export interface DeleteConfirmationRequest<T = unknown> {
  item: T;
  title: string;
  description: string;
  itemName?: string;
  warningText?: string;
  actionLabel?: string;
  cancelLabel?: string;
  variant?: 'default' | 'destructive';
  successMessage?: string;
  onConfirm: (item: T) => Promise<void> | void;
}

export function useDeleteConfirmation<T = any>() {
  const [request, setRequest] = useState<DeleteConfirmationRequest<T> | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const requestConfirmation = useCallback((config: DeleteConfirmationRequest<T>) => {
    setErrorMessage(null);
    setRequest(config);
  }, []);

  const cancel = useCallback(() => {
    if (loading) return;
    setRequest(null);
    setErrorMessage(null);
  }, [loading]);

  const confirm = useCallback(async () => {
    if (!request || loading) return;
    setLoading(true);
    setErrorMessage(null);
    try {
      await request.onConfirm(request.item);
      if (request.successMessage) {
        toast.success(request.successMessage);
      }
      setRequest(null);
    } catch (err: any) {
      const msg =
        err?.message || 'Gagal melaksanakan tindakan penghapusan. Silakan coba lagi.';
      setErrorMessage(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [request, loading]);

  const dialogProps: ConfirmDialogProps = {
    open: Boolean(request),
    onOpenChange: (open) => {
      if (!open) cancel();
    },
    onClose: cancel,
    onCancel: cancel,
    onConfirm: confirm,
    title: request?.title || 'Konfirmasi Hapus',
    description: request?.description || 'Apakah Anda yakin ingin menghapus item ini?',
    itemName: request?.itemName,
    warningText: request?.warningText,
    actionLabel: request?.actionLabel || 'Ya, Hapus',
    cancelLabel: request?.cancelLabel || 'Batal',
    variant: request?.variant || 'destructive',
    loading,
    errorMessage,
  };

  return {
    isOpen: Boolean(request),
    target: request?.item ?? null,
    isDeleting: loading,
    errorMessage,
    requestConfirmation,
    confirm,
    cancel,
    dialogProps,
  };
}
