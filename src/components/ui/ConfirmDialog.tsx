import React, { useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Loader2, X } from 'lucide-react';
import { Button } from './primitives';
import { useModalBehavior } from './modalUtils';

export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange?: (open: boolean) => void;
  onClose?: () => void;
  title: string;
  description: string;
  itemName?: string;
  warningText?: string;
  actionLabel?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'default' | 'destructive';
  loading?: boolean;
  isLoading?: boolean;
  errorMessage?: string | null;
  onConfirm: () => void | Promise<void>;
  onCancel?: () => void;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  onClose,
  title,
  description,
  itemName,
  warningText,
  actionLabel,
  confirmLabel,
  cancelLabel = 'Batal',
  variant = 'destructive',
  loading,
  isLoading,
  errorMessage,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const titleId = useId();
  const descId = useId();
  const cancelBtnRef = useRef<HTMLButtonElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);

  const busy = Boolean(loading ?? isLoading);
  const resolvedConfirmLabel =
    actionLabel || confirmLabel || (variant === 'destructive' ? 'Ya, Hapus' : 'Konfirmasi');

  const handleClose = () => {
    if (busy) return;
    onCancel?.();
    onClose?.();
    onOpenChange?.(false);
  };

  useModalBehavior({
    open,
    containerRef: dialogRef,
    onClose: handleClose,
    disableEscape: busy,
    initialFocusRef: cancelBtnRef,
  });

  if (!open || typeof document === 'undefined') return null;

  const isDestructive = variant === 'destructive';

  return createPortal(
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-950/55 p-4 sm:p-6 overflow-y-auto backdrop-blur-xs"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) {
          handleClose();
        }
      }}
    >
      <div
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        tabIndex={-1}
        className="relative my-auto flex w-full max-w-md flex-col rounded-xl border border-slate-200 bg-white p-6 shadow-2xl max-h-[calc(100dvh-2rem)] sm:max-h-[calc(100dvh-3rem)] overflow-y-auto outline-none"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div
              className={`rounded-lg p-2.5 shrink-0 ${
                isDestructive
                  ? 'bg-rose-50 text-rose-600 border border-rose-200'
                  : 'bg-amber-50 text-amber-700 border border-amber-200'
              }`}
            >
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div>
              <h2 id={titleId} className="text-base font-bold text-slate-900 leading-snug">
                {title}
              </h2>
              <p id={descId} className="mt-1 text-sm text-slate-600 leading-relaxed">
                {description}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleClose}
            disabled={busy}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-40 cursor-pointer"
            aria-label="Tutup dialog konfirmasi"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Target Resource Badge */}
        {itemName && (
          <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Item yang akan diproses
            </p>
            <p className="mt-0.5 text-sm font-bold text-slate-900 break-words">{itemName}</p>
          </div>
        )}

        {/* Dependency / Consequence Warning */}
        {warningText && (
          <div
            className={`mt-3 rounded-lg border px-3.5 py-2.5 text-xs leading-relaxed ${
              isDestructive
                ? 'border-rose-200 bg-rose-50/70 text-rose-900'
                : 'border-amber-200 bg-amber-50/70 text-amber-900'
            }`}
          >
            {warningText}
          </div>
        )}

        {/* Error Feedback (keeps modal open for retry) */}
        {errorMessage && (
          <div
            role="alert"
            className="mt-3 rounded-lg border border-rose-300 bg-rose-50 px-3.5 py-2.5 text-xs font-medium text-rose-800"
          >
            {errorMessage}
          </div>
        )}

        {/* Footer Actions */}
        <div className="mt-6 flex items-center justify-end gap-2.5">
          <Button
            ref={cancelBtnRef}
            type="button"
            variant="outline"
            onClick={handleClose}
            disabled={busy}
          >
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant={isDestructive ? 'destructive' : 'default'}
            onClick={() => {
              if (!busy) void onConfirm();
            }}
            disabled={busy}
          >
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />}
            {busy
              ? isDestructive
                ? 'Menghapus...'
                : 'Memproses...'
              : resolvedConfirmLabel}
          </Button>
        </div>
      </div>
    </div>,
    document.body
  );
}
