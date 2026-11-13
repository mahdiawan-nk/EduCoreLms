import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  integer,
  numeric,
  jsonb,
  uniqueIndex,
  index,
  primaryKey,
} from 'drizzle-orm/pg-core';

// 1. Users & Profiles
export const users = pgTable(
  'users',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    uid: text('uid').unique(),
    email: text('email').notNull().unique(),
    passwordHash: text('password_hash').notNull(),
    fullName: text('full_name').notNull(),
    identityNumber: text('identity_number').unique(),
    isActive: boolean('is_active').default(true).notNull(),
    accountStatus: text('account_status').default('ACTIVE').notNull(), // 'ACTIVE' | 'INACTIVE' | 'SUSPENDED' | 'PENDING_ACTIVATION'
    mustResetPassword: boolean('must_reset_password').default(false).notNull(),
    passwordChangedAt: timestamp('password_changed_at', { withTimezone: true }),
    temporaryPasswordExpiresAt: timestamp('temporary_password_expires_at', { withTimezone: true }),
    passwordResetAt: timestamp('password_reset_at', { withTimezone: true }),
    passwordResetBy: uuid('password_reset_by'),
    passwordResetReason: text('password_reset_reason'),
    lastLoginAt: timestamp('last_login_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('idx_users_email').on(table.email),
    index('idx_users_identity').on(table.identityNumber),
  ]
);

export const userProfiles = pgTable(
  'user_profiles',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull()
      .unique(),
    studyProgram: text('study_program').default('Teknik Informatika').notNull(),
    organizationalUnit: text('organizational_unit').default('Politeknik Kampar').notNull(),
    nidn: text('nidn'),
    nip: text('nip'),
    nim: text('nim'),
    academicStatus: text('academic_status').default('AKTIF').notNull(),
    admissionYear: integer('admission_year'),
    auditScope: text('audit_scope'),
    phone: text('phone'),
    bio: text('bio'),
    avatarUrl: text('avatar_url'),
    semesterLevel: integer('semester_level'),
    academicTitle: text('academic_title'),
    dashboardPreferences: jsonb('dashboard_preferences').default({}).notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [index('idx_user_profiles_user_id').on(table.userId)]
);

// 2. Roles & Permissions (Custom RBAC)
export const roles = pgTable('roles', {
  id: uuid('id').defaultRandom().primaryKey(),
  code: text('code').notNull().unique(),
  name: text('name').notNull(),
  description: text('description').notNull(),
  isSystem: boolean('is_system').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const permissions = pgTable('permissions', {
  id: uuid('id').defaultRandom().primaryKey(),
  code: text('code').notNull().unique(),
  module: text('module').notNull(),
  description: text('description').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const userRoles = pgTable(
  'user_roles',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    roleId: uuid('role_id')
      .references(() => roles.id, { onDelete: 'cascade' })
      .notNull(),
    assignedAt: timestamp('assigned_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('uq_user_role').on(table.userId, table.roleId),
    index('idx_user_roles_user').on(table.userId),
  ]
);

export const rolePermissions = pgTable(
  'role_permissions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    roleId: uuid('role_id')
      .references(() => roles.id, { onDelete: 'cascade' })
      .notNull(),
    permissionId: uuid('permission_id')
      .references(() => permissions.id, { onDelete: 'cascade' })
      .notNull(),
    assignedAt: timestamp('assigned_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('uq_role_permission').on(table.roleId, table.permissionId),
    index('idx_role_permissions_role').on(table.roleId),
  ]
);

// 3. Academic Years & Semesters
export const academicYears = pgTable('academic_years', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull().unique(),
  startDate: text('start_date').notNull(),
  endDate: text('end_date').notNull(),
  isCurrent: boolean('is_current').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const semesters = pgTable(
  'semesters',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    academicYearId: uuid('academic_year_id')
      .references(() => academicYears.id, { onDelete: 'cascade' })
      .notNull(),
    name: text('name').notNull(),
    termType: text('term_type').notNull(),
    isActive: boolean('is_active').default(false).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [index('idx_semesters_academic_year').on(table.academicYearId)]
);

// 3.1 Dedicated Superadmin-Managed Academic Periods (Pure Semester Administration)
export const academicPeriods = pgTable(
  'academic_periods',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    code: text('code').notNull().unique(), // academic_code e.g. '20261'
    name: text('name').notNull(), // e.g. 'Semester Ganjil 2026/2027'
    academicYear: text('academic_year').notNull(), // e.g. '2026/2027'
    semesterType: text('semester_type').notNull(), // 'ODD' | 'EVEN' | 'SHORT'
    description: text('description').default('').notNull(),
    preparationStartDate: timestamp('preparation_start_date', { withTimezone: true }),
    startDate: timestamp('start_date', { withTimezone: true }).notNull(), // lecture_start_date
    endDate: timestamp('end_date', { withTimezone: true }).notNull(), // lecture_end_date
    status: text('status').default('DRAFT').notNull(), // 'DRAFT' | 'SCHEDULED' | 'ACTIVE' | 'COMPLETED' | 'ARCHIVED'
    isDefault: boolean('is_default').default(false).notNull(),
    administrativeNotes: text('administrative_notes').default('').notNull(),
    createdById: uuid('created_by_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    metadata: jsonb('metadata').default({}).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_academic_periods_code').on(table.code),
    index('idx_academic_periods_status').on(table.status),
    index('idx_academic_periods_is_default').on(table.isDefault),
  ]
);

export const academicCalendarEvents = pgTable(
  'academic_calendar_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    academicPeriodId: uuid('academic_period_id')
      .references(() => academicPeriods.id, { onDelete: 'cascade' })
      .notNull(),
    title: text('title').notNull(),
    description: text('description').default('').notNull(),
    category: text('category').notNull(), // 'LECTURE_START' | 'LECTURE_END' | 'KRS_REGISTRATION' | 'UTS' | 'UAS' | 'HOLIDAY' | 'GRADE_SUBMISSION' | 'GRADE_CORRECTION' | 'REMEDIAL' | 'REGISTRATION_DEADLINE' | 'OTHER'
    startDate: timestamp('start_date', { withTimezone: true }).notNull(),
    endDate: timestamp('end_date', { withTimezone: true }).notNull(),
    isHoliday: boolean('is_holiday').default(false).notNull(),
    visibility: text('visibility').default('ALL').notNull(), // 'ALL' | 'LECTURERS_ONLY' | 'STUDENTS_ONLY' | 'ADMIN_ONLY'
    color: text('color').default('#2563eb').notNull(),
    createdById: uuid('created_by_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_academic_calendar_period').on(table.academicPeriodId),
    index('idx_academic_calendar_dates').on(table.startDate, table.endDate),
    index('idx_academic_calendar_category').on(table.category),
  ]
);

// 4. Courses (Master Academic Subject)
export const courses = pgTable(
  'courses',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    code: text('code').notNull().unique(),
    title: text('title').notNull(),
    studyProgram: text('study_program').notNull(),
    credits: integer('credits').default(3).notNull(),
    semesterNumber: integer('semester_number').default(3).notNull(),
    description: text('description').notNull(),
    createdById: uuid('created_by_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('idx_courses_program').on(table.studyProgram),
    index('idx_courses_code').on(table.code),
  ]
);

// 4.1 Course Offerings (Semester-Specific Course Availability)
export const courseOfferings = pgTable(
  'course_offerings',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    courseId: uuid('course_id')
      .references(() => courses.id, { onDelete: 'restrict' })
      .notNull(),
    academicPeriodId: uuid('academic_period_id')
      .references(() => academicPeriods.id, { onDelete: 'restrict' })
      .notNull(),
    studyProgram: text('study_program').notNull(),
    courseCode: text('course_code').notNull(),
    courseName: text('course_name').notNull(),
    theoryCredits: integer('theory_credits').default(2).notNull(),
    practicalCredits: integer('practical_credits').default(1).notNull(),
    totalCredits: integer('total_credits').default(3).notNull(),
    coordinatorId: uuid('coordinator_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    offeringStatus: text('offering_status').default('OFFERED').notNull(), // 'OFFERED' | 'PLANNED' | 'CANCELLED' | 'COMPLETED'
    maxClassrooms: integer('max_classrooms').default(5).notNull(),
    createdById: uuid('created_by_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('uq_course_offering_period').on(table.courseId, table.academicPeriodId),
    index('idx_course_offerings_period').on(table.academicPeriodId),
    index('idx_course_offerings_program').on(table.studyProgram),
  ]
);

// 4.2 Campus Buildings & Physical Rooms (Facilities & Conflict Checking)
export const campusBuildings = pgTable(
  'campus_buildings',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    code: text('code').notNull().unique(), // 'GEDUNG_A', 'GEDUNG_LAB'
    name: text('name').notNull(),
    location: text('location').default('Kampus Utama Politeknik Kampar').notNull(),
    totalFloors: integer('total_floors').default(3).notNull(),
    isActive: boolean('is_active').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('idx_buildings_code').on(table.code)]
);

export const campusRooms = pgTable(
  'campus_rooms',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    buildingId: uuid('building_id')
      .references(() => campusBuildings.id, { onDelete: 'cascade' })
      .notNull(),
    roomNumber: text('room_number').notNull(), // 'LAB-KOMP-01', 'R-201'
    name: text('name').notNull(),
    roomType: text('room_type').default('CLASSROOM').notNull(), // 'CLASSROOM' | 'LAB_COMPUTER' | 'LAB_HARDWARE' | 'WORKSHOP' | 'AUDITORIUM'
    capacity: integer('capacity').default(40).notNull(),
    facilities: jsonb('facilities').default([]).notNull(),
    isActive: boolean('is_active').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('uq_building_room').on(table.buildingId, table.roomNumber),
    index('idx_rooms_building').on(table.buildingId),
    index('idx_rooms_type').on(table.roomType),
  ]
);

// 5. Classrooms, Instructors, Join Codes, Enrollments
export const classrooms = pgTable(
  'classrooms',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    courseId: uuid('course_id').references(() => courses.id, {
      onDelete: 'set null',
    }),
    semesterId: uuid('semester_id').references(() => semesters.id, {
      onDelete: 'set null',
    }),
    courseOfferingId: uuid('course_offering_id').references(
      () => courseOfferings.id,
      { onDelete: 'set null' }
    ),
    academicPeriodId: uuid('academic_period_id').references(
      () => academicPeriods.id,
      { onDelete: 'set null' }
    ),
    name: text('name').notNull(),
    section: text('section').notNull(),
    classroomCode: text('classroom_code'),
    subjectName: text('subject_name'),
    subjectCode: text('subject_code'),
    academicYear: text('academic_year'),
    semesterName: text('semester_name'),
    locationDescription: text('location_description'),
    cohort: text('cohort'),
    classroomType: text('classroom_type').default('REGULAR').notNull(), // 'REGULAR' | 'PRACTICUM' | 'REMEDIAL' | 'SHORT_SEMESTER'
    roomNumber: text('room_number').default('Lab Komputer Lantai 2').notNull(),
    scheduleText: text('schedule_text').default('Senin, 08:00 - 10:30 WIB').notNull(),
    capacity: integer('capacity').default(35).notNull(),
    minCapacity: integer('min_capacity').default(10).notNull(),
    maxCapacity: integer('max_capacity').default(35).notNull(),
    category: text('category').default('REGULAR').notNull(),
    language: text('language').default('id').notNull(),
    visibility: text('visibility').default('PUBLIC_ENROLLED').notNull(),
    learningObjectives: text('learning_objectives'),
    cpmk: text('cpmk'),
    coverImageKey: text('cover_image_key'),
    coverImagePath: text('cover_image_path'),
    coverThumbnailPath: text('cover_thumbnail_path'),
    coverMimeType: text('cover_mime_type'),
    coverFileSize: integer('cover_file_size'),
    coverWidth: integer('cover_width'),
    coverHeight: integer('cover_height'),
    coverUpdatedAt: timestamp('cover_updated_at', { withTimezone: true }),
    enrollmentPolicy: text('enrollment_policy').default('AUTO').notNull(), // 'AUTO' | 'APPROVAL_REQUIRED' | 'INVITATION_ONLY' | 'JOIN_CODE' | 'ADMIN_ASSIGNMENT' | 'RESTRICTED'
    status: text('status').default('ACTIVE').notNull(),
    lifecycleStatus: text('lifecycle_status').default('active').notNull(), // 'draft' | 'pending_approval' | 'scheduled' | 'published' | 'active' | 'enrollment_closed' | 'completed' | 'archived' | 'cancelled'
    approvalStatus: text('approval_status').default('APPROVED').notNull(), // 'DRAFT' | 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED'
    bannerTheme: text('banner_theme').default('slate').notNull(),
    description: text('description'),
    privacyConfig: jsonb('privacy_config')
      .default({
        discoverability: 'ENROLLED_ONLY',
        enrollmentVisibility: 'INSTRUCTORS_ONLY',
        studentRosterVisibility: 'CLASSMATES',
        contentVisibility: 'ENROLLED_ONLY',
        restrictJoinCode: false,
        requireApprovalForWaitlist: true,
      })
      .notNull(),
    notificationConfig: jsonb('notification_config')
      .default({
        onNewEnrollment: true,
        onEnrollmentRequest: true,
        onAssignmentSubmission: true,
        onLateSubmission: true,
        onMaterialCompletion: false,
        onAssessmentCompletion: true,
        onNewComment: true,
        onNewAnnouncement: true,
        inAppEnabled: true,
        emailEnabled: false,
      })
      .notNull(),
    createdById: uuid('created_by_id')
      .references(() => users.id, { onDelete: 'restrict' })
      .notNull(),
    scheduledAt: timestamp('scheduled_at', { withTimezone: true }),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('idx_classrooms_course').on(table.courseId),
    index('idx_classrooms_semester').on(table.semesterId),
    index('idx_classrooms_offering').on(table.courseOfferingId),
    index('idx_classrooms_period').on(table.academicPeriodId),
    index('idx_classrooms_lifecycle').on(table.lifecycleStatus),
    index('idx_classrooms_creator').on(table.createdById),
  ]
);

export const classroomInstructors = pgTable(
  'classroom_instructors',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    classroomId: uuid('classroom_id')
      .references(() => classrooms.id, { onDelete: 'cascade' })
      .notNull(),
    instructorId: uuid('instructor_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    isPrimary: boolean('is_primary').default(false).notNull(),
    role: text('role').default('PRIMARY_INSTRUCTOR').notNull(), // 'PRIMARY_INSTRUCTOR' | 'CO_INSTRUCTOR' | 'TEACHING_ASSISTANT' | 'GUEST_INSTRUCTOR'
    permissionScopes: jsonb('permission_scopes').default(['all']).notNull(),
    status: text('status').default('ACTIVE').notNull(), // 'ACTIVE' | 'INACTIVE'
    assignedAt: timestamp('assigned_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('uq_classroom_instructor').on(
      table.classroomId,
      table.instructorId
    ),
    index('idx_classroom_instructors_user').on(table.instructorId),
    index('idx_classroom_instructors_role').on(table.role),
  ]
);

export const classroomSchedules = pgTable(
  'classroom_schedules',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    classroomId: uuid('classroom_id')
      .references(() => classrooms.id, { onDelete: 'cascade' })
      .notNull(),
    dayOfWeek: integer('day_of_week').notNull(), // 1=Senin, 2=Selasa, 3=Rabu, 4=Kamis, 5=Jumat, 6=Sabtu, 7=Minggu
    startTime: text('start_time').notNull(), // '08:00'
    endTime: text('end_time').notNull(), // '10:30'
    effectiveStartDate: timestamp('effective_start_date', { withTimezone: true }),
    effectiveEndDate: timestamp('effective_end_date', { withTimezone: true }),
    scheduleType: text('schedule_type').default('THEORY').notNull(), // 'THEORY' | 'PRACTICAL' | 'LABORATORY' | 'ONLINE' | 'HYBRID'
    instructorId: uuid('instructor_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    buildingId: uuid('building_id').references(() => campusBuildings.id, {
      onDelete: 'set null',
    }),
    roomId: uuid('room_id').references(() => campusRooms.id, {
      onDelete: 'set null',
    }),
    meetingType: text('meeting_type').default('OFFLINE').notNull(), // 'OFFLINE' | 'ONLINE_ZOOM' | 'ONLINE_MEET' | 'HYBRID'
    onlineLink: text('online_link'),
    locationDescription: text('location_description'),
    exceptions: jsonb('exceptions').default([]).notNull(), // Array of exception objects { date: string, type: 'RESCHEDULED' | 'CANCELLED', reason: string, rescheduledStartTime?: string, rescheduledEndTime?: string }
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_schedules_classroom').on(table.classroomId),
    index('idx_schedules_day_time').on(table.dayOfWeek, table.startTime, table.endTime),
    index('idx_schedules_instructor').on(table.instructorId),
    index('idx_schedules_room').on(table.roomId),
  ]
);

