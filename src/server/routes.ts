import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq, and, desc, asc, ilike, or, sql } from 'drizzle-orm';
import { db } from '../db/index.ts';
import {
  validatePasswordPolicy,
  checkPasswordReuse,
  recordPasswordInHistory,
} from './passwordPolicy.ts';
import {
  users,
  userProfiles,
  roles,
  permissions,
  userRoles,
  rolePermissions,
  academicYears,
  semesters,
  courses,
  classrooms,
  classroomInstructors,
  classroomJoinCodes,
  classroomEnrollments,
  classroomTopics,
  storedFiles,
  learningMaterials,
  materialAttachments,
  materialVideos,
  materialProgress,
  announcements,
  comments,
  assignments,
  assignmentAttachments,
  assignmentSubmissions,
  submissionRevisions,
  quizzes,
  quizQuestions,
  quizOptions,
  quizAttempts,
  quizAnswers,
  gradeCategories,
  gradeItems,
  gradeRecords,
  userSessions,
  impersonationSessions,
  notifications,
  auditLogs,
  assessments,
  assessmentQuestions,
  assessmentQuestionPools,
  assessmentAttempts,
} from '../db/schema.ts';
import {
  SESSION_COOKIE_NAME,
  CSRF_COOKIE_NAME,
  hashPassword,
  verifyPassword,
  hashSessionToken,
  generateRandomToken,
  checkLoginRateLimit,
  clearLoginRateLimit,
  sendSuccess,
  sendError,
  authenticateRequest,
  checkClassroomAccess,
  getUserWithRolesAndPermissions,
  recordAuditLog,
  PERMISSION_MAP_BY_CODE,
  ensureRbacInitialized,
  isAuditorOnly,
} from './security.ts';
import { ensureSeeded } from './seed.ts';
import { openApiSpec } from './openapi.ts';
import { adminAuth } from '../lib/firebase-admin.ts';
import { getOrCreateUser } from '../db/users.ts';

const isProd = process.env.NODE_ENV === 'production';

function setSessionCookies(
  req: any,
  reply: any,
  rawSessionToken: string,
  csrfToken: string,
  expiresAt: Date
) {
  const isHttps = req.protocol === 'https' || req.headers?.['x-forwarded-proto'] === 'https';
  // Use Secure cookies only when running in production over HTTPS.
  // In local development (HTTP on localhost or LAN), browsers reject Secure cookies,
  // causing auth sessions to be dropped.
  const secure = isProd && isHttps;

  reply.setCookie(SESSION_COOKIE_NAME, rawSessionToken, {
    path: '/',
    httpOnly: true,
    secure,
    sameSite: secure ? 'none' : 'lax',
    expires: expiresAt,
  });
  reply.setCookie(CSRF_COOKIE_NAME, csrfToken, {
    path: '/',
    httpOnly: false,
    secure,
    sameSite: secure ? 'none' : 'lax',
    expires: expiresAt,
  });
}

