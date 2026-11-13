import crypto from 'crypto';
import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq, and, desc, asc, or, ilike, ne, inArray } from 'drizzle-orm';
import * as XLSX from 'xlsx';
import { db } from '../db/index.ts';
import {
  users,
  userProfiles,
  userSessions,
  roles,
  permissions,
  userRoles,
  rolePermissions,
  auditLogs,
  classroomEnrollments,
  classroomInstructors,
  passwordResetTokens,
  userImportBatches,
  notifications,
} from '../db/schema.ts';
import {
  generateCryptographicPassword,
  getPasswordPolicyConfig,
  validatePasswordPolicy,
  checkPasswordReuse,
  recordPasswordInHistory,
} from './passwordPolicy.ts';
import {
  authenticateRequest,
  generateRandomToken,
  hashPassword,
  hashSessionToken,
  isAuditorOnly,
  recordAuditLog,
  sendError,
  sendSuccess,
} from './security.ts';

const CANONICAL_ROLES = ['SUPERADMIN', 'DOSEN', 'MAHASISWA', 'AUDITOR'] as const;
const VALID_ACCOUNT_STATUSES = [
  'ACTIVE',
  'INACTIVE',
  'SUSPENDED',
  'PENDING_ACTIVATION',
] as const;

const STUDY_PROGRAMS = [
  'Teknik Informatika',
  'Teknik Pengolahan Sawit',
  'Perawatan dan Perbaikan Mesin',
  'Administrasi Bisnis Internasional',
  'Direktorat Akademik & Sistem Informasi',
];

function parseUserAgentLabel(ua: string | null): string {
  if (!ua) return 'Perangkat Tidak Diketahui';
  if (ua.includes('Edg/')) return 'Microsoft Edge';
  if (ua.includes('Chrome/')) return 'Google Chrome';
  if (ua.includes('Firefox/')) return 'Mozilla Firefox';
  if (ua.includes('Safari/') && !ua.includes('Chrome/')) return 'Apple Safari';
  if (ua.includes('curl')) return 'CLI / API Client';
  return ua.slice(0, 48);
}

async function countActiveSuperadmins(excludeUserId?: string): Promise<number> {
  const rows = await db
    .select({ userId: users.id })
    .from(users)
    .innerJoin(userRoles, eq(userRoles.userId, users.id))
    .innerJoin(roles, eq(userRoles.roleId, roles.id))
    .where(and(eq(roles.code, 'SUPERADMIN'), eq(users.isActive, true)));
  return rows.filter((r) => r.userId !== excludeUserId).length;
}

function canOperatorAssignRole(
  operatorRoles: string[],
  targetRole: string
): boolean {
  const upperOp = operatorRoles.map((r) => r.toUpperCase());
  const upperTarget = targetRole.toUpperCase();
  if (upperOp.includes('SUPERADMIN')) return true;
  if (upperTarget === 'SUPERADMIN') return false;
  return ['DOSEN', 'MAHASISWA', 'AUDITOR'].includes(upperTarget);
}