export const classroomEnrollmentPolicies = pgTable(
  'classroom_enrollment_policies',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    classroomId: uuid('classroom_id')
      .references(() => classrooms.id, { onDelete: 'cascade' })
      .notNull()
      .unique(),
    enrollmentMode: text('enrollment_mode').default('AUTO').notNull(), // 'AUTO' | 'APPROVAL_REQUIRED' | 'INVITATION_ONLY' | 'JOIN_CODE' | 'ADMIN_ASSIGNMENT' | 'RESTRICTED'
    minParticipants: integer('min_participants').default(10).notNull(),
    maxParticipants: integer('max_participants').default(35).notNull(),
    enrollmentStartDate: timestamp('enrollment_start_date', { withTimezone: true }),
    enrollmentEndDate: timestamp('enrollment_end_date', { withTimezone: true }),
    allowedStudyPrograms: jsonb('allowed_study_programs').default([]).notNull(), // string[] e.g. ['Teknik Informatika']
    allowedCohorts: jsonb('allowed_cohorts').default([]).notNull(), // string[] e.g. ['2024', '2025']
    studentEligibilityRules: jsonb('student_eligibility_rules').default({}).notNull(),
    allowLateEnrollment: boolean('allow_late_enrollment').default(false).notNull(),
    waitingListEnabled: boolean('waiting_list_enabled').default(true).notNull(),
    maxWaitingList: integer('max_waiting_list').default(15).notNull(),
    joinCodeExpiresAt: timestamp('join_code_expires_at', { withTimezone: true }),
    joinCodeMaxUses: integer('join_code_max_uses').default(50).notNull(),
    joinCodeUsesCount: integer('join_code_uses_count').default(0).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('idx_enrollment_policies_classroom').on(table.classroomId)]
);

export const classroomJoinCodes = pgTable(
  'classroom_join_codes',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    classroomId: uuid('classroom_id')
      .references(() => classrooms.id, { onDelete: 'cascade' })
      .notNull(),
    code: text('code').notNull().unique(),
    isActive: boolean('is_active').default(true).notNull(),
    maxUses: integer('max_uses').default(100).notNull(),
    usesCount: integer('uses_count').default(0).notNull(),
    revokedAt: timestamp('revoked_at'),
    expiresAt: timestamp('expires_at'),
    createdById: uuid('created_by_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('idx_join_codes_classroom').on(table.classroomId),
    index('idx_join_codes_code').on(table.code),
  ]
);

