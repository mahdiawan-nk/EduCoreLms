import crypto from 'crypto';
import argon2 from 'argon2';
import { FastifyReply, FastifyRequest } from 'fastify';
import { eq, and, gt } from 'drizzle-orm';
import { db } from '../db/index.ts';
import {
  users,
  userProfiles,
  userSessions,
  roles,
  permissions,
  userRoles,
  rolePermissions,
  classroomInstructors,
  classroomEnrollments,
  impersonationSessions,
  auditLogs,
} from '../db/schema.ts';
import { adminAuth } from '../lib/firebase-admin.ts';
import { getOrCreateUser } from '../db/users.ts';

export const SESSION_COOKIE_NAME = 'pk_lms_session';
export const CSRF_COOKIE_NAME = 'pk_lms_csrf';

export type PermissionActionType =
  | 'VIEW'
  | 'CREATE'
  | 'UPDATE'
  | 'DELETE'
  | 'PUBLISH'
  | 'APPROVE'
  | 'SUBMIT'
  | 'GRADE'
  | 'EXPORT'
  | 'MANAGE';

export type PermissionRiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type ResourceScope =
  | 'GLOBAL'
  | 'INSTITUTION'
  | 'PROGRAM_STUDY'
  | 'ASSIGNED'
  | 'OWN'
  | 'ENROLLED'
  | 'NONE';

export interface PermissionDef {
  code: string;
  name: string;
  module: string;
  description: string;
  actionType: PermissionActionType;
  riskLevel: PermissionRiskLevel;
  allowedContext: ResourceScope[];
  isProtected?: boolean;
  auditorAllowed?: boolean;
}

