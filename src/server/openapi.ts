export const openApiSpec = {
  openapi: '3.1.0',
  info: {
    title: 'Politeknik Kampar LMS — REST API v1',
    version: '1.0.0',
    description:
      'Production Learning Management System API for Politeknik Kampar. Implements Argon2id authentication, server-side database sessions, CSRF protection, custom RBAC permission registry, resource ownership policies, and PostgreSQL transactional operations.',
    contact: {
      name: 'UPT TIK Politeknik Kampar',
      email: 'tik@poltek-kampar.ac.id',
    },
  },
  servers: [
    {
      url: '/api/v1',
      description: 'Primary Modular Monolith REST API v1',
    },
  ],
  components: {
    securitySchemes: {
      SessionCookie: {
        type: 'apiKey',
        in: 'cookie',
        name: 'pk_lms_session',
      },
      CsrfHeader: {
        type: 'apiKey',
        in: 'header',
        name: 'X-CSRF-Token',
      },
      FirebaseBearer: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
      },
    },
    schemas: {
      StandardSuccessResponse: {
        type: 'object',
        required: ['success', 'data', 'meta'],
        properties: {
          success: { type: 'boolean', enum: [true] },
          data: { type: 'object' },
          meta: { type: ['object', 'null'] },
        },
      },
      StandardErrorResponse: {
        type: 'object',
        required: ['success', 'error'],
        properties: {
          success: { type: 'boolean', enum: [false] },
          error: {
            type: 'object',
            required: ['code', 'message', 'details'],
            properties: {
              code: { type: 'string' },
              message: { type: 'string' },
              details: { type: 'array', items: { type: 'object' } },
            },
          },
        },
      },
    },
  },
  paths: {
    '/auth/login': {
      post: {
        tags: ['Authentication'],
        summary: 'Authenticate user with email & Argon2id password, establishing a server-side session',
      },
    },
    '/auth/google': {
      post: {
        tags: ['Authentication'],
        summary: 'Exchange verified Firebase Google ID Token for a server-side LMS session',
      },
    },
    '/auth/me': {
      get: {
        tags: ['Authentication'],
        summary: 'Retrieve active authenticated user profile, roles, permissions, and CSRF token',
      },
    },
    '/auth/logout': {
      post: {
        tags: ['Authentication'],
        summary: 'Revoke active server-side session and clear HttpOnly cookies',
      },
    },
    '/users': {
      get: {
        tags: ['Superadmin & RBAC'],
        summary: 'Paginated list of users with roles and academic profiles',
      },
      post: {
        tags: ['Superadmin & RBAC'],
        summary: 'Create a new user (Superadmin / Dosen / Mahasiswa) with Argon2id hashed password',
      },
    },
    '/rbac/roles': {
      get: {
        tags: ['Superadmin & RBAC'],
        summary: 'List all RBAC roles, permission registry, and role-permission assignments',
      },
      post: {
        tags: ['Superadmin & RBAC'],
        summary: 'Toggle or assign a permission to a role',
      },
    },
    '/academic/overview': {
      get: {
        tags: ['Academic Management'],
        summary: 'Retrieve academic years, semesters, and master courses with pagination',
      },
    },
    '/academic/courses': {
      post: {
        tags: ['Academic Management'],
        summary: 'Create a new master academic course',
      },
    },
    '/classrooms': {
      get: {
        tags: ['Classrooms'],
        summary: 'List classrooms filtered by actor role, search query, and pagination',
      },
      post: {
        tags: ['Classrooms'],
        summary: 'Create a new digital classroom from a master course (transactional with join code & default grade categories)',
      },
    },
    '/classrooms/join': {
      post: {
        tags: ['Enrollment'],
        summary: 'Student joins a classroom using a unique join code (enforces capacity & auto/approval policy inside a DB transaction)',
      },
    },
    '/classrooms/{id}': {
      get: {
        tags: ['Classrooms'],
        summary: 'Full digital classroom workspace (Stream, Classwork, People, Grades, Settings) with resource ownership & active enrollment enforcement',
      },
      patch: {
        tags: ['Classrooms'],
        summary: 'Update classroom settings, capacity, enrollment policy, or regenerate/revoke join code',
      },
    },
    '/classrooms/{id}/enrollments/{enrollmentId}': {
      patch: {
        tags: ['Enrollment'],
        summary: 'Approve, reject, or drop a student enrollment inside a PostgreSQL transaction',
      },
    },
    '/classrooms/{id}/announcements': {
      post: {
        tags: ['Classroom Stream'],
        summary: 'Publish an announcement to the classroom stream',
      },
    },
    '/classrooms/{id}/comments': {
      post: {
        tags: ['Classroom Stream'],
        summary: 'Post a discussion comment on a classroom announcement',
      },
    },
    '/classrooms/{id}/topics': {
      post: {
        tags: ['Classwork'],
        summary: 'Create a new learning topic module in the classroom',
      },
    },
    '/classrooms/{id}/materials': {
      post: {
        tags: ['Classwork'],
        summary: 'Publish learning material with optional private S3-compatible file attachment',
      },
    },
    '/classrooms/{id}/assignments': {
      post: {
        tags: ['Assessments'],
        summary: 'Create a new assignment and automatically link a corresponding gradebook item',
      },
    },
    '/assignments/{assignmentId}/submit': {
      post: {
        tags: ['Assessments'],
        summary: 'Submit or revise student assignment work (transactional with revision tracking)',
      },
    },
    '/submissions/{submissionId}/grade': {
      post: {
        tags: ['Assessments & Gradebook'],
        summary: 'Grade a student submission and synchronize the score to grade_records inside a DB transaction',
      },
    },
    '/classrooms/{id}/quizzes': {
      post: {
        tags: ['Assessments'],
        summary: 'Create a structured quiz with multiple-choice questions and server-side answer keys',
      },
    },
    '/quizzes/{quizId}/attempt': {
      post: {
        tags: ['Assessments'],
        summary: 'Submit a student quiz attempt, auto-grade on the server without exposing answer keys, and record gradebook score',
      },
    },
    '/files/{fileId}/download': {
      get: {
        tags: ['Private File Storage'],
        summary: 'Authorized private file download endpoint enforcing active classroom enrollment or instructor ownership',
      },
    },
    '/audit-logs': {
      get: {
        tags: ['Security & Audit'],
        summary: 'Paginated security audit logs for Superadmin monitoring',
      },
    },
  },
};