export const classroomEnrollments = pgTable(
  'classroom_enrollments',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    classroomId: uuid('classroom_id')
      .references(() => classrooms.id, { onDelete: 'cascade' })
      .notNull(),
    studentId: uuid('student_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    status: text('status').default('active').notNull(), // 'pending' | 'active' | 'rejected' | 'withdrawn' | 'suspended' | 'waitlisted' | 'completed'
    joinCodeUsed: text('join_code_used'),
    enrollmentSource: text('enrollment_source').default('CATALOG').notNull(), // 'CATALOG' | 'JOIN_CODE' | 'INVITATION' | 'ADMIN_ASSIGNMENT' | 'AUTO_ELIGIBLE'
    approvedById: uuid('approved_by_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    rejectionReason: text('rejection_reason'),
    withdrawnAt: timestamp('withdrawn_at', { withTimezone: true }),
    lastActivityAt: timestamp('last_activity_at', { withTimezone: true }),
    statusHistory: jsonb('status_history').default([]).notNull(),
    enrolledAt: timestamp('enrolled_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('uq_classroom_student').on(table.classroomId, table.studentId),
    index('idx_enrollments_classroom').on(table.classroomId),
    index('idx_enrollments_student').on(table.studentId),
    index('idx_enrollments_status').on(table.status),
  ]
);

export const classroomWaitlists = pgTable(
  'classroom_waitlists',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    classroomId: uuid('classroom_id')
      .references(() => classrooms.id, { onDelete: 'cascade' })
      .notNull(),
    studentId: uuid('student_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    queueNumber: integer('queue_number').notNull(),
    status: text('status').default('WAITING').notNull(), // 'WAITING' | 'PROMOTED' | 'EXPIRED' | 'CANCELLED'
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('uq_waitlist_classroom_student').on(table.classroomId, table.studentId),
    index('idx_waitlists_classroom').on(table.classroomId),
    index('idx_waitlists_student').on(table.studentId),
  ]
);

export const classroomInvitations = pgTable(
  'classroom_invitations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    classroomId: uuid('classroom_id')
      .references(() => classrooms.id, { onDelete: 'cascade' })
      .notNull(),
    studentId: uuid('student_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    invitedById: uuid('invited_by_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    status: text('status').default('PENDING').notNull(), // 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'EXPIRED'
    invitationMessage: text('invitation_message'),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_invitations_classroom').on(table.classroomId),
    index('idx_invitations_student').on(table.studentId),
  ]
);

export const classroomApprovals = pgTable(
  'classroom_approvals',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    classroomId: uuid('classroom_id')
      .references(() => classrooms.id, { onDelete: 'cascade' })
      .notNull(),
    requestedById: uuid('requested_by_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    status: text('status').default('PENDING').notNull(), // 'PENDING' | 'APPROVED' | 'REJECTED'
    reviewerId: uuid('reviewer_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    reviewNotes: text('review_notes'),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('idx_approvals_classroom').on(table.classroomId)]
);

export const classroomEvents = pgTable(
  'classroom_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    classroomId: uuid('classroom_id')
      .references(() => classrooms.id, { onDelete: 'cascade' })
      .notNull(),
    actorId: uuid('actor_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    eventType: text('event_type').notNull(), // 'CLASSROOM_CREATED' | 'CLASSROOM_PUBLISHED' | 'SUBMITTED_FOR_APPROVAL' | 'APPROVED' | 'ENROLLMENT_OPENED' | 'ENROLLMENT_CLOSED' | 'STUDENT_ENROLLED' | 'ENROLLMENT_APPROVED' | 'ENROLLMENT_REJECTED' | 'STUDENT_WITHDRAWN' | 'STUDENT_WAITLISTED' | 'CLASSROOM_COMPLETED' | 'CLASSROOM_ARCHIVED'
    metadata: jsonb('metadata').default({}).notNull(),
    ipAddress: text('ip_address'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('idx_classroom_events_classroom').on(table.classroomId)]
);

// 6. Classroom Topics (Modules), Advanced Learning Materials, Attachments, Videos, Progress & Revisions
export const classroomTopics = pgTable(
  'classroom_topics',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    classroomId: uuid('classroom_id')
      .references(() => classrooms.id, { onDelete: 'cascade' })
      .notNull(),
    title: text('title').notNull(),
    description: text('description'),
    sortOrder: integer('sort_order').default(1).notNull(),
    status: text('status').default('PUBLISHED').notNull(), // 'PUBLISHED' | 'DRAFT' | 'ARCHIVED'
    createdBy: uuid('created_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    updatedBy: uuid('updated_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('idx_topics_classroom').on(table.classroomId)]
);

export const classroomModules = classroomTopics;

export const storedFiles = pgTable(
  'stored_files',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    bucket: text('bucket').notNull(),
    objectKey: text('object_key').notNull().unique(),
    originalName: text('original_name').notNull(),
    mimeType: text('mime_type').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    contentBase64: text('content_base64'),
    uploadedById: uuid('uploaded_by_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    classroomId: uuid('classroom_id').references(() => classrooms.id, {
      onDelete: 'cascade',
    }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [index('idx_stored_files_classroom').on(table.classroomId)]
);

export const learningMaterials = pgTable(
  'learning_materials',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    classroomId: uuid('classroom_id')
      .references(() => classrooms.id, { onDelete: 'cascade' })
      .notNull(),
    topicId: uuid('topic_id').references(() => classroomTopics.id, {
      onDelete: 'set null',
    }),
    authorId: uuid('author_id')
      .references(() => users.id, { onDelete: 'restrict' })
      .notNull(),
    createdBy: uuid('created_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    meetingNumber: integer('meeting_number').default(1).notNull(),
    title: text('title').notNull(),
    slug: text('slug').default('').notNull(),
    subtitle: text('subtitle').default('').notNull(),
    description: text('description').default('').notNull(),
    content: text('content').default('').notNull(),
    contentJson: jsonb('content_json')
      .default({ type: 'doc', content: [] })
      .notNull(),
    contentHtml: text('content_html'),
    thumbnailKey: text('thumbnail_key'),
    estimatedDuration: integer('estimated_duration').default(45).notNull(),
    isRequired: boolean('is_required').default(true).notNull(),
    sequenceOrder: integer('sequence_order').default(1).notNull(),
    completionRule: text('completion_rule').default('VIEW_AND_SCROLL').notNull(),
    minCompletionPercent: integer('min_completion_percent').default(80).notNull(),
    enableComments: boolean('enable_comments').default(true).notNull(),
    enableDownloads: boolean('enable_downloads').default(true).notNull(),
    allowAccessAfterPublish: boolean('allow_access_after_publish')
      .default(true)
      .notNull(),
    prerequisiteMaterialId: uuid('prerequisite_material_id'),
    status: text('status').default('PUBLISHED').notNull(), // 'DRAFT' | 'PUBLISHED' | 'SCHEDULED' | 'ARCHIVED'
    isPublished: boolean('is_published').default(true).notNull(),
    scheduledAt: timestamp('scheduled_at'),
    publishedAt: timestamp('published_at').defaultNow(),
    availabilityStartAt: timestamp('availability_start_at'),
    availabilityEndAt: timestamp('availability_end_at'),
    visibility: text('visibility').default('ENROLLED_ONLY').notNull(),
    externalUrl: text('external_url'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('idx_materials_classroom').on(table.classroomId),
    index('idx_materials_topic').on(table.topicId),
    index('idx_materials_status').on(table.status),
  ]
);

export const materialAttachments = pgTable(
  'material_attachments',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    materialId: uuid('material_id')
      .references(() => learningMaterials.id, { onDelete: 'cascade' })
      .notNull(),
    fileId: uuid('file_id').references(() => storedFiles.id, {
      onDelete: 'set null',
    }),
    originalName: text('original_name').default('').notNull(),
    objectKey: text('object_key').default('').notNull(),
    mimeType: text('mime_type').default('application/octet-stream').notNull(),
    fileExtension: text('file_extension').default('').notNull(),
    fileSize: integer('file_size').default(0).notNull(),
    checksum: text('checksum').default('').notNull(),
    previewKey: text('preview_key'),
    description: text('description').default('').notNull(),
    processingStatus: text('processing_status').default('READY').notNull(),
    sortOrder: integer('sort_order').default(1).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('idx_material_attachments_material').on(table.materialId),
    index('idx_material_attachments_object_key').on(table.objectKey),
  ]
);

export const materialVideos = pgTable(
  'material_videos',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    materialId: uuid('material_id')
      .references(() => learningMaterials.id, { onDelete: 'cascade' })
      .notNull(),
    title: text('title').default('').notNull(),
    sourceType: text('source_type').notNull(), // 'UPLOAD' | 'YOUTUBE' | 'VIMEO'
    videoUrl: text('video_url'),
    videoId: text('video_id'),
    objectKey: text('object_key'),
    thumbnailKey: text('thumbnail_key'),
    mimeType: text('mime_type'),
    fileSize: integer('file_size').default(0).notNull(),
    duration: integer('duration').default(0).notNull(),
    sortOrder: integer('sort_order').default(1).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [index('idx_material_videos_material').on(table.materialId)]
);

export const materialProgress = pgTable(
  'material_progress',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    materialId: uuid('material_id')
      .references(() => learningMaterials.id, { onDelete: 'cascade' })
      .notNull(),
    studentId: uuid('student_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    classroomId: uuid('classroom_id').references(() => classrooms.id, {
      onDelete: 'cascade',
    }),
    progressPercent: integer('progress_percent').default(0).notNull(),
    lastPosition: jsonb('last_position').default({}).notNull(),
    status: text('status').default('NOT_STARTED').notNull(), // 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED'
    completedAt: timestamp('completed_at'),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('uq_material_student_progress').on(
      table.materialId,
      table.studentId
    ),
    index('idx_material_progress_material').on(table.materialId),
    index('idx_material_progress_student').on(table.studentId),
    index('idx_material_progress_classroom').on(table.classroomId),
  ]
);

export const classroomMaterialBookmarks = pgTable(
  'classroom_material_bookmarks',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    studentId: uuid('student_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    materialId: uuid('material_id')
      .references(() => learningMaterials.id, { onDelete: 'cascade' })
      .notNull(),
    classroomId: uuid('classroom_id')
      .references(() => classrooms.id, { onDelete: 'cascade' })
      .notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('uq_material_bookmark').on(table.studentId, table.materialId),
    index('idx_material_bookmarks_classroom').on(table.classroomId),
    index('idx_material_bookmarks_student').on(table.studentId),
  ]
);

export const classroomMaterialNotes = pgTable(
  'classroom_material_notes',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    studentId: uuid('student_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    materialId: uuid('material_id')
      .references(() => learningMaterials.id, { onDelete: 'cascade' })
      .notNull(),
    classroomId: uuid('classroom_id')
      .references(() => classrooms.id, { onDelete: 'cascade' })
      .notNull(),
    content: text('content').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('uq_material_notes').on(table.studentId, table.materialId),
    index('idx_material_notes_classroom').on(table.classroomId),
    index('idx_material_notes_student').on(table.studentId),
  ]
);

export const classroomMaterialViews = pgTable(
  'classroom_material_views',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    studentId: uuid('student_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    materialId: uuid('material_id')
      .references(() => learningMaterials.id, { onDelete: 'cascade' })
      .notNull(),
    classroomId: uuid('classroom_id')
      .references(() => classrooms.id, { onDelete: 'cascade' })
      .notNull(),
    firstOpenedAt: timestamp('first_opened_at', { withTimezone: true }).defaultNow().notNull(),
    lastOpenedAt: timestamp('last_opened_at', { withTimezone: true }).defaultNow().notNull(),
    viewCount: integer('view_count').default(1).notNull(),
  },
  (table) => [
    uniqueIndex('uq_material_views').on(table.studentId, table.materialId),
    index('idx_material_views_classroom').on(table.classroomId),
    index('idx_material_views_student').on(table.studentId),
  ]
);

export const classroomAuditLogs = pgTable(
  'classroom_audit_logs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    classroomId: uuid('classroom_id')
      .references(() => classrooms.id, { onDelete: 'cascade' })
      .notNull(),
    actorId: uuid('actor_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    actorRole: text('actor_role').default('INSTRUCTOR').notNull(),
    resourceType: text('resource_type').notNull(), // 'MODULE' | 'MATERIAL' | 'ASSIGNMENT' | 'ASSESSMENT' | 'CLASSROOM'
    resourceId: text('resource_id'),
    resourceTitle: text('resource_title').notNull(),
    action: text('action').notNull(), // 'CREATED' | 'UPDATED' | 'DELETED' | 'PUBLISHED' | 'UNPUBLISHED' | 'ARCHIVED' | 'RESTORED' | 'REORDERED' | 'DUPLICATED'
    beforeValue: jsonb('before_value'),
    afterValue: jsonb('after_value'),
    changeSummary: text('change_summary').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_classroom_audit_classroom').on(table.classroomId),
    index('idx_classroom_audit_created').on(table.createdAt),
    index('idx_classroom_audit_resource').on(table.resourceType),
    index('idx_classroom_audit_action').on(table.action),
  ]
);

export const classroomResourceVersions = pgTable(
  'classroom_resource_versions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    classroomId: uuid('classroom_id')
      .references(() => classrooms.id, { onDelete: 'cascade' })
      .notNull(),
    resourceType: text('resource_type').notNull(), // 'MATERIAL' | 'ASSIGNMENT' | 'ASSESSMENT'
    resourceId: uuid('resource_id').notNull(),
    versionNumber: integer('version_number').default(1).notNull(),
    title: text('title').notNull(),
    contentJson: jsonb('content_json'),
    contentHtml: text('content_html'),
    createdById: uuid('created_by_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    changeNotes: text('change_notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_resource_versions_resource').on(table.resourceId),
    index('idx_resource_versions_classroom').on(table.classroomId),
  ]
);

export const materialRevisions = pgTable(
  'material_revisions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    materialId: uuid('material_id')
      .references(() => learningMaterials.id, { onDelete: 'cascade' })
      .notNull(),
    revisionNumber: integer('revision_number').default(1).notNull(),
    title: text('title').notNull(),
    contentJson: jsonb('content_json').notNull(),
    status: text('status').notNull(),
    editedBy: uuid('edited_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [index('idx_material_revisions_material').on(table.materialId)]
);

// 7. Announcements & Comments (Stream & Material Discussions)
export const announcements = pgTable(
  'announcements',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    classroomId: uuid('classroom_id')
      .references(() => classrooms.id, { onDelete: 'cascade' })
      .notNull(),
    authorId: uuid('author_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    title: text('title').notNull(),
    content: text('content').notNull(),
    isPinned: boolean('is_pinned').default(false).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [index('idx_announcements_classroom').on(table.classroomId)]
);

export const comments = pgTable(
  'comments',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    classroomId: uuid('classroom_id')
      .references(() => classrooms.id, { onDelete: 'cascade' })
      .notNull(),
    announcementId: uuid('announcement_id').references(() => announcements.id, {
      onDelete: 'cascade',
    }),
    materialId: uuid('material_id').references(() => learningMaterials.id, {
      onDelete: 'cascade',
    }),
    assignmentId: uuid('assignment_id'),
    authorId: uuid('author_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    content: text('content').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('idx_comments_announcement').on(table.announcementId),
    index('idx_comments_material').on(table.materialId),
    index('idx_comments_classroom').on(table.classroomId),
  ]
);

// 8. Advanced Assignments, Rubrics, Groups, Submissions, Versions, Links, Grades, Comments & Reminders
export const assignments = pgTable(
  'assignments',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    classroomId: uuid('classroom_id')
      .references(() => classrooms.id, { onDelete: 'cascade' })
      .notNull(),
    topicId: uuid('topic_id').references(() => classroomTopics.id, {
      onDelete: 'set null',
    }),
    authorId: uuid('author_id')
      .references(() => users.id, { onDelete: 'restrict' })
      .notNull(),
    meetingNumber: integer('meeting_number').default(1).notNull(),
    sequenceOrder: integer('sequence_order').default(1).notNull(),
    title: text('title').notNull(),
    subtitle: text('subtitle').default('').notNull(),
    shortDescription: text('short_description').default('').notNull(),
    assignmentType: text('assignment_type').default('Individual').notNull(), // 'Individual' | 'Group' | 'Practical' | 'Project' | 'Report' | 'Essay' | 'Portfolio'
    learningObjectives: text('learning_objectives').default('').notNull(),
    instructions: text('instructions').notNull(),
    instructionsJson: jsonb('instructions_json')
      .default({ type: 'doc', content: [] })
      .notNull(),
    instructionsHtml: text('instructions_html'),
    maxPoints: integer('max_points').default(100).notNull(),
    estimatedCompletionMinutes: integer('estimated_completion_minutes')
      .default(120)
      .notNull(),
    coverImageKey: text('cover_image_key'),
    submissionConfig: jsonb('submission_config')
      .default({
        submissionMethods: ['FILE_UPLOAD', 'TEXT_RESPONSE', 'EXTERNAL_URL'],
        allowFileUpload: true,
        allowTextResponse: true,
        allowExternalLinks: true,
        allowedExtensions: [
          'pdf',
          'doc',
          'docx',
          'xls',
          'xlsx',
          'ppt',
          'pptx',
          'jpg',
          'jpeg',
          'png',
          'webp',
        ],
        maxFileSizeMb: 25,
        maxFiles: 5,
        maxLinks: 5,
        requireAttachment: false,
        requireLink: false,
        allowMultipleVersions: true,
        maxRevisions: 5,
        allowLateSubmission: true,
        gracePeriodMinutes: 15,
        allowAfterDeadline: true,
        allowEditBeforeDeadline: true,
        allowReturnForRevision: true,
        gradingMethod: 'COMBINED',
      })
      .notNull(),
    status: text('status').default('PUBLISHED').notNull(), // 'DRAFT' | 'SCHEDULED' | 'PUBLISHED' | 'ARCHIVED'
    publishedAt: timestamp('published_at', { withTimezone: true }).defaultNow(),
    scheduledAt: timestamp('scheduled_at', { withTimezone: true }),
    availableFrom: timestamp('available_from', { withTimezone: true }),
    availableUntil: timestamp('available_until', { withTimezone: true }),
    dueAt: timestamp('due_at', { withTimezone: true }).notNull(),
    timezone: text('timezone').default('Asia/Jakarta').notNull(),
    lateSubmissionPolicy: text('late_submission_policy')
      .default('ACCEPT_WITH_LATE_FLAG')
      .notNull(),
    gradePublicationPolicy: text('grade_publication_policy')
      .default('MANUAL_PUBLISH')
      .notNull(),
    allowLateSubmission: boolean('allow_late_submission').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_assignments_classroom').on(table.classroomId),
    index('idx_assignments_topic').on(table.topicId),
    index('idx_assignments_status').on(table.status),
  ]
);

export const assignmentAttachments = pgTable(
  'assignment_attachments',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    assignmentId: uuid('assignment_id')
      .references(() => assignments.id, { onDelete: 'cascade' })
      .notNull(),
    fileId: uuid('file_id').references(() => storedFiles.id, {
      onDelete: 'set null',
    }),
    originalName: text('original_name').default('').notNull(),
    objectKey: text('object_key').default('').notNull(),
    mimeType: text('mime_type').default('application/octet-stream').notNull(),
    fileExtension: text('file_extension').default('').notNull(),
    fileSize: integer('file_size').default(0).notNull(),
    checksum: text('checksum').default('').notNull(),
    description: text('description').default('').notNull(),
    sortOrder: integer('sort_order').default(1).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_assignment_attachments_assignment').on(table.assignmentId),
    index('idx_assignment_attachments_key').on(table.objectKey),
  ]
);

export const assignmentRubrics = pgTable(
  'assignment_rubrics',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    assignmentId: uuid('assignment_id')
      .references(() => assignments.id, { onDelete: 'cascade' })
      .notNull()
      .unique(),
    title: text('title').notNull(),
    description: text('description').default('').notNull(),
    totalWeight: integer('total_weight').default(100).notNull(),
    createdById: uuid('created_by_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('idx_assignment_rubrics_assignment').on(table.assignmentId)]
);

export const assignmentRubricCriteria = pgTable(
  'assignment_rubric_criteria',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    rubricId: uuid('rubric_id')
      .references(() => assignmentRubrics.id, { onDelete: 'cascade' })
      .notNull(),
    assignmentId: uuid('assignment_id')
      .references(() => assignments.id, { onDelete: 'cascade' })
      .notNull(),
    criterionName: text('criterion_name').notNull(),
    description: text('description').default('').notNull(),
    maxScore: integer('max_score').default(100).notNull(),
    weight: integer('weight').default(25).notNull(),
    performanceLevels: jsonb('performance_levels').default([]).notNull(),
    sortOrder: integer('sort_order').default(1).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_rubric_criteria_rubric').on(table.rubricId),
    index('idx_rubric_criteria_assignment').on(table.assignmentId),
  ]
);

export const assignmentGroups = pgTable(
  'assignment_groups',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    assignmentId: uuid('assignment_id')
      .references(() => assignments.id, { onDelete: 'cascade' })
      .notNull(),
    classroomId: uuid('classroom_id')
      .references(() => classrooms.id, { onDelete: 'cascade' })
      .notNull(),
    name: text('name').notNull(),
    createdById: uuid('created_by_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('idx_assignment_groups_assignment').on(table.assignmentId)]
);

export const assignmentGroupMembers = pgTable(
  'assignment_group_members',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    groupId: uuid('group_id')
      .references(() => assignmentGroups.id, { onDelete: 'cascade' })
      .notNull(),
    studentId: uuid('student_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    role: text('role').default('MEMBER').notNull(),
    joinedAt: timestamp('joined_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('uq_assignment_group_member').on(table.groupId, table.studentId),
    index('idx_assignment_group_members_student').on(table.studentId),
  ]
);

export const assignmentSubmissions = pgTable(
  'assignment_submissions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    assignmentId: uuid('assignment_id')
      .references(() => assignments.id, { onDelete: 'cascade' })
      .notNull(),
    studentId: uuid('student_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    groupId: uuid('group_id').references(() => assignmentGroups.id, {
      onDelete: 'set null',
    }),
    submissionText: text('submission_text').default('').notNull(),
    submissionJson: jsonb('submission_json')
      .default({ type: 'doc', content: [] })
      .notNull(),
    submissionHtml: text('submission_html'),
    repositoryUrl: text('repository_url'),
    status: text('status').default('submitted').notNull(), // 'draft' | 'submitted' | 'late' | 'returned' | 'resubmitted' | 'graded' | 'excused'
    isLate: boolean('is_late').default(false).notNull(),
    lateMinutes: integer('late_minutes').default(0).notNull(),
    currentVersion: integer('current_version').default(1).notNull(),
    idempotencyKey: text('idempotency_key'),
    score: numeric('score', { precision: 5, scale: 2 }),
    publishedScore: numeric('published_score', { precision: 5, scale: 2 }),
    isGradePublished: boolean('is_grade_published').default(false).notNull(),
    gradingStatus: text('grading_status').default('pending').notNull(), // 'pending' | 'draft' | 'graded' | 'returned' | 'excused'
    feedback: text('feedback'),
    privateNotes: text('private_notes'),
    revisionInstructions: text('revision_instructions'),
    gradedById: uuid('graded_by_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    submittedAt: timestamp('submitted_at', { withTimezone: true }).defaultNow().notNull(),
    gradedAt: timestamp('graded_at', { withTimezone: true }),
    returnedAt: timestamp('returned_at', { withTimezone: true }),
    lastActivityAt: timestamp('last_activity_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('uq_assignment_student_submission').on(
      table.assignmentId,
      table.studentId
    ),
    index('idx_submissions_assignment').on(table.assignmentId),
    index('idx_submissions_student').on(table.studentId),
    index('idx_submissions_status').on(table.status),
  ]
);

export const submissionVersions = pgTable(
  'submission_versions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    submissionId: uuid('submission_id')
      .references(() => assignmentSubmissions.id, { onDelete: 'cascade' })
      .notNull(),
    assignmentId: uuid('assignment_id')
      .references(() => assignments.id, { onDelete: 'cascade' })
      .notNull(),
    studentId: uuid('student_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    versionNumber: integer('version_number').default(1).notNull(),
    submissionText: text('submission_text').default('').notNull(),
    submissionJson: jsonb('submission_json')
      .default({ type: 'doc', content: [] })
      .notNull(),
    submissionHtml: text('submission_html'),
    linksSnapshot: jsonb('links_snapshot').default([]).notNull(),
    attachmentsSnapshot: jsonb('attachments_snapshot').default([]).notNull(),
    isLate: boolean('is_late').default(false).notNull(),
    lateMinutes: integer('late_minutes').default(0).notNull(),
    idempotencyKey: text('idempotency_key'),
    submittedAt: timestamp('submitted_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_submission_versions_sub').on(table.submissionId),
    index('idx_submission_versions_assignment').on(table.assignmentId),
  ]
);

export const submissionRevisions = pgTable(
  'submission_revisions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    submissionId: uuid('submission_id')
      .references(() => assignmentSubmissions.id, { onDelete: 'cascade' })
      .notNull(),
    revisionNumber: integer('revision_number').default(1).notNull(),
    submissionText: text('submission_text').notNull(),
    repositoryUrl: text('repository_url'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('idx_submission_revisions_sub').on(table.submissionId)]
);

export const submissionAttachments = pgTable(
  'submission_attachments',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    submissionId: uuid('submission_id')
      .references(() => assignmentSubmissions.id, { onDelete: 'cascade' })
      .notNull(),
    versionId: uuid('version_id').references(() => submissionVersions.id, {
      onDelete: 'set null',
    }),
    fileId: uuid('file_id').references(() => storedFiles.id, {
      onDelete: 'set null',
    }),
    originalName: text('original_name').default('').notNull(),
    objectKey: text('object_key').default('').notNull(),
    mimeType: text('mime_type').default('application/octet-stream').notNull(),
    fileExtension: text('file_extension').default('').notNull(),
    fileSize: integer('file_size').default(0).notNull(),
    checksum: text('checksum').default('').notNull(),
    description: text('description').default('').notNull(),
    uploadedById: uuid('uploaded_by_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_submission_attachments_sub').on(table.submissionId),
    index('idx_submission_attachments_key').on(table.objectKey),
  ]
);

export const submissionLinks = pgTable(
  'submission_links',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    submissionId: uuid('submission_id')
      .references(() => assignmentSubmissions.id, { onDelete: 'cascade' })
      .notNull(),
    versionId: uuid('version_id').references(() => submissionVersions.id, {
      onDelete: 'set null',
    }),
    url: text('url').notNull(),
    title: text('title').default('').notNull(),
    description: text('description').default('').notNull(),
    linkCategory: text('link_category').default('HTTPS').notNull(), // 'GITHUB' | 'GOOGLE_DRIVE' | 'ONEDRIVE' | 'FIGMA' | 'VIDEO_DEMO' | 'WEBSITE'
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('idx_submission_links_sub').on(table.submissionId)]
);

export const submissionComments = pgTable(
  'submission_comments',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    submissionId: uuid('submission_id')
      .references(() => assignmentSubmissions.id, { onDelete: 'cascade' })
      .notNull(),
    assignmentId: uuid('assignment_id')
      .references(() => assignments.id, { onDelete: 'cascade' })
      .notNull(),
    authorId: uuid('author_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    parentCommentId: uuid('parent_comment_id'),
    content: text('content').notNull(),
    visibility: text('visibility').default('STUDENT_VISIBLE').notNull(), // 'STUDENT_VISIBLE' | 'INSTRUCTOR_PRIVATE'
    attachmentObjectKey: text('attachment_object_key'),
    attachmentName: text('attachment_name'),
    isRead: boolean('is_read').default(false).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_submission_comments_sub').on(table.submissionId),
    index('idx_submission_comments_assignment').on(table.assignmentId),
  ]
);

export const submissionGrades = pgTable(
  'submission_grades',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    submissionId: uuid('submission_id')
      .references(() => assignmentSubmissions.id, { onDelete: 'cascade' })
      .notNull()
      .unique(),
    assignmentId: uuid('assignment_id')
      .references(() => assignments.id, { onDelete: 'cascade' })
      .notNull(),
    studentId: uuid('student_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    gradedById: uuid('graded_by_id')
      .references(() => users.id, { onDelete: 'restrict' })
      .notNull(),
    gradingMethod: text('grading_method').default('DIRECT').notNull(), // 'DIRECT' | 'RUBRIC' | 'COMBINED'
    rawScore: numeric('raw_score', { precision: 5, scale: 2 }).default('0').notNull(),
    finalScore: numeric('final_score', { precision: 5, scale: 2 }).default('0').notNull(),
    previousScore: numeric('previous_score', { precision: 5, scale: 2 }),
    maxScore: integer('max_score').default(100).notNull(),
    generalFeedback: text('general_feedback').default('').notNull(),
    privateComment: text('private_comment').default('').notNull(),
    revisionInstructions: text('revision_instructions').default('').notNull(),
    feedbackAttachmentKey: text('feedback_attachment_key'),
    feedbackAttachmentName: text('feedback_attachment_name'),
    isPublished: boolean('is_published').default(false).notNull(),
    modificationReason: text('modification_reason'),
    auditHistory: jsonb('audit_history').default([]).notNull(),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_submission_grades_sub').on(table.submissionId),
    index('idx_submission_grades_assignment').on(table.assignmentId),
    index('idx_submission_grades_student').on(table.studentId),
  ]
);

export const submissionRubricScores = pgTable(
  'submission_rubric_scores',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    gradeId: uuid('grade_id')
      .references(() => submissionGrades.id, { onDelete: 'cascade' })
      .notNull(),
    submissionId: uuid('submission_id')
      .references(() => assignmentSubmissions.id, { onDelete: 'cascade' })
      .notNull(),
    criterionId: uuid('criterion_id')
      .references(() => assignmentRubricCriteria.id, { onDelete: 'cascade' })
      .notNull(),
    score: numeric('score', { precision: 5, scale: 2 }).default('0').notNull(),
    maxScore: integer('max_score').default(100).notNull(),
    weight: integer('weight').default(25).notNull(),
    weightedScore: numeric('weighted_score', { precision: 5, scale: 2 })
      .default('0')
      .notNull(),
    feedback: text('feedback').default('').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_rubric_scores_grade').on(table.gradeId),
    index('idx_rubric_scores_submission').on(table.submissionId),
  ]
);

export const submissionEvents = pgTable(
  'submission_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    submissionId: uuid('submission_id').references(() => assignmentSubmissions.id, {
      onDelete: 'cascade',
    }),
    assignmentId: uuid('assignment_id')
      .references(() => assignments.id, { onDelete: 'cascade' })
      .notNull(),
    actorId: uuid('actor_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    eventType: text('event_type').notNull(),
    metadata: jsonb('metadata').default({}).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_submission_events_sub').on(table.submissionId),
    index('idx_submission_events_assignment').on(table.assignmentId),
  ]
);

