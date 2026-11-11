import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq, and, desc, asc, ilike, or, sql } from 'drizzle-orm';
import { db } from '../db/index.ts';
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
} from './security.ts';
import { ensureSeeded } from './seed.ts';
import { openApiSpec } from './openapi.ts';
import { adminAuth } from '../lib/firebase-admin.ts';
import { getOrCreateUser } from '../db/users.ts';

const isProd = process.env.NODE_ENV === 'production';

function setSessionCookies(
  reply: any,
  rawSessionToken: string,
  csrfToken: string,
  expiresAt: Date
) {
  reply.setCookie(SESSION_COOKIE_NAME, rawSessionToken, {
    path: '/',
    httpOnly: true,
    secure: true,
    sameSite: 'none',
    expires: expiresAt,
  });
  reply.setCookie(CSRF_COOKIE_NAME, csrfToken, {
    path: '/',
    httpOnly: false,
    secure: true,
    sameSite: 'none',
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

      setSessionCookies(reply, rawSessionToken, csrfToken, expiresAt);

      const profile = await getUserWithRolesAndPermissions(user.id);
      return sendSuccess(reply, {
        user: profile,
        csrfToken,
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

      setSessionCookies(reply, rawSessionToken, csrfToken, expiresAt);
      const profile = await getUserWithRolesAndPermissions(user.id);

      return sendSuccess(reply, {
        user: profile,
        csrfToken,
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
      },
      csrfToken: user.csrfToken,
      notifications: unreadNotifications,
    });
  });

  fastify.post('/api/v1/auth/logout', async (req, reply) => {
    const rawToken = req.cookies?.[SESSION_COOKIE_NAME];
    if (rawToken) {
      const tokenHash = hashSessionToken(rawToken);
      await db
        .update(userSessions)
        .set({ isRevoked: true })
        .where(eq(userSessions.tokenHash, tokenHash));
    }

    reply.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
    reply.clearCookie(CSRF_COOKIE_NAME, { path: '/' });

    return sendSuccess(reply, { loggedOut: true });
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
  // 2. SUPERADMIN: USERS, RBAC ROLES & PERMISSIONS, ACADEMIC DATA, AUDIT LOGS
  // ============================================================================
  fastify.get('/api/v1/users', async (req, reply) => {
    const user = await authenticateRequest(req, reply, {
      requiredPermissions: ['users:read'],
    });
    if (!user) return;

    const query = req.query as { page?: string; limit?: string; search?: string; role?: string };
    const page = Math.max(1, parseInt(query.page || '1', 10));
    const limit = Math.min(50, Math.max(1, parseInt(query.limit || '10', 10)));
    const search = (query.search || '').trim();
    const roleFilter = (query.role || '').trim();

    const allUsers = await db.select().from(users).orderBy(asc(users.fullName));
    const allProfiles = await db.select().from(userProfiles);
    const allUserRoles = await db
      .select({
        userId: userRoles.userId,
        roleCode: roles.code,
        roleName: roles.name,
      })
      .from(userRoles)
      .innerJoin(roles, eq(userRoles.roleId, roles.id));

    const profileMap = new Map(allProfiles.map((p) => [p.userId, p]));

    const enriched = allUsers
      .map((u) => {
        const uRoles = allUserRoles
          .filter((ur) => ur.userId === u.id)
          .map((ur) => ur.roleCode);
        const prof = profileMap.get(u.id);
        return {
          id: u.id,
          email: u.email,
          fullName: u.fullName,
          identityNumber: u.identityNumber,
          isActive: u.isActive,
          lastLoginAt: u.lastLoginAt,
          createdAt: u.createdAt,
          studyProgram: prof?.studyProgram || 'Teknik Informatika',
          academicTitle: prof?.academicTitle || null,
          semesterLevel: prof?.semesterLevel || null,
          roles: uRoles,
        };
      })
      .filter((u) => {
        if (roleFilter && !u.roles.includes(roleFilter)) return false;
        if (search) {
          const q = search.toLowerCase();
          return (
            u.fullName.toLowerCase().includes(q) ||
            u.email.toLowerCase().includes(q) ||
            (u.identityNumber || '').toLowerCase().includes(q) ||
            u.studyProgram.toLowerCase().includes(q)
          );
        }
        return true;
      });

    const total = enriched.length;
    const paginated = enriched.slice((page - 1) * limit, page * limit);

    return sendSuccess(reply, paginated, {
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    });
  });

  const createUserSchema = z.object({
    email: z.string().email(),
    fullName: z.string().min(3),
    identityNumber: z.string().min(3),
    password: z.string().min(8),
    roleCode: z.enum(['SUPERADMIN', 'DOSEN', 'MAHASISWA']),
    studyProgram: z.string().min(2),
  });

  fastify.post('/api/v1/users', async (req, reply) => {
    const actor = await authenticateRequest(req, reply, {
      requiredPermissions: ['users:manage'],
    });
    if (!actor) return;

    const parsed = createUserSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(
        reply,
        400,
        'VALIDATION_ERROR',
        'Data pengguna baru tidak lengkap atau tidak valid.',
        parsed.error.issues
      );
    }

    const { email, fullName, identityNumber, password, roleCode, studyProgram } =
      parsed.data;

    try {
      const passwordHash = await hashPassword(password);
      const created = await db.transaction(async (tx) => {
        const [newUser] = await tx
          .insert(users)
          .values({
            email: email.toLowerCase(),
            fullName,
            identityNumber,
            passwordHash,
            isActive: true,
          })
          .returning();

        await tx.insert(userProfiles).values({
          userId: newUser.id,
          studyProgram,
          semesterLevel: roleCode === 'MAHASISWA' ? 1 : null,
        });

        const roleRow = await tx
          .select()
          .from(roles)
          .where(eq(roles.code, roleCode));
        if (roleRow[0]) {
          await tx.insert(userRoles).values({
            userId: newUser.id,
            roleId: roleRow[0].id,
          });
        }

        return newUser;
      });

      await recordAuditLog({
        actorId: actor.id,
        action: 'USER_CREATED',
        entityType: 'USER',
        entityId: created.id,
        metadata: { email: created.email, roleCode, identityNumber },
        ipAddress: req.ip,
      });

      return sendSuccess(
        reply,
        {
          id: created.id,
          email: created.email,
          fullName: created.fullName,
          identityNumber: created.identityNumber,
          roleCode,
        },
        null,
        201
      );
    } catch (error: any) {
      console.error('Create user failed:', error);
      return sendError(
        reply,
        409,
        'USER_CONFLICT',
        'Email atau Nomor Identitas (NIM/NIDN/NIP) sudah terdaftar.'
      );
    }
  });

  fastify.patch('/api/v1/users/:userId/status', async (req, reply) => {
    const actor = await authenticateRequest(req, reply, {
      requiredPermissions: ['users:manage'],
    });
    if (!actor) return;

    const { userId } = req.params as { userId: string };
    const bodySchema = z.object({ isActive: z.boolean() });
    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(reply, 400, 'VALIDATION_ERROR', 'Status aktif tidak valid.');
    }

    if (userId === actor.id && !parsed.data.isActive) {
      return sendError(
        reply,
        400,
        'SELF_DEACTIVATION_FORBIDDEN',
        'Anda tidak dapat menonaktifkan akun Superadmin Anda sendiri.'
      );
    }

    const [updated] = await db
      .update(users)
      .set({ isActive: parsed.data.isActive, updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning();

    await recordAuditLog({
      actorId: actor.id,
      action: parsed.data.isActive ? 'USER_ACTIVATED' : 'USER_DEACTIVATED',
      entityType: 'USER',
      entityId: userId,
      ipAddress: req.ip,
    });

    return sendSuccess(reply, updated);
  });

  // RBAC Roles & Permissions Matrix
  fastify.get('/api/v1/rbac/roles', async (req, reply) => {
    const actor = await authenticateRequest(req, reply, {
      requiredPermissions: ['rbac:manage'],
    });
    if (!actor) return;

    const allRoles = await db.select().from(roles).orderBy(asc(roles.code));
    const allPerms = await db
      .select()
      .from(permissions)
      .orderBy(asc(permissions.module), asc(permissions.code));
    const allRolePerms = await db.select().from(rolePermissions);

    const roleMatrix = allRoles.map((r) => ({
      ...r,
      permissionIds: allRolePerms
        .filter((rp) => rp.roleId === r.id)
        .map((rp) => rp.permissionId),
    }));

    return sendSuccess(reply, {
      roles: roleMatrix,
      permissions: allPerms,
    });
  });

  const togglePermissionSchema = z.object({
    roleId: z.string().uuid(),
    permissionId: z.string().uuid(),
    enabled: z.boolean(),
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

    const { roleId, permissionId, enabled } = parsed.data;

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
      metadata: { permissionId, enabled },
      ipAddress: req.ip,
    });

    return sendSuccess(reply, { roleId, permissionId, enabled });
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

  const createCourseSchema = z.object({
    code: z.string().min(3),
    title: z.string().min(4),
    studyProgram: z.string().min(3),
    credits: z.number().int().min(1).max(8),
    semesterNumber: z.number().int().min(1).max(8),
    description: z.string().min(10),
  });

  fastify.post('/api/v1/academic/courses', async (req, reply) => {
    const actor = await authenticateRequest(req, reply, {
      requiredPermissions: ['academic:manage'],
    });
    if (!actor) return;

    const parsed = createCourseSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(
        reply,
        400,
        'VALIDATION_ERROR',
        'Data mata kuliah tidak valid.',
        parsed.error.issues
      );
    }

    try {
      const [created] = await db
        .insert(courses)
        .values({
          ...parsed.data,
          code: parsed.data.code.toUpperCase(),
          createdById: actor.id,
        })
        .returning();

      await recordAuditLog({
        actorId: actor.id,
        action: 'COURSE_CREATED',
        entityType: 'COURSE',
        entityId: created.id,
        metadata: { code: created.code, title: created.title },
        ipAddress: req.ip,
      });

      return sendSuccess(reply, created, null, 201);
    } catch (error) {
      return sendError(
        reply,
        409,
        'COURSE_CODE_CONFLICT',
        'Kode mata kuliah tersebut sudah digunakan.'
      );
    }
  });

  // ============================================================================
  // 4. CLASSROOMS & ENROLLMENT BUSINESS RULES
  // ============================================================================
  fastify.get('/api/v1/classrooms', async (req, reply) => {
    const user = await authenticateRequest(req, reply);
    if (!user) return;

    const query = req.query as {
      page?: string;
      limit?: string;
      search?: string;
      scope?: string;
    };
    const page = Math.max(1, parseInt(query.page || '1', 10));
    const limit = Math.min(50, Math.max(1, parseInt(query.limit || '12', 10)));
    const search = (query.search || '').trim().toLowerCase();
    const scope = query.scope || 'all'; // 'all' | 'mine'

    const allClassrooms = await db
      .select()
      .from(classrooms)
      .orderBy(desc(classrooms.createdAt));
    const allCourses = await db.select().from(courses);
    const allSemesters = await db.select().from(semesters);
    const allInstructors = await db
      .select({
        classroomId: classroomInstructors.classroomId,
        instructorId: classroomInstructors.instructorId,
        isPrimary: classroomInstructors.isPrimary,
        fullName: users.fullName,
        email: users.email,
      })
      .from(classroomInstructors)
      .innerJoin(users, eq(classroomInstructors.instructorId, users.id));
    const allJoinCodes = await db
      .select()
      .from(classroomJoinCodes)
      .where(eq(classroomJoinCodes.isActive, true));
    const allEnrollments = await db.select().from(classroomEnrollments);

    const courseMap = new Map(allCourses.map((c) => [c.id, c]));
    const semMap = new Map(allSemesters.map((s) => [s.id, s]));

    const enriched = allClassrooms
      .map((cls) => {
        const course = courseMap.get(cls.courseId);
        const semester = semMap.get(cls.semesterId);
        const instructors = allInstructors.filter(
          (i) => i.classroomId === cls.id
        );
        const isInstructor = instructors.some(
          (i) => i.instructorId === user.id
        );
        const myEnrollment = allEnrollments.find(
          (e) => e.classroomId === cls.id && e.studentId === user.id
        );
        const activeCount = allEnrollments.filter(
          (e) => e.classroomId === cls.id && e.status === 'active'
        ).length;
        const pendingCount = allEnrollments.filter(
          (e) => e.classroomId === cls.id && e.status === 'pending'
        ).length;
        const activeCode = allJoinCodes.find((jc) => jc.classroomId === cls.id);

        const canManage =
          user.roles.includes('SUPERADMIN') || isInstructor;

        return {
          ...cls,
          courseCode: course?.code || 'N/A',
          courseTitle: course?.title || cls.name,
          studyProgram: course?.studyProgram || 'Teknik Informatika',
          credits: course?.credits || 3,
          semesterName: semester?.name || 'Semester Aktif',
          instructors,
          activeStudentCount: activeCount,
          pendingEnrollmentCount: canManage ? pendingCount : 0,
          joinCode: canManage ? activeCode?.code || null : null,
          myEnrollmentStatus: myEnrollment?.status || null,
          isInstructor,
          canManage,
          canEnter:
            canManage ||
            myEnrollment?.status === 'active' ||
            myEnrollment?.status === 'completed',
        };
      })
      .filter((item) => {
        if (scope === 'mine') {
          if (user.roles.includes('SUPERADMIN')) return true;
          if (user.roles.includes('DOSEN')) return item.isInstructor;
          return item.myEnrollmentStatus !== null;
        }
        return true;
      })
      .filter((item) => {
        if (!search) return true;
        return (
          item.name.toLowerCase().includes(search) ||
          item.courseCode.toLowerCase().includes(search) ||
          item.courseTitle.toLowerCase().includes(search) ||
          item.studyProgram.toLowerCase().includes(search)
        );
      });

    const total = enriched.length;
    const paginated = enriched.slice((page - 1) * limit, page * limit);

    return sendSuccess(reply, paginated, {
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    });
  });

  const createClassroomSchema = z.object({
    courseId: z.string().uuid(),
    semesterId: z.string().uuid(),
    name: z.string().min(4),
    section: z.string().min(2),
    roomNumber: z.string().min(3),
    scheduleText: z.string().min(4),
    capacity: z.number().int().min(5).max(200),
    enrollmentPolicy: z.enum(['AUTO', 'APPROVAL_REQUIRED']),
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
            ...parsed.data,
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

  // Student Join Classroom by Join Code (Transactional)
  const joinClassroomSchema = z.object({
    code: z.string().min(4).max(20),
  });

  fastify.post('/api/v1/classrooms/join', async (req, reply) => {
    const user = await authenticateRequest(req, reply, {
      requiredPermissions: ['enrollments:join'],
    });
    if (!user) return;

    const parsed = joinClassroomSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(reply, 400, 'VALIDATION_ERROR', 'Kode kelas tidak valid.');
    }

    const normalizedCode = parsed.data.code.trim().toUpperCase();

    try {
      const outcome = await db.transaction(async (tx) => {
        const codeRows = await tx
          .select()
          .from(classroomJoinCodes)
          .where(
            and(
              eq(classroomJoinCodes.code, normalizedCode),
              eq(classroomJoinCodes.isActive, true)
            )
          );

        const joinCode = codeRows[0];
        if (!joinCode) {
          throw new Error('INVALID_OR_REVOKED_CODE');
        }

        const clsRows = await tx
          .select()
          .from(classrooms)
          .where(eq(classrooms.id, joinCode.classroomId));
        const cls = clsRows[0];
        if (!cls || cls.status !== 'ACTIVE') {
          throw new Error('CLASSROOM_INACTIVE');
        }

        // Check if user is already an instructor
        const existingInstructor = await tx
          .select()
          .from(classroomInstructors)
          .where(
            and(
              eq(classroomInstructors.classroomId, cls.id),
              eq(classroomInstructors.instructorId, user.id)
            )
          );
        if (existingInstructor.length > 0) {
          throw new Error('ALREADY_INSTRUCTOR');
        }

        // Prevent duplicate enrollment
        const existingEnrollment = await tx
          .select()
          .from(classroomEnrollments)
          .where(
            and(
              eq(classroomEnrollments.classroomId, cls.id),
              eq(classroomEnrollments.studentId, user.id)
            )
          );

        if (existingEnrollment.length > 0) {
          const current = existingEnrollment[0];
          if (current.status === 'active' || current.status === 'pending') {
            throw new Error('DUPLICATE_ENROLLMENT');
          }
        }

        // Enforce classroom capacity
        const activeEnrollments = await tx
          .select()
          .from(classroomEnrollments)
          .where(
            and(
              eq(classroomEnrollments.classroomId, cls.id),
              eq(classroomEnrollments.status, 'active')
            )
          );

        if (activeEnrollments.length >= cls.capacity) {
          throw new Error('CAPACITY_EXCEEDED');
        }

        const targetStatus =
          cls.enrollmentPolicy === 'AUTO' ? 'active' : 'pending';

        const historyEntry = {
          status: targetStatus,
          changedAt: new Date().toISOString(),
          actorId: user.id,
          reason:
            targetStatus === 'active'
              ? `Auto-enrolled via code ${normalizedCode}`
              : `Pending instructor approval via code ${normalizedCode}`,
        };

        if (existingEnrollment.length > 0) {
          const prevHistory = Array.isArray(existingEnrollment[0].statusHistory)
            ? existingEnrollment[0].statusHistory
            : [];
          const [updated] = await tx
            .update(classroomEnrollments)
            .set({
              status: targetStatus,
              joinCodeUsed: normalizedCode,
              statusHistory: [...prevHistory, historyEntry],
              updatedAt: new Date(),
            })
            .where(eq(classroomEnrollments.id, existingEnrollment[0].id))
            .returning();
          return { enrollment: updated, classroom: cls };
        }

        const [inserted] = await tx
          .insert(classroomEnrollments)
          .values({
            classroomId: cls.id,
            studentId: user.id,
            status: targetStatus,
            joinCodeUsed: normalizedCode,
            statusHistory: [historyEntry],
          })
          .returning();

        return { enrollment: inserted, classroom: cls };
      });

      await recordAuditLog({
        actorId: user.id,
        action: 'CLASSROOM_JOIN_REQUESTED',
        entityType: 'ENROLLMENT',
        entityId: outcome.enrollment.id,
        metadata: {
          classroomId: outcome.classroom.id,
          status: outcome.enrollment.status,
          joinCode: normalizedCode,
        },
        ipAddress: req.ip,
      });

      return sendSuccess(reply, outcome, null, 201);
    } catch (error: any) {
      const code = error.message;
      if (code === 'INVALID_OR_REVOKED_CODE') {
        return sendError(
          reply,
          404,
          code,
          'Kode kelas tidak ditemukan atau telah dicabut oleh Dosen.'
        );
      }
      if (code === 'DUPLICATE_ENROLLMENT') {
        return sendError(
          reply,
          409,
          code,
          'Anda sudah terdaftar atau sedang menunggu persetujuan di kelas ini.'
        );
      }
      if (code === 'CAPACITY_EXCEEDED') {
        return sendError(
          reply,
          422,
          code,
          'Kapasitas maksimum ruang kelas ini telah penuh.'
        );
      }
      if (code === 'ALREADY_INSTRUCTOR') {
        return sendError(
          reply,
          409,
          code,
          'Anda adalah Dosen Pengampu pada ruang kelas ini.'
        );
      }
      return sendError(reply, 400, 'JOIN_FAILED', 'Gagal bergabung ke ruang kelas.');
    }
  });

  // ============================================================================
  // 5. FULL CLASSROOM WORKSPACE (STREAM, CLASSWORK, PEOPLE, GRADES, SETTINGS)
  // ============================================================================
  fastify.get('/api/v1/classrooms/:id', async (req, reply) => {
    const user = await authenticateRequest(req, reply);
    if (!user) return;

    const { id } = req.params as { id: string };

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

    const [course] = await db
      .select()
      .from(courses)
      .where(eq(courses.id, cls.courseId));
    const [semester] = await db
      .select()
      .from(semesters)
      .where(eq(semesters.id, cls.semesterId));

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
        course,
        semester,
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
