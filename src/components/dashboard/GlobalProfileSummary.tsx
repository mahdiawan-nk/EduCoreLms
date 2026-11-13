import React from 'react';
import {
  Building2,
  CalendarDays,
  Mail,
  ShieldCheck,
  SlidersHorizontal,
  UserCheck,
  GraduationCap,
  BadgeCheck,
  Lock,
} from 'lucide-react';
import { Card, Button } from '../ui/primitives';
import type { AcademicPeriodItem, ProfileSummaryData } from './types';

function getInitials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0]?.toUpperCase() || '')
    .join('');
}

const ROLE_STYLES: Record<
  ProfileSummaryData['primaryRole'],
  { label: string; badge: string; avatarBg: string }
> = {
  SUPERADMIN: {
    label: 'Superadmin Akademik',
    badge: 'bg-slate-900 text-white',
    avatarBg: 'bg-slate-900 text-white',
  },
  DOSEN: {
    label: 'Dosen Pengampu',
    badge: 'bg-blue-50 text-blue-700 border border-blue-200',
    avatarBg: 'bg-blue-700 text-white',
  },
  MAHASISWA: {
    label: 'Mahasiswa',
    badge: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
    avatarBg: 'bg-emerald-700 text-white',
  },
  AUDITOR: {
    label: 'Auditor Internal (Read-Only)',
    badge: 'bg-amber-50 text-amber-800 border border-amber-200',
    avatarBg: 'bg-amber-700 text-white',
  },
};

