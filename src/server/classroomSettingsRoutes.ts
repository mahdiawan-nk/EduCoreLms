import crypto from 'crypto';
import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq, and, desc, ilike, or, inArray, sql } from 'drizzle-orm';
import { db } from '../db/index.ts';
import {
  classrooms,
  classroomInstructors,
  classroomJoinCodes,
  classroomEnrollmentPolicies,
  classroomEnrollments,
  classroomTopics,
  learningMaterials,
  assignments,
  assignmentSubmissions,
  assessments,
  assessmentAttempts,
  classroomAuditLogs,
  academicPeriods,
  users,
  userProfiles,
} from '../db/schema.ts';
import {
  authenticateRequest,
  sendSuccess,
  sendError,
  checkClassroomAccess,
  recordAuditLog,
} from './security.ts';
import { resolveClassroomRole, recordClassroomAudit } from './classroomWorkspaceRoutes.ts';

function generateSecureJoinCode(): string {
  const token = crypto.randomBytes(4).toString('hex').toUpperCase().slice(0, 6);
  return `PKM-${token}`;
}

export async function registerClassroomSettingsRoutes(fastify: FastifyInstance) {
  // =========================================================================
  // 1. GET /api/v1/classrooms/:id/settings — Full Settings Center Payload
  // =========================================================================
  fastify.get('/api/v1/classrooms/:id/settings', async (req, reply) => {
    const user = await authenticateRequest(req, reply);
    if (!user) return;

    const { id } = req.params as { id: string };
    const access = await checkClassroomAccess(user, id);
    if (!access.canManage) {
      return sendError(
        reply,
        403,
        'FORBIDDEN',
        'Hanya pengajar atau administrator yang dapat mengakses pengaturan ruang kelas.'
      );
    }

    const [cls] = await db.select().from(classrooms).where(eq(classrooms.id, id));
    if (!cls) {
      return sendError(reply, 404, 'CLASSROOM_NOT_FOUND', 'Ruang kelas tidak ditemukan.');
    }

    const roleInfo = await resolveClassroomRole(user, id);

    const [creator] = await db
      .select({ id: users.id, fullName: users.fullName, email: users.email })
      .from(users)
      .where(eq(users.id, cls.createdById));

    let academicPeriod: { id: string; name: string; academicYear: string } | null = null;
    if (cls.academicPeriodId) {
      const [ap] = await db
        .select({
          id: academicPeriods.id,
          name: academicPeriods.name,
          academicYear: academicPeriods.academicYear,
        })
        .from(academicPeriods)
        .where(eq(academicPeriods.id, cls.academicPeriodId));
      academicPeriod = ap || null;
    }

    const [policy] = await db
      .select()
      .from(classroomEnrollmentPolicies)
      .where(eq(classroomEnrollmentPolicies.classroomId, id));

    const joinCodes = await db
      .select({
        id: classroomJoinCodes.id,
        code: classroomJoinCodes.code,
        isActive: classroomJoinCodes.isActive,
        maxUses: classroomJoinCodes.maxUses,
        usesCount: classroomJoinCodes.usesCount,
        revokedAt: classroomJoinCodes.revokedAt,
        expiresAt: classroomJoinCodes.expiresAt,
        createdAt: classroomJoinCodes.createdAt,
        createdByName: users.fullName,
      })
      .from(classroomJoinCodes)
      .leftJoin(users, eq(classroomJoinCodes.createdById, users.id))
      .where(eq(classroomJoinCodes.classroomId, id))
      .orderBy(desc(classroomJoinCodes.createdAt));

    const activeJoinCode = joinCodes.find((jc) => jc.isActive && !jc.revokedAt) || null;

    const instructors = await db
      .select({
        id: classroomInstructors.id,
        instructorId: classroomInstructors.instructorId,
        isPrimary: classroomInstructors.isPrimary,
        role: classroomInstructors.role,
        permissionScopes: classroomInstructors.permissionScopes,
        status: classroomInstructors.status,
        assignedAt: classroomInstructors.assignedAt,
        fullName: users.fullName,
        email: users.email,
        identityNumber: users.identityNumber,
        academicTitle: userProfiles.academicTitle,
      })
      .from(classroomInstructors)
      .innerJoin(users, eq(classroomInstructors.instructorId, users.id))
      .leftJoin(userProfiles, eq(users.id, userProfiles.userId))
      .where(eq(classroomInstructors.classroomId, id));

    const enrollments = await db
      .select({
        id: classroomEnrollments.id,
        studentId: classroomEnrollments.studentId,
        status: classroomEnrollments.status,
        enrollmentSource: classroomEnrollments.enrollmentSource,
        joinCodeUsed: classroomEnrollments.joinCodeUsed,
        rejectionReason: classroomEnrollments.rejectionReason,
        enrolledAt: classroomEnrollments.enrolledAt,
        fullName: users.fullName,
        email: users.email,
        identityNumber: users.identityNumber,
        studyProgram: userProfiles.studyProgram,
      })
      .from(classroomEnrollments)
      .innerJoin(users, eq(classroomEnrollments.studentId, users.id))
      .leftJoin(userProfiles, eq(users.id, userProfiles.userId))
      .where(eq(classroomEnrollments.classroomId, id))
      .orderBy(desc(classroomEnrollments.enrolledAt));

    const activeCount = enrollments.filter(
      (e) => e.status === 'active' || e.status === 'completed'
    ).length;
    const pendingCount = enrollments.filter((e) => e.status === 'pending').length;
    const maxCap = cls.maxCapacity || cls.capacity || 35;

    return sendSuccess(reply, {
      classroom: {
        id: cls.id,
        name: cls.name,
        classroomCode: cls.classroomCode,
        subjectName: cls.subjectName,
        subjectCode: cls.subjectCode,
        section: cls.section,
        cohort: cls.cohort,
        academicYear: cls.academicYear,
        semesterName: cls.semesterName,
        description: cls.description,
        cpmk: cls.cpmk,
        capacity: cls.capacity,
        minCapacity: cls.minCapacity,
        maxCapacity: cls.maxCapacity,
        enrollmentPolicy: cls.enrollmentPolicy,
        visibility: cls.visibility,
        lifecycleStatus: cls.lifecycleStatus,
        status: cls.status,
        coverImagePath: cls.coverImagePath,
        coverThumbnailPath: cls.coverThumbnailPath,
        coverWidth: cls.coverWidth,
        coverHeight: cls.coverHeight,
        coverFileSize: cls.coverFileSize,
        privacyConfig: cls.privacyConfig,
        notificationConfig: cls.notificationConfig,
        createdAt: cls.createdAt,
        updatedAt: cls.updatedAt,
        archivedAt: cls.archivedAt,
        creator: creator || null,
        academicPeriod,
      },
      dashboardStats: {
        totalEnrolledStudents: activeCount,
        maxCapacity: maxCap,
        availableCapacity: Math.max(0, maxCap - activeCount),
        pendingRequests: pendingCount,
        instructorCount: instructors.length,
        joinCodeActive: Boolean(activeJoinCode),
        activeJoinCode: activeJoinCode?.code || null,
        lifecycleStatus: cls.lifecycleStatus,
      },
      enrollmentPolicy: policy || null,
      joinCodes: {
        active: activeJoinCode,
        history: joinCodes,
      },
      instructors,
      enrollments,
      actorRole: roleInfo,
    });
  });

  // =========================================================================
  // 2. PATCH /api/v1/classrooms/:id/settings — Section-Based Updates
  // =========================================================================
  const patchSettingsSchema = z.object({
    section: z.enum(['identity', 'enrollment', 'privacy', 'notifications']),
    payload: z.record(z.string(), z.unknown()),
  });

  fastify.patch('/api/v1/classrooms/:id/settings', async (req, reply) => {
    const user = await authenticateRequest(req, reply);
    if (!user) return;

    const { id } = req.params as { id: string };
    const access = await checkClassroomAccess(user, id);
    if (!access.canManage) {
      return sendError(reply, 403, 'FORBIDDEN', 'Akses ditolak.');
    }

    const roleInfo = await resolveClassroomRole(user, id);
    const [existing] = await db.select().from(classrooms).where(eq(classrooms.id, id));
    if (!existing) {
      return sendError(reply, 404, 'CLASSROOM_NOT_FOUND', 'Ruang kelas tidak ditemukan.');
    }

    if (
      roleInfo.role === 'CO_INSTRUCTOR' &&
      !roleInfo.canManageAll &&
      !user.permissions.includes('classroom.settings')
    ) {
      // Check instructor's own permissionScopes
      const [instRow] = await db
        .select({ permissionScopes: classroomInstructors.permissionScopes })
        .from(classroomInstructors)
        .where(
          and(
            eq(classroomInstructors.classroomId, id),
            eq(classroomInstructors.instructorId, user.id)
          )
        );
      const scopes = Array.isArray(instRow?.permissionScopes) ? instRow.permissionScopes : [];
      if (!scopes.includes('manage_settings') && !scopes.includes('all')) {
        return sendError(
          reply,
          403,
          'FORBIDDEN_SETTINGS_PERMISSION',
          'Co-Instructor tidak memiliki izin untuk mengubah pengaturan ruang kelas.'
        );
      }
    }

    const parsed = patchSettingsSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(reply, 400, 'VALIDATION_ERROR', 'Format pengaturan tidak valid.', parsed.error.issues);
    }

    const { section, payload } = parsed.data;
    let beforeVal: Record<string, unknown> = {};
    let afterVal: Record<string, unknown> = {};
    let summary = '';

    const [updated] = await db.transaction(async (tx) => {
      if (section === 'identity') {
        const p = z
          .object({
            name: z.string().min(2).max(200).optional(),
            classroomCode: z.string().max(60).optional().nullable(),
            subjectName: z.string().max(200).optional().nullable(),
            section: z.string().min(1).max(40).optional(),
            description: z.string().max(20000).optional().nullable(),
            cpmk: z.string().max(10000).optional().nullable(),
            coverImagePath: z.string().max(500).optional().nullable(),
            coverThumbnailPath: z.string().max(500).optional().nullable(),
            coverMimeType: z.string().max(100).optional().nullable(),
            coverFileSize: z.number().int().optional().nullable(),
            coverWidth: z.number().int().optional().nullable(),
            coverHeight: z.number().int().optional().nullable(),
          })
          .parse(payload);

        beforeVal = {
          name: existing.name,
          classroomCode: existing.classroomCode,
          subjectName: existing.subjectName,
          section: existing.section,
          cpmk: existing.cpmk,
          coverImagePath: existing.coverImagePath,
        };
        const [row] = await tx
          .update(classrooms)
          .set({
            ...(p.name !== undefined ? { name: p.name } : {}),
            ...(p.classroomCode !== undefined ? { classroomCode: p.classroomCode } : {}),
            ...(p.subjectName !== undefined ? { subjectName: p.subjectName } : {}),
            ...(p.section !== undefined ? { section: p.section } : {}),
            ...(p.description !== undefined ? { description: p.description } : {}),
            ...(p.cpmk !== undefined ? { cpmk: p.cpmk } : {}),
            ...(p.coverImagePath !== undefined ? { coverImagePath: p.coverImagePath } : {}),
            ...(p.coverThumbnailPath !== undefined ? { coverThumbnailPath: p.coverThumbnailPath } : {}),
            ...(p.coverMimeType !== undefined ? { coverMimeType: p.coverMimeType } : {}),
            ...(p.coverFileSize !== undefined ? { coverFileSize: p.coverFileSize } : {}),
            ...(p.coverWidth !== undefined ? { coverWidth: p.coverWidth } : {}),
            ...(p.coverHeight !== undefined ? { coverHeight: p.coverHeight } : {}),
            ...(p.coverImagePath !== undefined ? { coverUpdatedAt: new Date() } : {}),
            updatedAt: new Date(),
          })
          .where(eq(classrooms.id, id))
          .returning();
        afterVal = {
          name: row.name,
          classroomCode: row.classroomCode,
          subjectName: row.subjectName,
          section: row.section,
          cpmk: row.cpmk,
        };
        summary = `Memperbarui identitas kelas "${row.name}"`;
        return [row];
      }

      if (section === 'enrollment') {
        const p = z
          .object({
            enrollmentPolicy: z
              .enum(['AUTO', 'APPROVAL_REQUIRED', 'INVITATION_ONLY', 'INSTRUCTOR_MANAGED'])
              .optional(),
            capacity: z.number().int().min(1).max(1000).optional(),
            allowLateEnrollment: z.boolean().optional(),
            waitingListEnabled: z.boolean().optional(),
          })
          .parse(payload);

        beforeVal = {
          enrollmentPolicy: existing.enrollmentPolicy,
          capacity: existing.capacity,
        };

        const [row] = await tx
          .update(classrooms)
          .set({
            ...(p.enrollmentPolicy !== undefined ? { enrollmentPolicy: p.enrollmentPolicy } : {}),
            ...(p.capacity !== undefined
              ? { capacity: p.capacity, maxCapacity: p.capacity }
              : {}),
            updatedAt: new Date(),
          })
          .where(eq(classrooms.id, id))
          .returning();

        const [existingPolicy] = await tx
          .select()
          .from(classroomEnrollmentPolicies)
          .where(eq(classroomEnrollmentPolicies.classroomId, id));

        if (existingPolicy) {
          await tx
            .update(classroomEnrollmentPolicies)
            .set({
              ...(p.enrollmentPolicy !== undefined ? { enrollmentMode: p.enrollmentPolicy } : {}),
              ...(p.capacity !== undefined ? { maxParticipants: p.capacity } : {}),
              ...(p.allowLateEnrollment !== undefined
                ? { allowLateEnrollment: p.allowLateEnrollment }
                : {}),
              ...(p.waitingListEnabled !== undefined
                ? { waitingListEnabled: p.waitingListEnabled }
                : {}),
              updatedAt: new Date(),
            })
            .where(eq(classroomEnrollmentPolicies.classroomId, id));
        }

        afterVal = {
          enrollmentPolicy: row.enrollmentPolicy,
          capacity: row.capacity,
        };
        summary = `Memperbarui kebijakan pendaftaran (${row.enrollmentPolicy}, kapasitas ${row.capacity})`;
        return [row];
      }

      if (section === 'privacy') {
        beforeVal = {
          visibility: existing.visibility,
          privacyConfig: existing.privacyConfig,
        };
        const nextVisibility =
          typeof payload.contentVisibility === 'string'
            ? payload.contentVisibility
            : existing.visibility;
        const nextPrivacy = {
          ...(typeof existing.privacyConfig === 'object' && existing.privacyConfig
            ? existing.privacyConfig
            : {}),
          ...payload,
        };
        const [row] = await tx
          .update(classrooms)
          .set({
            visibility: nextVisibility,
            privacyConfig: nextPrivacy,
            updatedAt: new Date(),
          })
          .where(eq(classrooms.id, id))
          .returning();
        afterVal = { visibility: row.visibility, privacyConfig: row.privacyConfig };
        summary = 'Memperbarui pengaturan keamanan & privasi ruang kelas';
        return [row];
      }

      // notifications
      beforeVal = { notificationConfig: existing.notificationConfig };
      const nextNotif = {
        ...(typeof existing.notificationConfig === 'object' && existing.notificationConfig
          ? existing.notificationConfig
          : {}),
        ...payload,
      };
      const [row] = await tx
        .update(classrooms)
        .set({
          notificationConfig: nextNotif,
          updatedAt: new Date(),
        })
        .where(eq(classrooms.id, id))
        .returning();
      afterVal = { notificationConfig: row.notificationConfig };
      summary = 'Memperbarui preferensi notifikasi ruang kelas';
      return [row];
    });

    await recordClassroomAudit({
      classroomId: id,
      actorId: user.id,
      actorRole: roleInfo.role,
      resourceType: 'CLASSROOM',
      resourceId: id,
      resourceTitle: updated.name,
      action: 'UPDATED',
      beforeValue: beforeVal,
      afterValue: afterVal,
      changeSummary: summary,
    });

    return sendSuccess(reply, updated);
  });

  // =========================================================================
  // 3. JOIN CODE MANAGEMENT (GET, REGENERATE, REVOKE, PATCH)
  // =========================================================================
  fastify.get('/api/v1/classrooms/:id/join-codes', async (req, reply) => {
    const user = await authenticateRequest(req, reply);
    if (!user) return;

    const { id } = req.params as { id: string };
    const access = await checkClassroomAccess(user, id);
    if (!access.canManage) {
      return sendError(reply, 403, 'FORBIDDEN', 'Akses ditolak.');
    }

    const codes = await db
      .select({
        id: classroomJoinCodes.id,
        code: classroomJoinCodes.code,
        isActive: classroomJoinCodes.isActive,
        maxUses: classroomJoinCodes.maxUses,
        usesCount: classroomJoinCodes.usesCount,
        revokedAt: classroomJoinCodes.revokedAt,
        expiresAt: classroomJoinCodes.expiresAt,
        createdAt: classroomJoinCodes.createdAt,
        createdByName: users.fullName,
      })
      .from(classroomJoinCodes)
      .leftJoin(users, eq(classroomJoinCodes.createdById, users.id))
      .where(eq(classroomJoinCodes.classroomId, id))
      .orderBy(desc(classroomJoinCodes.createdAt));

    return sendSuccess(reply, {
      active: codes.find((c) => c.isActive && !c.revokedAt) || null,
      history: codes,
    });
  });

  fastify.post('/api/v1/classrooms/:id/join-codes/regenerate', async (req, reply) => {
    const user = await authenticateRequest(req, reply);
    if (!user) return;

    const { id } = req.params as { id: string };
    const roleInfo = await resolveClassroomRole(user, id);
    if (!roleInfo.isCreator && roleInfo.role !== 'SUPERADMIN' && !roleInfo.canManageAll) {
      return sendError(
        reply,
        403,
        'FORBIDDEN_JOIN_CODE_CONTROL',
        'Hanya pembuat kelas atau admin yang dapat membuat ulang Join Code.'
      );
    }

    const body = z
      .object({
        expiresAt: z.string().optional().nullable(),
        maxUses: z.number().int().min(1).max(1000).optional(),
      })
      .safeParse(req.body || {});

    const expiresAtDate =
      body.success && body.data.expiresAt ? new Date(body.data.expiresAt) : null;
    const maxUses = body.success && body.data.maxUses ? body.data.maxUses : 100;

    const newCode = await db.transaction(async (tx) => {
      await tx
        .update(classroomJoinCodes)
        .set({ isActive: false, revokedAt: new Date() })
        .where(
          and(
            eq(classroomJoinCodes.classroomId, id),
            eq(classroomJoinCodes.isActive, true)
          )
        );

      const codeStr = generateSecureJoinCode();
      const [created] = await tx
        .insert(classroomJoinCodes)
        .values({
          classroomId: id,
          code: codeStr,
          isActive: true,
          maxUses,
          expiresAt: expiresAtDate,
          createdById: user.id,
        })
        .returning();

      return created;
    });

    await recordClassroomAudit({
      classroomId: id,
      actorId: user.id,
      actorRole: roleInfo.role,
      resourceType: 'CLASSROOM',
      resourceId: newCode.id,
      resourceTitle: `Join Code ${newCode.code}`,
      action: 'CREATED',
      afterValue: { code: newCode.code, maxUses, expiresAt: expiresAtDate },
      changeSummary: `Membuat ulang Join Code kelas baru: ${newCode.code}`,
    });

    return sendSuccess(reply, newCode);
  });

  fastify.post('/api/v1/classrooms/:id/join-codes/revoke', async (req, reply) => {
    const user = await authenticateRequest(req, reply);
    if (!user) return;

    const { id } = req.params as { id: string };
    const roleInfo = await resolveClassroomRole(user, id);
    if (!roleInfo.isCreator && roleInfo.role !== 'SUPERADMIN' && !roleInfo.canManageAll) {
      return sendError(
        reply,
        403,
        'FORBIDDEN_JOIN_CODE_CONTROL',
        'Hanya pembuat kelas atau admin yang dapat mencabut Join Code.'
      );
    }

    await db
      .update(classroomJoinCodes)
      .set({ isActive: false, revokedAt: new Date() })
      .where(
        and(
          eq(classroomJoinCodes.classroomId, id),
          eq(classroomJoinCodes.isActive, true)
        )
      );

    await recordClassroomAudit({
      classroomId: id,
      actorId: user.id,
      actorRole: roleInfo.role,
      resourceType: 'CLASSROOM',
      resourceId: id,
      resourceTitle: 'Join Code Kelas',
      action: 'ARCHIVED',
      changeSummary: 'Mencabut seluruh Join Code kelas aktif',
    });

    return sendSuccess(reply, { revoked: true });
  });

  fastify.patch('/api/v1/classrooms/:id/join-codes/:codeId', async (req, reply) => {
    const user = await authenticateRequest(req, reply);
    if (!user) return;

    const { id, codeId } = req.params as { id: string; codeId: string };
    const roleInfo = await resolveClassroomRole(user, id);
    if (!roleInfo.isCreator && roleInfo.role !== 'SUPERADMIN' && !roleInfo.canManageAll) {
      return sendError(reply, 403, 'FORBIDDEN', 'Akses ditolak.');
    }

    const [existing] = await db
      .select()
      .from(classroomJoinCodes)
      .where(and(eq(classroomJoinCodes.id, codeId), eq(classroomJoinCodes.classroomId, id)));
    if (!existing) {
      return sendError(reply, 404, 'JOIN_CODE_NOT_FOUND', 'Kode gabung tidak ditemukan.');
    }
    if (existing.revokedAt) {
      return sendError(
        reply,
        400,
        'JOIN_CODE_REVOKED',
        'Kode yang sudah dicabut tidak dapat diaktifkan kembali.'
      );
    }

    const parsed = z
      .object({
        isActive: z.boolean().optional(),
        expiresAt: z.string().nullable().optional(),
      })
      .safeParse(req.body);
    if (!parsed.success) {
      return sendError(reply, 400, 'VALIDATION_ERROR', 'Input tidak valid.');
    }

    const [updated] = await db
      .update(classroomJoinCodes)
      .set({
        ...(parsed.data.isActive !== undefined ? { isActive: parsed.data.isActive } : {}),
        ...(parsed.data.expiresAt !== undefined
          ? { expiresAt: parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null }
          : {}),
      })
      .where(eq(classroomJoinCodes.id, codeId))
      .returning();

    return sendSuccess(reply, updated);
  });

  // =========================================================================
  // 4. ENROLLMENT REQUEST MANAGEMENT
  // =========================================================================
  fastify.get('/api/v1/classrooms/:id/enrollment-requests', async (req, reply) => {
    const user = await authenticateRequest(req, reply);
    if (!user) return;

    const { id } = req.params as { id: string };
    const access = await checkClassroomAccess(user, id);
    if (!access.canManage) {
      return sendError(reply, 403, 'FORBIDDEN', 'Akses ditolak.');
    }

    const { status, search } = req.query as { status?: string; search?: string };
    let rows = await db
      .select({
        id: classroomEnrollments.id,
        studentId: classroomEnrollments.studentId,
        status: classroomEnrollments.status,
        enrollmentSource: classroomEnrollments.enrollmentSource,
        rejectionReason: classroomEnrollments.rejectionReason,
        enrolledAt: classroomEnrollments.enrolledAt,
        fullName: users.fullName,
        email: users.email,
        identityNumber: users.identityNumber,
        studyProgram: userProfiles.studyProgram,
      })
      .from(classroomEnrollments)
      .innerJoin(users, eq(classroomEnrollments.studentId, users.id))
      .leftJoin(userProfiles, eq(users.id, userProfiles.userId))
      .where(eq(classroomEnrollments.classroomId, id))
      .orderBy(desc(classroomEnrollments.enrolledAt));

    if (status && status !== 'ALL') {
      rows = rows.filter((r) => r.status === status);
    }
    if (search?.trim()) {
      const q = search.trim().toLowerCase();
      rows = rows.filter(
        (r) =>
          r.fullName.toLowerCase().includes(q) ||
          (r.identityNumber || '').toLowerCase().includes(q) ||
          r.email.toLowerCase().includes(q)
      );
    }

    return sendSuccess(reply, { requests: rows });
  });

  fastify.post(
    '/api/v1/classrooms/:id/enrollment-requests/:requestId/approve',
    async (req, reply) => {
      const user = await authenticateRequest(req, reply);
      if (!user) return;

      const { id, requestId } = req.params as { id: string; requestId: string };
      const access = await checkClassroomAccess(user, id);
      if (!access.canManage) {
        return sendError(reply, 403, 'FORBIDDEN', 'Akses ditolak.');
      }

      const roleInfo = await resolveClassroomRole(user, id);

      const result = await db.transaction(async (tx) => {
        const [cls] = await tx.select().from(classrooms).where(eq(classrooms.id, id));
        if (!cls) return { error: 'CLASSROOM_NOT_FOUND' as const };

        const [enrollment] = await tx
          .select()
          .from(classroomEnrollments)
          .where(
            and(
              eq(classroomEnrollments.id, requestId),
              eq(classroomEnrollments.classroomId, id)
            )
          );
        if (!enrollment) return { error: 'ENROLLMENT_NOT_FOUND' as const };

        const activeRows = await tx
          .select({ id: classroomEnrollments.id })
          .from(classroomEnrollments)
          .where(
            and(
              eq(classroomEnrollments.classroomId, id),
              or(
                eq(classroomEnrollments.status, 'active'),
                eq(classroomEnrollments.status, 'completed')
              )
            )
          );
        const maxCap = cls.maxCapacity || cls.capacity || 35;
        if (activeRows.length >= maxCap) {
          return { error: 'CAPACITY_FULL' as const };
        }

        const prevHistory = Array.isArray(enrollment.statusHistory)
          ? enrollment.statusHistory
          : [];
        const [updated] = await tx
          .update(classroomEnrollments)
          .set({
            status: 'active',
            approvedById: user.id,
            statusHistory: [
              ...prevHistory,
              {
                from: enrollment.status,
                to: 'active',
                by: user.id,
                at: new Date().toISOString(),
              },
            ],
            updatedAt: new Date(),
          })
          .where(eq(classroomEnrollments.id, requestId))
          .returning();

        return { updated };
      });

      if ('error' in result) {
        if (result.error === 'CAPACITY_FULL') {
          return sendError(reply, 400, 'CAPACITY_FULL', 'Kapasitas kelas sudah penuh.');
        }
        return sendError(reply, 404, result.error ?? 'NOT_FOUND', 'Data pendaftaran tidak ditemukan.');
      }

      await recordClassroomAudit({
        classroomId: id,
        actorId: user.id,
        actorRole: roleInfo.role,
        resourceType: 'CLASSROOM',
        resourceId: requestId,
        resourceTitle: 'Persetujuan Pendaftaran',
        action: 'UPDATED',
        afterValue: { status: 'active' },
        changeSummary: `Menyetujui permintaan pendaftaran mahasiswa (${requestId})`,
      });

      return sendSuccess(reply, result.updated);
    }
  );

  fastify.post(
    '/api/v1/classrooms/:id/enrollment-requests/:requestId/reject',
    async (req, reply) => {
      const user = await authenticateRequest(req, reply);
      if (!user) return;

      const { id, requestId } = req.params as { id: string; requestId: string };
      const access = await checkClassroomAccess(user, id);
      if (!access.canManage) {
        return sendError(reply, 403, 'FORBIDDEN', 'Akses ditolak.');
      }

      const roleInfo = await resolveClassroomRole(user, id);
      const parsed = z.object({ reason: z.string().max(500).optional() }).safeParse(req.body || {});
      const reason = parsed.success ? parsed.data.reason || null : null;

      const [existing] = await db
        .select()
        .from(classroomEnrollments)
        .where(
          and(
            eq(classroomEnrollments.id, requestId),
            eq(classroomEnrollments.classroomId, id)
          )
        );
      if (!existing) {
        return sendError(reply, 404, 'ENROLLMENT_NOT_FOUND', 'Data pendaftaran tidak ditemukan.');
      }

      const prevHistory = Array.isArray(existing.statusHistory) ? existing.statusHistory : [];
      const [updated] = await db
        .update(classroomEnrollments)
        .set({
          status: 'rejected',
          rejectionReason: reason,
          statusHistory: [
            ...prevHistory,
            {
              from: existing.status,
              to: 'rejected',
              by: user.id,
              reason,
              at: new Date().toISOString(),
            },
          ],
          updatedAt: new Date(),
        })
        .where(eq(classroomEnrollments.id, requestId))
        .returning();

      await recordClassroomAudit({
        classroomId: id,
        actorId: user.id,
        actorRole: roleInfo.role,
        resourceType: 'CLASSROOM',
        resourceId: requestId,
        resourceTitle: 'Penolakan Pendaftaran',
        action: 'UPDATED',
        afterValue: { status: 'rejected', reason },
        changeSummary: `Menolak permintaan pendaftaran mahasiswa (${requestId})`,
      });

      return sendSuccess(reply, updated);
    }
  );

  // =========================================================================
  // 5. TIM PENGAJAR (INSTRUCTORS & PERMISSION MATRIX)
  // =========================================================================
  fastify.get('/api/v1/classrooms/:id/instructors', async (req, reply) => {
    const user = await authenticateRequest(req, reply);
    if (!user) return;

    const { id } = req.params as { id: string };
    const access = await checkClassroomAccess(user, id);
    if (!access.canManage) {
      return sendError(reply, 403, 'FORBIDDEN', 'Akses ditolak.');
    }

    const rows = await db
      .select({
        id: classroomInstructors.id,
        instructorId: classroomInstructors.instructorId,
        isPrimary: classroomInstructors.isPrimary,
        role: classroomInstructors.role,
        permissionScopes: classroomInstructors.permissionScopes,
        status: classroomInstructors.status,
        assignedAt: classroomInstructors.assignedAt,
        fullName: users.fullName,
        email: users.email,
        identityNumber: users.identityNumber,
        academicTitle: userProfiles.academicTitle,
      })
      .from(classroomInstructors)
      .innerJoin(users, eq(classroomInstructors.instructorId, users.id))
      .leftJoin(userProfiles, eq(users.id, userProfiles.userId))
      .where(eq(classroomInstructors.classroomId, id));

    return sendSuccess(reply, { instructors: rows });
  });

  fastify.post('/api/v1/classrooms/:id/instructors', async (req, reply) => {
    const user = await authenticateRequest(req, reply);
    if (!user) return;

    const { id } = req.params as { id: string };
    const roleInfo = await resolveClassroomRole(user, id);
    if (!roleInfo.isCreator && roleInfo.role !== 'SUPERADMIN') {
      return sendError(
        reply,
        403,
        'FORBIDDEN_CREATOR_ONLY',
        'Hanya pembuat kelas atau Superadmin yang dapat menambahkan Co-Instructor.'
      );
    }

    const parsed = z
      .object({
        email: z.string().email(),
        permissionScopes: z.array(z.string()).default(['manage_modules', 'manage_materials']),
      })
      .safeParse(req.body);
    if (!parsed.success) {
      return sendError(reply, 400, 'VALIDATION_ERROR', 'Email pengajar tidak valid.');
    }

    const [targetUser] = await db
      .select()
      .from(users)
      .where(eq(users.email, parsed.data.email.trim().toLowerCase()));
    if (!targetUser) {
      return sendError(reply, 404, 'USER_NOT_FOUND', 'Pengguna dengan email tersebut tidak ditemukan.');
    }

    const [existing] = await db
      .select()
      .from(classroomInstructors)
      .where(
        and(
          eq(classroomInstructors.classroomId, id),
          eq(classroomInstructors.instructorId, targetUser.id)
        )
      );
    if (existing) {
      return sendError(reply, 409, 'ALREADY_ASSIGNED', 'Pengajar sudah tergabung di kelas ini.');
    }

    const [created] = await db
      .insert(classroomInstructors)
      .values({
        classroomId: id,
        instructorId: targetUser.id,
        isPrimary: false,
        role: 'CO_INSTRUCTOR',
        permissionScopes: parsed.data.permissionScopes,
      })
      .returning();

    await recordClassroomAudit({
      classroomId: id,
      actorId: user.id,
      actorRole: roleInfo.role,
      resourceType: 'CLASSROOM',
      resourceId: created.id,
      resourceTitle: targetUser.fullName,
      action: 'CREATED',
      afterValue: { instructorId: targetUser.id, permissionScopes: parsed.data.permissionScopes },
      changeSummary: `Menambahkan Co-Instructor "${targetUser.fullName}"`,
    });

    return sendSuccess(reply, created, null, 201);
  });

  fastify.patch('/api/v1/classrooms/:id/instructors/:instructorId', async (req, reply) => {
    const user = await authenticateRequest(req, reply);
    if (!user) return;

    const { id, instructorId } = req.params as { id: string; instructorId: string };
    const roleInfo = await resolveClassroomRole(user, id);
    if (!roleInfo.isCreator && roleInfo.role !== 'SUPERADMIN') {
      return sendError(
        reply,
        403,
        'FORBIDDEN_CREATOR_ONLY',
        'Hanya pembuat kelas atau Superadmin yang dapat mengubah izin tim pengajar.'
      );
    }

    const [cls] = await db.select().from(classrooms).where(eq(classrooms.id, id));
    if (cls && cls.createdById === instructorId) {
      return sendError(
        reply,
        400,
        'CANNOT_MODIFY_CREATOR',
        'Otoritas pembuat kelas asli tidak dapat dikurangi atau diganti.'
      );
    }

    const parsed = z
      .object({
        permissionScopes: z.array(z.string()),
      })
      .safeParse(req.body);
    if (!parsed.success) {
      return sendError(reply, 400, 'VALIDATION_ERROR', 'Daftar izin tidak valid.');
    }

    const [existing] = await db
      .select()
      .from(classroomInstructors)
      .where(
        and(
          eq(classroomInstructors.classroomId, id),
          eq(classroomInstructors.instructorId, instructorId)
        )
      );
    if (!existing) {
      return sendError(reply, 404, 'INSTRUCTOR_NOT_FOUND', 'Pengajar tidak ditemukan di kelas ini.');
    }

    const [updated] = await db
      .update(classroomInstructors)
      .set({ permissionScopes: parsed.data.permissionScopes })
      .where(eq(classroomInstructors.id, existing.id))
      .returning();

    await recordClassroomAudit({
      classroomId: id,
      actorId: user.id,
      actorRole: roleInfo.role,
      resourceType: 'CLASSROOM',
      resourceId: existing.id,
      resourceTitle: `Izin Co-Instructor`,
      action: 'UPDATED',
      beforeValue: { permissionScopes: existing.permissionScopes },
      afterValue: { permissionScopes: updated.permissionScopes },
      changeSummary: `Memperbarui matriks izin Co-Instructor (${instructorId})`,
    });

    return sendSuccess(reply, updated);
  });

  fastify.delete('/api/v1/classrooms/:id/instructors/:instructorId', async (req, reply) => {
    const user = await authenticateRequest(req, reply);
    if (!user) return;

    const { id, instructorId } = req.params as { id: string; instructorId: string };
    const roleInfo = await resolveClassroomRole(user, id);
    if (!roleInfo.isCreator && roleInfo.role !== 'SUPERADMIN') {
      return sendError(
        reply,
        403,
        'FORBIDDEN_CREATOR_ONLY',
        'Hanya pembuat kelas atau Superadmin yang dapat menghapus Co-Instructor.'
      );
    }

    const [cls] = await db.select().from(classrooms).where(eq(classrooms.id, id));
    if (cls && cls.createdById === instructorId) {
      return sendError(
        reply,
        400,
        'CANNOT_REMOVE_CREATOR',
        'Pembuat kelas asli tidak dapat dihapus dari ruang kelas.'
      );
    }

    await db
      .delete(classroomInstructors)
      .where(
        and(
          eq(classroomInstructors.classroomId, id),
          eq(classroomInstructors.instructorId, instructorId)
        )
      );

    await recordClassroomAudit({
      classroomId: id,
      actorId: user.id,
      actorRole: roleInfo.role,
      resourceType: 'CLASSROOM',
      resourceId: instructorId,
      resourceTitle: 'Hapus Co-Instructor',
      action: 'DELETED',
      changeSummary: `Menghapus Co-Instructor (${instructorId}) dari ruang kelas`,
    });

    return sendSuccess(reply, { removed: true });
  });

  // =========================================================================
  // 6. SETTINGS AUDIT HISTORY
  // =========================================================================
  fastify.get('/api/v1/classrooms/:id/settings-history', async (req, reply) => {
    const user = await authenticateRequest(req, reply);
    if (!user) return;

    const { id } = req.params as { id: string };
    const access = await checkClassroomAccess(user, id);
    if (!access.canManage) {
      return sendError(reply, 403, 'FORBIDDEN', 'Akses ditolak.');
    }

    const { page = '1', limit = '20', action, search } = req.query as {
      page?: string;
      limit?: string;
      action?: string;
      search?: string;
    };
    const p = Math.max(1, Number(page) || 1);
    const l = Math.min(100, Math.max(1, Number(limit) || 20));
    const offset = (p - 1) * l;

    const conditions = [
      eq(classroomAuditLogs.classroomId, id),
      eq(classroomAuditLogs.resourceType, 'CLASSROOM'),
    ];
    if (action && action !== 'ALL') {
      conditions.push(eq(classroomAuditLogs.action, action));
    }
    if (search?.trim()) {
      conditions.push(
        or(
          ilike(classroomAuditLogs.resourceTitle, `%${search.trim()}%`),
          ilike(classroomAuditLogs.changeSummary, `%${search.trim()}%`)
        )!
      );
    }

    const [countRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(classroomAuditLogs)
      .where(and(...conditions));

    const items = await db
      .select({
        id: classroomAuditLogs.id,
        action: classroomAuditLogs.action,
        resourceType: classroomAuditLogs.resourceType,
        resourceTitle: classroomAuditLogs.resourceTitle,
        actorRole: classroomAuditLogs.actorRole,
        beforeValue: classroomAuditLogs.beforeValue,
        afterValue: classroomAuditLogs.afterValue,
        changeSummary: classroomAuditLogs.changeSummary,
        createdAt: classroomAuditLogs.createdAt,
        actorName: users.fullName,
      })
      .from(classroomAuditLogs)
      .leftJoin(users, eq(classroomAuditLogs.actorId, users.id))
      .where(and(...conditions))
      .orderBy(desc(classroomAuditLogs.createdAt))
      .limit(l)
      .offset(offset);

    const total = countRow?.count || 0;
    return sendSuccess(reply, {
      items,
      pagination: { page: p, limit: l, total, totalPages: Math.ceil(total / l) },
    });
  });

  // =========================================================================
  // 7. CLASSROOM LIFECYCLE: ARCHIVE, RESTORE, DELETION IMPACT, CONTROLLED DELETE
  // =========================================================================
  fastify.post('/api/v1/classrooms/:id/restore', async (req, reply) => {
    const user = await authenticateRequest(req, reply);
    if (!user) return;

    const { id } = req.params as { id: string };
    const roleInfo = await resolveClassroomRole(user, id);
    if (!roleInfo.isCreator && roleInfo.role !== 'SUPERADMIN') {
      return sendError(
        reply,
        403,
        'FORBIDDEN_CREATOR_ONLY',
        'Hanya pembuat kelas atau Superadmin yang dapat memulihkan kelas.'
      );
    }

    const [updated] = await db
      .update(classrooms)
      .set({
        lifecycleStatus: 'active',
        status: 'ACTIVE',
        archivedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(classrooms.id, id))
      .returning();

    if (!updated) {
      return sendError(reply, 404, 'CLASSROOM_NOT_FOUND', 'Ruang kelas tidak ditemukan.');
    }

    await recordClassroomAudit({
      classroomId: id,
      actorId: user.id,
      actorRole: roleInfo.role,
      resourceType: 'CLASSROOM',
      resourceId: id,
      resourceTitle: updated.name,
      action: 'RESTORED',
      beforeValue: { lifecycleStatus: 'archived' },
      afterValue: { lifecycleStatus: 'active' },
      changeSummary: `Memulihkan ruang kelas "${updated.name}" dari arsip`,
    });

    return sendSuccess(reply, updated);
  });

  fastify.get('/api/v1/classrooms/:id/deletion-impact', async (req, reply) => {
    const user = await authenticateRequest(req, reply);
    if (!user) return;

    const { id } = req.params as { id: string };
    const roleInfo = await resolveClassroomRole(user, id);
    if (!roleInfo.isCreator && roleInfo.role !== 'SUPERADMIN') {
      return sendError(reply, 403, 'FORBIDDEN', 'Akses ditolak.');
    }

    const [enrollCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(classroomEnrollments)
      .where(eq(classroomEnrollments.classroomId, id));

    const [matCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(learningMaterials)
      .where(eq(learningMaterials.classroomId, id));

    const asgRows = await db
      .select({ id: assignments.id })
      .from(assignments)
      .where(eq(assignments.classroomId, id));
    const asgIds = asgRows.map((a) => a.id);
    const subRows =
      asgIds.length > 0
        ? await db
            .select({ isGradePublished: assignmentSubmissions.isGradePublished })
            .from(assignmentSubmissions)
            .where(inArray(assignmentSubmissions.assignmentId, asgIds))
        : [];

    const asmRows = await db
      .select({ id: assessments.id })
      .from(assessments)
      .where(eq(assessments.classroomId, id));
    const asmIds = asmRows.map((a) => a.id);
    const attRows =
      asmIds.length > 0
        ? await db
            .select({ id: assessmentAttempts.id })
            .from(assessmentAttempts)
            .where(inArray(assessmentAttempts.assessmentId, asmIds))
        : [];

    const publishedGradesCount = subRows.filter((s) => s.isGradePublished).length;

    return sendSuccess(reply, {
      enrolledStudents: enrollCount?.count || 0,
      materials: matCount?.count || 0,
      assignments: asgRows.length,
      submissions: subRows.length,
      publishedGrades: publishedGradesCount,
      assessments: asmRows.length,
      assessmentAttempts: attRows.length,
      hasAcademicHistory:
        (enrollCount?.count || 0) > 0 ||
        subRows.length > 0 ||
        attRows.length > 0 ||
        publishedGradesCount > 0,
    });
  });

  fastify.delete('/api/v1/classrooms/:id', async (req, reply) => {
    const user = await authenticateRequest(req, reply);
    if (!user) return;

    const { id } = req.params as { id: string };
    const roleInfo = await resolveClassroomRole(user, id);
    if (!roleInfo.isCreator && roleInfo.role !== 'SUPERADMIN') {
      return sendError(
        reply,
        403,
        'FORBIDDEN_CREATOR_ONLY',
        'Hanya pembuat kelas atau Superadmin yang dapat menghapus ruang kelas.'
      );
    }

    const [cls] = await db.select().from(classrooms).where(eq(classrooms.id, id));
    if (!cls) {
      return sendError(reply, 404, 'CLASSROOM_NOT_FOUND', 'Ruang kelas tidak ditemukan.');
    }

    const { confirmForce } = (req.query as { confirmForce?: string }) || {};

    const [enrollCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(classroomEnrollments)
      .where(eq(classroomEnrollments.classroomId, id));

    if ((enrollCount?.count || 0) > 0 && confirmForce !== 'true') {
      return sendError(
        reply,
        409,
        'CLASSROOM_HAS_ACTIVE_RECORDS',
        'Ruang kelas memiliki peserta atau riwayat akademik. Gunakan arsip kelas untuk menjaga integritas data, atau konfirmasi penghapusan paksa.'
      );
    }

    await db.delete(classrooms).where(eq(classrooms.id, id));

    await recordAuditLog({
      actorId: user.id,
      action: 'CLASSROOM_DELETED',
      entityType: 'CLASSROOM',
      entityId: id,
      metadata: { name: cls.name, enrolledStudents: enrollCount?.count || 0 },
      ipAddress: req.ip,
    });

    return sendSuccess(reply, { deleted: true, id });
  });
}
