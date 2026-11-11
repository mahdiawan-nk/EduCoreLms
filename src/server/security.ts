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
  auditLogs,
} from '../db/schema.ts';
import { adminAuth } from '../lib/firebase-admin.ts';
import { getOrCreateUser } from '../db/users.ts';

export const SESSION_COOKIE_NAME = 'pk_lms_session';
export const CSRF_COOKIE_NAME = 'pk_lms_csrf';

export interface PermissionDef {
  code: string;
  module: string;
  description: string;
}

export const PERMISSION_REGISTRY: PermissionDef[] = [
  { code: 'users:read', module: 'Users', description: 'View users and profiles' },
  { code: 'users:manage', module: 'Users', description: 'Create, update, activate/deactivate users' },
  { code: 'rbac:manage', module: 'RBAC', description: 'Manage roles and permission assignments' },
  { code: 'academic:manage', module: 'Academic', description: 'Manage academic years, semesters, and master courses' },
  { code: 'classrooms:create', module: 'Classrooms', description: 'Create new classrooms from master courses' },
  { code: 'classrooms:manage_all', module: 'Classrooms', description: 'Manage and monitor all classrooms across Politeknik Kampar' },
  { code: 'classrooms:teach', module: 'Classrooms', description: 'Manage owned/assigned classrooms, join codes, and topics' },
  { code: 'enrollments:manage', module: 'Enrollments', description: 'Approve, reject, or drop student enrollments' },
  { code: 'enrollments:join', module: 'Enrollments', description: 'Join classrooms using a join code' },
  { code: 'content:publish', module: 'Content', description: 'Publish announcements and learning materials' },
  { code: 'assignments:manage', module: 'Assessments', description: 'Create assignments and grade student submissions' },
  { code: 'assignments:submit', module: 'Assessments', description: 'Submit assignment work and revisions' },
  { code: 'quizzes:manage', module: 'Assessments', description: 'Create quizzes, questions, and answer keys' },
  { code: 'quizzes:attempt', module: 'Assessments', description: 'Attempt quizzes as an active enrolled student' },
  { code: 'grades:manage', module: 'Gradebook', description: 'Configure grade categories and record student grades' },
  { code: 'grades:view_own', module: 'Gradebook', description: 'View personal gradebook records and progress' },
  { code: 'audit:view', module: 'Security', description: 'View platform audit logs and security telemetry' },
];

export const ROLE_PERMISSION_MAP: Record<string, string[]> = {
  SUPERADMIN: PERMISSION_REGISTRY.map((p) => p.code),
  DOSEN: [
    'users:read',
    'classrooms:create',
    'classrooms:teach',
    'enrollments:manage',
    'content:publish',
    'assignments:manage',
    'quizzes:manage',
    'grades:manage',
  ],
  MAHASISWA: [
    'enrollments:join',
    'assignments:submit',
    'quizzes:attempt',
    'grades:view_own',
  ],
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
export interface AuthenticatedUser {
  id: string;
  email: string;
  fullName: string;
  identityNumber: string | null;
  studyProgram: string;
  roles: string[];
  permissions: string[];
  csrfToken: string;
  sessionId?: string;
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
    };
  } catch (error) {
    console.error('Failed to load user RBAC profile:', error);
    throw new Error('Failed to load user RBAC profile.', { cause: error });
  }
}

export async function authenticateRequest(
  req: FastifyRequest,
  reply: FastifyReply,
  options: { requireCsrf?: boolean; requiredPermissions?: string[] } = {}
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

        const profile = await getUserWithRolesAndPermissions(session.userId);
        if (profile) {
          authUser = {
            ...profile,
            csrfToken: session.csrfToken,
            sessionId: session.id,
          };
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

    // 3. Enforce RBAC Permissions (Deny-by-default)
    if (options.requiredPermissions && options.requiredPermissions.length > 0) {
      const isSuperadmin = authUser.roles.includes('SUPERADMIN');
      if (!isSuperadmin) {
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
  enrollmentStatus: string | null;
}> {
  if (user.roles.includes('SUPERADMIN')) {
    return {
      canView: true,
      canManage: true,
      isInstructor: true,
      isEnrolledActive: true,
      enrollmentStatus: 'active',
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
    enrollmentStatus: status,
  };
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