export const PERMISSION_REGISTRY: PermissionDef[] = [
  // Users
  {
    code: 'users:read',
    name: 'Lihat Pengguna',
    module: 'Users',
    description: 'View users and profiles',
    actionType: 'VIEW',
    riskLevel: 'LOW',
    allowedContext: ['GLOBAL', 'INSTITUTION'],
    auditorAllowed: true,
  },
  {
    code: 'users:manage',
    name: 'Kelola Pengguna',
    module: 'Users',
    description: 'Create, update, activate/deactivate users',
    actionType: 'MANAGE',
    riskLevel: 'CRITICAL',
    allowedContext: ['GLOBAL'],
    isProtected: true,
  },
  {
    code: 'users.password_reset',
    name: 'Reset Password Pengguna',
    module: 'Users',
    description: 'Reset individual user temporary credentials and enforce password change',
    actionType: 'MANAGE',
    riskLevel: 'CRITICAL',
    allowedContext: ['GLOBAL'],
    isProtected: true,
  },
  {
    code: 'users.password_reset_bulk',
    name: 'Reset Password Massal',
    module: 'Users',
    description: 'Perform bulk temporary password resets across multiple user accounts',
    actionType: 'MANAGE',
    riskLevel: 'CRITICAL',
    allowedContext: ['GLOBAL'],
    isProtected: true,
  },
  {
    code: 'users.impersonate',
    name: 'Switch Account / Impersonate Pengguna',
    module: 'Users',
    description: 'Temporarily switch session into another active user account for troubleshooting and RBAC verification',
    actionType: 'MANAGE',
    riskLevel: 'CRITICAL',
    allowedContext: ['GLOBAL'],
    isProtected: true,
  },
  {
    code: 'users.impersonate.stop',
    name: 'Akhiri Sesi Impersonasi',
    module: 'Users',
    description: 'Stop active impersonation session and restore original Superadmin account',
    actionType: 'MANAGE',
    riskLevel: 'CRITICAL',
    allowedContext: ['GLOBAL'],
    isProtected: true,
  },
  {
    code: 'users.password_change_own',
    name: 'Ubah Password Pribadi',
    module: 'Users',
    description: 'Change own account password and complete mandatory password updates',
    actionType: 'UPDATE',
    riskLevel: 'MEDIUM',
    allowedContext: ['OWN'],
  },
  {
    code: 'users.password_security_view',
    name: 'Lihat Status Keamanan Akun',
    module: 'Users',
    description: 'Inspect user credential status, expiration, and session security state',
    actionType: 'VIEW',
    riskLevel: 'LOW',
    allowedContext: ['GLOBAL', 'INSTITUTION'],
    auditorAllowed: true,
  },
  {
    code: 'audit.password_events_view',
    name: 'Lihat Audit Event Password',
    module: 'Security',
    description: 'View password reset, change, and expiration security audit events',
    actionType: 'VIEW',
    riskLevel: 'MEDIUM',
    allowedContext: ['GLOBAL', 'INSTITUTION'],
    isProtected: true,
    auditorAllowed: true,
  },

  // RBAC
  {
    code: 'rbac:view',
    name: 'Lihat Matriks RBAC',
    module: 'RBAC',
    description: 'View roles, permissions, and RBAC change history',
    actionType: 'VIEW',
    riskLevel: 'MEDIUM',
    allowedContext: ['GLOBAL', 'INSTITUTION'],
    isProtected: true,
    auditorAllowed: true,
  },
  {
    code: 'rbac:manage',
    name: 'Kelola RBAC',
    module: 'RBAC',
    description: 'Manage roles and permission assignments',
    actionType: 'MANAGE',
    riskLevel: 'CRITICAL',
    allowedContext: ['GLOBAL'],
    isProtected: true,
  },

  // Academic Period
  {
    code: 'academic_period.view',
    name: 'Lihat Periode Akademik',
    module: 'Academic Period',
    description: 'View official academic periods and semester details',
    actionType: 'VIEW',
    riskLevel: 'LOW',
    allowedContext: ['GLOBAL', 'INSTITUTION'],
    auditorAllowed: true,
  },
  {
    code: 'academic_period.create',
    name: 'Buat Periode Akademik',
    module: 'Academic Period',
    description: 'Create new academic periods and semester records',
    actionType: 'CREATE',
    riskLevel: 'HIGH',
    allowedContext: ['GLOBAL'],
  },
  {
    code: 'academic_period.update',
    name: 'Ubah Periode Akademik',
    module: 'Academic Period',
    description: 'Edit eligible academic period information and dates',
    actionType: 'UPDATE',
    riskLevel: 'HIGH',
    allowedContext: ['GLOBAL'],
  },
  {
    code: 'academic_period.delete',
    name: 'Hapus Periode Akademik',
    module: 'Academic Period',
    description: 'Delete eligible academic periods without dependencies',
    actionType: 'DELETE',
    riskLevel: 'CRITICAL',
    allowedContext: ['GLOBAL'],
  },
  {
    code: 'academic_period.activate',
    name: 'Aktifkan Periode Akademik',
    module: 'Academic Period',
    description: 'Activate a scheduled or draft academic period',
    actionType: 'APPROVE',
    riskLevel: 'HIGH',
    allowedContext: ['GLOBAL'],
  },
  {
    code: 'academic_period.set_default',
    name: 'Tetapkan Periode Default',
    module: 'Academic Period',
    description: 'Designate the single default academic period',
    actionType: 'MANAGE',
    riskLevel: 'HIGH',
    allowedContext: ['GLOBAL'],
  },
  {
    code: 'academic_period.complete',
    name: 'Selesaikan Periode Akademik',
    module: 'Academic Period',
    description: 'Mark an active academic period as completed',
    actionType: 'UPDATE',
    riskLevel: 'HIGH',
    allowedContext: ['GLOBAL'],
  },
  {
    code: 'academic_period.archive',
    name: 'Arsipkan Periode Akademik',
    module: 'Academic Period',
    description: 'Archive a completed academic period as read-only',
    actionType: 'UPDATE',
    riskLevel: 'HIGH',
    allowedContext: ['GLOBAL'],
  },
  {
    code: 'academic_period.view_history',
    name: 'Lihat Riwayat Periode',
    module: 'Academic Period',
    description: 'View academic period lifecycle and audit history',
    actionType: 'VIEW',
    riskLevel: 'LOW',
    allowedContext: ['GLOBAL', 'INSTITUTION'],
    auditorAllowed: true,
  },

  // Classrooms
  {
    code: 'classrooms:view',
    name: 'Lihat Ruang Kelas',
    module: 'Classrooms',
    description: 'View authorized classrooms, stream, and course metadata',
    actionType: 'VIEW',
    riskLevel: 'LOW',
    allowedContext: ['GLOBAL', 'INSTITUTION', 'ASSIGNED', 'ENROLLED'],
    auditorAllowed: true,
  },
  {
    code: 'classrooms:create',
    name: 'Buat Ruang Kelas',
    module: 'Classrooms',
    description: 'Create and configure digital classrooms',
    actionType: 'CREATE',
    riskLevel: 'MEDIUM',
    allowedContext: ['GLOBAL', 'OWN'],
  },
  {
    code: 'classrooms:manage_all',
    name: 'Kelola Semua Kelas',
    module: 'Classrooms',
    description: 'Manage and monitor all classrooms across Politeknik Kampar',
    actionType: 'MANAGE',
    riskLevel: 'CRITICAL',
    allowedContext: ['GLOBAL'],
  },
  {
    code: 'classrooms:teach',
    name: 'Kelola Kelas Diampu',
    module: 'Classrooms',
    description: 'Manage owned/assigned classrooms, join codes, settings, and topics',
    actionType: 'MANAGE',
    riskLevel: 'MEDIUM',
    allowedContext: ['ASSIGNED', 'OWN'],
  },
  {
    code: 'classrooms:analytics',
    name: 'Lihat Analitik Kelas',
    module: 'Classrooms',
    description: 'View classroom analytics, progress distributions, and activity history',
    actionType: 'VIEW',
    riskLevel: 'LOW',
    allowedContext: ['GLOBAL', 'INSTITUTION', 'ASSIGNED'],
    auditorAllowed: true,
  },
  {
    code: 'classrooms.discover_public',
    name: 'Temukan Kelas Publik',
    module: 'Classrooms',
    description: 'Discover public classrooms across Politeknik Kampar',
    actionType: 'VIEW',
    riskLevel: 'LOW',
    allowedContext: ['INSTITUTION'],
    auditorAllowed: true,
  },
  {
    code: 'classrooms.view_progress',
    name: 'Lihat Kemajuan Belajar',
    module: 'Classrooms',
    description: 'View personal learning progress in enrolled classrooms',
    actionType: 'VIEW',
    riskLevel: 'LOW',
    allowedContext: ['ENROLLED', 'OWN'],
  },
  {
    code: 'classrooms.manage_invitations',
    name: 'Kelola Kode Undangan Kelas',
    module: 'Classrooms',
    description: 'Generate, revoke, and manage classroom invitation codes',
    actionType: 'MANAGE',
    riskLevel: 'MEDIUM',
    allowedContext: ['ASSIGNED', 'OWN'],
  },

  // Enrollments
  {
    code: 'enrollments:view',
    name: 'Lihat Daftar Peserta',
    module: 'Enrollments',
    description: 'View classroom enrollment rosters and waitlists',
    actionType: 'VIEW',
    riskLevel: 'LOW',
    allowedContext: ['GLOBAL', 'INSTITUTION', 'ASSIGNED', 'ENROLLED'],
    auditorAllowed: true,
  },
  {
    code: 'enrollments:manage',
    name: 'Kelola Pendaftaran Kelas',
    module: 'Enrollments',
    description: 'Approve, reject, or drop student enrollments',
    actionType: 'APPROVE',
    riskLevel: 'MEDIUM',
    allowedContext: ['ASSIGNED', 'OWN'],
  },
  {
    code: 'enrollments:join',
    name: 'Gabung Ruang Kelas',
    module: 'Enrollments',
    description: 'Join classrooms using a join code or self-enrollment',
    actionType: 'CREATE',
    riskLevel: 'LOW',
    allowedContext: ['ENROLLED'],
  },

  // Content & Learning Materials
  {
    code: 'materials:view',
    name: 'Lihat Materi Pembelajaran',
    module: 'Content',
    description: 'View learning materials in authorized classrooms',
    actionType: 'VIEW',
    riskLevel: 'LOW',
    allowedContext: ['GLOBAL', 'INSTITUTION', 'ASSIGNED', 'ENROLLED'],
    auditorAllowed: true,
  },
  {
    code: 'content:publish',
    name: 'Terbitkan Materi & Pengumuman',
    module: 'Content',
    description: 'Create, edit, delete, and publish announcements and learning materials',
    actionType: 'PUBLISH',
    riskLevel: 'MEDIUM',
    allowedContext: ['ASSIGNED', 'OWN'],
  },

  // Assignments
  {
    code: 'assignments:view',
    name: 'Lihat Tugas',
    module: 'Assessments',
    description: 'View assignments and authorized submission records',
    actionType: 'VIEW',
    riskLevel: 'LOW',
    allowedContext: ['GLOBAL', 'INSTITUTION', 'ASSIGNED', 'ENROLLED'],
    auditorAllowed: true,
  },
  {
    code: 'assignments:manage',
    name: 'Kelola & Nilai Tugas',
    module: 'Assessments',
    description: 'Create, update, delete assignments and grade student submissions',
    actionType: 'GRADE',
    riskLevel: 'MEDIUM',
    allowedContext: ['ASSIGNED', 'OWN'],
  },
  {
    code: 'assignments:submit',
    name: 'Kumpulkan Tugas',
    module: 'Assessments',
    description: 'Submit assignment work and revisions',
    actionType: 'SUBMIT',
    riskLevel: 'LOW',
    allowedContext: ['ENROLLED'],
  },
  {
    code: 'assignments:export',
    name: 'Ekspor Data Tugas',
    module: 'Assessments',
    description: 'Export assignment submission reports and scores',
    actionType: 'EXPORT',
    riskLevel: 'HIGH',
    allowedContext: ['GLOBAL', 'ASSIGNED'],
  },

  // Assessments, Quizzes & Question Bank
  {
    code: 'assessments:view',
    name: 'Lihat Asesmen & Ujian',
    module: 'Assessments',
    description: 'View quizzes, examinations, and authorized attempt summaries',
    actionType: 'VIEW',
    riskLevel: 'LOW',
    allowedContext: ['GLOBAL', 'INSTITUTION', 'ASSIGNED', 'ENROLLED'],
    auditorAllowed: true,
  },
  {
    code: 'quizzes:manage',
    name: 'Kelola Kuis & Ujian',
    module: 'Assessments',
    description: 'Create, publish, and grade quizzes, examinations, and answer keys',
    actionType: 'MANAGE',
    riskLevel: 'HIGH',
    allowedContext: ['ASSIGNED', 'OWN'],
  },
  {
    code: 'quizzes:attempt',
    name: 'Ikuti Kuis & Ujian',
    module: 'Assessments',
    description: 'Attempt quizzes and examinations as an active enrolled student',
    actionType: 'SUBMIT',
    riskLevel: 'LOW',
    allowedContext: ['ENROLLED'],
  },
  {
    code: 'question_bank:view',
    name: 'Lihat Bank Soal',
    module: 'Assessments',
    description: 'View question bank repositories',
    actionType: 'VIEW',
    riskLevel: 'MEDIUM',
    allowedContext: ['GLOBAL', 'INSTITUTION', 'OWN'],
    auditorAllowed: true,
  },
  {
    code: 'question_bank:manage',
    name: 'Kelola Bank Soal',
    module: 'Assessments',
    description: 'Create, edit, import, and delete question bank items',
    actionType: 'MANAGE',
    riskLevel: 'HIGH',
    allowedContext: ['GLOBAL', 'OWN'],
  },

  // Gradebook
  {
    code: 'grades:view',
    name: 'Lihat Buku Nilai Kelas',
    module: 'Gradebook',
    description: 'View classroom gradebook records within authorized scope',
    actionType: 'VIEW',
    riskLevel: 'MEDIUM',
    allowedContext: ['GLOBAL', 'INSTITUTION', 'ASSIGNED'],
    auditorAllowed: true,
  },
  {
    code: 'grades:manage',
    name: 'Kelola Buku Nilai',
    module: 'Gradebook',
    description: 'Configure grade categories and record/publish student grades',
    actionType: 'GRADE',
    riskLevel: 'HIGH',
    allowedContext: ['ASSIGNED', 'OWN'],
  },
  {
    code: 'grades:view_own',
    name: 'Lihat Nilai Pribadi',
    module: 'Gradebook',
    description: 'View personal published gradebook records and progress',
    actionType: 'VIEW',
    riskLevel: 'LOW',
    allowedContext: ['ENROLLED', 'OWN'],
  },

  // Security & System
  {
    code: 'audit:view',
    name: 'Lihat Log Audit',
    module: 'Security',
    description: 'View platform audit logs and security telemetry',
    actionType: 'VIEW',
    riskLevel: 'HIGH',
    allowedContext: ['GLOBAL', 'INSTITUTION'],
    isProtected: true,
    auditorAllowed: true,
  },
  {
    code: 'system:openapi_view',
    name: 'Lihat Spesifikasi API',
    module: 'Security',
    description: 'View OpenAPI system documentation',
    actionType: 'VIEW',
    riskLevel: 'LOW',
    allowedContext: ['GLOBAL', 'INSTITUTION'],
    auditorAllowed: true,
  },

  // Auditor Read-Only Granular View Permissions
  {
    code: 'auditor.dashboard.view',
    name: 'Lihat Dashboard Auditor',
    module: 'Auditor',
    description: 'Read-only access to institutional monitoring dashboard and statistics',
    actionType: 'VIEW',
    riskLevel: 'LOW',
    allowedContext: ['GLOBAL', 'INSTITUTION'],
    auditorAllowed: true,
  },
  {
    code: 'auditor.academic.view',
    name: 'Lihat Data Akademik (Auditor)',
    module: 'Auditor',
    description: 'Read-only access to academic periods, semesters, and academic history',
    actionType: 'VIEW',
    riskLevel: 'LOW',
    allowedContext: ['GLOBAL', 'INSTITUTION'],
    auditorAllowed: true,
  },
  {
    code: 'auditor.classrooms.view',
    name: 'Lihat Ruang Kelas (Auditor)',
    module: 'Auditor',
    description: 'Read-only access to digital classrooms, instructors, and rosters',
    actionType: 'VIEW',
    riskLevel: 'LOW',
    allowedContext: ['GLOBAL', 'INSTITUTION'],
    auditorAllowed: true,
  },
  {
    code: 'auditor.classwork.view',
    name: 'Lihat Classwork & Materi (Auditor)',
    module: 'Auditor',
    description: 'Read-only access to learning modules, materials, and student progress',
    actionType: 'VIEW',
    riskLevel: 'LOW',
    allowedContext: ['GLOBAL', 'INSTITUTION'],
    auditorAllowed: true,
  },
  {
    code: 'auditor.assignments.view',
    name: 'Lihat Tugas & Pengumpulan (Auditor)',
    module: 'Auditor',
    description: 'Read-only access to assignments, submissions, and grading status',
    actionType: 'VIEW',
    riskLevel: 'LOW',
    allowedContext: ['GLOBAL', 'INSTITUTION'],
    auditorAllowed: true,
  },
  {
    code: 'auditor.assessments.view',
    name: 'Lihat Asesmen & Ujian (Auditor)',
    module: 'Auditor',
    description: 'Read-only access to assessment configurations and examination results',
    actionType: 'VIEW',
    riskLevel: 'LOW',
    allowedContext: ['GLOBAL', 'INSTITUTION'],
    auditorAllowed: true,
  },
  {
    code: 'auditor.grades.view',
    name: 'Lihat Rekap Nilai (Auditor)',
    module: 'Auditor',
    description: 'Read-only access to gradebook and academic grade summaries',
    actionType: 'VIEW',
    riskLevel: 'LOW',
    allowedContext: ['GLOBAL', 'INSTITUTION'],
    auditorAllowed: true,
  },
  {
    code: 'auditor.users.view',
    name: 'Lihat Profil Pengguna (Auditor)',
    module: 'Auditor',
    description: 'Read-only access to user directory and account profiles',
    actionType: 'VIEW',
    riskLevel: 'LOW',
    allowedContext: ['GLOBAL', 'INSTITUTION'],
    auditorAllowed: true,
  },
  {
    code: 'auditor.audit_logs.view',
    name: 'Lihat Audit Log (Auditor)',
    module: 'Auditor',
    description: 'Read-only access to system security and activity audit logs',
    actionType: 'VIEW',
    riskLevel: 'LOW',
    allowedContext: ['GLOBAL', 'INSTITUTION'],
    auditorAllowed: true,
  },
  {
    code: 'auditor.reports.view',
    name: 'Lihat Laporan Akademik (Auditor)',
    module: 'Auditor',
    description: 'Read-only access to academic monitoring reports and analytics',
    actionType: 'VIEW',
    riskLevel: 'LOW',
    allowedContext: ['GLOBAL', 'INSTITUTION'],
    auditorAllowed: true,
  },

  // System Settings, Institutional Branding & Theme (Superadmin Only)
  {
    code: 'system_settings.view',
    name: 'Lihat Pengaturan Sistem',
    module: 'System Settings',
    description: 'View global system settings, branding, SEO, and theme configuration',
    actionType: 'VIEW',
    riskLevel: 'MEDIUM',
    allowedContext: ['GLOBAL', 'INSTITUTION'],
    isProtected: true,
    auditorAllowed: false,
  },
  {
    code: 'system_settings.manage_identity',
    name: 'Kelola Identitas Institusi',
    module: 'System Settings',
    description: 'Update institutional identity details and application metadata',
    actionType: 'UPDATE',
    riskLevel: 'HIGH',
    allowedContext: ['GLOBAL', 'INSTITUTION'],
    isProtected: true,
    auditorAllowed: false,
  },
  {
    code: 'system_settings.manage_branding',
    name: 'Kelola Branding & Logo',
    module: 'System Settings',
    description: 'Upload and manage institutional logos, application logos, and favicons',
    actionType: 'UPDATE',
    riskLevel: 'HIGH',
    allowedContext: ['GLOBAL', 'INSTITUTION'],
    isProtected: true,
    auditorAllowed: false,
  },
  {
    code: 'system_settings.manage_seo',
    name: 'Kelola SEO & Metadata',
    module: 'System Settings',
    description: 'Configure global SEO metadata, Open Graph tags, and indexing rules',
    actionType: 'UPDATE',
    riskLevel: 'MEDIUM',
    allowedContext: ['GLOBAL', 'INSTITUTION'],
    isProtected: true,
    auditorAllowed: false,
  },
  {
    code: 'system_settings.manage_theme',
    name: 'Kelola Tema Akademik',
    module: 'System Settings',
    description: 'Switch and persist global academic color presets',
    actionType: 'UPDATE',
    riskLevel: 'MEDIUM',
    allowedContext: ['GLOBAL', 'INSTITUTION'],
    isProtected: true,
    auditorAllowed: false,
  },
  {
    code: 'system_settings.manage_general',
    name: 'Kelola Konfigurasi Umum',
    module: 'System Settings',
    description: 'Manage general system configuration and upload policies',
    actionType: 'UPDATE',
    riskLevel: 'HIGH',
    allowedContext: ['GLOBAL', 'INSTITUTION'],
    isProtected: true,
    auditorAllowed: false,
  },
  // Knowledge Center Permissions
  {
    code: 'knowledge.view',
    name: 'Lihat Pusat Bantuan & Dokumentasi',
    module: 'Knowledge Center',
    description: 'Read role-scoped Knowledge Center documentation and FAQs',
    actionType: 'VIEW',
    riskLevel: 'LOW',
    allowedContext: ['GLOBAL', 'INSTITUTION'],
    auditorAllowed: true,
  },
  {
    code: 'knowledge.manage',
    name: 'Kelola Pusat Bantuan & Dokumentasi',
    module: 'Knowledge Center',
    description: 'Create, edit, publish, archive, and manage Knowledge Center articles, categories, tags, and FAQs',
    actionType: 'MANAGE',
    riskLevel: 'HIGH',
    allowedContext: ['GLOBAL', 'INSTITUTION'],
    isProtected: true,
    auditorAllowed: false,
  },
];