export const assignmentReminders = pgTable(
  'assignment_reminders',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    assignmentId: uuid('assignment_id')
      .references(() => assignments.id, { onDelete: 'cascade' })
      .notNull(),
    studentId: uuid('student_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    sentById: uuid('sent_by_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    message: text('message').notNull(),
    channel: text('channel').default('IN_APP').notNull(),
    sentAt: timestamp('sent_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_assignment_reminders_assignment').on(table.assignmentId),
    index('idx_assignment_reminders_student').on(table.studentId),
  ]
);

// 9. Quizzes, Questions, Options, Attempts & Answers
export const quizzes = pgTable(
  'quizzes',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    classroomId: uuid('classroom_id')
      .references(() => classrooms.id, { onDelete: 'cascade' })
      .notNull(),
    topicId: uuid('topic_id').references(() => classroomTopics.id, {
      onDelete: 'set null',
    }),
    authorId: uuid('author_id')
      .references(() => users.id, { onDelete: 'restrict' })
      .notNull(),
    title: text('title').notNull(),
    description: text('description').notNull(),
    durationMinutes: integer('duration_minutes').default(45).notNull(),
    passingScore: integer('passing_score').default(70).notNull(),
    maxAttempts: integer('max_attempts').default(2).notNull(),
    dueAt: timestamp('due_at').notNull(),
    isPublished: boolean('is_published').default(true).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [index('idx_quizzes_classroom').on(table.classroomId)]
);

