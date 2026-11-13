import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq, and, desc, asc, sql, ilike, or, inArray } from 'drizzle-orm';
import { db } from '../db/index.ts';
import {
  classrooms,
  classroomInstructors,
  classroomEnrollments,
  classroomTopics,
  learningMaterials,
  materialProgress,
  materialAttachments,
  materialVideos,
  assignments,
  assignmentSubmissions,
  assessments,
  assessmentAttempts,
  announcements,
  comments,
  users,
  userProfiles,
  notifications,
  classroomMaterialBookmarks,
  classroomMaterialNotes,
  classroomMaterialViews,
  classroomAuditLogs,
  classroomResourceVersions,
} from '../db/schema.ts';
import {
  authenticateRequest,
  sendSuccess,
  sendError,
  checkClassroomAccess,
  AuthenticatedUser,
} from './security.ts';

// ---------------------------------------------------------------------------
// Helpers: Role & Ownership Resolution
// ---------------------------------------------------------------------------

export type ClassroomUserRole =
  | 'SUPERADMIN'
  | 'CLASSROOM_CREATOR'
  | 'CO_INSTRUCTOR'
  | 'TEACHING_ASSISTANT'
  | 'STUDENT';

export interface ClassroomRoleResolution {
  role: ClassroomUserRole;
  isCreator: boolean;
  isPrimary: boolean;
  isCoInstructor: boolean;
  isStudent: boolean;
  canManageAll: boolean;
}

export async function resolveClassroomRole(
  user: AuthenticatedUser,
  classroomId: string
): Promise<ClassroomRoleResolution> {
  if (user.roles.includes('SUPERADMIN')) {
    return {
      role: 'SUPERADMIN',
      isCreator: true,
      isPrimary: true,
      isCoInstructor: false,
      isStudent: false,
      canManageAll: true,
    };
  }

  const [classroom] = await db
    .select({ createdById: classrooms.createdById })
    .from(classrooms)
    .where(eq(classrooms.id, classroomId));

  const [instructor] = await db
    .select({
      isPrimary: classroomInstructors.isPrimary,
      role: classroomInstructors.role,
      permissionScopes: classroomInstructors.permissionScopes,
    })
    .from(classroomInstructors)
    .where(
      and(
        eq(classroomInstructors.classroomId, classroomId),
        eq(classroomInstructors.instructorId, user.id)
      )
    );

  const isCreator = Boolean(
    (classroom && classroom.createdById === user.id) || instructor?.isPrimary
  );

  if (isCreator) {
    return {
      role: 'CLASSROOM_CREATOR',
      isCreator: true,
      isPrimary: true,
      isCoInstructor: false,
      isStudent: false,
      canManageAll: true,
    };
  }

  if (instructor) {
    const isCo = instructor.role === 'CO_INSTRUCTOR';
    const isTa = instructor.role === 'TEACHING_ASSISTANT';
    const canManageAll =
      Array.isArray(instructor.permissionScopes) &&
      (instructor.permissionScopes.includes('all') ||
        instructor.permissionScopes.includes('manage_all_resources'));

    return {
      role: isCo
        ? 'CO_INSTRUCTOR'
        : isTa
          ? 'TEACHING_ASSISTANT'
          : 'CO_INSTRUCTOR',
      isCreator: false,
      isPrimary: false,
      isCoInstructor: true,
      isStudent: false,
      canManageAll,
    };
  }

  // Student check
  const [enrollment] = await db
    .select({ status: classroomEnrollments.status })
    .from(classroomEnrollments)
    .where(
      and(
        eq(classroomEnrollments.classroomId, classroomId),
        eq(classroomEnrollments.studentId, user.id)
      )
    );

  if (enrollment && (enrollment.status === 'active' || enrollment.status === 'completed')) {
    return {
      role: 'STUDENT',
      isCreator: false,
      isPrimary: false,
      isCoInstructor: false,
      isStudent: true,
      canManageAll: false,
    };
  }

  return {
    role: 'STUDENT',
    isCreator: false,
    isPrimary: false,
    isCoInstructor: false,
    isStudent: false,
    canManageAll: false,
  };
}

export async function recordClassroomAudit(params: {
  classroomId: string;
  actorId: string | null;
  actorRole: string;
  resourceType: 'MODULE' | 'MATERIAL' | 'ASSIGNMENT' | 'ASSESSMENT' | 'CLASSROOM';
  resourceId?: string | null;
  resourceTitle: string;
  action:
    | 'CREATED'
    | 'UPDATED'
    | 'DELETED'
    | 'PUBLISHED'
    | 'UNPUBLISHED'
    | 'ARCHIVED'
    | 'RESTORED'
    | 'REORDERED'
    | 'DUPLICATED';
  beforeValue?: Record<string, unknown> | null;
  afterValue?: Record<string, unknown> | null;
  changeSummary: string;
}) {
  try {
    await db.insert(classroomAuditLogs).values({
      classroomId: params.classroomId,
      actorId: params.actorId,
      actorRole: params.actorRole,
      resourceType: params.resourceType,
      resourceId: params.resourceId || null,
      resourceTitle: params.resourceTitle,
      action: params.action,
      beforeValue: params.beforeValue || null,
      afterValue: params.afterValue || null,
      changeSummary: params.changeSummary,
    });
  } catch (err) {
    console.error('Failed to record classroom audit log:', err);
  }
}

// ---------------------------------------------------------------------------
// Route Registrations
// ---------------------------------------------------------------------------