export const PERMISSION_MAP_BY_CODE = new Map(
  PERMISSION_REGISTRY.map((p) => [p.code, p])
);

export const ROLE_PERMISSION_MAP: Record<string, string[]> = {
  SUPERADMIN: PERMISSION_REGISTRY.map((p) => p.code),
  DOSEN: [
    'users:read',
    'users.password_change_own',
    'academic_period.view',
    'academic_period.view_history',
    'classrooms:view',
    'classrooms.discover_public',
    'classrooms.view_progress',
    'classrooms:create',
    'classrooms:teach',
    'classrooms:analytics',
    'classrooms.manage_invitations',
    'classrooms.view_progress',
    'enrollments:view',
    'enrollments:manage',
    'materials:view',
    'content:publish',
    'assignments:view',
    'assignments:manage',
    'assignments:export',
    'assessments:view',
    'quizzes:manage',
    'question_bank:view',
    'question_bank:manage',
    'grades:view',
    'grades:manage',
    'knowledge.view',
  ],
  MAHASISWA: [
    'users.password_change_own',
    'academic_period.view',
    'classrooms:view',
    'classrooms.discover_public',
    'classrooms.view_progress',
    'enrollments:view',
    'enrollments:join',
    'materials:view',
    'assignments:view',
    'assignments:submit',
    'assessments:view',
    'quizzes:attempt',
    'grades:view_own',
    'knowledge.view',
  ],
  AUDITOR: PERMISSION_REGISTRY.filter((p) => p.auditorAllowed === true).map(
    (p) => p.code
  ),
};