export const quizQuestions = pgTable(
  'quiz_questions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    quizId: uuid('quiz_id')
      .references(() => quizzes.id, { onDelete: 'cascade' })
      .notNull(),
    questionText: text('question_text').notNull(),
    points: integer('points').default(20).notNull(),
    sortOrder: integer('sort_order').default(1).notNull(),
    explanation: text('explanation'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [index('idx_quiz_questions_quiz').on(table.quizId)]
);

export const quizOptions = pgTable(
  'quiz_options',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    questionId: uuid('question_id')
      .references(() => quizQuestions.id, { onDelete: 'cascade' })
      .notNull(),
    optionLabel: text('option_label').notNull(),
    optionText: text('option_text').notNull(),
    isCorrect: boolean('is_correct').default(false).notNull(),
    sortOrder: integer('sort_order').default(1).notNull(),
  },
  (table) => [index('idx_quiz_options_question').on(table.questionId)]
);

export const quizAttempts = pgTable(
  'quiz_attempts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    quizId: uuid('quiz_id')
      .references(() => quizzes.id, { onDelete: 'cascade' })
      .notNull(),
    studentId: uuid('student_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    attemptNumber: integer('attempt_number').default(1).notNull(),
    status: text('status').default('COMPLETED').notNull(),
    totalScore: numeric('total_score', { precision: 5, scale: 2 }).default('0').notNull(),
    maxScore: integer('max_score').default(100).notNull(),
    startedAt: timestamp('started_at').defaultNow().notNull(),
    submittedAt: timestamp('submitted_at').defaultNow(),
  },
  (table) => [
    index('idx_quiz_attempts_quiz').on(table.quizId),
    index('idx_quiz_attempts_student').on(table.studentId),
  ]
);

export const quizAnswers = pgTable(
  'quiz_answers',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    attemptId: uuid('attempt_id')
      .references(() => quizAttempts.id, { onDelete: 'cascade' })
      .notNull(),
    questionId: uuid('question_id')
      .references(() => quizQuestions.id, { onDelete: 'cascade' })
      .notNull(),
    selectedOptionId: uuid('selected_option_id')
      .references(() => quizOptions.id, { onDelete: 'cascade' })
      .notNull(),
    isCorrect: boolean('is_correct').default(false).notNull(),
    pointsAwarded: integer('points_awarded').default(0).notNull(),
  },
  (table) => [index('idx_quiz_answers_attempt').on(table.attemptId)]
);

// 10. Grade Categories, Grade Items, Grade Records (Gradebook)
export const gradeCategories = pgTable(
  'grade_categories',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    classroomId: uuid('classroom_id')
      .references(() => classrooms.id, { onDelete: 'cascade' })
      .notNull(),
    name: text('name').notNull(),
    weightPercent: integer('weight_percent').default(50).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [index('idx_grade_categories_classroom').on(table.classroomId)]
);

export const gradeItems = pgTable(
  'grade_items',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    classroomId: uuid('classroom_id')
      .references(() => classrooms.id, { onDelete: 'cascade' })
      .notNull(),
    categoryId: uuid('category_id').references(() => gradeCategories.id, {
      onDelete: 'set null',
    }),
    sourceType: text('source_type').notNull(),
    sourceId: uuid('source_id'),
    title: text('title').notNull(),
    maxScore: integer('max_score').default(100).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [index('idx_grade_items_classroom').on(table.classroomId)]
);

export const gradeRecords = pgTable(
  'grade_records',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    gradeItemId: uuid('grade_item_id')
      .references(() => gradeItems.id, { onDelete: 'cascade' })
      .notNull(),
    classroomId: uuid('classroom_id')
      .references(() => classrooms.id, { onDelete: 'cascade' })
      .notNull(),
    studentId: uuid('student_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    score: numeric('score', { precision: 5, scale: 2 }).notNull(),
    maxScore: integer('max_score').default(100).notNull(),
    remarks: text('remarks'),
    gradedById: uuid('graded_by_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('uq_grade_item_student').on(table.gradeItemId, table.studentId),
    index('idx_grade_records_classroom').on(table.classroomId),
    index('idx_grade_records_student').on(table.studentId),
  ]
);

// 11. User Sessions (Hashed Server-Side Database Sessions)
export const userSessions = pgTable(
  'user_sessions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    tokenHash: text('token_hash').notNull().unique(),
    csrfToken: text('csrf_token').notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    isRevoked: boolean('is_revoked').default(false).notNull(),
    expiresAt: timestamp('expires_at').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('idx_user_sessions_token_hash').on(table.tokenHash),
    index('idx_user_sessions_user').on(table.userId),
  ]
);

// 11b. Impersonation Sessions (Account Switching by Superadmin)
export const impersonationSessions = pgTable(
  'impersonation_sessions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    sessionId: uuid('session_id')
      .references(() => userSessions.id, { onDelete: 'cascade' })
      .notNull(),
    originalUserId: uuid('original_user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    impersonatedUserId: uuid('impersonated_user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    originalRole: text('original_role').notNull(),
    impersonatedRole: text('impersonated_role').notNull(),
    reason: text('reason'),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    isActive: boolean('is_active').default(true).notNull(),
    startedAt: timestamp('started_at').defaultNow().notNull(),
    expiresAt: timestamp('expires_at').notNull(),
    endedAt: timestamp('ended_at'),
    endReason: text('end_reason'),
  },
  (table) => [
    index('idx_impersonation_session_id').on(table.sessionId),
    index('idx_impersonation_original_user').on(table.originalUserId),
    index('idx_impersonation_target_user').on(table.impersonatedUserId),
  ]
);

// 12. Notifications & Audit Logs
export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    title: text('title').notNull(),
    message: text('message').notNull(),
    type: text('type').default('INFO').notNull(),
    linkUrl: text('link_url'),
    isRead: boolean('is_read').default(false).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [index('idx_notifications_user').on(table.userId)]
);

export const auditLogs = pgTable(
  'audit_logs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    actorId: uuid('actor_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    action: text('action').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id'),
    metadata: jsonb('metadata').default({}).notNull(),
    ipAddress: text('ip_address'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('idx_audit_logs_actor').on(table.actorId),
    index('idx_audit_logs_created').on(table.createdAt),
  ]
);