export async function registerApiRoutes(fastify: FastifyInstance) {
  // Ensure database is lazily seeded on first API request
  fastify.addHook('preHandler', async (req) => {
    if (req.url.startsWith('/api/v1')) {
      await ensureSeeded();
    }
  });

  // OpenAPI 3.1 Documentation Endpoint
  fastify.get('/api/v1/openapi.json', async (_req, reply) => {
    return sendSuccess(reply, openApiSpec);
  });

  // ============================================================================
  // 1. AUTHENTICATION & SERVER-SIDE SESSIONS
  // ============================================================================
  const loginSchema = z.object({
    email: z.string().email('Format email tidak valid'),
    password: z.string().min(6, 'Kata sandi minimal 6 karakter'),
  });

  fastify.post('/api/v1/auth/login', async (req, reply) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(
        reply,
        400,
        'VALIDATION_ERROR',
        'Input kredensial tidak valid.',
        parsed.error.issues
      );
    }

    const { email, password } = parsed.data;
    const rateKey = `${req.ip}:${email.toLowerCase()}`;
    const rateStatus = checkLoginRateLimit(rateKey);
    if (!rateStatus.allowed) {
      return sendError(
        reply,
        429,
        'RATE_LIMIT_EXCEEDED',
        `Terlalu banyak percobaan masuk. Silakan coba lagi dalam ${rateStatus.retryAfterSeconds} detik.`
      );
    }

    try {
      const userRows = await db
        .select()
        .from(users)
        .where(eq(users.email, email.toLowerCase()));
      const user = userRows[0];

      if (!user || !user.isActive) {
        return sendError(
          reply,
          401,
          'INVALID_CREDENTIALS',
          'Email atau kata sandi tidak sesuai.'
        );
      }

      const validPassword = await verifyPassword(user.passwordHash, password);
      if (!validPassword) {
        await recordAuditLog({
          actorId: user.id,
          action: 'AUTH_LOGIN_FAILED',
          entityType: 'USER',
          entityId: user.id,
          ipAddress: req.ip,
        });
        return sendError(
          reply,
          401,
          'INVALID_CREDENTIALS',
          'Email atau kata sandi tidak sesuai.'
        );
      }

      clearLoginRateLimit(rateKey);

      if (
        user.mustResetPassword &&
        user.temporaryPasswordExpiresAt &&
        new Date(user.temporaryPasswordExpiresAt) < new Date()
      ) {
        await recordAuditLog({
          actorId: user.id,
          action: 'AUTH_TEMP_PASSWORD_EXPIRED',
          entityType: 'USER',
          entityId: user.id,
          ipAddress: req.ip,
        });
        return sendError(
          reply,
          401,
          'TEMPORARY_PASSWORD_EXPIRED',
          'Password sementara Anda telah kedaluwarsa. Hubungi administrator untuk melakukan reset ulang.'
        );
      }

      const rawSessionToken = generateRandomToken(32);
      const tokenHash = hashSessionToken(rawSessionToken);
      const csrfToken = generateRandomToken(24);
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      await db.transaction(async (tx) => {
        await tx.insert(userSessions).values({
          userId: user.id,
          tokenHash,
          csrfToken,
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'] || 'Unknown',
          expiresAt,
        });

        await tx
          .update(users)
          .set({ lastLoginAt: new Date() })
          .where(eq(users.id, user.id));
      });

      await recordAuditLog({
        actorId: user.id,
        action: 'AUTH_LOGIN_SUCCESS',
        entityType: 'SESSION',
        entityId: user.id,
        ipAddress: req.ip,
      });

      setSessionCookies(req, reply, rawSessionToken, csrfToken, expiresAt);

      const unreadNotifications = await db
        .select()
        .from(notifications)
        .where(eq(notifications.userId, user.id))
        .orderBy(desc(notifications.createdAt))
        .limit(15);

      const profile = await getUserWithRolesAndPermissions(user.id);
      return sendSuccess(reply, {
        user: profile,
        csrfToken,
        notifications: unreadNotifications,
      });
    } catch (error) {
      console.error('Login error:', error);
      return sendError(reply, 500, 'AUTH_ERROR', 'Terjadi kesalahan saat memproses autentikasi.');
    }
  });

  // Google Sign-In via Firebase ID Token -> Server-Side Session
  const googleAuthSchema = z.object({
    idToken: z.string().min(10),
  });

  fastify.post('/api/v1/auth/google', async (req, reply) => {
    const parsed = googleAuthSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(reply, 400, 'VALIDATION_ERROR', 'Token Google tidak valid.');
    }

    try {
      const decoded = await adminAuth.verifyIdToken(parsed.data.idToken);
      if (!decoded.email) {
        return sendError(reply, 400, 'EMAIL_REQUIRED', 'Akun Google tidak memiliki alamat email.');
      }

      const user = await getOrCreateUser(decoded.uid, decoded.email, decoded.name);
      const rawSessionToken = generateRandomToken(32);
      const tokenHash = hashSessionToken(rawSessionToken);
      const csrfToken = generateRandomToken(24);
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      await db.insert(userSessions).values({
        userId: user.id,
        tokenHash,
        csrfToken,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'] || 'Google OAuth',
        expiresAt,
      });

      await recordAuditLog({
        actorId: user.id,
        action: 'AUTH_GOOGLE_LOGIN',
        entityType: 'USER',
        entityId: user.id,
        ipAddress: req.ip,
      });

      setSessionCookies(req, reply, rawSessionToken, csrfToken, expiresAt);
      const unreadNotifications = await db
        .select()
        .from(notifications)
        .where(eq(notifications.userId, user.id))
        .orderBy(desc(notifications.createdAt))
        .limit(15);

      const profile = await getUserWithRolesAndPermissions(user.id);

      return sendSuccess(reply, {
        user: profile,
        csrfToken,
        notifications: unreadNotifications,
      });
    } catch (error) {
      console.error('Google Sign-In verification error:', error);
      return sendError(reply, 401, 'INVALID_GOOGLE_TOKEN', 'Gagal memverifikasi token Google Sign-In.');
    }
  });

  fastify.get('/api/v1/auth/me', async (req, reply) => {
    const user = await authenticateRequest(req, reply, { requireCsrf: false });
    if (!user) return;

    const unreadNotifications = await db
      .select()
      .from(notifications)
      .where(eq(notifications.userId, user.id))
      .orderBy(desc(notifications.createdAt))
      .limit(15);

    return sendSuccess(reply, {
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        identityNumber: user.identityNumber,
        studyProgram: user.studyProgram,
        roles: user.roles,
        permissions: user.permissions,
        mustResetPassword: user.mustResetPassword,
        temporaryPasswordExpiresAt: user.temporaryPasswordExpiresAt,
        passwordChangedAt: user.passwordChangedAt,
      },
      csrfToken: user.csrfToken,
      impersonation: user.impersonation || null,
      notifications: unreadNotifications,
    });
  });

  fastify.post('/api/v1/auth/logout', async (req, reply) => {
    const rawToken = req.cookies?.[SESSION_COOKIE_NAME];
    if (rawToken) {
      const tokenHash = hashSessionToken(rawToken);
      const sessionRows = await db
        .select({ id: userSessions.id })
        .from(userSessions)
        .where(eq(userSessions.tokenHash, tokenHash));
      const sessionRow = sessionRows[0];
      if (sessionRow) {
        const now = new Date();
        const activeImpRows = await db
          .select()
          .from(impersonationSessions)
          .where(
            and(
              eq(impersonationSessions.sessionId, sessionRow.id),
              eq(impersonationSessions.isActive, true)
            )
          );
        const activeImp = activeImpRows[0];
        if (activeImp) {
          await db
            .update(impersonationSessions)
            .set({ isActive: false, endedAt: now, endReason: 'LOGOUT' })
            .where(eq(impersonationSessions.id, activeImp.id));

          void recordAuditLog({
            actorId: activeImp.originalUserId,
            action: 'USER_IMPERSONATION_ENDED',
            entityType: 'USER_IMPERSONATION',
            entityId: activeImp.impersonatedUserId,
            metadata: {
              impersonationSessionId: activeImp.id,
              sessionId: sessionRow.id,
              originalUserId: activeImp.originalUserId,
              impersonatedUserId: activeImp.impersonatedUserId,
              originalRole: activeImp.originalRole,
              impersonatedRole: activeImp.impersonatedRole,
              endReason: 'LOGOUT',
              userAgent: req.headers['user-agent'] || null,
            },
            ipAddress: req.ip,
          });
        }
      }

      await db
        .update(userSessions)
        .set({ isRevoked: true })
        .where(eq(userSessions.tokenHash, tokenHash));
    }

    const isHttps = req.protocol === 'https' || req.headers?.['x-forwarded-proto'] === 'https';
    const secure = isProd && isHttps;

    reply.clearCookie(SESSION_COOKIE_NAME, {
      path: '/',
      httpOnly: true,
      secure,
      sameSite: secure ? 'none' : 'lax',
    });
    reply.clearCookie(CSRF_COOKIE_NAME, {
      path: '/',
      httpOnly: false,
      secure,
      sameSite: secure ? 'none' : 'lax',
    });

    return sendSuccess(reply, { loggedOut: true });
  });

  // ============================================================================
  // ACCOUNT SWITCHING / USER IMPERSONATION
  // ============================================================================
  const startImpersonationSchema = z.object({
    targetUserId: z.string().uuid('ID pengguna tujuan tidak valid.'),
    reason: z.string().trim().max(500).optional(),
  });

  fastify.post('/api/v1/auth/impersonation/start', async (req, reply) => {
    const actor = await authenticateRequest(req, reply, {
      requiredPermissions: ['users.impersonate'],
    });
    if (!actor) return;

    // 1. Block nested impersonation
    if (actor.impersonation?.isImpersonating) {
      void recordAuditLog({
        actorId: actor.impersonation.originalUserId,
        action: 'USER_IMPERSONATION_FAILED',
        entityType: 'USER_IMPERSONATION',
        entityId: actor.id,
        metadata: {
          reasonCode: 'NESTED_IMPERSONATION_FORBIDDEN',
          originalUserId: actor.impersonation.originalUserId,
          currentImpersonatedUserId: actor.id,
          userAgent: req.headers['user-agent'] || null,
        },
        ipAddress: req.ip,
      });
      return sendError(
        reply,
        403,
        'NESTED_IMPERSONATION_FORBIDDEN',
        'Impersonasi bertingkat tidak diizinkan. Kembali ke akun Superadmin terlebih dahulu.'
      );
    }

    // 2. Enforce Superadmin-only impersonation
    const isActorSuperadmin = actor.roles.some((r) => r.toUpperCase() === 'SUPERADMIN');
    if (!isActorSuperadmin) {
      void recordAuditLog({
        actorId: actor.id,
        action: 'USER_IMPERSONATION_FAILED',
        entityType: 'USER_IMPERSONATION',
        metadata: {
          reasonCode: 'FORBIDDEN_SUPERADMIN_ONLY',
          userAgent: req.headers['user-agent'] || null,
        },
        ipAddress: req.ip,
      });
      return sendError(
        reply,
        403,
        'FORBIDDEN_INSUFFICIENT_PERMISSIONS',
        'Hanya Superadmin yang diizinkan melakukan perpindahan akun (Switch Account).'
      );
    }

    if (!actor.sessionId) {
      return sendError(
        reply,
        400,
        'SESSION_REQUIRED',
        'Switch Account hanya tersedia untuk sesi cookie server.'
      );
    }

    const parsed = startImpersonationSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(
        reply,
        400,
        'VALIDATION_ERROR',
        'Data permintaan Switch Account tidak valid.',
        parsed.error.issues
      );
    }

    const { targetUserId, reason } = parsed.data;

    if (targetUserId === actor.id) {
      return sendError(
        reply,
        400,
        'CANNOT_IMPERSONATE_SELF',
        'Anda sudah masuk menggunakan akun ini.'
      );
    }

    // 3. Validate target user exists, is active, and is not a Superadmin
    const [targetRow] = await db.select().from(users).where(eq(users.id, targetUserId));
    if (!targetRow) {
      void recordAuditLog({
        actorId: actor.id,
        action: 'USER_IMPERSONATION_FAILED',
        entityType: 'USER_IMPERSONATION',
        entityId: targetUserId,
        metadata: {
          reasonCode: 'USER_NOT_FOUND',
          targetUserId,
          userAgent: req.headers['user-agent'] || null,
        },
        ipAddress: req.ip,
      });
      return sendError(reply, 404, 'USER_NOT_FOUND', 'Akun pengguna tujuan tidak ditemukan.');
    }

    if (!targetRow.isActive || targetRow.accountStatus !== 'ACTIVE') {
      void recordAuditLog({
        actorId: actor.id,
        action: 'USER_IMPERSONATION_FAILED',
        entityType: 'USER_IMPERSONATION',
        entityId: targetUserId,
        metadata: {
          reasonCode: 'TARGET_USER_INACTIVE',
          targetUserId,
          accountStatus: targetRow.accountStatus,
          isActive: targetRow.isActive,
          userAgent: req.headers['user-agent'] || null,
        },
        ipAddress: req.ip,
      });
      return sendError(
        reply,
        400,
        'TARGET_USER_INACTIVE',
        'Akun tujuan berstatus nonaktif atau terkunci dan tidak dapat diakses.'
      );
    }

    const targetProfile = await getUserWithRolesAndPermissions(targetUserId);
    if (!targetProfile) {
      return sendError(reply, 404, 'USER_NOT_FOUND', 'Profil pengguna tujuan tidak ditemukan.');
    }

    if (targetProfile.roles.some((r) => r.toUpperCase() === 'SUPERADMIN')) {
      void recordAuditLog({
        actorId: actor.id,
        action: 'USER_IMPERSONATION_FAILED',
        entityType: 'USER_IMPERSONATION',
        entityId: targetUserId,
        metadata: {
          reasonCode: 'CANNOT_IMPERSONATE_SUPERADMIN',
          targetUserId,
          targetRoles: targetProfile.roles,
          userAgent: req.headers['user-agent'] || null,
        },
        ipAddress: req.ip,
      });
      return sendError(
        reply,
        403,
        'CANNOT_IMPERSONATE_SUPERADMIN',
        'Tidak diizinkan melakukan Switch Account ke akun Superadmin lain.'
      );
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + 60 * 60 * 1000); // 1 hour limit
    const originalRole = actor.roles[0] || 'SUPERADMIN';
    const impersonatedRole = targetProfile.roles[0] || 'MAHASISWA';

    // Deactivate any stale impersonation rows on this session just in case
    await db
      .update(impersonationSessions)
      .set({ isActive: false, endedAt: now, endReason: 'REPLACED' })
      .where(
        and(
          eq(impersonationSessions.sessionId, actor.sessionId),
          eq(impersonationSessions.isActive, true)
        )
      );

    const [createdImp] = await db
      .insert(impersonationSessions)
      .values({
        sessionId: actor.sessionId,
        originalUserId: actor.id,
        impersonatedUserId: targetProfile.id,
        originalRole,
        impersonatedRole,
        reason: reason || 'Troubleshooting & Dukungan Akademik',
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'] || null,
        isActive: true,
        startedAt: now,
        expiresAt,
      })
      .returning();

    await recordAuditLog({
      actorId: actor.id,
      action: 'USER_IMPERSONATION_STARTED',
      entityType: 'USER_IMPERSONATION',
      entityId: targetProfile.id,
      metadata: {
        impersonationSessionId: createdImp.id,
        sessionId: actor.sessionId,
        originalUserId: actor.id,
        impersonatedUserId: targetProfile.id,
        originalRole,
        impersonatedRole,
        reason: createdImp.reason,
        expiresAt: expiresAt.toISOString(),
        userAgent: req.headers['user-agent'] || null,
      },
      ipAddress: req.ip,
    });

    return sendSuccess(reply, {
      user: {
        id: targetProfile.id,
        email: targetProfile.email,
        fullName: targetProfile.fullName,
        identityNumber: targetProfile.identityNumber,
        studyProgram: targetProfile.studyProgram,
        roles: targetProfile.roles,
        permissions: targetProfile.permissions,
        mustResetPassword: targetProfile.mustResetPassword,
        temporaryPasswordExpiresAt: targetProfile.temporaryPasswordExpiresAt,
        passwordChangedAt: targetProfile.passwordChangedAt,
      },
      csrfToken: actor.csrfToken,
      impersonation: {
        isImpersonating: true,
        impersonationSessionId: createdImp.id,
        originalUserId: actor.id,
        originalUserName: actor.fullName,
        originalUserEmail: actor.email,
        originalRole,
        impersonatedUserId: targetProfile.id,
        impersonatedUserName: targetProfile.fullName,
        impersonatedRole,
        startedAt: createdImp.startedAt.toISOString(),
        expiresAt: createdImp.expiresAt.toISOString(),
        reason: createdImp.reason,
      },
    });
  });

  fastify.post('/api/v1/auth/impersonation/stop', async (req, reply) => {
    const actor = await authenticateRequest(req, reply);
    if (!actor) return;

    if (!actor.impersonation?.isImpersonating || !actor.sessionId) {
      return sendError(
        reply,
        400,
        'NOT_IMPERSONATING',
        'Tidak ada sesi Switch Account yang sedang aktif.'
      );
    }

    const imp = actor.impersonation;
    const origProfile = await getUserWithRolesAndPermissions(imp.originalUserId);
    if (!origProfile) {
      return sendError(
        reply,
        403,
        'ORIGINAL_USER_UNAVAILABLE',
        'Akun Superadmin asli tidak tersedia atau nonaktif.'
      );
    }

    const hasStopPerm =
      origProfile.roles.some((r) => r.toUpperCase() === 'SUPERADMIN') ||
      origProfile.permissions.includes('users.impersonate.stop');
    if (!hasStopPerm) {
      return sendError(
        reply,
        403,
        'FORBIDDEN_INSUFFICIENT_PERMISSIONS',
        'Akun asli tidak memiliki izin untuk mengakhiri sesi impersonasi.'
      );
    }

    const now = new Date();
    await db
      .update(impersonationSessions)
      .set({
        isActive: false,
        endedAt: now,
        endReason: 'MANUAL_STOP',
      })
      .where(eq(impersonationSessions.id, imp.impersonationSessionId));

    await recordAuditLog({
      actorId: origProfile.id,
      action: 'USER_IMPERSONATION_ENDED',
      entityType: 'USER_IMPERSONATION',
      entityId: imp.impersonatedUserId,
      metadata: {
        impersonationSessionId: imp.impersonationSessionId,
        sessionId: actor.sessionId,
        originalUserId: origProfile.id,
        impersonatedUserId: imp.impersonatedUserId,
        originalRole: imp.originalRole,
        impersonatedRole: imp.impersonatedRole,
        endReason: 'MANUAL_STOP',
        reason: imp.reason,
        userAgent: req.headers['user-agent'] || null,
      },
      ipAddress: req.ip,
    });

    return sendSuccess(reply, {
      user: {
        id: origProfile.id,
        email: origProfile.email,
        fullName: origProfile.fullName,
        identityNumber: origProfile.identityNumber,
        studyProgram: origProfile.studyProgram,
        roles: origProfile.roles,
        permissions: origProfile.permissions,
        mustResetPassword: origProfile.mustResetPassword,
        temporaryPasswordExpiresAt: origProfile.temporaryPasswordExpiresAt,
        passwordChangedAt: origProfile.passwordChangedAt,
      },
      csrfToken: actor.csrfToken,
      impersonation: null,
    });
  });

  fastify.get('/api/v1/auth/impersonation/status', async (req, reply) => {
    const actor = await authenticateRequest(req, reply, { requireCsrf: false });
    if (!actor) return;

    const imp = actor.impersonation || null;
    return sendSuccess(reply, {
      isImpersonating: Boolean(imp?.isImpersonating),
      originalUser: imp
        ? {
            id: imp.originalUserId,
            name: imp.originalUserName,
            email: imp.originalUserEmail,
            role: imp.originalRole,
          }
        : null,
      effectiveUser: {
        id: actor.id,
        name: actor.fullName,
        email: actor.email,
        role: actor.roles[0] || 'MAHASISWA',
      },
      impersonation: imp,
    });
  });

  const changePasswordSchema = z.object({
    currentPassword: z.string().min(1, 'Password saat ini wajib diisi.'),
    newPassword: z.string().min(12, 'Password baru minimal 12 karakter.'),
    confirmPassword: z.string().min(1, 'Konfirmasi password baru wajib diisi.'),
  });

  fastify.post('/api/v1/auth/change-password', async (req, reply) => {
    const actor = await authenticateRequest(req, reply);
    if (!actor) return;

    const parsed = changePasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(
        reply,
        400,
        'VALIDATION_ERROR',
        parsed.error.issues[0]?.message || 'Input perubahan password tidak valid.',
        parsed.error.issues
      );
    }

    const { currentPassword, newPassword, confirmPassword } = parsed.data;
    if (newPassword !== confirmPassword) {
      return sendError(
        reply,
        400,
        'PASSWORD_MISMATCH',
        'Konfirmasi password baru tidak sesuai.'
      );
    }

    const userRows = await db.select().from(users).where(eq(users.id, actor.id));
    const dbUser = userRows[0];
    if (!dbUser) {
      return sendError(reply, 404, 'USER_NOT_FOUND', 'Akun pengguna tidak ditemukan.');
    }

    const validCurrent = await verifyPassword(dbUser.passwordHash, currentPassword);
    if (!validCurrent) {
      await recordAuditLog({
        actorId: actor.id,
        action: 'AUTH_PASSWORD_CHANGE_FAILED',
        entityType: 'USER',
        entityId: actor.id,
        metadata: { reason: 'INVALID_CURRENT_PASSWORD' },
        ipAddress: req.ip,
      });
      return sendError(
        reply,
        400,
        'INVALID_CURRENT_PASSWORD',
        'Password saat ini tidak sesuai.'
      );
    }

    const profileRows = await db
      .select()
      .from(userProfiles)
      .where(eq(userProfiles.userId, actor.id));
    const profile = profileRows[0];

    const policyCheck = validatePasswordPolicy(newPassword, {
      identityValues: [
        dbUser.identityNumber,
        profile?.nim,
        profile?.nidn,
        profile?.nip,
      ],
    });
    if (!policyCheck.valid) {
      await recordAuditLog({
        actorId: actor.id,
        action: 'AUTH_PASSWORD_CHANGE_FAILED',
        entityType: 'USER',
        entityId: actor.id,
        metadata: { reason: 'POLICY_VIOLATION' },
        ipAddress: req.ip,
      });
      return sendError(
        reply,
        400,
        'WEAK_PASSWORD',
        policyCheck.errors[0] || 'Password baru tidak memenuhi kebijakan keamanan.',
        policyCheck.errors
      );
    }

    const reused = await checkPasswordReuse(actor.id, newPassword, dbUser.passwordHash);
    if (reused) {
      await recordAuditLog({
        actorId: actor.id,
        action: 'AUTH_PASSWORD_CHANGE_FAILED',
        entityType: 'USER',
        entityId: actor.id,
        metadata: { reason: 'PASSWORD_REUSE_FORBIDDEN' },
        ipAddress: req.ip,
      });
      return sendError(
        reply,
        400,
        'PASSWORD_REUSE_FORBIDDEN',
        'Password baru tidak boleh sama dengan 5 password terakhir Anda.'
      );
    }

    const newHash = await hashPassword(newPassword);
    const now = new Date();
    const rawSessionToken = generateRandomToken(32);
    const tokenHash = hashSessionToken(rawSessionToken);
    const newCsrfToken = generateRandomToken(24);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await db.transaction(async (tx) => {
      await recordPasswordInHistory(tx, actor.id, dbUser.passwordHash);

      await tx
        .update(users)
        .set({
          passwordHash: newHash,
          mustResetPassword: false,
          temporaryPasswordExpiresAt: null,
          passwordChangedAt: now,
          accountStatus: 'ACTIVE',
          isActive: true,
          updatedAt: now,
        })
        .where(eq(users.id, actor.id));

      await tx
        .update(userSessions)
        .set({ isRevoked: true })
        .where(eq(userSessions.userId, actor.id));

      await tx.insert(userSessions).values({
        userId: actor.id,
        tokenHash,
        csrfToken: newCsrfToken,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'] || 'Unknown',
        expiresAt,
      });

      await tx.insert(notifications).values({
        userId: actor.id,
        title: 'Password Anda Berhasil Diperbarui',
        message:
          'Kata sandi akun Politeknik Kampar LMS Anda telah berhasil diperbarui dan seluruh sesi sebelumnya telah dicabut.',
        type: 'SECURITY',
      });
    });

    await recordAuditLog({
      actorId: actor.id,
      action: 'AUTH_PASSWORD_CHANGED',
      entityType: 'USER',
      entityId: actor.id,
      metadata: {
        sessionsRevoked: true,
        newSessionIssued: true,
        result: 'SUCCESS',
      },
      ipAddress: req.ip,
    });

    setSessionCookies(req, reply, rawSessionToken, newCsrfToken, expiresAt);
    const updatedProfile = await getUserWithRolesAndPermissions(actor.id);

    return sendSuccess(reply, {
      user: updatedProfile,
      csrfToken: newCsrfToken,
      passwordChanged: true,
    });
  });

  // Mark notifications as read
  fastify.post('/api/v1/notifications/read-all', async (req, reply) => {
    const user = await authenticateRequest(req, reply);
    if (!user) return;

    await db
      .update(notifications)
      .set({ isRead: true })
      .where(eq(notifications.userId, user.id));

    return sendSuccess(reply, { updated: true });
  });

  // ============================================================================
  // 2. RBAC ROLES & PERMISSIONS, ACADEMIC DATA, AUDIT LOGS
  // (User Administration endpoints are registered in userManagementRoutes.ts)
  // ============================================================================

  // RBAC Roles & Permissions Matrix (Academic Access Control Center)
  fastify.get('/api/v1/rbac/roles', async (req, reply) => {
    const actor = await authenticateRequest(req, reply, {
      anyPermissions: ['rbac:view', 'rbac:manage'],
    });
    if (!actor) return;

    await ensureRbacInitialized();

    const allRoles = await db.select().from(roles).orderBy(asc(roles.code));
    const allPerms = await db
      .select()
      .from(permissions)
      .orderBy(asc(permissions.module), asc(permissions.code));
    const allRolePerms = await db.select().from(rolePermissions);
    const allUserRoles = await db.select().from(userRoles);
    const allUsersCount = (await db.select({ id: users.id }).from(users)).length;

    const rbacAuditRows = await db
      .select({
        id: auditLogs.id,
        actorId: auditLogs.actorId,
        action: auditLogs.action,
        entityType: auditLogs.entityType,
        entityId: auditLogs.entityId,
        metadata: auditLogs.metadata,
        createdAt: auditLogs.createdAt,
        actorName: users.fullName,
        actorEmail: users.email,
      })
      .from(auditLogs)
      .leftJoin(users, eq(auditLogs.actorId, users.id))
      .where(ilike(auditLogs.action, 'RBAC_PERMISSION_%'))
      .orderBy(desc(auditLogs.createdAt))
      .limit(50);

    const roleScopeMap: Record<string, string> = {
      SUPERADMIN: 'GLOBAL',
      DOSEN: 'ASSIGNED & OWN',
      MAHASISWA: 'ENROLLED & OWN',
      AUDITOR: 'INSTITUTION (READ-ONLY)',
    };

    const roleMatrix = allRoles.map((r) => {
      const rolePerms = allRolePerms.filter((rp) => rp.roleId === r.id);
      const userCount = allUserRoles.filter((ur) => ur.roleId === r.id).length;
      const latestChange = rbacAuditRows.find((a) => a.entityId === r.id);
      const latestAssigned = rolePerms.reduce<Date | null>((acc, rp) => {
        if (!acc || rp.assignedAt > acc) return rp.assignedAt;
        return acc;
      }, null);

      return {
        ...r,
        userCount,
        accessScope: roleScopeMap[r.code.toUpperCase()] || 'CUSTOM',
        status: 'ACTIVE',
        lastModified: latestChange?.createdAt || latestAssigned || r.createdAt,
        permissionIds: rolePerms.map((rp) => rp.permissionId),
      };
    });

    const enrichedPermissions = allPerms.map((p) => {
      const def = PERMISSION_MAP_BY_CODE.get(p.code);
      return {
        ...p,
        name: def?.name || p.code,
        actionType: def?.actionType || 'MANAGE',
        riskLevel: def?.riskLevel || 'MEDIUM',
        allowedContext: def?.allowedContext || ['GLOBAL'],
        isProtected: def?.isProtected ?? false,
        auditorAllowed: def?.auditorAllowed ?? false,
      };
    });

    return sendSuccess(reply, {
      roles: roleMatrix,
      permissions: enrichedPermissions,
      stats: {
        totalRoles: allRoles.length,
        totalPermissions: enrichedPermissions.length,
        totalUsers: allUsersCount,
        recentChangesCount: rbacAuditRows.length,
      },
      history: rbacAuditRows.map((row) => {
        const meta = (row.metadata || {}) as Record<string, unknown>;
        return {
          id: row.id,
          timestamp: row.createdAt,
          actorName: row.actorName || 'Sistem',
          actorEmail: row.actorEmail || null,
          action: row.action,
          roleId: row.entityId,
          roleCode: (meta.roleCode as string) || 'UNKNOWN',
          permissionCode: (meta.permissionCode as string) || (meta.permissionId as string) || '—',
          previousValue: meta.previousValue ?? !meta.enabled,
          newValue: meta.newValue ?? Boolean(meta.enabled),
          reason: (meta.reason as string) || 'Pembaruan matriks otorisasi RBAC',
          result: (meta.result as string) || 'SUCCESS',
        };
      }),
    });
  });

  const togglePermissionSchema = z.object({
    roleId: z.string().uuid(),
    permissionId: z.string().uuid(),
    enabled: z.boolean(),
    reason: z.string().trim().max(300).optional(),
  });

  fastify.post('/api/v1/rbac/roles/permissions', async (req, reply) => {
    const actor = await authenticateRequest(req, reply, {
      requiredPermissions: ['rbac:manage'],
    });
    if (!actor) return;

    const parsed = togglePermissionSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(reply, 400, 'VALIDATION_ERROR', 'Payload izin RBAC tidak valid.');
    }

    const { roleId, permissionId, enabled, reason } = parsed.data;
    const [targetRole] = await db.select().from(roles).where(eq(roles.id, roleId));
    const [targetPerm] = await db
      .select()
      .from(permissions)
      .where(eq(permissions.id, permissionId));

    if (!targetRole || !targetPerm) {
      return sendError(reply, 404, 'NOT_FOUND', 'Peran atau izin tidak ditemukan.');
    }

    const upperRole = targetRole.code.toUpperCase();
    const permDef = PERMISSION_MAP_BY_CODE.get(targetPerm.code);

    // Protected SUPERADMIN rule
    if (upperRole === 'SUPERADMIN' && !enabled) {
      return sendError(
        reply,
        403,
        'FORBIDDEN_PROTECTED_SUPERADMIN_PERMISSION',
        'Izin esensial SUPERADMIN dilindungi sistem dan tidak dapat dinonaktifkan.'
      );
    }

    // Strict AUDITOR read-only rule
    if (upperRole === 'AUDITOR' && enabled && !permDef?.auditorAllowed) {
      return sendError(
        reply,
        403,
        'FORBIDDEN_AUDITOR_READ_ONLY',
        'Peran AUDITOR bersifat hanya-baca (read-only) dan tidak dapat diberikan izin mutasi atau ekspor.'
      );
    }

    const existing = await db
      .select()
      .from(rolePermissions)
      .where(
        and(
          eq(rolePermissions.roleId, roleId),
          eq(rolePermissions.permissionId, permissionId)
        )
      );
    const previousValue = existing.length > 0;

    if (enabled) {
      await db
        .insert(rolePermissions)
        .values({ roleId, permissionId })
        .onConflictDoNothing();
    } else {
      await db
        .delete(rolePermissions)
        .where(
          and(
            eq(rolePermissions.roleId, roleId),
            eq(rolePermissions.permissionId, permissionId)
          )
        );
    }

    await recordAuditLog({
      actorId: actor.id,
      action: enabled ? 'RBAC_PERMISSION_GRANTED' : 'RBAC_PERMISSION_REVOKED',
      entityType: 'ROLE_PERMISSION',
      entityId: roleId,
      metadata: {
        roleCode: targetRole.code,
        permissionId,
        permissionCode: targetPerm.code,
        previousValue,
        newValue: enabled,
        enabled,
        reason: reason || 'Perubahan izin melalui Academic Access Control Center',
        result: 'SUCCESS',
      },
      ipAddress: req.ip,
    });

    return sendSuccess(reply, { roleId, permissionId, enabled });
  });

  const bulkPermissionSchema = z.object({
    roleId: z.string().uuid(),
    permissionIds: z.array(z.string().uuid()),
    enabled: z.boolean(),
    reason: z.string().trim().max(300).optional(),
  });

  fastify.post('/api/v1/rbac/roles/permissions/bulk', async (req, reply) => {
    const actor = await authenticateRequest(req, reply, {
      requiredPermissions: ['rbac:manage'],
    });
    if (!actor) return;

    const parsed = bulkPermissionSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(reply, 400, 'VALIDATION_ERROR', 'Payload pembaruan massal RBAC tidak valid.');
    }

    const { roleId, permissionIds, enabled, reason } = parsed.data;
    const [targetRole] = await db.select().from(roles).where(eq(roles.id, roleId));
    if (!targetRole) {
      return sendError(reply, 404, 'NOT_FOUND', 'Peran tidak ditemukan.');
    }

    const upperRole = targetRole.code.toUpperCase();
    if (upperRole === 'SUPERADMIN' && !enabled) {
      return sendError(
        reply,
        403,
        'FORBIDDEN_PROTECTED_SUPERADMIN_PERMISSION',
        'Izin SUPERADMIN dilindungi sistem dan tidak dapat dinonaktifkan.'
      );
    }

    const allPerms = await db.select().from(permissions);
    const permById = new Map(allPerms.map((p) => [p.id, p]));
    const changedCodes: string[] = [];

    for (const permissionId of permissionIds) {
      const targetPerm = permById.get(permissionId);
      if (!targetPerm) continue;
      const permDef = PERMISSION_MAP_BY_CODE.get(targetPerm.code);
      if (upperRole === 'AUDITOR' && enabled && !permDef?.auditorAllowed) {
        continue;
      }

      if (enabled) {
        await db
          .insert(rolePermissions)
          .values({ roleId, permissionId })
          .onConflictDoNothing();
      } else {
        await db
          .delete(rolePermissions)
          .where(
            and(
              eq(rolePermissions.roleId, roleId),
              eq(rolePermissions.permissionId, permissionId)
            )
          );
      }
      changedCodes.push(targetPerm.code);
    }

    await recordAuditLog({
      actorId: actor.id,
      action: enabled ? 'RBAC_PERMISSION_BULK_GRANTED' : 'RBAC_PERMISSION_BULK_REVOKED',
      entityType: 'ROLE_PERMISSION',
      entityId: roleId,
      metadata: {
        roleCode: targetRole.code,
        permissionCode: changedCodes.join(', '),
        count: changedCodes.length,
        previousValue: !enabled,
        newValue: enabled,
        reason: reason || 'Pembaruan modul massal melalui Academic Access Control Center',
        result: 'SUCCESS',
      },
      ipAddress: req.ip,
    });

    return sendSuccess(reply, { roleId, updatedCount: changedCodes.length, enabled });
  });

  // ============================================================================
  // 3. ACADEMIC YEARS, SEMESTERS & MASTER COURSES
  // ============================================================================
  fastify.get('/api/v1/academic/overview', async (req, reply) => {
    const user = await authenticateRequest(req, reply);
    if (!user) return;

    const years = await db
      .select()
      .from(academicYears)
      .orderBy(desc(academicYears.name));
    const sems = await db
      .select()
      .from(semesters)
      .orderBy(desc(semesters.createdAt));
    const allCourses = await db
      .select()
      .from(courses)
      .orderBy(asc(courses.code));

    return sendSuccess(
      reply,
      {
        academicYears: years,
        semesters: sems,
        courses: allCourses,
      },
      {
        totalCourses: allCourses.length,
        totalSemesters: sems.length,
      }
    );
  });

  // ============================================================================
  // 4. CLASSROOMS & ENROLLMENT BUSINESS RULES (INDEPENDENT DIGITAL CLASSROOM)
  // ============================================================================
  // Role-scoped GET /api/v1/classrooms & POST /api/v1/classrooms/join are registered in classroomDirectoryRoutes.ts

  const createClassroomSchema = z.object({
    courseId: z.string().uuid().optional().nullable(),
    semesterId: z.string().uuid().optional().nullable(),
    academicPeriodId: z.string().uuid().optional().nullable(),
    subjectName: z.string().optional().nullable(),
    subjectCode: z.string().optional().nullable(),
    academicYear: z.string().optional().nullable(),
    semesterName: z.string().optional().nullable(),
    locationDescription: z.string().optional().nullable(),
    name: z.string().min(3),
    section: z.string().min(1).default('A'),
    roomNumber: z.string().optional().default('Daring / Fleksibel'),
    scheduleText: z.string().optional().default('Sesuai Jadwal'),
    capacity: z.number().int().min(5).max(250).default(35),
    enrollmentPolicy: z.enum(['AUTO', 'APPROVAL_REQUIRED']).default('AUTO'),
    visibility: z
      .enum(['PUBLIC', 'PRIVATE', 'PUBLIC_ENROLLED', 'CAMPUS_WIDE', 'PRIVATE_RESTRICTED'])
      .default('PRIVATE'),
    description: z.string().optional(),
  });

  fastify.post('/api/v1/classrooms', async (req, reply) => {
    const user = await authenticateRequest(req, reply, {
      requiredPermissions: ['classrooms:create'],
    });
    if (!user) return;

    const parsed = createClassroomSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(
        reply,
        400,
        'VALIDATION_ERROR',
        'Konfigurasi ruang kelas baru tidak valid.',
        parsed.error.issues
      );
    }

    const randomCode = `PKM-${Math.random()
      .toString(36)
      .substring(2, 7)
      .toUpperCase()}`;

    try {
      const result = await db.transaction(async (tx) => {
        const [newClass] = await tx
          .insert(classrooms)
          .values({
            courseId: parsed.data.courseId || null,
            semesterId: parsed.data.semesterId || null,
            academicPeriodId: parsed.data.academicPeriodId || null,
            subjectName: parsed.data.subjectName || null,
            subjectCode: parsed.data.subjectCode || null,
            academicYear: parsed.data.academicYear || null,
            semesterName: parsed.data.semesterName || null,
            locationDescription: parsed.data.locationDescription || null,
            name: parsed.data.name,
            section: parsed.data.section,
            roomNumber: parsed.data.locationDescription || parsed.data.roomNumber || 'Daring / Fleksibel',
            scheduleText: parsed.data.scheduleText || 'Sesuai Jadwal',
            capacity: parsed.data.capacity,
            enrollmentPolicy: parsed.data.enrollmentPolicy,
            visibility: parsed.data.visibility,
            description:
              parsed.data.description ||
              'Ruang kelas digital resmi Politeknik Kampar.',
            createdById: user.id,
          })
          .returning();

        await tx.insert(classroomInstructors).values({
          classroomId: newClass.id,
          instructorId: user.id,
          isPrimary: true,
        });

        await tx.insert(classroomJoinCodes).values({
          classroomId: newClass.id,
          code: randomCode,
          isActive: true,
          createdById: user.id,
        });

        await tx.insert(classroomTopics).values([
          {
            classroomId: newClass.id,
            title: 'Minggu 01: Pengantar & Kontrak Perkuliahan',
            description: 'Silabus, aturan laboratorium, dan pengenalan materi dasar.',
            sortOrder: 1,
          },
          {
            classroomId: newClass.id,
            title: 'Minggu 02: Konsep Inti & Praktikum Terstruktur',
            description: 'Materi inti dan latihan studi kasus lapangan.',
            sortOrder: 2,
          },
        ]);

        await tx.insert(gradeCategories).values([
          {
            classroomId: newClass.id,
            name: 'Tugas & Praktikum (60%)',
            weightPercent: 60,
          },
          {
            classroomId: newClass.id,
            name: 'Evaluasi Kuis (40%)',
            weightPercent: 40,
          },
        ]);

        await tx.insert(announcements).values({
          classroomId: newClass.id,
          authorId: user.id,
          title: `Selamat Datang di ${newClass.name}`,
          content: `Ruang kelas digital telah dibuka. Gunakan kode kelas ${randomCode} untuk bergabung dan periksa tab Classwork secara berkala.`,
          isPinned: true,
        });

        return newClass;
      });

      await recordAuditLog({
        actorId: user.id,
        action: 'CLASSROOM_CREATED',
        entityType: 'CLASSROOM',
        entityId: result.id,
        metadata: { name: result.name, joinCode: randomCode },
        ipAddress: req.ip,
      });

      return sendSuccess(reply, { ...result, joinCode: randomCode }, null, 201);
    } catch (error) {
      console.error('Create classroom failed:', error);
      return sendError(reply, 500, 'CLASSROOM_CREATE_FAILED', 'Gagal membuat ruang kelas baru.');
    }
  });

  // ============================================================================
  // 5. FULL CLASSROOM WORKSPACE (STREAM, CLASSWORK, PEOPLE, GRADES, SETTINGS)
  // ============================================================================
  fastify.get('/api/v1/classrooms/:id', async (req, reply) => {
    const user = await authenticateRequest(req, reply, {
      anyPermissions: ['classrooms:view', 'classrooms:manage_all', 'classrooms:teach'],
    });
    if (!user) return;

    const { id } = req.params as { id: string };

    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
    if (!isUuid) {
      return sendError(reply, 404, 'CLASSROOM_NOT_FOUND', 'Ruang kelas tidak ditemukan.');
    }

    const clsRows = await db
      .select()
      .from(classrooms)
      .where(eq(classrooms.id, id));
    const cls = clsRows[0];
    if (!cls) {
      return sendError(reply, 404, 'CLASSROOM_NOT_FOUND', 'Ruang kelas tidak ditemukan.');
    }

    const access = await checkClassroomAccess(user, id);
    if (!access.canView) {
      return sendError(
        reply,
        403,
        'ENROLLMENT_REQUIRED',
        access.enrollmentStatus === 'pending'
          ? 'Pendaftaran Anda pada kelas ini masih berstatus PENDING (menunggu persetujuan Dosen).'
          : 'Akses ditolak: Hanya mahasiswa dengan status enrollment aktif atau Dosen pengampu yang dapat mengakses konten kelas ini.'
      );
    }

    const [course] = cls.courseId
      ? await db
          .select()
          .from(courses)
          .where(eq(courses.id, cls.courseId))
      : [];
    const [semester] = cls.semesterId
      ? await db
          .select()
          .from(semesters)
          .where(eq(semesters.id, cls.semesterId))
      : [];

    // Instructors
    const instructors = await db
      .select({
        id: classroomInstructors.id,
        instructorId: users.id,
        fullName: users.fullName,
        email: users.email,
        identityNumber: users.identityNumber,
        isPrimary: classroomInstructors.isPrimary,
        assignedAt: classroomInstructors.assignedAt,
      })
      .from(classroomInstructors)
      .innerJoin(users, eq(classroomInstructors.instructorId, users.id))
      .where(eq(classroomInstructors.classroomId, id));

    // Enrollments (Students)
    const enrollmentsRaw = await db
      .select({
        id: classroomEnrollments.id,
        studentId: users.id,
        fullName: users.fullName,
        email: users.email,
        identityNumber: users.identityNumber,
        status: classroomEnrollments.status,
        joinCodeUsed: classroomEnrollments.joinCodeUsed,
        statusHistory: classroomEnrollments.statusHistory,
        enrolledAt: classroomEnrollments.enrolledAt,
      })
      .from(classroomEnrollments)
      .innerJoin(users, eq(classroomEnrollments.studentId, users.id))
      .where(eq(classroomEnrollments.classroomId, id))
      .orderBy(asc(users.fullName));

    // Students only see active classmates; Instructors/Superadmin see all enrollment statuses & history
    const enrollments = access.canManage
      ? enrollmentsRaw
      : enrollmentsRaw
          .filter((e) => e.status === 'active' || e.studentId === user.id)
          .map((e) => ({
            id: e.id,
            studentId: e.studentId,
            fullName: e.fullName,
            email: e.email,
            identityNumber: e.identityNumber,
            status: e.status,
            enrolledAt: e.enrolledAt,
          }));

    // Join codes (only visible to instructors / superadmin)
    const joinCodes = access.canManage
      ? await db
          .select()
          .from(classroomJoinCodes)
          .where(eq(classroomJoinCodes.classroomId, id))
          .orderBy(desc(classroomJoinCodes.createdAt))
      : [];

    // Stream Announcements & Comments
    const streamAnnouncements = await db
      .select({
        id: announcements.id,
        title: announcements.title,
        content: announcements.content,
        isPinned: announcements.isPinned,
        createdAt: announcements.createdAt,
        authorId: users.id,
        authorName: users.fullName,
      })
      .from(announcements)
      .innerJoin(users, eq(announcements.authorId, users.id))
      .where(eq(announcements.classroomId, id))
      .orderBy(desc(announcements.isPinned), desc(announcements.createdAt));

    const allComments = await db
      .select({
        id: comments.id,
        announcementId: comments.announcementId,
        content: comments.content,
        createdAt: comments.createdAt,
        authorId: users.id,
        authorName: users.fullName,
      })
      .from(comments)
      .innerJoin(users, eq(comments.authorId, users.id))
      .where(eq(comments.classroomId, id))
      .orderBy(asc(comments.createdAt));

    const announcementsWithComments = streamAnnouncements.map((ann) => ({
      ...ann,
      comments: allComments.filter((c) => c.announcementId === ann.id),
    }));

    // Topics & Learning Materials
    const topics = await db
      .select()
      .from(classroomTopics)
      .where(eq(classroomTopics.classroomId, id))
      .orderBy(asc(classroomTopics.sortOrder));

    const rawMaterials = await db
      .select({
        id: learningMaterials.id,
        topicId: learningMaterials.topicId,
        meetingNumber: learningMaterials.meetingNumber,
        sequenceOrder: learningMaterials.sequenceOrder,
        title: learningMaterials.title,
        slug: learningMaterials.slug,
        subtitle: learningMaterials.subtitle,
        description: learningMaterials.description,
        content: learningMaterials.content,
        contentJson: learningMaterials.contentJson,
        estimatedDuration: learningMaterials.estimatedDuration,
        isRequired: learningMaterials.isRequired,
        status: learningMaterials.status,
        scheduledAt: learningMaterials.scheduledAt,
        publishedAt: learningMaterials.publishedAt,
        availabilityStartAt: learningMaterials.availabilityStartAt,
        availabilityEndAt: learningMaterials.availabilityEndAt,
        allowAccessAfterPublish: learningMaterials.allowAccessAfterPublish,
        visibility: learningMaterials.visibility,
        externalUrl: learningMaterials.externalUrl,
        createdAt: learningMaterials.createdAt,
        authorName: users.fullName,
      })
      .from(learningMaterials)
      .innerJoin(users, eq(learningMaterials.authorId, users.id))
      .where(eq(learningMaterials.classroomId, id))
      .orderBy(
        asc(learningMaterials.meetingNumber),
        asc(learningMaterials.sequenceOrder),
        desc(learningMaterials.createdAt)
      );

    const nowTs = new Date();
    const visibleMaterials = access.canManage
      ? rawMaterials
      : rawMaterials.filter((m) => {
          if (m.status === 'DRAFT' || m.status === 'ARCHIVED') return false;
          if (
            m.status === 'SCHEDULED' &&
            (!m.scheduledAt || new Date(m.scheduledAt) > nowTs)
          ) {
            return false;
          }
          if (m.visibility === 'INSTRUCTORS_ONLY') return false;
          return true;
        });

    const rawMatAttachments = await db
      .select()
      .from(materialAttachments)
      .orderBy(asc(materialAttachments.sortOrder));
    const rawMatVideos = await db
      .select()
      .from(materialVideos)
      .orderBy(asc(materialVideos.sortOrder));
    const studentProgressRows = await db
      .select()
      .from(materialProgress)
      .where(eq(materialProgress.studentId, user.id));

    const materialsWithFiles = visibleMaterials.map((m) => ({
      ...m,
      attachments: rawMatAttachments
        .filter((a) => a.materialId === m.id)
        .map((a) => ({
          id: a.id,
          materialId: a.materialId,
          fileId: a.fileId,
          originalName: a.originalName || 'Lampiran Materi',
          objectKey: a.objectKey,
          mimeType: a.mimeType,
          fileExtension: a.fileExtension,
          sizeBytes: a.fileSize,
          fileSize: a.fileSize,
          description: a.description,
        })),
      videos: rawMatVideos.filter((v) => v.materialId === m.id),
      myProgress:
        studentProgressRows.find((p) => p.materialId === m.id) || null,
    }));

    // Assignments & Submissions (Privacy-isolated: students never see other students' submissions or unpublished grades)
    const rawAssignments = await db
      .select()
      .from(assignments)
      .where(eq(assignments.classroomId, id))
      .orderBy(asc(assignments.sequenceOrder), asc(assignments.dueAt));

    const clsAssignments = access.canManage
      ? rawAssignments
      : rawAssignments.filter((asg) => {
          if (asg.status === 'DRAFT' || asg.status === 'ARCHIVED') return false;
          if (
            asg.status === 'SCHEDULED' &&
            (!asg.scheduledAt || new Date(asg.scheduledAt) > nowTs)
          ) {
            return false;
          }
          return true;
        });

    const allSubmissions = await db
      .select({
        id: assignmentSubmissions.id,
        assignmentId: assignmentSubmissions.assignmentId,
        studentId: assignmentSubmissions.studentId,
        studentName: users.fullName,
        studentNim: users.identityNumber,
        submissionText: assignmentSubmissions.submissionText,
        submissionJson: assignmentSubmissions.submissionJson,
        repositoryUrl: assignmentSubmissions.repositoryUrl,
        status: assignmentSubmissions.status,
        isLate: assignmentSubmissions.isLate,
        lateMinutes: assignmentSubmissions.lateMinutes,
        currentVersion: assignmentSubmissions.currentVersion,
        score: assignmentSubmissions.score,
        publishedScore: assignmentSubmissions.publishedScore,
        isGradePublished: assignmentSubmissions.isGradePublished,
        gradingStatus: assignmentSubmissions.gradingStatus,
        feedback: assignmentSubmissions.feedback,
        revisionInstructions: assignmentSubmissions.revisionInstructions,
        submittedAt: assignmentSubmissions.submittedAt,
        gradedAt: assignmentSubmissions.gradedAt,
      })
      .from(assignmentSubmissions)
      .innerJoin(users, eq(assignmentSubmissions.studentId, users.id));

    const visibleSubmissions = access.canManage
      ? allSubmissions
      : allSubmissions
          .filter((s) => s.studentId === user.id)
          .map((s) => ({
            ...s,
            score: s.isGradePublished ? s.publishedScore || s.score : null,
            feedback:
              s.isGradePublished || s.status === 'returned' ? s.feedback : null,
          }));

    const assignmentsEnriched = clsAssignments.map((asg) => ({
      ...asg,
      submissions: visibleSubmissions.filter((s) => s.assignmentId === asg.id),
    }));

    // Quizzes, Questions & Options (SECURITY RULE: Never expose isCorrect to students!)
    const clsQuizzes = await db
      .select()
      .from(quizzes)
      .where(eq(quizzes.classroomId, id))
      .orderBy(desc(quizzes.createdAt));

    const allQuestions = await db
      .select()
      .from(quizQuestions)
      .orderBy(asc(quizQuestions.sortOrder));
    const allOptions = await db
      .select()
      .from(quizOptions)
      .orderBy(asc(quizOptions.sortOrder));
    const allAttempts = await db
      .select({
        id: quizAttempts.id,
        quizId: quizAttempts.quizId,
        studentId: quizAttempts.studentId,
        studentName: users.fullName,
        attemptNumber: quizAttempts.attemptNumber,
        status: quizAttempts.status,
        totalScore: quizAttempts.totalScore,
        maxScore: quizAttempts.maxScore,
        submittedAt: quizAttempts.submittedAt,
      })
      .from(quizAttempts)
      .innerJoin(users, eq(quizAttempts.studentId, users.id))
      .orderBy(desc(quizAttempts.submittedAt));

    const quizzesEnriched = clsQuizzes.map((qz) => {
      const qList = allQuestions
        .filter((q) => q.quizId === qz.id)
        .map((q) => ({
          id: q.id,
          questionText: q.questionText,
          points: q.points,
          sortOrder: q.sortOrder,
          explanation: access.canManage ? q.explanation : undefined,
          options: allOptions
            .filter((o) => o.questionId === q.id)
            .map((o) => ({
              id: o.id,
              optionLabel: o.optionLabel,
              optionText: o.optionText,
              // Strictly omit answer key for students
              ...(access.canManage ? { isCorrect: o.isCorrect } : {}),
            })),
        }));

      const attempts = access.canManage
        ? allAttempts.filter((a) => a.quizId === qz.id)
        : allAttempts.filter(
            (a) => a.quizId === qz.id && a.studentId === user.id
          );

      return {
        ...qz,
        questions: qList,
        attempts,
      };
    });

    // Advanced Assessments & Examination Engine
    const rawClsAssessments = await db
      .select()
      .from(assessments)
      .where(eq(assessments.classroomId, id))
      .orderBy(desc(assessments.createdAt));

    const visibleClsAssessments = access.canManage
      ? rawClsAssessments
      : rawClsAssessments.filter(
          (a) =>
            a.status === 'PUBLISHED' ||
            a.status === 'CLOSED' ||
            (a.status === 'SCHEDULED' &&
              a.scheduledAt &&
              new Date(a.scheduledAt) <= new Date())
        );

    const allAsmtQuestions = await db.select().from(assessmentQuestions);
    const allAsmtPools = await db.select().from(assessmentQuestionPools);
    const allAsmtAttempts = await db
      .select()
      .from(assessmentAttempts)
      .orderBy(desc(assessmentAttempts.startedAt));

    const assessmentsEnriched = visibleClsAssessments.map((asmt) => {
      const qCount = allAsmtQuestions.filter(
        (aq) => aq.assessmentId === asmt.id
      ).length;
      const poolCount = allAsmtPools
        .filter((ap) => ap.assessmentId === asmt.id)
        .reduce((acc, p) => acc + p.questionCount, 0);
      const myAttempts = allAsmtAttempts
        .filter(
          (at) => at.assessmentId === asmt.id && at.studentId === user.id
        )
        .map((at) => ({
          id: at.id,
          attemptNumber: at.attemptNumber,
          status: at.status,
          startedAt: at.startedAt,
          submittedAt: at.submittedAt,
          objectiveGradingStatus: at.objectiveGradingStatus,
          essayGradingStatus: at.essayGradingStatus,
          finalGradingStatus: at.finalGradingStatus,
          isPublishedToStudent: at.isPublishedToStudent,
          totalScore:
            access.canManage || at.isPublishedToStudent || asmt.resultsPublished
              ? Number(at.totalScore)
              : null,
          passed:
            access.canManage || at.isPublishedToStudent || asmt.resultsPublished
              ? at.passed
              : null,
        }));

      return {
        ...asmt,
        questionCount: qCount + poolCount,
        myAttempts,
        totalAttemptsCount: access.canManage
          ? allAsmtAttempts.filter((at) => at.assessmentId === asmt.id).length
          : undefined,
      };
    });

    // Gradebook (Categories, Items, and Privacy-Isolated Records)
    const categories = await db
      .select()
      .from(gradeCategories)
      .where(eq(gradeCategories.classroomId, id));
    const items = await db
      .select()
      .from(gradeItems)
      .where(eq(gradeItems.classroomId, id));
    const rawRecords = await db
      .select()
      .from(gradeRecords)
      .where(eq(gradeRecords.classroomId, id));

    const visibleGradeRecords = access.canManage
      ? rawRecords
      : rawRecords.filter((r) => r.studentId === user.id);

    return sendSuccess(reply, {
      classroom: {
        ...cls,
        courseCode: cls.subjectCode || course?.code || 'N/A',
        courseTitle: cls.subjectName || course?.title || cls.name,
        semesterName: cls.semesterName || semester?.name || 'Semester Aktif',
        locationDescription: cls.locationDescription || cls.roomNumber,
        course: course || null,
        semester: semester || null,
      },
      access,
      instructors,
      enrollments,
      joinCodes,
      announcements: announcementsWithComments,
      topics,
      materials: materialsWithFiles,
      assignments: assignmentsEnriched,
      quizzes: quizzesEnriched,
      assessments: assessmentsEnriched,
      gradebook: {
        categories,
        items,
        records: visibleGradeRecords,
      },
    });
  });

  // Update Classroom Settings or Join Code (Instructor / Superadmin)
  const updateClassroomSchema = z.object({
    name: z.string().min(4).optional(),
    section: z.string().min(2).optional(),
    roomNumber: z.string().min(2).optional(),
    scheduleText: z.string().min(4).optional(),
    capacity: z.number().int().min(5).max(200).optional(),
    enrollmentPolicy: z.enum(['AUTO', 'APPROVAL_REQUIRED']).optional(),
    regenerateJoinCode: z.boolean().optional(),
    revokeJoinCodes: z.boolean().optional(),
  });

  fastify.patch('/api/v1/classrooms/:id', async (req, reply) => {
    const user = await authenticateRequest(req, reply);
    if (!user) return;

    const { id } = req.params as { id: string };

    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
    if (!isUuid) {
      return sendError(reply, 404, 'CLASSROOM_NOT_FOUND', 'Ruang kelas tidak ditemukan.');
    }
    const access = await checkClassroomAccess(user, id);
    if (!access.canManage) {
      return sendError(
        reply,
        403,
        'FORBIDDEN_NOT_CLASSROOM_INSTRUCTOR',
        'Akses ditolak: Hanya Dosen pengampu kelas ini atau Superadmin yang dapat mengubah pengaturan kelas.'
      );
    }

    const parsed = updateClassroomSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(reply, 400, 'VALIDATION_ERROR', 'Data pengaturan kelas tidak valid.');
    }

    const data = parsed.data;
    let generatedCode: string | null = null;

    await db.transaction(async (tx) => {
      if (
        data.name ||
        data.section ||
        data.roomNumber ||
        data.scheduleText ||
        data.capacity ||
        data.enrollmentPolicy
      ) {
        await tx
          .update(classrooms)
          .set({
            ...(data.name ? { name: data.name } : {}),
            ...(data.section ? { section: data.section } : {}),
            ...(data.roomNumber ? { roomNumber: data.roomNumber } : {}),
            ...(data.scheduleText ? { scheduleText: data.scheduleText } : {}),
            ...(data.capacity ? { capacity: data.capacity } : {}),
            ...(data.enrollmentPolicy
              ? { enrollmentPolicy: data.enrollmentPolicy }
              : {}),
            updatedAt: new Date(),
          })
          .where(eq(classrooms.id, id));
      }

      if (data.revokeJoinCodes || data.regenerateJoinCode) {
        await tx
          .update(classroomJoinCodes)
          .set({ isActive: false, revokedAt: new Date() })
          .where(eq(classroomJoinCodes.classroomId, id));
      }

      if (data.regenerateJoinCode) {
        generatedCode = `PKM-${Math.random()
          .toString(36)
          .substring(2, 7)
          .toUpperCase()}`;
        await tx.insert(classroomJoinCodes).values({
          classroomId: id,
          code: generatedCode,
          isActive: true,
          createdById: user.id,
        });
      }
    });

    await recordAuditLog({
      actorId: user.id,
      action: 'CLASSROOM_SETTINGS_UPDATED',
      entityType: 'CLASSROOM',
      entityId: id,
      metadata: { ...data, generatedCode },
      ipAddress: req.ip,
    });

    return sendSuccess(reply, { updated: true, newJoinCode: generatedCode });
  });

  // Approve, Reject, or Drop Enrollment (Transactional + Preserves History)
  const updateEnrollmentSchema = z.object({
    status: z.enum(['active', 'rejected', 'dropped', 'completed']),
    reason: z.string().optional(),
  });

  fastify.patch(
    '/api/v1/classrooms/:id/enrollments/:enrollmentId',
    async (req, reply) => {
      const user = await authenticateRequest(req, reply);
      if (!user) return;

      const { id, enrollmentId } = req.params as {
        id: string;
        enrollmentId: string;
      };
      const access = await checkClassroomAccess(user, id);
      if (!access.canManage) {
        return sendError(
          reply,
          403,
          'FORBIDDEN_RESOURCE_OWNERSHIP',
          'Anda tidak memiliki otoritas atas pendaftaran mahasiswa di kelas ini.'
        );
      }

      const parsed = updateEnrollmentSchema.safeParse(req.body);
      if (!parsed.success) {
        return sendError(reply, 400, 'VALIDATION_ERROR', 'Status pendaftaran tidak valid.');
      }

      try {
        const updatedEnrollment = await db.transaction(async (tx) => {
          const [cls] = await tx
            .select()
            .from(classrooms)
            .where(eq(classrooms.id, id));
          const [enr] = await tx
            .select()
            .from(classroomEnrollments)
            .where(
              and(
                eq(classroomEnrollments.id, enrollmentId),
                eq(classroomEnrollments.classroomId, id)
              )
            );

          if (!cls || !enr) {
            throw new Error('ENROLLMENT_NOT_FOUND');
          }

          if (parsed.data.status === 'active' && enr.status !== 'active') {
            const activeRows = await tx
              .select()
              .from(classroomEnrollments)
              .where(
                and(
                  eq(classroomEnrollments.classroomId, id),
                  eq(classroomEnrollments.status, 'active')
                )
              );
            if (activeRows.length >= cls.capacity) {
              throw new Error('CAPACITY_EXCEEDED');
            }
          }

          const prevHistory = Array.isArray(enr.statusHistory)
            ? enr.statusHistory
            : [];
          const newHistoryEntry = {
            status: parsed.data.status,
            changedAt: new Date().toISOString(),
            actorName: user.fullName,
            reason:
              parsed.data.reason ||
              `Status diubah menjadi ${parsed.data.status} oleh ${user.fullName}`,
          };

          const [updated] = await tx
            .update(classroomEnrollments)
            .set({
              status: parsed.data.status,
              approvedById: user.id,
              statusHistory: [...prevHistory, newHistoryEntry],
              updatedAt: new Date(),
            })
            .where(eq(classroomEnrollments.id, enrollmentId))
            .returning();

          await tx.insert(notifications).values({
            userId: enr.studentId,
            title: `Status Pendaftaran Kelas: ${parsed.data.status.toUpperCase()}`,
            message: `Pendaftaran Anda di kelas ${cls.name} telah diperbarui menjadi ${parsed.data.status} oleh ${user.fullName}.`,
            type: 'ENROLLMENT',
            linkUrl: `/classrooms/${id}`,
          });

          return updated;
        });

        await recordAuditLog({
          actorId: user.id,
          action: `ENROLLMENT_${parsed.data.status.toUpperCase()}`,
          entityType: 'ENROLLMENT',
          entityId: enrollmentId,
          metadata: { classroomId: id, status: parsed.data.status },
          ipAddress: req.ip,
        });

        return sendSuccess(reply, updatedEnrollment);
      } catch (error: any) {
        if (error.message === 'CAPACITY_EXCEEDED') {
          return sendError(
            reply,
            422,
            'CAPACITY_EXCEEDED',
            'Kapasitas kelas sudah penuh, tidak dapat menyetujui pendaftaran tambahan.'
          );
        }
        return sendError(reply, 404, 'ENROLLMENT_UPDATE_ERROR', 'Gagal memperbarui status pendaftaran.');
      }
    }
  );

  // ============================================================================
  // 6. STREAM ANNOUNCEMENTS, COMMENTS, TOPICS & LEARNING MATERIALS
  // ============================================================================
  const announcementSchema = z.object({
    title: z.string().min(4),
    content: z.string().min(5),
    isPinned: z.boolean().optional(),
  });

  fastify.post('/api/v1/classrooms/:id/announcements', async (req, reply) => {
    const user = await authenticateRequest(req, reply);
    if (!user) return;

    const { id } = req.params as { id: string };

    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
    if (!isUuid) {
      return sendError(reply, 404, 'CLASSROOM_NOT_FOUND', 'Ruang kelas tidak ditemukan.');
    }
    const access = await checkClassroomAccess(user, id);
    if (!access.canManage) {
      return sendError(
        reply,
        403,
        'FORBIDDEN',
        'Hanya Dosen pengampu yang dapat menerbitkan pengumuman resmi.'
      );
    }

    const parsed = announcementSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(reply, 400, 'VALIDATION_ERROR', 'Isi pengumuman tidak valid.');
    }

    const [created] = await db
      .insert(announcements)
      .values({
        classroomId: id,
        authorId: user.id,
        title: parsed.data.title,
        content: parsed.data.content,
        isPinned: parsed.data.isPinned || false,
      })
      .returning();

    return sendSuccess(reply, created, null, 201);
  });

  const commentSchema = z.object({
    announcementId: z.string().uuid(),
    content: z.string().min(2),
  });

  fastify.post('/api/v1/classrooms/:id/comments', async (req, reply) => {
    const user = await authenticateRequest(req, reply);
    if (!user) return;

    const { id } = req.params as { id: string };

    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
    if (!isUuid) {
      return sendError(reply, 404, 'CLASSROOM_NOT_FOUND', 'Ruang kelas tidak ditemukan.');
    }
    const access = await checkClassroomAccess(user, id);
    if (!access.canView) {
      return sendError(
        reply,
        403,
        'FORBIDDEN',
        'Anda harus terdaftar aktif di kelas ini untuk berdiskusi.'
      );
    }

    const parsed = commentSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(reply, 400, 'VALIDATION_ERROR', 'Komentar tidak boleh kosong.');
    }

    const [created] = await db
      .insert(comments)
      .values({
        classroomId: id,
        announcementId: parsed.data.announcementId,
        authorId: user.id,
        content: parsed.data.content,
      })
      .returning();

    return sendSuccess(reply, created, null, 201);
  });

  const topicSchema = z.object({
    title: z.string().min(3),
    description: z.string().optional(),
  });

  fastify.post('/api/v1/classrooms/:id/topics', async (req, reply) => {
    const user = await authenticateRequest(req, reply);
    if (!user) return;

    const { id } = req.params as { id: string };

    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
    if (!isUuid) {
      return sendError(reply, 404, 'CLASSROOM_NOT_FOUND', 'Ruang kelas tidak ditemukan.');
    }
    const access = await checkClassroomAccess(user, id);
    if (!access.canManage) {
      return sendError(reply, 403, 'FORBIDDEN', 'Hanya Dosen yang dapat menambah topik.');
    }

    const parsed = topicSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(reply, 400, 'VALIDATION_ERROR', 'Judul topik tidak valid.');
    }

    const existing = await db
      .select()
      .from(classroomTopics)
      .where(eq(classroomTopics.classroomId, id));

    const [created] = await db
      .insert(classroomTopics)
      .values({
        classroomId: id,
        title: parsed.data.title,
        description: parsed.data.description || '',
        sortOrder: existing.length + 1,
      })
      .returning();

    return sendSuccess(reply, created, null, 201);
  });

  const materialSchema = z.object({
    topicId: z.string().uuid().optional().nullable(),
    title: z.string().min(4),
    content: z.string().min(10),
    externalUrl: z.string().optional().nullable(),
    attachmentName: z.string().optional(),
    attachmentTextContent: z.string().optional(),
  });

  fastify.post('/api/v1/classrooms/:id/materials', async (req, reply) => {
    const user = await authenticateRequest(req, reply);
    if (!user) return;

    const { id } = req.params as { id: string };

    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
    if (!isUuid) {
      return sendError(reply, 404, 'CLASSROOM_NOT_FOUND', 'Ruang kelas tidak ditemukan.');
    }
    const access = await checkClassroomAccess(user, id);
    if (!access.canManage) {
      return sendError(
        reply,
        403,
        'FORBIDDEN',
        'Hanya Dosen pengampu yang dapat menerbitkan materi pembelajaran.'
      );
    }

    const parsed = materialSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(reply, 400, 'VALIDATION_ERROR', 'Data materi tidak lengkap.');
    }

    const createdMaterial = await db.transaction(async (tx) => {
      const [mat] = await tx
        .insert(learningMaterials)
        .values({
          classroomId: id,
          topicId: parsed.data.topicId || null,
          authorId: user.id,
          title: parsed.data.title,
          content: parsed.data.content,
          externalUrl: parsed.data.externalUrl || null,
          isPublished: true,
        })
        .returning();

      if (parsed.data.attachmentName && parsed.data.attachmentTextContent) {
        const base64 = Buffer.from(parsed.data.attachmentTextContent).toString(
          'base64'
        );
        const [stored] = await tx
          .insert(storedFiles)
          .values({
            bucket: process.env.S3_BUCKET || 'poltek-kampar-lms-private',
            objectKey: `classrooms/${id}/materials/${Date.now()}-${parsed.data.attachmentName}`,
            originalName: parsed.data.attachmentName,
            mimeType: 'text/plain',
            sizeBytes: Buffer.byteLength(parsed.data.attachmentTextContent),
            contentBase64: base64,
            uploadedById: user.id,
            classroomId: id,
          })
          .returning();

        await tx.insert(materialAttachments).values({
          materialId: mat.id,
          fileId: stored.id,
        });
      }

      return mat;
    });

    return sendSuccess(reply, createdMaterial, null, 201);
  });

  // ============================================================================
  // 7. QUIZZES (Advanced Assignments, Submissions & Grading handled in assignmentRoutes.ts)
  // ============================================================================
  // Create Quiz with Questions & Options (Instructor)
  const createQuizSchema = z.object({
    topicId: z.string().uuid().optional().nullable(),
    title: z.string().min(4),
    description: z.string().min(5),
    durationMinutes: z.number().int().min(5).max(180),
    passingScore: z.number().int().min(40).max(100),
    questions: z
      .array(
        z.object({
          questionText: z.string().min(5),
          points: z.number().int().min(5).max(100),
          options: z
            .array(
              z.object({
                optionLabel: z.string().min(1),
                optionText: z.string().min(1),
                isCorrect: z.boolean(),
              })
            )
            .min(2),
        })
      )
      .min(1),
  });

  fastify.post('/api/v1/classrooms/:id/quizzes', async (req, reply) => {
    const user = await authenticateRequest(req, reply);
    if (!user) return;

    const { id } = req.params as { id: string };

    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
    if (!isUuid) {
      return sendError(reply, 404, 'CLASSROOM_NOT_FOUND', 'Ruang kelas tidak ditemukan.');
    }
    const access = await checkClassroomAccess(user, id);
    if (!access.canManage) {
      return sendError(reply, 403, 'FORBIDDEN', 'Hanya Dosen yang dapat membuat kuis.');
    }

    const parsed = createQuizSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(
        reply,
        400,
        'VALIDATION_ERROR',
        'Struktur soal kuis tidak lengkap.',
        parsed.error.issues
      );
    }

    const createdQuiz = await db.transaction(async (tx) => {
      const [qz] = await tx
        .insert(quizzes)
        .values({
          classroomId: id,
          topicId: parsed.data.topicId || null,
          authorId: user.id,
          title: parsed.data.title,
          description: parsed.data.description,
          durationMinutes: parsed.data.durationMinutes,
          passingScore: parsed.data.passingScore,
          maxAttempts: 3,
          dueAt: new Date(Date.now() + 7 * 86400000),
          isPublished: true,
        })
        .returning();

      for (let i = 0; i < parsed.data.questions.length; i++) {
        const qData = parsed.data.questions[i];
        const [qRow] = await tx
          .insert(quizQuestions)
          .values({
            quizId: qz.id,
            questionText: qData.questionText,
            points: qData.points,
            sortOrder: i + 1,
          })
          .returning();

        await tx.insert(quizOptions).values(
          qData.options.map((opt, idx) => ({
            questionId: qRow.id,
            optionLabel: opt.optionLabel,
            optionText: opt.optionText,
            isCorrect: opt.isCorrect,
            sortOrder: idx + 1,
          }))
        );
      }

      const cats = await tx
        .select()
        .from(gradeCategories)
        .where(eq(gradeCategories.classroomId, id));

      await tx.insert(gradeItems).values({
        classroomId: id,
        categoryId: cats[1]?.id || cats[0]?.id || null,
        sourceType: 'QUIZ',
        sourceId: qz.id,
        title: qz.title,
        maxScore: 100,
      });

      return qz;
    });

    return sendSuccess(reply, createdQuiz, null, 201);
  });

  // Student Attempt Quiz (Server-Side Evaluation + Gradebook Sync)
  const submitQuizAttemptSchema = z.object({
    answers: z.record(z.string(), z.string().uuid()), // questionId -> selectedOptionId
  });

  fastify.post('/api/v1/quizzes/:quizId/attempt', async (req, reply) => {
    const user = await authenticateRequest(req, reply);
    if (!user) return;

    const { quizId } = req.params as { quizId: string };
    const [qz] = await db.select().from(quizzes).where(eq(quizzes.id, quizId));
    if (!qz) {
      return sendError(reply, 404, 'NOT_FOUND', 'Kuis tidak ditemukan.');
    }

    const access = await checkClassroomAccess(user, qz.classroomId);
    if (!access.isEnrolledActive && !access.canManage) {
      return sendError(
        reply,
        403,
        'FORBIDDEN_NOT_ENROLLED',
        'Hanya mahasiswa aktif di kelas ini yang dapat mengerjakan kuis.'
      );
    }

    const parsed = submitQuizAttemptSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(reply, 400, 'VALIDATION_ERROR', 'Jawaban kuis tidak valid.');
    }

    const questions = await db
      .select()
      .from(quizQuestions)
      .where(eq(quizQuestions.quizId, quizId));
    const allOpts = await db.select().from(quizOptions);

    let earnedPoints = 0;
    let maxPoints = 0;
    const answerRecords: {
      questionId: string;
      selectedOptionId: string;
      isCorrect: boolean;
      pointsAwarded: number;
    }[] = [];

    for (const q of questions) {
      maxPoints += q.points;
      const selectedOptionId = parsed.data.answers[q.id];
      const matchedOpt = allOpts.find(
        (o) => o.id === selectedOptionId && o.questionId === q.id
      );
      if (matchedOpt) {
        const correct = matchedOpt.isCorrect;
        const awarded = correct ? q.points : 0;
        earnedPoints += awarded;
        answerRecords.push({
          questionId: q.id,
          selectedOptionId: matchedOpt.id,
          isCorrect: correct,
          pointsAwarded: awarded,
        });
      }
    }

    const normalizedScore =
      maxPoints > 0 ? ((earnedPoints / maxPoints) * 100).toFixed(2) : '0.00';

    const attempt = await db.transaction(async (tx) => {
      const existingAttempts = await tx
        .select()
        .from(quizAttempts)
        .where(
          and(
            eq(quizAttempts.quizId, quizId),
            eq(quizAttempts.studentId, user.id)
          )
        );

      const [newAttempt] = await tx
        .insert(quizAttempts)
        .values({
          quizId,
          studentId: user.id,
          attemptNumber: existingAttempts.length + 1,
          status: 'COMPLETED',
          totalScore: normalizedScore,
          maxScore: 100,
          submittedAt: new Date(),
        })
        .returning();

      if (answerRecords.length > 0) {
        await tx.insert(quizAnswers).values(
          answerRecords.map((a) => ({
            attemptId: newAttempt.id,
            ...a,
          }))
        );
      }

      // Sync to Gradebook
      const [gItem] = await tx
        .select()
        .from(gradeItems)
        .where(
          and(
            eq(gradeItems.classroomId, qz.classroomId),
            eq(gradeItems.sourceId, qz.id)
          )
        );

      if (gItem) {
        await tx
          .insert(gradeRecords)
          .values({
            gradeItemId: gItem.id,
            classroomId: qz.classroomId,
            studentId: user.id,
            score: normalizedScore,
            maxScore: 100,
            remarks: `Percobaan Kuis #${existingAttempts.length + 1} (Otomatis)`,
          })
          .onConflictDoUpdate({
            target: [gradeRecords.gradeItemId, gradeRecords.studentId],
            set: {
              score: normalizedScore,
              remarks: `Percobaan Kuis #${existingAttempts.length + 1} (Otomatis)`,
              updatedAt: new Date(),
            },
          });
      }

      return newAttempt;
    });

    return sendSuccess(reply, attempt, null, 201);
  });

  // ============================================================================
  // 8. PRIVATE S3-COMPATIBLE FILE AUTHORIZED DOWNLOAD & AUDIT LOGS
  // ============================================================================
  fastify.get('/api/v1/files/:fileId/download', async (req, reply) => {
    const user = await authenticateRequest(req, reply);
    if (!user) return;

    const { fileId } = req.params as { fileId: string };
    const [file] = await db
      .select()
      .from(storedFiles)
      .where(eq(storedFiles.id, fileId));
    if (!file) {
      return sendError(reply, 404, 'FILE_NOT_FOUND', 'Berkas tidak ditemukan.');
    }

    if (file.classroomId) {
      const access = await checkClassroomAccess(user, file.classroomId);
      if (!access.canView) {
        return sendError(
          reply,
          403,
          'FORBIDDEN_FILE_ACCESS',
          'Akses berkas ditolak: Anda tidak terdaftar aktif pada ruang kelas pemilik berkas ini.'
        );
      }
    }

    await recordAuditLog({
      actorId: user.id,
      action: 'PRIVATE_FILE_DOWNLOADED',
      entityType: 'FILE',
      entityId: file.id,
      metadata: { originalName: file.originalName, bucket: file.bucket },
      ipAddress: req.ip,
    });

    const decodedContent = file.contentBase64
      ? Buffer.from(file.contentBase64, 'base64').toString('utf-8')
      : '';

    return sendSuccess(reply, {
      id: file.id,
      bucket: file.bucket,
      objectKey: file.objectKey,
      originalName: file.originalName,
      mimeType: file.mimeType,
      sizeBytes: file.sizeBytes,
      content: decodedContent,
    });
  });

  fastify.get('/api/v1/audit-logs', async (req, reply) => {
    const actor = await authenticateRequest(req, reply, {
      requiredPermissions: ['audit:view'],
    });
    if (!actor) return;

    const query = req.query as { page?: string; limit?: string };
    const page = Math.max(1, parseInt(query.page || '1', 10));
    const limit = Math.min(50, Math.max(1, parseInt(query.limit || '15', 10)));

    const logs = await db
      .select({
        id: auditLogs.id,
        action: auditLogs.action,
        entityType: auditLogs.entityType,
        entityId: auditLogs.entityId,
        metadata: auditLogs.metadata,
        ipAddress: auditLogs.ipAddress,
        createdAt: auditLogs.createdAt,
        actorName: users.fullName,
        actorEmail: users.email,
      })
      .from(auditLogs)
      .leftJoin(users, eq(auditLogs.actorId, users.id))
      .orderBy(desc(auditLogs.createdAt));

    const total = logs.length;
    const paginated = logs.slice((page - 1) * limit, page * limit);

    return sendSuccess(reply, paginated, {
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    });
  });
}