// Password Hashing with Argon2id
export async function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain, {
    type: argon2.argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });
}

export async function verifyPassword(hash: string, plain: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, plain);
  } catch {
    return false;
  }
}

export function hashSessionToken(rawToken: string): string {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

export function generateRandomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('hex');
}

// Login Rate Limiter (Sliding Window)
interface RateLimitEntry {
  attempts: number;
  resetAt: number;
}
const loginAttemptsMap = new Map<string, RateLimitEntry>();

export function checkLoginRateLimit(key: string): { allowed: boolean; retryAfterSeconds: number } {
  const now = Date.now();
  const windowMs = 5 * 60 * 1000; // 5 minutes
  const maxAttempts = 10;

  const entry = loginAttemptsMap.get(key);
  if (!entry || entry.resetAt <= now) {
    loginAttemptsMap.set(key, { attempts: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterSeconds: 0 };
  }

  if (entry.attempts >= maxAttempts) {
    return {
      allowed: false,
      retryAfterSeconds: Math.ceil((entry.resetAt - now) / 1000),
    };
  }

  entry.attempts += 1;
  return { allowed: true, retryAfterSeconds: 0 };
}

export function clearLoginRateLimit(key: string): void {
  loginAttemptsMap.delete(key);
}

// Consistent API v1 Response Helpers
export function sendSuccess<T>(
  reply: FastifyReply,
  data: T,
  meta: Record<string, unknown> | null = null,
  statusCode = 200
) {
  return reply.code(statusCode).send({
    success: true,
    data,
    meta,
  });
}

export function sendError(
  reply: FastifyReply,
  statusCode: number,
  code: string,
  message: string,
  details: unknown[] = []
) {
  return reply.code(statusCode).send({
    success: false,
    error: {
      code,
      message,
      details,
    },
  });
}

// Authenticated Context
export interface ImpersonationContext {
  isImpersonating: true;
  impersonationSessionId: string;
  originalUserId: string;
  originalUserName: string;
  originalUserEmail: string;
  originalRole: string;
  impersonatedUserId: string;
  impersonatedUserName: string;
  impersonatedRole: string;
  startedAt: string;
  expiresAt: string;
  reason: string | null;
}

export interface AuthenticatedUser {
  id: string;
  email: string;
  fullName: string;
  identityNumber: string | null;
  studyProgram: string;
  roles: string[];
  permissions: string[];
  mustResetPassword: boolean;
  temporaryPasswordExpiresAt: string | null;
  passwordChangedAt: string | null;
  csrfToken: string;
  sessionId?: string;
  impersonation?: ImpersonationContext | null;
}

export async function getUserWithRolesAndPermissions(userId: string): Promise<Omit<AuthenticatedUser, 'csrfToken' | 'sessionId'> | null> {
  try {
    const userRows = await db.select().from(users).where(eq(users.id, userId));
    const user = userRows[0];
    if (!user || !user.isActive) return null;

    const profileRows = await db
      .select()
      .from(userProfiles)
      .where(eq(userProfiles.userId, user.id));

    const assignedRoles = await db
      .select({
        roleId: roles.id,
        roleCode: roles.code,
      })
      .from(userRoles)
      .innerJoin(roles, eq(userRoles.roleId, roles.id))
      .where(eq(userRoles.userId, user.id));

    const roleCodes = assignedRoles.map((r) => r.roleCode);
    const permissionSet = new Set<string>();

    for (const r of assignedRoles) {
      const perms = await db
        .select({ code: permissions.code })
        .from(rolePermissions)
        .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
        .where(eq(rolePermissions.roleId, r.roleId));
      perms.forEach((p) => permissionSet.add(p.code));
    }

    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      identityNumber: user.identityNumber,
      studyProgram: profileRows[0]?.studyProgram || 'Teknik Informatika',
      roles: roleCodes,
      permissions: Array.from(permissionSet),
      mustResetPassword: Boolean(user.mustResetPassword),
      temporaryPasswordExpiresAt: user.temporaryPasswordExpiresAt
        ? user.temporaryPasswordExpiresAt.toISOString()
        : null,
      passwordChangedAt: user.passwordChangedAt
        ? user.passwordChangedAt.toISOString()
        : null,
    };
  } catch (error) {
    console.error('Failed to load user RBAC profile:', error);
    throw new Error('Failed to load user RBAC profile.', { cause: error });
  }
}