// 13. Advanced Assessment & Examination Management Engine (20 Tables)
export const assessments = pgTable(
  'assessments',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    classroomId: uuid('classroom_id')
      .references(() => classrooms.id, { onDelete: 'cascade' })
      .notNull(),
    topicId: uuid('topic_id').references(() => classroomTopics.id, {
      onDelete: 'set null',
    }),
    authorId: uuid('author_id')
      .references(() => users.id, { onDelete: 'restrict' })
      .notNull(),
    title: text('title').notNull(),
    description: text('description').default('').notNull(),
    category: text('category').default('QUIZ').notNull(), // 'QUIZ' | 'MIDTERM' | 'FINAL_EXAM' | 'PRACTICAL_TEST' | 'DIAGNOSTIC' | 'REMEDIAL'
    assessmentMode: text('assessment_mode').default('OBJECTIVE').notNull(), // 'OBJECTIVE' | 'ESSAY' | 'HYBRID'
    instructions: text('instructions').default('').notNull(),
    instructionsJson: jsonb('instructions_json')
      .default({ type: 'doc', content: [] })
      .notNull(),
    instructionsHtml: text('instructions_html'),
    maxScore: integer('max_score').default(100).notNull(),
    passingGrade: integer('passing_grade').default(70).notNull(),
    estimatedDurationMinutes: integer('estimated_duration_minutes')
      .default(60)
      .notNull(),
    durationMinutes: integer('duration_minutes').default(60).notNull(),
    maxAttempts: integer('max_attempts').default(1).notNull(),
    startDate: timestamp('start_date', { withTimezone: true }),
    endDate: timestamp('end_date', { withTimezone: true }),
    lateAttemptPolicy: text('late_attempt_policy').default('REJECT').notNull(), // 'REJECT' | 'ALLOW_MARK_LATE' | 'PENALTY_PERCENT'
    latePenaltyPercent: integer('late_penalty_percent').default(0).notNull(),
    settingsConfig: jsonb('settings_config')
      .default({
        randomizeQuestions: false,
        randomizeOptions: false,
        oneQuestionAtATime: false,
        allowBackwardNavigation: true,
        allowAnswerChanges: true,
        showRemainingTime: true,
        autoSubmit: true,
        autosave: true,
        resultVisibility: 'AFTER_PUBLISH', // 'IMMEDIATE_OBJECTIVE' | 'AFTER_PUBLISH' | 'NEVER'
        explanationVisibility: 'AFTER_PUBLISH', // 'AFTER_SUBMIT' | 'AFTER_PUBLISH' | 'NEVER'
        negativeMarkingEnabled: false,
        negativeMarkingPercent: 0,
        gradePublicationPolicy: 'MANUAL', // 'MANUAL' | 'AUTO_ON_COMPLETE'
      })
      .notNull(),
    status: text('status').default('DRAFT').notNull(), // 'DRAFT' | 'PUBLISHED' | 'SCHEDULED' | 'CLOSED' | 'ARCHIVED'
    publishedAt: timestamp('published_at', { withTimezone: true }),
    scheduledAt: timestamp('scheduled_at', { withTimezone: true }),
    resultsPublished: boolean('results_published').default(false).notNull(),
    resultsPublishedAt: timestamp('results_published_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_assessments_classroom').on(table.classroomId),
    index('idx_assessments_topic').on(table.topicId),
    index('idx_assessments_mode').on(table.assessmentMode),
    index('idx_assessments_status').on(table.status),
  ]
);

export const assessmentSections = pgTable(
  'assessment_sections',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    assessmentId: uuid('assessment_id')
      .references(() => assessments.id, { onDelete: 'cascade' })
      .notNull(),
    title: text('title').notNull(),
    description: text('description').default('').notNull(),
    sectionType: text('section_type').default('OBJECTIVE').notNull(), // 'OBJECTIVE' | 'ESSAY' | 'MIXED'
    totalPoints: integer('total_points').default(50).notNull(),
    sortOrder: integer('sort_order').default(1).notNull(),
    randomizeQuestions: boolean('randomize_questions').default(false).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('idx_assessment_sections_assessment').on(table.assessmentId)]
);

export const questionBanks = pgTable(
  'question_banks',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    classroomId: uuid('classroom_id').references(() => classrooms.id, {
      onDelete: 'cascade',
    }),
    courseId: uuid('course_id').references(() => courses.id, {
      onDelete: 'set null',
    }),
    ownerId: uuid('owner_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    title: text('title').notNull(),
    subject: text('subject').default('').notNull(),
    topic: text('topic').default('').notNull(),
    description: text('description').default('').notNull(),
    isShared: boolean('is_shared').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_question_banks_classroom').on(table.classroomId),
    index('idx_question_banks_owner').on(table.ownerId),
    index('idx_question_banks_subject').on(table.subject),
  ]
);

export const questions = pgTable(
  'questions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    questionBankId: uuid('question_bank_id').references(() => questionBanks.id, {
      onDelete: 'set null',
    }),
    classroomId: uuid('classroom_id').references(() => classrooms.id, {
      onDelete: 'cascade',
    }),
    authorId: uuid('author_id')
      .references(() => users.id, { onDelete: 'restrict' })
      .notNull(),
    questionMode: text('question_mode').default('OBJECTIVE').notNull(), // 'OBJECTIVE' | 'ESSAY'
    questionType: text('question_type').default('SINGLE_CHOICE').notNull(),
    subject: text('subject').default('').notNull(),
    topic: text('topic').default('').notNull(),
    category: text('category').default('General').notNull(),
    difficulty: text('difficulty').default('MEDIUM').notNull(), // 'EASY' | 'MEDIUM' | 'HARD'
    learningOutcome: text('learning_outcome').default('').notNull(),
    promptText: text('prompt_text').notNull(),
    promptJson: jsonb('prompt_json')
      .default({ type: 'doc', content: [] })
      .notNull(),
    promptHtml: text('prompt_html'),
    points: numeric('points', { precision: 6, scale: 2 }).default('10').notNull(),
    negativePoints: numeric('negative_points', { precision: 6, scale: 2 })
      .default('0')
      .notNull(),
    partialCreditEnabled: boolean('partial_credit_enabled').default(true).notNull(),
    answerConfig: jsonb('answer_config').default({}).notNull(),
    explanation: text('explanation').default('').notNull(),
    explanationJson: jsonb('explanation_json').default({ type: 'doc', content: [] }),
    versionNumber: integer('version_number').default(1).notNull(),
    usageCount: integer('usage_count').default(0).notNull(),
    versionHistory: jsonb('version_history').default([]).notNull(),
    usageHistory: jsonb('usage_history').default([]).notNull(),
    title: text('title').default('').notNull(),
    questionCode: text('question_code'),
    status: text('status').default('READY').notNull(), // 'DRAFT' | 'READY' | 'ARCHIVED'
    sourceType: text('source_type').default('EDITOR').notNull(), // 'EDITOR' | 'IMPORT_XLSX' | 'IMPORT_CSV' | 'DUPLICATED'
    externalQuestionId: text('external_question_id'),
    importJobId: uuid('import_job_id'),
    tags: jsonb('tags').default([]).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_questions_bank').on(table.questionBankId),
    index('idx_questions_classroom').on(table.classroomId),
    index('idx_questions_type').on(table.questionType),
    index('idx_questions_difficulty').on(table.difficulty),
    index('idx_questions_category').on(table.category),
  ]
);

export const questionOptions = pgTable(
  'question_options',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    questionId: uuid('question_id')
      .references(() => questions.id, { onDelete: 'cascade' })
      .notNull(),
    optionLabel: text('option_label').notNull(),
    optionText: text('option_text').notNull(),
    optionJson: jsonb('option_json'),
    imageObjectKey: text('image_object_key'),
    audioObjectKey: text('audio_object_key'),
    matchRightText: text('match_right_text'),
    correctOrderIndex: integer('correct_order_index'),
    isCorrect: boolean('is_correct').default(false).notNull(),
    scoreWeight: numeric('score_weight', { precision: 5, scale: 2 })
      .default('100')
      .notNull(),
    feedback: text('feedback').default('').notNull(),
    sortOrder: integer('sort_order').default(1).notNull(),
  },
  (table) => [index('idx_question_options_question').on(table.questionId)]
);

export const questionMedia = pgTable(
  'question_media',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    questionId: uuid('question_id')
      .references(() => questions.id, { onDelete: 'cascade' })
      .notNull(),
    fileId: uuid('file_id').references(() => storedFiles.id, {
      onDelete: 'set null',
    }),
    mediaType: text('media_type').default('IMAGE').notNull(),
    objectKey: text('object_key').notNull(),
    originalName: text('original_name').notNull(),
    mimeType: text('mime_type').default('image/png').notNull(),
    fileSize: integer('file_size').default(0).notNull(),
    caption: text('caption').default('').notNull(),
    sortOrder: integer('sort_order').default(1).notNull(),
    durationSeconds: integer('duration_seconds'),
    width: integer('width'),
    height: integer('height'),
    thumbnailKey: text('thumbnail_key'),
    optimizedFilename: text('optimized_filename'),
    uploadedById: uuid('uploaded_by_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    optionId: uuid('option_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('idx_question_media_question').on(table.questionId)]
);

export const questionBankTags = pgTable(
  'question_bank_tags',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    questionId: uuid('question_id')
      .references(() => questions.id, { onDelete: 'cascade' })
      .notNull(),
    tag: text('tag').notNull(),
    learningOutcomeCode: text('learning_outcome_code').default('').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_question_tags_question').on(table.questionId),
    index('idx_question_tags_tag').on(table.tag),
  ]
);

export const assessmentRubrics = pgTable(
  'assessment_rubrics',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    assessmentId: uuid('assessment_id').references(() => assessments.id, {
      onDelete: 'cascade',
    }),
    questionId: uuid('question_id').references(() => questions.id, {
      onDelete: 'cascade',
    }),
    title: text('title').notNull(),
    description: text('description').default('').notNull(),
    totalWeight: integer('total_weight').default(100).notNull(),
    maxScore: numeric('max_score', { precision: 6, scale: 2 }).default('100').notNull(),
    createdById: uuid('created_by_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_assessment_rubrics_assessment').on(table.assessmentId),
    index('idx_assessment_rubrics_question').on(table.questionId),
  ]
);

export const assessmentRubricCriteria = pgTable(
  'assessment_rubric_criteria',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    rubricId: uuid('rubric_id')
      .references(() => assessmentRubrics.id, { onDelete: 'cascade' })
      .notNull(),
    criterionName: text('criterion_name').notNull(),
    description: text('description').default('').notNull(),
    weight: integer('weight').default(25).notNull(),
    maxScore: numeric('max_score', { precision: 6, scale: 2 }).default('25').notNull(),
    performanceLevels: jsonb('performance_levels').default([]).notNull(),
    sortOrder: integer('sort_order').default(1).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('idx_assessment_rubric_criteria_rubric').on(table.rubricId)]
);

export const assessmentQuestions = pgTable(
  'assessment_questions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    assessmentId: uuid('assessment_id')
      .references(() => assessments.id, { onDelete: 'cascade' })
      .notNull(),
    sectionId: uuid('section_id').references(() => assessmentSections.id, {
      onDelete: 'set null',
    }),
    questionId: uuid('question_id')
      .references(() => questions.id, { onDelete: 'cascade' })
      .notNull(),
    pointsOverride: numeric('points_override', { precision: 6, scale: 2 }),
    negativePointsOverride: numeric('negative_points_override', {
      precision: 6,
      scale: 2,
    }),
    rubricId: uuid('rubric_id').references(() => assessmentRubrics.id, {
      onDelete: 'set null',
    }),
    sortOrder: integer('sort_order').default(1).notNull(),
    isRequired: boolean('is_required').default(true).notNull(),
    questionSnapshot: jsonb('question_snapshot'),
    sourceVersionNumber: integer('source_version_number').default(1).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('uq_assessment_question_item').on(
      table.assessmentId,
      table.questionId
    ),
    index('idx_assessment_questions_assessment').on(table.assessmentId),
    index('idx_assessment_questions_section').on(table.sectionId),
  ]
);