export function GlobalProfileSummary({
  profile,
  activePeriod,
  selectedPeriodId,
  availablePeriods,
  onPeriodChange,
  onOpenPersonalize,
  onOpenSecurity,
}: {
  profile: ProfileSummaryData;
  activePeriod: AcademicPeriodItem | null;
  selectedPeriodId: string;
  availablePeriods: AcademicPeriodItem[];
  onPeriodChange: (periodId: string) => void;
  onOpenPersonalize: () => void;
  onOpenSecurity?: () => void;
}) {
  const style = ROLE_STYLES[profile.primaryRole];

  // Role-specific metadata items (strictly non-sensitive academic/institutional identity)
  const roleFields: { label: string; value: string }[] = [];
  if (profile.primaryRole === 'SUPERADMIN') {
    roleFields.push(
      { label: 'NIP', value: profile.nip || profile.identityNumber || '-' },
      { label: 'Jabatan', value: profile.academicTitle || 'Administrator Sistem LMS' },
      { label: 'Unit Kerja', value: profile.organizationalUnit || 'Politeknik Kampar' },
      {
        label: 'Status Administrator',
        value: profile.isActive ? 'Aktif & Terverifikasi' : 'Nonaktif',
      }
    );
  } else if (profile.primaryRole === 'DOSEN') {
    roleFields.push(
      { label: 'NIDN', value: profile.nidn || profile.identityNumber || '-' },
      { label: 'Gelar Akademik', value: profile.academicTitle || 'Dosen Tetap' },
      { label: 'Program Studi', value: profile.studyProgram || 'Teknik Informatika' },
      { label: 'Unit Kerja', value: profile.organizationalUnit || 'Politeknik Kampar' }
    );
  } else if (profile.primaryRole === 'MAHASISWA') {
    roleFields.push(
      { label: 'NIM', value: profile.nim || profile.identityNumber || '-' },
      { label: 'Program Studi', value: profile.studyProgram || 'Teknik Informatika' },
      {
        label: 'Semester',
        value: profile.semesterLevel ? `Semester ${profile.semesterLevel}` : 'Aktif',
      },
      {
        label: 'Tahun Masuk',
        value: profile.admissionYear ? String(profile.admissionYear) : '-',
      },
      { label: 'Status Akademik', value: profile.academicStatus || 'AKTIF' }
    );
  } else {
    roleFields.push(
      { label: 'Nomor Identitas', value: profile.nip || profile.identityNumber || '-' },
      { label: 'Unit Kerja', value: profile.organizationalUnit || 'Satuan Pengawas Internal' },
      { label: 'Lingkup Audit', value: profile.auditScope || 'Institusional (Read-Only)' },
      { label: 'Status Auditor', value: profile.isActive ? 'Aktif (Hanya-Baca)' : 'Nonaktif' }
    );
  }

  return (
    <Card className="bg-white border border-slate-200 shadow-xs p-4 sm:p-5">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        {/* Left: Avatar + Primary Identity */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-4 min-w-0">
          {profile.avatarUrl ? (
            <img
              src={profile.avatarUrl}
              alt={profile.fullName}
              className="h-14 w-14 rounded-xl object-cover border border-slate-200 shrink-0"
            />
          ) : (
            <div
              className={`h-14 w-14 rounded-xl flex items-center justify-center text-lg font-bold shrink-0 ${style.avatarBg}`}
            >
              {getInitials(profile.fullName)}
            </div>
          )}

          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-lg sm:text-xl font-bold text-slate-900 truncate">
                {profile.fullName}
              </h1>
              <span
                className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold ${style.badge}`}
              >
                <BadgeCheck className="h-3.5 w-3.5" />
                {style.label}
              </span>
              <span
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${
                  profile.accountStatus === 'ACTIVE' && profile.isActive
                    ? 'bg-emerald-50 text-emerald-700'
                    : 'bg-rose-50 text-rose-700'
                }`}
              >
                <UserCheck className="h-3 w-3" />
                {profile.accountStatus === 'ACTIVE' && profile.isActive
                  ? 'Akun Aktif'
                  : profile.accountStatus}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600">
              <span className="inline-flex items-center gap-1.5 truncate">
                <Mail className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                {profile.email}
              </span>
              <span className="inline-flex items-center gap-1.5 truncate">
                <Building2 className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                {profile.studyProgram || profile.organizationalUnit}
              </span>
              {activePeriod && (
                <span className="inline-flex items-center gap-1.5 text-slate-700 font-medium">
                  <CalendarDays className="h-3.5 w-3.5 text-blue-600 shrink-0" />
                  {activePeriod.name}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Right: Period Filter & Dashboard Controls */}
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {availablePeriods.length > 0 && (
            <select
              aria-label="Filter Periode Akademik"
              value={selectedPeriodId}
              onChange={(e) => onPeriodChange(e.target.value)}
              className="h-9 rounded-lg border border-slate-200 bg-slate-50 px-3 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 max-w-full sm:max-w-[230px]"
            >
              {availablePeriods.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} {p.isDefault ? '(Aktif)' : ''}
                </option>
              ))}
            </select>
          )}

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onOpenPersonalize}
            className="h-9 text-xs border-slate-200 text-slate-700"
          >
            <SlidersHorizontal className="h-3.5 w-3.5 mr-1.5" />
            Atur Widget
          </Button>

          {onOpenSecurity && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onOpenSecurity}
              className="h-9 text-xs border-slate-200 text-slate-700"
            >
              {profile.primaryRole === 'AUDITOR' ? (
                <>
                  <ShieldCheck className="h-3.5 w-3.5 mr-1.5 text-amber-600" />
                  Info Akun
                </>
              ) : (
                <>
                  <Lock className="h-3.5 w-3.5 mr-1.5 text-slate-600" />
                  Profil & Keamanan
                </>
              )}
            </Button>
          )}
        </div>
      </div>

      {/* Role-Specific Academic Identity Strip */}
      <div className="mt-4 pt-3.5 border-t border-slate-100 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-3">
        {roleFields.map((field) => (
          <div key={field.label} className="min-w-0">
            <p className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">
              {field.label}
            </p>
            <p className="mt-0.5 text-xs font-semibold text-slate-800 truncate flex items-center gap-1">
              <GraduationCap className="h-3 w-3 text-slate-400 shrink-0 hidden sm:inline" />
              <span className="truncate">{field.value}</span>
            </p>
          </div>
        ))}
      </div>
    </Card>
  );
}