export function isAuditorOnly(user: Pick<AuthenticatedUser, 'roles'>): boolean {
  const upper = user.roles.map((r) => r.toUpperCase());
  return upper.includes('AUDITOR') && !upper.includes('SUPERADMIN');
}

export async function authenticateRequest(
  req: FastifyRequest,
  reply: FastifyReply,
  options: {
    requireCsrf?: boolean;
    requiredPermissions?: string[];
    anyPermissions?: string[];
  } = {}
): Promise<AuthenticatedUser | null> {
  try {
    let authUser: AuthenticatedUser | null = null;

    // 1. Check Server-Side HttpOnly Session Cookie
    const rawToken = req.cookies?.[SESSION_COOKIE_NAME];
    if (rawToken) {
      const tokenHash = hashSessionToken(rawToken);
      const now = new Date();
      const sessionRows = await db
        .select()
        .from(userSessions)
        .where(
          and(
            eq(userSessions.tokenHash, tokenHash),
            eq(userSessions.isRevoked, false),
            gt(userSessions.expiresAt, now)
          )
        );

      const session = sessionRows[0];
      if (session) {
        // Verify CSRF on mutating requests when using cookie session
        const method = req.method.toUpperCase();
        const isMutating = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);
        if (options.requireCsrf !== false && isMutating) {
          const headerCsrf = req.headers['x-csrf-token'];
          if (!headerCsrf || headerCsrf !== session.csrfToken) {
            sendError(
              reply,
              403,
              'CSRF_TOKEN_MISMATCH',
              'Permintaan ditolak: Token keamanan CSRF tidak valid atau hilang.'
            );
            return null;
          }
        }

        // Check if an active impersonation session is attached to this session
        const activeImpRows = await db
          .select()
          .from(impersonationSessions)
          .where(
            and(
              eq(impersonationSessions.sessionId, session.id),
              eq(impersonationSessions.isActive, true)
            )
          );
        const activeImp = activeImpRows[0];

        if (activeImp) {
          if (new Date(activeImp.expiresAt) <= now) {
            // Impersonation session expired: deactivate and log, then fall back to original Superadmin
            await db
              .update(impersonationSessions)
              .set({
                isActive: false,
                endedAt: now,
                endReason: 'EXPIRED',
              })
              .where(eq(impersonationSessions.id, activeImp.id));

            void recordAuditLog({
              actorId: activeImp.originalUserId,
              action: 'USER_IMPERSONATION_EXPIRED',
              entityType: 'USER_IMPERSONATION',
              entityId: activeImp.impersonatedUserId,
              metadata: {
                impersonationSessionId: activeImp.id,
                sessionId: session.id,
                originalUserId: activeImp.originalUserId,
                impersonatedUserId: activeImp.impersonatedUserId,
                originalRole: activeImp.originalRole,
                impersonatedRole: activeImp.impersonatedRole,
                reason: activeImp.reason,
                userAgent: req.headers['user-agent'] || null,
              },
              ipAddress: req.ip,
            });

            const origProfile = await getUserWithRolesAndPermissions(session.userId);
            if (origProfile) {
              authUser = {
                ...origProfile,
                csrfToken: session.csrfToken,
                sessionId: session.id,
                impersonation: null,
              };
            }
          } else {
            const targetProfile = await getUserWithRolesAndPermissions(activeImp.impersonatedUserId);
            const origProfile = await getUserWithRolesAndPermissions(activeImp.originalUserId);

            if (!targetProfile || !origProfile) {
              await db
                .update(impersonationSessions)
                .set({
                  isActive: false,
                  endedAt: now,
                  endReason: 'REVOKED',
                })
                .where(eq(impersonationSessions.id, activeImp.id));

              if (origProfile) {
                authUser = {
                  ...origProfile,
                  csrfToken: session.csrfToken,
                  sessionId: session.id,
                  impersonation: null,
                };
              }
            } else {
              authUser = {
                ...targetProfile,
                csrfToken: session.csrfToken,
                sessionId: session.id,
                impersonation: {
                  isImpersonating: true,
                  impersonationSessionId: activeImp.id,
                  originalUserId: origProfile.id,
                  originalUserName: origProfile.fullName,
                  originalUserEmail: origProfile.email,
                  originalRole: activeImp.originalRole,
                  impersonatedUserId: targetProfile.id,
                  impersonatedUserName: targetProfile.fullName,
                  impersonatedRole: activeImp.impersonatedRole,
                  startedAt: activeImp.startedAt.toISOString(),
                  expiresAt: activeImp.expiresAt.toISOString(),
                  reason: activeImp.reason ?? null,
                },
              };
            }
          }
        } else {
          const profile = await getUserWithRolesAndPermissions(session.userId);
          if (profile) {
            authUser = {
              ...profile,
              csrfToken: session.csrfToken,
              sessionId: session.id,
              impersonation: null,
            };
          }
        }
      }
    }

    // 2. Fallback: Check Firebase Auth Bearer ID Token (Cloud SQL Integration Standard)
    if (!authUser) {
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const idToken = authHeader.split('Bearer ')[1];
        try {
          const decoded = await adminAuth.verifyIdToken(idToken);
          if (decoded.email) {
            const dbUser = await getOrCreateUser(
              decoded.uid,
              decoded.email,
              decoded.name
            );
            const profile = await getUserWithRolesAndPermissions(dbUser.id);
            if (profile) {
              authUser = {
                ...profile,
                csrfToken: 'firebase-bearer-verified',
              };
            }
          }
        } catch (err) {
          console.error('Error verifying Firebase token:', err);
        }
      }
    }

    // Deny by default if unauthenticated
    if (!authUser) {
      sendError(
        reply,
        401,
        'UNAUTHORIZED',
        'Sesi autentikasi tidak ditemukan atau telah berakhir. Silakan masuk kembali.'
      );
      return null;
    }

    // 3. Centralized AUDITOR Strict Read-Only Mutation & Export Guard
    const method = req.method.toUpperCase();
    const requestPath = (req.url || '').split('?')[0];
    const isMutatingRequest = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);
    const isAllowedAuditorAuthAction =
      requestPath === '/api/v1/auth/logout' ||
      requestPath === '/api/v1/auth/impersonation/stop' ||
      (requestPath === '/api/v1/auth/change-password' && authUser.mustResetPassword);

    // 3a. Block password/security-setting changes during active impersonation
    if (
      authUser.impersonation?.isImpersonating &&
      requestPath === '/api/v1/auth/change-password'
    ) {
      sendError(
        reply,
        403,
        'FORBIDDEN_DURING_IMPERSONATION',
        'Tidak diizinkan mengubah password atau pengaturan keamanan akun saat sedang dalam sesi impersonasi.'
      );
      return null;
    }

    // 3b. Global Mandatory Password Change Enforcement
    if (authUser.mustResetPassword) {
      if (
        authUser.temporaryPasswordExpiresAt &&
        new Date(authUser.temporaryPasswordExpiresAt) < new Date()
      ) {
        if (authUser.sessionId) {
          await db
            .update(userSessions)
            .set({ isRevoked: true })
            .where(eq(userSessions.id, authUser.sessionId));
        }
        void recordAuditLog({
          actorId: authUser.id,
          action: 'AUTH_TEMP_PASSWORD_EXPIRED',
          entityType: 'USER',
          entityId: authUser.id,
          ipAddress: req.ip,
        });
        sendError(
          reply,
          401,
          'TEMPORARY_PASSWORD_EXPIRED',
          'Password sementara Anda telah kedaluwarsa. Hubungi administrator untuk reset ulang.'
        );
        return null;
      }

      const allowedDuringForceChange =
        requestPath === '/api/v1/auth/me' ||
        requestPath === '/api/v1/auth/logout' ||
        requestPath === '/api/v1/auth/impersonation/stop' ||
        requestPath === '/api/v1/auth/impersonation/status' ||
        requestPath === '/api/v1/auth/change-password';

      if (!allowedDuringForceChange) {
        sendError(
          reply,
          403,
          'PASSWORD_CHANGE_REQUIRED',
          'Anda wajib mengganti password sementara sebelum mengakses fitur LMS Politeknik Kampar.'
        );
        return null;
      }
    }
    const isExportRoute =
      requestPath.includes('/export') ||
      (req.url || '').toLowerCase().includes('export=true');

    if (isAuditorOnly(authUser)) {
      if (isMutatingRequest && !isAllowedAuditorAuthAction) {
        void recordAuditLog({
          actorId: authUser.id,
          action: 'AUDITOR_MUTATION_BLOCKED',
          entityType: 'SECURITY_POLICY',
          metadata: { method, path: requestPath },
          ipAddress: req.ip,
        });
        sendError(
          reply,
          403,
          'FORBIDDEN_AUDITOR_READ_ONLY',
          'Akses ditolak: Peran AUDITOR bersifat hanya-baca (read-only) dan tidak diizinkan melakukan mutasi data.'
        );
        return null;
      }

      if (isExportRoute) {
        void recordAuditLog({
          actorId: authUser.id,
          action: 'AUDITOR_EXPORT_BLOCKED',
          entityType: 'SECURITY_POLICY',
          metadata: { method, path: requestPath },
          ipAddress: req.ip,
        });
        sendError(
          reply,
          403,
          'FORBIDDEN_AUDITOR_EXPORT_DENIED',
          'Akses ditolak: Peran AUDITOR tidak diizinkan mengekspor data tanpa otorisasi eksplisit.'
        );
        return null;
      }

      if (
        method === 'GET' &&
        requestPath !== '/api/v1/auth/me' &&
        requestPath !== '/api/v1/openapi.json'
      ) {
        void recordAuditLog({
          actorId: authUser.id,
          action: 'AUDITOR_READ_ACCESS',
          entityType: 'API_RESOURCE',
          metadata: { method, path: requestPath },
          ipAddress: req.ip,
        });
      }
    }

    // 4. Enforce RBAC Permissions (Deny-by-default)
    const isSuperadmin = authUser.roles.some((r) => r.toUpperCase() === 'SUPERADMIN');
    if (!isSuperadmin) {
      if (options.requiredPermissions && options.requiredPermissions.length > 0) {
        const hasAll = options.requiredPermissions.every((perm) =>
          authUser!.permissions.includes(perm)
        );
        if (!hasAll) {
          sendError(
            reply,
            403,
            'FORBIDDEN_INSUFFICIENT_PERMISSIONS',
            'Akses ditolak: Anda tidak memiliki izin RBAC untuk melakukan operasi ini.',
            options.requiredPermissions
          );
          return null;
        }
      }

      if (options.anyPermissions && options.anyPermissions.length > 0) {
        const hasAny = options.anyPermissions.some((perm) =>
          authUser!.permissions.includes(perm)
        );
        if (!hasAny) {
          sendError(
            reply,
            403,
            'FORBIDDEN_INSUFFICIENT_PERMISSIONS',
            'Akses ditolak: Anda tidak memiliki izin RBAC yang diperlukan untuk operasi ini.',
            options.anyPermissions
          );
          return null;
        }
      }
    }

    return authUser;
  } catch (error) {
    console.error('Authentication check failed:', error);
    sendError(reply, 500, 'AUTH_INTERNAL_ERROR', 'Gagal memverifikasi sesi keamanan.');
    return null;
  }
}