export async function registerUserManagementRoutes(fastify: FastifyInstance) {
  // ============================================================================
  // 1. LIST USERS WITH SERVER-SIDE SEARCH, FILTERS, SORTING, PAGINATION & STATS
  // ============================================================================
  fastify.get('/api/v1/users', async (req, reply) => {
    const actor = await authenticateRequest(req, reply, {
      anyPermissions: ['users:read', 'users:manage'],
    });
    if (!actor) return;

    const query = req.query as {
      page?: string;
      limit?: string;
      search?: string;
      role?: string;
      studyProgram?: string;
      organizationalUnit?: string;
      status?: string;
      dateFrom?: string;
      dateTo?: string;
      sortBy?: string;
      sortDir?: string;
    };

    const page = Math.max(1, parseInt(query.page || '1', 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(query.limit || '12', 10) || 12));
    const search = (query.search || '').trim().toLowerCase();
    const roleFilter = (query.role || '').trim().toUpperCase();
    const studyProgramFilter = (query.studyProgram || '').trim();
    const orgUnitFilter = (query.organizationalUnit || '').trim();
    const statusFilter = (query.status || '').trim().toUpperCase();
    const dateFrom = query.dateFrom ? new Date(query.dateFrom) : null;
    const dateTo = query.dateTo ? new Date(query.dateTo) : null;
    const sortBy = query.sortBy || 'name';
    const sortDir = query.sortDir === 'desc' ? 'desc' : 'asc';

    const allUsers = await db.select().from(users);
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

    const enrichedAll = allUsers.map((u) => {
      const uRoles = allUserRoles
        .filter((ur) => ur.userId === u.id)
        .map((ur) => ur.roleCode.toUpperCase());
      const prof = profileMap.get(u.id);
      const effectiveStatus =
        u.accountStatus || (u.isActive ? 'ACTIVE' : 'INACTIVE');

      return {
        id: u.id,
        email: u.email,
        fullName: u.fullName,
        identityNumber: u.identityNumber,
        nim: prof?.nim || null,
        nidn: prof?.nidn || null,
        nip: prof?.nip || null,
        isActive: u.isActive,
        accountStatus: effectiveStatus,
        mustResetPassword: Boolean(u.mustResetPassword),
        lastLoginAt: u.lastLoginAt,
        createdAt: u.createdAt,
        studyProgram: prof?.studyProgram || 'Teknik Informatika',
        organizationalUnit: prof?.organizationalUnit || 'Politeknik Kampar',
        academicStatus: prof?.academicStatus || 'AKTIF',
        admissionYear: prof?.admissionYear || null,
        academicTitle: prof?.academicTitle || null,
        semesterLevel: prof?.semesterLevel || null,
        phone: prof?.phone || null,
        auditScope: prof?.auditScope || null,
        roles: uRoles,
      };
    });

    // Real DB-backed stats across all users
    const stats = {
      totalUsers: enrichedAll.length,
      activeUsers: enrichedAll.filter((u) => u.accountStatus === 'ACTIVE' && u.isActive).length,
      inactiveUsers: enrichedAll.filter((u) => !u.isActive || u.accountStatus === 'INACTIVE' || u.accountStatus === 'SUSPENDED').length,
      pendingActivationUsers: enrichedAll.filter(
        (u) => u.accountStatus === 'PENDING_ACTIVATION' || u.mustResetPassword
      ).length,
      superadminCount: enrichedAll.filter((u) => u.roles.includes('SUPERADMIN')).length,
      dosenCount: enrichedAll.filter((u) => u.roles.includes('DOSEN')).length,
      mahasiswaCount: enrichedAll.filter((u) => u.roles.includes('MAHASISWA')).length,
      auditorCount: enrichedAll.filter((u) => u.roles.includes('AUDITOR')).length,
    };

    const studyPrograms = Array.from(
      new Set([...STUDY_PROGRAMS, ...enrichedAll.map((u) => u.studyProgram)])
    ).filter(Boolean);
    const organizationalUnits = Array.from(
      new Set(enrichedAll.map((u) => u.organizationalUnit))
    ).filter(Boolean);

    const filtered = enrichedAll
      .filter((u) => {
        if (roleFilter && !u.roles.includes(roleFilter)) return false;
        if (studyProgramFilter && u.studyProgram !== studyProgramFilter) return false;
        if (orgUnitFilter && u.organizationalUnit !== orgUnitFilter) return false;
        if (statusFilter) {
          if (statusFilter === 'PENDING_ACTIVATION') {
            if (u.accountStatus !== 'PENDING_ACTIVATION' && !u.mustResetPassword) {
              return false;
            }
          } else if (u.accountStatus !== statusFilter) {
            return false;
          }
        }
        if (dateFrom && !Number.isNaN(dateFrom.getTime()) && new Date(u.createdAt) < dateFrom) {
          return false;
        }
        if (dateTo && !Number.isNaN(dateTo.getTime())) {
          const endOfDay = new Date(dateTo);
          endOfDay.setHours(23, 59, 59, 999);
          if (new Date(u.createdAt) > endOfDay) return false;
        }
        if (search) {
          return (
            u.fullName.toLowerCase().includes(search) ||
            u.email.toLowerCase().includes(search) ||
            (u.identityNumber || '').toLowerCase().includes(search) ||
            (u.nim || '').toLowerCase().includes(search) ||
            (u.nidn || '').toLowerCase().includes(search) ||
            (u.nip || '').toLowerCase().includes(search) ||
            u.studyProgram.toLowerCase().includes(search) ||
            u.organizationalUnit.toLowerCase().includes(search)
          );
        }
        return true;
      })
      .sort((a, b) => {
        let cmp = 0;
        if (sortBy === 'createdAt') {
          cmp = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        } else if (sortBy === 'lastLoginAt') {
          const tA = a.lastLoginAt ? new Date(a.lastLoginAt).getTime() : 0;
          const tB = b.lastLoginAt ? new Date(b.lastLoginAt).getTime() : 0;
          cmp = tA - tB;
        } else if (sortBy === 'status') {
          cmp = a.accountStatus.localeCompare(b.accountStatus);
        } else {
          cmp = a.fullName.localeCompare(b.fullName);
        }
        return sortDir === 'desc' ? -cmp : cmp;
      });

    const total = filtered.length;
    const paginated = filtered.slice((page - 1) * limit, page * limit);

    return sendSuccess(reply, paginated, {
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
      stats,
      filters: {
        studyPrograms,
        organizationalUnits,
      },
    });
  });

  // ============================================================================
  // 2. USER DETAIL (5-TAB PROFILE, ACADEMIC, ACCESS, ACTIVITY, SESSIONS)
  // ============================================================================
  fastify.get('/api/v1/users/:userId', async (req, reply) => {
    const actor = await authenticateRequest(req, reply, {
      anyPermissions: ['users:read', 'users:manage'],
    });
    if (!actor) return;

    const { userId } = req.params as { userId: string };
    const [target] = await db.select().from(users).where(eq(users.id, userId));
    if (!target) {
      return sendError(reply, 404, 'USER_NOT_FOUND', 'Pengguna tidak ditemukan.');
    }

    const [profile] = await db
      .select()
      .from(userProfiles)
      .where(eq(userProfiles.userId, userId));

    const assignedRoles = await db
      .select({
        roleId: roles.id,
        roleCode: roles.code,
        roleName: roles.name,
        description: roles.description,
      })
      .from(userRoles)
      .innerJoin(roles, eq(userRoles.roleId, roles.id))
      .where(eq(userRoles.userId, userId));

    const roleIds = assignedRoles.map((r) => r.roleId);
    const effectivePerms =
      roleIds.length > 0
        ? await db
            .select({
              code: permissions.code,
              module: permissions.module,
              description: permissions.description,
            })
            .from(rolePermissions)
            .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
            .where(inArray(rolePermissions.roleId, roleIds))
        : [];

    const uniquePerms = Array.from(
      new Map(effectivePerms.map((p) => [p.code, p])).values()
    );

    const enrolledCount = (
      await db
        .select({ id: classroomEnrollments.id })
        .from(classroomEnrollments)
        .where(eq(classroomEnrollments.studentId, userId))
    ).length;

    const teachingCount = (
      await db
        .select({ id: classroomInstructors.id })
        .from(classroomInstructors)
        .where(eq(classroomInstructors.instructorId, userId))
    ).length;

    const activityRows = await db
      .select()
      .from(auditLogs)
      .where(or(eq(auditLogs.entityId, userId), eq(auditLogs.actorId, userId)))
      .orderBy(desc(auditLogs.createdAt))
      .limit(30);

    // Return session metadata ONLY (never expose tokenHash or csrfToken)
    const sessionRows = await db
      .select({
        id: userSessions.id,
        ipAddress: userSessions.ipAddress,
        userAgent: userSessions.userAgent,
        isRevoked: userSessions.isRevoked,
        expiresAt: userSessions.expiresAt,
        createdAt: userSessions.createdAt,
      })
      .from(userSessions)
      .where(eq(userSessions.userId, userId))
      .orderBy(desc(userSessions.createdAt))
      .limit(20);

    return sendSuccess(reply, {
      id: target.id,
      email: target.email,
      fullName: target.fullName,
      identityNumber: target.identityNumber,
      isActive: target.isActive,
      accountStatus: target.accountStatus,
      mustResetPassword: target.mustResetPassword,
      lastLoginAt: target.lastLoginAt,
      createdAt: target.createdAt,
      updatedAt: target.updatedAt,
      profile: {
        studyProgram: profile?.studyProgram || 'Teknik Informatika',
        organizationalUnit: profile?.organizationalUnit || 'Politeknik Kampar',
        nidn: profile?.nidn || null,
        nip: profile?.nip || null,
        nim: profile?.nim || null,
        academicStatus: profile?.academicStatus || 'AKTIF',
        admissionYear: profile?.admissionYear || null,
        academicTitle: profile?.academicTitle || null,
        semesterLevel: profile?.semesterLevel || null,
        phone: profile?.phone || null,
        bio: profile?.bio || null,
        auditScope: profile?.auditScope || null,
      },
      academicRelationships: {
        enrolledClassroomsCount: enrolledCount,
        teachingClassroomsCount: teachingCount,
      },
      roles: assignedRoles,
      effectivePermissions: uniquePerms,
      activityHistory: activityRows.map((a) => ({
        id: a.id,
        action: a.action,
        entityType: a.entityType,
        createdAt: a.createdAt,
        ipAddress: a.ipAddress,
        metadata: a.metadata,
      })),
      sessions: sessionRows.map((s) => ({
        ...s,
        deviceLabel: parseUserAgentLabel(s.userAgent),
        isCurrentSession: s.id === actor.sessionId,
      })),
    });
  });

  // ============================================================================
  // 3. CREATE USER (ALL 4 CANONICAL ROLES + ACTIVATION MODES + UNIQUENESS)
  // ============================================================================
  const createUserSchema = z.object({
    email: z.string().email('Format email tidak valid'),
    fullName: z.string().min(3, 'Nama lengkap minimal 3 karakter'),
    identityNumber: z.string().min(3, 'Nomor identitas wajib diisi'),
    password: z.string().min(8).optional(),
    activationMethod: z.enum(['PASSWORD_INIT', 'INVITATION']).default('PASSWORD_INIT'),
    roleCode: z.enum(CANONICAL_ROLES),
    accountStatus: z.enum(VALID_ACCOUNT_STATUSES).default('ACTIVE'),
    studyProgram: z.string().min(2).default('Teknik Informatika'),
    organizationalUnit: z.string().min(2).default('Politeknik Kampar'),
    phone: z.string().optional().nullable(),
    academicTitle: z.string().optional().nullable(),
    nidn: z.string().optional().nullable(),
    nip: z.string().optional().nullable(),
    nim: z.string().optional().nullable(),
    academicStatus: z.string().default('AKTIF'),
    admissionYear: z.number().int().min(2000).max(2100).optional().nullable(),
    semesterLevel: z.number().int().min(1).max(14).optional().nullable(),
    auditScope: z.string().optional().nullable(),
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

    const input = parsed.data;
    if (!canOperatorAssignRole(actor.roles, input.roleCode)) {
      return sendError(
        reply,
        403,
        'FORBIDDEN_ROLE_ESCALATION',
        'Anda tidak memiliki otorisasi untuk menetapkan peran yang lebih tinggi dari peran Anda.'
      );
    }

    if (input.activationMethod === 'PASSWORD_INIT' && (!input.password || input.password.length < 8)) {
      return sendError(
        reply,
        400,
        'VALIDATION_ERROR',
        'Kata sandi awal minimal 8 karakter wajib diisi untuk aktivasi langsung.'
      );
    }

    // Check uniqueness for email, identityNumber, nim, nidn, nip
    const emailLower = input.email.toLowerCase().trim();
    const existingEmail = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, emailLower));
    if (existingEmail.length > 0) {
      return sendError(reply, 409, 'USER_CONFLICT', 'Alamat email sudah terdaftar.');
    }

    const existingId = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.identityNumber, input.identityNumber.trim()));
    if (existingId.length > 0) {
      return sendError(
        reply,
        409,
        'USER_CONFLICT',
        'Nomor Identitas (NIM/NIDN/NIP) sudah terdaftar.'
      );
    }

    const rawPassword =
      input.activationMethod === 'PASSWORD_INIT' && input.password
        ? input.password
        : generateRandomToken(24);
    const passwordHash = await hashPassword(rawPassword);
    const isActive = input.accountStatus === 'ACTIVE';
    const mustResetPassword = input.activationMethod === 'INVITATION';

    try {
      const created = await db.transaction(async (tx) => {
        const [newUser] = await tx
          .insert(users)
          .values({
            email: emailLower,
            fullName: input.fullName.trim(),
            identityNumber: input.identityNumber.trim(),
            passwordHash,
            isActive,
            accountStatus: input.accountStatus,
            mustResetPassword,
          })
          .returning();

        await tx.insert(userProfiles).values({
          userId: newUser.id,
          studyProgram: input.studyProgram,
          organizationalUnit: input.organizationalUnit,
          phone: input.phone || null,
          academicTitle: input.academicTitle || null,
          nidn: input.nidn || (input.roleCode === 'DOSEN' ? input.identityNumber.trim() : null),
          nip: input.nip || null,
          nim: input.nim || (input.roleCode === 'MAHASISWA' ? input.identityNumber.trim() : null),
          academicStatus: input.academicStatus,
          admissionYear: input.admissionYear ?? null,
          semesterLevel:
            input.semesterLevel ?? (input.roleCode === 'MAHASISWA' ? 1 : null),
          auditScope: input.auditScope || (input.roleCode === 'AUDITOR' ? 'INSTITUTION' : null),
        });

        const [roleRow] = await tx
          .select()
          .from(roles)
          .where(eq(roles.code, input.roleCode));
        if (roleRow) {
          await tx.insert(userRoles).values({
            userId: newUser.id,
            roleId: roleRow.id,
          });
        }

        if (mustResetPassword) {
          const resetToken = generateRandomToken(32);
          await tx.insert(passwordResetTokens).values({
            userId: newUser.id,
            tokenHash: hashSessionToken(resetToken),
            requestedById: actor.id,
            mode: 'INVITATION_LINK',
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          });
        }

        return newUser;
      });

      await recordAuditLog({
        actorId: actor.id,
        action: 'USER_CREATED',
        entityType: 'USER',
        entityId: created.id,
        metadata: {
          email: created.email,
          roleCode: input.roleCode,
          identityNumber: created.identityNumber,
          activationMethod: input.activationMethod,
          result: 'SUCCESS',
        },
        ipAddress: req.ip,
      });

      return sendSuccess(
        reply,
        {
          id: created.id,
          email: created.email,
          fullName: created.fullName,
          identityNumber: created.identityNumber,
          accountStatus: created.accountStatus,
          roleCode: input.roleCode,
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

  // ============================================================================
  // 4. EDIT USER (PROFILE, ACADEMIC IDENTITY, EMAIL & ROLE BOUNDARY)
  // ============================================================================
  const updateUserSchema = z.object({
    fullName: z.string().min(3).optional(),
    email: z.string().email().optional(),
    identityNumber: z.string().min(3).optional(),
    phone: z.string().nullable().optional(),
    studyProgram: z.string().min(2).optional(),
    organizationalUnit: z.string().min(2).optional(),
    academicTitle: z.string().nullable().optional(),
    nidn: z.string().nullable().optional(),
    nip: z.string().nullable().optional(),
    nim: z.string().nullable().optional(),
    academicStatus: z.string().optional(),
    admissionYear: z.number().int().min(2000).max(2100).nullable().optional(),
    semesterLevel: z.number().int().min(1).max(14).nullable().optional(),
    auditScope: z.string().nullable().optional(),
    roleCode: z.enum(CANONICAL_ROLES).optional(),
    reason: z.string().max(300).optional(),
  });

  fastify.patch('/api/v1/users/:userId', async (req, reply) => {
    const actor = await authenticateRequest(req, reply, {
      requiredPermissions: ['users:manage'],
    });
    if (!actor) return;

    const { userId } = req.params as { userId: string };
    const parsed = updateUserSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(
        reply,
        400,
        'VALIDATION_ERROR',
        'Data pembaruan pengguna tidak valid.',
        parsed.error.issues
      );
    }

    const [existingUser] = await db.select().from(users).where(eq(users.id, userId));
    if (!existingUser) {
      return sendError(reply, 404, 'USER_NOT_FOUND', 'Pengguna tidak ditemukan.');
    }

    const currentRoles = await db
      .select({ roleCode: roles.code })
      .from(userRoles)
      .innerJoin(roles, eq(userRoles.roleId, roles.id))
      .where(eq(userRoles.userId, userId));
    const previousRole = currentRoles[0]?.roleCode || 'MAHASISWA';

    const input = parsed.data;
    const isTargetSuperadmin = currentRoles.some(
      (r) => r.roleCode.toUpperCase() === 'SUPERADMIN'
    );

    if (input.roleCode) {
      if (!canOperatorAssignRole(actor.roles, input.roleCode)) {
        return sendError(
          reply,
          403,
          'FORBIDDEN_ROLE_ESCALATION',
          'Anda tidak berwenang menetapkan peran yang melebihi otorisasi Anda.'
        );
      }

      if (isTargetSuperadmin && input.roleCode !== 'SUPERADMIN') {
        if (userId === actor.id) {
          return sendError(
            reply,
            403,
            'FORBIDDEN_SELF_DOWNGRADE',
            'Superadmin tidak dapat menurunkan perannya sendiri.'
          );
        }
        const remainingAdmins = await countActiveSuperadmins(userId);
        if (remainingAdmins < 1) {
          return sendError(
            reply,
            409,
            'LAST_SUPERADMIN_PROTECTED',
            'Tidak dapat mengubah peran Superadmin aktif terakhir.'
          );
        }
      }
    }

    // Email uniqueness check
    const nextEmail = input.email ? input.email.toLowerCase().trim() : existingUser.email;
    const emailChanged = nextEmail !== existingUser.email;
    if (emailChanged) {
      const conflict = await db
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.email, nextEmail), ne(users.id, userId)));
      if (conflict.length > 0) {
        return sendError(reply, 409, 'USER_CONFLICT', 'Email baru sudah digunakan oleh akun lain.');
      }
    }

    const nextIdentity = input.identityNumber
      ? input.identityNumber.trim()
      : existingUser.identityNumber;
    if (nextIdentity && nextIdentity !== existingUser.identityNumber) {
      const conflictId = await db
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.identityNumber, nextIdentity), ne(users.id, userId)));
      if (conflictId.length > 0) {
        return sendError(
          reply,
          409,
          'USER_CONFLICT',
          'Nomor Identitas (NIM/NIDN/NIP) sudah digunakan oleh akun lain.'
        );
      }
    }

    const roleChanged = Boolean(input.roleCode && input.roleCode !== previousRole);

    await db.transaction(async (tx) => {
      await tx
        .update(users)
        .set({
          fullName: input.fullName?.trim() || existingUser.fullName,
          email: nextEmail,
          identityNumber: nextIdentity,
          updatedAt: new Date(),
        })
        .where(eq(users.id, userId));

      const [existingProfile] = await tx
        .select()
        .from(userProfiles)
        .where(eq(userProfiles.userId, userId));

      if (existingProfile) {
        await tx
          .update(userProfiles)
          .set({
            studyProgram: input.studyProgram ?? existingProfile.studyProgram,
            organizationalUnit:
              input.organizationalUnit ?? existingProfile.organizationalUnit,
            phone: input.phone !== undefined ? input.phone : existingProfile.phone,
            academicTitle:
              input.academicTitle !== undefined
                ? input.academicTitle
                : existingProfile.academicTitle,
            nidn: input.nidn !== undefined ? input.nidn : existingProfile.nidn,
            nip: input.nip !== undefined ? input.nip : existingProfile.nip,
            nim: input.nim !== undefined ? input.nim : existingProfile.nim,
            academicStatus: input.academicStatus ?? existingProfile.academicStatus,
            admissionYear:
              input.admissionYear !== undefined
                ? input.admissionYear
                : existingProfile.admissionYear,
            semesterLevel:
              input.semesterLevel !== undefined
                ? input.semesterLevel
                : existingProfile.semesterLevel,
            auditScope:
              input.auditScope !== undefined
                ? input.auditScope
                : existingProfile.auditScope,
            updatedAt: new Date(),
          })
          .where(eq(userProfiles.userId, userId));
      }

      if (roleChanged && input.roleCode) {
        const [targetRoleRow] = await tx
          .select()
          .from(roles)
          .where(eq(roles.code, input.roleCode));
        if (targetRoleRow) {
          await tx.delete(userRoles).where(eq(userRoles.userId, userId));
          await tx.insert(userRoles).values({
            userId,
            roleId: targetRoleRow.id,
          });
        }
      }

      // Security policy: revoke active sessions when role or email changes
      if (roleChanged || emailChanged) {
        await tx
          .update(userSessions)
          .set({ isRevoked: true })
          .where(eq(userSessions.userId, userId));
      }
    });

    await recordAuditLog({
      actorId: actor.id,
      action: roleChanged ? 'USER_ROLE_CHANGED' : 'USER_UPDATED',
      entityType: 'USER',
      entityId: userId,
      metadata: {
        previousEmail: existingUser.email,
        newEmail: nextEmail,
        previousRole,
        newRole: input.roleCode || previousRole,
        sessionsRevoked: roleChanged || emailChanged,
        reason: input.reason || 'Pembaruan data pengguna',
      },
      ipAddress: req.ip,
    });

    return sendSuccess(reply, { id: userId, email: nextEmail, roleChanged, emailChanged });
  });

  // ============================================================================
  // 5. ACCOUNT STATUS MANAGEMENT (ACTIVATE / DEACTIVATE / SUSPEND)
  // ============================================================================
  fastify.patch('/api/v1/users/:userId/status', async (req, reply) => {
    const actor = await authenticateRequest(req, reply, {
      requiredPermissions: ['users:manage'],
    });
    if (!actor) return;

    const { userId } = req.params as { userId: string };
    const bodySchema = z.object({
      isActive: z.boolean().optional(),
      accountStatus: z.enum(VALID_ACCOUNT_STATUSES).optional(),
      reason: z.string().max(300).optional(),
    });
    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(reply, 400, 'VALIDATION_ERROR', 'Status akun tidak valid.');
    }

    const nextStatus: (typeof VALID_ACCOUNT_STATUSES)[number] =
      parsed.data.accountStatus ||
      (parsed.data.isActive === false ? 'INACTIVE' : 'ACTIVE');
    const nextIsActive = nextStatus === 'ACTIVE';

    if (userId === actor.id && !nextIsActive) {
      return sendError(
        reply,
        400,
        'SELF_DEACTIVATION_FORBIDDEN',
        'Anda tidak dapat menonaktifkan atau menangguhkan akun Anda sendiri.'
      );
    }

    const [target] = await db.select().from(users).where(eq(users.id, userId));
    if (!target) {
      return sendError(reply, 404, 'USER_NOT_FOUND', 'Pengguna tidak ditemukan.');
    }

    const targetRoles = await db
      .select({ roleCode: roles.code })
      .from(userRoles)
      .innerJoin(roles, eq(userRoles.roleId, roles.id))
      .where(eq(userRoles.userId, userId));
    const isTargetSuperadmin = targetRoles.some(
      (r) => r.roleCode.toUpperCase() === 'SUPERADMIN'
    );

    if (isTargetSuperadmin && !nextIsActive) {
      const remaining = await countActiveSuperadmins(userId);
      if (remaining < 1) {
        return sendError(
          reply,
          409,
          'LAST_SUPERADMIN_PROTECTED',
          'Akun Superadmin aktif terakhir tidak dapat dinonaktifkan.'
        );
      }
    }

    const [updated] = await db.transaction(async (tx) => {
      const rows = await tx
        .update(users)
        .set({
          isActive: nextIsActive,
          accountStatus: nextStatus,
          updatedAt: new Date(),
        })
        .where(eq(users.id, userId))
        .returning();

      if (!nextIsActive) {
        await tx
          .update(userSessions)
          .set({ isRevoked: true })
          .where(eq(userSessions.userId, userId));
      }
      return rows;
    });

    await recordAuditLog({
      actorId: actor.id,
      action:
        nextStatus === 'ACTIVE'
          ? 'USER_ACTIVATED'
          : nextStatus === 'SUSPENDED'
            ? 'USER_SUSPENDED'
            : 'USER_DEACTIVATED',
      entityType: 'USER',
      entityId: userId,
      metadata: {
        previousStatus: target.accountStatus,
        newStatus: nextStatus,
        reason: parsed.data.reason || 'Perubahan status akun oleh administrator',
      },
      ipAddress: req.ip,
    });

    return sendSuccess(reply, {
      id: updated.id,
      isActive: updated.isActive,
      accountStatus: updated.accountStatus,
    });
  });

  // ============================================================================
  // 6. ADVANCED PASSWORD RESET & TEMPORARY CREDENTIAL MANAGEMENT
  // ============================================================================
  fastify.post('/api/v1/users/:userId/reset-password', async (req, reply) => {
    const actor = await authenticateRequest(req, reply, {
      anyPermissions: ['users:manage', 'users.password_reset'],
    });
    if (!actor) return;

    const { userId } = req.params as { userId: string };
    const defaultExpHours = getPasswordPolicyConfig().defaultTempExpirationHours;
    const schema = z.object({
      method: z.enum(['AUTOMATIC', 'MANUAL', 'IDENTITY_BASED']).default('AUTOMATIC'),
      mode: z.enum(['INVITATION_LINK', 'FORCE_NEXT_LOGIN', 'BOTH']).optional(),
      manualPassword: z.string().optional(),
      confirmPassword: z.string().optional(),
      expirationHours: z.number().int().min(1).max(168).default(defaultExpHours),
      revokeSessions: z.boolean().default(true),
      reason: z.string().max(300).optional(),
    });

    const parsed = schema.safeParse(req.body || {});
    if (!parsed.success) {
      return sendError(
        reply,
        400,
        'VALIDATION_ERROR',
        'Opsi reset kata sandi tidak valid.',
        parsed.error.issues
      );
    }

    const [target] = await db.select().from(users).where(eq(users.id, userId));
    if (!target) {
      return sendError(reply, 404, 'USER_NOT_FOUND', 'Pengguna tidak ditemukan.');
    }

    const targetRoles = await db
      .select({ code: roles.code })
      .from(userRoles)
      .innerJoin(roles, eq(userRoles.roleId, roles.id))
      .where(eq(userRoles.userId, userId));
    const targetRoleCodes = targetRoles.map((r) => r.code.toUpperCase());
    const targetIsSuperadmin = targetRoleCodes.includes('SUPERADMIN');
    const actorIsSuperadmin = actor.roles.some((r) => r.toUpperCase() === 'SUPERADMIN');

    if (targetIsSuperadmin && !actorIsSuperadmin) {
      return sendError(
        reply,
        403,
        'FORBIDDEN_SUPERADMIN_PROTECTION',
        'Hanya Superadmin yang dapat mereset kredensial akun Superadmin.'
      );
    }

    const [profile] = await db
      .select()
      .from(userProfiles)
      .where(eq(userProfiles.userId, userId));

    const { method, manualPassword, confirmPassword, expirationHours, reason } = parsed.data;
    const revokeSessions = method === 'IDENTITY_BASED' ? true : parsed.data.revokeSessions;

    let temporaryPassword = '';
    let identityTypeUsed: string | null = null;

    if (method === 'AUTOMATIC') {
      temporaryPassword = generateCryptographicPassword(16);
    } else if (method === 'MANUAL') {
      if (!manualPassword || manualPassword !== confirmPassword) {
        return sendError(
          reply,
          400,
          'PASSWORD_MISMATCH',
          'Password sementara dan konfirmasi password tidak cocok.'
        );
      }
      const policy = validatePasswordPolicy(manualPassword, {
        identityValues: [target.identityNumber, profile?.nim, profile?.nidn, profile?.nip],
      });
      if (!policy.valid) {
        return sendError(
          reply,
          400,
          'WEAK_PASSWORD',
          policy.errors[0] || 'Password sementara tidak memenuhi kebijakan keamanan.',
          policy.errors
        );
      }
      const reused = await checkPasswordReuse(userId, manualPassword, target.passwordHash);
      if (reused) {
        return sendError(
          reply,
          400,
          'PASSWORD_REUSE_FORBIDDEN',
          'Password sementara tidak boleh sama dengan 5 password terakhir pengguna.'
        );
      }
      temporaryPassword = manualPassword;
    } else if (method === 'IDENTITY_BASED') {
      if (profile?.nim) {
        temporaryPassword = profile.nim.trim();
        identityTypeUsed = 'NIM';
      } else if (profile?.nidn) {
        temporaryPassword = profile.nidn.trim();
        identityTypeUsed = 'NIDN';
      } else if (profile?.nip) {
        temporaryPassword = profile.nip.trim();
        identityTypeUsed = 'NIP';
      } else if (target.identityNumber) {
        temporaryPassword = target.identityNumber.trim();
        identityTypeUsed = 'IDENTITY_NUMBER';
      }

      if (!temporaryPassword) {
        return sendError(
          reply,
          400,
          'IDENTITY_NOT_FOUND',
          'Pengguna tidak memiliki catatan identitas akademik (NIM/NIDN/NIP) untuk dijadikan password sementara.'
        );
      }
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + expirationHours * 60 * 60 * 1000);
    const newPasswordHash = await hashPassword(temporaryPassword);

    await db.transaction(async (tx) => {
      await recordPasswordInHistory(tx, userId, target.passwordHash);

      await tx
        .update(users)
        .set({
          passwordHash: newPasswordHash,
          mustResetPassword: true,
          temporaryPasswordExpiresAt: expiresAt,
          passwordResetAt: now,
          passwordResetBy: actor.id,
          passwordResetReason: reason || `Reset password administratif (${method})`,
          updatedAt: now,
        })
        .where(eq(users.id, userId));

      if (revokeSessions) {
        await tx
          .update(userSessions)
          .set({ isRevoked: true })
          .where(eq(userSessions.userId, userId));
      }

      await tx.insert(notifications).values({
        userId,
        title: 'Password Sementara Diterbitkan',
        message: `Administrator telah mereset kata sandi akun Anda. Password sementara berlaku hingga ${expiresAt.toISOString()} dan wajib diganti saat masuk.`,
        type: 'SECURITY',
      });
    });

    // Audit log NEVER stores plaintext password or hash
    await recordAuditLog({
      actorId: actor.id,
      action: 'USER_PASSWORD_RESET_ADMIN',
      entityType: 'USER',
      entityId: userId,
      metadata: {
        method,
        identityTypeUsed,
        revokeSessions,
        expiresAt: expiresAt.toISOString(),
        reason: reason || 'Permintaan reset kata sandi oleh administrator',
        result: 'SUCCESS',
      },
      ipAddress: req.ip,
    });

    return sendSuccess(reply, {
      userId,
      method,
      identityTypeUsed,
      expiresAt: expiresAt.toISOString(),
      mustResetPassword: true,
      sessionsRevoked: revokeSessions,
      temporaryPassword: method === 'AUTOMATIC' ? temporaryPassword : null,
    });
  });

  // ============================================================================
  // 6b. BULK PASSWORD RESET (PREVIEW & EXECUTE)
  // ============================================================================
  fastify.post('/api/v1/users/bulk-reset-password', async (req, reply) => {
    const actor = await authenticateRequest(req, reply, {
      anyPermissions: ['users:manage', 'users.password_reset_bulk'],
    });
    if (!actor) return;

    const defaultExpHours = getPasswordPolicyConfig().defaultTempExpirationHours;
    const schema = z.object({
      userIds: z.array(z.string().uuid()).min(1).max(100),
      method: z.enum(['AUTOMATIC', 'IDENTITY_BASED']).default('AUTOMATIC'),
      revokeSessions: z.boolean().default(true),
      expirationHours: z.number().int().min(1).max(168).default(defaultExpHours),
      reason: z.string().max(300).optional(),
      previewOnly: z.boolean().default(false),
    });

    const parsed = schema.safeParse(req.body || {});
    if (!parsed.success) {
      return sendError(
        reply,
        400,
        'VALIDATION_ERROR',
        'Payload bulk reset password tidak valid.',
        parsed.error.issues
      );
    }

    const { userIds, method, expirationHours, reason, previewOnly } = parsed.data;
    const revokeSessions = method === 'IDENTITY_BASED' ? true : parsed.data.revokeSessions;
    const actorIsSuperadmin = actor.roles.some((r) => r.toUpperCase() === 'SUPERADMIN');

    const targetUsers = await db
      .select()
      .from(users)
      .where(inArray(users.id, userIds));
    const profileRows = await db
      .select()
      .from(userProfiles)
      .where(inArray(userProfiles.userId, userIds));
    const roleRows = await db
      .select({ userId: userRoles.userId, code: roles.code })
      .from(userRoles)
      .innerJoin(roles, eq(userRoles.roleId, roles.id))
      .where(inArray(userRoles.userId, userIds));

    const profileMap = new Map(profileRows.map((p) => [p.userId, p]));
    const roleMap = new Map<string, string[]>();
    for (const r of roleRows) {
      const list = roleMap.get(r.userId) || [];
      list.push(r.code.toUpperCase());
      roleMap.set(r.userId, list);
    }

    const resolveIdentity = (u: typeof targetUsers[number]) => {
      const p = profileMap.get(u.id);
      if (p?.nim) return { value: p.nim.trim(), label: 'NIM' };
      if (p?.nidn) return { value: p.nidn.trim(), label: 'NIDN' };
      if (p?.nip) return { value: p.nip.trim(), label: 'NIP' };
      if (u.identityNumber) return { value: u.identityNumber.trim(), label: 'IDENTITY_NUMBER' };
      return null;
    };

    const previewItems = targetUsers.map((u) => {
      const rolesList = roleMap.get(u.id) || [];
      const isSuper = rolesList.includes('SUPERADMIN');
      const idInfo = resolveIdentity(u);
      let eligible = true;
      let skipReason: string | null = null;

      if (u.id === actor.id) {
        eligible = false;
        skipReason = 'Tidak dapat mereset akun sendiri melalui aksi massal.';
      } else if (isSuper && !actorIsSuperadmin) {
        eligible = false;
        skipReason = 'Hanya Superadmin yang dapat mereset akun Superadmin.';
      } else if (method === 'IDENTITY_BASED' && !idInfo) {
        eligible = false;
        skipReason = 'Tidak memiliki NIM/NIDN/NIP atau Nomor Identitas.';
      }

      return {
        userId: u.id,
        fullName: u.fullName,
        email: u.email,
        roleCode: rolesList[0] || 'MAHASISWA',
        identityType: idInfo?.label || null,
        eligible,
        reason: skipReason,
      };
    });

    if (previewOnly) {
      return sendSuccess(reply, {
        previewOnly: true,
        method,
        totalSelected: userIds.length,
        eligibleCount: previewItems.filter((i) => i.eligible).length,
        ineligibleCount: previewItems.filter((i) => !i.eligible).length,
        items: previewItems,
      });
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + expirationHours * 60 * 60 * 1000);
    const results: Array<{
      userId: string;
      fullName: string;
      email: string;
      status: 'SUCCESS' | 'FAILED';
      message: string;
      temporaryPassword?: string | null;
      identityTypeUsed?: string | null;
    }> = [];

    for (const u of targetUsers) {
      const preview = previewItems.find((p) => p.userId === u.id)!;
      if (!preview.eligible) {
        results.push({
          userId: u.id,
          fullName: u.fullName,
          email: u.email,
          status: 'FAILED',
          message: preview.reason || 'Tidak memenuhi syarat.',
        });
        continue;
      }

      const idInfo = resolveIdentity(u);
      // Generate a UNIQUE cryptographic password per user when AUTOMATIC
      const tempPass =
        method === 'AUTOMATIC' ? generateCryptographicPassword(16) : idInfo!.value;
      const hash = await hashPassword(tempPass);

      await db.transaction(async (tx) => {
        await recordPasswordInHistory(tx, u.id, u.passwordHash);
        await tx
          .update(users)
          .set({
            passwordHash: hash,
            mustResetPassword: true,
            temporaryPasswordExpiresAt: expiresAt,
            passwordResetAt: now,
            passwordResetBy: actor.id,
            passwordResetReason: reason || `Bulk reset password (${method})`,
            updatedAt: now,
          })
          .where(eq(users.id, u.id));

        if (revokeSessions) {
          await tx
            .update(userSessions)
            .set({ isRevoked: true })
            .where(eq(userSessions.userId, u.id));
        }

        await tx.insert(notifications).values({
          userId: u.id,
          title: 'Password Sementara Diterbitkan',
          message: `Administrator telah melakukan reset password massal. Password sementara berlaku hingga ${expiresAt.toISOString()} dan wajib diganti saat masuk.`,
          type: 'SECURITY',
        });
      });

      results.push({
        userId: u.id,
        fullName: u.fullName,
        email: u.email,
        status: 'SUCCESS',
        message: 'Berhasil direset',
        temporaryPassword: method === 'AUTOMATIC' ? tempPass : null,
        identityTypeUsed: method === 'IDENTITY_BASED' ? idInfo?.label || null : null,
      });
    }

    const successCount = results.filter((r) => r.status === 'SUCCESS').length;
    const failedCount = results.filter((r) => r.status === 'FAILED').length;

    // Audit log NEVER stores plaintext passwords
    await recordAuditLog({
      actorId: actor.id,
      action: 'USER_PASSWORD_RESET_BULK',
      entityType: 'USER_BULK',
      metadata: {
        method,
        totalRequested: userIds.length,
        successCount,
        failedCount,
        revokeSessions,
        expiresAt: expiresAt.toISOString(),
        reason: reason || 'Bulk password reset oleh administrator',
      },
      ipAddress: req.ip,
    });

    return sendSuccess(reply, {
      method,
      expiresAt: expiresAt.toISOString(),
      sessionsRevoked: revokeSessions,
      totalRequested: userIds.length,
      successCount,
      failedCount,
      results,
    });
  });

  // ============================================================================
  // 7. SESSION REVOCATION (INDIVIDUAL & REVOKE ALL)
  // ============================================================================
  fastify.post(
    '/api/v1/users/:userId/sessions/:sessionId/revoke',
    async (req, reply) => {
      const actor = await authenticateRequest(req, reply, {
        requiredPermissions: ['users:manage'],
      });
      if (!actor) return;

      const { userId, sessionId } = req.params as {
        userId: string;
        sessionId: string;
      };

      const updated = await db
        .update(userSessions)
        .set({ isRevoked: true })
        .where(and(eq(userSessions.id, sessionId), eq(userSessions.userId, userId)))
        .returning({ id: userSessions.id });

      if (updated.length === 0) {
        return sendError(reply, 404, 'SESSION_NOT_FOUND', 'Sesi tidak ditemukan.');
      }

      await recordAuditLog({
        actorId: actor.id,
        action: 'USER_SESSION_REVOKED',
        entityType: 'SESSION',
        entityId: userId,
        metadata: { sessionId },
        ipAddress: req.ip,
      });

      return sendSuccess(reply, { userId, sessionId, isRevoked: true });
    }
  );

  fastify.post('/api/v1/users/:userId/sessions/revoke-all', async (req, reply) => {
    const actor = await authenticateRequest(req, reply, {
      requiredPermissions: ['users:manage'],
    });
    if (!actor) return;

    const { userId } = req.params as { userId: string };
    const updated = await db
      .update(userSessions)
      .set({ isRevoked: true })
      .where(and(eq(userSessions.userId, userId), eq(userSessions.isRevoked, false)))
      .returning({ id: userSessions.id });

    await recordAuditLog({
      actorId: actor.id,
      action: 'USER_ALL_SESSIONS_REVOKED',
      entityType: 'SESSION',
      entityId: userId,
      metadata: { revokedCount: updated.length },
      ipAddress: req.ip,
    });

    return sendSuccess(reply, { userId, revokedCount: updated.length });
  });

  // ============================================================================
  // 8. BULK ACTIONS (ACTIVATE, DEACTIVATE, ASSIGN ROLE)
  // ============================================================================
  fastify.post('/api/v1/users/bulk', async (req, reply) => {
    const actor = await authenticateRequest(req, reply, {
      requiredPermissions: ['users:manage'],
    });
    if (!actor) return;

    const schema = z.object({
      action: z.enum(['ACTIVATE', 'DEACTIVATE', 'ASSIGN_ROLE']),
      userIds: z.array(z.string().uuid()).min(1).max(200),
      roleCode: z.enum(CANONICAL_ROLES).optional(),
      reason: z.string().max(300).optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(reply, 400, 'VALIDATION_ERROR', 'Payload aksi massal tidak valid.');
    }

    const { action, userIds, roleCode, reason } = parsed.data;
    if (action === 'ASSIGN_ROLE') {
      if (!roleCode || !canOperatorAssignRole(actor.roles, roleCode)) {
        return sendError(
          reply,
          403,
          'FORBIDDEN_ROLE_ESCALATION',
          'Anda tidak berwenang menetapkan peran yang dipilih.'
        );
      }
    }

    const succeeded: string[] = [];
    const failed: { userId: string; message: string }[] = [];

    for (const targetId of userIds) {
      if (targetId === actor.id && action === 'DEACTIVATE') {
        failed.push({ userId: targetId, message: 'Tidak dapat menonaktifkan akun sendiri.' });
        continue;
      }

      const targetRoles = await db
        .select({ roleCode: roles.code })
        .from(userRoles)
        .innerJoin(roles, eq(userRoles.roleId, roles.id))
        .where(eq(userRoles.userId, targetId));
      const isTargetSuperadmin = targetRoles.some(
        (r) => r.roleCode.toUpperCase() === 'SUPERADMIN'
      );

      if (isTargetSuperadmin && action === 'DEACTIVATE') {
        const remaining = await countActiveSuperadmins(targetId);
        if (remaining < 1) {
          failed.push({
            userId: targetId,
            message: 'Superadmin aktif terakhir dilindungi.',
          });
          continue;
        }
      }

      if (action === 'ACTIVATE' || action === 'DEACTIVATE') {
        const isActive = action === 'ACTIVATE';
        await db
          .update(users)
          .set({
            isActive,
            accountStatus: isActive ? 'ACTIVE' : 'INACTIVE',
            updatedAt: new Date(),
          })
          .where(eq(users.id, targetId));

        if (!isActive) {
          await db
            .update(userSessions)
            .set({ isRevoked: true })
            .where(eq(userSessions.userId, targetId));
        }
      } else if (action === 'ASSIGN_ROLE' && roleCode) {
        if (isTargetSuperadmin && roleCode !== 'SUPERADMIN') {
          const remaining = await countActiveSuperadmins(targetId);
          if (remaining < 1) {
            failed.push({
              userId: targetId,
              message: 'Peran Superadmin aktif terakhir dilindungi.',
            });
            continue;
          }
        }
        const [roleRow] = await db
          .select()
          .from(roles)
          .where(eq(roles.code, roleCode));
        if (roleRow) {
          await db.delete(userRoles).where(eq(userRoles.userId, targetId));
          await db.insert(userRoles).values({ userId: targetId, roleId: roleRow.id });
          await db
            .update(userSessions)
            .set({ isRevoked: true })
            .where(eq(userSessions.userId, targetId));
        }
      }

      succeeded.push(targetId);
    }

    await recordAuditLog({
      actorId: actor.id,
      action: `USER_BULK_${action}`,
      entityType: 'USER_BATCH',
      metadata: {
        succeededCount: succeeded.length,
        failedCount: failed.length,
        roleCode: roleCode || null,
        reason: reason || 'Operasi massal pengguna',
      },
      ipAddress: req.ip,
    });

    return sendSuccess(reply, { succeeded, failed });
  });

  // ============================================================================
  // 9. DOWNLOAD IMPORT TEMPLATES (XLSX & CSV)
  // ============================================================================
  fastify.get('/api/v1/users/import/templates/:templateType', async (req, reply) => {
    const actor = await authenticateRequest(req, reply, {
      requiredPermissions: ['users:manage'],
    });
    if (!actor) return;

    if (isAuditorOnly(actor)) {
      return sendError(
        reply,
        403,
        'FORBIDDEN_AUDITOR_READ_ONLY',
        'Peran AUDITOR tidak diizinkan mengunduh template impor.'
      );
    }

    const { templateType } = req.params as { templateType: string };
    const headers = [
      'fullName',
      'email',
      'identityNumber',
      'roleCode',
      'studyProgram',
      'organizationalUnit',
      'phone',
      'academicTitle',
      'admissionYear',
      'accountStatus',
    ];

    const guideRows = [
      {
        Kolom: 'fullName (Wajib)',
        Keterangan: 'Nama lengkap beserta gelar jika ada',
        Contoh: 'Dr. Budi Santoso, M.Kom.',
      },
      {
        Kolom: 'email (Wajib, Unik)',
        Keterangan: 'Alamat email institusi aktif',
        Contoh: 'budi.santoso@poltek-kampar.ac.id',
      },
      {
        Kolom: 'identityNumber (Wajib, Unik)',
        Keterangan: 'NIM untuk Mahasiswa, NIDN/NIP untuk Dosen/Staf',
        Contoh: 'NIDN-1020038801',
      },
      {
        Kolom: 'roleCode (Wajib)',
        Keterangan: 'SUPERADMIN | DOSEN | MAHASISWA | AUDITOR',
        Contoh: 'DOSEN',
      },
      {
        Kolom: 'studyProgram (Wajib)',
        Keterangan: 'Program studi (Teknik Informatika, Teknik Pengolahan Sawit, dll)',
        Contoh: 'Teknik Informatika',
      },
      {
        Kolom: 'organizationalUnit (Opsional)',
        Keterangan: 'Unit kerja / jurusan',
        Contoh: 'Jurusan Teknik Informatika',
      },
      {
        Kolom: 'accountStatus (Opsional)',
        Keterangan: 'ACTIVE | INACTIVE | PENDING_ACTIVATION (default: ACTIVE)',
        Contoh: 'ACTIVE',
      },
    ];

    let sampleRows: Record<string, string | number>[] = [];
    let filename = 'Template_Import_Pengguna.xlsx';

    if (templateType === 'dosen-xlsx') {
      filename = 'Template_Import_Dosen.xlsx';
      sampleRows = [
        {
          fullName: 'Dr. Budi Santoso, M.Kom.',
          email: 'budi.santoso@poltek-kampar.ac.id',
          identityNumber: 'NIDN-1020038801',
          roleCode: 'DOSEN',
          studyProgram: 'Teknik Informatika',
          organizationalUnit: 'Jurusan Teknik Informatika',
          phone: '081275001122',
          academicTitle: 'Dr., M.Kom.',
          admissionYear: '',
          accountStatus: 'ACTIVE',
        },
      ];
    } else if (templateType === 'mahasiswa-xlsx') {
      filename = 'Template_Import_Mahasiswa.xlsx';
      sampleRows = [
        {
          fullName: 'Siti Aminah',
          email: 'siti.aminah@student.poltek-kampar.ac.id',
          identityNumber: 'NIM-202613001',
          roleCode: 'MAHASISWA',
          studyProgram: 'Teknik Informatika',
          organizationalUnit: 'Program Studi D3 Teknik Informatika',
          phone: '082275001133',
          academicTitle: '',
          admissionYear: 2026,
          accountStatus: 'ACTIVE',
        },
      ];
    } else {
      filename =
        templateType === 'general-csv'
          ? 'Template_Import_Pengguna.csv'
          : 'Template_Import_Pengguna_Umum.xlsx';
      sampleRows = [
        {
          fullName: 'Dr. Budi Santoso, M.Kom.',
          email: 'budi.santoso@poltek-kampar.ac.id',
          identityNumber: 'NIDN-1020038801',
          roleCode: 'DOSEN',
          studyProgram: 'Teknik Informatika',
          organizationalUnit: 'Jurusan Teknik Informatika',
          phone: '081275001122',
          academicTitle: 'Dr., M.Kom.',
          admissionYear: '',
          accountStatus: 'ACTIVE',
        },
        {
          fullName: 'Siti Aminah',
          email: 'siti.aminah@student.poltek-kampar.ac.id',
          identityNumber: 'NIM-202613001',
          roleCode: 'MAHASISWA',
          studyProgram: 'Teknik Pengolahan Sawit',
          organizationalUnit: 'Program Studi Teknik Pengolahan Sawit',
          phone: '082275001133',
          academicTitle: '',
          admissionYear: 2026,
          accountStatus: 'ACTIVE',
        },
      ];
    }

    const ws = XLSX.utils.json_to_sheet(sampleRows, { header: headers });
    if (templateType === 'general-csv') {
      const csv = XLSX.utils.sheet_to_csv(ws);
      reply.header('Content-Type', 'text/csv; charset=utf-8');
      reply.header('Content-Disposition', `attachment; filename="${filename}"`);
      return reply.send(csv);
    }

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Data_Pengguna');
    const guideWs = XLSX.utils.json_to_sheet(guideRows);
    XLSX.utils.book_append_sheet(wb, guideWs, 'Panduan_Pengisian');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    reply.header(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    reply.header('Content-Disposition', `attachment; filename="${filename}"`);
    return reply.send(buf);
  });

  // ============================================================================
  // 10. IMPORT PREVIEW (XLSX, XLS, CSV) & VALIDATION
  // ============================================================================
  fastify.post('/api/v1/users/import/preview', async (req, reply) => {
    const actor = await authenticateRequest(req, reply, {
      requiredPermissions: ['users:manage'],
    });
    if (!actor) return;

    const filePart = await req.file();
    if (!filePart) {
      return sendError(reply, 400, 'VALIDATION_ERROR', 'File Excel/CSV wajib diunggah.');
    }

    const ext = filePart.filename.split('.').pop()?.toLowerCase() || '';
    if (!['xlsx', 'xls', 'csv'].includes(ext)) {
      return sendError(
        reply,
        400,
        'UNSUPPORTED_FILE_FORMAT',
        'Format file harus .xlsx, .xls, atau .csv.'
      );
    }

    const buffer = await filePart.toBuffer();
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) {
      return sendError(reply, 400, 'EMPTY_WORKBOOK', 'File tidak memiliki lembar data.');
    }

    const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(
      workbook.Sheets[firstSheetName],
      { defval: '' }
    );

    const existingUsers = await db
      .select({
        id: users.id,
        email: users.email,
        identityNumber: users.identityNumber,
      })
      .from(users);
    const existingByEmail = new Map(existingUsers.map((u) => [u.email.toLowerCase(), u]));
    const existingById = new Map(
      existingUsers
        .filter((u) => u.identityNumber)
        .map((u) => [u.identityNumber!.toLowerCase(), u])
    );

    const seenEmailsInFile = new Set<string>();
    const seenIdsInFile = new Set<string>();

    const validatedRows = rawRows.map((raw, index) => {
      const rowNumber = index + 2;
      const fullName = String(raw.fullName || raw.nama || raw['Nama Lengkap'] || '').trim();
      const email = String(raw.email || raw.Email || '').trim().toLowerCase();
      const identityNumber = String(
        raw.identityNumber || raw.nim || raw.nidn || raw.nip || raw['NIM/NIDN/NIP'] || ''
      ).trim();
      const roleCode = String(raw.roleCode || raw.role || 'MAHASISWA').trim().toUpperCase();
      const studyProgram = String(raw.studyProgram || raw.prodi || 'Teknik Informatika').trim();
      const organizationalUnit = String(
        raw.organizationalUnit || raw.unit || 'Politeknik Kampar'
      ).trim();
      const phone = String(raw.phone || raw.telepon || '').trim() || null;
      const academicTitle = String(raw.academicTitle || raw.gelar || '').trim() || null;
      const rawYear = String(raw.admissionYear || '').trim();
      const admissionYear = rawYear ? parseInt(rawYear, 10) : null;
      const accountStatus = String(raw.accountStatus || 'ACTIVE').trim().toUpperCase();

      const errors: string[] = [];
      const warnings: string[] = [];

      if (fullName.length < 3) errors.push('fullName minimal 3 karakter');
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push('Format email tidak valid');
      if (identityNumber.length < 3) errors.push('identityNumber wajib diisi');
      if (!CANONICAL_ROLES.includes(roleCode as any)) {
        errors.push(`roleCode tidak valid (${roleCode})`);
      } else if (!canOperatorAssignRole(actor.roles, roleCode)) {
        errors.push(`Tidak berwenang menetapkan peran ${roleCode}`);
      }
      if (!VALID_ACCOUNT_STATUSES.includes(accountStatus as any)) {
        errors.push(`accountStatus tidak valid (${accountStatus})`);
      }

      const inFileDupEmail = email && seenEmailsInFile.has(email);
      const inFileDupId = identityNumber && seenIdsInFile.has(identityNumber.toLowerCase());
      if (email) seenEmailsInFile.add(email);
      if (identityNumber) seenIdsInFile.add(identityNumber.toLowerCase());

      if (inFileDupEmail) errors.push('Email duplikat di dalam file');
      if (inFileDupId) errors.push('Nomor identitas duplikat di dalam file');

      const dbDupEmail = email ? existingByEmail.get(email) : undefined;
      const dbDupId = identityNumber
        ? existingById.get(identityNumber.toLowerCase())
        : undefined;
      const isDuplicateDb = Boolean(dbDupEmail || dbDupId);
      if (isDuplicateDb) {
        warnings.push('Pengguna sudah ada di database (email atau identitas terdaftar)');
      }

      return {
        rowNumber,
        fullName,
        email,
        identityNumber,
        roleCode,
        studyProgram,
        organizationalUnit,
        phone,
        academicTitle,
        admissionYear: Number.isNaN(admissionYear as number) ? null : admissionYear,
        accountStatus,
        isValid: errors.length === 0,
        isDuplicateDb,
        existingUserId: dbDupEmail?.id || dbDupId?.id || null,
        errors,
        warnings,
      };
    });

    const fingerprint = crypto.createHash('sha256').update(buffer).digest('hex');

    return sendSuccess(reply, {
      filename: filePart.filename,
      fingerprint,
      totalRows: validatedRows.length,
      validRows: validatedRows.filter((r) => r.isValid).length,
      invalidRows: validatedRows.filter((r) => !r.isValid).length,
      duplicateRows: validatedRows.filter((r) => r.isDuplicateDb).length,
      newUsersCount: validatedRows.filter((r) => r.isValid && !r.isDuplicateDb).length,
      existingUsersCount: validatedRows.filter((r) => r.isValid && r.isDuplicateDb).length,
      rows: validatedRows,
    });
  });

  // ============================================================================
  // 11. IMPORT COMMIT & HISTORY
  // ============================================================================
  const commitImportSchema = z.object({
    filename: z.string().min(1),
    fingerprint: z.string().min(8),
    importType: z.enum(['DOSEN', 'MAHASISWA', 'GENERAL']).default('GENERAL'),
    importMode: z.enum(['CREATE_ONLY', 'UPSERT', 'SKIP_DUPLICATES']).default('SKIP_DUPLICATES'),
    rows: z.array(
      z.object({
        rowNumber: z.number().int(),
        fullName: z.string(),
        email: z.string(),
        identityNumber: z.string(),
        roleCode: z.enum(CANONICAL_ROLES),
        studyProgram: z.string(),
        organizationalUnit: z.string().default('Politeknik Kampar'),
        phone: z.string().nullable().optional(),
        academicTitle: z.string().nullable().optional(),
        admissionYear: z.number().int().nullable().optional(),
        accountStatus: z.enum(VALID_ACCOUNT_STATUSES).default('ACTIVE'),
      })
    ),
  });

  fastify.post('/api/v1/users/import/commit', async (req, reply) => {
    const actor = await authenticateRequest(req, reply, {
      requiredPermissions: ['users:manage'],
    });
    if (!actor) return;

    const parsed = commitImportSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(
        reply,
        400,
        'VALIDATION_ERROR',
        'Payload commit impor pengguna tidak valid.',
        parsed.error.issues
      );
    }

    const { filename, fingerprint, importType, importMode, rows } = parsed.data;

    // Idempotency guard against duplicate batch submission
    const duplicateBatch = await db
      .select({ id: userImportBatches.id })
      .from(userImportBatches)
      .where(
        and(
          eq(userImportBatches.fingerprint, fingerprint),
          eq(userImportBatches.importMode, importMode)
        )
      );
    if (duplicateBatch.length > 0) {
      return sendError(
        reply,
        409,
        'DUPLICATE_IMPORT_BATCH',
        'File impor yang sama dengan mode yang sama sudah pernah diproses.'
      );
    }

    const allRoleRows = await db.select().from(roles);
    const roleByCode = new Map(allRoleRows.map((r) => [r.code.toUpperCase(), r]));

    let successfulRecords = 0;
    let failedRecords = 0;
    let skippedRecords = 0;
    const errorReport: { rowNumber: number; email: string; reason: string }[] = [];

    await db.transaction(async (tx) => {
      for (const row of rows) {
        if (!canOperatorAssignRole(actor.roles, row.roleCode)) {
          failedRecords += 1;
          errorReport.push({
            rowNumber: row.rowNumber,
            email: row.email,
            reason: `Otorisasi tidak cukup untuk peran ${row.roleCode}`,
          });
          continue;
        }

        const emailLower = row.email.toLowerCase().trim();
        const [existingByEmail] = await tx
          .select()
          .from(users)
          .where(eq(users.email, emailLower));
        const [existingById] = await tx
          .select()
          .from(users)
          .where(eq(users.identityNumber, row.identityNumber.trim()));
        const existing = existingByEmail || existingById;

        if (existing) {
          if (importMode === 'SKIP_DUPLICATES') {
            skippedRecords += 1;
            continue;
          }
          if (importMode === 'CREATE_ONLY') {
            failedRecords += 1;
            errorReport.push({
              rowNumber: row.rowNumber,
              email: emailLower,
              reason: 'Pengguna sudah terdaftar (CREATE_ONLY)',
            });
            continue;
          }

          // UPSERT mode: update safe profile fields only (never overwrite password or Superadmin)
          await tx
            .update(users)
            .set({
              fullName: row.fullName.trim(),
              updatedAt: new Date(),
            })
            .where(eq(users.id, existing.id));

          await tx
            .update(userProfiles)
            .set({
              studyProgram: row.studyProgram,
              organizationalUnit: row.organizationalUnit,
              phone: row.phone || null,
              academicTitle: row.academicTitle || null,
              admissionYear: row.admissionYear ?? null,
              updatedAt: new Date(),
            })
            .where(eq(userProfiles.userId, existing.id));

          successfulRecords += 1;
          continue;
        }

        const randomPasswordHash = await hashPassword(generateRandomToken(24));
        const isActive = row.accountStatus === 'ACTIVE';

        const [inserted] = await tx
          .insert(users)
          .values({
            email: emailLower,
            fullName: row.fullName.trim(),
            identityNumber: row.identityNumber.trim(),
            passwordHash: randomPasswordHash,
            isActive,
            accountStatus: row.accountStatus,
            mustResetPassword: true, // Invitation / forced password setup on first login
          })
          .returning();

        await tx.insert(userProfiles).values({
          userId: inserted.id,
          studyProgram: row.studyProgram,
          organizationalUnit: row.organizationalUnit,
          phone: row.phone || null,
          academicTitle: row.academicTitle || null,
          nidn: row.roleCode === 'DOSEN' ? row.identityNumber.trim() : null,
          nim: row.roleCode === 'MAHASISWA' ? row.identityNumber.trim() : null,
          admissionYear: row.admissionYear ?? null,
          semesterLevel: row.roleCode === 'MAHASISWA' ? 1 : null,
        });

        const roleRow = roleByCode.get(row.roleCode);
        if (roleRow) {
          await tx.insert(userRoles).values({
            userId: inserted.id,
            roleId: roleRow.id,
          });
        }

        successfulRecords += 1;
      }

      const status =
        failedRecords === 0
          ? 'COMPLETED'
          : successfulRecords > 0
            ? 'PARTIAL'
            : 'FAILED';

      await tx.insert(userImportBatches).values({
        originalFilename: filename,
        importType,
        importMode,
        operatorId: actor.id,
        totalRecords: rows.length,
        successfulRecords,
        failedRecords,
        skippedRecords,
        status,
        errorReportJson: errorReport,
        fingerprint,
      });
    });

    await recordAuditLog({
      actorId: actor.id,
      action: 'USER_BULK_IMPORTED',
      entityType: 'USER_IMPORT',
      metadata: {
        filename,
        importType,
        importMode,
        totalRecords: rows.length,
        successfulRecords,
        failedRecords,
        skippedRecords,
      },
      ipAddress: req.ip,
    });

    return sendSuccess(
      reply,
      {
        filename,
        totalRecords: rows.length,
        successfulRecords,
        failedRecords,
        skippedRecords,
        errorReport,
      },
      null,
      201
    );
  });

  fastify.get('/api/v1/users/import/history', async (req, reply) => {
    const actor = await authenticateRequest(req, reply, {
      anyPermissions: ['users:read', 'users:manage'],
    });
    if (!actor) return;

    const batches = await db
      .select({
        id: userImportBatches.id,
        originalFilename: userImportBatches.originalFilename,
        importType: userImportBatches.importType,
        importMode: userImportBatches.importMode,
        totalRecords: userImportBatches.totalRecords,
        successfulRecords: userImportBatches.successfulRecords,
        failedRecords: userImportBatches.failedRecords,
        skippedRecords: userImportBatches.skippedRecords,
        status: userImportBatches.status,
        errorReportJson: userImportBatches.errorReportJson,
        createdAt: userImportBatches.createdAt,
        operatorName: users.fullName,
      })
      .from(userImportBatches)
      .leftJoin(users, eq(userImportBatches.operatorId, users.id))
      .orderBy(desc(userImportBatches.createdAt))
      .limit(30);

    return sendSuccess(reply, batches);
  });
}
