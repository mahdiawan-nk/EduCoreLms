import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  inArray,
  lte,
  or,
  sql,
} from 'drizzle-orm';
import { db } from '../db';
import {
  academicPeriods,
  announcements,
  assessmentAttempts,
  assessmentResults,
  assessments,
  assignmentSubmissions,
  assignments,
  auditLogs,
  campusBuildings,
  campusRooms,
  classroomApprovals,
  classroomEnrollments,
  classroomInstructors,
  classroomSchedules,
  classroomTopics,
  classrooms,
  comments,
  courses,
  learningMaterials,
  materialProgress,
  notifications,
  roles,
  submissionGrades,
  userProfiles,
  userRoles,
  users,
} from '../db/schema';
import {
  authenticateRequest,
  sendError,
  sendSuccess,
  type AuthenticatedUser,
} from './security';

function userHasPermission(user: AuthenticatedUser, permission: string): boolean {
  if (user.roles.some((r) => r.toUpperCase() === 'SUPERADMIN')) return true;
  return user.permissions.includes(permission);
}

const preferencesSchema = z.object({
  hiddenWidgets: z.array(z.string().max(64)).max(25).optional(),
  widgetOrder: z.array(z.string().max(64)).max(25).optional(),
  selectedPeriodId: z.string().uuid().nullable().optional(),
  viewDensity: z.enum(['comfortable', 'compact']).optional(),
});

function resolvePrimaryRole(
  userRolesList: string[]
): 'SUPERADMIN' | 'AUDITOR' | 'DOSEN' | 'MAHASISWA' {
  const upper = userRolesList.map((r) => r.toUpperCase());
  if (upper.includes('SUPERADMIN')) return 'SUPERADMIN';
  if (upper.includes('AUDITOR')) return 'AUDITOR';
  if (upper.includes('DOSEN')) return 'DOSEN';
  return 'MAHASISWA';
}

function normalizeVisibility(v?: string | null): 'PUBLIC' | 'PRIVATE' {
  const upper = (v || '').toUpperCase();
  if (upper === 'PUBLIC' || upper === 'CAMPUS_WIDE' || upper === 'PUBLIC_ENROLLED') {
    return 'PUBLIC';
  }
  return 'PRIVATE';
}

function categorizeNotification(type?: string | null, title?: string | null): string {
  const t = (type || '').toUpperCase();
  const text = (title || '').toUpperCase();
  if (t.includes('RBAC') || text.includes('RBAC') || text.includes('PERMISSION')) return 'RBAC';
  if (t.includes('SECURITY') || t.includes('PASSWORD') || text.includes('PASSWORD')) return 'SECURITY';
  if (t.includes('GRADE') || text.includes('NILAI')) return 'GRADE';
  if (t.includes('ASSESSMENT') || t.includes('EXAM') || text.includes('UJIAN') || text.includes('ASESMEN')) return 'ASSESSMENT';
  if (t.includes('ASSIGNMENT') || t.includes('SUBMISSION') || text.includes('TUGAS')) return 'ASSIGNMENT';
  if (t.includes('MATERIAL') || text.includes('MATERI')) return 'MATERIAL';
  if (t.includes('ANNOUNCEMENT') || text.includes('PENGUMUMAN')) return 'ANNOUNCEMENT';
  return 'SYSTEM';
}

function classifyAuditCategory(action: string, entityType: string): string {
  const a = action.toUpperCase();
  const e = entityType.toUpperCase();
  if (a.includes('PASSWORD') || a.includes('LOGIN') || a.includes('AUTH') || a.includes('SESSION')) {
    return 'AUTHENTICATION_SECURITY';
  }
  if (a.includes('RBAC') || e.includes('ROLE') || e.includes('PERMISSION')) {
    return 'RBAC_PERMISSION';
  }
  if (e.includes('MATERIAL') || e.includes('ASSESSMENT') || e.includes('ASSIGNMENT') || e.includes('GRADE')) {
    return 'ACADEMIC_CONTENT';
  }
  if (e.includes('CLASSROOM') || e.includes('PERIOD') || e.includes('ENROLLMENT')) {
    return 'ACADEMIC_MANAGEMENT';
  }
  return 'ADMINISTRATION';
}

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function logDashboardError(
  endpoint: string,
  userId: string | undefined,
  periodId: string | undefined,
  err: unknown
) {
  console.error(
    JSON.stringify({
      level: 'error',
      event: 'DASHBOARD_API_ERROR',
      endpoint,
      userId: userId || null,
      periodId: periodId || null,
      message: err instanceof Error ? err.message : String(err),
      timestamp: new Date().toISOString(),
    })
  );
}

async function loadPeriodsContext(requestedPeriodId?: string) {
  const trimmedPeriodId = requestedPeriodId?.trim();
  if (trimmedPeriodId && !UUID_REGEX.test(trimmedPeriodId)) {
    return {
      error: {
        statusCode: 400,
        code: 'VALIDATION_ERROR',
        message: 'Format parameter periodId harus berupa UUID yang valid.',
      },
    } as const;
  }

  const allPeriods = await db
    .select()
    .from(academicPeriods)
    .orderBy(desc(academicPeriods.isDefault), desc(academicPeriods.startDate));

  const activePeriod =
    allPeriods.find((p) => p.status === 'ACTIVE' && p.isDefault) ||
    allPeriods.find((p) => p.status === 'ACTIVE') ||
    allPeriods.find((p) => p.isDefault) ||
    allPeriods[0] ||
    null;

  let selectedPeriod = activePeriod;
  if (trimmedPeriodId) {
    const matched = allPeriods.find((p) => p.id === trimmedPeriodId);
    if (!matched) {
      return {
        error: {
          statusCode: 404,
          code: 'PERIOD_NOT_FOUND',
          message: 'Periode akademik yang diminta tidak ditemukan.',
        },
      } as const;
    }
    selectedPeriod = matched;
  }

  let previousPeriod: (typeof allPeriods)[number] | null = null;
  if (selectedPeriod) {
    const selectedStart = new Date(selectedPeriod.startDate).getTime();
    previousPeriod =
      allPeriods.find(
        (p) =>
          p.id !== selectedPeriod.id &&
          new Date(p.startDate).getTime() < selectedStart
      ) || null;
  }

  return {
    error: null,
    allPeriods,
    activePeriod,
    selectedPeriod,
    previousPeriod,
  } as const;
}

