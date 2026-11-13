import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { eq, and, desc, asc, ilike, or, sql, inArray } from 'drizzle-orm';
import { db } from '../db/index.ts';
import {
  users,
  userProfiles,
  roles,
  userRoles,
  permissions,
  rolePermissions,
  auditLogs,
  courses,
  semesters,
  classrooms,
  classroomInstructors,
  classroomJoinCodes,
  classroomEnrollments,
  academicPeriods,
  academicCalendarEvents,
  courseOfferings,
  campusBuildings,
  campusRooms,
  classroomSchedules,
  classroomEnrollmentPolicies,
  classroomWaitlists,
  classroomInvitations,
  classroomApprovals,
  classroomEvents,
  assignments,
  assignmentSubmissions,
  assessments,
  assessmentAttempts,
} from '../db/schema.ts';
import {
  authenticateRequest,
  sendSuccess,
  sendError,
  recordAuditLog,
  AuthenticatedUser,
  ensureRbacInitialized,
} from './security.ts';
import {
  processAndOptimizeCoverImage,
  removeCoverImageFiles,
} from './imageOptimization.ts';
import { resolvePrivateObjectPath } from './storage.ts';
import { resolveClassroomRole, recordClassroomAudit } from './classroomWorkspaceRoutes.ts';

// Role checking helper
function isSuperadmin(user: AuthenticatedUser): boolean {
  return user.roles.some((r) => r.toUpperCase() === 'SUPERADMIN');
}

function isLecturerOrAdmin(user: AuthenticatedUser): boolean {
  return user.roles.some((r) => ['SUPERADMIN', 'DOSEN'].includes(r.toUpperCase()));
}

// Ensure default academic master seed and RBAC permissions exist
export async function ensureAcademicMasterSeeded(): Promise<void> {
  try {
    await ensureRbacInitialized();

    const existingPeriods = await db.select().from(academicPeriods);
    let defaultPeriodId: string;

    if (existingPeriods.length === 0) {
      console.log('Seeding initial Academic Periods and Campus Facilities for Politeknik Kampar...');
      const superadminRows = await db
        .select()
        .from(users)
        .where(ilike(users.email, 'superadmin%'));
      const adminId = superadminRows[0]?.id || null;

      const [period] = await db
        .insert(academicPeriods)
        .values({
          code: '20261',
          name: 'Semester Ganjil 2026/2027',
          academicYear: '2026/2027',
          semesterType: 'ODD',
          description: 'Periode akademik resmi Semester Ganjil Tahun Akademik 2026/2027 Politeknik Kampar.',
          preparationStartDate: new Date('2026-08-15T00:00:00Z'),
          startDate: new Date('2026-09-01T00:00:00Z'),
          endDate: new Date('2027-01-31T23:59:59Z'),
          status: 'ACTIVE',
          isDefault: true,
          administrativeNotes: 'Semester aktif utama perkuliahan reguler Politeknik Kampar.',
          createdById: adminId,
          metadata: { everActivated: true, notes: 'Periode Perkuliahan Reguler Kampus Politeknik Kampar' },
        })
        .returning();

      defaultPeriodId = period.id;

      // Seed Campus Buildings
      const [gdu, glt] = await db
        .insert(campusBuildings)
        .values([
          {
            code: 'GDU',
            name: 'Gedung Utama Politeknik Kampar',
            location: 'Sayap Timur Kampus Terpadu Bangkinang',
            totalFloors: 4,
            isActive: true,
          },
          {
            code: 'GLT',
            name: 'Gedung Laboratorium Rekayasa & Komputasi',
            location: 'Sayap Barat Kampus Terpadu Bangkinang',
            totalFloors: 3,
            isActive: true,
          },
        ])
        .returning();

      // Seed Campus Rooms
      await db.insert(campusRooms).values([
        {
          buildingId: gdu.id,
          roomNumber: 'GDU-101',
          name: 'Ruang Kuliah Teori A-101',
          roomType: 'CLASSROOM',
          capacity: 45,
          facilities: ['Proyektor HD', 'Sound System', 'AC Split', 'Whiteboard', 'WiFi 6'],
          isActive: true,
        },
        {
          buildingId: gdu.id,
          roomNumber: 'GDU-102',
          name: 'Ruang Kuliah Teori A-102',
          roomType: 'CLASSROOM',
          capacity: 45,
          facilities: ['Smart TV 75"', 'AC Split', 'Whiteboard', 'WiFi 6'],
          isActive: true,
        },
        {
          buildingId: glt.id,
          roomNumber: 'GLT-201',
          name: 'Laboratorium Rekayasa Perangkat Lunak & Cloud',
          roomType: 'LABORATORY',
          capacity: 36,
          facilities: ['36 Workstations PC i7/32GB', 'Gigabit LAN', 'Server Rack', 'Dual Projector'],
          isActive: true,
        },
        {
          buildingId: glt.id,
          roomNumber: 'GLT-202',
          name: 'Laboratorium Jaringan & Cyber Security',
          roomType: 'LABORATORY',
          capacity: 36,
          facilities: ['Cisco Routers & Switches Rack', 'Firewall Appliance', 'AC Central', 'Workstations'],
          isActive: true,
        },
      ]);

      // Seed Course Offerings from existing Courses
      const existingCourses = await db.select().from(courses);
      if (existingCourses.length > 0) {
        for (const c of existingCourses) {
          await db.insert(courseOfferings).values({
            courseId: c.id,
            academicPeriodId: defaultPeriodId,
            studyProgram: c.studyProgram || 'Teknik Informatika',
            courseCode: c.code,
            courseName: c.title,
            theoryCredits: 2,
            practicalCredits: 1,
            totalCredits: c.credits || 3,
            offeringStatus: 'OFFERED',
            maxClassrooms: 4,
            createdById: adminId,
          }).onConflictDoNothing();
        }
      }
    } else {
      // If periods exist but courseOfferings are not yet seeded, populate from master courses
      const existingOfferings = await db.select().from(courseOfferings);
      if (existingOfferings.length === 0) {
        const defaultPeriods = await db
          .select()
          .from(academicPeriods)
          .where(eq(academicPeriods.isDefault, true));
        const targetPeriod = defaultPeriods[0] || existingPeriods[0];
        const existingCourses = await db.select().from(courses);
        if (targetPeriod && existingCourses.length > 0) {
          const superadminRows = await db
            .select()
            .from(users)
            .where(ilike(users.email, 'superadmin%'));
          const adminId = superadminRows[0]?.id || null;
          for (const c of existingCourses) {
            await db
              .insert(courseOfferings)
              .values({
                courseId: c.id,
                academicPeriodId: targetPeriod.id,
                studyProgram: c.studyProgram || 'Teknik Informatika',
                courseCode: c.code,
                courseName: c.title,
                theoryCredits: 2,
                practicalCredits: 1,
                totalCredits: c.credits || 3,
                offeringStatus: 'OFFERED',
                maxClassrooms: 4,
                createdById: adminId,
              })
              .onConflictDoNothing();
          }
        }
      }
    }
  } catch (err) {
    console.warn('Academic master seeding error (non-fatal):', err);
  }
}

// Conflict Detection Algorithm
interface ScheduleConflictQuery {
  classroomId?: string;
  scheduleId?: string;
  dayOfWeek: number;
  startTime: string; // "08:00"
  endTime: string;   // "10:30"
  instructorId?: string | null;
  roomId?: string | null;
}

export async function detectScheduleConflicts(params: ScheduleConflictQuery): Promise<{
  hasConflict: boolean;
  conflicts: Array<{
    type: 'INSTRUCTOR' | 'ROOM';
    message: string;
    classroomId: string;
    classroomName: string;
    scheduleId: string;
    dayOfWeek: number;
    startTime: string;
    endTime: string;
    detail: string;
  }>;
}> {
  const conflicts: any[] = [];
  const { classroomId, scheduleId, dayOfWeek, startTime, endTime, instructorId, roomId } = params;

  // Time overlap condition in 24h format "HH:MM":
  // existing.startTime < new.endTime AND existing.endTime > new.startTime
  const candidateSchedules = await db
    .select({
      schedule: classroomSchedules,
      cls: classrooms,
      instUser: users,
      room: campusRooms,
      bld: campusBuildings,
    })
    .from(classroomSchedules)
    .innerJoin(classrooms, eq(classroomSchedules.classroomId, classrooms.id))
    .leftJoin(users, eq(classroomSchedules.instructorId, users.id))
    .leftJoin(campusRooms, eq(classroomSchedules.roomId, campusRooms.id))
    .leftJoin(campusBuildings, eq(classroomSchedules.buildingId, campusBuildings.id))
    .where(
      and(
        eq(classroomSchedules.dayOfWeek, dayOfWeek),
        eq(classrooms.lifecycleStatus, 'active')
      )
    );

  for (const row of candidateSchedules) {
    // Skip checking against current schedule being edited or same classroom entry
    if (scheduleId && row.schedule.id === scheduleId) continue;
    if (classroomId && row.schedule.classroomId === classroomId && row.schedule.id === scheduleId) continue;

    const sStart = row.schedule.startTime;
    const sEnd = row.schedule.endTime;
    const isOverlapping = sStart < endTime && sEnd > startTime;

    if (!isOverlapping) continue;

    // Check Lecturer conflict
    if (instructorId && row.schedule.instructorId === instructorId) {
      conflicts.push({
        type: 'INSTRUCTOR',
        message: `Konflik Jadwal Dosen: ${row.instUser?.fullName || 'Dosen'} sudah memiliki jadwal mengajar di kelas "${row.cls.name}" pada hari yang sama pukul ${sStart} - ${sEnd}.`,
        classroomId: row.cls.id,
        classroomName: row.cls.name,
        scheduleId: row.schedule.id,
        dayOfWeek,
        startTime: sStart,
        endTime: sEnd,
        detail: row.instUser?.fullName || 'Dosen Pengampu',
      });
    }

    // Check Room conflict
    if (roomId && row.schedule.roomId === roomId) {
      conflicts.push({
        type: 'ROOM',
        message: `Konflik Ruangan Kampus: Ruang ${row.room?.roomNumber || 'Ruangan'} (${row.room?.name || ''}) telah dipesan oleh kelas "${row.cls.name}" pada pukul ${sStart} - ${sEnd}.`,
        classroomId: row.cls.id,
        classroomName: row.cls.name,
        scheduleId: row.schedule.id,
        dayOfWeek,
        startTime: sStart,
        endTime: sEnd,
        detail: `${row.bld?.code || ''} ${row.room?.roomNumber || ''}`,
      });
    }
  }

  return {
    hasConflict: conflicts.length > 0,
    conflicts,
  };
}

