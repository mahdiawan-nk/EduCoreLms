import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldAlert, ArrowLeft, Home } from 'lucide-react';
import { AppShell } from './AppShell';
import { Button, Card } from './ui/primitives';

interface ForbiddenPageProps {
  title?: string;
  description?: string;
  requiredPermission?: string;
}

export function ForbiddenPage({
  title = '403 — Akses Ditolak',
  description = 'Anda tidak memiliki otorisasi RBAC yang memadai untuk mengakses halaman atau modul ini.',
  requiredPermission,
}: ForbiddenPageProps) {
  const navigate = useNavigate();

  return (
    <AppShell breadcrumb="Akses Ditolak (403)">
      <div className="max-w-xl mx-auto py-12 px-4">
        <Card className="p-8 text-center border-[#E2E8F0] bg-white shadow-xs">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 border border-amber-200 text-amber-600">
            <ShieldAlert className="h-7 w-7" />
          </div>
          <span className="inline-flex items-center rounded-md bg-[#14213D] px-2.5 py-0.5 text-[11px] font-mono font-semibold text-white">
            HTTP 403 · FORBIDDEN
          </span>
          <h1 className="mt-3 text-xl font-bold text-[#172033]">{title}</h1>
          <p className="mt-2 text-sm text-[#64748B] leading-relaxed">
            {description}
          </p>
          {requiredPermission && (
            <p className="mt-3 text-[11px] font-mono text-[#64748B] bg-[#F7F9FC] border border-[#E2E8F0] rounded-lg px-3 py-1.5 inline-block">
              Izin diperlukan: {requiredPermission}
            </p>
          )}
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => navigate(-1)}
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Kembali</span>
            </Button>
            <Button
              type="button"
              className="bg-[#2563EB] hover:bg-blue-700 text-white"
              onClick={() => navigate('/')}
            >
              <Home className="h-4 w-4" />
              <span>Ke Dashboard Utama</span>
            </Button>
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