export const assessmentQuestionPools = pgTable(
  'assessment_question_pools',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    assessmentId: uuid('assessment_id')
      .references(() => assessments.id, { onDelete: 'cascade' })
      .notNull(),
    sectionId: uuid('section_id').references(() => assessmentSections.id, {
      onDelete: 'set null',
    }),
    questionBankId: uuid('question_bank_id').references(() => questionBanks.id, {
      onDelete: 'set null',
    }),
    title: text('title').notNull(),
    categoryFilter: text('category_filter').default('').notNull(),
    topicFilter: text('topic_filter').default('').notNull(),
    difficultyFilter: text('difficulty_filter').default('ANY').notNull(), // 'ANY' | 'EASY' | 'MEDIUM' | 'HARD' | 'DISTRIBUTION'
    difficultyDistribution: jsonb('difficulty_distribution')
      .default({ easy: 0, medium: 0, hard: 0 })
      .notNull(),
    questionCount: integer('question_count').default(5).notNull(),
    pointsPerQuestion: numeric('points_per_question', {
      precision: 6,
      scale: 2,
    })
      .default('10')
      .notNull(),
    sortOrder: integer('sort_order').default(1).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('idx_assessment_pools_assessment').on(table.assessmentId)]
);

export const assessmentAccommodations = pgTable(
  'assessment_accommodations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    assessmentId: uuid('assessment_id')
      .references(() => assessments.id, { onDelete: 'cascade' })
      .notNull(),
    studentId: uuid('student_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    extraDurationMinutes: integer('extra_duration_minutes').default(0).notNull(),
    extraAttempts: integer('extra_attempts').default(0).notNull(),
    extendedEndDate: timestamp('extended_end_date', { withTimezone: true }),
    reason: text('reason').default('').notNull(),
    grantedById: uuid('granted_by_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('uq_assessment_student_accommodation').on(
      table.assessmentId,
      table.studentId
    ),
    index('idx_accommodations_assessment').on(table.assessmentId),
  ]
);

export const assessmentAttempts = pgTable(
  'assessment_attempts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    assessmentId: uuid('assessment_id')
      .references(() => assessments.id, { onDelete: 'cascade' })
      .notNull(),
    studentId: uuid('student_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    attemptNumber: integer('attempt_number').default(1).notNull(),
    status: text('status').default('IN_PROGRESS').notNull(), // 'IN_PROGRESS' | 'SUBMITTED' | 'AUTO_SUBMITTED' | 'TIMED_OUT' | 'ABANDONED' | 'INVALIDATED' | 'GRADED'
    startedAt: timestamp('started_at', { withTimezone: true }).defaultNow().notNull(),
    serverDeadlineAt: timestamp('server_deadline_at', { withTimezone: true }).notNull(),
    submittedAt: timestamp('submitted_at', { withTimezone: true }),
    lastActivityAt: timestamp('last_activity_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    isLate: boolean('is_late').default(false).notNull(),
    versionNumber: integer('version_number').default(1).notNull(),
    idempotencyKey: text('idempotency_key'),
    objectiveScore: numeric('objective_score', { precision: 6, scale: 2 })
      .default('0')
      .notNull(),
    essayScore: numeric('essay_score', { precision: 6, scale: 2 })
      .default('0')
      .notNull(),
    totalScore: numeric('total_score', { precision: 6, scale: 2 })
      .default('0')
      .notNull(),
    maxScore: numeric('max_score', { precision: 6, scale: 2 })
      .default('100')
      .notNull(),
    percentageScore: numeric('percentage_score', { precision: 5, scale: 2 })
      .default('0')
      .notNull(),
    passed: boolean('passed').default(false).notNull(),
    objectiveGradingStatus: text('objective_grading_status')
      .default('PENDING')
      .notNull(), // 'NOT_APPLICABLE' | 'PENDING' | 'GRADED'
    essayGradingStatus: text('essay_grading_status')
      .default('NOT_APPLICABLE')
      .notNull(), // 'NOT_APPLICABLE' | 'PENDING' | 'IN_PROGRESS' | 'DRAFT_SAVED' | 'GRADED'
    finalGradingStatus: text('final_grading_status')
      .default('IN_PROGRESS')
      .notNull(), // 'IN_PROGRESS' | 'PENDING_ESSAY' | 'READY' | 'PUBLISHED'
    isPublishedToStudent: boolean('is_published_to_student')
      .default(false)
      .notNull(),
    generalFeedback: text('general_feedback').default('').notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('uq_assessment_student_attempt_num').on(
      table.assessmentId,
      table.studentId,
      table.attemptNumber
    ),
    index('idx_assessment_attempts_assessment').on(table.assessmentId),
    index('idx_assessment_attempts_student').on(table.studentId),
    index('idx_assessment_attempts_status').on(table.status),
  ]
);

export const attemptQuestions = pgTable(
  'attempt_questions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    attemptId: uuid('attempt_id')
      .references(() => assessmentAttempts.id, { onDelete: 'cascade' })
      .notNull(),
    assessmentId: uuid('assessment_id')
      .references(() => assessments.id, { onDelete: 'cascade' })
      .notNull(),
    sectionId: uuid('section_id').references(() => assessmentSections.id, {
      onDelete: 'set null',
    }),
    sourceQuestionId: uuid('source_question_id').references(() => questions.id, {
      onDelete: 'set null',
    }),
    sourcePoolId: uuid('source_pool_id').references(
      () => assessmentQuestionPools.id,
      { onDelete: 'set null' }
    ),
    questionOrder: integer('question_order').default(1).notNull(),
    questionMode: text('question_mode').default('OBJECTIVE').notNull(), // 'OBJECTIVE' | 'ESSAY'
    questionType: text('question_type').default('SINGLE_CHOICE').notNull(),
    promptText: text('prompt_text').notNull(),
    promptJson: jsonb('prompt_json').default({ type: 'doc', content: [] }).notNull(),
    promptHtml: text('prompt_html'),
    points: numeric('points', { precision: 6, scale: 2 }).default('10').notNull(),
    negativePoints: numeric('negative_points', { precision: 6, scale: 2 })
      .default('0')
      .notNull(),
    partialCreditEnabled: boolean('partial_credit_enabled').default(true).notNull(),
    studentOptionsSnapshot: jsonb('student_options_snapshot').default({}).notNull(),
    serverAnswerKeySnapshot: jsonb('server_answer_key_snapshot')
      .default({})
      .notNull(),
    explanationSnapshot: text('explanation_snapshot').default('').notNull(),
    rubricSnapshot: jsonb('rubric_snapshot'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_attempt_questions_attempt').on(table.attemptId),
    index('idx_attempt_questions_assessment').on(table.assessmentId),
  ]
);

export const attemptAnswers = pgTable(
  'attempt_answers',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    attemptId: uuid('attempt_id')
      .references(() => assessmentAttempts.id, { onDelete: 'cascade' })
      .notNull(),
    attemptQuestionId: uuid('attempt_question_id')
      .references(() => attemptQuestions.id, { onDelete: 'cascade' })
      .notNull(),
    sourceQuestionId: uuid('source_question_id').references(() => questions.id, {
      onDelete: 'set null',
    }),
    studentId: uuid('student_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    answerPayload: jsonb('answer_payload').default({}).notNull(),
    isAnswered: boolean('is_answered').default(false).notNull(),
    isFlagged: boolean('is_flagged').default(false).notNull(),
    isCorrect: boolean('is_correct'),
    partialRatio: numeric('partial_ratio', { precision: 5, scale: 4 }),
    autoScore: numeric('auto_score', { precision: 6, scale: 2 }),
    manualScore: numeric('manual_score', { precision: 6, scale: 2 }),
    finalQuestionScore: numeric('final_question_score', {
      precision: 6,
      scale: 2,
    }),
    requiresManualReview: boolean('requires_manual_review').default(false).notNull(),
    gradingStatus: text('grading_status').default('UNGRADED').notNull(), // 'UNGRADED' | 'AUTO_GRADED' | 'DRAFT_MANUAL' | 'MANUAL_GRADED'
    autosaveVersion: integer('autosave_version').default(1).notNull(),
    savedAt: timestamp('saved_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('uq_attempt_question_answer').on(
      table.attemptId,
      table.attemptQuestionId
    ),
    index('idx_attempt_answers_attempt').on(table.attemptId),
    index('idx_attempt_answers_student').on(table.studentId),
  ]
);

export const essayAttachments = pgTable(
  'essay_attachments',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    attemptId: uuid('attempt_id')
      .references(() => assessmentAttempts.id, { onDelete: 'cascade' })
      .notNull(),
    attemptQuestionId: uuid('attempt_question_id')
      .references(() => attemptQuestions.id, { onDelete: 'cascade' })
      .notNull(),
    answerId: uuid('answer_id').references(() => attemptAnswers.id, {
      onDelete: 'cascade',
    }),
    fileId: uuid('file_id').references(() => storedFiles.id, {
      onDelete: 'set null',
    }),
    originalName: text('original_name').default('').notNull(),
    objectKey: text('object_key').default('').notNull(),
    mimeType: text('mime_type').default('application/octet-stream').notNull(),
    fileExtension: text('file_extension').default('').notNull(),
    fileSize: integer('file_size').default(0).notNull(),
    checksum: text('checksum').default('').notNull(),
    uploadedById: uuid('uploaded_by_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('idx_essay_attachments_attempt').on(table.attemptId)]
);

export const essayGrades = pgTable(
  'essay_grades',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    attemptId: uuid('attempt_id')
      .references(() => assessmentAttempts.id, { onDelete: 'cascade' })
      .notNull(),
    attemptQuestionId: uuid('attempt_question_id')
      .references(() => attemptQuestions.id, { onDelete: 'cascade' })
      .notNull()
      .unique(),
    answerId: uuid('answer_id').references(() => attemptAnswers.id, {
      onDelete: 'cascade',
    }),
    gradedById: uuid('graded_by_id')
      .references(() => users.id, { onDelete: 'restrict' })
      .notNull(),
    gradingMethod: text('grading_method').default('DIRECT').notNull(), // 'DIRECT' | 'RUBRIC'
    rawScore: numeric('raw_score', { precision: 6, scale: 2 }).default('0').notNull(),
    finalScore: numeric('final_score', { precision: 6, scale: 2 })
      .default('0')
      .notNull(),
    maxScore: numeric('max_score', { precision: 6, scale: 2 })
      .default('10')
      .notNull(),
    criterionScores: jsonb('criterion_scores').default([]).notNull(),
    feedback: text('feedback').default('').notNull(),
    isDraft: boolean('is_draft').default(false).notNull(),
    revisionNumber: integer('revision_number').default(1).notNull(),
    auditHistory: jsonb('audit_history').default([]).notNull(),
    gradedAt: timestamp('graded_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_essay_grades_attempt').on(table.attemptId),
    index('idx_essay_grades_question').on(table.attemptQuestionId),
  ]
);

export const essayFeedback = pgTable(
  'essay_feedback',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    essayGradeId: uuid('essay_grade_id').references(() => essayGrades.id, {
      onDelete: 'cascade',
    }),
    attemptId: uuid('attempt_id')
      .references(() => assessmentAttempts.id, { onDelete: 'cascade' })
      .notNull(),
    attemptQuestionId: uuid('attempt_question_id')
      .references(() => attemptQuestions.id, { onDelete: 'cascade' })
      .notNull(),
    authorId: uuid('author_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    feedbackText: text('feedback_text').notNull(),
    feedbackJson: jsonb('feedback_json'),
    visibility: text('visibility').default('STUDENT_VISIBLE').notNull(), // 'STUDENT_VISIBLE' | 'INSTRUCTOR_PRIVATE'
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('idx_essay_feedback_attempt').on(table.attemptId)]
);

export const assessmentResults = pgTable(
  'assessment_results',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    assessmentId: uuid('assessment_id')
      .references(() => assessments.id, { onDelete: 'cascade' })
      .notNull(),
    studentId: uuid('student_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    bestAttemptId: uuid('best_attempt_id').references(
      () => assessmentAttempts.id,
      { onDelete: 'set null' }
    ),
    latestAttemptId: uuid('latest_attempt_id').references(
      () => assessmentAttempts.id,
      { onDelete: 'set null' }
    ),
    attemptsUsed: integer('attempts_used').default(0).notNull(),
    objectiveScore: numeric('objective_score', { precision: 6, scale: 2 })
      .default('0')
      .notNull(),
    essayScore: numeric('essay_score', { precision: 6, scale: 2 })
      .default('0')
      .notNull(),
    finalScore: numeric('final_score', { precision: 6, scale: 2 })
      .default('0')
      .notNull(),
    maxScore: numeric('max_score', { precision: 6, scale: 2 })
      .default('100')
      .notNull(),
    percentageScore: numeric('percentage_score', { precision: 5, scale: 2 })
      .default('0')
      .notNull(),
    passed: boolean('passed').default(false).notNull(),
    gradingStatus: text('grading_status').default('PENDING').notNull(), // 'PENDING' | 'PARTIAL' | 'COMPLETE'
    isPublished: boolean('is_published').default(false).notNull(),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('uq_assessment_student_result').on(
      table.assessmentId,
      table.studentId
    ),
    index('idx_assessment_results_assessment').on(table.assessmentId),
    index('idx_assessment_results_student').on(table.studentId),
  ]
);