// Resource Ownership & Classroom Access Policy (Deny-by-default)
export async function checkClassroomAccess(
  user: AuthenticatedUser,
  classroomId: string
): Promise<{
  canView: boolean;
  canManage: boolean;
  isInstructor: boolean;
  isEnrolledActive: boolean;
  isAuditor: boolean;
  enrollmentStatus: string | null;
}> {
  if (user.roles.some((r) => r.toUpperCase() === 'SUPERADMIN')) {
    return {
      canView: true,
      canManage: true,
      isInstructor: true,
      isEnrolledActive: true,
      isAuditor: false,
      enrollmentStatus: 'active',
    };
  }

  if (isAuditorOnly(user)) {
    return {
      canView: true,
      canManage: false,
      isInstructor: false,
      isEnrolledActive: false,
      isAuditor: true,
      enrollmentStatus: null,
    };
  }

  const instructorRow = await db
    .select()
    .from(classroomInstructors)
    .where(
      and(
        eq(classroomInstructors.classroomId, classroomId),
        eq(classroomInstructors.instructorId, user.id)
      )
    );

  if (instructorRow.length > 0) {
    return {
      canView: true,
      canManage: true,
      isInstructor: true,
      isEnrolledActive: false,
      isAuditor: false,
      enrollmentStatus: null,
    };
  }

  const enrollmentRow = await db
    .select()
    .from(classroomEnrollments)
    .where(
      and(
        eq(classroomEnrollments.classroomId, classroomId),
        eq(classroomEnrollments.studentId, user.id)
      )
    );

  const status = enrollmentRow[0]?.status || null;
  const isEnrolledActive = status === 'active' || status === 'completed';

  return {
    canView: isEnrolledActive,
    canManage: false,
    isInstructor: false,
    isEnrolledActive,
    isAuditor: false,
    enrollmentStatus: status,
  };
}