export async function registerClassroomWorkspaceRoutes(fastify: FastifyInstance) {
  // =========================================================================
  // 1. GET /api/v1/classrooms/:id/analytics — Comprehensive Context-Aware Analytics
  // =========================================================================
  fastify.get('/api/v1/classrooms/:id/analytics', async (req, reply) => {
    const user = await authenticateRequest(req, reply);
    if (!user) return;

    const { id } = req.params as { id: string };
    const access = await checkClassroomAccess(user, id);
    if (!access.canView) {
      return sendError(reply, 403, 'FORBIDDEN', 'Akses ditolak.');
    }

    const roleInfo = await resolveClassroomRole(user, id);

    // -----------------------------------------------------------------------
    // A. INSTRUCTOR DASHBOARD ANALYTICS
    // -----------------------------------------------------------------------
    if (access.canManage) {
      // 1 & 2: Students
      const enrollments = await db
        .select({
          studentId: classroomEnrollments.studentId,
          status: classroomEnrollments.status,
          enrolledAt: classroomEnrollments.enrolledAt,
          fullName: users.fullName,
          identityNumber: users.identityNumber,
          avatarUrl: userProfiles.avatarUrl,
        })
        .from(classroomEnrollments)
        .innerJoin(users, eq(classroomEnrollments.studentId, users.id))
        .leftJoin(userProfiles, eq(users.id, userProfiles.userId))
        .where(eq(classroomEnrollments.classroomId, id));

      const totalEnrolled = enrollments.length;
      const activeStudents = enrollments.filter(
        (e) => e.status === 'active' || e.status === 'completed'
      );
      const activeStudentsCount = activeStudents.length;
      const studentIds = activeStudents.map((s) => s.studentId);

      // 3: Modules
      const modules = await db
        .select()
        .from(classroomTopics)
        .where(eq(classroomTopics.classroomId, id))
        .orderBy(asc(classroomTopics.sortOrder));
      const totalModules = modules.length;

      // 4 & 5: Materials
      const materials = await db
        .select({
          id: learningMaterials.id,
          topicId: learningMaterials.topicId,
          title: learningMaterials.title,
          isRequired: learningMaterials.isRequired,
          status: learningMaterials.status,
          sequenceOrder: learningMaterials.sequenceOrder,
          updatedAt: learningMaterials.updatedAt,
        })
        .from(learningMaterials)
        .where(eq(learningMaterials.classroomId, id));
      const totalMaterials = materials.length;

      // Progress rows for this classroom
      const materialIds = materials.map((m) => m.id);
      const progressRows =
        materialIds.length > 0
          ? await db
              .select({
                studentId: materialProgress.studentId,
                materialId: materialProgress.materialId,
                status: materialProgress.status,
                progressPercent: materialProgress.progressPercent,
                completedAt: materialProgress.completedAt,
              })
              .from(materialProgress)
              .where(inArray(materialProgress.materialId, materialIds))
          : [];

      // Materials with zero completions
      const completedMaterialIds = new Set(
        progressRows.filter((p) => p.status === 'COMPLETED').map((p) => p.materialId)
      );
      const unviewedMaterialsCount = materials.filter(
        (m) => !completedMaterialIds.has(m.id)
      ).length;

      // 6 - 10: Assignments & Submissions
      const assignmentRows = await db
        .select({
          id: assignments.id,
          title: assignments.title,
          topicId: assignments.topicId,
          maxPoints: assignments.maxPoints,
          dueAt: assignments.dueAt,
          status: assignments.status,
        })
        .from(assignments)
        .where(eq(assignments.classroomId, id));
      const totalAssignments = assignmentRows.length;

      const assignmentIds = assignmentRows.map((a) => a.id);
      const assignmentSubmissionsRows =
        assignmentIds.length > 0
          ? await db
              .select({
                id: assignmentSubmissions.id,
                assignmentId: assignmentSubmissions.assignmentId,
                studentId: assignmentSubmissions.studentId,
                status: assignmentSubmissions.status,
                finalScore: assignmentSubmissions.publishedScore,
                score: assignmentSubmissions.score,
                isGradePublished: assignmentSubmissions.isGradePublished,
                submittedAt: assignmentSubmissions.submittedAt,
              })
              .from(assignmentSubmissions)
              .where(inArray(assignmentSubmissions.assignmentId, assignmentIds))
          : [];

      const submittedAssignmentsCount = assignmentSubmissionsRows.filter(
        (s) => s.status !== 'DRAFT'
      ).length;
      const expectedTotalSubmissions = activeStudentsCount * totalAssignments;
      const unsubmittedAssignmentsCount = Math.max(
        0,
        expectedTotalSubmissions - submittedAssignmentsCount
      );
      const pendingGradingAssignmentsCount = assignmentSubmissionsRows.filter(
        (s) => s.status !== 'DRAFT' && !s.isGradePublished
      ).length;
      const gradedAssignmentsCount = assignmentSubmissionsRows.filter(
        (s) => s.isGradePublished && s.finalScore !== null
      ).length;

      // 11 - 13: Assessments & Attempts
      const assessmentRows = await db
        .select({
          id: assessments.id,
          title: assessments.title,
          passingGrade: assessments.passingGrade,
          maxScore: assessments.maxScore,
          status: assessments.status,
        })
        .from(assessments)
        .where(eq(assessments.classroomId, id));
      const totalAssessments = assessmentRows.length;

      const assessmentIds = assessmentRows.map((a) => a.id);
      const attemptRows =
        assessmentIds.length > 0
          ? await db
              .select({
                id: assessmentAttempts.id,
                assessmentId: assessmentAttempts.assessmentId,
                studentId: assessmentAttempts.studentId,
                status: assessmentAttempts.status,
                totalScore: assessmentAttempts.totalScore,
              })
              .from(assessmentAttempts)
              .where(inArray(assessmentAttempts.assessmentId, assessmentIds))
          : [];

      const completedAssessmentsCount = attemptRows.filter(
        (a) => a.status === 'SUBMITTED' || a.status === 'GRADED'
      ).length;
      const studentsCompletedAssessmentSet = new Set(
        attemptRows
          .filter((a) => a.status === 'SUBMITTED' || a.status === 'GRADED')
          .map((a) => `${a.assessmentId}_${a.studentId}`)
      );
      const totalExpectedAttempts = activeStudentsCount * totalAssessments;
      const studentsIncompleteAssessmentsCount = Math.max(
        0,
        totalExpectedAttempts - studentsCompletedAssessmentSet.size
      );

      // 14: Class Average Grade (combines published assignment scores & graded assessment scores)
      const scoresList: number[] = [];
      assignmentSubmissionsRows.forEach((s) => {
        if (s.isGradePublished && s.finalScore !== null) {
          scoresList.push(Number(s.finalScore));
        }
      });
      attemptRows.forEach((a) => {
        if (a.totalScore !== null) {
          scoresList.push(Number(a.totalScore));
        }
      });
      const classAverageGrade =
        scoresList.length > 0
          ? Math.round(
              (scoresList.reduce((acc, v) => acc + v, 0) / scoresList.length) * 10
            ) / 10
          : 0;

      // 15: Learning Completion Rate
      const requiredMaterials = materials.filter((m) => m.isRequired);
      const totalPossibleRequiredCompletions =
        activeStudentsCount * Math.max(1, requiredMaterials.length);
      const requiredMaterialIdSet = new Set(requiredMaterials.map((m) => m.id));
      const actualRequiredCompletions = progressRows.filter(
        (p) => p.status === 'COMPLETED' && requiredMaterialIdSet.has(p.materialId)
      ).length;
      const learningCompletionRate =
        totalPossibleRequiredCompletions > 0 && requiredMaterials.length > 0
          ? Math.min(
              100,
              Math.round(
                (actualRequiredCompletions / totalPossibleRequiredCompletions) * 100
              )
            )
          : 0;

      // SECTION B: MODULE COMPLETION BREAKDOWN
      const moduleAnalytics = modules.map((mod) => {
        const modMats = materials.filter((m) => m.topicId === mod.id);
        const modReqMats = modMats.filter((m) => m.isRequired);
        const modMatIds = new Set(modMats.map((m) => m.id));

        const completedStudents = activeStudents.filter((student) => {
          if (modReqMats.length === 0) return true;
          const studentCompletedCount = progressRows.filter(
            (p) =>
              p.studentId === student.studentId &&
              p.status === 'COMPLETED' &&
              modMatIds.has(p.materialId)
          ).length;
          return studentCompletedCount >= modReqMats.length;
        }).length;

        const completionPercent =
          activeStudentsCount > 0
            ? Math.round((completedStudents / activeStudentsCount) * 100)
            : 0;

        return {
          id: mod.id,
          title: mod.title,
          description: mod.description,
          status: mod.status,
          sortOrder: mod.sortOrder,
          totalMaterials: modMats.length,
          totalCompletedStudents: completedStudents,
          totalStudents: activeStudentsCount,
          moduleCompletionPercentage: completionPercent,
        };
      });

      // Student progress distribution (0-25%, 26-50%, 51-75%, 76-100%)
      const studentProgressBuckets = { '0-25': 0, '26-50': 0, '51-75': 0, '76-100': 0 };
      activeStudents.forEach((student) => {
        const comp = progressRows.filter(
          (p) => p.studentId === student.studentId && p.status === 'COMPLETED'
        ).length;
        const pct =
          materials.length > 0 ? Math.round((comp / materials.length) * 100) : 0;
        if (pct <= 25) studentProgressBuckets['0-25']++;
        else if (pct <= 50) studentProgressBuckets['26-50']++;
        else if (pct <= 75) studentProgressBuckets['51-75']++;
        else studentProgressBuckets['76-100']++;
      });

      // SECTION C: STUDENT ATTENTION CENTER (Perlu Perhatian Dosen)
      const attentionStudents: Array<{
        studentId: string;
        fullName: string;
        identityNumber: string | null;
        avatarUrl: string | null;
        issueType:
          | 'NO_MATERIAL_OPENED'
          | 'INCOMPLETE_MATERIALS'
          | 'UNSUBMITTED_ASSIGNMENT'
          | 'UNATTEMPTED_ASSESSMENT'
          | 'LOW_SCORE';
        issueDescription: string;
        actionableResourceId?: string;
      }> = [];

      activeStudents.forEach((student) => {
        const studentProgress = progressRows.filter(
          (p) => p.studentId === student.studentId
        );
        const completedMats = studentProgress.filter((p) => p.status === 'COMPLETED').length;

        if (materials.length > 0 && studentProgress.length === 0) {
          attentionStudents.push({
            studentId: student.studentId,
            fullName: student.fullName,
            identityNumber: student.identityNumber,
            avatarUrl: student.avatarUrl,
            issueType: 'NO_MATERIAL_OPENED',
            issueDescription: 'Belum membuka materi pembelajaran sama sekali',
          });
        } else if (materials.length > 2 && completedMats < Math.floor(materials.length / 3)) {
          attentionStudents.push({
            studentId: student.studentId,
            fullName: student.fullName,
            identityNumber: student.identityNumber,
            avatarUrl: student.avatarUrl,
            issueType: 'INCOMPLETE_MATERIALS',
            issueDescription: `Hanya menyelesaikan ${completedMats} dari ${materials.length} materi`,
          });
        }

        // Check unsubmitted assignments past deadline
        const studentSubmissions = assignmentSubmissionsRows.filter(
          (s) => s.studentId === student.studentId
        );
        const submittedAssignmentIds = new Set(
          studentSubmissions.map((s) => s.assignmentId)
        );
        const unsubmittedOverdue = assignmentRows.find(
          (a) =>
            !submittedAssignmentIds.has(a.id) &&
            a.dueAt &&
            new Date(a.dueAt).getTime() < Date.now()
        );
        if (unsubmittedOverdue) {
          attentionStudents.push({
            studentId: student.studentId,
            fullName: student.fullName,
            identityNumber: student.identityNumber,
            avatarUrl: student.avatarUrl,
            issueType: 'UNSUBMITTED_ASSIGNMENT',
            issueDescription: `Belum mengumpulkan tugas "${unsubmittedOverdue.title}" (Lewat batas waktu)`,
            actionableResourceId: unsubmittedOverdue.id,
          });
        }

        // Check scores below 70
        const lowScore = studentSubmissions.find(
          (s) => s.isGradePublished && s.finalScore !== null && Number(s.finalScore) < 70
        );
        if (lowScore) {
          attentionStudents.push({
            studentId: student.studentId,
            fullName: student.fullName,
            identityNumber: student.identityNumber,
            avatarUrl: student.avatarUrl,
            issueType: 'LOW_SCORE',
            issueDescription: `Nilai tugas di bawah ketuntasan (${lowScore.finalScore} / 100)`,
            actionableResourceId: lowScore.assignmentId,
          });
        }
      });

      // SECTION D: RECENT CLASS ACTIVITY
      const recentAudit = await db
        .select({
          id: classroomAuditLogs.id,
          action: classroomAuditLogs.action,
          resourceType: classroomAuditLogs.resourceType,
          resourceTitle: classroomAuditLogs.resourceTitle,
          changeSummary: classroomAuditLogs.changeSummary,
          actorRole: classroomAuditLogs.actorRole,
          createdAt: classroomAuditLogs.createdAt,
          actorName: users.fullName,
        })
        .from(classroomAuditLogs)
        .leftJoin(users, eq(classroomAuditLogs.actorId, users.id))
        .where(eq(classroomAuditLogs.classroomId, id))
        .orderBy(desc(classroomAuditLogs.createdAt))
        .limit(10);

      return sendSuccess(reply, {
        overview: {
          totalEnrolledStudents: totalEnrolled,
          activeStudents: activeStudentsCount,
          totalModules,
          totalMaterials,
          unviewedMaterialsCount,
          totalAssignments,
          submittedAssignmentsCount,
          unsubmittedAssignmentsCount,
          pendingGradingAssignmentsCount,
          gradedAssignmentsCount,
          totalAssessments,
          completedAssessmentsCount,
          studentsIncompleteAssessmentsCount,
          classAverageGrade,
          learningCompletionRate,
        },
        learningProgressAnalytics: {
          modules: moduleAnalytics,
          studentProgressDistribution: studentProgressBuckets,
          submissionRate:
            expectedTotalSubmissions > 0
              ? Math.round((submittedAssignmentsCount / expectedTotalSubmissions) * 100)
              : 0,
          gradingProgress:
            submittedAssignmentsCount > 0
              ? Math.round((gradedAssignmentsCount / submittedAssignmentsCount) * 100)
              : 100,
          quizCompletionRate:
            totalExpectedAttempts > 0
              ? Math.round((completedAssessmentsCount / totalExpectedAttempts) * 100)
              : 0,
        },
        studentAttentionCenter: attentionStudents.slice(0, 15),
        recentActivity: recentAudit,
        userRole: roleInfo.role,
      });
    }

    // -----------------------------------------------------------------------
    // B. STUDENT DASHBOARD ANALYTICS
    // -----------------------------------------------------------------------
    const modules = await db
      .select()
      .from(classroomTopics)
      .where(and(eq(classroomTopics.classroomId, id), eq(classroomTopics.status, 'PUBLISHED')))
      .orderBy(asc(classroomTopics.sortOrder));

    const materials = await db
      .select({
        id: learningMaterials.id,
        topicId: learningMaterials.topicId,
        title: learningMaterials.title,
        isRequired: learningMaterials.isRequired,
        sequenceOrder: learningMaterials.sequenceOrder,
        updatedAt: learningMaterials.updatedAt,
      })
      .from(learningMaterials)
      .where(
        and(
          eq(learningMaterials.classroomId, id),
          eq(learningMaterials.status, 'PUBLISHED')
        )
      )
      .orderBy(asc(learningMaterials.sequenceOrder));

    const studentMaterialIds = materials.map((m) => m.id);
    const progressRows =
      studentMaterialIds.length > 0
        ? await db
            .select({
              materialId: materialProgress.materialId,
              status: materialProgress.status,
              progressPercent: materialProgress.progressPercent,
              completedAt: materialProgress.completedAt,
            })
            .from(materialProgress)
            .where(
              and(
                eq(materialProgress.studentId, user.id),
                inArray(materialProgress.materialId, studentMaterialIds)
              )
            )
        : [];

    const completedMaterialIdSet = new Set(
      progressRows.filter((p) => p.status === 'COMPLETED').map((p) => p.materialId)
    );
    const completedMaterialsCount = materials.filter((m) =>
      completedMaterialIdSet.has(m.id)
    ).length;
    const incompleteMaterialsCount = Math.max(
      0,
      materials.length - completedMaterialsCount
    );

    // Identify next incomplete material (Lanjutkan Pembelajaran)
    const nextIncompleteMaterial = materials.find(
      (m) => !completedMaterialIdSet.has(m.id)
    );
    const nextModule = nextIncompleteMaterial
      ? modules.find((mod) => mod.id === nextIncompleteMaterial.topicId)
      : null;

    // Student Assignments
    const assignmentRows = await db
      .select({
        id: assignments.id,
        title: assignments.title,
        dueDate: assignments.dueAt,
        maxPoints: assignments.maxPoints,
      })
      .from(assignments)
      .where(
        and(eq(assignments.classroomId, id), eq(assignments.status, 'PUBLISHED'))
      );

    const mySubmissions = await db
      .select({
        assignmentId: assignmentSubmissions.assignmentId,
        status: assignmentSubmissions.status,
        finalScore: assignmentSubmissions.publishedScore,
        isGradePublished: assignmentSubmissions.isGradePublished,
        feedback: assignmentSubmissions.feedback,
        gradedAt: assignmentSubmissions.gradedAt,
      })
      .from(assignmentSubmissions)
      .where(eq(assignmentSubmissions.studentId, user.id));

    const mySubmittedAssignmentIds = new Set(
      mySubmissions.filter((s) => s.status !== 'DRAFT').map((s) => s.assignmentId)
    );
    const submittedAssignmentsCount = assignmentRows.filter((a) =>
      mySubmittedAssignmentIds.has(a.id)
    ).length;
    const unsubmittedAssignmentsCount = Math.max(
      0,
      assignmentRows.length - submittedAssignmentsCount
    );

    // Upcoming deadlines
    const upcomingDeadlines = assignmentRows
      .filter((a) => a.dueDate && new Date(a.dueDate).getTime() > Date.now())
      .sort((a, b) => new Date(a.dueDate!).getTime() - new Date(b.dueDate!).getTime())
      .slice(0, 5);

    // Recently graded assignments
    const recentlyGraded = mySubmissions
      .filter((s) => s.isGradePublished && s.finalScore !== null)
      .map((s) => {
        const asg = assignmentRows.find((a) => a.id === s.assignmentId);
        return {
          assignmentId: s.assignmentId,
          assignmentTitle: asg?.title || 'Tugas',
          score: s.finalScore,
          maxPoints: asg?.maxPoints || 100,
          feedback: s.feedback,
          gradedAt: s.gradedAt,
        };
      })
      .slice(0, 5);

    // Assessments
    const assessmentRows = await db
      .select({
        id: assessments.id,
        title: assessments.title,
        maxScore: assessments.maxScore,
        category: assessments.category,
      })
      .from(assessments)
      .where(
        and(eq(assessments.classroomId, id), eq(assessments.status, 'PUBLISHED'))
      );

    const myAttempts = await db
      .select({
        assessmentId: assessmentAttempts.assessmentId,
        status: assessmentAttempts.status,
        totalScore: assessmentAttempts.totalScore,
      })
      .from(assessmentAttempts)
      .where(eq(assessmentAttempts.studentId, user.id));

    const myCompletedAssessments = new Set(
      myAttempts.filter((a) => a.status === 'SUBMITTED' || a.status === 'GRADED').map((a) => a.assessmentId)
    );
    const pendingAssessmentsCount = Math.max(
      0,
      assessmentRows.length - myCompletedAssessments.size
    );

    // Published grades calculation
    const publishedScores: number[] = [];
    mySubmissions.forEach((s) => {
      if (s.isGradePublished && s.finalScore !== null) {
        publishedScores.push(Number(s.finalScore));
      }
    });
    myAttempts.forEach((a) => {
      if (a.totalScore !== null) {
        publishedScores.push(Number(a.totalScore));
      }
    });
    const averageGrade =
      publishedScores.length > 0
        ? Math.round(
            (publishedScores.reduce((acc, v) => acc + v, 0) / publishedScores.length) * 10
          ) / 10
        : null;

    // Overall Progress % (based on required published materials; optional materials don't reduce required completion)
    const requiredMaterials = materials.filter((m) => m.isRequired);
    const completedRequiredCount = requiredMaterials.filter((m) =>
      completedMaterialIdSet.has(m.id)
    ).length;
    const overallProgress =
      requiredMaterials.length > 0
        ? Math.min(100, Math.round((completedRequiredCount / requiredMaterials.length) * 100))
        : materials.length > 0
          ? Math.min(100, Math.round((completedMaterialsCount / materials.length) * 100))
          : 0;

    // Module completion breakdown
    const moduleProgressList = modules.map((mod) => {
      const modMats = materials.filter((m) => m.topicId === mod.id);
      const modReq = modMats.filter((m) => m.isRequired);
      const targetMats = modReq.length > 0 ? modReq : modMats;
      const modCompleted = targetMats.filter((m) => completedMaterialIdSet.has(m.id)).length;
      return {
        id: mod.id,
        title: mod.title,
        totalMaterials: modMats.length,
        requiredMaterials: modReq.length,
        completedMaterials: modCompleted,
        percentage:
          targetMats.length > 0 ? Math.round((modCompleted / targetMats.length) * 100) : 0,
      };
    });

    // Recent announcements
    const recentAnnouncements = await db
      .select({
        id: announcements.id,
        title: announcements.title,
        content: announcements.content,
        createdAt: announcements.createdAt,
        authorName: users.fullName,
      })
      .from(announcements)
      .innerJoin(users, eq(announcements.authorId, users.id))
      .where(eq(announcements.classroomId, id))
      .orderBy(desc(announcements.createdAt))
      .limit(3);

    return sendSuccess(reply, {
      studentDashboard: {
        totalModules: modules.length,
        completedMaterialsCount,
        incompleteMaterialsCount,
        activeAssignmentsCount: assignmentRows.length,
        unsubmittedAssignmentsCount,
        submittedAssignmentsCount,
        pendingAssessmentsCount,
        averageGrade,
        overallProgress,
        continueLearning: nextIncompleteMaterial
          ? {
              materialId: nextIncompleteMaterial.id,
              materialTitle: nextIncompleteMaterial.title,
              moduleId: nextModule?.id || null,
              moduleTitle: nextModule?.title || 'Materi Belajar',
            }
          : null,
        moduleProgress: moduleProgressList,
        upcomingDeadlines,
        recentlyGraded,
        recentAnnouncements,
      },
      userRole: 'STUDENT',
    });
  });

  // =========================================================================
  // 2. MODULE MANAGEMENT (CRUD, Archive, Reorder, Duplicate)
  // =========================================================================
  const moduleSchema = z.object({
    title: z.string().min(2, 'Judul modul minimal 2 karakter').max(200),
    description: z.string().max(1000).optional(),
    sortOrder: z.number().int().min(1).optional(),
    status: z.enum(['PUBLISHED', 'DRAFT', 'ARCHIVED']).optional(),
  });

  fastify.get('/api/v1/classrooms/:id/modules', async (req, reply) => {
    const user = await authenticateRequest(req, reply);
    if (!user) return;

    const { id } = req.params as { id: string };
    const access = await checkClassroomAccess(user, id);
    if (!access.canView) {
      return sendError(reply, 403, 'FORBIDDEN', 'Akses ditolak.');
    }

    const whereClause = access.canManage
      ? eq(classroomTopics.classroomId, id)
      : and(eq(classroomTopics.classroomId, id), eq(classroomTopics.status, 'PUBLISHED'));

    const modules = await db
      .select({
        id: classroomTopics.id,
        title: classroomTopics.title,
        description: classroomTopics.description,
        sortOrder: classroomTopics.sortOrder,
        status: classroomTopics.status,
        createdBy: classroomTopics.createdBy,
        updatedBy: classroomTopics.updatedBy,
        createdAt: classroomTopics.createdAt,
        updatedAt: classroomTopics.updatedAt,
      })
      .from(classroomTopics)
      .where(whereClause)
      .orderBy(asc(classroomTopics.sortOrder));

    // Get materials count per module
    const materials = await db
      .select({
        id: learningMaterials.id,
        topicId: learningMaterials.topicId,
      })
      .from(learningMaterials)
      .where(eq(learningMaterials.classroomId, id));

    const totalStudents = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(classroomEnrollments)
      .where(
        and(
          eq(classroomEnrollments.classroomId, id),
          eq(classroomEnrollments.status, 'active')
        )
      );
    const activeStudentCount = totalStudents[0]?.count || 0;

    const enriched = modules.map((m) => {
      const count = materials.filter((mat) => mat.topicId === m.id).length;
      return {
        ...m,
        totalMaterials: count,
        totalStudents: activeStudentCount,
        moduleCompletionPercentage: 0,
      };
    });

    return sendSuccess(reply, enriched);
  });

  fastify.post('/api/v1/classrooms/:id/modules', async (req, reply) => {
    const user = await authenticateRequest(req, reply);
    if (!user) return;

    const { id } = req.params as { id: string };
    const access = await checkClassroomAccess(user, id);
    if (!access.canManage) {
      return sendError(reply, 403, 'FORBIDDEN', 'Hanya pengajar yang dapat membuat modul.');
    }

    const parsed = moduleSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(reply, 400, 'VALIDATION_ERROR', 'Input tidak valid.', parsed.error.issues);
    }

    const roleInfo = await resolveClassroomRole(user, id);

    const [created] = await db
      .insert(classroomTopics)
      .values({
        classroomId: id,
        title: parsed.data.title,
        description: parsed.data.description || null,
        sortOrder: parsed.data.sortOrder || 1,
        status: parsed.data.status || 'PUBLISHED',
        createdBy: user.id,
        updatedBy: user.id,
      })
      .returning();

    await recordClassroomAudit({
      classroomId: id,
      actorId: user.id,
      actorRole: roleInfo.role,
      resourceType: 'MODULE',
      resourceId: created.id,
      resourceTitle: created.title,
      action: 'CREATED',
      afterValue: created as unknown as Record<string, unknown>,
      changeSummary: `Membuat modul baru: "${created.title}"`,
    });

    return sendSuccess(reply, created);
  });

  fastify.patch('/api/v1/classrooms/:id/modules/:moduleId', async (req, reply) => {
    const user = await authenticateRequest(req, reply);
    if (!user) return;

    const { id, moduleId } = req.params as { id: string; moduleId: string };
    const access = await checkClassroomAccess(user, id);
    if (!access.canManage) {
      return sendError(reply, 403, 'FORBIDDEN', 'Hanya pengajar yang dapat mengubah modul.');
    }

    const [existing] = await db
      .select()
      .from(classroomTopics)
      .where(and(eq(classroomTopics.id, moduleId), eq(classroomTopics.classroomId, id)));

    if (!existing) {
      return sendError(reply, 404, 'MODULE_NOT_FOUND', 'Modul tidak ditemukan.');
    }

    const roleInfo = await resolveClassroomRole(user, id);
    // Co-Instructor resource ownership check:
    if (
      roleInfo.role === 'CO_INSTRUCTOR' &&
      !roleInfo.canManageAll &&
      existing.createdBy &&
      existing.createdBy !== user.id
    ) {
      return sendError(
        reply,
        403,
        'FORBIDDEN_CO_INSTRUCTOR_RESOURCE_OWNERSHIP',
        'Co-Instructor tidak dapat mengubah modul yang dibuat oleh pengajar lain tanpa izin.'
      );
    }

    const parsed = moduleSchema.partial().safeParse(req.body);
    if (!parsed.success) {
      return sendError(reply, 400, 'VALIDATION_ERROR', 'Input tidak valid.', parsed.error.issues);
    }

    const [updated] = await db
      .update(classroomTopics)
      .set({
        ...(parsed.data.title !== undefined ? { title: parsed.data.title } : {}),
        ...(parsed.data.description !== undefined ? { description: parsed.data.description } : {}),
        ...(parsed.data.sortOrder !== undefined ? { sortOrder: parsed.data.sortOrder } : {}),
        ...(parsed.data.status !== undefined ? { status: parsed.data.status } : {}),
        updatedBy: user.id,
        updatedAt: new Date(),
      })
      .where(eq(classroomTopics.id, moduleId))
      .returning();

    let actionLabel: 'UPDATED' | 'PUBLISHED' | 'UNPUBLISHED' | 'ARCHIVED' | 'RESTORED' = 'UPDATED';
    if (parsed.data.status && parsed.data.status !== existing.status) {
      if (existing.status === 'ARCHIVED' && parsed.data.status !== 'ARCHIVED') {
        actionLabel = 'RESTORED';
      } else if (parsed.data.status === 'PUBLISHED') actionLabel = 'PUBLISHED';
      else if (parsed.data.status === 'ARCHIVED') actionLabel = 'ARCHIVED';
      else actionLabel = 'UNPUBLISHED';
    }

    await recordClassroomAudit({
      classroomId: id,
      actorId: user.id,
      actorRole: roleInfo.role,
      resourceType: 'MODULE',
      resourceId: updated.id,
      resourceTitle: updated.title,
      action: actionLabel,
      beforeValue: existing as unknown as Record<string, unknown>,
      afterValue: updated as unknown as Record<string, unknown>,
      changeSummary: `Memperbarui modul: "${updated.title}"`,
    });

    return sendSuccess(reply, updated);
  });

  fastify.delete('/api/v1/classrooms/:id/modules/:moduleId', async (req, reply) => {
    const user = await authenticateRequest(req, reply);
    if (!user) return;

    const { id, moduleId } = req.params as { id: string; moduleId: string };
    const access = await checkClassroomAccess(user, id);
    if (!access.canManage) {
      return sendError(reply, 403, 'FORBIDDEN', 'Hanya pengajar yang dapat menghapus modul.');
    }

    const [existing] = await db
      .select()
      .from(classroomTopics)
      .where(and(eq(classroomTopics.id, moduleId), eq(classroomTopics.classroomId, id)));

    if (!existing) {
      return sendError(reply, 404, 'MODULE_NOT_FOUND', 'Modul tidak ditemukan.');
    }

    const roleInfo = await resolveClassroomRole(user, id);
    if (
      roleInfo.role === 'CO_INSTRUCTOR' &&
      !roleInfo.canManageAll &&
      existing.createdBy &&
      existing.createdBy !== user.id
    ) {
      return sendError(
        reply,
        403,
        'FORBIDDEN_CO_INSTRUCTOR_RESOURCE_OWNERSHIP',
        'Co-Instructor tidak dapat menghapus modul milik pengajar lain tanpa izin.'
      );
    }

    // Safely detach materials and assignments before deleting module
    await db
      .update(learningMaterials)
      .set({ topicId: null })
      .where(eq(learningMaterials.topicId, moduleId));
    await db
      .update(assignments)
      .set({ topicId: null })
      .where(eq(assignments.topicId, moduleId));
    await db
      .update(assessments)
      .set({ topicId: null })
      .where(eq(assessments.topicId, moduleId));

    await db.delete(classroomTopics).where(eq(classroomTopics.id, moduleId));

    await recordClassroomAudit({
      classroomId: id,
      actorId: user.id,
      actorRole: roleInfo.role,
      resourceType: 'MODULE',
      resourceId: moduleId,
      resourceTitle: existing.title,
      action: 'DELETED',
      beforeValue: existing as unknown as Record<string, unknown>,
      changeSummary: `Menghapus modul "${existing.title}"`,
    });

    return sendSuccess(reply, { deleted: true, id: moduleId });
  });

  fastify.post('/api/v1/classrooms/:id/modules/:moduleId/duplicate', async (req, reply) => {
    const user = await authenticateRequest(req, reply);
    if (!user) return;

    const { id, moduleId } = req.params as { id: string; moduleId: string };
    const access = await checkClassroomAccess(user, id);
    if (!access.canManage) {
      return sendError(reply, 403, 'FORBIDDEN', 'Hanya pengajar yang dapat menduplikasi modul.');
    }

    const [existing] = await db
      .select()
      .from(classroomTopics)
      .where(and(eq(classroomTopics.id, moduleId), eq(classroomTopics.classroomId, id)));

    if (!existing) {
      return sendError(reply, 404, 'MODULE_NOT_FOUND', 'Modul tidak ditemukan.');
    }

    const roleInfo = await resolveClassroomRole(user, id);

    const [duplicated] = await db
      .insert(classroomTopics)
      .values({
        classroomId: id,
        title: `${existing.title} (Salinan)`,
        description: existing.description,
        sortOrder: existing.sortOrder + 1,
        status: 'DRAFT',
        createdBy: user.id,
        updatedBy: user.id,
      })
      .returning();

    await recordClassroomAudit({
      classroomId: id,
      actorId: user.id,
      actorRole: roleInfo.role,
      resourceType: 'MODULE',
      resourceId: duplicated.id,
      resourceTitle: duplicated.title,
      action: 'DUPLICATED',
      afterValue: duplicated as unknown as Record<string, unknown>,
      changeSummary: `Menduplikasi modul "${existing.title}" menjadi "${duplicated.title}"`,
    });

    return sendSuccess(reply, duplicated);
  });

  // =========================================================================
  // 3. QUICK NAVIGATION (Classwork Hierarchy & Progress)
  // =========================================================================
  fastify.get('/api/v1/classrooms/:id/classwork-navigation', async (req, reply) => {
    const user = await authenticateRequest(req, reply);
    if (!user) return;

    const { id } = req.params as { id: string };
    const access = await checkClassroomAccess(user, id);
    if (!access.canView) {
      return sendError(reply, 403, 'FORBIDDEN', 'Akses ditolak.');
    }

    const modules = await db
      .select()
      .from(classroomTopics)
      .where(
        access.canManage
          ? eq(classroomTopics.classroomId, id)
          : and(eq(classroomTopics.classroomId, id), eq(classroomTopics.status, 'PUBLISHED'))
      )
      .orderBy(asc(classroomTopics.sortOrder));

    const materials = await db
      .select({
        id: learningMaterials.id,
        topicId: learningMaterials.topicId,
        title: learningMaterials.title,
        status: learningMaterials.status,
        isRequired: learningMaterials.isRequired,
        sequenceOrder: learningMaterials.sequenceOrder,
      })
      .from(learningMaterials)
      .where(
        access.canManage
          ? eq(learningMaterials.classroomId, id)
          : and(eq(learningMaterials.classroomId, id), eq(learningMaterials.status, 'PUBLISHED'))
      )
      .orderBy(asc(learningMaterials.sequenceOrder));

    const assignmentRows = await db
      .select({
        id: assignments.id,
        topicId: assignments.topicId,
        title: assignments.title,
        dueDate: assignments.dueAt,
        status: assignments.status,
      })
      .from(assignments)
      .where(
        access.canManage
          ? eq(assignments.classroomId, id)
          : and(eq(assignments.classroomId, id), eq(assignments.status, 'PUBLISHED'))
      );

    const assessmentRows = await db
      .select({
        id: assessments.id,
        topicId: assessments.topicId,
        title: assessments.title,
        status: assessments.status,
        category: assessments.category,
      })
      .from(assessments)
      .where(
        access.canManage
          ? eq(assessments.classroomId, id)
          : and(eq(assessments.classroomId, id), eq(assessments.status, 'PUBLISHED'))
      );

    // If student, attach completion status & bookmarks
    let studentProgressMap = new Map<string, string>();
    let bookmarkedSet = new Set<string>();

    if (!access.canManage) {
      const pRows = await db
        .select({
          materialId: materialProgress.materialId,
          status: materialProgress.status,
        })
        .from(materialProgress)
        .where(eq(materialProgress.studentId, user.id));
      pRows.forEach((p) => studentProgressMap.set(p.materialId, p.status));

      const bRows = await db
        .select({ materialId: classroomMaterialBookmarks.materialId })
        .from(classroomMaterialBookmarks)
        .where(eq(classroomMaterialBookmarks.studentId, user.id));
      bRows.forEach((b) => bookmarkedSet.add(b.materialId));
    }

    const tree = modules.map((mod) => {
      const modMats = materials
        .filter((m) => m.topicId === mod.id)
        .map((m) => ({
          ...m,
          completionStatus: studentProgressMap.get(m.id) || 'NOT_STARTED',
          isBookmarked: bookmarkedSet.has(m.id),
        }));

      const modAsgs = assignmentRows.filter((a) => a.topicId === mod.id);
      const modQuizzes = assessmentRows.filter((q) => q.topicId === mod.id);

      const completedCount = modMats.filter((m) => m.completionStatus === 'COMPLETED').length;
      const completionPercentage =
        modMats.length > 0 ? Math.round((completedCount / modMats.length) * 100) : 0;

      return {
        id: mod.id,
        title: mod.title,
        description: mod.description,
        status: mod.status,
        sortOrder: mod.sortOrder,
        completionPercentage,
        materials: modMats,
        assignments: modAsgs,
        assessments: modQuizzes,
      };
    });

    // Uncategorized items
    const uncategorizedMats = materials
      .filter((m) => !m.topicId)
      .map((m) => ({
        ...m,
        completionStatus: studentProgressMap.get(m.id) || 'NOT_STARTED',
        isBookmarked: bookmarkedSet.has(m.id),
      }));
    const uncategorizedAsgs = assignmentRows.filter((a) => !a.topicId);
    const uncategorizedQuizzes = assessmentRows.filter((q) => !q.topicId);

    return sendSuccess(reply, {
      modules: tree,
      uncategorized: {
        materials: uncategorizedMats,
        assignments: uncategorizedAsgs,
        assessments: uncategorizedQuizzes,
      },
    });
  });

  // =========================================================================
  // 4. STUDENT LEARNING PROGRESS & MONITORING TABLE
  // =========================================================================
  fastify.get('/api/v1/classrooms/:id/learning-progress', async (req, reply) => {
    const user = await authenticateRequest(req, reply);
    if (!user) return;

    const { id } = req.params as { id: string };
    const access = await checkClassroomAccess(user, id);
    if (!access.canManage) {
      return sendError(reply, 403, 'FORBIDDEN', 'Hanya pengajar yang dapat melihat tabel progres belajar kelas.');
    }

    const { format, search, moduleId, status } = req.query as {
      format?: string;
      search?: string;
      moduleId?: string;
      status?: string;
    };

    const enrollments = await db
      .select({
        studentId: classroomEnrollments.studentId,
        enrolledAt: classroomEnrollments.enrolledAt,
        status: classroomEnrollments.status,
        fullName: users.fullName,
        identityNumber: users.identityNumber,
        email: users.email,
        avatarUrl: userProfiles.avatarUrl,
      })
      .from(classroomEnrollments)
      .innerJoin(users, eq(classroomEnrollments.studentId, users.id))
      .leftJoin(userProfiles, eq(users.id, userProfiles.userId))
      .where(
        and(
          eq(classroomEnrollments.classroomId, id),
          or(
            eq(classroomEnrollments.status, 'active'),
            eq(classroomEnrollments.status, 'completed')
          )
        )
      );

    const modules = await db
      .select()
      .from(classroomTopics)
      .where(eq(classroomTopics.classroomId, id));

    const materials = await db
      .select({
        id: learningMaterials.id,
        topicId: learningMaterials.topicId,
        isRequired: learningMaterials.isRequired,
      })
      .from(learningMaterials)
      .where(
        and(
          eq(learningMaterials.classroomId, id),
          eq(learningMaterials.status, 'PUBLISHED')
        )
      );

    const materialIdsForProgress = materials.map((m) => m.id);
    const progressRows =
      materialIdsForProgress.length > 0
        ? await db
            .select({
              studentId: materialProgress.studentId,
              materialId: materialProgress.materialId,
              status: materialProgress.status,
              progressPercent: materialProgress.progressPercent,
              completedAt: materialProgress.completedAt,
              updatedAt: materialProgress.updatedAt,
            })
            .from(materialProgress)
            .where(inArray(materialProgress.materialId, materialIdsForProgress))
        : [];

    const requiredMaterials = materials.filter((m) => m.isRequired);

    let rows = enrollments.map((student) => {
      const studentP = progressRows.filter((p) => p.studentId === student.studentId);
      const completedSet = new Set(
        studentP.filter((p) => p.status === 'COMPLETED').map((p) => p.materialId)
      );
      const completedMaterialsCount = materials.filter((m) => completedSet.has(m.id)).length;
      const completedRequiredCount = requiredMaterials.filter((m) =>
        completedSet.has(m.id)
      ).length;

      // Module completion calculation (only published & required materials counted)
      let completedModulesCount = 0;
      modules.forEach((mod) => {
        const modMats = materials.filter((m) => m.topicId === mod.id);
        const modReq = modMats.filter((m) => m.isRequired);
        if (modMats.length === 0) return;
        const targetMats = modReq.length > 0 ? modReq : modMats;
        const comp = targetMats.filter((m) => completedSet.has(m.id)).length;
        if (comp >= targetMats.length) {
          completedModulesCount++;
        }
      });

      const overallProgressPercent =
        requiredMaterials.length > 0
          ? Math.min(100, Math.round((completedRequiredCount / requiredMaterials.length) * 100))
          : materials.length > 0
            ? Math.min(100, Math.round((completedMaterialsCount / materials.length) * 100))
            : 0;

      const lastActivity = studentP.sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      )[0]?.updatedAt || student.enrolledAt;

      return {
        studentId: student.studentId,
        fullName: student.fullName,
        identityNumber: student.identityNumber,
        email: student.email,
        avatarUrl: student.avatarUrl,
        totalModules: modules.length,
        completedModulesCount,
        totalMaterials: materials.length,
        completedMaterialsCount,
        overallProgressPercent,
        lastActivityAt: lastActivity,
      };
    });

    if (search) {
      const q = search.toLowerCase();
      rows = rows.filter(
        (r) =>
          r.fullName.toLowerCase().includes(q) ||
          (r.identityNumber || '').toLowerCase().includes(q) ||
          r.email.toLowerCase().includes(q)
      );
    }

    if (status === 'COMPLETED') {
      rows = rows.filter((r) => r.overallProgressPercent === 100);
    } else if (status === 'IN_PROGRESS') {
      rows = rows.filter((r) => r.overallProgressPercent > 0 && r.overallProgressPercent < 100);
    } else if (status === 'NOT_STARTED') {
      rows = rows.filter((r) => r.overallProgressPercent === 0);
    }

    // Export CSV format if requested
    if (format === 'csv') {
      const header = 'NIM,Nama Mahasiswa,Email,Modul Selesai,Materi Selesai,Progres Belajar (%)\n';
      const lines = rows.map(
        (r) =>
          `"${r.identityNumber}","${r.fullName}","${r.email}",${r.completedModulesCount}/${r.totalModules},${r.completedMaterialsCount}/${r.totalMaterials},${r.overallProgressPercent}%`
      );
      reply.header('Content-Type', 'text/csv');
      reply.header('Content-Disposition', `attachment; filename="progres_kelas_${id}.csv"`);
      return reply.send(header + lines.join('\n'));
    }

    return sendSuccess(reply, {
      students: rows,
      totalStudents: rows.length,
      averageProgress:
        rows.length > 0
          ? Math.round(
              rows.reduce((acc, r) => acc + r.overallProgressPercent, 0) / rows.length
            )
          : 0,
    });
  });

  // Individual Student Learning Progress Report
  fastify.get('/api/v1/classrooms/:id/students/:studentId/progress', async (req, reply) => {
    const user = await authenticateRequest(req, reply);
    if (!user) return;

    const { id, studentId } = req.params as { id: string; studentId: string };
    const access = await checkClassroomAccess(user, id);

    // Only allow instructors or the student themselves
    if (!access.canManage && user.id !== studentId) {
      return sendError(
        reply,
        403,
        'FORBIDDEN',
        'Anda tidak memiliki akses melihat rapor progres mahasiswa lain.'
      );
    }

    const [student] = await db
      .select({
        id: users.id,
        fullName: users.fullName,
        identityNumber: users.identityNumber,
        email: users.email,
        avatarUrl: userProfiles.avatarUrl,
      })
      .from(users)
      .leftJoin(userProfiles, eq(users.id, userProfiles.userId))
      .where(eq(users.id, studentId));

    if (!student) {
      return sendError(reply, 404, 'STUDENT_NOT_FOUND', 'Mahasiswa tidak ditemukan.');
    }

    const modules = await db
      .select()
      .from(classroomTopics)
      .where(eq(classroomTopics.classroomId, id))
      .orderBy(asc(classroomTopics.sortOrder));

    const materials = await db
      .select({
        id: learningMaterials.id,
        topicId: learningMaterials.topicId,
        title: learningMaterials.title,
        isRequired: learningMaterials.isRequired,
        sequenceOrder: learningMaterials.sequenceOrder,
      })
      .from(learningMaterials)
      .where(eq(learningMaterials.classroomId, id))
      .orderBy(asc(learningMaterials.sequenceOrder));

    const progressRows = await db
      .select({
        materialId: materialProgress.materialId,
        status: materialProgress.status,
        progressPercent: materialProgress.progressPercent,
        completedAt: materialProgress.completedAt,
        updatedAt: materialProgress.updatedAt,
      })
      .from(materialProgress)
      .where(eq(materialProgress.studentId, studentId));

    const progressMap = new Map(progressRows.map((p) => [p.materialId, p]));

    const moduleReport = modules.map((mod) => {
      const modMats = materials.filter((m) => m.topicId === mod.id);
      const matsReport = modMats.map((m) => {
        const p = progressMap.get(m.id);
        return {
          id: m.id,
          title: m.title,
          isRequired: m.isRequired,
          status: p?.status || 'NOT_STARTED',
          progressPercent: p?.progressPercent || 0,
          completedAt: p?.completedAt || null,
        };
      });

      const completedCount = matsReport.filter((m) => m.status === 'COMPLETED').length;
      return {
        moduleId: mod.id,
        moduleTitle: mod.title,
        materialsCount: modMats.length,
        completedCount,
        percentage:
          modMats.length > 0 ? Math.round((completedCount / modMats.length) * 100) : 0,
        materials: matsReport,
      };
    });

    return sendSuccess(reply, {
      student,
      modules: moduleReport,
      totalMaterials: materials.length,
      completedMaterials: progressRows.filter((p) => p.status === 'COMPLETED').length,
      overallProgress:
        materials.length > 0
          ? Math.round(
              (progressRows.filter((p) => p.status === 'COMPLETED').length /
                materials.length) *
                100
            )
          : 0,
    });
  });

  // =========================================================================
  // 5. MATERIAL INTERACTION: COMPLETION TOGGLE, VIEWS, BOOKMARKS, NOTES
  // =========================================================================
  fastify.post('/api/v1/materials/:id/completion', async (req, reply) => {
    const user = await authenticateRequest(req, reply);
    if (!user) return;

    const { id } = req.params as { id: string };
    const [mat] = await db
      .select()
      .from(learningMaterials)
      .where(eq(learningMaterials.id, id));

    if (!mat) {
      return sendError(reply, 404, 'MATERIAL_NOT_FOUND', 'Materi tidak ditemukan.');
    }

    const access = await checkClassroomAccess(user, mat.classroomId);
    if (!access.canView) {
      return sendError(reply, 403, 'FORBIDDEN', 'Akses ditolak.');
    }

    const [existing] = await db
      .select()
      .from(materialProgress)
      .where(
        and(
          eq(materialProgress.materialId, id),
          eq(materialProgress.studentId, user.id)
        )
      );

    const isCurrentlyCompleted = existing?.status === 'COMPLETED';
    const nextStatus = isCurrentlyCompleted ? 'IN_PROGRESS' : 'COMPLETED';
    const nextPercent = isCurrentlyCompleted ? 50 : 100;
    const completedAt = isCurrentlyCompleted ? null : new Date();

    const [upserted] = await db
      .insert(materialProgress)
      .values({
        materialId: id,
        studentId: user.id,
        classroomId: mat.classroomId,
        progressPercent: nextPercent,
        status: nextStatus,
        completedAt,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [materialProgress.materialId, materialProgress.studentId],
        set: {
          progressPercent: nextPercent,
          status: nextStatus,
          completedAt,
          updatedAt: new Date(),
        },
      })
      .returning();

    return sendSuccess(reply, {
      materialId: id,
      status: upserted.status,
      progressPercent: upserted.progressPercent,
      completedAt: upserted.completedAt,
    });
  });

  // Record material view
  fastify.post('/api/v1/materials/:id/view', async (req, reply) => {
    const user = await authenticateRequest(req, reply);
    if (!user) return;

    const { id } = req.params as { id: string };
    const [mat] = await db
      .select({ classroomId: learningMaterials.classroomId })
      .from(learningMaterials)
      .where(eq(learningMaterials.id, id));

    if (!mat) {
      return sendError(reply, 404, 'MATERIAL_NOT_FOUND', 'Materi tidak ditemukan.');
    }

    const access = await checkClassroomAccess(user, mat.classroomId);
    if (!access.canView) {
      return sendError(reply, 403, 'FORBIDDEN', 'Akses ditolak.');
    }

    await db
      .insert(classroomMaterialViews)
      .values({
        materialId: id,
        studentId: user.id,
        classroomId: mat.classroomId,
        firstOpenedAt: new Date(),
        lastOpenedAt: new Date(),
        viewCount: 1,
      })
      .onConflictDoUpdate({
        target: [classroomMaterialViews.studentId, classroomMaterialViews.materialId],
        set: {
          lastOpenedAt: new Date(),
          viewCount: sql`${classroomMaterialViews.viewCount} + 1`,
        },
      });

    return sendSuccess(reply, { viewed: true });
  });

  // Personal Bookmarks
  fastify.post('/api/v1/materials/:id/bookmark', async (req, reply) => {
    const user = await authenticateRequest(req, reply);
    if (!user) return;

    const { id } = req.params as { id: string };
    const [mat] = await db
      .select({ classroomId: learningMaterials.classroomId })
      .from(learningMaterials)
      .where(eq(learningMaterials.id, id));

    if (!mat) {
      return sendError(reply, 404, 'MATERIAL_NOT_FOUND', 'Materi tidak ditemukan.');
    }

    await db
      .insert(classroomMaterialBookmarks)
      .values({
        studentId: user.id,
        materialId: id,
        classroomId: mat.classroomId,
      })
      .onConflictDoNothing();

    return sendSuccess(reply, { bookmarked: true, materialId: id });
  });

  fastify.delete('/api/v1/materials/:id/bookmark', async (req, reply) => {
    const user = await authenticateRequest(req, reply);
    if (!user) return;

    const { id } = req.params as { id: string };
    await db
      .delete(classroomMaterialBookmarks)
      .where(
        and(
          eq(classroomMaterialBookmarks.studentId, user.id),
          eq(classroomMaterialBookmarks.materialId, id)
        )
      );

    return sendSuccess(reply, { bookmarked: false, materialId: id });
  });

  fastify.get('/api/v1/classrooms/:id/bookmarks', async (req, reply) => {
    const user = await authenticateRequest(req, reply);
    if (!user) return;

    const { id } = req.params as { id: string };
    const bookmarks = await db
      .select({
        materialId: classroomMaterialBookmarks.materialId,
        createdAt: classroomMaterialBookmarks.createdAt,
        title: learningMaterials.title,
        subtitle: learningMaterials.subtitle,
      })
      .from(classroomMaterialBookmarks)
      .innerJoin(learningMaterials, eq(classroomMaterialBookmarks.materialId, learningMaterials.id))
      .where(
        and(
          eq(classroomMaterialBookmarks.classroomId, id),
          eq(classroomMaterialBookmarks.studentId, user.id)
        )
      );

    return sendSuccess(reply, bookmarks);
  });

  // Personal Notes
  fastify.get('/api/v1/materials/:id/note', async (req, reply) => {
    const user = await authenticateRequest(req, reply);
    if (!user) return;

    const { id } = req.params as { id: string };
    const [note] = await db
      .select()
      .from(classroomMaterialNotes)
      .where(
        and(
          eq(classroomMaterialNotes.materialId, id),
          eq(classroomMaterialNotes.studentId, user.id)
        )
      );

    return sendSuccess(reply, note || { content: '' });
  });

  fastify.put('/api/v1/materials/:id/note', async (req, reply) => {
    const user = await authenticateRequest(req, reply);
    if (!user) return;

    const { id } = req.params as { id: string };
    const [mat] = await db
      .select({ classroomId: learningMaterials.classroomId })
      .from(learningMaterials)
      .where(eq(learningMaterials.id, id));

    if (!mat) {
      return sendError(reply, 404, 'MATERIAL_NOT_FOUND', 'Materi tidak ditemukan.');
    }

    const { content } = req.body as { content?: string };
    const safeContent = content || '';

    const [saved] = await db
      .insert(classroomMaterialNotes)
      .values({
        studentId: user.id,
        materialId: id,
        classroomId: mat.classroomId,
        content: safeContent,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [classroomMaterialNotes.studentId, classroomMaterialNotes.materialId],
        set: {
          content: safeContent,
          updatedAt: new Date(),
        },
      })
      .returning();

    return sendSuccess(reply, saved);
  });

  // =========================================================================
  // 6. CHANGE HISTORY (Riwayat Perubahan)
  // =========================================================================
  fastify.get('/api/v1/classrooms/:id/change-history', async (req, reply) => {
    const user = await authenticateRequest(req, reply);
    if (!user) return;

    const { id } = req.params as { id: string };
    const access = await checkClassroomAccess(user, id);
    if (!access.canManage) {
      return sendError(
        reply,
        403,
        'FORBIDDEN',
        'Hanya pengajar yang memiliki akses melihat riwayat audit perubahan kelas.'
      );
    }

    const { page = '1', limit = '20', resourceType, action, search } = req.query as {
      page?: string;
      limit?: string;
      resourceType?: string;
      action?: string;
      search?: string;
    };

    const p = Math.max(1, parseInt(page, 10) || 1);
    const l = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const offset = (p - 1) * l;

    const conditions = [eq(classroomAuditLogs.classroomId, id)];
    if (resourceType) {
      conditions.push(eq(classroomAuditLogs.resourceType, resourceType));
    }
    if (action) {
      conditions.push(eq(classroomAuditLogs.action, action));
    }
    if (search) {
      conditions.push(ilike(classroomAuditLogs.resourceTitle, `%${search}%`));
    }

    const [totalRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(classroomAuditLogs)
      .where(and(...conditions));
    const total = totalRow?.count || 0;

    const logs = await db
      .select({
        id: classroomAuditLogs.id,
        action: classroomAuditLogs.action,
        resourceType: classroomAuditLogs.resourceType,
        resourceId: classroomAuditLogs.resourceId,
        resourceTitle: classroomAuditLogs.resourceTitle,
        actorRole: classroomAuditLogs.actorRole,
        beforeValue: classroomAuditLogs.beforeValue,
        afterValue: classroomAuditLogs.afterValue,
        changeSummary: classroomAuditLogs.changeSummary,
        createdAt: classroomAuditLogs.createdAt,
        actorId: classroomAuditLogs.actorId,
        actorName: users.fullName,
        actorEmail: users.email,
        actorAvatar: userProfiles.avatarUrl,
      })
      .from(classroomAuditLogs)
      .leftJoin(users, eq(classroomAuditLogs.actorId, users.id))
      .leftJoin(userProfiles, eq(users.id, userProfiles.userId))
      .where(and(...conditions))
      .orderBy(desc(classroomAuditLogs.createdAt))
      .limit(l)
      .offset(offset);

    return sendSuccess(reply, {
      items: logs,
      pagination: {
        page: p,
        limit: l,
        total,
        totalPages: Math.ceil(total / l),
      },
    });
  });

  // =========================================================================
  // 7. DUPLICATION ACTIONS (Materials, Assignments, Assessments)
  // =========================================================================
  fastify.post('/api/v1/materials/:id/duplicate', async (req, reply) => {
    const user = await authenticateRequest(req, reply);
    if (!user) return;

    const { id } = req.params as { id: string };
    const [mat] = await db
      .select()
      .from(learningMaterials)
      .where(eq(learningMaterials.id, id));

    if (!mat) {
      return sendError(reply, 404, 'MATERIAL_NOT_FOUND', 'Materi tidak ditemukan.');
    }

    const access = await checkClassroomAccess(user, mat.classroomId);
    if (!access.canManage) {
      return sendError(reply, 403, 'FORBIDDEN', 'Hanya pengajar yang dapat menduplikasi materi.');
    }

    const roleInfo = await resolveClassroomRole(user, mat.classroomId);

    const [duplicated] = await db
      .insert(learningMaterials)
      .values({
        classroomId: mat.classroomId,
        topicId: mat.topicId,
        authorId: user.id,
        createdBy: user.id,
        meetingNumber: mat.meetingNumber,
        title: `${mat.title} (Salinan)`,
        slug: `${mat.slug}-copy-${Date.now()}`,
        subtitle: mat.subtitle,
        description: mat.description,
        content: mat.content,
        contentJson: mat.contentJson,
        contentHtml: mat.contentHtml,
        thumbnailKey: mat.thumbnailKey,
        estimatedDuration: mat.estimatedDuration,
        isRequired: mat.isRequired,
        sequenceOrder: mat.sequenceOrder + 1,
        completionRule: mat.completionRule,
        minCompletionPercent: mat.minCompletionPercent,
        status: 'DRAFT',
        isPublished: false,
      })
      .returning();

    await recordClassroomAudit({
      classroomId: mat.classroomId,
      actorId: user.id,
      actorRole: roleInfo.role,
      resourceType: 'MATERIAL',
      resourceId: duplicated.id,
      resourceTitle: duplicated.title,
      action: 'DUPLICATED',
      afterValue: duplicated as unknown as Record<string, unknown>,
      changeSummary: `Menduplikasi materi "${mat.title}" menjadi "${duplicated.title}"`,
    });

    return sendSuccess(reply, duplicated);
  });

  fastify.post('/api/v1/assignments/:id/duplicate', async (req, reply) => {
    const user = await authenticateRequest(req, reply);
    if (!user) return;

    const { id } = req.params as { id: string };
    const [asg] = await db
      .select()
      .from(assignments)
      .where(eq(assignments.id, id));

    if (!asg) {
      return sendError(reply, 404, 'ASSIGNMENT_NOT_FOUND', 'Tugas tidak ditemukan.');
    }

    const access = await checkClassroomAccess(user, asg.classroomId);
    if (!access.canManage) {
      return sendError(reply, 403, 'FORBIDDEN', 'Hanya pengajar yang dapat menduplikasi tugas.');
    }

    const roleInfo = await resolveClassroomRole(user, asg.classroomId);

    const [duplicated] = await db
      .insert(assignments)
      .values({
        classroomId: asg.classroomId,
        topicId: asg.topicId,
        authorId: user.id,
        title: `${asg.title} (Salinan)`,
        subtitle: asg.subtitle,
        assignmentType: asg.assignmentType,
        shortDescription: asg.shortDescription,
        learningObjectives: asg.learningObjectives,
        instructions: asg.instructions,
        instructionsJson: asg.instructionsJson,
        instructionsHtml: asg.instructionsHtml,
        maxPoints: asg.maxPoints,
        estimatedCompletionMinutes: asg.estimatedCompletionMinutes,
        dueAt: asg.dueAt,
        lateSubmissionPolicy: asg.lateSubmissionPolicy,
        gradePublicationPolicy: asg.gradePublicationPolicy,
        allowLateSubmission: asg.allowLateSubmission,
        status: 'DRAFT',
        submissionConfig: asg.submissionConfig,
      })
      .returning();

    await recordClassroomAudit({
      classroomId: asg.classroomId,
      actorId: user.id,
      actorRole: roleInfo.role,
      resourceType: 'ASSIGNMENT',
      resourceId: duplicated.id,
      resourceTitle: duplicated.title,
      action: 'DUPLICATED',
      afterValue: duplicated as unknown as Record<string, unknown>,
      changeSummary: `Menduplikasi tugas "${asg.title}" menjadi "${duplicated.title}"`,
    });

    return sendSuccess(reply, duplicated);
  });

  fastify.post('/api/v1/assessments/:id/duplicate', async (req, reply) => {
    const user = await authenticateRequest(req, reply);
    if (!user) return;

    const { id } = req.params as { id: string };
    const [asm] = await db
      .select()
      .from(assessments)
      .where(eq(assessments.id, id));

    if (!asm) {
      return sendError(reply, 404, 'ASSESSMENT_NOT_FOUND', 'Asesmen tidak ditemukan.');
    }

    const access = await checkClassroomAccess(user, asm.classroomId);
    if (!access.canManage) {
      return sendError(reply, 403, 'FORBIDDEN', 'Hanya pengajar yang dapat menduplikasi asesmen.');
    }

    const roleInfo = await resolveClassroomRole(user, asm.classroomId);

    const [duplicated] = await db
      .insert(assessments)
      .values({
        classroomId: asm.classroomId,
        topicId: asm.topicId,
        authorId: user.id,
        title: `${asm.title} (Salinan)`,
        description: asm.description,
        category: asm.category,
        assessmentMode: asm.assessmentMode,
        instructions: asm.instructions,
        instructionsJson: asm.instructionsJson,
        instructionsHtml: asm.instructionsHtml,
        maxScore: asm.maxScore,
        passingGrade: asm.passingGrade,
        durationMinutes: asm.durationMinutes,
        status: 'DRAFT',
        settingsConfig: asm.settingsConfig,
      })
      .returning();

    await recordClassroomAudit({
      classroomId: asm.classroomId,
      actorId: user.id,
      actorRole: roleInfo.role,
      resourceType: 'ASSESSMENT',
      resourceId: duplicated.id,
      resourceTitle: duplicated.title,
      action: 'DUPLICATED',
      afterValue: duplicated as unknown as Record<string, unknown>,
      changeSummary: `Menduplikasi asesmen "${asm.title}" menjadi "${duplicated.title}"`,
    });

    return sendSuccess(reply, duplicated);
  });

  // =========================================================================
  // 8. UNIFIED CLASSROOM SEARCH
  // =========================================================================
  fastify.get('/api/v1/classrooms/:id/search', async (req, reply) => {
    const user = await authenticateRequest(req, reply);
    if (!user) return;

    const { id } = req.params as { id: string };
    const access = await checkClassroomAccess(user, id);
    if (!access.canView) {
      return sendError(reply, 403, 'FORBIDDEN', 'Akses ditolak.');
    }

    const { q = '' } = req.query as { q?: string };
    const query = q.trim();
    if (!query) {
      return sendSuccess(reply, { results: [] });
    }

    const pattern = `%${query}%`;

    const foundModules = await db
      .select({
        id: classroomTopics.id,
        title: classroomTopics.title,
        description: classroomTopics.description,
        type: sql<string>`'MODULE'`,
      })
      .from(classroomTopics)
      .where(
        and(
          eq(classroomTopics.classroomId, id),
          or(ilike(classroomTopics.title, pattern), ilike(classroomTopics.description, pattern)),
          access.canManage ? sql`true` : eq(classroomTopics.status, 'PUBLISHED')
        )
      )
      .limit(5);

    const foundMaterials = await db
      .select({
        id: learningMaterials.id,
        title: learningMaterials.title,
        description: learningMaterials.description,
        type: sql<string>`'MATERIAL'`,
      })
      .from(learningMaterials)
      .where(
        and(
          eq(learningMaterials.classroomId, id),
          or(ilike(learningMaterials.title, pattern), ilike(learningMaterials.description, pattern)),
          access.canManage ? sql`true` : eq(learningMaterials.status, 'PUBLISHED')
        )
      )
      .limit(5);

    const foundAssignments = await db
      .select({
        id: assignments.id,
        title: assignments.title,
        description: assignments.shortDescription,
        type: sql<string>`'ASSIGNMENT'`,
      })
      .from(assignments)
      .where(
        and(
          eq(assignments.classroomId, id),
          or(ilike(assignments.title, pattern), ilike(assignments.shortDescription, pattern)),
          access.canManage ? sql`true` : eq(assignments.status, 'PUBLISHED')
        )
      )
      .limit(5);

    const foundAssessments = await db
      .select({
        id: assessments.id,
        title: assessments.title,
        description: assessments.description,
        type: sql<string>`'ASSESSMENT'`,
      })
      .from(assessments)
      .where(
        and(
          eq(assessments.classroomId, id),
          or(ilike(assessments.title, pattern), ilike(assessments.description, pattern)),
          access.canManage ? sql`true` : eq(assessments.status, 'PUBLISHED')
        )
      )
      .limit(5);

    const foundAnnouncements = await db
      .select({
        id: announcements.id,
        title: announcements.title,
        description: announcements.content,
        type: sql<string>`'ANNOUNCEMENT'`,
      })
      .from(announcements)
      .where(
        and(
          eq(announcements.classroomId, id),
          or(ilike(announcements.title, pattern), ilike(announcements.content, pattern))
        )
      )
      .limit(5);

    const results = [
      ...foundModules,
      ...foundMaterials,
      ...foundAssignments,
      ...foundAssessments,
      ...foundAnnouncements,
    ];

    return sendSuccess(reply, { results });
  });

  // =========================================================================
  // 9. MODULE REORDERING
  // =========================================================================
  fastify.post('/api/v1/classrooms/:id/modules/reorder', async (req, reply) => {
    const user = await authenticateRequest(req, reply);
    if (!user) return;

    const { id } = req.params as { id: string };
    const access = await checkClassroomAccess(user, id);
    if (!access.canManage) {
      return sendError(reply, 403, 'FORBIDDEN', 'Hanya pengajar yang dapat mengatur urutan modul.');
    }

    const parsed = z
      .object({
        moduleIds: z.array(z.string().uuid()).min(1),
      })
      .safeParse(req.body);
    if (!parsed.success) {
      return sendError(reply, 400, 'VALIDATION_ERROR', 'Daftar ID modul tidak valid.', parsed.error.issues);
    }

    const roleInfo = await resolveClassroomRole(user, id);

    await db.transaction(async (tx) => {
      for (let i = 0; i < parsed.data.moduleIds.length; i++) {
        await tx
          .update(classroomTopics)
          .set({ sortOrder: i + 1, updatedBy: user.id, updatedAt: new Date() })
          .where(
            and(
              eq(classroomTopics.id, parsed.data.moduleIds[i]),
              eq(classroomTopics.classroomId, id)
            )
          );
      }
    });

    await recordClassroomAudit({
      classroomId: id,
      actorId: user.id,
      actorRole: roleInfo.role,
      resourceType: 'MODULE',
      resourceId: null,
      resourceTitle: 'Urutan Modul Pembelajaran',
      action: 'REORDERED',
      afterValue: { moduleIds: parsed.data.moduleIds },
      changeSummary: `Mengubah urutan ${parsed.data.moduleIds.length} modul pembelajaran`,
    });

    return sendSuccess(reply, { reordered: true, moduleIds: parsed.data.moduleIds });
  });

  // =========================================================================
  // 10. MATERIAL CONTENT VERSIONING & RESTORE
  // =========================================================================
  fastify.get('/api/v1/materials/:id/versions', async (req, reply) => {
    const user = await authenticateRequest(req, reply);
    if (!user) return;

    const { id } = req.params as { id: string };
    const [mat] = await db
      .select({ id: learningMaterials.id, classroomId: learningMaterials.classroomId })
      .from(learningMaterials)
      .where(eq(learningMaterials.id, id));

    if (!mat) {
      return sendError(reply, 404, 'MATERIAL_NOT_FOUND', 'Materi tidak ditemukan.');
    }

    const access = await checkClassroomAccess(user, mat.classroomId);
    if (!access.canManage) {
      return sendError(reply, 403, 'FORBIDDEN', 'Hanya pengajar yang dapat melihat riwayat versi materi.');
    }

    const versions = await db
      .select({
        id: classroomResourceVersions.id,
        versionNumber: classroomResourceVersions.versionNumber,
        title: classroomResourceVersions.title,
        contentJson: classroomResourceVersions.contentJson,
        contentHtml: classroomResourceVersions.contentHtml,
        changeNotes: classroomResourceVersions.changeNotes,
        createdAt: classroomResourceVersions.createdAt,
        createdByName: users.fullName,
      })
      .from(classroomResourceVersions)
      .leftJoin(users, eq(classroomResourceVersions.createdById, users.id))
      .where(
        and(
          eq(classroomResourceVersions.resourceId, id),
          eq(classroomResourceVersions.resourceType, 'MATERIAL')
        )
      )
      .orderBy(desc(classroomResourceVersions.versionNumber));

    return sendSuccess(reply, { versions });
  });

  fastify.post('/api/v1/materials/:id/versions/:versionId/restore', async (req, reply) => {
    const user = await authenticateRequest(req, reply);
    if (!user) return;

    const { id, versionId } = req.params as { id: string; versionId: string };
    const [mat] = await db
      .select()
      .from(learningMaterials)
      .where(eq(learningMaterials.id, id));

    if (!mat) {
      return sendError(reply, 404, 'MATERIAL_NOT_FOUND', 'Materi tidak ditemukan.');
    }

    const access = await checkClassroomAccess(user, mat.classroomId);
    if (!access.canManage) {
      return sendError(reply, 403, 'FORBIDDEN', 'Hanya pengajar yang dapat memulihkan versi materi.');
    }

    const roleInfo = await resolveClassroomRole(user, mat.classroomId);
    const ownerId = mat.createdBy || mat.authorId;
    if (roleInfo.role === 'CO_INSTRUCTOR' && !roleInfo.canManageAll && ownerId !== user.id) {
      return sendError(
        reply,
        403,
        'FORBIDDEN_CO_INSTRUCTOR_RESOURCE_OWNERSHIP',
        'Co-Instructor tidak dapat memulihkan versi materi milik pengajar lain tanpa izin.'
      );
    }

    const [version] = await db
      .select()
      .from(classroomResourceVersions)
      .where(
        and(
          eq(classroomResourceVersions.id, versionId),
          eq(classroomResourceVersions.resourceId, id)
        )
      );

    if (!version) {
      return sendError(reply, 404, 'VERSION_NOT_FOUND', 'Versi materi tidak ditemukan.');
    }

    const existingVersions = await db
      .select({ versionNumber: classroomResourceVersions.versionNumber })
      .from(classroomResourceVersions)
      .where(eq(classroomResourceVersions.resourceId, id))
      .orderBy(desc(classroomResourceVersions.versionNumber))
      .limit(1);
    const nextVersion = (existingVersions[0]?.versionNumber || 0) + 1;

    const [restored] = await db.transaction(async (tx) => {
      const [updatedMat] = await tx
        .update(learningMaterials)
        .set({
          title: version.title,
          contentJson: version.contentJson || mat.contentJson,
          contentHtml: version.contentHtml ?? mat.contentHtml,
          updatedAt: new Date(),
        })
        .where(eq(learningMaterials.id, id))
        .returning();

      await tx.insert(classroomResourceVersions).values({
        classroomId: mat.classroomId,
        resourceType: 'MATERIAL',
        resourceId: id,
        versionNumber: nextVersion,
        title: updatedMat.title,
        contentJson: updatedMat.contentJson,
        contentHtml: updatedMat.contentHtml,
        createdById: user.id,
        changeNotes: `Dipulihkan dari versi v${version.versionNumber}`,
      });

      return [updatedMat];
    });

    await recordClassroomAudit({
      classroomId: mat.classroomId,
      actorId: user.id,
      actorRole: roleInfo.role,
      resourceType: 'MATERIAL',
      resourceId: id,
      resourceTitle: restored.title,
      action: 'RESTORED',
      beforeValue: { title: mat.title },
      afterValue: { title: restored.title, restoredFromVersion: version.versionNumber },
      changeSummary: `Memulihkan materi "${restored.title}" ke versi v${version.versionNumber}`,
    });

    return sendSuccess(reply, restored);
  });

  // =========================================================================
  // 11. STUDENT ATTENTION NOTIFICATION
  // =========================================================================
  fastify.post('/api/v1/classrooms/:id/notify-student', async (req, reply) => {
    const user = await authenticateRequest(req, reply);
    if (!user) return;

    const { id } = req.params as { id: string };
    const access = await checkClassroomAccess(user, id);
    if (!access.canManage) {
      return sendError(reply, 403, 'FORBIDDEN', 'Hanya pengajar yang dapat mengirim notifikasi.');
    }

    const parsed = z
      .object({
        studentId: z.string().uuid(),
        title: z.string().min(2).max(200),
        message: z.string().min(2).max(1000),
        link: z.string().max(500).optional(),
      })
      .safeParse(req.body);

    if (!parsed.success) {
      return sendError(reply, 400, 'VALIDATION_ERROR', 'Input notifikasi tidak valid.', parsed.error.issues);
    }

    const [created] = await db
      .insert(notifications)
      .values({
        userId: parsed.data.studentId,
        type: 'CLASSROOM_REMINDER',
        title: parsed.data.title,
        message: parsed.data.message,
        linkUrl: parsed.data.link || `/classrooms/${id}`,
      })
      .returning();

    return sendSuccess(reply, created);
  });
}