export async function registerAcademicClassroomRoutes(fastify: FastifyInstance): Promise<void> {
  // Ensure seed check
  fastify.addHook('preHandler', async (req) => {
    if (req.url.startsWith('/api/v1')) {
      await ensureAcademicMasterSeeded();
    }
  });

  // ============================================================================
  // MODULE A: ACADEMIC PERIOD MANAGEMENT (PURE SEMESTER CRUD & RBAC)
  // ============================================================================

  // Public/Lecturer endpoint: Get currently active default academic period
  fastify.get('/api/v1/academic-periods/default', async (req, reply) => {
    const user = await authenticateRequest(req, reply, {
      requiredPermissions: ['academic_period.view'],
    });
    if (!user) return;

    const [defaultPeriod] = await db
      .select()
      .from(academicPeriods)
      .where(eq(academicPeriods.isDefault, true))
      .limit(1);

    if (!defaultPeriod) {
      // Fallback to latest active period
      const [latest] = await db
        .select()
        .from(academicPeriods)
        .where(eq(academicPeriods.status, 'ACTIVE'))
        .orderBy(desc(academicPeriods.startDate))
        .limit(1);

      return sendSuccess(reply, latest || null);
    }

    return sendSuccess(reply, defaultPeriod);
  });

  // Handler for listing all academic periods with enrichment
  const listAcademicPeriodsHandler = async (req: FastifyRequest, reply: FastifyReply) => {
    const user = await authenticateRequest(req, reply, {
      requiredPermissions: ['academic_period.view'],
    });
    if (!user) return;

    const query = req.query as {
      status?: string;
      search?: string;
      academicYear?: string;
      semesterType?: string;
      sortBy?: string;
      sortOrder?: string;
      page?: string;
      limit?: string;
    };

    const all = await db
      .select()
      .from(academicPeriods)
      .orderBy(desc(academicPeriods.startDate));

    let filtered = all;

    if (query.status && query.status !== 'all') {
      const qStatus = query.status.toUpperCase();
      filtered = filtered.filter((p) => p.status.toUpperCase() === qStatus);
    }
    if (query.academicYear && query.academicYear !== 'all') {
      filtered = filtered.filter((p) => p.academicYear === query.academicYear);
    }
    if (query.semesterType && query.semesterType !== 'all') {
      const qSemType = query.semesterType.toUpperCase();
      filtered = filtered.filter((p) => p.semesterType.toUpperCase() === qSemType);
    }
    if (query.search) {
      const q = query.search.toLowerCase().trim();
      filtered = filtered.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.code.toLowerCase().includes(q) ||
          p.academicYear.toLowerCase().includes(q)
      );
    }

    // Attach count of active classrooms and course offerings
    const enriched = await Promise.all(
      filtered.map(async (period) => {
        const clsList = await db
          .select({ id: classrooms.id })
          .from(classrooms)
          .where(eq(classrooms.academicPeriodId, period.id));
        const offeringList = await db
          .select({ id: courseOfferings.id })
          .from(courseOfferings)
          .where(eq(courseOfferings.academicPeriodId, period.id));

        return {
          ...period,
          classroomCount: clsList.length,
          courseOfferingCount: offeringList.length,
        };
      })
    );

    // Sorting
    const sortBy = query.sortBy || 'startDate';
    const sortOrder = (query.sortOrder || 'desc').toLowerCase();
    enriched.sort((a: any, b: any) => {
      let valA = a[sortBy];
      let valB = b[sortBy];
      if (valA instanceof Date) valA = valA.getTime();
      if (valB instanceof Date) valB = valB.getTime();
      if (typeof valA === 'string') valA = valA.toLowerCase();
      if (typeof valB === 'string') valB = valB.toLowerCase();
      if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
      if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });

    // Pagination
    const page = parseInt(query.page || '1', 10);
    const limit = parseInt(query.limit || '50', 10);
    const total = enriched.length;
    const startIndex = (page - 1) * limit;
    const paginated = enriched.slice(startIndex, startIndex + limit);

    return sendSuccess(reply, paginated, {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    });
  };

  // Mount list endpoints for both admin and public prefix
  fastify.get('/api/v1/admin/academic-periods', listAcademicPeriodsHandler);
  fastify.get('/api/v1/academic-periods', listAcademicPeriodsHandler);

  // Detail endpoint handler
  const getAcademicPeriodDetailHandler = async (req: FastifyRequest, reply: FastifyReply) => {
    const user = await authenticateRequest(req, reply, {
      requiredPermissions: ['academic_period.view'],
    });
    if (!user) return;

    const { id } = req.params as { id: string };
    const [period] = await db
      .select()
      .from(academicPeriods)
      .where(eq(academicPeriods.id, id));

    if (!period) {
      return sendError(reply, 404, 'NOT_FOUND', 'Periode akademik tidak ditemukan.');
    }

    const clsList = await db
      .select({ id: classrooms.id })
      .from(classrooms)
      .where(eq(classrooms.academicPeriodId, period.id));
    const offeringList = await db
      .select({ id: courseOfferings.id })
      .from(courseOfferings)
      .where(eq(courseOfferings.academicPeriodId, period.id));

    return sendSuccess(reply, {
      ...period,
      classroomCount: clsList.length,
      courseOfferingCount: offeringList.length,
    });
  };

  fastify.get('/api/v1/admin/academic-periods/:id', getAcademicPeriodDetailHandler);
  fastify.get('/api/v1/academic-periods/:id', getAcademicPeriodDetailHandler);

  // Superadmin: Create new Academic Period (Pure Semester)
  const createAcademicPeriodSchema = z.object({
    academic_code: z.string().min(3).max(30).optional(),
    code: z.string().min(3).max(30).optional(),
    name: z.string().min(3).max(150),
    academic_year: z.string().min(4).max(20).optional(),
    academicYear: z.string().min(4).max(20).optional(),
    semester_type: z.string().optional(),
    semesterType: z.string().optional(),
    description: z.string().optional().default(''),
    preparation_start_date: z.string().nullable().optional(),
    preparationStartDate: z.string().nullable().optional(),
    lecture_start_date: z.string().optional(),
    startDate: z.string().optional(),
    lecture_end_date: z.string().optional(),
    endDate: z.string().optional(),
    is_default: z.boolean().optional(),
    isDefault: z.boolean().optional(),
    status: z.string().optional().default('DRAFT'),
    administrative_notes: z.string().optional().default(''),
    administrativeNotes: z.string().optional().default(''),
    metadata: z.record(z.string(), z.unknown()).optional(),
  });

  fastify.post('/api/v1/admin/academic-periods', async (req, reply) => {
    const user = await authenticateRequest(req, reply, {
      requiredPermissions: ['academic_period.create'],
    });
    if (!user) return;

    const parsed = createAcademicPeriodSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(
        reply,
        400,
        'VALIDATION_ERROR',
        'Data periode akademik tidak valid.',
        parsed.error.issues
      );
    }

    const data = parsed.data;
    const code = (data.code || data.academic_code)?.trim();
    if (!code) {
      return sendError(reply, 400, 'VALIDATION_ERROR', 'Kode periode akademik (academic_code) wajib diisi.');
    }

    const academicYear = (data.academicYear || data.academic_year)?.trim();
    if (!academicYear) {
      return sendError(reply, 400, 'VALIDATION_ERROR', 'Tahun akademik (academic_year) wajib diisi.');
    }

    const rawSemesterType = (data.semesterType || data.semester_type)?.trim().toUpperCase();
    if (!rawSemesterType || !['ODD', 'EVEN', 'SHORT'].includes(rawSemesterType)) {
      return sendError(reply, 400, 'VALIDATION_ERROR', 'Tipe semester harus ODD, EVEN, atau SHORT.');
    }
    const semesterType = rawSemesterType as 'ODD' | 'EVEN' | 'SHORT';

    const rawStartDate = data.startDate || data.lecture_start_date;
    const rawEndDate = data.endDate || data.lecture_end_date;
    if (!rawStartDate || !rawEndDate) {
      return sendError(reply, 400, 'VALIDATION_ERROR', 'Tanggal mulai dan selesai perkuliahan wajib diisi.');
    }

    const startDate = new Date(rawStartDate);
    const endDate = new Date(rawEndDate);
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      return sendError(reply, 400, 'INVALID_DATES', 'Format tanggal perkuliahan tidak valid.');
    }
    if (startDate >= endDate) {
      return sendError(reply, 400, 'INVALID_DATE_RANGE', 'Tanggal mulai perkuliahan harus lebih awal dari tanggal selesai perkuliahan.');
    }

    let prepDate: Date | null = null;
    const rawPrep = data.preparationStartDate || data.preparation_start_date;
    if (rawPrep) {
      prepDate = new Date(rawPrep);
      if (isNaN(prepDate.getTime())) {
        return sendError(reply, 400, 'INVALID_DATES', 'Format tanggal persiapan tidak valid.');
      }
    }

    const rawStatus = (data.status || 'DRAFT').trim().toUpperCase();
    if (!['DRAFT', 'SCHEDULED', 'ACTIVE', 'COMPLETED', 'ARCHIVED'].includes(rawStatus)) {
      return sendError(reply, 400, 'VALIDATION_ERROR', 'Status periode tidak valid (DRAFT, SCHEDULED, ACTIVE, COMPLETED, ARCHIVED).');
    }
    const status = rawStatus;

    const isDefault = data.isDefault ?? data.is_default ?? false;
    const description = data.description || '';
    const administrativeNotes = data.administrativeNotes || data.administrative_notes || '';

    // Check code uniqueness
    const [existingCode] = await db
      .select({ id: academicPeriods.id })
      .from(academicPeriods)
      .where(eq(academicPeriods.code, code))
      .limit(1);

    if (existingCode) {
      return sendError(reply, 409, 'CODE_EXISTS', `Kode periode akademik "${code}" sudah terdaftar.`);
    }

    try {
      const result = await db.transaction(async (tx) => {
        if (isDefault) {
          await tx
            .update(academicPeriods)
            .set({ isDefault: false, updatedAt: new Date() });
        }

        const [created] = await tx
          .insert(academicPeriods)
          .values({
            code,
            name: data.name.trim(),
            academicYear,
            semesterType,
            description,
            preparationStartDate: prepDate,
            startDate,
            endDate,
            status,
            isDefault,
            administrativeNotes,
            createdById: user.id,
            metadata: {
              ...(data.metadata || {}),
              everActivated: status === 'ACTIVE',
            },
          })
          .returning();

        return created;
      });

      await recordAuditLog({
        actorId: user.id,
        action: 'ACADEMIC_PERIOD_CREATED',
        entityType: 'ACADEMIC_PERIOD',
        entityId: result.id,
        metadata: {
          code: result.code,
          name: result.name,
          academicYear: result.academicYear,
          status: result.status,
          isDefault: result.isDefault,
        },
        ipAddress: req.ip,
      });

      return sendSuccess(reply, result, null, 201);
    } catch (err: any) {
      console.error('Create academic period failed:', err);
      return sendError(reply, 500, 'CREATE_PERIOD_FAILED', err.message || 'Gagal menyimpan periode akademik.');
    }
  });

  // Superadmin: Update Academic Period
  const updateAcademicPeriodSchema = z.object({
    academic_code: z.string().min(3).max(30).optional(),
    code: z.string().min(3).max(30).optional(),
    name: z.string().min(3).max(150).optional(),
    academic_year: z.string().min(4).max(20).optional(),
    academicYear: z.string().min(4).max(20).optional(),
    semester_type: z.string().optional(),
    semesterType: z.string().optional(),
    description: z.string().optional(),
    preparation_start_date: z.string().nullable().optional(),
    preparationStartDate: z.string().nullable().optional(),
    lecture_start_date: z.string().optional(),
    startDate: z.string().optional(),
    lecture_end_date: z.string().optional(),
    endDate: z.string().optional(),
    is_default: z.boolean().optional(),
    isDefault: z.boolean().optional(),
    status: z.string().optional(),
    administrative_notes: z.string().optional(),
    administrativeNotes: z.string().optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  });

  fastify.patch('/api/v1/admin/academic-periods/:id', async (req, reply) => {
    const user = await authenticateRequest(req, reply, {
      requiredPermissions: ['academic_period.update'],
    });
    if (!user) return;

    const { id } = req.params as { id: string };
    const [period] = await db
      .select()
      .from(academicPeriods)
      .where(eq(academicPeriods.id, id));

    if (!period) {
      return sendError(reply, 404, 'NOT_FOUND', 'Periode akademik tidak ditemukan.');
    }

    // Rule 6: Archived semesters are read-only
    if (period.status.toUpperCase() === 'ARCHIVED') {
      return sendError(
        reply,
        400,
        'PERIOD_ARCHIVED',
        'Periode akademik yang telah diarsipkan bersifat read-only dan tidak dapat diubah.'
      );
    }

    const parsed = updateAcademicPeriodSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(reply, 400, 'VALIDATION_ERROR', 'Format perbaruan tidak valid.', parsed.error.issues);
    }

    const data = parsed.data;
    const updates: any = { updatedAt: new Date() };

    // Code update & uniqueness check
    const newCode = (data.code || data.academic_code)?.trim();
    if (newCode && newCode !== period.code) {
      const [codeCheck] = await db
        .select({ id: academicPeriods.id })
        .from(academicPeriods)
        .where(eq(academicPeriods.code, newCode))
        .limit(1);
      if (codeCheck) {
        return sendError(reply, 409, 'CODE_EXISTS', `Kode periode akademik "${newCode}" sudah digunakan.`);
      }
      updates.code = newCode;
    }

    if (data.name !== undefined) updates.name = data.name.trim();

    const newYear = (data.academicYear || data.academic_year)?.trim();
    if (newYear) updates.academicYear = newYear;

    const rawSemType = (data.semesterType || data.semester_type)?.trim().toUpperCase();
    if (rawSemType) {
      if (!['ODD', 'EVEN', 'SHORT'].includes(rawSemType)) {
        return sendError(reply, 400, 'VALIDATION_ERROR', 'Tipe semester harus ODD, EVEN, atau SHORT.');
      }
      updates.semesterType = rawSemType;
    }

    if (data.description !== undefined) updates.description = data.description;
    if (data.administrativeNotes !== undefined || data.administrative_notes !== undefined) {
      updates.administrativeNotes = data.administrativeNotes ?? data.administrative_notes;
    }

    // Dates validation
    const rawStart = data.startDate || data.lecture_start_date;
    const rawEnd = data.endDate || data.lecture_end_date;
    const targetStartDate = rawStart ? new Date(rawStart) : period.startDate;
    const targetEndDate = rawEnd ? new Date(rawEnd) : period.endDate;

    if (isNaN(targetStartDate.getTime()) || isNaN(targetEndDate.getTime())) {
      return sendError(reply, 400, 'INVALID_DATES', 'Format tanggal perkuliahan tidak valid.');
    }
    if (targetStartDate >= targetEndDate) {
      return sendError(reply, 400, 'INVALID_DATE_RANGE', 'Tanggal mulai perkuliahan harus lebih awal dari tanggal selesai perkuliahan.');
    }
    if (rawStart) updates.startDate = targetStartDate;
    if (rawEnd) updates.endDate = targetEndDate;

    const rawPrep = data.preparationStartDate !== undefined ? data.preparationStartDate : data.preparation_start_date;
    if (rawPrep !== undefined) {
      updates.preparationStartDate = rawPrep ? new Date(rawPrep) : null;
    }

    // Lifecycle Status Transition Validation
    if (data.status) {
      const nextStatus = data.status.trim().toUpperCase();
      const currentStatus = period.status.toUpperCase();
      if (!['DRAFT', 'SCHEDULED', 'ACTIVE', 'COMPLETED', 'ARCHIVED'].includes(nextStatus)) {
        return sendError(reply, 400, 'VALIDATION_ERROR', 'Status tidak valid.');
      }

      if (currentStatus !== nextStatus) {
        const allowedTransitions: Record<string, string[]> = {
          DRAFT: ['SCHEDULED', 'ACTIVE'],
          SCHEDULED: ['DRAFT', 'ACTIVE'],
          ACTIVE: ['COMPLETED'],
          COMPLETED: ['ARCHIVED'],
          ARCHIVED: [],
        };

        if (!allowedTransitions[currentStatus]?.includes(nextStatus)) {
          return sendError(
            reply,
            400,
            'INVALID_STATUS_TRANSITION',
            `Transisi status dari ${currentStatus} ke ${nextStatus} tidak diperbolehkan.`
          );
        }

        updates.status = nextStatus;
        if (nextStatus === 'ACTIVE') {
          updates.metadata = { ...(period.metadata as any || {}), everActivated: true };
        }
      }
    }

    const isDefaultParam = data.isDefault !== undefined ? data.isDefault : data.is_default;

    const result = await db.transaction(async (tx) => {
      if (isDefaultParam === true) {
        await tx.update(academicPeriods).set({ isDefault: false, updatedAt: new Date() });
        updates.isDefault = true;
      } else if (isDefaultParam === false) {
        updates.isDefault = false;
      }

      const [updated] = await tx
        .update(academicPeriods)
        .set(updates)
        .where(eq(academicPeriods.id, id))
        .returning();
      return updated;
    });

    await recordAuditLog({
      actorId: user.id,
      action: 'ACADEMIC_PERIOD_UPDATED',
      entityType: 'ACADEMIC_PERIOD',
      entityId: id,
      metadata: {
        previousValues: {
          code: period.code,
          name: period.name,
          academicYear: period.academicYear,
          status: period.status,
          isDefault: period.isDefault,
        },
        newValues: {
          code: result.code,
          name: result.name,
          academicYear: result.academicYear,
          status: result.status,
          isDefault: result.isDefault,
        },
      },
      ipAddress: req.ip,
    });

    return sendSuccess(reply, result);
  });

  // Superadmin: Delete Academic Period (Strict eligibility checks)
  fastify.delete('/api/v1/admin/academic-periods/:id', async (req, reply) => {
    const user = await authenticateRequest(req, reply, {
      requiredPermissions: ['academic_period.delete'],
    });
    if (!user) return;

    const { id } = req.params as { id: string };
    const [period] = await db
      .select()
      .from(academicPeriods)
      .where(eq(academicPeriods.id, id));

    if (!period) {
      return sendError(reply, 404, 'NOT_FOUND', 'Periode akademik tidak ditemukan.');
    }

    // 1. Dependency check: Classrooms
    const clsList = await db
      .select({ id: classrooms.id })
      .from(classrooms)
      .where(eq(classrooms.academicPeriodId, id));
    if (clsList.length > 0) {
      return sendError(
        reply,
        400,
        'PERIOD_HAS_DEPENDENCIES',
        `Periode akademik tidak dapat dihapus karena memiliki ${clsList.length} ruang kelas aktif/terdaftar.`
      );
    }

    // 2. Dependency check: Course Offerings
    const offeringList = await db
      .select({ id: courseOfferings.id })
      .from(courseOfferings)
      .where(eq(courseOfferings.academicPeriodId, id));
    if (offeringList.length > 0) {
      return sendError(
        reply,
        400,
        'PERIOD_HAS_DEPENDENCIES',
        `Periode akademik tidak dapat dihapus karena memiliki ${offeringList.length} penawaran mata kuliah terkait.`
      );
    }

    // 3. Activation history check: Never activated
    const currentStatus = period.status.toUpperCase();
    const wasActivated =
      ['ACTIVE', 'COMPLETED', 'ARCHIVED'].includes(currentStatus) ||
      (period.metadata as any)?.everActivated === true;

    const [activationLog] = await db
      .select({ id: auditLogs.id })
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.entityType, 'ACADEMIC_PERIOD'),
          eq(auditLogs.entityId, id),
          eq(auditLogs.action, 'ACADEMIC_PERIOD_ACTIVATED')
        )
      )
      .limit(1);

    if (wasActivated || activationLog) {
      return sendError(
        reply,
        400,
        'PERIOD_ALREADY_ACTIVATED',
        'Periode akademik tidak dapat dihapus karena telah pernah diaktifkan dalam siklus perkuliahan Politeknik Kampar.'
      );
    }

    await db.delete(academicPeriods).where(eq(academicPeriods.id, id));

    await recordAuditLog({
      actorId: user.id,
      action: 'ACADEMIC_PERIOD_DELETED',
      entityType: 'ACADEMIC_PERIOD',
      entityId: id,
      metadata: {
        previousValues: {
          code: period.code,
          name: period.name,
          academicYear: period.academicYear,
          status: period.status,
        },
      },
      ipAddress: req.ip,
    });

    return sendSuccess(reply, { deleted: true, id });
  });

  // State Transition Endpoints (Explicitly Authorized Lifecycle Management)
  fastify.post('/api/v1/admin/academic-periods/:id/activate', async (req, reply) => {
    const user = await authenticateRequest(req, reply, {
      requiredPermissions: ['academic_period.activate'],
    });
    if (!user) return;

    const { id } = req.params as { id: string };
    const [period] = await db
      .select()
      .from(academicPeriods)
      .where(eq(academicPeriods.id, id));

    if (!period) {
      return sendError(reply, 404, 'NOT_FOUND', 'Periode akademik tidak ditemukan.');
    }

    const currentStatus = period.status.toUpperCase();
    if (['COMPLETED', 'ARCHIVED'].includes(currentStatus)) {
      return sendError(
        reply,
        400,
        'INVALID_STATUS_TRANSITION',
        `Periode akademik dengan status ${currentStatus} tidak dapat diaktifkan kembali.`
      );
    }

    const [updated] = await db
      .update(academicPeriods)
      .set({
        status: 'ACTIVE',
        metadata: { ...(period.metadata as any || {}), everActivated: true },
        updatedAt: new Date(),
      })
      .where(eq(academicPeriods.id, id))
      .returning();

    await recordAuditLog({
      actorId: user.id,
      action: 'ACADEMIC_PERIOD_ACTIVATED',
      entityType: 'ACADEMIC_PERIOD',
      entityId: id,
      metadata: {
        previousValues: { status: period.status },
        newValues: { status: 'ACTIVE' },
      },
      ipAddress: req.ip,
    });

    return sendSuccess(reply, updated);
  });

  fastify.post('/api/v1/admin/academic-periods/:id/complete', async (req, reply) => {
    const user = await authenticateRequest(req, reply, {
      requiredPermissions: ['academic_period.complete'],
    });
    if (!user) return;

    const { id } = req.params as { id: string };
    const [period] = await db
      .select()
      .from(academicPeriods)
      .where(eq(academicPeriods.id, id));

    if (!period) {
      return sendError(reply, 404, 'NOT_FOUND', 'Periode akademik tidak ditemukan.');
    }

    const currentStatus = period.status.toUpperCase();
    if (currentStatus !== 'ACTIVE') {
      return sendError(
        reply,
        400,
        'INVALID_STATUS_TRANSITION',
        `Hanya periode akademik berstatus ACTIVE yang dapat diselesaikan (status saat ini: ${currentStatus}).`
      );
    }

    const [updated] = await db
      .update(academicPeriods)
      .set({ status: 'COMPLETED', isDefault: false, updatedAt: new Date() })
      .where(eq(academicPeriods.id, id))
      .returning();

    await recordAuditLog({
      actorId: user.id,
      action: 'ACADEMIC_PERIOD_COMPLETED',
      entityType: 'ACADEMIC_PERIOD',
      entityId: id,
      metadata: {
        previousValues: { status: period.status },
        newValues: { status: 'COMPLETED' },
      },
      ipAddress: req.ip,
    });

    return sendSuccess(reply, updated);
  });

  fastify.post('/api/v1/admin/academic-periods/:id/archive', async (req, reply) => {
    const user = await authenticateRequest(req, reply, {
      requiredPermissions: ['academic_period.archive'],
    });
    if (!user) return;

    const { id } = req.params as { id: string };
    const [period] = await db
      .select()
      .from(academicPeriods)
      .where(eq(academicPeriods.id, id));

    if (!period) {
      return sendError(reply, 404, 'NOT_FOUND', 'Periode akademik tidak ditemukan.');
    }

    const currentStatus = period.status.toUpperCase();
    if (currentStatus !== 'COMPLETED') {
      return sendError(
        reply,
        400,
        'INVALID_STATUS_TRANSITION',
        `Hanya periode akademik berstatus COMPLETED yang dapat diarsipkan (status saat ini: ${currentStatus}).`
      );
    }

    const [updated] = await db
      .update(academicPeriods)
      .set({ status: 'ARCHIVED', isDefault: false, updatedAt: new Date() })
      .where(eq(academicPeriods.id, id))
      .returning();

    await recordAuditLog({
      actorId: user.id,
      action: 'ACADEMIC_PERIOD_ARCHIVED',
      entityType: 'ACADEMIC_PERIOD',
      entityId: id,
      metadata: {
        previousValues: { status: period.status },
        newValues: { status: 'ARCHIVED' },
      },
      ipAddress: req.ip,
    });

    return sendSuccess(reply, updated);
  });

  fastify.post('/api/v1/admin/academic-periods/:id/set-default', async (req, reply) => {
    const user = await authenticateRequest(req, reply, {
      requiredPermissions: ['academic_period.set_default'],
    });
    if (!user) return;

    const { id } = req.params as { id: string };
    const [period] = await db
      .select()
      .from(academicPeriods)
      .where(eq(academicPeriods.id, id));

    if (!period) {
      return sendError(reply, 404, 'NOT_FOUND', 'Periode akademik tidak ditemukan.');
    }

    // Archived semesters cannot be made default
    if (period.status.toUpperCase() === 'ARCHIVED') {
      return sendError(
        reply,
        400,
        'ARCHIVED_PERIOD_CANNOT_BE_DEFAULT',
        'Periode akademik yang telah diarsipkan tidak dapat dijadikan sebagai semester default.'
      );
    }

    const result = await db.transaction(async (tx) => {
      // Find current default ID for audit log
      const [currentDefault] = await tx
        .select({ id: academicPeriods.id, code: academicPeriods.code })
        .from(academicPeriods)
        .where(eq(academicPeriods.isDefault, true))
        .limit(1);

      await tx.update(academicPeriods).set({ isDefault: false, updatedAt: new Date() });
      const [updated] = await tx
        .update(academicPeriods)
        .set({ isDefault: true, updatedAt: new Date() })
        .where(eq(academicPeriods.id, id))
        .returning();

      return { updated, previousDefault: currentDefault || null };
    });

    await recordAuditLog({
      actorId: user.id,
      action: 'ACADEMIC_PERIOD_DEFAULT_CHANGED',
      entityType: 'ACADEMIC_PERIOD',
      entityId: id,
      metadata: {
        previousDefaultId: result.previousDefault?.id || null,
        previousDefaultCode: result.previousDefault?.code || null,
        newDefaultId: result.updated.id,
        newDefaultCode: result.updated.code,
      },
      ipAddress: req.ip,
    });

    return sendSuccess(reply, result.updated);
  });

  // Audit and Lifecycle History for Academic Period
  fastify.get('/api/v1/admin/academic-periods/:id/history', async (req, reply) => {
    const user = await authenticateRequest(req, reply, {
      requiredPermissions: ['academic_period.view_history'],
    });
    if (!user) return;

    const { id } = req.params as { id: string };
    const [period] = await db
      .select({ id: academicPeriods.id, name: academicPeriods.name, code: academicPeriods.code })
      .from(academicPeriods)
      .where(eq(academicPeriods.id, id));

    if (!period) {
      return sendError(reply, 404, 'NOT_FOUND', 'Periode akademik tidak ditemukan.');
    }

    const logs = await db
      .select({
        id: auditLogs.id,
        action: auditLogs.action,
        entityType: auditLogs.entityType,
        entityId: auditLogs.entityId,
        metadata: auditLogs.metadata,
        ipAddress: auditLogs.ipAddress,
        createdAt: auditLogs.createdAt,
        actorId: auditLogs.actorId,
        actorName: users.fullName,
        actorEmail: users.email,
      })
      .from(auditLogs)
      .leftJoin(users, eq(auditLogs.actorId, users.id))
      .where(
        and(
          eq(auditLogs.entityType, 'ACADEMIC_PERIOD'),
          eq(auditLogs.entityId, id)
        )
      )
      .orderBy(desc(auditLogs.createdAt));

    return sendSuccess(reply, {
      period,
      history: logs,
    });
  });

  // ============================================================================
  // MODULE B: ACADEMIC CALENDAR
  // ============================================================================

  // List calendar events (Authenticated for students & lecturers)
  const listCalendarEventsHandler = async (req: FastifyRequest, reply: FastifyReply) => {
    const user = await authenticateRequest(req, reply);
    if (!user) return;

    const query = req.query as { periodId?: string };
    let condition = undefined;
    if (query.periodId) {
      condition = eq(academicCalendarEvents.academicPeriodId, query.periodId);
    }

    const events = await db
      .select({
        event: academicCalendarEvents,
        period: academicPeriods,
      })
      .from(academicCalendarEvents)
      .innerJoin(academicPeriods, eq(academicCalendarEvents.academicPeriodId, academicPeriods.id))
      .where(condition)
      .orderBy(asc(academicCalendarEvents.startDate));

    // Filter by visibility if student
    const isStudent = user.roles.some((r) => r.toUpperCase() === 'MAHASISWA');
    const visibleEvents = events
      .filter((row) => {
        if (isStudent && row.event.visibility === 'LECTURER_ONLY') return false;
        return true;
      })
      .map((row) => ({
        ...row.event,
        periodName: row.period.name,
        periodCode: row.period.code,
      }));

    return sendSuccess(reply, visibleEvents);
  };

  fastify.get('/api/v1/academic-calendar', listCalendarEventsHandler);
  fastify.get('/api/v1/admin/academic-calendar', listCalendarEventsHandler);

  // Superadmin: Update Calendar Event
  const updateCalendarEventSchema = z.object({
    title: z.string().min(3).optional(),
    description: z.string().optional(),
    category: z.enum([
      'LECTURE_START',
      'LECTURE_END',
      'KRS_REGISTRATION',
      'UTS',
      'UAS',
      'HOLIDAY',
      'GRADE_SUBMISSION',
      'GRADE_CORRECTION',
      'REMEDIAL',
      'REGISTRATION_DEADLINE',
      'OTHER',
    ]).optional(),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    isHoliday: z.boolean().optional(),
    visibility: z.enum(['ALL', 'LECTURER_ONLY', 'STUDENT_ONLY', 'ADMIN_ONLY']).optional(),
    color: z.string().optional(),
  });

  fastify.patch('/api/v1/admin/academic-calendar/:id', async (req, reply) => {
    const user = await authenticateRequest(req, reply);
    if (!user || !isSuperadmin(user)) return sendError(reply, 403, 'FORBIDDEN', 'Superadmin only');
    const { id } = req.params as { id: string };

    const parsed = updateCalendarEventSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(reply, 400, 'VALIDATION_ERROR', 'Data kalender akademik tidak valid.', parsed.error.issues);
    }

    const updates: any = { updatedAt: new Date() };
    if (parsed.data.title !== undefined) updates.title = parsed.data.title;
    if (parsed.data.description !== undefined) updates.description = parsed.data.description;
    if (parsed.data.category !== undefined) updates.category = parsed.data.category;
    if (parsed.data.startDate !== undefined) updates.startDate = new Date(parsed.data.startDate);
    if (parsed.data.endDate !== undefined) updates.endDate = new Date(parsed.data.endDate);
    if (parsed.data.isHoliday !== undefined) updates.isHoliday = parsed.data.isHoliday;
    if (parsed.data.visibility !== undefined) updates.visibility = parsed.data.visibility;
    if (parsed.data.color !== undefined) updates.color = parsed.data.color;

    const [updated] = await db
      .update(academicCalendarEvents)
      .set(updates)
      .where(eq(academicCalendarEvents.id, id))
      .returning();

    if (!updated) return sendError(reply, 404, 'NOT_FOUND', 'Acara kalender tidak ditemukan.');
    return sendSuccess(reply, updated);
  });

  // Superadmin: Create Calendar Event
  const createCalendarEventSchema = z.object({
    academicPeriodId: z.string().uuid(),
    title: z.string().min(3),
    description: z.string().optional().default(''),
    category: z.enum([
      'LECTURE_START',
      'LECTURE_END',
      'KRS_REGISTRATION',
      'UTS',
      'UAS',
      'HOLIDAY',
      'GRADE_SUBMISSION',
      'GRADE_CORRECTION',
      'REMEDIAL',
      'REGISTRATION_DEADLINE',
      'OTHER',
    ]),
    startDate: z.string(),
    endDate: z.string(),
    isHoliday: z.boolean().default(false),
    visibility: z.enum(['ALL', 'LECTURER_ONLY', 'STUDENT_ONLY', 'ADMIN_ONLY']).default('ALL'),
    color: z.string().default('#2563eb'),
  });

  fastify.post('/api/v1/admin/academic-calendar', async (req, reply) => {
    const user = await authenticateRequest(req, reply);
    if (!user || !isSuperadmin(user)) return sendError(reply, 403, 'FORBIDDEN', 'Superadmin only');

    const parsed = createCalendarEventSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(reply, 400, 'VALIDATION_ERROR', 'Data kalender akademik tidak valid.', parsed.error.issues);
    }

    const [created] = await db
      .insert(academicCalendarEvents)
      .values({
        academicPeriodId: parsed.data.academicPeriodId,
        title: parsed.data.title,
        description: parsed.data.description,
        category: parsed.data.category,
        startDate: new Date(parsed.data.startDate),
        endDate: new Date(parsed.data.endDate),
        isHoliday: parsed.data.isHoliday,
        visibility: parsed.data.visibility,
        color: parsed.data.color,
        createdById: user.id,
      })
      .returning();

    return sendSuccess(reply, created, null, 201);
  });

  fastify.delete('/api/v1/admin/academic-calendar/:id', async (req, reply) => {
    const user = await authenticateRequest(req, reply);
    if (!user || !isSuperadmin(user)) return sendError(reply, 403, 'FORBIDDEN', 'Superadmin only');
    const { id } = req.params as { id: string };

    await db.delete(academicCalendarEvents).where(eq(academicCalendarEvents.id, id));
    return sendSuccess(reply, { deleted: true });
  });

  // ============================================================================
  // MODULE D: SCHEDULE CONFLICT DETECTION & CLASSROOM SCHEDULES
  // ============================================================================

  // Schedule conflict detection endpoint
  const conflictCheckSchema = z.object({
    classroomId: z.string().uuid().optional(),
    scheduleId: z.string().uuid().optional(),
    dayOfWeek: z.number().int().min(1).max(7),
    startTime: z.string().regex(/^\d{2}:\d{2}$/, 'Format waktu harus HH:MM'),
    endTime: z.string().regex(/^\d{2}:\d{2}$/, 'Format waktu harus HH:MM'),
    instructorId: z.string().uuid().optional().nullable(),
    roomId: z.string().uuid().optional().nullable(),
  });

  fastify.post('/api/v1/schedules/conflicts', async (req, reply) => {
    const user = await authenticateRequest(req, reply);
    if (!user) return;

    const parsed = conflictCheckSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(reply, 400, 'VALIDATION_ERROR', 'Input deteksi konflik tidak valid.', parsed.error.issues);
    }

    const result = await detectScheduleConflicts(parsed.data);
    return sendSuccess(reply, result);
  });

  // Classroom schedules
  fastify.get('/api/v1/classrooms/:id/schedules', async (req, reply) => {
    const user = await authenticateRequest(req, reply);
    if (!user) return;
    const { id } = req.params as { id: string };

    const schedules = await db
      .select({
        schedule: classroomSchedules,
        instructor: users,
        room: campusRooms,
        building: campusBuildings,
      })
      .from(classroomSchedules)
      .leftJoin(users, eq(classroomSchedules.instructorId, users.id))
      .leftJoin(campusRooms, eq(classroomSchedules.roomId, campusRooms.id))
      .leftJoin(campusBuildings, eq(classroomSchedules.buildingId, campusBuildings.id))
      .where(eq(classroomSchedules.classroomId, id))
      .orderBy(asc(classroomSchedules.dayOfWeek), asc(classroomSchedules.startTime));

    const enriched = schedules.map((s) => ({
      ...s.schedule,
      instructorName: s.instructor?.fullName || null,
      instructorNidn: s.instructor?.identityNumber || null,
      roomNumber: s.room?.roomNumber || null,
      roomName: s.room?.name || null,
      buildingCode: s.building?.code || null,
      buildingName: s.building?.name || null,
    }));

    return sendSuccess(reply, enriched);
  });

  // Add schedule to classroom
  const createScheduleSchema = z.object({
    dayOfWeek: z.number().int().min(1).max(7),
    startTime: z.string().regex(/^\d{2}:\d{2}$/),
    endTime: z.string().regex(/^\d{2}:\d{2}$/),
    scheduleType: z.enum(['THEORY', 'PRACTICAL', 'TUTORIAL', 'SEMINAR', 'EXAM']).default('THEORY'),
    instructorId: z.string().uuid().optional().nullable(),
    buildingId: z.string().uuid().optional().nullable(),
    roomId: z.string().uuid().optional().nullable(),
    locationDescription: z.string().optional().nullable(),
    meetingType: z.enum(['OFFLINE', 'ONLINE', 'HYBRID']).default('OFFLINE'),
    onlineLink: z.string().optional().nullable(),
    force: z.boolean().default(false), // bypass non-blocking warning
  });

  fastify.post('/api/v1/classrooms/:id/schedules', async (req, reply) => {
    const user = await authenticateRequest(req, reply);
    if (!user || !isLecturerOrAdmin(user)) return sendError(reply, 403, 'FORBIDDEN', 'Dosen or Admin only');
    const { id } = req.params as { id: string };

    const parsed = createScheduleSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(reply, 400, 'VALIDATION_ERROR', 'Format jadwal tidak valid.', parsed.error.issues);
    }

    // Run conflict detection
    const conflictResult = await detectScheduleConflicts({
      classroomId: id,
      dayOfWeek: parsed.data.dayOfWeek,
      startTime: parsed.data.startTime,
      endTime: parsed.data.endTime,
      instructorId: parsed.data.instructorId,
      roomId: parsed.data.roomId,
    });

    if (conflictResult.hasConflict && !parsed.data.force) {
      return sendError(
        reply,
        409,
        'SCHEDULE_CONFLICT',
        'Terdeteksi bentrok jadwal dosen atau ruangan yang sama pada waktu perkuliahan tersebut.',
        conflictResult.conflicts
      );
    }

    const [created] = await db
      .insert(classroomSchedules)
      .values({
        classroomId: id,
        dayOfWeek: parsed.data.dayOfWeek,
        startTime: parsed.data.startTime,
        endTime: parsed.data.endTime,
        scheduleType: parsed.data.scheduleType,
        instructorId: parsed.data.instructorId || user.id,
        buildingId: parsed.data.buildingId || null,
        roomId: parsed.data.roomId || null,
        locationDescription: parsed.data.locationDescription || null,
        meetingType: parsed.data.meetingType,
        onlineLink: parsed.data.onlineLink,
      })
      .returning();

    return sendSuccess(reply, created, null, 201);
  });

  fastify.delete('/api/v1/schedules/:id', async (req, reply) => {
    const user = await authenticateRequest(req, reply);
    if (!user || !isLecturerOrAdmin(user)) return sendError(reply, 403, 'FORBIDDEN', 'Dosen or Admin only');
    const { id } = req.params as { id: string };

    await db.delete(classroomSchedules).where(eq(classroomSchedules.id, id));
    return sendSuccess(reply, { deleted: true });
  });

  // Update schedule
  const updateScheduleSchema = z.object({
    dayOfWeek: z.number().int().min(1).max(7).optional(),
    startTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
    endTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
    scheduleType: z.enum(['THEORY', 'PRACTICAL', 'TUTORIAL', 'SEMINAR', 'EXAM']).optional(),
    buildingId: z.string().uuid().optional().nullable(),
    roomId: z.string().uuid().optional().nullable(),
    meetingType: z.enum(['OFFLINE', 'ONLINE', 'HYBRID']).optional(),
    onlineLink: z.string().optional().nullable(),
    force: z.boolean().default(false),
  });

  fastify.patch('/api/v1/schedules/:id', async (req, reply) => {
    const user = await authenticateRequest(req, reply);
    if (!user || !isLecturerOrAdmin(user)) return sendError(reply, 403, 'FORBIDDEN', 'Dosen or Admin only');
    const { id } = req.params as { id: string };

    const [existing] = await db.select().from(classroomSchedules).where(eq(classroomSchedules.id, id));
    if (!existing) return sendError(reply, 404, 'NOT_FOUND', 'Jadwal perkuliahan tidak ditemukan.');

    const parsed = updateScheduleSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(reply, 400, 'VALIDATION_ERROR', 'Format jadwal tidak valid.', parsed.error.issues);
    }

    const day = parsed.data.dayOfWeek ?? existing.dayOfWeek;
    const start = parsed.data.startTime ?? existing.startTime;
    const end = parsed.data.endTime ?? existing.endTime;
    const room = parsed.data.roomId !== undefined ? parsed.data.roomId : existing.roomId;

    if (!parsed.data.force) {
      const conflict = await detectScheduleConflicts({
        classroomId: existing.classroomId,
        scheduleId: id,
        dayOfWeek: day,
        startTime: start,
        endTime: end,
        instructorId: existing.instructorId,
        roomId: room,
      });
      if (conflict.hasConflict) {
        return sendError(reply, 409, 'SCHEDULE_CONFLICT', 'Bentrok jadwal perkuliahan terdeteksi.', conflict.conflicts);
      }
    }

    const updates: any = { updatedAt: new Date() };
    if (parsed.data.dayOfWeek !== undefined) updates.dayOfWeek = parsed.data.dayOfWeek;
    if (parsed.data.startTime !== undefined) updates.startTime = parsed.data.startTime;
    if (parsed.data.endTime !== undefined) updates.endTime = parsed.data.endTime;
    if (parsed.data.scheduleType !== undefined) updates.scheduleType = parsed.data.scheduleType;
    if (parsed.data.buildingId !== undefined) updates.buildingId = parsed.data.buildingId;
    if (parsed.data.roomId !== undefined) updates.roomId = parsed.data.roomId;
    if (parsed.data.meetingType !== undefined) updates.meetingType = parsed.data.meetingType;
    if (parsed.data.onlineLink !== undefined) updates.onlineLink = parsed.data.onlineLink;

    const [updated] = await db
      .update(classroomSchedules)
      .set(updates)
      .where(eq(classroomSchedules.id, id))
      .returning();

    return sendSuccess(reply, updated);
  });

  // GET schedule conflicts via query params
  fastify.get('/api/v1/schedules/conflicts', async (req, reply) => {
    const user = await authenticateRequest(req, reply);
    if (!user) return;

    const query = req.query as any;
    const dayOfWeek = Number(query.dayOfWeek) || 1;
    const startTime = query.startTime || '08:00';
    const endTime = query.endTime || '10:00';

    const result = await detectScheduleConflicts({
      classroomId: query.classroomId,
      scheduleId: query.scheduleId,
      dayOfWeek,
      startTime,
      endTime,
      instructorId: query.instructorId || null,
      roomId: query.roomId || null,
    });

    return sendSuccess(reply, result);
  });

  // ============================================================================
  // MODULE E: ADVANCED CLASSROOM BUILDER (6-STEP WIZARD) & LIFECYCLE
  // ============================================================================

  const advancedClassroomBuilderSchema = z.object({
    // Step 1 & 2: Classroom Identity & Academic Context
    courseId: z.string().uuid().optional().nullable(),
    courseOfferingId: z.string().uuid().optional().nullable(),
    academicPeriodId: z.string().uuid().optional().nullable(),
    name: z.string().min(3),
    classroomCode: z.string().min(2).optional(),
    subjectName: z.string().optional().nullable(),
    subjectCode: z.string().optional().nullable(),
    academicYear: z.string().optional().nullable(),
    semesterName: z.string().optional().nullable(),
    locationDescription: z.string().optional().nullable(),
    cohort: z.string().optional().default('2026'),
    section: z.string().min(1).default('A'),
    classroomType: z.enum(['REGULAR', 'PRACTICAL', 'HYBRID', 'SHORT_SEMESTER', 'REMEDIAL']).default('REGULAR'),
    minCapacity: z.number().int().min(1).default(10),
    maxCapacity: z.number().int().min(1).max(250).default(35),
    category: z.string().default('REGULAR'),
    language: z.string().default('id'),
    visibility: z
      .enum(['PUBLIC', 'PRIVATE', 'PUBLIC_ENROLLED', 'CAMPUS_WIDE', 'PRIVATE_RESTRICTED'])
      .default('PRIVATE'),
    learningObjectives: z.string().optional().default(''),
    cpmk: z.string().optional().default(''),
    coverImagePath: z.string().optional().nullable(),
    coverThumbnailPath: z.string().optional().nullable(),
    coverMimeType: z.string().optional().nullable(),
    coverFileSize: z.number().int().optional().nullable(),
    coverWidth: z.number().int().optional().nullable(),
    coverHeight: z.number().int().optional().nullable(),
    description: z.string().optional().default(''),
    roomNumber: z.string().optional().default('Daring / Fleksibel'),
    scheduleText: z.string().optional().default('Sesuai Jadwal'),

    // Step 3: Teaching Team (supports both explicit primaryInstructorId/coInstructorIds and instructors array)
    primaryInstructorId: z.string().uuid().optional().nullable(),
    coInstructorIds: z.array(z.string().uuid()).optional().default([]),
    instructors: z.array(
      z.object({
        instructorId: z.string().uuid(),
        role: z.enum(['PRIMARY_INSTRUCTOR', 'CO_INSTRUCTOR', 'TEACHING_ASSISTANT', 'GUEST_INSTRUCTOR']).default('PRIMARY_INSTRUCTOR'),
        permissionScopes: z.array(z.string()).default(['all']),
      })
    ).optional().default([]),

    // Step 4: Schedules
    schedules: z.array(
      z.object({
        dayOfWeek: z.number().int().min(1).max(7),
        startTime: z.string().regex(/^\d{2}:\d{2}$/),
        endTime: z.string().regex(/^\d{2}:\d{2}$/),
        scheduleType: z.enum(['THEORY', 'PRACTICAL', 'TUTORIAL', 'SEMINAR', 'EXAM']).default('THEORY'),
        buildingId: z.string().uuid().optional().nullable(),
        roomId: z.string().uuid().optional().nullable(),
        locationDescription: z.string().optional().nullable(),
        meetingType: z.enum(['OFFLINE', 'ONLINE', 'HYBRID']).default('OFFLINE'),
        onlineLink: z.string().optional().nullable(),
      })
    ).optional().default([]),

    // Step 5: Enrollment Rules & Policies
    policy: z.object({
      enrollmentMode: z.enum(['AUTO', 'APPROVAL_REQUIRED', 'INVITATION_ONLY', 'JOIN_CODE', 'ADMIN_ASSIGNMENT', 'RESTRICTED']).default('AUTO'),
      minParticipants: z.number().int().min(1).default(10),
      maxParticipants: z.number().int().min(1).default(35),
      allowedStudyPrograms: z.array(z.string()).default([]),
      allowedCohorts: z.array(z.string()).default([]),
      allowLateEnrollment: z.boolean().default(false),
      waitingListEnabled: z.boolean().default(true),
      maxWaitingList: z.number().int().default(15),
      joinCodeMaxUses: z.number().int().default(50),
    }).optional(),

    // Step 6: Publication state
    lifecycleStatus: z.enum(['draft', 'pending_approval', 'scheduled', 'published', 'active']).default('active'),
    submitForApproval: z.boolean().default(false),
  });

  // Upload & Optimize Classroom Cover Image
  fastify.post('/api/v1/classrooms/cover-image', async (req, reply) => {
    const user = await authenticateRequest(req, reply, { requireCsrf: false });
    if (!user || !isLecturerOrAdmin(user)) {
      return sendError(reply, 403, 'FORBIDDEN', 'Hanya Dosen atau Admin yang berwenang mengunggah cover ruang kelas.');
    }

    try {
      let buffer: Buffer | null = null;

      // 1. Check if multipart
      if (req.isMultipart && req.isMultipart()) {
        const file = await req.file();
        if (file) {
          buffer = await file.toBuffer();
        }
      }

      // 2. Fallback JSON base64 body if not multipart
      if (!buffer && req.body) {
        const body = req.body as { imageBase64?: string };
        if (body?.imageBase64) {
          const raw = body.imageBase64.replace(/^data:image\/[a-z]+;base64,/, '');
          buffer = Buffer.from(raw, 'base64');
        }
      }

      if (!buffer || buffer.length === 0) {
        return sendError(reply, 400, 'VALIDATION_ERROR', 'Berkas gambar wajib diunggah.');
      }

      const optimized = await processAndOptimizeCoverImage(buffer);
      return sendSuccess(reply, optimized);
    } catch (err: any) {
      return sendError(
        reply,
        400,
        'IMAGE_OPTIMIZATION_FAILED',
        err.message || 'Gagal memproses dan mengoptimasi gambar sampul kelas.'
      );
    }
  });

  // Serve Optimized Cover Image from Private Storage
  fastify.get('/api/v1/storage/covers/:filename', async (req, reply) => {
    const { filename } = req.params as { filename: string };
    if (!/^[a-zA-Z0-9_-]+\.webp$/.test(filename)) {
      return sendError(reply, 400, 'INVALID_PATH', 'Nama berkas cover tidak valid.');
    }

    const fs = await import('fs');
    try {
      const fullPath = resolvePrivateObjectPath(`covers/${filename}`);
      if (!fs.existsSync(fullPath)) {
        return sendError(reply, 404, 'NOT_FOUND', 'Gambar sampul tidak ditemukan.');
      }

      const fileBuffer = fs.readFileSync(fullPath);
      reply.header('Content-Type', 'image/webp');
      reply.header('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
      return reply.send(fileBuffer);
    } catch {
      return sendError(reply, 404, 'NOT_FOUND', 'Gambar sampul tidak ditemukan.');
    }
  });

  // Remove Classroom Cover Image
  fastify.delete('/api/v1/classrooms/:id/cover-image', async (req, reply) => {
    const user = await authenticateRequest(req, reply, { requireCsrf: false });
    if (!user || !isLecturerOrAdmin(user)) {
      return sendError(reply, 403, 'FORBIDDEN', 'Hanya Dosen atau Admin yang dapat menghapus cover kelas.');
    }
    const { id } = req.params as { id: string };

    const [cls] = await db.select().from(classrooms).where(eq(classrooms.id, id));
    if (!cls) return sendError(reply, 404, 'NOT_FOUND', 'Ruang kelas tidak ditemukan.');

    if (cls.coverImagePath || cls.coverThumbnailPath) {
      removeCoverImageFiles(cls.coverImagePath, cls.coverThumbnailPath);
      await db
        .update(classrooms)
        .set({
          coverImagePath: null,
          coverThumbnailPath: null,
          coverMimeType: null,
          coverFileSize: null,
          coverWidth: null,
          coverHeight: null,
          coverUpdatedAt: new Date(),
        })
        .where(eq(classrooms.id, id));
    }

    return sendSuccess(reply, { success: true, message: 'Gambar sampul kelas berhasil dihapus.' });
  });

  // Advanced Classroom Creation Wizard API
  // Eligible Lecturers Selector for Classroom Creation Wizard & Team Assignment
  fastify.get('/api/v1/classrooms/eligible-instructors', async (req, reply) => {
    const user = await authenticateRequest(req, reply, {
      anyPermissions: ['classrooms:create', 'classrooms:manage_all', 'classrooms:teach'],
    });
    if (!user) return;

    const query = req.query as {
      search?: string;
      studyProgram?: string;
      status?: string;
      page?: string;
      limit?: string;
    };

    const search = (query.search || '').trim().toLowerCase();
    const studyProgramFilter = (query.studyProgram || '').trim();
    const statusFilter = (query.status || 'ACTIVE').trim().toUpperCase();
    const page = Math.max(1, parseInt(query.page || '1', 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(query.limit || '50', 10) || 50));

    const [dosenRole] = await db
      .select()
      .from(roles)
      .where(eq(roles.code, 'DOSEN'))
      .limit(1);

    if (!dosenRole) {
      return sendSuccess(reply, [], { page: 1, limit, total: 0, totalPages: 1, studyPrograms: [] });
    }

    const lecturerRows = await db
      .select({
        id: users.id,
        fullName: users.fullName,
        email: users.email,
        identityNumber: users.identityNumber,
        isActive: users.isActive,
        accountStatus: users.accountStatus,
        studyProgram: userProfiles.studyProgram,
        organizationalUnit: userProfiles.organizationalUnit,
        nidn: userProfiles.nidn,
        nip: userProfiles.nip,
        academicTitle: userProfiles.academicTitle,
        avatarUrl: userProfiles.avatarUrl,
      })
      .from(userRoles)
      .innerJoin(users, eq(userRoles.userId, users.id))
      .leftJoin(userProfiles, eq(users.id, userProfiles.userId))
      .where(eq(userRoles.roleId, dosenRole.id))
      .orderBy(asc(users.fullName));

    const studyProgramsSet = new Set<string>();
    for (const r of lecturerRows) {
      if (r.studyProgram) studyProgramsSet.add(r.studyProgram);
    }

    const filtered = lecturerRows.filter((r) => {
      const effectiveActive = r.isActive && r.accountStatus === 'ACTIVE';
      if (statusFilter === 'ACTIVE' && !effectiveActive) return false;
      if (statusFilter === 'INACTIVE' && effectiveActive) return false;
      if (studyProgramFilter && (r.studyProgram || '') !== studyProgramFilter) return false;
      if (search) {
        const hay = [
          r.fullName,
          r.email,
          r.identityNumber,
          r.nidn,
          r.nip,
          r.studyProgram,
          r.academicTitle,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!hay.includes(search)) return false;
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
      studyPrograms: Array.from(studyProgramsSet).sort(),
    });
  });

  fastify.post('/api/v1/classrooms/builder', async (req, reply) => {
    const user = await authenticateRequest(req, reply, {
      anyPermissions: ['classrooms:create', 'classrooms:manage_all'],
    });
    if (!user || !isLecturerOrAdmin(user)) {
      return sendError(reply, 403, 'FORBIDDEN', 'Hanya Dosen atau Admin yang berwenang membuat ruang kelas baru.');
    }

    const parsed = advancedClassroomBuilderSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(reply, 400, 'VALIDATION_ERROR', 'Konfigurasi wizard ruang kelas tidak valid.', parsed.error.issues);
    }

    const data = parsed.data;
    const isAdminActor = isSuperadmin(user);

    // Resolve Primary Instructor & Co-Instructors based on role
    const explicitPrimaryFromArray = data.instructors.find((i) => i.role === 'PRIMARY_INSTRUCTOR')?.instructorId;
    const requestedPrimaryId = data.primaryInstructorId || explicitPrimaryFromArray || null;

    let primaryInstructorId: string;
    if (isAdminActor) {
      if (!requestedPrimaryId) {
        return sendError(
          reply,
          400,
          'PRIMARY_INSTRUCTOR_REQUIRED',
          'Dosen pengampu utama (Primary Instructor) wajib dipilih saat membuat kelas atas nama dosen.'
        );
      }
      primaryInstructorId = requestedPrimaryId;
    } else {
      // Lecturer Self-Service: reject API manipulation attempting to assign another user as primary instructor
      if (requestedPrimaryId && requestedPrimaryId !== user.id) {
        return sendError(
          reply,
          403,
          'FORBIDDEN_PRIMARY_ASSIGNMENT',
          'Dosen tidak berwenang menetapkan pengguna lain sebagai dosen pengampu utama saat membuat kelas.'
        );
      }
      primaryInstructorId = user.id;
    }

    // Collect co-instructors from coInstructorIds + instructors array (excluding PRIMARY_INSTRUCTOR role)
    const coInstructorMap = new Map<
      string,
      { instructorId: string; role: 'CO_INSTRUCTOR' | 'TEACHING_ASSISTANT' | 'GUEST_INSTRUCTOR'; permissionScopes: string[] }
    >();

    for (const coId of data.coInstructorIds || []) {
      if (coId === primaryInstructorId) {
        return sendError(
          reply,
          400,
          'DUPLICATE_PRIMARY_INSTRUCTOR',
          'Dosen pengampu utama tidak boleh dipilih kembali sebagai co-instructor.'
        );
      }
      coInstructorMap.set(coId, {
        instructorId: coId,
        role: 'CO_INSTRUCTOR',
        permissionScopes: ['grading', 'materials', 'announcements'],
      });
    }

    for (const inst of data.instructors) {
      if (inst.role === 'PRIMARY_INSTRUCTOR') {
        if (inst.instructorId !== primaryInstructorId) {
          return sendError(
            reply,
            400,
            'MULTIPLE_PRIMARY_INSTRUCTORS',
            'Hanya satu dosen pengampu utama (Primary Instructor) yang diperbolehkan.'
          );
        }
        continue;
      }
      if (inst.instructorId === primaryInstructorId) {
        return sendError(
          reply,
          400,
          'DUPLICATE_PRIMARY_INSTRUCTOR',
          'Dosen pengampu utama tidak boleh dipilih kembali sebagai co-instructor.'
        );
      }
      if (coInstructorMap.has(inst.instructorId)) {
        return sendError(
          reply,
          400,
          'DUPLICATE_CO_INSTRUCTOR',
          'Terdapat duplikasi dosen pendamping dalam tim pengajar.'
        );
      }
      coInstructorMap.set(inst.instructorId, {
        instructorId: inst.instructorId,
        role: inst.role,
        permissionScopes: inst.permissionScopes,
      });
    }

    // Validate Primary Instructor & all Co-Instructors are active users with DOSEN role
    const [dosenRole] = await db
      .select()
      .from(roles)
      .where(eq(roles.code, 'DOSEN'))
      .limit(1);

    const allTeamIds = [primaryInstructorId, ...Array.from(coInstructorMap.keys())];
    const teamUsers = await db
      .select({
        id: users.id,
        fullName: users.fullName,
        isActive: users.isActive,
        accountStatus: users.accountStatus,
      })
      .from(users)
      .where(inArray(users.id, allTeamIds));

    const teamRoleRows = dosenRole
      ? await db
          .select({ userId: userRoles.userId })
          .from(userRoles)
          .where(
            and(
              eq(userRoles.roleId, dosenRole.id),
              inArray(userRoles.userId, allTeamIds)
            )
          )
      : [];
    const dosenUserIdSet = new Set(teamRoleRows.map((r) => r.userId));
    const teamUserMap = new Map(teamUsers.map((u) => [u.id, u]));

    const primaryUser = teamUserMap.get(primaryInstructorId);
    if (
      !primaryUser ||
      !primaryUser.isActive ||
      primaryUser.accountStatus !== 'ACTIVE' ||
      !dosenUserIdSet.has(primaryInstructorId)
    ) {
      return sendError(
        reply,
        400,
        'INVALID_PRIMARY_INSTRUCTOR',
        'Dosen pengampu utama tidak ditemukan, tidak aktif, atau tidak memiliki role DOSEN.'
      );
    }

    for (const coId of coInstructorMap.keys()) {
      const coUser = teamUserMap.get(coId);
      if (
        !coUser ||
        !coUser.isActive ||
        coUser.accountStatus !== 'ACTIVE' ||
        !dosenUserIdSet.has(coId)
      ) {
        return sendError(
          reply,
          400,
          'INVALID_CO_INSTRUCTOR',
          'Salah satu dosen pendamping tidak ditemukan, tidak aktif, atau tidak memiliki role DOSEN.'
        );
      }
    }

    // Resolve academic period (default period if not provided)
    let resolvedPeriodId = data.academicPeriodId;
    if (!resolvedPeriodId) {
      const [defaultPeriod] = await db
        .select()
        .from(academicPeriods)
        .where(eq(academicPeriods.isDefault, true))
        .limit(1);
      resolvedPeriodId = defaultPeriod?.id;
    }

    // Resolve semesterId for backward-compatibility
    const [latestSemester] = await db.select().from(semesters).limit(1);
    const semesterId = latestSemester?.id || null;

    // Verify academic period validity
    if (resolvedPeriodId) {
      const [period] = await db.select().from(academicPeriods).where(eq(academicPeriods.id, resolvedPeriodId));
      if (!period) {
        return sendError(reply, 404, 'PERIOD_NOT_FOUND', 'Periode akademik tidak ditemukan.');
      }
      if (['COMPLETED', 'ARCHIVED'].includes(period.status.toUpperCase())) {
        return sendError(
          reply,
          400,
          'PERIOD_INACTIVE',
          `Tidak dapat membuka kelas baru pada periode akademik ${period.name} karena status telah ${period.status.toUpperCase()}.`
        );
      }
    }

    // Check schedules for conflicts against the actual primaryInstructorId
    for (const sched of data.schedules) {
      const conflict = await detectScheduleConflicts({
        dayOfWeek: sched.dayOfWeek,
        startTime: sched.startTime,
        endTime: sched.endTime,
        instructorId: primaryInstructorId,
        roomId: sched.roomId || null,
      });
      if (conflict.hasConflict) {
        return sendError(
          reply,
          409,
          'SCHEDULE_CONFLICT',
          'Terdapat konflik jadwal pada rancangan jadwal kelas ini.',
          conflict.conflicts
        );
      }
    }

    const randomJoinCode = `PKM-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;

    try {
      const result = await db.transaction(async (tx) => {
        // Determine status
        let initialLifecycle = data.lifecycleStatus;
        let initialApproval = 'APPROVED';
        if (data.submitForApproval) {
          initialLifecycle = 'pending_approval';
          initialApproval = 'PENDING';
        }

        const effectiveLocation = data.locationDescription || data.roomNumber || 'Daring / Fleksibel';

        // 1. Create Classroom (createdById = administrative/self creator)
        const [createdClass] = await tx
          .insert(classrooms)
          .values({
            courseId: data.courseId || null,
            courseOfferingId: data.courseOfferingId || null,
            academicPeriodId: resolvedPeriodId,
            semesterId,
            name: data.name,
            classroomCode: data.classroomCode || randomJoinCode,
            subjectName: data.subjectName || null,
            subjectCode: data.subjectCode || null,
            academicYear: data.academicYear || null,
            semesterName: data.semesterName || null,
            locationDescription: effectiveLocation,
            cohort: data.cohort,
            section: data.section,
            roomNumber: effectiveLocation,
            scheduleText: data.scheduleText,
            classroomType: data.classroomType,
            minCapacity: data.minCapacity,
            maxCapacity: data.maxCapacity,
            capacity: data.maxCapacity,
            category: data.category,
            language: data.language,
            visibility: data.visibility,
            learningObjectives: data.learningObjectives || data.cpmk || null,
            cpmk: data.cpmk || data.learningObjectives || null,
            coverImagePath: data.coverImagePath || null,
            coverThumbnailPath: data.coverThumbnailPath || null,
            coverMimeType: data.coverMimeType || (data.coverImagePath ? 'image/webp' : null),
            coverFileSize: data.coverFileSize || null,
            coverWidth: data.coverWidth || null,
            coverHeight: data.coverHeight || null,
            coverUpdatedAt: data.coverImagePath ? new Date() : null,
            description: data.description,
            lifecycleStatus: initialLifecycle,
            approvalStatus: initialApproval,
            publishedAt: initialLifecycle === 'active' ? new Date() : null,
            createdById: user.id,
          })
          .returning();

        // 2. Create Teaching Team (Never auto-add Superadmin as instructor!)
        const instructorsToInsert = [
          {
            classroomId: createdClass.id,
            instructorId: primaryInstructorId,
            role: 'PRIMARY_INSTRUCTOR',
            isPrimary: true,
            permissionScopes: ['all'],
          },
          ...Array.from(coInstructorMap.values()).map((co) => ({
            classroomId: createdClass.id,
            instructorId: co.instructorId,
            role: co.role,
            isPrimary: false,
            permissionScopes: co.permissionScopes,
          })),
        ];

        await tx.insert(classroomInstructors).values(instructorsToInsert);

        // 3. Create Schedules (bound to primaryInstructorId)
        if (data.schedules.length > 0) {
          const scheduleValues = data.schedules.map((s) => ({
            classroomId: createdClass.id,
            dayOfWeek: s.dayOfWeek,
            startTime: s.startTime,
            endTime: s.endTime,
            scheduleType: s.scheduleType,
            instructorId: primaryInstructorId,
            buildingId: s.buildingId || null,
            roomId: s.roomId || null,
            locationDescription: s.locationDescription || null,
            meetingType: s.meetingType,
            onlineLink: s.onlineLink,
          }));
          await tx.insert(classroomSchedules).values(scheduleValues);
        }

        // 4. Create Enrollment Policy
        const policyConfig = data.policy || {
          enrollmentMode: 'AUTO' as const,
          minParticipants: data.minCapacity,
          maxParticipants: data.maxCapacity,
          allowedStudyPrograms: [],
          allowedCohorts: [],
          allowLateEnrollment: false,
          waitingListEnabled: true,
          maxWaitingList: 15,
          joinCodeMaxUses: 50,
        };

        await tx.insert(classroomEnrollmentPolicies).values({
          classroomId: createdClass.id,
          enrollmentMode: policyConfig.enrollmentMode,
          minParticipants: policyConfig.minParticipants,
          maxParticipants: policyConfig.maxParticipants,
          allowedStudyPrograms: policyConfig.allowedStudyPrograms,
          allowedCohorts: policyConfig.allowedCohorts,
          allowLateEnrollment: policyConfig.allowLateEnrollment,
          waitingListEnabled: policyConfig.waitingListEnabled,
          maxWaitingList: policyConfig.maxWaitingList,
          joinCodeMaxUses: policyConfig.joinCodeMaxUses,
        });

        // 5. Generate Join Code
        const [joinCode] = await tx
          .insert(classroomJoinCodes)
          .values({
            classroomId: createdClass.id,
            code: randomJoinCode,
            isActive: true,
            maxUses: policyConfig.joinCodeMaxUses || 50,
            createdById: user.id,
          })
          .returning();

        // 6. Record Approval if requested
        if (data.submitForApproval) {
          await tx.insert(classroomApprovals).values({
            classroomId: createdClass.id,
            requestedById: user.id,
            status: 'PENDING',
          });
        }

        return {
          ...createdClass,
          joinCode: joinCode.code,
          primaryInstructorId,
          academicOwnerId: primaryInstructorId,
          coInstructorIds: Array.from(coInstructorMap.keys()),
          delegated: isAdminActor && primaryInstructorId !== user.id,
        };
      });

      const coIds = Array.from(coInstructorMap.keys());
      const actorRole = isAdminActor ? 'SUPERADMIN' : 'DOSEN';
      const isDelegated = isAdminActor && primaryInstructorId !== user.id;

      await recordAuditLog({
        actorId: user.id,
        action: isDelegated ? 'CLASSROOM_CREATED_ON_BEHALF' : 'CLASSROOM_CREATED',
        entityType: 'CLASSROOM',
        entityId: result.id,
        metadata: {
          actorRole,
          classroomId: result.id,
          name: result.name,
          code: result.classroomCode,
          delegated: isDelegated,
          primaryInstructorId,
          academicOwnerId: primaryInstructorId,
          coInstructorIds: coIds,
        },
        ipAddress: req.ip,
      });

      await recordAuditLog({
        actorId: user.id,
        action: 'PRIMARY_INSTRUCTOR_ASSIGNED',
        entityType: 'CLASSROOM_INSTRUCTOR',
        entityId: result.id,
        metadata: {
          actorRole,
          classroomId: result.id,
          primaryInstructorId,
          primaryInstructorName: primaryUser.fullName,
        },
        ipAddress: req.ip,
      });

      if (coIds.length > 0) {
        await recordAuditLog({
          actorId: user.id,
          action: 'CO_INSTRUCTOR_ASSIGNED',
          entityType: 'CLASSROOM_INSTRUCTOR',
          entityId: result.id,
          metadata: {
            actorRole,
            classroomId: result.id,
            coInstructorIds: coIds,
          },
          ipAddress: req.ip,
        });
      }

      if (result.lifecycleStatus === 'active') {
        await recordAuditLog({
          actorId: user.id,
          action: 'CLASSROOM_PUBLISHED',
          entityType: 'CLASSROOM',
          entityId: result.id,
          metadata: {
            actorRole,
            classroomId: result.id,
            primaryInstructorId,
          },
          ipAddress: req.ip,
        });
      }

      return sendSuccess(reply, result, null, 201);
    } catch (err: any) {
      console.error('Advanced classroom builder error:', err);
      return sendError(reply, 500, 'SERVER_ERROR', 'Gagal memproses pembuatan ruang kelas.');
    }
  });

  // Lifecycle transitions: Publish, Submit Approval, Complete, Archive
  fastify.post('/api/v1/classrooms/:id/publish', async (req, reply) => {
    const user = await authenticateRequest(req, reply);
    if (!user || !isLecturerOrAdmin(user)) return sendError(reply, 403, 'FORBIDDEN', 'Dosen or Admin only');
    const { id } = req.params as { id: string };

    const [updated] = await db
      .update(classrooms)
      .set({
        lifecycleStatus: 'active',
        publishedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(classrooms.id, id))
      .returning();

    return sendSuccess(reply, updated);
  });

  fastify.post('/api/v1/classrooms/:id/submit-approval', async (req, reply) => {
    const user = await authenticateRequest(req, reply);
    if (!user || !isLecturerOrAdmin(user)) return sendError(reply, 403, 'FORBIDDEN', 'Dosen or Admin only');
    const { id } = req.params as { id: string };

    const [cls] = await db.select().from(classrooms).where(eq(classrooms.id, id));
    if (!cls) return sendError(reply, 404, 'NOT_FOUND', 'Kelas tidak ditemukan.');

    await db.transaction(async (tx) => {
      await tx
        .update(classrooms)
        .set({
          lifecycleStatus: 'pending_approval',
          approvalStatus: 'PENDING',
          updatedAt: new Date(),
        })
        .where(eq(classrooms.id, id));

      await tx.insert(classroomApprovals).values({
        classroomId: id,
        requestedById: user.id,
        status: 'PENDING',
      });
    });

    return sendSuccess(reply, { status: 'pending_approval' });
  });

  fastify.post('/api/v1/classrooms/:id/approve', async (req, reply) => {
    const user = await authenticateRequest(req, reply);
    if (!user || !isSuperadmin(user)) return sendError(reply, 403, 'FORBIDDEN', 'Superadmin only');
    const { id } = req.params as { id: string };

    await db.transaction(async (tx) => {
      await tx
        .update(classrooms)
        .set({
          lifecycleStatus: 'active',
          approvalStatus: 'APPROVED',
          publishedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(classrooms.id, id));

      await tx
        .update(classroomApprovals)
        .set({
          status: 'APPROVED',
          reviewerId: user.id,
          reviewedAt: new Date(),
        })
        .where(eq(classroomApprovals.classroomId, id));
    });

    return sendSuccess(reply, { status: 'active', approvalStatus: 'APPROVED' });
  });

  fastify.post('/api/v1/classrooms/:id/complete', async (req, reply) => {
    const user = await authenticateRequest(req, reply);
    if (!user || !isLecturerOrAdmin(user)) return sendError(reply, 403, 'FORBIDDEN', 'Dosen or Admin only');
    const { id } = req.params as { id: string };

    const [updated] = await db
      .update(classrooms)
      .set({
        lifecycleStatus: 'completed',
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(classrooms.id, id))
      .returning();

    return sendSuccess(reply, updated);
  });

  fastify.post('/api/v1/classrooms/:id/archive', async (req, reply) => {
    const user = await authenticateRequest(req, reply);
    if (!user) return;
    const { id } = req.params as { id: string };

    const roleInfo = await resolveClassroomRole(user, id);
    const canArchive =
      roleInfo.role === 'SUPERADMIN' ||
      roleInfo.isCreator ||
      roleInfo.canManageAll;
    if (!canArchive) {
      return sendError(
        reply,
        403,
        'FORBIDDEN',
        'Hanya pembuat kelas atau administrator yang dapat mengarsipkan ruang kelas.'
      );
    }

    const [existing] = await db.select().from(classrooms).where(eq(classrooms.id, id));
    if (!existing) {
      return sendError(reply, 404, 'CLASSROOM_NOT_FOUND', 'Ruang kelas tidak ditemukan.');
    }

    const [updated] = await db
      .update(classrooms)
      .set({
        lifecycleStatus: 'archived',
        status: 'ARCHIVED',
        archivedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(classrooms.id, id))
      .returning();

    await recordClassroomAudit({
      classroomId: id,
      actorId: user.id,
      actorRole: roleInfo.role,
      resourceType: 'CLASSROOM',
      resourceId: id,
      resourceTitle: existing.name,
      action: 'ARCHIVED',
      changeSummary: `Mengarsipkan ruang kelas "${existing.name}"`,
      beforeValue: { lifecycleStatus: existing.lifecycleStatus, status: existing.status },
      afterValue: { lifecycleStatus: 'archived', status: 'ARCHIVED' },
    });

    return sendSuccess(reply, updated);
  });

  // ============================================================================
  // MODULE F: ENROLLMENT & PARTICIPANT MANAGEMENT
  // ============================================================================

  // Join via Join Code with concurrency lock & max usage
  fastify.post('/api/v1/classrooms/:id/join', async (req, reply) => {
    const user = await authenticateRequest(req, reply);
    if (!user) return;
    const { id } = req.params as { id: string };

    const bodySchema = z.object({ code: z.string().min(4) });
    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(reply, 400, 'VALIDATION_ERROR', 'Kode gabung kelas wajib diisi.');
    }

    const { code } = parsed.data;

    try {
      const outcome = await db.transaction(async (tx) => {
        // Check code
        const [joinCode] = await tx
          .select()
          .from(classroomJoinCodes)
          .where(
            and(
              eq(classroomJoinCodes.classroomId, id),
              eq(classroomJoinCodes.code, code.toUpperCase()),
              eq(classroomJoinCodes.isActive, true)
            )
          );

        if (!joinCode) {
          throw new Error('INVALID_JOIN_CODE');
        }

        if (joinCode.expiresAt && joinCode.expiresAt < new Date()) {
          throw new Error('JOIN_CODE_EXPIRED');
        }

        if (joinCode.usesCount >= joinCode.maxUses) {
          throw new Error('JOIN_CODE_MAX_REACHED');
        }

        // Check classroom capacity & waiting list policy
        const [cls] = await tx
          .select({
            cls: classrooms,
            policy: classroomEnrollmentPolicies,
          })
          .from(classrooms)
          .leftJoin(classroomEnrollmentPolicies, eq(classrooms.id, classroomEnrollmentPolicies.classroomId))
          .where(eq(classrooms.id, id));

        const maxCapacity = cls?.policy?.maxParticipants || cls?.cls?.maxCapacity || 35;
        const activeRows = await tx
          .select({ id: classroomEnrollments.id })
          .from(classroomEnrollments)
          .where(
            and(
              eq(classroomEnrollments.classroomId, id),
              eq(classroomEnrollments.status, 'active')
            )
          );

        if (activeRows.length >= maxCapacity) {
          if (cls?.policy?.waitingListEnabled ?? true) {
            const waitlistRows = await tx
              .select({ id: classroomWaitlists.id })
              .from(classroomWaitlists)
              .where(
                and(
                  eq(classroomWaitlists.classroomId, id),
                  eq(classroomWaitlists.status, 'WAITING')
                )
              );

            const queueNum = waitlistRows.length + 1;
            await tx
              .insert(classroomWaitlists)
              .values({
                classroomId: id,
                studentId: user.id,
                queueNumber: queueNum,
                status: 'WAITING',
              })
              .onConflictDoUpdate({
                target: [classroomWaitlists.classroomId, classroomWaitlists.studentId],
                set: { status: 'WAITING', queueNumber: queueNum, updatedAt: new Date() },
              });

            return {
              enrolled: false,
              waitlisted: true,
              queueNumber: queueNum,
              status: 'waitlisted',
              message: 'Kapasitas penuh. Anda masuk antrean waiting list.',
            };
          } else {
            throw new Error('CLASSROOM_FULL');
          }
        }

        // Increment usage
        await tx
          .update(classroomJoinCodes)
          .set({ usesCount: joinCode.usesCount + 1 })
          .where(eq(classroomJoinCodes.id, joinCode.id));

        // Insert active enrollment
        const [enrollment] = await tx
          .insert(classroomEnrollments)
          .values({
            classroomId: id,
            studentId: user.id,
            status: 'active',
            enrollmentSource: 'JOIN_CODE',
            joinCodeUsed: code.toUpperCase(),
            enrolledAt: new Date(),
          })
          .onConflictDoUpdate({
            target: [classroomEnrollments.classroomId, classroomEnrollments.studentId],
            set: {
              status: 'active',
              enrollmentSource: 'JOIN_CODE',
              joinCodeUsed: code.toUpperCase(),
              enrolledAt: new Date(),
              withdrawnAt: null,
            },
          })
          .returning();

        return {
          enrolled: true,
          waitlisted: false,
          queueNumber: undefined,
          status: 'active',
          message: 'Berhasil bergabung ke dalam kelas digital Politeknik Kampar.',
          enrollment,
        };
      });

      return sendSuccess(reply, {
        success: true,
        enrolled: outcome.enrolled,
        waitlisted: outcome.waitlisted,
        queueNumber: outcome.queueNumber,
        status: outcome.status,
        message: outcome.message,
        enrollment: outcome.enrollment,
      });
    } catch (err: any) {
      if (err.message === 'INVALID_JOIN_CODE') {
        return sendError(reply, 404, 'INVALID_CODE', 'Kode gabung kelas tidak valid atau tidak aktif.');
      }
      if (err.message === 'JOIN_CODE_EXPIRED') {
        return sendError(reply, 400, 'CODE_EXPIRED', 'Masa berlaku kode gabung kelas ini telah kadaluarsa.');
      }
      if (err.message === 'JOIN_CODE_MAX_REACHED') {
        return sendError(reply, 409, 'MAX_USES_REACHED', 'Batas maksimal penggunaan kode gabung ini telah tercapai.');
      }
      return sendError(reply, 500, 'JOIN_ERROR', 'Gagal memproses gabung kelas.');
    }
  });

  // Approve Pending Student Enrollment
  fastify.post('/api/v1/enrollments/:id/approve', async (req, reply) => {
    const user = await authenticateRequest(req, reply);
    if (!user || !isLecturerOrAdmin(user)) return sendError(reply, 403, 'FORBIDDEN', 'Dosen or Admin only');
    const { id } = req.params as { id: string };

    const [updated] = await db
      .update(classroomEnrollments)
      .set({
        status: 'active',
        updatedAt: new Date(),
      })
      .where(eq(classroomEnrollments.id, id))
      .returning();

    return sendSuccess(reply, updated);
  });

  // Reject Pending Student Enrollment
  fastify.post('/api/v1/enrollments/:id/reject', async (req, reply) => {
    const user = await authenticateRequest(req, reply);
    if (!user || !isLecturerOrAdmin(user)) return sendError(reply, 403, 'FORBIDDEN', 'Dosen or Admin only');
    const { id } = req.params as { id: string };

    const bodySchema = z.object({ reason: z.string().optional().default('Tidak memenuhi prasyarat kelas') });
    const parsed = bodySchema.safeParse(req.body);
    const reason = parsed.success ? parsed.data.reason : 'Ditolak oleh Dosen Pengampu';

    const [updated] = await db
      .update(classroomEnrollments)
      .set({
        status: 'rejected',
        rejectionReason: reason,
        updatedAt: new Date(),
      })
      .where(eq(classroomEnrollments.id, id))
      .returning();

    return sendSuccess(reply, updated);
  });

  // Withdraw / Drop Student (Promotes next waiting list automatically!)
  fastify.post('/api/v1/enrollments/:id/withdraw', async (req, reply) => {
    const user = await authenticateRequest(req, reply);
    if (!user) return;
    const { id } = req.params as { id: string };

    const [enrollment] = await db
      .select()
      .from(classroomEnrollments)
      .where(eq(classroomEnrollments.id, id));

    if (!enrollment) return sendError(reply, 404, 'NOT_FOUND', 'Enrollment tidak ditemukan.');

    // Only student themselves or instructor/admin can withdraw
    const canWithdraw = isLecturerOrAdmin(user) || enrollment.studentId === user.id;
    if (!canWithdraw) {
      return sendError(reply, 403, 'FORBIDDEN', 'Anda tidak berwenang membatalkan pendaftaran ini.');
    }

    const result = await db.transaction(async (tx) => {
      // 1. Mark as dropped
      const [dropped] = await tx
        .update(classroomEnrollments)
        .set({
          status: 'dropped',
          withdrawnAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(classroomEnrollments.id, id))
        .returning();

      // 2. Check waitlist for auto-promotion
      const [nextWaitlist] = await tx
        .select()
        .from(classroomWaitlists)
        .where(
          and(
            eq(classroomWaitlists.classroomId, enrollment.classroomId),
            eq(classroomWaitlists.status, 'WAITING')
          )
        )
        .orderBy(asc(classroomWaitlists.queueNumber))
        .limit(1);

      let promotedUser = null;
      if (nextWaitlist) {
        // Promote waitlist user to active
        await tx
          .update(classroomWaitlists)
          .set({ status: 'PROMOTED', updatedAt: new Date() })
          .where(eq(classroomWaitlists.id, nextWaitlist.id));

        const [newEnroll] = await tx
          .insert(classroomEnrollments)
          .values({
            classroomId: enrollment.classroomId,
            studentId: nextWaitlist.studentId,
            status: 'active',
            enrollmentSource: 'WAITLIST_PROMOTED',
            enrolledAt: new Date(),
          })
          .onConflictDoUpdate({
            target: [classroomEnrollments.classroomId, classroomEnrollments.studentId],
            set: {
              status: 'active',
              enrollmentSource: 'WAITLIST_PROMOTED',
              enrolledAt: new Date(),
            },
          })
          .returning();

        promotedUser = newEnroll;
      }

      return {
        dropped,
        promoted: promotedUser,
      };
    });

    return sendSuccess(reply, result);
  });

  // View Classroom Participants (Lecturer / Admin)
  fastify.get('/api/v1/classrooms/:id/participants', async (req, reply) => {
    const user = await authenticateRequest(req, reply);
    if (!user) return;
    const { id } = req.params as { id: string };

    const instructors = await db
      .select({
        id: classroomInstructors.id,
        userId: users.id,
        fullName: users.fullName,
        email: users.email,
        identityNumber: users.identityNumber,
        role: classroomInstructors.role,
        isPrimary: classroomInstructors.isPrimary,
        status: classroomInstructors.status,
      })
      .from(classroomInstructors)
      .innerJoin(users, eq(classroomInstructors.instructorId, users.id))
      .where(eq(classroomInstructors.classroomId, id));

    const students = await db
      .select({
        enrollmentId: classroomEnrollments.id,
        userId: users.id,
        fullName: users.fullName,
        email: users.email,
        identityNumber: users.identityNumber,
        status: classroomEnrollments.status,
        enrollmentSource: classroomEnrollments.enrollmentSource,
        enrolledAt: classroomEnrollments.enrolledAt,
        withdrawnAt: classroomEnrollments.withdrawnAt,
      })
      .from(classroomEnrollments)
      .innerJoin(users, eq(classroomEnrollments.studentId, users.id))
      .where(eq(classroomEnrollments.classroomId, id))
      .orderBy(asc(users.fullName));

    const waitlist = await db
      .select({
        waitlistId: classroomWaitlists.id,
        userId: users.id,
        fullName: users.fullName,
        email: users.email,
        identityNumber: users.identityNumber,
        queueNumber: classroomWaitlists.queueNumber,
        status: classroomWaitlists.status,
        createdAt: classroomWaitlists.createdAt,
      })
      .from(classroomWaitlists)
      .innerJoin(users, eq(classroomWaitlists.studentId, users.id))
      .where(
        and(
          eq(classroomWaitlists.classroomId, id),
          eq(classroomWaitlists.status, 'WAITING')
        )
      )
      .orderBy(asc(classroomWaitlists.queueNumber));

    return sendSuccess(reply, {
      instructors,
      students,
      waitlist,
      totalActiveStudents: students.filter((s) => s.status === 'active').length,
      totalPendingStudents: students.filter((s) => s.status === 'pending').length,
    });
  });

  // Bulk enrollment
  const bulkEnrollSchema = z.object({
    studentIds: z.array(z.string().uuid()),
  });

  fastify.post('/api/v1/classrooms/:id/bulk-enroll', async (req, reply) => {
    const user = await authenticateRequest(req, reply);
    if (!user || !isLecturerOrAdmin(user)) return sendError(reply, 403, 'FORBIDDEN', 'Dosen or Admin only');
    const { id } = req.params as { id: string };

    const parsed = bulkEnrollSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(reply, 400, 'VALIDATION_ERROR', 'Daftar ID mahasiswa tidak valid.');
    }

    const { studentIds } = parsed.data;
    let enrolledCount = 0;

    for (const sid of studentIds) {
      await db
        .insert(classroomEnrollments)
        .values({
          classroomId: id,
          studentId: sid,
          status: 'active',
          enrollmentSource: 'BULK_IMPORT',
          enrolledAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [classroomEnrollments.classroomId, classroomEnrollments.studentId],
          set: {
            status: 'active',
            enrollmentSource: 'BULK_IMPORT',
            enrolledAt: new Date(),
            withdrawnAt: null,
          },
        });
      enrolledCount++;
    }

    return sendSuccess(reply, { enrolledCount, message: `Berhasil mendaftarkan ${enrolledCount} mahasiswa ke kelas ini.` });
  });

  // Get classroom waiting list
  fastify.get('/api/v1/classrooms/:id/waitlist', async (req, reply) => {
    const user = await authenticateRequest(req, reply);
    if (!user) return;
    const { id } = req.params as { id: string };

    const waitlist = await db
      .select({
        waitlist: classroomWaitlists,
        student: users,
      })
      .from(classroomWaitlists)
      .innerJoin(users, eq(classroomWaitlists.studentId, users.id))
      .where(eq(classroomWaitlists.classroomId, id))
      .orderBy(asc(classroomWaitlists.queueNumber));

    const enriched = waitlist.map((w) => ({
      ...w.waitlist,
      studentName: w.student.fullName,
      studentEmail: w.student.email,
      studentIdentityNumber: w.student.identityNumber,
    }));

    return sendSuccess(reply, enriched);
  });

  // Invite student to classroom
  const createInvitationSchema = z.object({
    studentId: z.string().uuid().optional(),
    studentEmail: z.string().email().optional(),
    message: z.string().optional().default('Undangan bergabung ke kelas digital Politeknik Kampar'),
    expiresInDays: z.number().int().min(1).max(30).default(7),
  });

  fastify.post('/api/v1/classrooms/:id/invitations', async (req, reply) => {
    const user = await authenticateRequest(req, reply);
    if (!user || !isLecturerOrAdmin(user)) return sendError(reply, 403, 'FORBIDDEN', 'Dosen or Admin only');
    const { id } = req.params as { id: string };

    const parsed = createInvitationSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(reply, 400, 'VALIDATION_ERROR', 'Input undangan tidak valid.', parsed.error.issues);
    }

    let targetStudentId = parsed.data.studentId;
    if (!targetStudentId && parsed.data.studentEmail) {
      const [u] = await db.select().from(users).where(eq(users.email, parsed.data.studentEmail.toLowerCase()));
      if (!u) return sendError(reply, 404, 'STUDENT_NOT_FOUND', 'Mahasiswa dengan email tersebut tidak ditemukan.');
      targetStudentId = u.id;
    }
    if (!targetStudentId) {
      return sendError(reply, 400, 'VALIDATION_ERROR', 'studentId atau studentEmail wajib disertakan.');
    }

    const expiresAt = new Date(Date.now() + parsed.data.expiresInDays * 24 * 60 * 60 * 1000);
    const [invitation] = await db
      .insert(classroomInvitations)
      .values({
        classroomId: id,
        studentId: targetStudentId,
        invitedById: user.id,
        status: 'PENDING',
        invitationMessage: parsed.data.message,
        expiresAt,
      })
      .returning();

    return sendSuccess(reply, invitation, null, 201);
  });

}