let rbacInitialized = false;

export async function ensureRbacInitialized(): Promise<void> {
  if (rbacInitialized) return;
  rbacInitialized = true;

  try {
    // 1. Ensure canonical roles exist
    const canonicalRoles = [
      {
        code: 'SUPERADMIN',
        name: 'Superadmin Akademik',
        description:
          'Otoritas penuh pengelolaan sistem, RBAC, data akademik, dan audit keamanan Politeknik Kampar.',
        isSystem: true,
      },
      {
        code: 'DOSEN',
        name: 'Dosen Pengampu',
        description:
          'Pengajar mata kuliah yang berwenang mengelola kelas digital, materi, tugas, kuis, dan buku nilai dalam ruang lingkup kelasnya.',
        isSystem: true,
      },
      {
        code: 'MAHASISWA',
        name: 'Mahasiswa',
        description:
          'Peserta didik aktif Politeknik Kampar yang mengikuti perkuliahan, tugas, kuis, dan melihat nilai terpublikasi.',
        isSystem: true,
      },
      {
        code: 'AUDITOR',
        name: 'Auditor Akademik (Read-Only)',
        description:
          'Pengawas dan auditor internal dengan akses hanya-baca (read-only) untuk meninjau data akademik, kelas, nilai, dan log audit tanpa hak mutasi.',
        isSystem: true,
      },
    ];

    for (const r of canonicalRoles) {
      await db
        .insert(roles)
        .values(r)
        .onConflictDoNothing({ target: roles.code });
    }

    // 2. Safe legacy role alias migration (preserve existing user assignments)
    const legacyAliases: Record<string, string> = {
      ADMIN: 'SUPERADMIN',
      LECTURER: 'DOSEN',
      INSTRUCTOR: 'DOSEN',
      STUDENT: 'MAHASISWA',
    };

    const allRoles = await db.select().from(roles);
    const roleByCode = new Map(allRoles.map((r) => [r.code.toUpperCase(), r]));

    for (const [legacyCode, canonicalCode] of Object.entries(legacyAliases)) {
      const legacyRole = roleByCode.get(legacyCode);
      const canonicalRole = roleByCode.get(canonicalCode);
      if (legacyRole && canonicalRole && legacyRole.id !== canonicalRole.id) {
        const legacyAssignments = await db
          .select()
          .from(userRoles)
          .where(eq(userRoles.roleId, legacyRole.id));
        for (const assign of legacyAssignments) {
          await db
            .insert(userRoles)
            .values({ userId: assign.userId, roleId: canonicalRole.id })
            .onConflictDoNothing();
        }
      }
    }

    // 3. Upsert PERMISSION_REGISTRY into permissions table
    for (const perm of PERMISSION_REGISTRY) {
      await db
        .insert(permissions)
        .values({
          code: perm.code,
          module: perm.module,
          description: perm.description,
        })
        .onConflictDoUpdate({
          target: permissions.code,
          set: {
            module: perm.module,
            description: perm.description,
          },
        });
    }

    // 4. Sync default permissions for newly added permissions/roles
    const freshRoles = await db.select().from(roles);
    const allPerms = await db.select().from(permissions);
    const permByCode = new Map(allPerms.map((p) => [p.code, p.id]));
    const existingRolePerms = await db.select().from(rolePermissions);

    for (const roleRow of freshRoles) {
      const upperCode = roleRow.code.toUpperCase();
      const mappedCodes = ROLE_PERMISSION_MAP[upperCode];
      if (!mappedCodes) continue;

      const currentPermCount = existingRolePerms.filter(
        (rp) => rp.roleId === roleRow.id
      ).length;

      // Seed all mapped permissions if role has none yet (e.g., newly created AUDITOR)
      // or always ensure SUPERADMIN has all permissions and AUDITOR has only auditorAllowed ones
      if (currentPermCount === 0 || upperCode === 'SUPERADMIN') {
        for (const code of mappedCodes) {
          const permId = permByCode.get(code);
          if (permId) {
            await db
              .insert(rolePermissions)
              .values({ roleId: roleRow.id, permissionId: permId })
              .onConflictDoNothing();
          }
        }
      } else {
        // For DOSEN/MAHASISWA/AUDITOR: add any newly introduced granular permissions that match their default map
        for (const code of mappedCodes) {
          const permId = permByCode.get(code);
          if (permId) {
            await db
              .insert(rolePermissions)
              .values({ roleId: roleRow.id, permissionId: permId })
              .onConflictDoNothing();
          }
        }
      }

      // Enforce AUDITOR strict read-only in DB: strip any non-auditorAllowed permission
      if (upperCode === 'AUDITOR') {
        const allowedIds = new Set(
          PERMISSION_REGISTRY.filter((p) => p.auditorAllowed === true)
            .map((p) => permByCode.get(p.code))
            .filter(Boolean) as string[]
        );
        const auditorAssignments = existingRolePerms.filter(
          (rp) => rp.roleId === roleRow.id
        );
        for (const rp of auditorAssignments) {
          if (!allowedIds.has(rp.permissionId)) {
            await db
              .delete(rolePermissions)
              .where(
                and(
                  eq(rolePermissions.roleId, roleRow.id),
                  eq(rolePermissions.permissionId, rp.permissionId)
                )
              );
          }
        }
      }
    }
  } catch (err) {
    rbacInitialized = false;
    console.error('Failed to initialize RBAC registry:', err);
  }
}

export async function recordAuditLog(params: {
  actorId: string | null;
  action: string;
  entityType: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
}) {
  try {
    await db.insert(auditLogs).values({
      actorId: params.actorId,
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId || null,
      metadata: params.metadata || {},
      ipAddress: params.ipAddress || '127.0.0.1',
    });
  } catch (err) {
    console.error('Failed to record audit log:', err);
  }
}
