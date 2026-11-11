import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { eq, and, desc, asc, ilike, or, sql, inArray } from 'drizzle-orm';
import { db } from '../db/index.ts';
import {
  users,
  userProfiles,
  roles,
  userRoles,
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
} from './security.ts';

// Role checking helper
function isSuperadmin(user: AuthenticatedUser): boolean {
  return user.roles.some((r) => r.toUpperCase() === 'SUPERADMIN');
}

function isLecturerOrAdmin(user: AuthenticatedUser): boolean {
  return user.roles.some((r) => ['SUPERADMIN', 'DOSEN'].includes(r.toUpperCase()));
}

// Ensure default academic master seed exists
export async function ensureAcademicMasterSeeded(): Promise<void> {
  try {
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
          startDate: new Date('2026-09-01T00:00:00Z'),
          endDate: new Date('2027-01-31T23:59:59Z'),
          registrationStart: new Date('2026-08-01T00:00:00Z'),
          registrationEnd: new Date('2026-09-15T23:59:59Z'),
          status: 'active',
          isDefault: true,
          createdById: adminId,
          metadata: { notes: 'Periode Perkuliahan Reguler Kampus Politeknik Kampar' },
        })
        .returning();

      defaultPeriodId = period.id;

      // Seed Academic Calendar Events
      await db.insert(academicCalendarEvents).values([
        {
          academicPeriodId: defaultPeriodId,
          title: 'Masa Pengisian Kartu Rencana Studi (KRS)',
          description: 'Pendaftaran kelas perkuliahan mandiri mahasiswa di Politeknik Kampar',
          category: 'KRS_REGISTRATION',
          startDate: new Date('2026-08-01T08:00:00Z'),
          endDate: new Date('2026-08-25T17:00:00Z'),
          isHoliday: false,
          visibility: 'ALL',
          color: '#2563eb',
          createdById: adminId,
        },
        {
          academicPeriodId: defaultPeriodId,
          title: 'Awal Perkuliahan Semester Ganjil 2026/2027',
          description: 'Kuliah perdana tatap muka dan digital classroom',
          category: 'LECTURE_START',
          startDate: new Date('2026-09-01T07:30:00Z'),
          endDate: new Date('2026-09-01T17:00:00Z'),
          isHoliday: false,
          visibility: 'ALL',
          color: '#16a34a',
          createdById: adminId,
        },
        {
          academicPeriodId: defaultPeriodId,
          title: 'Ujian Tengah Semester (UTS) Ganjil',
          description: 'Pekan evaluasi tengah semester terpadu',
          category: 'UTS',
          startDate: new Date('2026-10-26T08:00:00Z'),
          endDate: new Date('2026-11-06T17:00:00Z'),
          isHoliday: false,
          visibility: 'ALL',
          color: '#ea580c',
          createdById: adminId,
        },
        {
          academicPeriodId: defaultPeriodId,
          title: 'Ujian Akhir Semester (UAS) Ganjil',
          description: 'Pekan evaluasi akhir semester dan sidang praktikum',
          category: 'UAS',
          startDate: new Date('2027-01-11T08:00:00Z'),
          endDate: new Date('2027-01-22T17:00:00Z'),
          isHoliday: false,
          visibility: 'ALL',
          color: '#dc2626',
          createdById: adminId,
        },
        {
          academicPeriodId: defaultPeriodId,
          title: 'Batas Akhir Finalisasi Nilai Akademik',
          description: 'Batas akhir input dan penguncian nilai oleh Dosen Pengampu',
          category: 'GRADE_SUBMISSION',
          startDate: new Date('2027-01-25T08:00:00Z'),
          endDate: new Date('2027-01-31T23:59:59Z'),
          isHoliday: false,
          visibility: 'LECTURER_ONLY',
          color: '#7c3aed',
          createdById: adminId,
        },
      ]);

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
  // MODULE A: ACADEMIC PERIOD MANAGEMENT
  // ============================================================================

  // Public/Lecturer endpoint: Get currently active default academic period
  fastify.get('/api/v1/academic-periods/default', async (req, reply) => {
    const user = await authenticateRequest(req, reply);
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
        .where(eq(academicPeriods.status, 'active'))
        .orderBy(desc(academicPeriods.startDate))
        .limit(1);

      return sendSuccess(reply, latest || null);
    }

    return sendSuccess(reply, defaultPeriod);
  });

  // Superadmin: List all academic periods
  fastify.get('/api/v1/admin/academic-periods', async (req, reply) => {
    const user = await authenticateRequest(req, reply);
    if (!user) return;

    if (!isSuperadmin(user)) {
      return sendError(reply, 403, 'FORBIDDEN', 'Hanya Superadmin yang berwenang mengelola master Periode Akademik.');
    }

    const query = req.query as { status?: string; search?: string };
    const all = await db
      .select()
      .from(academicPeriods)
      .orderBy(desc(academicPeriods.startDate));

    let filtered = all;
    if (query.status && query.status !== 'all') {
      filtered = filtered.filter((p) => p.status === query.status);
    }
    if (query.search) {
      const q = query.search.toLowerCase();
      filtered = filtered.filter(
        (p) => p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q) || p.academicYear.toLowerCase().includes(q)
      );
    }

    // Attach count of classrooms and offerings
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

    return sendSuccess(reply, enriched);
  });

  // Superadmin: Create new Academic Period
  const createAcademicPeriodSchema = z.object({
    code: z.string().min(3).max(20),
    name: z.string().min(5),
    academicYear: z.string().min(7), // e.g., "2026/2027"
    semesterType: z.enum(['ODD', 'EVEN', 'SHORT']),
    startDate: z.string(),
    endDate: z.string(),
    registrationStart: z.string(),
    registrationEnd: z.string(),
    status: z.enum(['draft', 'scheduled', 'active', 'registration_closed', 'completed', 'archived']).default('draft'),
    isDefault: z.boolean().default(false),
    metadata: z.record(z.string(), z.unknown()).optional(),
  });

  fastify.post('/api/v1/admin/academic-periods', async (req, reply) => {
    const user = await authenticateRequest(req, reply);
    if (!user) return;
    if (!isSuperadmin(user)) {
      return sendError(reply, 403, 'FORBIDDEN', 'Hanya Superadmin yang berwenang menambah Periode Akademik.');
    }

    const parsed = createAcademicPeriodSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(reply, 400, 'VALIDATION_ERROR', 'Data periode akademik tidak valid.', parsed.error.issues);
    }

    const { code, name, academicYear, semesterType, startDate, endDate, registrationStart, registrationEnd, status, isDefault, metadata } = parsed.data;

    try {
      const result = await db.transaction(async (tx) => {
        // If isDefault is true, unset default on all other periods
        if (isDefault) {
          await tx
            .update(academicPeriods)
            .set({ isDefault: false, updatedAt: new Date() });
        }

        const [created] = await tx
          .insert(academicPeriods)
          .values({
            code,
            name,
            academicYear,
            semesterType,
            startDate: new Date(startDate),
            endDate: new Date(endDate),
            registrationStart: new Date(registrationStart),
            registrationEnd: new Date(registrationEnd),
            status,
            isDefault,
            createdById: user.id,
            metadata: metadata || {},
          })
          .returning();

        return created;
      });

      await recordAuditLog({
        actorId: user.id,
        action: 'ACADEMIC_PERIOD_CREATED',
        entityType: 'ACADEMIC_PERIOD',
        entityId: result.id,
        metadata: { code, name, academicYear },
        ipAddress: req.ip,
      });

      return sendSuccess(reply, result, null, 201);
    } catch (err: any) {
      console.error('Create academic period failed:', err);
      return sendError(reply, 409, 'CODE_EXISTS', 'Kode periode akademik sudah terdaftar.');
    }
  });

  // Superadmin: Update Academic Period
  fastify.patch('/api/v1/admin/academic-periods/:id', async (req, reply) => {
    const user = await authenticateRequest(req, reply);
    if (!user) return;
    if (!isSuperadmin(user)) {
      return sendError(reply, 403, 'FORBIDDEN', 'Hanya Superadmin yang berwenang memperbarui Periode Akademik.');
    }

    const { id } = req.params as { id: string };
    const [period] = await db.select().from(academicPeriods).where(eq(academicPeriods.id, id));
    if (!period) {
      return sendError(reply, 404, 'NOT_FOUND', 'Periode akademik tidak ditemukan.');
    }

    const updateSchema = z.object({
      name: z.string().optional(),
      academicYear: z.string().optional(),
      semesterType: z.enum(['ODD', 'EVEN', 'SHORT']).optional(),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      registrationStart: z.string().optional(),
      registrationEnd: z.string().optional(),
      status: z.enum(['draft', 'scheduled', 'active', 'registration_closed', 'completed', 'archived']).optional(),
      isDefault: z.boolean().optional(),
      metadata: z.record(z.string(), z.unknown()).optional(),
    });

    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(reply, 400, 'VALIDATION_ERROR', 'Format perbaruan tidak valid.', parsed.error.issues);
    }

    const updates: any = { updatedAt: new Date() };
    if (parsed.data.name !== undefined) updates.name = parsed.data.name;
    if (parsed.data.academicYear !== undefined) updates.academicYear = parsed.data.academicYear;
    if (parsed.data.semesterType !== undefined) updates.semesterType = parsed.data.semesterType;
    if (parsed.data.startDate !== undefined) updates.startDate = new Date(parsed.data.startDate);
    if (parsed.data.endDate !== undefined) updates.endDate = new Date(parsed.data.endDate);
    if (parsed.data.registrationStart !== undefined) updates.registrationStart = new Date(parsed.data.registrationStart);
    if (parsed.data.registrationEnd !== undefined) updates.registrationEnd = new Date(parsed.data.registrationEnd);
    if (parsed.data.status !== undefined) updates.status = parsed.data.status;
    if (parsed.data.metadata !== undefined) updates.metadata = parsed.data.metadata;

    const result = await db.transaction(async (tx) => {
      if (parsed.data.isDefault === true) {
        await tx.update(academicPeriods).set({ isDefault: false, updatedAt: new Date() });
        updates.isDefault = true;
      } else if (parsed.data.isDefault === false) {
        updates.isDefault = false;
      }

      const [updated] = await tx
        .update(academicPeriods)
        .set(updates)
        .where(eq(academicPeriods.id, id))
        .returning();
      return updated;
    });

    return sendSuccess(reply, result);
  });

  // State Transition Endpoints
  fastify.post('/api/v1/admin/academic-periods/:id/activate', async (req, reply) => {
    const user = await authenticateRequest(req, reply);
    if (!user || !isSuperadmin(user)) return sendError(reply, 403, 'FORBIDDEN', 'Superadmin only');
    const { id } = req.params as { id: string };

    const [updated] = await db
      .update(academicPeriods)
      .set({ status: 'active', updatedAt: new Date() })
      .where(eq(academicPeriods.id, id))
      .returning();

    return sendSuccess(reply, updated);
  });

  fastify.post('/api/v1/admin/academic-periods/:id/close-registration', async (req, reply) => {
    const user = await authenticateRequest(req, reply);
    if (!user || !isSuperadmin(user)) return sendError(reply, 403, 'FORBIDDEN', 'Superadmin only');
    const { id } = req.params as { id: string };

    const [updated] = await db
      .update(academicPeriods)
      .set({ status: 'registration_closed', updatedAt: new Date() })
      .where(eq(academicPeriods.id, id))
      .returning();

    return sendSuccess(reply, updated);
  });

  fastify.post('/api/v1/admin/academic-periods/:id/complete', async (req, reply) => {
    const user = await authenticateRequest(req, reply);
    if (!user || !isSuperadmin(user)) return sendError(reply, 403, 'FORBIDDEN', 'Superadmin only');
    const { id } = req.params as { id: string };

    const [updated] = await db
      .update(academicPeriods)
      .set({ status: 'completed', isDefault: false, updatedAt: new Date() })
      .where(eq(academicPeriods.id, id))
      .returning();

    return sendSuccess(reply, updated);
  });

  fastify.post('/api/v1/admin/academic-periods/:id/archive', async (req, reply) => {
    const user = await authenticateRequest(req, reply);
    if (!user || !isSuperadmin(user)) return sendError(reply, 403, 'FORBIDDEN', 'Superadmin only');
    const { id } = req.params as { id: string };

    const [updated] = await db
      .update(academicPeriods)
      .set({ status: 'archived', isDefault: false, updatedAt: new Date() })
      .where(eq(academicPeriods.id, id))
      .returning();

    return sendSuccess(reply, updated);
  });

  fastify.post('/api/v1/admin/academic-periods/:id/set-default', async (req, reply) => {
    const user = await authenticateRequest(req, reply);
    if (!user || !isSuperadmin(user)) return sendError(reply, 403, 'FORBIDDEN', 'Superadmin only');
    const { id } = req.params as { id: string };

    const result = await db.transaction(async (tx) => {
      await tx.update(academicPeriods).set({ isDefault: false, updatedAt: new Date() });
      const [updated] = await tx
        .update(academicPeriods)
        .set({ isDefault: true, status: 'active', updatedAt: new Date() })
        .where(eq(academicPeriods.id, id))
        .returning();
      return updated;
    });

    return sendSuccess(reply, result);
  });

  // ============================================================================
  // MODULE B: ACADEMIC CALENDAR
  // ============================================================================

  // List calendar events (Authenticated for students & lecturers)
  fastify.get('/api/v1/academic-calendar', async (req, reply) => {
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
  // MODULE C: COURSE OFFERINGS
  // ============================================================================

  // List course offerings
  fastify.get('/api/v1/course-offerings', async (req, reply) => {
    const user = await authenticateRequest(req, reply);
    if (!user) return;

    const query = req.query as { periodId?: string; studyProgram?: string };
    const offerings = await db
      .select({
        offering: courseOfferings,
        course: courses,
        period: academicPeriods,
        coordinator: users,
      })
      .from(courseOfferings)
      .innerJoin(courses, eq(courseOfferings.courseId, courses.id))
      .innerJoin(academicPeriods, eq(courseOfferings.academicPeriodId, academicPeriods.id))
      .leftJoin(users, eq(courseOfferings.coordinatorId, users.id))
      .orderBy(asc(courseOfferings.courseCode));

    let filtered = offerings;
    if (query.periodId) {
      filtered = filtered.filter((o) => o.offering.academicPeriodId === query.periodId);
    }
    if (query.studyProgram && query.studyProgram !== 'all') {
      filtered = filtered.filter((o) => o.offering.studyProgram.toLowerCase() === query.studyProgram?.toLowerCase());
    }

    // Attach active classroom count
    const enriched = await Promise.all(
      filtered.map(async (row) => {
        const clsList = await db
          .select({ id: classrooms.id })
          .from(classrooms)
          .where(eq(classrooms.courseOfferingId, row.offering.id));

        return {
          ...row.offering,
          course: row.course,
          period: row.period,
          coordinatorName: row.coordinator?.fullName || null,
          classroomCount: clsList.length,
        };
      })
    );

    return sendSuccess(reply, enriched);
  });

  // Create course offering
  const createOfferingSchema = z.object({
    courseId: z.string().uuid(),
    academicPeriodId: z.string().uuid(),
    studyProgram: z.string(),
    courseCode: z.string(),
    courseName: z.string(),
    theoryCredits: z.number().int().default(2),
    practicalCredits: z.number().int().default(1),
    totalCredits: z.number().int().default(3),
    coordinatorId: z.string().uuid().optional(),
    maxClassrooms: z.number().int().default(5),
  });

  fastify.post('/api/v1/course-offerings', async (req, reply) => {
    const user = await authenticateRequest(req, reply);
    if (!user || !isLecturerOrAdmin(user)) {
      return sendError(reply, 403, 'FORBIDDEN', 'Hanya Dosen atau Admin yang berwenang membuka penawaran mata kuliah.');
    }

    const parsed = createOfferingSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(reply, 400, 'VALIDATION_ERROR', 'Format tawaran mata kuliah tidak valid.', parsed.error.issues);
    }

    try {
      const [created] = await db
        .insert(courseOfferings)
        .values({
          ...parsed.data,
          createdById: user.id,
        })
        .returning();

      return sendSuccess(reply, created, null, 201);
    } catch (err: any) {
      return sendError(reply, 409, 'ALREADY_OFFERED', 'Mata kuliah sudah ditawarkan pada periode akademik ini.');
    }
  });

  // ============================================================================
  // MODULE D: CAMPUS FACILITIES & SCHEDULE CONFLICT DETECTION
  // ============================================================================

  // Buildings list
  fastify.get('/api/v1/campus/buildings', async (req, reply) => {
    const user = await authenticateRequest(req, reply);
    if (!user) return;

    const buildings = await db.select().from(campusBuildings).orderBy(asc(campusBuildings.name));
    const roomsList = await db.select().from(campusRooms);

    const enriched = buildings.map((b) => ({
      ...b,
      roomCount: roomsList.filter((r) => r.buildingId === b.id).length,
    }));

    return sendSuccess(reply, enriched);
  });

  // Rooms list
  fastify.get('/api/v1/campus/rooms', async (req, reply) => {
    const user = await authenticateRequest(req, reply);
    if (!user) return;

    const query = req.query as { buildingId?: string };
    const rooms = await db
      .select({
        room: campusRooms,
        building: campusBuildings,
      })
      .from(campusRooms)
      .innerJoin(campusBuildings, eq(campusRooms.buildingId, campusBuildings.id))
      .orderBy(asc(campusRooms.roomNumber));

    let filtered = rooms;
    if (query.buildingId) {
      filtered = filtered.filter((r) => r.room.buildingId === query.buildingId);
    }

    const res = filtered.map((r) => ({
      ...r.room,
      buildingCode: r.building.code,
      buildingName: r.building.name,
    }));

    return sendSuccess(reply, res);
  });

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
        buildingId: parsed.data.buildingId,
        roomId: parsed.data.roomId,
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

  // ============================================================================
  // MODULE E: ADVANCED CLASSROOM BUILDER (6-STEP WIZARD) & LIFECYCLE
  // ============================================================================

  const advancedClassroomBuilderSchema = z.object({
    // Step 1 & 2: Academic & Basic Info
    courseId: z.string().uuid(),
    courseOfferingId: z.string().uuid().optional().nullable(),
    academicPeriodId: z.string().uuid().optional().nullable(),
    name: z.string().min(3),
    classroomCode: z.string().min(2).optional(),
    cohort: z.string().optional().default('2026'),
    section: z.string().min(1).default('A'),
    classroomType: z.enum(['REGULAR', 'PRACTICAL', 'HYBRID', 'SHORT_SEMESTER', 'REMEDIAL']).default('REGULAR'),
    minCapacity: z.number().int().min(1).default(10),
    maxCapacity: z.number().int().min(1).max(250).default(35),
    category: z.string().default('REGULAR'),
    language: z.string().default('id'),
    visibility: z.enum(['PUBLIC_ENROLLED', 'CAMPUS_WIDE', 'PRIVATE_RESTRICTED']).default('PUBLIC_ENROLLED'),
    learningObjectives: z.string().optional().default(''),
    description: z.string().optional().default(''),
    roomNumber: z.string().optional().default('Daring / Fleksibel'),
    scheduleText: z.string().optional().default('Sesuai Jadwal'),

    // Step 3: Teaching Team
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

  // Advanced Classroom Creation Wizard API
  fastify.post('/api/v1/classrooms/builder', async (req, reply) => {
    const user = await authenticateRequest(req, reply);
    if (!user || !isLecturerOrAdmin(user)) {
      return sendError(reply, 403, 'FORBIDDEN', 'Hanya Dosen atau Admin yang berwenang membuat ruang kelas baru.');
    }

    const parsed = advancedClassroomBuilderSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(reply, 400, 'VALIDATION_ERROR', 'Konfigurasi wizard ruang kelas tidak valid.', parsed.error.issues);
    }

    const data = parsed.data;

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
    const semesterId = latestSemester?.id || '00000000-0000-0000-0000-000000000000';

    // Verify academic period validity
    if (resolvedPeriodId) {
      const [period] = await db.select().from(academicPeriods).where(eq(academicPeriods.id, resolvedPeriodId));
      if (period && ['completed', 'archived'].includes(period.status)) {
        return sendError(
          reply,
          400,
          'PERIOD_INACTIVE',
          `Tidak dapat membuka kelas baru pada periode akademik ${period.name} karena status telah ${period.status.toUpperCase()}.`
        );
      }
    }

    // Check schedules for conflicts
    for (const sched of data.schedules) {
      const conflict = await detectScheduleConflicts({
        dayOfWeek: sched.dayOfWeek,
        startTime: sched.startTime,
        endTime: sched.endTime,
        instructorId: user.id,
        roomId: sched.roomId,
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

        // 1. Create Classroom
        const [createdClass] = await tx
          .insert(classrooms)
          .values({
            courseId: data.courseId,
            courseOfferingId: data.courseOfferingId,
            academicPeriodId: resolvedPeriodId,
            semesterId,
            name: data.name,
            classroomCode: data.classroomCode || randomJoinCode,
            cohort: data.cohort,
            section: data.section,
            roomNumber: data.roomNumber,
            scheduleText: data.scheduleText,
            classroomType: data.classroomType,
            minCapacity: data.minCapacity,
            maxCapacity: data.maxCapacity,
            capacity: data.maxCapacity,
            category: data.category,
            language: data.language,
            visibility: data.visibility,
            learningObjectives: data.learningObjectives,
            description: data.description,
            lifecycleStatus: initialLifecycle,
            approvalStatus: initialApproval,
            publishedAt: initialLifecycle === 'active' ? new Date() : null,
            createdById: user.id,
          })
          .returning();

        // 2. Create Teaching Team
        const instructorsToInsert: any[] = [];
        // Add creator as primary if not included
        const hasPrimary = data.instructors.some((i) => i.role === 'PRIMARY_INSTRUCTOR');
        if (!hasPrimary || !data.instructors.some((i) => i.instructorId === user.id)) {
          instructorsToInsert.push({
            classroomId: createdClass.id,
            instructorId: user.id,
            role: 'PRIMARY_INSTRUCTOR',
            isPrimary: true,
            permissionScopes: ['all'],
          });
        }

        for (const inst of data.instructors) {
          if (inst.instructorId === user.id && instructorsToInsert.length > 0) continue;
          instructorsToInsert.push({
            classroomId: createdClass.id,
            instructorId: inst.instructorId,
            role: inst.role,
            isPrimary: inst.role === 'PRIMARY_INSTRUCTOR',
            permissionScopes: inst.permissionScopes,
          });
        }

        if (instructorsToInsert.length > 0) {
          await tx.insert(classroomInstructors).values(instructorsToInsert);
        }

        // 3. Create Schedules
        if (data.schedules.length > 0) {
          const scheduleValues = data.schedules.map((s) => ({
            classroomId: createdClass.id,
            dayOfWeek: s.dayOfWeek,
            startTime: s.startTime,
            endTime: s.endTime,
            scheduleType: s.scheduleType,
            instructorId: user.id,
            buildingId: s.buildingId,
            roomId: s.roomId,
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
        };
      });

      await recordAuditLog({
        actorId: user.id,
        action: 'CLASSROOM_CREATED_ADVANCED',
        entityType: 'CLASSROOM',
        entityId: result.id,
        metadata: { name: result.name, code: result.classroomCode },
        ipAddress: req.ip,
      });

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
    if (!user || !isLecturerOrAdmin(user)) return sendError(reply, 403, 'FORBIDDEN', 'Dosen or Admin only');
    const { id } = req.params as { id: string };

    const [updated] = await db
      .update(classrooms)
      .set({
        lifecycleStatus: 'archived',
        archivedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(classrooms.id, id))
      .returning();

    return sendSuccess(reply, updated);
  });

  // ============================================================================
  // MODULE F: ENROLLMENT & PARTICIPANT MANAGEMENT
  // ============================================================================

  // Student Catalog: View published/active classrooms available for enrollment
  fastify.get('/api/v1/classrooms/catalog', async (req, reply) => {
    const user = await authenticateRequest(req, reply);
    if (!user) return;

    const query = req.query as { periodId?: string; search?: string; studyProgram?: string };
    
    // Fetch default period if none requested
    let targetPeriodId = query.periodId;
    if (!targetPeriodId) {
      const [def] = await db.select().from(academicPeriods).where(eq(academicPeriods.isDefault, true));
      targetPeriodId = def?.id;
    }

    const allClasses = await db
      .select({
        cls: classrooms,
        course: courses,
        period: academicPeriods,
        policy: classroomEnrollmentPolicies,
      })
      .from(classrooms)
      .innerJoin(courses, eq(classrooms.courseId, courses.id))
      .leftJoin(academicPeriods, eq(classrooms.academicPeriodId, academicPeriods.id))
      .leftJoin(classroomEnrollmentPolicies, eq(classrooms.id, classroomEnrollmentPolicies.classroomId))
      .where(
        and(
          eq(classrooms.lifecycleStatus, 'active'),
          targetPeriodId ? eq(classrooms.academicPeriodId, targetPeriodId) : undefined
        )
      )
      .orderBy(asc(courses.code), asc(classrooms.section));

    // Get all enrollments & waitlists for current user
    const userEnrollments = await db
      .select()
      .from(classroomEnrollments)
      .where(eq(classroomEnrollments.studentId, user.id));

    const userWaitlists = await db
      .select()
      .from(classroomWaitlists)
      .where(eq(classroomWaitlists.studentId, user.id));

    // Instructors
    const allInstructors = await db
      .select({
        classroomId: classroomInstructors.classroomId,
        instructorName: users.fullName,
        isPrimary: classroomInstructors.isPrimary,
      })
      .from(classroomInstructors)
      .innerJoin(users, eq(classroomInstructors.instructorId, users.id));

    const enrollCounts = await db
      .select({
        classroomId: classroomEnrollments.classroomId,
        count: sql<number>`count(*)::int`,
      })
      .from(classroomEnrollments)
      .where(eq(classroomEnrollments.status, 'active'))
      .groupBy(classroomEnrollments.classroomId);

    const countMap = new Map(enrollCounts.map((c) => [c.classroomId, c.count]));

    let items = allClasses.map((row) => {
      const myEnrollment = userEnrollments.find((e) => e.classroomId === row.cls.id);
      const myWaitlist = userWaitlists.find((w) => w.classroomId === row.cls.id);
      const activeCount = countMap.get(row.cls.id) || 0;
      const maxSeats = row.policy?.maxParticipants || row.cls.maxCapacity || 35;
      const instructors = allInstructors
        .filter((i) => i.classroomId === row.cls.id)
        .map((i) => i.instructorName);

      return {
        id: row.cls.id,
        name: row.cls.name,
        section: row.cls.section,
        classroomCode: row.cls.classroomCode,
        courseCode: row.course.code,
        courseTitle: row.course.title,
        credits: row.course.credits,
        studyProgram: row.course.studyProgram,
        periodName: row.period?.name || 'Semester Aktif',
        periodStatus: row.period?.status || 'active',
        enrollmentMode: row.policy?.enrollmentMode || 'AUTO',
        activeParticipants: activeCount,
        maxCapacity: maxSeats,
        isFull: activeCount >= maxSeats,
        waitingListEnabled: row.policy?.waitingListEnabled ?? true,
        myStatus: myEnrollment ? myEnrollment.status : myWaitlist ? 'waitlisted' : null,
        instructors,
      };
    });

    if (query.search) {
      const q = query.search.toLowerCase();
      items = items.filter(
        (i) => i.name.toLowerCase().includes(q) || i.courseCode.toLowerCase().includes(q) || i.courseTitle.toLowerCase().includes(q)
      );
    }
    if (query.studyProgram && query.studyProgram !== 'all') {
      items = items.filter((i) => i.studyProgram.toLowerCase() === query.studyProgram?.toLowerCase());
    }

    return sendSuccess(reply, items);
  });

  // Student self-enrollment from Catalog
  fastify.post('/api/v1/classrooms/:id/enroll', async (req, reply) => {
    const user = await authenticateRequest(req, reply);
    if (!user) return;
    const { id } = req.params as { id: string };

    // 1. Check classroom existence & status
    const [cls] = await db
      .select({
        cls: classrooms,
        period: academicPeriods,
        policy: classroomEnrollmentPolicies,
      })
      .from(classrooms)
      .leftJoin(academicPeriods, eq(classrooms.academicPeriodId, academicPeriods.id))
      .leftJoin(classroomEnrollmentPolicies, eq(classrooms.id, classroomEnrollmentPolicies.classroomId))
      .where(eq(classrooms.id, id));

    if (!cls) return sendError(reply, 404, 'NOT_FOUND', 'Ruang kelas tidak ditemukan.');

    if (cls.cls.lifecycleStatus !== 'active') {
      return sendError(
        reply,
        400,
        'CLASS_NOT_ACTIVE',
        `Pendaftaran tidak dibuka: Ruang kelas berstatus ${cls.cls.lifecycleStatus.toUpperCase()}.`
      );
    }

    // 2. Check academic period registration window
    if (cls.period) {
      if (['registration_closed', 'completed', 'archived'].includes(cls.period.status)) {
        return sendError(
          reply,
          400,
          'REGISTRATION_CLOSED',
          `Masa pendaftaran perkuliahan untuk ${cls.period.name} telah ditutup.`
        );
      }
    }

    // 3. Check existing enrollment
    const [existingEnrollment] = await db
      .select()
      .from(classroomEnrollments)
      .where(
        and(
          eq(classroomEnrollments.classroomId, id),
          eq(classroomEnrollments.studentId, user.id)
        )
      );

    if (existingEnrollment) {
      if (existingEnrollment.status === 'active') {
        return sendError(reply, 400, 'ALREADY_ENROLLED', 'Anda sudah terdaftar aktif di kelas ini.');
      }
      if (existingEnrollment.status === 'pending') {
        return sendError(reply, 400, 'ALREADY_PENDING', 'Pendaftaran Anda sedang menunggu persetujuan Dosen.');
      }
    }

    // 4. Check capacity & perform enrollment or waitlist in transaction
    const policy = cls.policy;
    const maxCapacity = policy?.maxParticipants || cls.cls.maxCapacity || 35;
    const enrollMode = policy?.enrollmentMode || 'AUTO';

    try {
      const outcome = await db.transaction(async (tx) => {
        // Count active enrollments
        const activeRows = await tx
          .select({ id: classroomEnrollments.id })
          .from(classroomEnrollments)
          .where(
            and(
              eq(classroomEnrollments.classroomId, id),
              eq(classroomEnrollments.status, 'active')
            )
          );

        const currentCount = activeRows.length;
        const isFull = currentCount >= maxCapacity;

        if (isFull) {
          // Check waitlist
          if (policy?.waitingListEnabled ?? true) {
            const waitlistRows = await tx
              .select({ id: classroomWaitlists.id })
              .from(classroomWaitlists)
              .where(
                and(
                  eq(classroomWaitlists.classroomId, id),
                  eq(classroomWaitlists.status, 'WAITING')
                )
              );

            const maxWaiting = policy?.maxWaitingList || 15;
            if (waitlistRows.length >= maxWaiting) {
              throw new Error('WAITLIST_FULL');
            }

            const queueNum = waitlistRows.length + 1;
            const [waitlistEntry] = await tx
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
              })
              .returning();

            return { enrolled: false, waitlisted: true, queueNumber: queueNum, message: 'Kapasitas penuh. Anda masuk antrean waiting list.' };
          } else {
            throw new Error('CLASSROOM_FULL');
          }
        }

        // Seats available
        const statusToSet = enrollMode === 'APPROVAL_REQUIRED' ? 'pending' : 'active';
        const [enrollment] = await tx
          .insert(classroomEnrollments)
          .values({
            classroomId: id,
            studentId: user.id,
            status: statusToSet,
            enrollmentSource: 'CATALOG',
            enrolledAt: new Date(),
          })
          .onConflictDoUpdate({
            target: [classroomEnrollments.classroomId, classroomEnrollments.studentId],
            set: {
              status: statusToSet,
              enrollmentSource: 'CATALOG',
              enrolledAt: new Date(),
              withdrawnAt: null,
            },
          })
          .returning();

        return {
          enrolled: true,
          waitlisted: false,
          status: statusToSet,
          message: statusToSet === 'active' ? 'Pendaftaran berhasil! Anda telah terdaftar aktif.' : 'Pendaftaran berhasil dikirim! Menunggu persetujuan Dosen Pengampu.',
          enrollment,
        };
      });

      return sendSuccess(reply, outcome);
    } catch (err: any) {
      if (err.message === 'CLASSROOM_FULL') {
        return sendError(reply, 409, 'CLASSROOM_FULL', 'Kapasitas kelas telah penuh dan kuota waitlist tidak diaktifkan.');
      }
      if (err.message === 'WAITLIST_FULL') {
        return sendError(reply, 409, 'WAITLIST_FULL', 'Kapasitas kelas dan antrean waiting list telah penuh.');
      }
      console.error('Enrollment transaction failed:', err);
      return sendError(reply, 500, 'ENROLLMENT_ERROR', 'Gagal memproses pendaftaran kelas.');
    }
  });

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

        return enrollment;
      });

      return sendSuccess(reply, {
        success: true,
        message: 'Berhasil bergabung ke dalam kelas digital Politeknik Kampar.',
        enrollment: outcome,
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

  // ============================================================================
  // MODULE G: ROLE-SPECIFIC DASHBOARDS
  // ============================================================================

  // Superadmin Dashboard
  fastify.get('/api/v1/dashboards/superadmin', async (req, reply) => {
    const user = await authenticateRequest(req, reply);
    if (!user || !isSuperadmin(user)) return sendError(reply, 403, 'FORBIDDEN', 'Superadmin only');

    const allClasses = await db.select().from(classrooms);
    const allUsers = await db.select().from(users);
    const allRoles = await db.select().from(userRoles);
    const roleMap = await db.select().from(roles);

    const dosenRoleId = roleMap.find((r) => r.code === 'DOSEN')?.id;
    const mhsRoleId = roleMap.find((r) => r.code === 'MAHASISWA')?.id;

    const totalLecturers = allRoles.filter((ur) => ur.roleId === dosenRoleId).length;
    const totalStudents = allRoles.filter((ur) => ur.roleId === mhsRoleId).length;

    const activeClassrooms = allClasses.filter((c) => c.lifecycleStatus === 'active').length;
    const draftClassrooms = allClasses.filter((c) => c.lifecycleStatus === 'draft').length;
    const pendingApprovalClassrooms = allClasses.filter((c) => c.lifecycleStatus === 'pending_approval').length;
    const completedClassrooms = allClasses.filter((c) => c.lifecycleStatus === 'completed').length;

    // Classrooms with 0 students
    const enrollments = await db.select().from(classroomEnrollments);
    const enrolledClassroomIds = new Set(enrollments.filter((e) => e.status === 'active').map((e) => e.classroomId));
    const classesWithoutStudents = allClasses.filter((c) => !enrolledClassroomIds.has(c.id)).length;

    // Classrooms with 0 instructors
    const instructors = await db.select().from(classroomInstructors);
    const instructedClassroomIds = new Set(instructors.map((i) => i.classroomId));
    const classesWithoutLecturers = allClasses.filter((c) => !instructedClassroomIds.has(c.id)).length;

    return sendSuccess(reply, {
      totalClassrooms: allClasses.length,
      activeClassrooms,
      draftClassrooms,
      pendingApprovalClassrooms,
      completedClassrooms,
      totalLecturers,
      totalStudents,
      classesWithoutStudents,
      classesWithoutLecturers,
    });
  });

  // Lecturer Dashboard
  fastify.get('/api/v1/dashboards/lecturer', async (req, reply) => {
    const user = await authenticateRequest(req, reply);
    if (!user || !isLecturerOrAdmin(user)) return sendError(reply, 403, 'FORBIDDEN', 'Dosen or Admin only');

    // My classrooms
    const myInstructed = await db
      .select({
        cls: classrooms,
        course: courses,
      })
      .from(classroomInstructors)
      .innerJoin(classrooms, eq(classroomInstructors.classroomId, classrooms.id))
      .innerJoin(courses, eq(classrooms.courseId, courses.id))
      .where(eq(classroomInstructors.instructorId, user.id));

    const classroomIds = myInstructed.map((m) => m.cls.id);

    // Pending enrollments across my classes
    let pendingEnrollmentsCount = 0;
    if (classroomIds.length > 0) {
      const pendingRows = await db
        .select({ id: classroomEnrollments.id })
        .from(classroomEnrollments)
        .where(
          and(
            inArray(classroomEnrollments.classroomId, classroomIds),
            eq(classroomEnrollments.status, 'pending')
          )
        );
      pendingEnrollmentsCount = pendingRows.length;
    }

    // Pending grading submissions
    let pendingGradingCount = 0;
    if (classroomIds.length > 0) {
      const pendingSubmissions = await db
        .select({ id: assignmentSubmissions.id })
        .from(assignmentSubmissions)
        .innerJoin(assignments, eq(assignmentSubmissions.assignmentId, assignments.id))
        .where(
          and(
            inArray(assignments.classroomId, classroomIds),
            eq(assignmentSubmissions.gradingStatus, 'SUBMITTED')
          )
        );
      pendingGradingCount = pendingSubmissions.length;
    }

    return sendSuccess(reply, {
      myClassroomsCount: myInstructed.length,
      activeClassesCount: myInstructed.filter((m) => m.cls.lifecycleStatus === 'active').length,
      pendingEnrollmentsCount,
      pendingGradingCount,
      classrooms: myInstructed.map((m) => ({
        id: m.cls.id,
        name: m.cls.name,
        section: m.cls.section,
        courseCode: m.course.code,
        courseTitle: m.course.title,
        status: m.cls.lifecycleStatus,
      })),
    });
  });

  // Student Dashboard
  fastify.get('/api/v1/dashboards/student', async (req, reply) => {
    const user = await authenticateRequest(req, reply);
    if (!user) return;

    const myEnrollments = await db
      .select({
        enroll: classroomEnrollments,
        cls: classrooms,
        course: courses,
      })
      .from(classroomEnrollments)
      .innerJoin(classrooms, eq(classroomEnrollments.classroomId, classrooms.id))
      .innerJoin(courses, eq(classrooms.courseId, courses.id))
      .where(eq(classroomEnrollments.studentId, user.id));

    const activeEnrolls = myEnrollments.filter((e) => e.enroll.status === 'active');
    const activeClassIds = activeEnrolls.map((e) => e.cls.id);

    // Timetable
    let schedules: any[] = [];
    if (activeClassIds.length > 0) {
      schedules = await db
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
        .orderBy(asc(classroomSchedules.dayOfWeek), asc(classroomSchedules.startTime));
    }

    return sendSuccess(reply, {
      enrolledCount: activeEnrolls.length,
      pendingCount: myEnrollments.filter((e) => e.enroll.status === 'pending').length,
      classrooms: activeEnrolls.map((e) => ({
        id: e.cls.id,
        name: e.cls.name,
        section: e.cls.section,
        courseCode: e.course.code,
        courseTitle: e.course.title,
        credits: e.course.credits,
      })),
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
    });
  });
}
