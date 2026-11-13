import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '../db/index.ts';
import {
  assessments,
  assessmentAttempts,
  assignments,
  assignmentSubmissions,
  classroomEnrollments,
  classroomInstructors,
  classroomJoinCodes,
  classrooms,
  courses,
  learningMaterials,
  materialProgress,
  semesters,
  users,
} from '../db/schema.ts';
import {
  authenticateRequest,
  isAuditorOnly,
  recordAuditLog,
  sendError,
  sendSuccess,
} from './security.ts';

export function normalizeClassroomVisibility(
  raw?: string | null
): 'PUBLIC' | 'PRIVATE' {
  const upper = (raw || '').toUpperCase();
  if (upper === 'PUBLIC' || upper === 'CAMPUS_WIDE') return 'PUBLIC';
  return 'PRIVATE';
}

export async function registerClassroomDirectoryRoutes(fastify: FastifyInstance) {
  // ============================================================================
  // 1. ROLE-SCOPED DIGITAL CLASSROOM DIRECTORY & DISCOVERY
  // ============================================================================
  fastify.get('/api/v1/classrooms', async (req, reply) => {
    const user = await authenticateRequest(req, reply, {
      anyPermissions: [
        'classrooms:view',
        'classrooms:manage_all',
        'classrooms:teach',
        'enrollments:join',
      ],
    });
    if (!user) return;

    const query = req.query as {
      page?: string;
      limit?: string;
      search?: string;
      view?: string; // 'auto' | 'superadmin' | 'owned' | 'co_taught' | 'enrolled' | 'public_discovery'
      scope?: string; // backward compatibility: 'all' | 'mine'
      studyProgram?: string;
      academicPeriod?: string;
      instructorId?: string;
      creatorId?: string;
      visibility?: string; // 'ALL' | 'PUBLIC' | 'PRIVATE'
      status?: string; // 'ALL' | 'ACTIVE' | 'INACTIVE' | 'ARCHIVED'
    };

    const page = Math.max(1, parseInt(query.page || '1', 10));
    const limit = Math.min(50, Math.max(1, parseInt(query.limit || '12', 10)));
    const search = (query.search || '').trim().toLowerCase();

    const isSuperadmin = user.roles.some((r) => r.toUpperCase() === 'SUPERADMIN');
    const isAuditor = isAuditorOnly(user);
    const isDosen = !isSuperadmin && !isAuditor && user.roles.some((r) => r.toUpperCase() === 'DOSEN');
    const isMahasiswa = !isSuperadmin && !isAuditor && !isDosen;

    // Resolve authoritative view strictly from authenticated server role
    let effectiveView = (query.view || 'auto').toLowerCase();
    if (isSuperadmin || isAuditor) {
      effectiveView = 'superadmin';
    } else if (isDosen) {
      effectiveView = effectiveView === 'co_taught' ? 'co_taught' : 'owned';
    } else {
      effectiveView = effectiveView === 'public_discovery' ? 'public_discovery' : 'enrolled';
    }

    const allClassrooms = await db
      .select()
      .from(classrooms)
      .orderBy(desc(classrooms.createdAt));

    const allCourses = await db.select().from(courses);
    const allSemesters = await db.select().from(semesters);
    const allUsers = await db
      .select({
        id: users.id,
        fullName: users.fullName,
        email: users.email,
      })
      .from(users);

    const allInstructors = await db
      .select({
        classroomId: classroomInstructors.classroomId,
        instructorId: classroomInstructors.instructorId,
        isPrimary: classroomInstructors.isPrimary,
        role: classroomInstructors.role,
        status: classroomInstructors.status,
        permissionScopes: classroomInstructors.permissionScopes,
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

    // Aggregate published material counts per classroom for Dosen/Admin stats
    const materialCountsRows = await db
      .select({
        classroomId: learningMaterials.classroomId,
        count: sql<number>`count(*)::int`,
      })
      .from(learningMaterials)
      .where(eq(learningMaterials.status, 'PUBLISHED'))
      .groupBy(learningMaterials.classroomId);
    const publishedMaterialsCountMap = new Map(
      materialCountsRows.map((r) => [r.classroomId, Number(r.count)])
    );

    const courseMap = new Map(allCourses.map((c) => [c.id, c]));
    const semMap = new Map(allSemesters.map((s) => [s.id, s]));
    const userMap = new Map(allUsers.map((u) => [u.id, u]));

    // If student enrolled view, batch-load learning progress across their enrolled classrooms (no N+1)
    const studentProgressMap = new Map<
      string,
      {
        totalRequiredItems: number;
        completedItems: number;
        progressPercent: number;
        progressStatus: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED';
        materialsCount: number;
        assignmentsCount: number;
        assessmentsCount: number;
        lastActivityAt: string | null;
      }
    >();

    if (isMahasiswa) {
      const enrolledClassroomIds = allEnrollments
        .filter(
          (e) =>
            e.studentId === user.id &&
            (e.status === 'active' || e.status === 'completed' || e.status === 'pending')
        )
        .map((e) => e.classroomId);

      if (enrolledClassroomIds.length > 0) {
        const [
          pubMaterials,
          completedMatRows,
          pubAssignments,
          submittedAssignRows,
          pubAssessments,
          submittedAssessRows,
        ] = await Promise.all([
          db
            .select({
              id: learningMaterials.id,
              classroomId: learningMaterials.classroomId,
              isRequired: learningMaterials.isRequired,
            })
            .from(learningMaterials)
            .where(
              and(
                inArray(learningMaterials.classroomId, enrolledClassroomIds),
                eq(learningMaterials.status, 'PUBLISHED')
              )
            ),
          db
            .select({
              materialId: materialProgress.materialId,
              classroomId: materialProgress.classroomId,
              completedAt: materialProgress.completedAt,
              updatedAt: materialProgress.updatedAt,
            })
            .from(materialProgress)
            .where(
              and(
                eq(materialProgress.studentId, user.id),
                eq(materialProgress.status, 'COMPLETED')
              )
            ),
          db
            .select({
              id: assignments.id,
              classroomId: assignments.classroomId,
            })
            .from(assignments)
            .where(
              and(
                inArray(assignments.classroomId, enrolledClassroomIds),
                eq(assignments.status, 'PUBLISHED')
              )
            ),
          db
            .select({
              assignmentId: assignmentSubmissions.assignmentId,
              submittedAt: assignmentSubmissions.submittedAt,
              updatedAt: assignmentSubmissions.updatedAt,
            })
            .from(assignmentSubmissions)
            .where(
              and(
                eq(assignmentSubmissions.studentId, user.id),
                inArray(assignmentSubmissions.status, ['SUBMITTED', 'GRADED', 'RETURNED'])
              )
            ),
          db
            .select({
              id: assessments.id,
              classroomId: assessments.classroomId,
            })
            .from(assessments)
            .where(
              and(
                inArray(assessments.classroomId, enrolledClassroomIds),
                eq(assessments.status, 'PUBLISHED')
              )
            ),
          db
            .select({
              assessmentId: assessmentAttempts.assessmentId,
              submittedAt: assessmentAttempts.submittedAt,
              lastActivityAt: assessmentAttempts.lastActivityAt,
            })
            .from(assessmentAttempts)
            .where(
              and(
                eq(assessmentAttempts.studentId, user.id),
                inArray(assessmentAttempts.status, ['SUBMITTED', 'AUTO_SUBMITTED', 'GRADED'])
              )
            ),
        ]);

        const completedMatSet = new Set(completedMatRows.map((r) => r.materialId));
        const submittedAssignSet = new Set(submittedAssignRows.map((r) => r.assignmentId));
        const submittedAssessSet = new Set(submittedAssessRows.map((r) => r.assessmentId));
        const assignClassroomMap = new Map(pubAssignments.map((a) => [a.id, a.classroomId]));
        const assessClassroomMap = new Map(pubAssessments.map((a) => [a.id, a.classroomId]));

        for (const cid of enrolledClassroomIds) {
          const mats = pubMaterials.filter((m) => m.classroomId === cid);
          const reqMats = mats.filter((m) => m.isRequired !== false);
          const assigns = pubAssignments.filter((a) => a.classroomId === cid);
          const assessList = pubAssessments.filter((a) => a.classroomId === cid);

          const totalReq = reqMats.length + assigns.length + assessList.length;
          const doneMats = reqMats.filter((m) => completedMatSet.has(m.id)).length;
          const doneAssigns = assigns.filter((a) => submittedAssignSet.has(a.id)).length;
          const doneAssess = assessList.filter((a) => submittedAssessSet.has(a.id)).length;
          const completedItems = doneMats + doneAssigns + doneAssess;

          const pct = totalReq > 0 ? Math.min(100, Math.round((completedItems / totalReq) * 100)) : 0;
          const progressStatus: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED' =
            pct === 0 ? 'NOT_STARTED' : pct >= 100 ? 'COMPLETED' : 'IN_PROGRESS';

          // Find latest activity timestamp
          const timestamps: number[] = [];
          completedMatRows
            .filter((r) => r.classroomId === cid)
            .forEach((r) => {
              const t = (r.completedAt || r.updatedAt)?.getTime();
              if (t) timestamps.push(t);
            });
          submittedAssignRows
            .filter((r) => assignClassroomMap.get(r.assignmentId) === cid)
            .forEach((r) => {
              const t = (r.submittedAt || r.updatedAt)?.getTime();
              if (t) timestamps.push(t);
            });
          submittedAssessRows
            .filter((r) => assessClassroomMap.get(r.assessmentId) === cid)
            .forEach((r) => {
              const t = (r.submittedAt || r.lastActivityAt)?.getTime();
              if (t) timestamps.push(t);
            });

          const lastActivityAt =
            timestamps.length > 0 ? new Date(Math.max(...timestamps)).toISOString() : null;

          studentProgressMap.set(cid, {
            totalRequiredItems: totalReq,
            completedItems,
            progressPercent: pct,
            progressStatus,
            materialsCount: mats.length,
            assignmentsCount: assigns.length,
            assessmentsCount: assessList.length,
            lastActivityAt,
          });
        }
      }
    }

    // Build role-scoped enriched items
    const enrichedAll = allClassrooms.map((cls) => {
      const course = cls.courseId ? courseMap.get(cls.courseId) : undefined;
      const semester = cls.semesterId ? semMap.get(cls.semesterId) : undefined;
      const creator = userMap.get(cls.createdById);
      const instructors = allInstructors.filter(
        (i) => i.classroomId === cls.id && i.status === 'ACTIVE'
      );
      const instructorRow = instructors.find((i) => i.instructorId === user.id);
      const isPrimaryInstructor = Boolean(
        instructorRow && (instructorRow.isPrimary || instructorRow.role === 'PRIMARY_INSTRUCTOR')
      );
      const isOwner = cls.createdById === user.id || isPrimaryInstructor;
      const isInstructor = Boolean(instructorRow);
      const isCoInstructor = isInstructor && !isOwner;

      const myEnrollment = allEnrollments.find(
        (e) => e.classroomId === cls.id && e.studentId === user.id
      );
      const activeCount = allEnrollments.filter(
        (e) => e.classroomId === cls.id && e.status === 'active'
      ).length;
      const pendingCount = allEnrollments.filter(
        (e) => e.classroomId === cls.id && e.status === 'pending'
      ).length;

      const normalizedVisibility = normalizeClassroomVisibility(cls.visibility);
      const canManage = isSuperadmin || isOwner || isInstructor;
      const canEditSettings =
        isSuperadmin ||
        isOwner ||
        (isCoInstructor &&
          Array.isArray(instructorRow?.permissionScopes) &&
          (instructorRow.permissionScopes.includes('all') ||
            instructorRow.permissionScopes.includes('settings')));

      const activeCode = canManage
        ? allJoinCodes.find((jc) => jc.classroomId === cls.id)?.code || null
        : null;

      const effectiveCourseCode = cls.subjectCode || course?.code || 'N/A';
      const effectiveCourseTitle = cls.subjectName || course?.title || cls.name;
      const effectiveSemesterName =
        cls.semesterName ||
        (cls.academicYear ? `${cls.academicYear}` : null) ||
        semester?.name ||
        'Semester Aktif';
      const effectiveLocation = cls.locationDescription || cls.roomNumber;
      const effectiveStudyProgram = course?.studyProgram || 'Teknik Informatika';
      const effectiveStatus =
        cls.lifecycleStatus === 'archived'
          ? 'ARCHIVED'
          : cls.status === 'ACTIVE'
            ? 'ACTIVE'
            : 'INACTIVE';

      const studentProgress = isMahasiswa
        ? studentProgressMap.get(cls.id) || null
        : null;

      return {
        id: cls.id,
        name: cls.name,
        section: cls.section,
        roomNumber: cls.roomNumber,
        scheduleText: cls.scheduleText,
        capacity: cls.capacity,
        enrollmentPolicy: cls.enrollmentPolicy,
        status: cls.status,
        lifecycleStatus: cls.lifecycleStatus,
        effectiveStatus,
        visibility: normalizedVisibility,
        rawVisibility: cls.visibility,
        description: cls.description,
        coverImagePath: cls.coverImagePath,
        coverThumbnailPath: cls.coverThumbnailPath,
        courseCode: effectiveCourseCode,
        courseTitle: effectiveCourseTitle,
        subjectCode: cls.subjectCode,
        subjectName: cls.subjectName,
        studyProgram: effectiveStudyProgram,
        credits: course?.credits || 3,
        semesterName: effectiveSemesterName,
        academicYear: cls.academicYear,
        locationDescription: effectiveLocation,
        createdById: cls.createdById,
        creatorName: creator?.fullName || 'Dosen Politeknik Kampar',
        createdAt: cls.createdAt,
        instructors: instructors.map((i) => ({
          instructorId: i.instructorId,
          fullName: i.fullName,
          isPrimary: i.isPrimary,
          role: i.role,
        })),
        activeStudentCount: activeCount,
        pendingEnrollmentCount: canManage ? pendingCount : 0,
        publishedMaterialsCount: canManage || isAuditor ? publishedMaterialsCountMap.get(cls.id) || 0 : 0,
        joinCode: activeCode,
        myEnrollmentStatus: myEnrollment?.status || null,
        isOwner,
        isCoInstructor,
        isInstructor,
        canManage,
        canEditSettings,
        canEnter:
          canManage ||
          isAuditor ||
          myEnrollment?.status === 'active' ||
          myEnrollment?.status === 'completed',
        studentProgress,
      };
    });

    // Apply STRICT Role-Based Visibility Scoping BEFORE filters/pagination
    const roleScoped = enrichedAll.filter((item) => {
      if (effectiveView === 'superadmin') {
        return isSuperadmin || isAuditor;
      }
      if (effectiveView === 'owned') {
        return item.isOwner;
      }
      if (effectiveView === 'co_taught') {
        return item.isCoInstructor;
      }
      if (effectiveView === 'enrolled') {
        return (
          item.myEnrollmentStatus === 'active' ||
          item.myEnrollmentStatus === 'completed' ||
          item.myEnrollmentStatus === 'pending'
        );
      }
      if (effectiveView === 'public_discovery') {
        return (
          item.visibility === 'PUBLIC' &&
          item.effectiveStatus === 'ACTIVE'
        );
      }
      return false;
    });

    // Compute real DB stats from the role-scoped dataset (not mocked)
    const ownedClassroomsForDosen = isDosen
      ? enrichedAll.filter((i) => i.isOwner)
      : [];
    const coTaughtCountForDosen = isDosen
      ? enrichedAll.filter((i) => i.isCoInstructor).length
      : 0;

    const stats = isSuperadmin || isAuditor
      ? {
          totalClassrooms: roleScoped.length,
          activeClassrooms: roleScoped.filter((i) => i.effectiveStatus === 'ACTIVE').length,
          publicClassrooms: roleScoped.filter((i) => i.visibility === 'PUBLIC').length,
          privateClassrooms: roleScoped.filter((i) => i.visibility === 'PRIVATE').length,
          totalLecturers: new Set(
            roleScoped.flatMap((i) => i.instructors.map((inst) => inst.instructorId))
          ).size,
          totalEnrolledStudents: roleScoped.reduce((sum, i) => sum + i.activeStudentCount, 0),
        }
      : isDosen
        ? {
            totalOwned: ownedClassroomsForDosen.length,
            activeOwned: ownedClassroomsForDosen.filter((i) => i.effectiveStatus === 'ACTIVE').length,
            publicOwned: ownedClassroomsForDosen.filter((i) => i.visibility === 'PUBLIC').length,
            privateOwned: ownedClassroomsForDosen.filter((i) => i.visibility === 'PRIVATE').length,
            totalStudentsOwned: ownedClassroomsForDosen.reduce(
              (sum, i) => sum + i.activeStudentCount,
              0
            ),
            totalPublishedMaterialsOwned: ownedClassroomsForDosen.reduce(
              (sum, i) => sum + i.publishedMaterialsCount,
              0
            ),
            coTaughtCount: coTaughtCountForDosen,
          }
        : {
            totalEnrolled: enrichedAll.filter(
              (i) => i.myEnrollmentStatus === 'active' || i.myEnrollmentStatus === 'completed'
            ).length,
            publicAvailable: enrichedAll.filter(
              (i) => i.visibility === 'PUBLIC' && i.effectiveStatus === 'ACTIVE'
            ).length,
          };

    // Filter options from scoped dataset
    const filterOptions = {
      studyPrograms: Array.from(new Set(roleScoped.map((i) => i.studyProgram))).filter(Boolean),
      academicPeriods: Array.from(new Set(roleScoped.map((i) => i.semesterName))).filter(Boolean),
      lecturers: Array.from(
        new Map(
          roleScoped
            .flatMap((i) => i.instructors)
            .map((inst) => [inst.instructorId, { id: inst.instructorId, fullName: inst.fullName }])
        ).values()
      ),
    };

    // Apply user filters
    const studyProgramFilter = query.studyProgram && query.studyProgram !== 'ALL' ? query.studyProgram : null;
    const academicPeriodFilter =
      query.academicPeriod && query.academicPeriod !== 'ALL' ? query.academicPeriod : null;
    const instructorFilter =
      query.instructorId && query.instructorId !== 'ALL' ? query.instructorId : null;
    const creatorFilter = query.creatorId && query.creatorId !== 'ALL' ? query.creatorId : null;
    const visibilityFilter =
      query.visibility && query.visibility !== 'ALL' ? query.visibility.toUpperCase() : null;
    const statusFilter = query.status && query.status !== 'ALL' ? query.status.toUpperCase() : null;

    const filtered = roleScoped.filter((item) => {
      if (studyProgramFilter && item.studyProgram !== studyProgramFilter) return false;
      if (academicPeriodFilter && item.semesterName !== academicPeriodFilter) return false;
      if (
        instructorFilter &&
        !item.instructors.some((inst) => inst.instructorId === instructorFilter)
      ) {
        return false;
      }
      if (creatorFilter && item.createdById !== creatorFilter) return false;
      if (visibilityFilter && item.visibility !== visibilityFilter) return false;
      if (statusFilter && item.effectiveStatus !== statusFilter) return false;
      if (search) {
        return (
          item.name.toLowerCase().includes(search) ||
          item.courseCode.toLowerCase().includes(search) ||
          item.courseTitle.toLowerCase().includes(search) ||
          item.studyProgram.toLowerCase().includes(search) ||
          item.creatorName.toLowerCase().includes(search) ||
          item.instructors.some((i) => i.fullName.toLowerCase().includes(search))
        );
      }
      return true;
    });

    const total = filtered.length;
    const paginated = filtered.slice((page - 1) * limit, page * limit);

    return sendSuccess(reply, paginated, {
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
      view: effectiveView,
      stats,
      filters: filterOptions,
    });
  });

  // ============================================================================
  // 2. INVITATION CODE VALIDATION PREVIEW (STEP 1 BEFORE CONFIRMATION)
  // ============================================================================
  const codeSchema = z.object({
    code: z.string().trim().min(4, 'Kode undangan minimal 4 karakter.').max(30),
  });

  fastify.post('/api/v1/classrooms/join/validate', async (req, reply) => {
    const user = await authenticateRequest(req, reply, {
      requiredPermissions: ['enrollments:join'],
    });
    if (!user) return;

    const parsed = codeSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(reply, 400, 'VALIDATION_ERROR', 'Format kode undangan tidak valid.');
    }

    const normalizedCode = parsed.data.code.trim().toUpperCase();
    const [joinCode] = await db
      .select()
      .from(classroomJoinCodes)
      .where(eq(classroomJoinCodes.code, normalizedCode));

    if (!joinCode) {
      return sendError(reply, 404, 'CODE_NOT_FOUND', 'Kode tidak ditemukan.');
    }
    if (!joinCode.isActive || joinCode.revokedAt) {
      return sendError(reply, 400, 'CODE_REVOKED', 'Kode telah dicabut.');
    }
    if (joinCode.expiresAt && new Date(joinCode.expiresAt) < new Date()) {
      return sendError(reply, 400, 'CODE_EXPIRED', 'Kode sudah kedaluwarsa.');
    }
    if (joinCode.usesCount >= joinCode.maxUses) {
      return sendError(
        reply,
        400,
        'CODE_MAX_USES_REACHED',
        'Batas penggunaan kode undangan telah tercapai.'
      );
    }

    const [cls] = await db
      .select()
      .from(classrooms)
      .where(eq(classrooms.id, joinCode.classroomId));

    if (!cls || cls.status !== 'ACTIVE' || cls.lifecycleStatus === 'archived') {
      return sendError(reply, 400, 'CLASSROOM_UNAVAILABLE', 'Kelas tidak tersedia.');
    }

    const existingInstructor = await db
      .select({ id: classroomInstructors.id })
      .from(classroomInstructors)
      .where(
        and(
          eq(classroomInstructors.classroomId, cls.id),
          eq(classroomInstructors.instructorId, user.id)
        )
      );
    if (existingInstructor.length > 0) {
      return sendError(
        reply,
        409,
        'ALREADY_INSTRUCTOR',
        'Anda adalah Dosen Pengampu pada ruang kelas ini.'
      );
    }

    const existingEnrollment = await db
      .select({ status: classroomEnrollments.status })
      .from(classroomEnrollments)
      .where(
        and(
          eq(classroomEnrollments.classroomId, cls.id),
          eq(classroomEnrollments.studentId, user.id)
        )
      );
    if (
      existingEnrollment.length > 0 &&
      (existingEnrollment[0].status === 'active' || existingEnrollment[0].status === 'pending')
    ) {
      return sendError(reply, 409, 'ALREADY_ENROLLED', 'Anda sudah terdaftar.');
    }

    const activeEnrollments = await db
      .select({ id: classroomEnrollments.id })
      .from(classroomEnrollments)
      .where(
        and(
          eq(classroomEnrollments.classroomId, cls.id),
          eq(classroomEnrollments.status, 'active')
        )
      );
    if (activeEnrollments.length >= cls.capacity) {
      return sendError(reply, 409, 'CLASSROOM_FULL', 'Kelas sudah penuh.');
    }

    const instructors = await db
      .select({ fullName: users.fullName, isPrimary: classroomInstructors.isPrimary })
      .from(classroomInstructors)
      .innerJoin(users, eq(classroomInstructors.instructorId, users.id))
      .where(eq(classroomInstructors.classroomId, cls.id));

    return sendSuccess(reply, {
      valid: true,
      code: normalizedCode,
      classroom: {
        id: cls.id,
        name: cls.name,
        section: cls.section,
        courseCode: cls.subjectCode || 'N/A',
        courseTitle: cls.subjectName || cls.name,
        semesterName: cls.semesterName || cls.academicYear || 'Semester Aktif',
        visibility: normalizeClassroomVisibility(cls.visibility),
        enrollmentPolicy: cls.enrollmentPolicy,
        capacity: cls.capacity,
        activeStudentCount: activeEnrollments.length,
        coverThumbnailPath: cls.coverThumbnailPath,
        description: cls.description,
        instructors,
      },
    });
  });

  // ============================================================================
  // 3. TRANSACTIONAL JOIN CLASSROOM BY INVITATION CODE
  // ============================================================================
  fastify.post('/api/v1/classrooms/join', async (req, reply) => {
    const user = await authenticateRequest(req, reply, {
      requiredPermissions: ['enrollments:join'],
    });
    if (!user) return;

    const parsed = codeSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(reply, 400, 'VALIDATION_ERROR', 'Kode kelas tidak valid.');
    }

    const normalizedCode = parsed.data.code.trim().toUpperCase();

    try {
      const outcome = await db.transaction(async (tx) => {
        const [joinCode] = await tx
          .select()
          .from(classroomJoinCodes)
          .where(eq(classroomJoinCodes.code, normalizedCode));

        if (!joinCode) {
          throw new Error('CODE_NOT_FOUND');
        }
        if (!joinCode.isActive || joinCode.revokedAt) {
          throw new Error('CODE_REVOKED');
        }
        if (joinCode.expiresAt && new Date(joinCode.expiresAt) < new Date()) {
          throw new Error('CODE_EXPIRED');
        }
        if (joinCode.usesCount >= joinCode.maxUses) {
          throw new Error('CODE_MAX_USES_REACHED');
        }

        const [cls] = await tx
          .select()
          .from(classrooms)
          .where(eq(classrooms.id, joinCode.classroomId));
        if (!cls || cls.status !== 'ACTIVE' || cls.lifecycleStatus === 'archived') {
          throw new Error('CLASSROOM_UNAVAILABLE');
        }

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
            throw new Error('ALREADY_ENROLLED');
          }
        }

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
          throw new Error('CLASSROOM_FULL');
        }

        const targetStatus = cls.enrollmentPolicy === 'AUTO' ? 'active' : 'pending';
        const historyEntry = {
          status: targetStatus,
          changedAt: new Date().toISOString(),
          actorId: user.id,
          reason:
            targetStatus === 'active'
              ? `Auto-enrolled via invitation code ${normalizedCode}`
              : `Pending instructor approval via invitation code ${normalizedCode}`,
        };

        await tx
          .update(classroomJoinCodes)
          .set({ usesCount: sql`${classroomJoinCodes.usesCount} + 1` })
          .where(eq(classroomJoinCodes.id, joinCode.id));

        if (existingEnrollment.length > 0) {
          const prevHistory = Array.isArray(existingEnrollment[0].statusHistory)
            ? existingEnrollment[0].statusHistory
            : [];
          const [updated] = await tx
            .update(classroomEnrollments)
            .set({
              status: targetStatus,
              joinCodeUsed: normalizedCode,
              enrollmentSource: 'JOIN_CODE',
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
            enrollmentSource: 'JOIN_CODE',
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
      if (code === 'CODE_NOT_FOUND') {
        return sendError(reply, 404, code, 'Kode tidak ditemukan.');
      }
      if (code === 'CODE_REVOKED') {
        return sendError(reply, 400, code, 'Kode telah dicabut.');
      }
      if (code === 'CODE_EXPIRED') {
        return sendError(reply, 400, code, 'Kode sudah kedaluwarsa.');
      }
      if (code === 'CODE_MAX_USES_REACHED') {
        return sendError(reply, 400, code, 'Batas penggunaan kode undangan telah tercapai.');
      }
      if (code === 'CLASSROOM_UNAVAILABLE') {
        return sendError(reply, 400, code, 'Kelas tidak tersedia.');
      }
      if (code === 'ALREADY_ENROLLED') {
        return sendError(reply, 409, code, 'Anda sudah terdaftar.');
      }
      if (code === 'CLASSROOM_FULL') {
        return sendError(reply, 422, code, 'Kelas sudah penuh.');
      }
      if (code === 'ALREADY_INSTRUCTOR') {
        return sendError(reply, 409, code, 'Anda adalah Dosen Pengampu pada ruang kelas ini.');
      }
      return sendError(reply, 400, 'JOIN_FAILED', 'Gagal bergabung ke ruang kelas.');
    }
  });
}