export async function registerDashboardRoutes(fastify: FastifyInstance) {
  // 1. Global Profile Summary + Active Period + Preferences + Categorized Notifications
  fastify.get('/api/v1/dashboards/me', async (req, reply) => {
    const user = await authenticateRequest(req, reply);
    if (!user) return;

    const query = req.query as { periodId?: string };

    const [userRow] = await db.select().from(users).where(eq(users.id, user.id));
    const [profileRow] = await db
      .select()
      .from(userProfiles)
      .where(eq(userProfiles.userId, user.id));

    const periodCtx = await loadPeriodsContext(query.periodId);
    if (periodCtx.error) {
      return sendError(
        reply,
        periodCtx.error.statusCode,
        periodCtx.error.code,
        periodCtx.error.message
      );
    }
    const { allPeriods, activePeriod, selectedPeriod } = periodCtx;

    const recentNotifs = await db
      .select()
      .from(notifications)
      .where(eq(notifications.userId, user.id))
      .orderBy(desc(notifications.createdAt))
      .limit(12);

    const [unreadCountRow] = await db
      .select({ total: count() })
      .from(notifications)
      .where(and(eq(notifications.userId, user.id), eq(notifications.isRead, false)));

    const primaryRole = resolvePrimaryRole(user.roles);

    return sendSuccess(reply, {
      primaryRole,
      profileSummary: {
        id: user.id,
        fullName: userRow?.fullName || user.fullName,
        email: userRow?.email || user.email,
        avatarUrl: profileRow?.avatarUrl || null,
        identityNumber:
          userRow?.identityNumber ||
          profileRow?.nim ||
          profileRow?.nidn ||
          profileRow?.nip ||
          user.identityNumber ||
          null,
        primaryRole,
        roles: user.roles,
        permissions: user.permissions,
        accountStatus: userRow?.accountStatus || 'ACTIVE',
        isActive: userRow?.isActive ?? true,
        lastLoginAt: userRow?.lastLoginAt ? userRow.lastLoginAt.toISOString() : null,
        studyProgram: profileRow?.studyProgram || user.studyProgram || 'Teknik Informatika',
        organizationalUnit: profileRow?.organizationalUnit || 'Politeknik Kampar',
        academicStatus: profileRow?.academicStatus || 'AKTIF',
        nip: profileRow?.nip || null,
        nidn: profileRow?.nidn || null,
        nim: profileRow?.nim || null,
        academicTitle: profileRow?.academicTitle || null,
        semesterLevel: profileRow?.semesterLevel ?? null,
        admissionYear: profileRow?.admissionYear ?? null,
        auditScope: profileRow?.auditScope || null,
      },
      activePeriod,
      selectedPeriod,
      availablePeriods: allPeriods.map((p) => ({
        id: p.id,
        code: p.code,
        name: p.name,
        academicYear: p.academicYear,
        semesterType: p.semesterType,
        startDate: p.startDate,
        endDate: p.endDate,
        status: p.status,
        isDefault: p.isDefault,
      })),
      preferences: (profileRow?.dashboardPreferences as Record<string, unknown>) || {},
      notificationsSummary: {
        unreadCount: Number(unreadCountRow?.total || 0),
        items: recentNotifs.map((n) => ({
          id: n.id,
          title: n.title,
          message: n.message,
          type: n.type,
          category: categorizeNotification(n.type, n.title),
          linkUrl: n.linkUrl,
          isRead: n.isRead,
          createdAt: n.createdAt,
        })),
      },
    });
  });

  // 2. Dashboard Personalization Preferences (AUDITOR blocked by centralized guard)
  fastify.put('/api/v1/dashboards/preferences', async (req, reply) => {
    const user = await authenticateRequest(req, reply, { requireCsrf: true });
    if (!user) return;

    const parsed = preferencesSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return sendError(reply, 400, 'VALIDATION_ERROR', 'Preferensi dashboard tidak valid', parsed.error.issues);
    }

    const [existing] = await db
      .select()
      .from(userProfiles)
      .where(eq(userProfiles.userId, user.id));

    const currentPrefs = (existing?.dashboardPreferences as Record<string, unknown>) || {};
    const mergedPrefs = {
      ...currentPrefs,
      ...parsed.data,
    };

    if (existing) {
      await db
        .update(userProfiles)
        .set({
          dashboardPreferences: mergedPrefs,
          updatedAt: new Date(),
        })
        .where(eq(userProfiles.userId, user.id));
    } else {
      await db.insert(userProfiles).values({
        userId: user.id,
        dashboardPreferences: mergedPrefs,
      });
    }

    return sendSuccess(reply, mergedPrefs);
  });

  // 3. SUPERADMIN Institutional Academic Dashboard
  fastify.get('/api/v1/dashboards/superadmin', async (req, reply) => {
    const user = await authenticateRequest(req, reply, {
      requiredPermissions: ['classrooms:manage_all'],
    });
    if (!user) return;

    const query = req.query as {
      periodId?: string;
      auditCategory?: string;
      auditModule?: string;
      auditActorId?: string;
      auditFrom?: string;
      auditTo?: string;
      auditPage?: string;
      auditLimit?: string;
    };

    const periodCtx = await loadPeriodsContext(query.periodId);
    if (periodCtx.error) {
      return sendError(
        reply,
        periodCtx.error.statusCode,
        periodCtx.error.code,
        periodCtx.error.message
      );
    }
    const { selectedPeriod, previousPeriod } = periodCtx;

    const [allUsers, roleRows, userRoleRows, allClassrooms, allEnrollments, allInstructors, approvalRows] =
      await Promise.all([
        db
          .select({
            id: users.id,
            fullName: users.fullName,
            isActive: users.isActive,
            accountStatus: users.accountStatus,
          })
          .from(users),
        db.select().from(roles),
        db.select().from(userRoles),
        db
          .select({
            id: classrooms.id,
            name: classrooms.name,
            code: classrooms.classroomCode,
            studyProgram: courses.studyProgram,
            visibility: classrooms.visibility,
            lifecycleStatus: classrooms.lifecycleStatus,
            academicPeriodId: classrooms.academicPeriodId,
            createdById: classrooms.createdById,
          })
          .from(classrooms)
          .leftJoin(courses, eq(classrooms.courseId, courses.id)),
        db
          .select({
            classroomId: classroomEnrollments.classroomId,
            studentId: classroomEnrollments.studentId,
            status: classroomEnrollments.status,
          })
          .from(classroomEnrollments),
        db
          .select({
            classroomId: classroomInstructors.classroomId,
            instructorId: classroomInstructors.instructorId,
            role: classroomInstructors.role,
          })
          .from(classroomInstructors),
        db
          .select({
            id: classroomApprovals.id,
            status: classroomApprovals.status,
          })
          .from(classroomApprovals),
      ]);

    const roleCodeById = new Map(roleRows.map((r) => [r.id, r.code.toUpperCase()]));
    const activeUserIds = new Set(allUsers.filter((u) => u.isActive).map((u) => u.id));
    const userNameById = new Map(allUsers.map((u) => [u.id, u.fullName]));

    let activeStudents = 0;
    let activeLecturers = 0;
    let totalAuditors = 0;
    const seenStudent = new Set<string>();
    const seenLecturer = new Set<string>();
    const seenAuditor = new Set<string>();

    for (const ur of userRoleRows) {
      const code = roleCodeById.get(ur.roleId);
      if (code === 'MAHASISWA' && activeUserIds.has(ur.userId) && !seenStudent.has(ur.userId)) {
        seenStudent.add(ur.userId);
        activeStudents++;
      } else if (code === 'DOSEN' && activeUserIds.has(ur.userId) && !seenLecturer.has(ur.userId)) {
        seenLecturer.add(ur.userId);
        activeLecturers++;
      } else if (code === 'AUDITOR' && !seenAuditor.has(ur.userId)) {
        seenAuditor.add(ur.userId);
        totalAuditors++;
      }
    }

    const periodClassrooms = selectedPeriod
      ? allClassrooms.filter((c) => !c.academicPeriodId || c.academicPeriodId === selectedPeriod.id)
      : allClassrooms;

    const activeClassrooms = allClassrooms.filter((c) => c.lifecycleStatus === 'active').length;
    const archivedClassrooms = allClassrooms.filter((c) => c.lifecycleStatus === 'archived').length;
    const draftClassrooms = allClassrooms.filter((c) => c.lifecycleStatus === 'draft').length;
    const pendingApprovalClassrooms = allClassrooms.filter((c) => c.lifecycleStatus === 'pending_approval').length;
    const completedClassrooms = allClassrooms.filter((c) => c.lifecycleStatus === 'completed').length;
    const publicClassrooms = allClassrooms.filter((c) => normalizeVisibility(c.visibility) === 'PUBLIC').length;
    const privateClassrooms = allClassrooms.length - publicClassrooms;

    const activeEnrollments = allEnrollments.filter((e) => e.status === 'active');
    const enrolledClassroomIds = new Set(activeEnrollments.map((e) => e.classroomId));
    const instructedClassroomIds = new Set(allInstructors.map((i) => i.classroomId));

    const [{ totalMaterials }] = await db.select({ totalMaterials: count() }).from(learningMaterials);
    const [{ totalAssignments }] = await db.select({ totalAssignments: count() }).from(assignments);
    const [{ totalAssessments }] = await db.select({ totalAssessments: count() }).from(assessments);

    const pendingApprovalsCount =
      pendingApprovalClassrooms +
      approvalRows.filter((a) => a.status === 'PENDING').length;

    // Period comparison
    const currentPeriodClassIds = new Set(
      selectedPeriod
        ? allClassrooms.filter((c) => c.academicPeriodId === selectedPeriod.id).map((c) => c.id)
        : allClassrooms.map((c) => c.id)
    );
    const prevPeriodClassIds = new Set(
      previousPeriod
        ? allClassrooms.filter((c) => c.academicPeriodId === previousPeriod.id).map((c) => c.id)
        : []
    );

    const currentPeriodEnrollments = activeEnrollments.filter((e) =>
      currentPeriodClassIds.has(e.classroomId)
    ).length;
    const previousPeriodEnrollments = activeEnrollments.filter((e) =>
      prevPeriodClassIds.has(e.classroomId)
    ).length;

    // Distribution by study program
    const studyProgramMap = new Map<
      string,
      { studyProgram: string; count: number; activeCount: number; enrolledStudents: number }
    >();
    const activeEnrollCountByClass = new Map<string, number>();
    for (const e of activeEnrollments) {
      activeEnrollCountByClass.set(
        e.classroomId,
        (activeEnrollCountByClass.get(e.classroomId) || 0) + 1
      );
    }

    for (const cls of periodClassrooms) {
      const sp = cls.studyProgram || 'Umum';
      const entry = studyProgramMap.get(sp) || {
        studyProgram: sp,
        count: 0,
        activeCount: 0,
        enrolledStudents: 0,
      };
      entry.count += 1;
      if (cls.lifecycleStatus === 'active') entry.activeCount += 1;
      entry.enrolledStudents += activeEnrollCountByClass.get(cls.id) || 0;
      studyProgramMap.set(sp, entry);
    }

    // Distribution by lecturer
    const lecturerMap = new Map<
      string,
      { instructorId: string; fullName: string; classroomCount: number; studentCount: number }
    >();
    const classProcessedForLecturer = new Set<string>();
    for (const inst of allInstructors) {
      const key = `${inst.instructorId}:${inst.classroomId}`;
      if (classProcessedForLecturer.has(key)) continue;
      classProcessedForLecturer.add(key);
      const existing = lecturerMap.get(inst.instructorId) || {
        instructorId: inst.instructorId,
        fullName: userNameById.get(inst.instructorId) || 'Dosen',
        classroomCount: 0,
        studentCount: 0,
      };
      existing.classroomCount += 1;
      existing.studentCount += activeEnrollCountByClass.get(inst.classroomId) || 0;
      lecturerMap.set(inst.instructorId, existing);
    }

    // Semester activity summary
    const periodIdsArray = Array.from(currentPeriodClassIds);
    let materialsInPeriod = 0;
    let assignmentsInPeriod = 0;
    let assessmentsInPeriod = 0;
    if (periodIdsArray.length > 0) {
      const [mRes, aRes, eRes] = await Promise.all([
        db
          .select({ total: count() })
          .from(learningMaterials)
          .where(inArray(learningMaterials.classroomId, periodIdsArray)),
        db
          .select({ total: count() })
          .from(assignments)
          .where(inArray(assignments.classroomId, periodIdsArray)),
        db
          .select({ total: count() })
          .from(assessments)
          .where(inArray(assessments.classroomId, periodIdsArray)),
      ]);
      materialsInPeriod = Number(mRes[0]?.total || 0);
      assignmentsInPeriod = Number(aRes[0]?.total || 0);
      assessmentsInPeriod = Number(eRes[0]?.total || 0);
    }

    // RBAC-gated Audit Feed
    let auditFeed: {
      items: any[];
      page: number;
      limit: number;
      total: number;
      totalPages: number;
      canViewAudit: boolean;
    } = {
      items: [],
      page: 1,
      limit: 10,
      total: 0,
      totalPages: 1,
      canViewAudit: false,
    };

    if (userHasPermission(user, 'audit:view')) {
      const auditPage = Math.max(1, parseInt(query.auditPage || '1', 10));
      const auditLimit = Math.min(30, Math.max(1, parseInt(query.auditLimit || '8', 10)));
      const conditions = [];
      if (query.auditActorId) {
        conditions.push(eq(auditLogs.actorId, query.auditActorId));
      }
      if (query.auditModule) {
        conditions.push(eq(auditLogs.entityType, query.auditModule));
      }
      if (query.auditFrom) {
        conditions.push(gte(auditLogs.createdAt, new Date(query.auditFrom)));
      }
      if (query.auditTo) {
        const endD = new Date(query.auditTo);
        endD.setHours(23, 59, 59, 999);
        conditions.push(lte(auditLogs.createdAt, endD));
      }

      const rawAudit = await db
        .select({
          id: auditLogs.id,
          actorId: auditLogs.actorId,
          actorName: users.fullName,
          actorEmail: users.email,
          action: auditLogs.action,
          entityType: auditLogs.entityType,
          entityId: auditLogs.entityId,
          metadata: auditLogs.metadata,
          ipAddress: auditLogs.ipAddress,
          createdAt: auditLogs.createdAt,
        })
        .from(auditLogs)
        .leftJoin(users, eq(auditLogs.actorId, users.id))
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(auditLogs.createdAt))
        .limit(200);

      const categoryFiltered = query.auditCategory
        ? rawAudit.filter(
            (r) => classifyAuditCategory(r.action, r.entityType) === query.auditCategory
          )
        : rawAudit;

      const total = categoryFiltered.length;
      const items = categoryFiltered
        .slice((auditPage - 1) * auditLimit, auditPage * auditLimit)
        .map((r) => ({
          ...r,
          category: classifyAuditCategory(r.action, r.entityType),
        }));

      auditFeed = {
        items,
        page: auditPage,
        limit: auditLimit,
        total,
        totalPages: Math.max(1, Math.ceil(total / auditLimit)),
        canViewAudit: true,
      };
    }

    return sendSuccess(reply, {
      totalClassrooms: allClassrooms.length,
      activeClassrooms,
      totalLecturers: activeLecturers,
      totalStudents: activeStudents,
      overview: {
        totalUsers: allUsers.length,
        activeStudents,
        activeLecturers,
        totalAuditors,
        totalClassrooms: allClassrooms.length,
        activeClassrooms,
        archivedClassrooms,
        draftClassrooms,
        pendingApprovalClassrooms,
        completedClassrooms,
        totalMaterials: Number(totalMaterials || 0),
        totalAssignments: Number(totalAssignments || 0),
        totalAssessments: Number(totalAssessments || 0),
        totalActiveEnrollments: activeEnrollments.length,
        pendingApprovalsCount,
        classesWithoutStudents: allClassrooms.filter((c) => !enrolledClassroomIds.has(c.id)).length,
        classesWithoutLecturers: allClassrooms.filter((c) => !instructedClassroomIds.has(c.id)).length,
        // Keep backward-compatible flat keys for any existing consumers
        totalLecturers: activeLecturers,
        totalStudents: activeStudents,
      },
      periodComparison: previousPeriod
        ? {
            hasPreviousPeriod: true,
            currentPeriodName: selectedPeriod?.name || null,
            previousPeriodName: previousPeriod.name,
            currentClassrooms: currentPeriodClassIds.size,
            previousClassrooms: prevPeriodClassIds.size,
            currentEnrollments: currentPeriodEnrollments,
            previousEnrollments: previousPeriodEnrollments,
          }
        : {
            hasPreviousPeriod: false,
            currentPeriodName: selectedPeriod?.name || null,
            previousPeriodName: null,
            currentClassrooms: currentPeriodClassIds.size,
            previousClassrooms: 0,
            currentEnrollments: currentPeriodEnrollments,
            previousEnrollments: 0,
          },
      periodOverview: selectedPeriod
        ? {
            id: selectedPeriod.id,
            code: selectedPeriod.code,
            name: selectedPeriod.name,
            academicYear: selectedPeriod.academicYear,
            semesterType: selectedPeriod.semesterType,
            startDate: selectedPeriod.startDate,
            endDate: selectedPeriod.endDate,
            status: selectedPeriod.status,
            isDefault: selectedPeriod.isDefault,
            classroomsInPeriod: currentPeriodClassIds.size,
            enrollmentsInPeriod: currentPeriodEnrollments,
            materialsInPeriod,
            assignmentsInPeriod,
            assessmentsInPeriod,
          }
        : null,
      classroomOverview: {
        totalClassrooms: allClassrooms.length,
        activeClassrooms,
        publicClassrooms,
        privateClassrooms,
        enrolledStudentsCount: activeEnrollments.length,
        byStudyProgram: Array.from(studyProgramMap.values()).sort((a, b) => b.count - a.count),
        byLecturer: Array.from(lecturerMap.values())
          .sort((a, b) => b.classroomCount - a.classroomCount || b.studentCount - a.studentCount)
          .slice(0, 8),
      },
      auditFeed,
    });
  });

  // 4. DOSEN Teaching & Academic Activity Dashboard
  fastify.get('/api/v1/dashboards/lecturer', async (req, reply) => {
    const user = await authenticateRequest(req, reply, {
      requiredPermissions: ['classrooms:teach'],
    });
    if (!user) return;

    const query = req.query as { periodId?: string };

    try {
      const periodCtx = await loadPeriodsContext(query.periodId);
      if (periodCtx.error) {
        return sendError(
          reply,
          periodCtx.error.statusCode,
          periodCtx.error.code,
          periodCtx.error.message
        );
      }

      const [userRow] = await db.select().from(users).where(eq(users.id, user.id));
      const [profileRow] = await db
        .select()
        .from(userProfiles)
        .where(eq(userProfiles.userId, user.id));

      const lecturerProfile = {
        id: user.id,
        fullName: userRow?.fullName || user.fullName,
        email: userRow?.email || user.email,
        nidn: profileRow?.nidn || null,
        nip: profileRow?.nip || null,
        identityNumber: userRow?.identityNumber || profileRow?.nidn || profileRow?.nip || null,
        studyProgram: profileRow?.studyProgram || user.studyProgram || 'Teknik Informatika',
        organizationalUnit: profileRow?.organizationalUnit || 'Politeknik Kampar',
        academicTitle: profileRow?.academicTitle || null,
      };

      // Classrooms owned by user OR assigned as instructor/co-lecturer
      const instructorLinks = await db
        .select({
          classroomId: classroomInstructors.classroomId,
          role: classroomInstructors.role,
        })
        .from(classroomInstructors)
        .where(eq(classroomInstructors.instructorId, user.id));

      const instructedClassIds = instructorLinks.map((l) => l.classroomId);
      const instructorRoleByClass = new Map(instructorLinks.map((l) => [l.classroomId, l.role]));

      const myClassRows = await db
        .select({
          cls: classrooms,
          course: courses,
        })
        .from(classrooms)
        .leftJoin(courses, eq(classrooms.courseId, courses.id))
        .where(
          instructedClassIds.length > 0
            ? or(
                eq(classrooms.createdById, user.id),
                inArray(classrooms.id, instructedClassIds)
              )
            : eq(classrooms.createdById, user.id)
        )
        .orderBy(desc(classrooms.updatedAt));

      const explicitPeriod = query.periodId?.trim();
      const targetPeriodId = periodCtx.selectedPeriod?.id;
      const filteredClassRows = targetPeriodId
        ? myClassRows.filter((r) =>
            explicitPeriod
              ? r.cls.academicPeriodId === targetPeriodId
              : !r.cls.academicPeriodId || r.cls.academicPeriodId === targetPeriodId
          )
        : myClassRows;

      const myClassroomIds = filteredClassRows.map((r) => r.cls.id);

      if (myClassroomIds.length === 0) {
        return sendSuccess(reply, {
          myClassroomsCount: 0,
          profile: lecturerProfile,
          activePeriod: periodCtx.selectedPeriod,
          overview: {
            totalClassrooms: 0,
            activeClassrooms: 0,
            totalStudents: 0,
            publishedMaterialsCount: 0,
            activeAssignmentsCount: 0,
            activeAssessmentsCount: 0,
            ungradedSubmissionsCount: 0,
            pendingEssayGradingCount: 0,
            lowProgressStudentsCount: 0,
            myClassroomsCount: 0,
            activeClassesCount: 0,
            pendingEnrollmentsCount: 0,
            pendingGradingCount: 0,
          },
          classrooms: [],
          teachingActivity: {
            recentMaterials: [],
            recentAssignments: [],
            recentAssessments: [],
            recentSubmissions: [],
            recentDiscussions: [],
          },
          studentMonitoring: {
            notStartedCount: 0,
            inProgressCount: 0,
            completedCount: 0,
            notSubmittedAssignmentsCount: 0,
            belowThresholdGradesCount: 0,
            studentsNeedingAttention: [],
          },
        });
      }

    const [
      allEnrollments,
      allCoInstructors,
      allMaterials,
      allAssignments,
      allAssessments,
      allComments,
    ] = await Promise.all([
      db
        .select({
          classroomId: classroomEnrollments.classroomId,
          studentId: classroomEnrollments.studentId,
          status: classroomEnrollments.status,
          fullName: users.fullName,
          identityNumber: users.identityNumber,
        })
        .from(classroomEnrollments)
        .innerJoin(users, eq(classroomEnrollments.studentId, users.id))
        .where(inArray(classroomEnrollments.classroomId, myClassroomIds)),
      db
        .select({
          classroomId: classroomInstructors.classroomId,
          instructorId: classroomInstructors.instructorId,
          role: classroomInstructors.role,
          fullName: users.fullName,
        })
        .from(classroomInstructors)
        .innerJoin(users, eq(classroomInstructors.instructorId, users.id))
        .where(inArray(classroomInstructors.classroomId, myClassroomIds)),
      db
        .select()
        .from(learningMaterials)
        .where(inArray(learningMaterials.classroomId, myClassroomIds))
        .orderBy(desc(learningMaterials.updatedAt)),
      db
        .select()
        .from(assignments)
        .where(inArray(assignments.classroomId, myClassroomIds))
        .orderBy(desc(assignments.createdAt)),
      db
        .select()
        .from(assessments)
        .where(inArray(assessments.classroomId, myClassroomIds))
        .orderBy(desc(assessments.createdAt)),
      db
        .select({
          id: comments.id,
          classroomId: comments.classroomId,
          content: comments.content,
          createdAt: comments.createdAt,
          authorName: users.fullName,
        })
        .from(comments)
        .innerJoin(users, eq(comments.authorId, users.id))
        .where(inArray(comments.classroomId, myClassroomIds))
        .orderBy(desc(comments.createdAt))
        .limit(8),
    ]);

    const publishedMaterials = allMaterials.filter((m) => m.status === 'PUBLISHED');
    const publishedMaterialIds = publishedMaterials.map((m) => m.id);
    const assignmentIds = allAssignments.map((a) => a.id);
    const assessmentIds = allAssessments.map((a) => a.id);

    const [matProgressRows, subRows, gradeRows, attemptRows] = await Promise.all([
      publishedMaterialIds.length > 0
        ? db
            .select()
            .from(materialProgress)
            .where(inArray(materialProgress.materialId, publishedMaterialIds))
        : Promise.resolve([]),
      assignmentIds.length > 0
        ? db
            .select({
              id: assignmentSubmissions.id,
              assignmentId: assignmentSubmissions.assignmentId,
              studentId: assignmentSubmissions.studentId,
              gradingStatus: assignmentSubmissions.gradingStatus,
              submittedAt: assignmentSubmissions.submittedAt,
              studentName: users.fullName,
            })
            .from(assignmentSubmissions)
            .innerJoin(users, eq(assignmentSubmissions.studentId, users.id))
            .where(inArray(assignmentSubmissions.assignmentId, assignmentIds))
            .orderBy(desc(assignmentSubmissions.submittedAt))
        : Promise.resolve([]),
      assignmentIds.length > 0
        ? db
            .select({
              assignmentId: submissionGrades.assignmentId,
              studentId: submissionGrades.studentId,
              finalScore: submissionGrades.finalScore,
              maxScore: submissionGrades.maxScore,
            })
            .from(submissionGrades)
            .where(inArray(submissionGrades.assignmentId, assignmentIds))
        : Promise.resolve([]),
      assessmentIds.length > 0
        ? db
            .select({
              id: assessmentAttempts.id,
              assessmentId: assessmentAttempts.assessmentId,
              studentId: assessmentAttempts.studentId,
              status: assessmentAttempts.status,
              essayGradingStatus: assessmentAttempts.essayGradingStatus,
              percentageScore: assessmentAttempts.percentageScore,
            })
            .from(assessmentAttempts)
            .where(inArray(assessmentAttempts.assessmentId, assessmentIds))
        : Promise.resolve([]),
    ]);

    const activeEnrollments = allEnrollments.filter((e) => e.status === 'active');
    const pendingEnrollmentsCount = allEnrollments.filter((e) => e.status === 'pending').length;
    const uniqueStudentIds = new Set(activeEnrollments.map((e) => e.studentId));

    const ungradedSubmissions = subRows.filter((s) => s.gradingStatus === 'SUBMITTED');
    const pendingEssayAttempts = attemptRows.filter((a) =>
      ['PENDING', 'IN_PROGRESS', 'DRAFT_SAVED'].includes(a.essayGradingStatus)
    );

    // Map published materials per classroom
    const materialsByClass = new Map<string, string[]>();
    for (const m of publishedMaterials) {
      const list = materialsByClass.get(m.classroomId) || [];
      list.push(m.id);
      materialsByClass.set(m.classroomId, list);
    }

    const completedMatSet = new Set(
      matProgressRows
        .filter((mp) => mp.status === 'COMPLETED')
        .map((mp) => `${mp.studentId}:${mp.materialId}`)
    );
    const startedMatSet = new Set(
      matProgressRows.map((mp) => `${mp.studentId}:${mp.materialId}`)
    );

    let notStartedCount = 0;
    let inProgressCount = 0;
    let completedCount = 0;
    let lowProgressStudentsCount = 0;
    const studentsNeedingAttention: any[] = [];
    const classroomNameMap = new Map(filteredClassRows.map((r) => [r.cls.id, r.cls.name]));

    for (const enr of activeEnrollments) {
      const matIds = materialsByClass.get(enr.classroomId) || [];
      if (matIds.length === 0) continue;
      let done = 0;
      let touched = 0;
      for (const mid of matIds) {
        if (completedMatSet.has(`${enr.studentId}:${mid}`)) done++;
        if (startedMatSet.has(`${enr.studentId}:${mid}`)) touched++;
      }
      const pct = Math.round((done / matIds.length) * 100);
      if (done === matIds.length) {
        completedCount++;
      } else if (touched > 0) {
        inProgressCount++;
      } else {
        notStartedCount++;
      }
      if (pct < 40) {
        lowProgressStudentsCount++;
        studentsNeedingAttention.push({
          studentId: enr.studentId,
          fullName: enr.fullName,
          nim: enr.identityNumber || '-',
          classroomId: enr.classroomId,
          classroomName: classroomNameMap.get(enr.classroomId) || 'Kelas',
          progressPercent: pct,
          status: touched === 0 ? 'NOT_STARTED' : 'LOW_PROGRESS',
        });
      }
    }

    // Active assignments missing submissions count
    const publishedAssignments = allAssignments.filter((a) => a.status === 'PUBLISHED');
    const submittedPairSet = new Set(subRows.map((s) => `${s.assignmentId}:${s.studentId}`));
    let notSubmittedAssignmentsCount = 0;
    for (const asg of publishedAssignments) {
      const enrolledInClass = activeEnrollments.filter((e) => e.classroomId === asg.classroomId);
      for (const st of enrolledInClass) {
        if (!submittedPairSet.has(`${asg.id}:${st.studentId}`)) {
          notSubmittedAssignmentsCount++;
        }
      }
    }

    const belowThresholdGradesCount =
      gradeRows.filter((g) => Number(g.finalScore) < 60).length +
      attemptRows.filter((a) => a.status === 'GRADED' && Number(a.percentageScore) < 60).length;

    const assignmentMap = new Map(allAssignments.map((a) => [a.id, a]));

      return sendSuccess(reply, {
        myClassroomsCount: filteredClassRows.length,
        profile: lecturerProfile,
        activePeriod: periodCtx.selectedPeriod,
        overview: {
        totalClassrooms: filteredClassRows.length,
        activeClassrooms: filteredClassRows.filter((r) => r.cls.lifecycleStatus === 'active').length,
        totalStudents: uniqueStudentIds.size,
        publishedMaterialsCount: publishedMaterials.length,
        activeAssignmentsCount: publishedAssignments.length,
        activeAssessmentsCount: allAssessments.filter((a) =>
          ['PUBLISHED', 'SCHEDULED'].includes(a.status)
        ).length,
        ungradedSubmissionsCount: ungradedSubmissions.length,
        pendingEssayGradingCount: pendingEssayAttempts.length,
        lowProgressStudentsCount,
        // Backward-compatible keys
        myClassroomsCount: filteredClassRows.length,
        activeClassesCount: filteredClassRows.filter((r) => r.cls.lifecycleStatus === 'active').length,
        pendingEnrollmentsCount,
        pendingGradingCount: ungradedSubmissions.length,
      },
      classrooms: filteredClassRows.map((r) => {
        const clsEnrolls = activeEnrollments.filter((e) => e.classroomId === r.cls.id);
        const clsMats = materialsByClass.get(r.cls.id) || [];
        let totalDone = 0;
        if (clsMats.length > 0 && clsEnrolls.length > 0) {
          for (const e of clsEnrolls) {
            for (const mid of clsMats) {
              if (completedMatSet.has(`${e.studentId}:${mid}`)) totalDone++;
            }
          }
        }
        const activityProgressPercent =
          clsMats.length > 0 && clsEnrolls.length > 0
            ? Math.round((totalDone / (clsMats.length * clsEnrolls.length)) * 100)
            : 0;

        const coLecturers = allCoInstructors
          .filter((ci) => ci.classroomId === r.cls.id && ci.instructorId !== user.id)
          .map((ci) => ({ id: ci.instructorId, fullName: ci.fullName, role: ci.role }));

        return {
          id: r.cls.id,
          code: r.cls.classroomCode || r.cls.subjectCode || 'KLS',
          name: r.cls.name,
          section: r.cls.section,
          courseCode: r.cls.subjectCode || r.course?.code || r.cls.classroomCode || 'KLS',
          courseTitle: r.cls.subjectName || r.course?.title || r.cls.name,
          studyProgram: r.course?.studyProgram || 'Teknik Informatika',
          semesterLabel: r.cls.semesterName || '-',
          studentCount: clsEnrolls.length,
          status: r.cls.lifecycleStatus,
          visibility: normalizeVisibility(r.cls.visibility),
          isOwner: r.cls.createdById === user.id || instructorRoleByClass.get(r.cls.id) === 'PRIMARY',
          isCoLecturer: r.cls.createdById !== user.id && instructorRoleByClass.has(r.cls.id),
          coLecturers,
          activityProgressPercent,
        };
      }),
      teachingActivity: {
        recentMaterials: publishedMaterials.slice(0, 5).map((m) => ({
          id: m.id,
          classroomId: m.classroomId,
          classroomName: classroomNameMap.get(m.classroomId) || 'Kelas',
          title: m.title,
          publishedAt: m.publishedAt || m.updatedAt,
        })),
        recentAssignments: allAssignments.slice(0, 5).map((a) => ({
          id: a.id,
          classroomId: a.classroomId,
          classroomName: classroomNameMap.get(a.classroomId) || 'Kelas',
          title: a.title,
          status: a.status,
          dueDate: a.dueAt,
        })),
        recentAssessments: allAssessments.slice(0, 5).map((a) => ({
          id: a.id,
          classroomId: a.classroomId,
          classroomName: classroomNameMap.get(a.classroomId) || 'Kelas',
          title: a.title,
          category: a.category,
          status: a.status,
          startDate: a.startDate,
        })),
        recentSubmissions: subRows.slice(0, 6).map((s) => {
          const asg = assignmentMap.get(s.assignmentId);
          return {
            id: s.id,
            assignmentId: s.assignmentId,
            assignmentTitle: asg?.title || 'Tugas',
            classroomId: asg?.classroomId || '',
            classroomName: asg ? classroomNameMap.get(asg.classroomId) || 'Kelas' : 'Kelas',
            studentName: s.studentName,
            gradingStatus: s.gradingStatus,
            submittedAt: s.submittedAt,
          };
        }),
        recentDiscussions: allComments.map((c) => ({
          id: c.id,
          classroomId: c.classroomId,
          classroomName: classroomNameMap.get(c.classroomId) || 'Kelas',
          authorName: c.authorName,
          content: c.content,
          createdAt: c.createdAt,
        })),
      },
      studentMonitoring: {
        notStartedCount,
        inProgressCount,
        completedCount,
        notSubmittedAssignmentsCount,
        belowThresholdGradesCount,
        studentsNeedingAttention: studentsNeedingAttention.slice(0, 8),
      },
    });
    } catch (err) {
      logDashboardError('/api/v1/dashboards/lecturer', user.id, query.periodId, err);
      return sendError(
        reply,
        500,
        'INTERNAL_SERVER_ERROR',
        'Terjadi kesalahan internal saat memuat dashboard dosen.'
      );
    }
  });

  // 5. MAHASISWA Student Learning Dashboard
  fastify.get('/api/v1/dashboards/student', async (req, reply) => {
    const user = await authenticateRequest(req, reply, {
      requiredPermissions: ['classrooms:view'],
    });
    if (!user) return;

    const query = req.query as { periodId?: string };

    try {
      const periodCtx = await loadPeriodsContext(query.periodId);
      if (periodCtx.error) {
        return sendError(
          reply,
          periodCtx.error.statusCode,
          periodCtx.error.code,
          periodCtx.error.message
        );
      }

      const [userRow] = await db.select().from(users).where(eq(users.id, user.id));
      const [profileRow] = await db
        .select()
        .from(userProfiles)
        .where(eq(userProfiles.userId, user.id));

      const studentProfile = {
        id: user.id,
        fullName: userRow?.fullName || user.fullName,
        email: userRow?.email || user.email,
        nim: profileRow?.nim || userRow?.identityNumber || null,
        studyProgram: profileRow?.studyProgram || user.studyProgram || 'Teknik Informatika',
        semesterLevel: profileRow?.semesterLevel ?? null,
        admissionYear: profileRow?.admissionYear ?? null,
        academicStatus: profileRow?.academicStatus || 'AKTIF',
      };

      const myEnrollments = await db
        .select({
          enroll: classroomEnrollments,
          cls: classrooms,
          course: courses,
        })
        .from(classroomEnrollments)
        .innerJoin(classrooms, eq(classroomEnrollments.classroomId, classrooms.id))
        .leftJoin(courses, eq(classrooms.courseId, courses.id))
        .where(eq(classroomEnrollments.studentId, user.id));

      const explicitPeriod = query.periodId?.trim();
      const targetPeriodId = periodCtx.selectedPeriod?.id;

      const activeEnrolls = myEnrollments.filter((e) => {
        if (e.enroll.status !== 'active') return false;
        if (targetPeriodId) {
          return explicitPeriod
            ? e.cls.academicPeriodId === targetPeriodId
            : !e.cls.academicPeriodId || e.cls.academicPeriodId === targetPeriodId;
        }
        return true;
      });

      const activeClassIds = activeEnrolls.map((e) => e.cls.id);

      if (activeClassIds.length === 0) {
        return sendSuccess(reply, {
          enrolledCount: 0,
          profile: studentProfile,
          activePeriod: periodCtx.selectedPeriod,
          overview: {
            enrolledCount: 0,
            activeClassroomsCount: 0,
            pendingCount: myEnrollments.filter((e) => e.enroll.status === 'pending').length,
            totalCredits: 0,
            incompleteMaterialsCount: 0,
            unsubmittedAssignmentsCount: 0,
            pendingGradingAssignmentsCount: 0,
            upcomingExamsCount: 0,
            latestGradeScore: null,
          },
          learningProgress: [],
          classrooms: [],
          timetable: [],
          academicActivities: {
            prioritiesToday: [],
            upcomingDeadlines: [],
            upcomingExams: [],
            recentMaterials: [],
            recentAnnouncements: [],
            latestGrades: [],
          },
        });
      }

    const [
      schedules,
      instructorsRows,
      topicsRows,
      materialsRows,
      assignmentsRows,
      assessmentsRows,
      announcementsRows,
      mySubRows,
      myGradeRows,
      myAttemptRows,
      myResultRows,
    ] = await Promise.all([
      db
        .select({
          schedule: classroomSchedules,
          cls: classrooms,
          room: campusRooms,
          building: campusBuildings,
        })
        .from(classroomSchedules)
        .innerJoin(classrooms, eq(classroomSchedules.classroomId, classrooms.id))
        .leftJoin(campusRooms, eq(classroomSchedules.roomId, campusRooms.id))
        .leftJoin(campusBuildings, eq(classroomSchedules.buildingId, campusBuildings.id))
        .where(inArray(classroomSchedules.classroomId, activeClassIds))
        .orderBy(asc(classroomSchedules.dayOfWeek), asc(classroomSchedules.startTime)),
      db
        .select({
          classroomId: classroomInstructors.classroomId,
          fullName: users.fullName,
          role: classroomInstructors.role,
        })
        .from(classroomInstructors)
        .innerJoin(users, eq(classroomInstructors.instructorId, users.id))
        .where(inArray(classroomInstructors.classroomId, activeClassIds)),
      db
        .select()
        .from(classroomTopics)
        .where(inArray(classroomTopics.classroomId, activeClassIds)),
      db
        .select()
        .from(learningMaterials)
        .where(
          and(
            inArray(learningMaterials.classroomId, activeClassIds),
            eq(learningMaterials.status, 'PUBLISHED')
          )
        )
        .orderBy(desc(learningMaterials.publishedAt)),
      db
        .select()
        .from(assignments)
        .where(
          and(
            inArray(assignments.classroomId, activeClassIds),
            eq(assignments.status, 'PUBLISHED')
          )
        )
        .orderBy(asc(assignments.dueAt)),
      db
        .select()
        .from(assessments)
        .where(
          and(
            inArray(assessments.classroomId, activeClassIds),
            inArray(assessments.status, ['PUBLISHED', 'SCHEDULED'])
          )
        )
        .orderBy(asc(assessments.startDate)),
      db
        .select({
          id: announcements.id,
          classroomId: announcements.classroomId,
          title: announcements.title,
          content: announcements.content,
          createdAt: announcements.createdAt,
          authorName: users.fullName,
        })
        .from(announcements)
        .innerJoin(users, eq(announcements.authorId, users.id))
        .where(inArray(announcements.classroomId, activeClassIds))
        .orderBy(desc(announcements.createdAt))
        .limit(6),
      db
        .select()
        .from(assignmentSubmissions)
        .where(eq(assignmentSubmissions.studentId, user.id)),
      db
        .select()
        .from(submissionGrades)
        .where(
          and(
            eq(submissionGrades.studentId, user.id),
            eq(submissionGrades.isPublished, true)
          )
        )
        .orderBy(desc(submissionGrades.publishedAt)),
      db
        .select()
        .from(assessmentAttempts)
        .where(eq(assessmentAttempts.studentId, user.id)),
      db
        .select()
        .from(assessmentResults)
        .where(eq(assessmentResults.studentId, user.id))
        .orderBy(desc(assessmentResults.updatedAt)),
    ]);

    const publishedMaterialIds = materialsRows.map((m) => m.id);
    const myMatProgressRows =
      publishedMaterialIds.length > 0
        ? await db
            .select()
            .from(materialProgress)
            .where(
              and(
                eq(materialProgress.studentId, user.id),
                inArray(materialProgress.materialId, publishedMaterialIds)
              )
            )
        : [];

    const completedMatSet = new Set(
      myMatProgressRows.filter((p) => p.status === 'COMPLETED').map((p) => p.materialId)
    );
    const startedMatSet = new Set(myMatProgressRows.map((p) => p.materialId));
    const submittedAssignmentSet = new Set(mySubRows.map((s) => s.assignmentId));
    const attemptedAssessmentSet = new Set(
      myAttemptRows
        .filter((a) => ['SUBMITTED', 'AUTO_SUBMITTED', 'TIMED_OUT', 'GRADED'].includes(a.status))
        .map((a) => a.assessmentId)
    );

    const classroomNameMap = new Map(activeEnrolls.map((e) => [e.cls.id, e.cls.name]));
    const instructorByClass = new Map<string, string>();
    for (const inst of instructorsRows) {
      if (!instructorByClass.has(inst.classroomId) || inst.role === 'PRIMARY') {
        instructorByClass.set(inst.classroomId, inst.fullName);
      }
    }

    let incompleteMaterialsCount = 0;
    const now = Date.now();

    const learningProgress = activeEnrolls.map((e) => {
      const clsMats = materialsRows.filter((m) => m.classroomId === e.cls.id);
      const clsTopics = topicsRows.filter((t) => t.classroomId === e.cls.id);
      const clsAssignments = assignmentsRows.filter((a) => a.classroomId === e.cls.id);
      const clsAssessments = assessmentsRows.filter((a) => a.classroomId === e.cls.id);

      const completedMaterialsCount = clsMats.filter((m) => completedMatSet.has(m.id)).length;
      const startedMaterialsCount = clsMats.filter((m) => startedMatSet.has(m.id)).length;
      incompleteMaterialsCount += clsMats.length - completedMaterialsCount;

      let completedModulesCount = 0;
      for (const topic of clsTopics) {
        const topicMats = clsMats.filter((m) => m.topicId === topic.id);
        if (topicMats.length > 0 && topicMats.every((m) => completedMatSet.has(m.id))) {
          completedModulesCount++;
        }
      }

      const progressPercent =
        clsMats.length > 0 ? Math.round((completedMaterialsCount / clsMats.length) * 100) : 0;

      const progressStatus: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED' =
        clsMats.length > 0 && completedMaterialsCount === clsMats.length
          ? 'COMPLETED'
          : startedMaterialsCount > 0 || completedMaterialsCount > 0
          ? 'IN_PROGRESS'
          : 'NOT_STARTED';

      return {
        classroomId: e.cls.id,
        classroomName: e.cls.name,
        courseCode: e.cls.subjectCode || e.course?.code || e.cls.classroomCode || 'KLS',
        completedModulesCount,
        totalModulesCount: clsTopics.length,
        completedMaterialsCount,
        totalMaterialsCount: clsMats.length,
        submittedAssignmentsCount: clsAssignments.filter((a) => submittedAssignmentSet.has(a.id)).length,
        totalAssignmentsCount: clsAssignments.length,
        completedAssessmentsCount: clsAssessments.filter((a) => attemptedAssessmentSet.has(a.id)).length,
        totalAssessmentsCount: clsAssessments.length,
        progressPercent,
        progressStatus,
      };
    });

    const progressByClass = new Map(learningProgress.map((lp) => [lp.classroomId, lp]));

    const unsubmittedAssignments = assignmentsRows.filter((a) => !submittedAssignmentSet.has(a.id));
    const pendingGradingAssignmentsCount = mySubRows.filter(
      (s) => s.gradingStatus === 'SUBMITTED'
    ).length;

    const upcomingExams = assessmentsRows
      .filter((a) => !a.endDate || new Date(a.endDate).getTime() >= now)
      .slice(0, 6)
      .map((a) => ({
        id: a.id,
        classroomId: a.classroomId,
        classroomName: classroomNameMap.get(a.classroomId) || 'Kelas',
        title: a.title,
        category: a.category,
        startDate: a.startDate,
        endDate: a.endDate,
        durationMinutes: a.durationMinutes,
        attempted: attemptedAssessmentSet.has(a.id),
      }));

    const upcomingDeadlines = unsubmittedAssignments
      .filter((a) => a.dueAt)
      .slice(0, 6)
      .map((a) => ({
        id: a.id,
        classroomId: a.classroomId,
        classroomName: classroomNameMap.get(a.classroomId) || 'Kelas',
        title: a.title,
        dueDate: a.dueAt,
        isOverdue: a.dueAt ? new Date(a.dueAt).getTime() < now : false,
      }));

    // Today's priorities sorted by urgency
    const prioritiesToday: any[] = [];
    for (const d of upcomingDeadlines) {
      prioritiesToday.push({
        type: 'ASSIGNMENT',
        id: d.id,
        classroomId: d.classroomId,
        classroomName: d.classroomName,
        title: d.title,
        dueAt: d.dueDate,
        urgency: d.isOverdue ? 'HIGH' : 'MEDIUM',
        actionUrl: `/classrooms/${d.classroomId}/assignments/${d.id}`,
      });
    }
    for (const ex of upcomingExams.filter((e) => !e.attempted)) {
      prioritiesToday.push({
        type: 'ASSESSMENT',
        id: ex.id,
        classroomId: ex.classroomId,
        classroomName: ex.classroomName,
        title: ex.title,
        dueAt: ex.endDate || ex.startDate,
        urgency: 'HIGH',
        actionUrl: `/classrooms/${ex.classroomId}/assessments/${ex.id}`,
      });
    }
    prioritiesToday.sort((a, b) => {
      const ta = a.dueAt ? new Date(a.dueAt).getTime() : Number.MAX_SAFE_INTEGER;
      const tb = b.dueAt ? new Date(b.dueAt).getTime() : Number.MAX_SAFE_INTEGER;
      return ta - tb;
    });

    const assignmentById = new Map(assignmentsRows.map((a) => [a.id, a]));
    const assessmentById = new Map(assessmentsRows.map((a) => [a.id, a]));

    const latestGrades = [
      ...myGradeRows.slice(0, 4).map((g) => {
        const asg = assignmentById.get(g.assignmentId);
        return {
          id: g.id,
          sourceType: 'ASSIGNMENT',
          title: asg?.title || 'Tugas',
          classroomId: asg?.classroomId || '',
          classroomName: asg ? classroomNameMap.get(asg.classroomId) || 'Kelas' : 'Kelas',
          score: Number(g.finalScore),
          maxScore: g.maxScore,
          gradedAt: g.publishedAt || g.createdAt,
        };
      }),
      ...myResultRows.slice(0, 4).map((r) => {
        const asm = assessmentById.get(r.assessmentId);
        return {
          id: r.id,
          sourceType: 'ASSESSMENT',
          title: asm?.title || 'Asesmen',
          classroomId: asm?.classroomId || '',
          classroomName: asm ? classroomNameMap.get(asm.classroomId) || 'Kelas' : 'Kelas',
          score: Number(r.finalScore),
          maxScore: Number(r.maxScore),
          gradedAt: r.publishedAt || r.updatedAt,
        };
      }),
    ].sort((a, b) => new Date(b.gradedAt).getTime() - new Date(a.gradedAt).getTime());

    const totalCredits = activeEnrolls.reduce((acc, e) => acc + (e.course?.credits || 3), 0);

      return sendSuccess(reply, {
        enrolledCount: activeEnrolls.length,
        profile: studentProfile,
        activePeriod: periodCtx.selectedPeriod,
        overview: {
        enrolledCount: activeEnrolls.length,
        activeClassroomsCount: activeEnrolls.filter((e) => e.cls.lifecycleStatus === 'active').length,
        pendingCount: myEnrollments.filter((e) => e.enroll.status === 'pending').length,
        totalCredits,
        incompleteMaterialsCount,
        unsubmittedAssignmentsCount: unsubmittedAssignments.length,
        pendingGradingAssignmentsCount,
        upcomingExamsCount: upcomingExams.filter((e) => !e.attempted).length,
        latestGradeScore: latestGrades[0]?.score ?? null,
      },
      learningProgress,
      classrooms: activeEnrolls.map((e) => {
        const lp = progressByClass.get(e.cls.id);
        const nearestAsg = unsubmittedAssignments.find((a) => a.classroomId === e.cls.id);
        return {
          id: e.cls.id,
          code: e.cls.classroomCode || e.cls.subjectCode || 'KLS',
          name: e.cls.name,
          section: e.cls.section,
          courseCode: e.cls.subjectCode || e.course?.code || e.cls.classroomCode || 'KLS',
          courseTitle: e.cls.subjectName || e.course?.title || e.cls.name,
          credits: e.course?.credits || 3,
          coverImageUrl: e.cls.coverThumbnailPath || e.cls.coverImagePath || null,
          instructorName: instructorByClass.get(e.cls.id) || 'Dosen Pengampu',
          studyProgram: e.course?.studyProgram || 'Teknik Informatika',
          semesterLabel: e.cls.semesterName || '-',
          visibility: normalizeVisibility(e.cls.visibility),
          status: e.cls.lifecycleStatus,
          progressPercent: lp?.progressPercent ?? 0,
          progressStatus: lp?.progressStatus ?? 'NOT_STARTED',
          nearestAssignment: nearestAsg
            ? { id: nearestAsg.id, title: nearestAsg.title, dueDate: nearestAsg.dueAt }
            : null,
        };
      }),
      timetable: schedules.map((s) => ({
        classroomId: s.cls.id,
        classroomName: s.cls.name,
        dayOfWeek: s.schedule.dayOfWeek,
        startTime: s.schedule.startTime,
        endTime: s.schedule.endTime,
        roomNumber: s.room?.roomNumber || 'Online',
        buildingCode: s.building?.code || '',
        meetingType: s.schedule.meetingType,
      })),
      academicActivities: {
        prioritiesToday: prioritiesToday.slice(0, 6),
        upcomingDeadlines,
        upcomingExams,
        recentMaterials: materialsRows.slice(0, 5).map((m) => ({
          id: m.id,
          classroomId: m.classroomId,
          classroomName: classroomNameMap.get(m.classroomId) || 'Kelas',
          title: m.title,
          publishedAt: m.publishedAt || m.createdAt,
          completed: completedMatSet.has(m.id),
        })),
        recentAnnouncements: announcementsRows.map((an) => ({
          id: an.id,
          classroomId: an.classroomId,
          classroomName: classroomNameMap.get(an.classroomId) || 'Kelas',
          title: an.title,
          authorName: an.authorName,
          createdAt: an.createdAt,
        })),
        latestGrades: latestGrades.slice(0, 5),
      },
    });
    } catch (err) {
      logDashboardError('/api/v1/dashboards/student', user.id, query.periodId, err);
      return sendError(
        reply,
        500,
        'INTERNAL_SERVER_ERROR',
        'Terjadi kesalahan internal saat memuat dashboard mahasiswa.'
      );
    }
  });

  // 6. AUDITOR Academic Audit & Compliance Dashboard (Strict READ-ONLY)
  fastify.get('/api/v1/dashboards/auditor', async (req, reply) => {
    const user = await authenticateRequest(req, reply, {
      requiredPermissions: ['audit:view'],
    });
    if (!user) return;

    const query = req.query as {
      page?: string;
      limit?: string;
      actorId?: string;
      module?: string;
      action?: string;
      from?: string;
      to?: string;
    };

    const page = Math.max(1, parseInt(query.page || '1', 10));
    const limit = Math.min(50, Math.max(1, parseInt(query.limit || '15', 10)));

    const [{ totalUsers }] = await db.select({ totalUsers: count() }).from(users);
    const [{ totalClassrooms }] = await db.select({ totalClassrooms: count() }).from(classrooms);
    const allAuditSummary = await db
      .select({
        action: auditLogs.action,
        entityType: auditLogs.entityType,
      })
      .from(auditLogs);

    let academicDataChangesCount = 0;
    let adminActionsCount = 0;
    let rbacChangesCount = 0;
    let passwordResetsCount = 0;
    let authEventsCount = 0;
    let contentPublishEventsCount = 0;

    const moduleSet = new Set<string>();
    const actionSet = new Set<string>();

    for (const row of allAuditSummary) {
      moduleSet.add(row.entityType);
      actionSet.add(row.action);
      const act = row.action.toUpperCase();
      const ent = row.entityType.toUpperCase();
      if (act.includes('RBAC') || ent.includes('ROLE') || ent.includes('PERMISSION')) rbacChangesCount++;
      if (act.includes('PASSWORD_RESET') || act.includes('TEMP_PASSWORD')) passwordResetsCount++;
      if (act.includes('LOGIN') || act.includes('AUTH') || act.includes('SESSION')) authEventsCount++;
      if (act.includes('PUBLISH') || ent.includes('MATERIAL') || ent.includes('ASSESSMENT')) contentPublishEventsCount++;
      if (ent.includes('USER') || ent.includes('RBAC') || ent.includes('SYSTEM')) adminActionsCount++;
      if (ent.includes('CLASSROOM') || ent.includes('GRADE') || ent.includes('PERIOD') || ent.includes('ASSIGNMENT')) {
        academicDataChangesCount++;
      }
    }

    const conditions = [];
    if (query.actorId) conditions.push(eq(auditLogs.actorId, query.actorId));
    if (query.module) conditions.push(eq(auditLogs.entityType, query.module));
    if (query.action) conditions.push(eq(auditLogs.action, query.action));
    if (query.from) conditions.push(gte(auditLogs.createdAt, new Date(query.from)));
    if (query.to) {
      const endD = new Date(query.to);
      endD.setHours(23, 59, 59, 999);
      conditions.push(lte(auditLogs.createdAt, endD));
    }

    const filteredLogs = await db
      .select({
        id: auditLogs.id,
        actorId: auditLogs.actorId,
        actorName: users.fullName,
        actorEmail: users.email,
        action: auditLogs.action,
        entityType: auditLogs.entityType,
        entityId: auditLogs.entityId,
        metadata: auditLogs.metadata,
        ipAddress: auditLogs.ipAddress,
        createdAt: auditLogs.createdAt,
      })
      .from(auditLogs)
      .leftJoin(users, eq(auditLogs.actorId, users.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(auditLogs.createdAt));

    const total = filteredLogs.length;
    const paginated = filteredLogs.slice((page - 1) * limit, page * limit);

    const actors = await db
      .select({ id: users.id, fullName: users.fullName, email: users.email })
      .from(users)
      .orderBy(asc(users.fullName));

    return sendSuccess(
      reply,
      {
        readOnly: true,
        canExport: userHasPermission(user, 'audit:view'),
        overview: {
          totalUsers: Number(totalUsers || 0),
          totalClassrooms: Number(totalClassrooms || 0),
          totalAuditEvents: allAuditSummary.length,
          academicDataChangesCount,
          adminActionsCount,
          rbacChangesCount,
          passwordResetsCount,
          authEventsCount,
          contentPublishEventsCount,
        },
        timeline: paginated.map((item) => ({
          ...item,
          category: classifyAuditCategory(item.action, item.entityType),
        })),
        filters: {
          modules: Array.from(moduleSet).sort(),
          actions: Array.from(actionSet).sort(),
          actors,
        },
      },
      {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      }
    );
  });
}