export const assessmentEvents = pgTable(
  'assessment_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    assessmentId: uuid('assessment_id')
      .references(() => assessments.id, { onDelete: 'cascade' })
      .notNull(),
    attemptId: uuid('attempt_id').references(() => assessmentAttempts.id, {
      onDelete: 'cascade',
    }),
    actorId: uuid('actor_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    eventType: text('event_type').notNull(),
    metadata: jsonb('metadata').default({}).notNull(),
    ipAddress: text('ip_address'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_assessment_events_assessment').on(table.assessmentId),
    index('idx_assessment_events_attempt').on(table.attemptId),
  ]
);

export const questionImportJobs = pgTable(
  'question_import_jobs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    classroomId: uuid('classroom_id').references(() => classrooms.id, {
      onDelete: 'cascade',
    }),
    assessmentId: uuid('assessment_id').references(() => assessments.id, {
      onDelete: 'set null',
    }),
    uploadedById: uuid('uploaded_by_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    filename: text('filename').notNull(),
    fileFormat: text('file_format').notNull(), // 'XLSX' | 'CSV'
    importMode: text('import_mode').default('SKIP_DUPLICATES').notNull(),
    fingerprint: text('fingerprint').notNull(),
    status: text('status').default('PENDING').notNull(), // 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'CANCELLED'
    batchSize: integer('batch_size').default(100).notNull(),
    totalRows: integer('total_rows').default(0).notNull(),
    processedRows: integer('processed_rows').default(0).notNull(),
    successfulRows: integer('successful_rows').default(0).notNull(),
    failedRows: integer('failed_rows').default(0).notNull(),
    skippedRows: integer('skipped_rows').default(0).notNull(),
    payloadRows: jsonb('payload_rows').default([]).notNull(),
    errorReport: jsonb('error_report').default([]).notNull(),
    summary: jsonb('summary').default({}).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (table) => [
    index('idx_question_import_jobs_classroom').on(table.classroomId),
    index('idx_question_import_jobs_user').on(table.uploadedById),
    index('idx_question_import_jobs_fingerprint').on(table.fingerprint),
  ]
);

export const questionImportErrors = pgTable(
  'question_import_errors',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    jobId: uuid('job_id')
      .references(() => questionImportJobs.id, { onDelete: 'cascade' })
      .notNull(),
    rowNumber: integer('row_number').notNull(),
    externalQuestionId: text('external_question_id').default('').notNull(),
    field: text('field').default('').notNull(),
    errorMessage: text('error_message').notNull(),
    rawRow: jsonb('raw_row').default({}).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('idx_question_import_errors_job').on(table.jobId)]
);

// 18. Password Reset Tokens & Bulk User Import Batches (Academic Identity & User Administration Center)
export const passwordResetTokens = pgTable(
  'password_reset_tokens',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    tokenHash: text('token_hash').notNull().unique(),
    requestedById: uuid('requested_by_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    mode: text('mode').default('INVITATION_LINK').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_password_reset_tokens_user').on(table.userId),
    index('idx_password_reset_tokens_hash').on(table.tokenHash),
  ]
);

export const userImportBatches = pgTable(
  'user_import_batches',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    originalFilename: text('original_filename').notNull(),
    importType: text('import_type').notNull(), // 'DOSEN' | 'MAHASISWA' | 'GENERAL'
    importMode: text('import_mode').default('SKIP_DUPLICATES').notNull(), // 'CREATE_ONLY' | 'UPSERT' | 'SKIP_DUPLICATES'
    operatorId: uuid('operator_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    totalRecords: integer('total_records').default(0).notNull(),
    successfulRecords: integer('successful_records').default(0).notNull(),
    failedRecords: integer('failed_records').default(0).notNull(),
    skippedRecords: integer('skipped_records').default(0).notNull(),
    status: text('status').default('COMPLETED').notNull(), // 'COMPLETED' | 'PARTIAL' | 'FAILED'
    errorReportJson: jsonb('error_report_json').default([]).notNull(),
    fingerprint: text('fingerprint').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_user_import_batches_operator').on(table.operatorId),
    index('idx_user_import_batches_fingerprint').on(table.fingerprint),
  ]
);

export const passwordHistory = pgTable(
  'password_history',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    passwordHash: text('password_hash').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('idx_password_history_user').on(table.userId)]
);

// 19. System Settings, Application Themes & Settings History
export const systemSettings = pgTable(
  'system_settings',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    settingGroup: text('setting_group').notNull(), // 'identity' | 'branding' | 'favicon' | 'seo' | 'general'
    settingKey: text('setting_key').notNull().unique(),
    settingValue: text('setting_value'),
    valueType: text('value_type').default('string').notNull(), // 'string' | 'number' | 'boolean' | 'json' | 'url'
    isPublic: boolean('is_public').default(true).notNull(),
    updatedBy: uuid('updated_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_system_settings_group').on(table.settingGroup),
    index('idx_system_settings_key').on(table.settingKey),
  ]
);

export const applicationThemes = pgTable(
  'application_themes',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    presetKey: text('preset_key').notNull().unique(),
    presetName: text('preset_name').notNull(),
    description: text('description').default('').notNull(),
    tokenConfiguration: jsonb('token_configuration')
      .$type<Record<string, string>>()
      .notNull(),
    isActive: boolean('is_active').default(false).notNull(),
    updatedBy: uuid('updated_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('idx_application_themes_active').on(table.isActive)]
);

export const systemSettingsHistory = pgTable(
  'system_settings_history',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    settingGroup: text('setting_group').notNull(),
    settingKey: text('setting_key').notNull(),
    previousValue: text('previous_value'),
    newValue: text('new_value'),
    changedBy: uuid('changed_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    changedAt: timestamp('changed_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_system_settings_history_group').on(table.settingGroup),
    index('idx_system_settings_history_changed_at').on(table.changedAt),
  ]
);

// 20. EduCoreLMS Knowledge Center & Documentation CMS
export const knowledgeCategories = pgTable(
  'knowledge_categories',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    name: text('name').notNull(),
    slug: text('slug').notNull().unique(),
    description: text('description').default('').notNull(),
    icon: text('icon').default('BookOpen').notNull(),
    sortOrder: integer('sort_order').default(0).notNull(),
    isActive: boolean('is_active').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('idx_knowledge_categories_sort').on(table.sortOrder)]
);

export const knowledgeArticles = pgTable(
  'knowledge_articles',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    categoryId: uuid('category_id')
      .references(() => knowledgeCategories.id, { onDelete: 'cascade' })
      .notNull(),
    title: text('title').notNull(),
    slug: text('slug').notNull().unique(),
    excerpt: text('excerpt').default('').notNull(),
    content: text('content').default('').notNull(),
    contentJson: jsonb('content_json').$type<Record<string, any>>(),
    status: text('status').default('DRAFT').notNull(), // 'DRAFT' | 'PUBLISHED' | 'ARCHIVED'
    difficulty: text('difficulty').default('PEMULA').notNull(), // 'PEMULA' | 'MENENGAH' | 'LANJUTAN'
    estimatedReadingMinutes: integer('estimated_reading_minutes').default(5).notNull(),
    featuredImage: text('featured_image'),
    isFeatured: boolean('is_featured').default(false).notNull(),
    keywords: text('keywords').default('').notNull(),
    relatedArticleIds: jsonb('related_article_ids').$type<string[]>().default([]).notNull(),
    version: integer('version').default(1).notNull(),
    docVersionLabel: text('doc_version_label').default('v1.0.0').notNull(),
    viewCount: integer('view_count').default(0).notNull(),
    helpfulCount: integer('helpful_count').default(0).notNull(),
    notHelpfulCount: integer('not_helpful_count').default(0).notNull(),
    createdBy: uuid('created_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    updatedBy: uuid('updated_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_knowledge_articles_category').on(table.categoryId),
    index('idx_knowledge_articles_status').on(table.status),
    index('idx_knowledge_articles_featured').on(table.isFeatured),
  ]
);

export const knowledgeArticleRoles = pgTable(
  'knowledge_article_roles',
  {
    articleId: uuid('article_id')
      .references(() => knowledgeArticles.id, { onDelete: 'cascade' })
      .notNull(),
    roleId: uuid('role_id')
      .references(() => roles.id, { onDelete: 'cascade' })
      .notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.articleId, table.roleId] }),
    index('idx_knowledge_article_roles_role').on(table.roleId),
  ]
);

export const knowledgeTags = pgTable('knowledge_tags', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
});

export const knowledgeArticleTags = pgTable(
  'knowledge_article_tags',
  {
    articleId: uuid('article_id')
      .references(() => knowledgeArticles.id, { onDelete: 'cascade' })
      .notNull(),
    tagId: uuid('tag_id')
      .references(() => knowledgeTags.id, { onDelete: 'cascade' })
      .notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.articleId, table.tagId] }),
    index('idx_knowledge_article_tags_tag').on(table.tagId),
  ]
);

export const knowledgeFaqs = pgTable(
  'knowledge_faqs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    question: text('question').notNull(),
    answer: text('answer').notNull(),
    categoryId: uuid('category_id').references(() => knowledgeCategories.id, {
      onDelete: 'set null',
    }),
    audienceRole: text('audience_role').default('ALL').notNull(), // 'ALL' | 'SUPERADMIN' | 'DOSEN' | 'MAHASISWA' | 'AUDITOR'
    status: text('status').default('PUBLISHED').notNull(), // 'DRAFT' | 'PUBLISHED' | 'ARCHIVED'
    sortOrder: integer('sort_order').default(0).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('idx_knowledge_faqs_category').on(table.categoryId)]
);

export const knowledgeArticleVersions = pgTable(
  'knowledge_article_versions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    articleId: uuid('article_id')
      .references(() => knowledgeArticles.id, { onDelete: 'cascade' })
      .notNull(),
    version: integer('version').notNull(),
    contentSnapshot: jsonb('content_snapshot')
      .$type<Record<string, any>>()
      .notNull(),
    changedBy: uuid('changed_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    changeSummary: text('change_summary').default('').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_knowledge_article_versions_article').on(table.articleId),
  ]
);





