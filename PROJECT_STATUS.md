# PROJECT STATUS — POLITEKNIK KAMPAR LMS

## 1. Completed Phases & Current Implementation Status

| Phase | Scope | Status | Verification |
| :--- | :--- | :--- | :--- |
| **Phase 0: Project Foundation** | Modular Monolith architecture (Fastify + React + Vite + Drizzle ORM + Cloud SQL PostgreSQL), normalized 49-table database schema, OpenAPI 3.1 spec, Vitest test harness | **COMPLETED** | Verified via `UpdateSchema`, `ExecuteSql`, `tsc --noEmit`, and Vitest |
| **Phase 1: Authentication & RBAC** | Argon2id password hashing, SHA-256 hashed server-side sessions (`user_sessions`), HttpOnly cookies, CSRF token verification, login rate limiting, Permission Registry (`17` permissions across `SUPERADMIN`, `DOSEN`, `MAHASISWA`), Google Sign-In OAuth linking | **COMPLETED** | Verified via API integration tests & live PostgreSQL sessions |
| **Phase 2: Academic & Classroom** | Academic years, semesters, master courses (`courses`), digital classrooms (`classrooms`), multiple instructors (`classroom_instructors`), unique & revocable join codes (`classroom_join_codes`) | **COMPLETED** | Verified via PostgreSQL transactions & UI workflows |
| **Phase 3: Enrollment Engine** | Join classroom by code (`POST /api/v1/classrooms/join`), automatic (`AUTO`) vs instructor approval (`APPROVAL_REQUIRED`) policies, capacity enforcement, duplicate prevention, status history preservation (`pending`, `active`, `rejected`, `dropped`, `completed`) | **COMPLETED** | Verified via transactional enrollment endpoints |
| **Phase 4: Full Digital Classroom** | 5-tab classroom workspace (`Stream`, `Classwork`, `People`, `Grades`, `Settings`), announcements, discussion comments, topics, learning materials, private S3-compatible object storage & authorized download endpoint (`/api/v1/files/:fileId/download`) | **COMPLETED** | Verified with active enrollment ownership checks |
| **Phase 5: Assignments & Assessment** | Assignments creation, student submission with revision history (`submission_revisions` / `submission_versions`), instructor grading with feedback, structured multiple-choice quizzes with server-side evaluation and strict answer-key hiding (`isCorrect` stripped for students) | **COMPLETED** | Verified via Vitest security assertions |
| **Phase 6: Gradebook & Analytics** | Weighted grade categories (`grade_categories`), grade items (`grade_items`), automated grade records synchronization (`grade_records`) from assignments & quizzes, student privacy isolation | **COMPLETED** | Verified in Classroom Grades tab |
| **Phase 7: Production Hardening** | Deny-by-default security, resource ownership policies, security audit logging (`audit_logs`), input validation with Zod, OpenAPI 3.1 documentation (`/api/v1/openapi.json`) | **COMPLETED** | Verified via `vitest run` & `tsc --noEmit` |
| **Phase 8: Advanced Learning Material Builder & Student Material Viewer** | Full-page Tiptap JSONB Rich Text Editor (`@tiptap/react` + tables, task lists, lowlight syntax highlighting, YouTube, custom Vimeo & S3 Video nodes), S3 Presigned PUT/GET Object Storage with SHA-256 checksum & magic-byte validation, Isolated Document Preview Engine (PDF stream, Mammoth DOCX HTML, SheetJS XLSX multi-sheet table, PPTX slide text extraction, Image zoom, Video HTTP 206 Range streaming & resume playback), Publication & Scheduling (`DRAFT`, `PUBLISHED`, `SCHEDULED`, `ARCHIVED`), and Student Learning Progress Tracker (`material_progress`) | **COMPLETED** | Verified via 19-point Vitest Integration Suite & Cloud SQL Schema Inspection |
| **Phase 9: Advanced Assignment Builder, Student Submission Manager & Instructor Grading Workspace** | Full-page Assignment Builder (`AssignmentBuilderPage`), Tiptap instructions, instructor reference attachments, submission rules & late policies, multi-criterion Rubric Builder (`assignment_rubrics`, `assignment_rubric_criteria`), Student Submission Workspace (`AssignmentWorkspacePage`) with Tiptap responses, multi-file S3 private uploads (`PDF, DOC, DOCX, XLS, XLSX, PPT, PPTX, JPG, JPEG, PNG, WEBP`), external HTTPS links (`submission_links`), version history (`submission_versions`), Instructor Submission Monitoring & Analytics Dashboard (`AssignmentMonitoringPage`) deriving active classroom enrollments (`not_submitted` tracking), bulk reminders (`assignment_reminders`), CSV/XLSX grade export, and Dedicated Instructor Grading Workspace (`AssignmentGradingPage`) with Direct/Rubric/Combined scoring, draft vs. published grade states, return-for-revision, grade audit history (`submission_grades`, `submission_events`), and threaded comments (`submission_comments`) | **COMPLETED** | Verified via 25-point Assignment Lifecycle Vitest Integration Suite & Cloud SQL Schema Inspection |
| **Phase 10: Advanced Assessment & Examination Management Engine** | Unified university-grade Examination Engine supporting `OBJECTIVE`, `ESSAY`, and `HYBRID` modes across 8 objective question types (`SINGLE_CHOICE`, `MULTIPLE_SELECT`, `TRUE_FALSE`, `MATCHING`, `ORDERING`, `FILL_IN_BLANK`, `SHORT_ANSWER`, `NUMERIC`) and 7 essay types (`SHORT_ESSAY`, `LONG_ESSAY`, `CASE_STUDY`, `ANALYTICAL_RESPONSE`, `PROBLEM_SOLVING`, `PROGRAMMING_EXPLANATION`, `DOCUMENT_RESPONSE`), reusable Question Bank & Random Question Pools (`question_banks`, `questions`, `assessment_question_pools`), server-authoritative Attempt Engine with immutable snapshots (`attempt_questions`), strict answer-key isolation (`student_options_snapshot` vs `server_answer_key_snapshot`), Student Examination Workspace (`AssessmentExaminationPage`), Instructor Real-Time Monitoring (`AssessmentMonitoringPage`), Essay & Hybrid Rubric Grading Workspace (`AssessmentEssayGradingPage`), and PostgreSQL Item & Distractor Analysis | **COMPLETED** | Verified via 23-point Assessment Lifecycle Vitest Integration Suite & Cloud SQL Schema Inspection |
| **Phase 11: Master Academic Classroom Management System** | Master Academic Period Management (CRUD, single default atomic enforcement), Categorized Academic Calendar Events, Course Offerings, Facilities & Room Master, Real-Time Schedule Conflict Detection (`POST /api/v1/schedules/conflicts`), Advanced 6-Step Classroom Builder Wizard (`ClassroomBuilderWizardPage`), Student Course Catalog Discovery (`ClassroomCatalogPage`), Waitlist queueing, and Comprehensive Participant Management (`ClassroomParticipantsPage`) | **COMPLETED** | Verified via 27-point Vitest Integration Suite |
| **Phase 12: Local Development, Vite HMR & Custom Authentication Hardening** | Unified Fastify + Vite HMR WebSocket binding on port 3000 (resolving standalone ws://0.0.0.0:24678 failures), 0.0.0.0 browser destination redirect to localhost, environment-aware cookie transport (`SameSite=Lax`, `Secure=false` in dev HTTP; `Secure=true` in prod HTTPS), React StrictMode session check deduplication, robust loading/authenticated/unauthenticated auth state machine, TanStack Query 401/403 retry suppression, `enabled: !!user` dashboard query guards, branded favicon SVG/ICO, and `.env` hardening | **COMPLETED** | Verified via 13-point automated verification harness, full Vitest suite (8/8 passed), and production build |
| **Phase 13: Superadmin Navigation Architecture & Academic Control Center** | Structured collapsible sidebar navigation (Group A: Overview, Group B: Manajemen Akademik, Group C: Manajemen Ruang Kelas, Group D: Manajemen Sistem), first-class integration of `/academic-periods` into sidebar, compact/wide sidebar toggle, mobile drawer with auto-close, upgraded Academic Period page (4 summary cards, primary action "Buka Semester Baru", 4 tabs: Periods, Calendar, Settings, History), transformed Superadmin Dashboard into an Executive Control Center (KPI strip, Quick actions bar, Active period status, Upcoming events, Pending approvals queue, Recent classrooms, and Recent audit logs), and modular dedicated management pages (`UserManagementPage`, `RbacManagementPage`, `AuditLogsPage`, `MasterCoursesPage`, `CourseOfferingsPage`, `CampusFacilitiesPage`, `ClassroomsListPage`, `LecturerAssignmentsPage`, `ClassSchedulesPage`) with frontend `AdminRoute` and backend RBAC guards | **COMPLETED** | Verified via full Vitest suite (8/8 passed), `npx tsc --noEmit` (0 errors), and Vite production build |
| **Phase 14: Academic Period Management — Pure Semester CRUD & RBAC** | Pure semester administration system exclusively managing academic periods and semester lifecycle (`DRAFT`, `SCHEDULED`, `ACTIVE`, `COMPLETED`, `ARCHIVED`). Completely removed all KRS and registration functionality from UI, API, and RBAC. Purged Academic Calendar navigation and active interfaces while preserving historical tables. Granular RBAC (`academic_period.view`, `create`, `update`, `delete`, `activate`, `set_default`, `complete`, `archive`, `view_history`) with Superadmin controls and Dosen/Mahasiswa read-only views. Strict single default semester database constraint (`idx_academic_periods_single_default`), non-destructive lifecycle rules, immutable audit history (`audit_logs`), and archived read-only invariant | **COMPLETED** | Verified via 24-point Vitest Integration Suite (9/9 passed, 0 failures), `npx tsc --noEmit` (0 errors), and Vite production build |
| **Phase 15: System Refactoring — Decouple Digital Classroom & Remove Legacy Academic Modules** | Full architectural refactoring and removal of Course Master, Course Offering, and Campus Facilities modules. Digital Classroom decoupled into an autonomous domain entity with native `subject_name`, `subject_code`, `academic_year`, `semester_name`, and `location_description` fields (`course_id` and `semester_id` made nullable). Complete removal of dead routes (`/courses`, `/course-offerings`, `/facilities`), page files, sidebar links, dashboard shortcuts, and backend endpoints (`POST /api/v1/academic/courses`, `GET/POST /api/v1/course-offerings`, `GET /api/v1/campus/buildings`, `GET /api/v1/campus/rooms`). Purged `academic:manage` permission from RBAC. Preserved 100% of Digital Classroom learning activities, submissions, grading, enrollments, and audit logs | **COMPLETED** | Verified via Migration 0005, complete Vitest suite (10/10 passed, 0 failures), `npx tsc --noEmit` (0 errors), and Vite production build |
| **Phase 16: Complete LMS 6-Module Removal & Architectural Refactoring** | Complete removal of Student Course Registration Catalog (`/catalog`), Lecturer Assignment & Teaching Team (`/lecturer-assignments`), and Timetable & Lecture Scheduling (`/schedules`). Completely removed obsolete page files (`ClassroomCatalogPage.tsx`, `LecturerAssignmentsPage.tsx`, `ClassSchedulesPage.tsx`), frontend routes (redirected to `/classrooms`), navigation links from Superadmin/Dosen/Mahasiswa sidebars, and backend endpoints (`GET /api/v1/classrooms/catalog`, `POST /api/v1/classrooms/:id/enroll`). Preserved 100% of independent Digital Classroom enrollment (Join Code, direct invitations, bulk enroll, approval workflows, waitlists) and per-classroom instructor assignments (`classroom_instructors`). Verified 100% test pass rate and clean build | **COMPLETED** | Verified via full Vitest integration suite (10/10 passed, 0 failures), `npx tsc --noEmit` (0 errors), and Vite production build |
| **Phase 17: Digital Classroom Creation Wizard Refactoring — 5 Steps, CPMK, Lightweight Rich Text Editor & Sharp Image Optimization** | Refactored Classroom Builder Wizard into exactly 5 steps (Identitas Kelas, Konteks Akademik, Tim Pengajar, Aturan Pendaftaran, Review & Publikasi), completely purging schedule and physical room configuration. Added dedicated Capaian Pembelajaran (CPMK) / Silabus multiline field, lightweight Tiptap rich text editor (bold, italic, underline, strike, headings, lists, alignment, link, undo/redo — strictly no images/tables/videos), and optional Sharp-powered cover image optimization engine (MIME & magic-bytes validation, EXIF orientation/strip, standard 1280x720, thumbnail 480x270, WebP conversion, storage metadata, cover serving endpoint, and cover deletion). Verified 100% test pass rate and clean build | **COMPLETED** | Verified via Migration 0006, full Vitest suite (11/11 passed, 0 failures), `npx tsc --noEmit` (0 errors), and Vite production build |
| **Phase 18: Advanced Digital Classroom Workspace Refactoring** | Context-aware Instructor Analytics Dashboard (15 real PostgreSQL KPIs, module completion bars, donut/distribution analytics, Student Attention Center `Perlu Perhatian Dosen` with individual notification, Recent Class Activity) and Student Learning Dashboard (`Lanjutkan Pembelajaran`, 8 KPIs, module progress, upcoming deadlines, recent grades); refactored Classwork with Quick Navigation collapsible sidebar, Unified Classroom Search, Module Management (CRUD, Archive/Restore, Reorder, Duplicate), Resource-level RBAC & `CO_INSTRUCTOR` ownership enforcement across modules/materials/assignments/assessments, Append-only Change History (`classroom_audit_logs`) with before/after JSONB snapshots & filters, Material Completion Tracking (`Tandai Selesai`, required-only module progress %), Bookmarks, Private Notes, View History, Content Versioning & Restore (`classroom_resource_versions`), and Student Progress Monitoring with CSV export & individual student reports | **COMPLETED** | Verified via Migration 0007, full Vitest integration suite (12/12 passed, 0 failures), `npx tsc --noEmit` (0 errors), and Vite production build |
| **Phase 19: Global Delete Confirmation Dialog Refactoring** | Replaced all native browser confirmation dialogs (`window.confirm()`, `confirm()`) and unconfirmed destructive delete actions across the LMS with a centralized, accessible `ConfirmDialog` (`role="alertdialog"`, Escape key handling, focus restoration, destructive red styling, target resource badge, dependency/consequence warnings, loading state `"Menghapus..."`, and inline error recovery) and reusable `useDeleteConfirmation` hook across `ClassroomPage`, `ClassroomBuilderWizardPage`, `ClassroomParticipantsPage`, `MaterialBuilderPage`, `AssignmentBuilderPage`, and `ClassroomCoverUploader` | **COMPLETED** | Verified via global codebase grep (0 native dialogs remaining), `npx tsc --noEmit` (0 errors), full Vitest suite (12/12 passed), and Vite production build |
| **Phase 20: Advanced Classroom Settings Center** | Redesigned Digital Classroom Settings tab into a 7-section Advanced Management Center (`ClassroomSettingsCenter.tsx` + `classroomSettingsRoutes.ts` + Migration `0008_classroom_settings_config.sql`): (1) `Informasi Kelas` with identity fields, `LightweightTiptapEditor` (no images/tables), CPMK, Sharp-optimized cover image uploader, live preview, metadata, and no schedule/location fields; (2) `Pendaftaran & Akses` with 4 policies (`AUTO`, `APPROVAL_REQUIRED`, `INVITATION_ONLY`, `INSTRUCTOR_MANAGED`), capacity, Join Code governance (generate, copy, regenerate, revoke, expiration, max uses, history), and enrollment request approval/rejection; (3) `Tim Pengajar` with Creator protection, Co-Instructor add/remove, and granular Permission Matrix; (4) `Keamanan & Privasi` (`privacy_config`); (5) `Notifikasi` (`notification_config`); (6) `Riwayat Aktivitas` with append-only audit log filtering, search, pagination, and JSON diff; (7) `Status & Arsip` with Archive/Restore preserving academic records, Deletion Impact summary, and controlled deletion via `ConfirmDialog` | **COMPLETED** | Verified via Migration 0008, `npx tsc --noEmit` (0 errors), full Vitest suite (13/13 passed, 0 failures), and Vite production build |
| **Phase 21: Advanced Assessment & Examination Builder** | Refactored Assessment Builder into a 9-section system (`AssessmentBuilderPage.tsx`, `QuestionRepositoryPanel.tsx`, `QuestionImportCenterPanel.tsx`, `QuestionMediaUploader.tsx`, `AssessmentAnalyticsHistoryPanel.tsx`, `assessmentCenterRoutes.ts`, Migration `0009_advanced_assessment_builder.sql`): (1) Sharp WebP image optimization + thumbnails & MP3/WAV/M4A/OGG/WebM audio upload with HTTP 206 Range streaming and safe reference-checked deletion; (2) Question Repository (`GET /api/v1/question-repository`) populated from Question Editor & Imports with `DRAFT`/`READY`/`ARCHIVED` lifecycle, ownership RBAC, and immutable `question_snapshot` reuse (`POST /api/v1/assessments/:id/import-from-repository`, `POST /sync-question-snapshots` blocked on published assessments); (3) 9-step Excel/CSV Import Center with official 4-sheet XLSX & UTF-8 BOM CSV templates, row-level validation, and chunked background batch processing (`question_import_jobs`, `question_import_errors`) supporting >200 rows, retry & cancel; (4) Desktop/Mobile Student Preview, Monitoring Summary, Grading & Psychometric Analytics, and Assessment Audit History (`GET /api/v1/assessments/:id/history`) | **COMPLETED** | Verified via Migration 0009, `npx tsc --noEmit` (0 errors), full Vitest suite (14/14 passed, 0 failures), and Vite production build |
| **Phase 22: Complete RBAC Refactoring & Access Control** | Centralized Authorization (`src/server/authorization.ts`, `src/lib/authorization.ts`), canonical 4-role hierarchy (`SUPERADMIN`, `DOSEN`, `MAHASISWA`, `AUDITOR`), contextual access control (`GLOBAL`, `CLASSROOM`, `SELF`), strict Auditor Read-Only enforcement (`FORBIDDEN_AUDITOR_READ_ONLY` on backend + disabled mutation controls on frontend), protected Superadmin permission safeguards, and full RBAC Management Center (`RbacManagementPage.tsx`) | **COMPLETED** | Verified via Phase 22 Vitest Integration Suite (15/15 passed, 0 failures), `npx tsc --noEmit` (0 errors), and Vite production build |
| **Phase 23: Academic Identity & User Administration Center (`/admin/users`)** | Complete refactoring of User Management (`UserManagementPage.tsx`, `UserDetailModal.tsx`, `UserImportWizardModal.tsx`, `userManagementRoutes.ts`): additive schema extensions (`account_status`, `must_reset_password`, `organizational_unit`, `nidn`, `nip`, `nim`, `academic_status`, `admission_year`, `audit_scope`, `password_reset_tokens`, `user_import_batches`), clickable 8-card real-DB KPI dashboard, debounced server-side search/filters/sorting/pagination, 5-tab User Detail with active session revocation, secure password reset & invitation token flow, bulk operations (`ACTIVATE`, `DEACTIVATE`, `ASSIGN_ROLE`), XLSX/XLS/CSV Import Wizard with downloadable templates & history, zero native dialogs (`ConfirmDialog` only), and Auditor read-only enforcement | **COMPLETED** | Verified via Phase 23 Vitest Integration Suite (16/16 passed, 0 failures), `npx tsc --noEmit` (0 errors), and Vite production build |

---

## 2. Database Migration Status

- **Database Engine**: Cloud SQL for PostgreSQL (`asia-southeast1`)
- **ORM & Migration Tooling**: Drizzle ORM (`drizzle-orm/node-postgres`) + Drizzle Kit (`src/db/drizzle.config.ts`)
- **Primary Keys**: UUID (`gen_random_uuid()`) across all 69 domain tables
- **Verified Tables in `public` Schema (69 Tables)**:
  1. `users`
  2. `user_profiles`
  3. `roles`
  4. `permissions`
  5. `user_roles`
  6. `role_permissions`
  7. `academic_years`
  8. `semesters`
  9. `courses`
  10. `classrooms`
  11. `classroom_instructors`
  12. `classroom_join_codes`
  13. `classroom_enrollments`
  14. `classroom_topics`
  15. `stored_files`
  16. `learning_materials`
  17. `material_attachments`
  18. `material_videos`
  19. `material_progress`
  20. `material_revisions`
  21. `announcements`
  22. `comments`
  23. `assignments`
  24. `assignment_attachments`
  25. `assignment_rubrics`
  26. `assignment_rubric_criteria`
  27. `assignment_groups`
  28. `assignment_group_members`
  29. `assignment_submissions`
  30. `submission_revisions`
  31. `submission_versions`
  32. `submission_attachments`
  33. `submission_links`
  34. `submission_comments`
  35. `submission_grades`
  36. `submission_rubric_scores`
  37. `submission_events`
  38. `assignment_reminders`
  39. `quizzes`
  40. `quiz_questions`
  41. `quiz_options`
  42. `quiz_attempts`
  43. `quiz_answers`
  44. `grade_categories`
  45. `grade_items`
  46. `grade_records`
  47. `user_sessions`
  48. `notifications`
  49. `audit_logs`
  50. `assessments`
  51. `assessment_sections`
  52. `question_banks`
  53. `questions`
  54. `question_options`
  55. `question_media`
  56. `question_bank_tags`
  57. `assessment_questions`
  58. `assessment_question_pools`
  59. `assessment_attempts`
  60. `attempt_questions`
  61. `attempt_answers`
  62. `essay_attachments`
  63. `assessment_rubrics`
  64. `assessment_rubric_criteria`
  65. `essay_grades`
  66. `essay_feedback`
  67. `assessment_results`
  68. `assessment_events`
  69. `assessment_accommodations`

---

## 3. Existing Modules

- `src/db/schema.ts`: Complete normalized 80-table PostgreSQL schema with foreign keys, composite unique indexes, and B-tree indexes (including Academic Periods, Academic Calendar Events, Course Offerings, Campus Buildings, Campus Rooms, Classroom Schedules, Classroom Enrollment Policies, Classroom Waitlists, Classroom Invitations, Classroom Approvals, and Classroom Events).
- `src/db/index.ts`: Lazy PostgreSQL connection pool using the Object Method (`SQL_HOST`, `SQL_USER`, `SQL_PASSWORD`, `SQL_DB_NAME`).
- `src/db/drizzle.config.ts`: Drizzle Kit admin migration configuration (`SQL_ADMIN_USER`, `SQL_ADMIN_PASSWORD`).
- `src/server/security.ts`: Argon2id hashing, SHA-256 session token digest, CSRF protection, sliding-window login rate limiter, centralized 37-item `PERMISSION_REGISTRY` (with `actionType`, `riskLevel`, `allowedContext`, `isProtected`, `auditorAllowed`), canonical 4-role `ROLE_PERMISSION_MAP` (`SUPERADMIN`, `DOSEN`, `MAHASISWA`, `AUDITOR`), `ensureRbacInitialized()` safe legacy migration, centralized `AUDITOR` read-only mutation/export guard & audit logging, and contextual `checkClassroomAccess()`.
- `src/lib/authorization.ts`, `src/components/ForbiddenPage.tsx`, `src/pages/RbacManagementPage.tsx`: Centralized frontend permission service, route-level `PermissionRoute` + 403 UI, permission-driven `AppShell` navigation, and Academic Access Control Center (`/admin/rbac`) with KPI overview, role cards, grouped permission panels, protected Superadmin/Auditor rules, and RBAC change history.
- `src/server/storage.ts`: S3-compatible private object storage engine with HMAC-SHA256 presigned `PUT`/`GET` URLs, magic-byte & SHA-256 verification, Mammoth DOCX-to-HTML sanitization, SheetJS XLSX multi-sheet parser, and YouTube/Vimeo URL validator.
- `src/server/academicClassroomRoutes.ts`: Comprehensive REST API endpoints for Master Academic Period Management (Superadmin-only CRUD, state transitions, atomic single default period enforcement), Academic Calendar (categorized campus events), Course Offerings, Campus Facilities & Rooms, Real-Time Schedule Conflict Detection (`POST /api/v1/schedules/conflicts`), Advanced Classroom Builder (6-step wizard API), Classroom Lifecycle (`draft`, `pending_approval`, `scheduled`, `active`, `completed`, `archived`), Student Catalog Discovery, Concurrency-Safe Self-Enrollment & Waitlist Queueing, Direct Join Code with usage limits, Participant Management, and Role-Specific Dashboards.
- `src/server/materialRoutes.ts`: REST API endpoints for the Advanced Learning Material Builder, S3 presigned uploads/downloads (with student submission & exam attachment object-key isolation), HTTP 206 Range video streaming, isolated document previews, publication scheduling, and student learning progress tracking.
- `src/server/assignmentRoutes.ts`: 23+ REST API endpoints for the Advanced Assignment Builder, S3 presigned instructor & student submission uploads, rubric configuration, active participant & missing submission tracking, submission versioning, late calculation, direct/rubric/combined grading, draft vs. published grade visibility, return-for-revision, bulk reminders, real-time analytics, and CSV/XLSX exports.
- `src/server/assessmentGradingEngine.ts`: Server-authoritative question snapshot builder (`buildQuestionSnapshots` stripping answer keys from student DTOs), deterministic PRNG shuffler, 8-type objective auto-grading engine (`evaluateObjectiveQuestion` with partial credit, numeric tolerance, and optional negative marking), and weighted rubric essay scoring engine (`calculateServerEssayQuestionScore`).
- `src/server/assessmentRoutes.ts`: Comprehensive REST API endpoints for Question Banks, 15 Question Types, Assessment Builder (`OBJECTIVE`, `ESSAY`, `HYBRID`), Random Question Pools, Student Accommodations, Attempt Engine (`start`, `resume`, `autosave`, `submit`, server-side timeout enforcement), Instructor Live Monitoring, Essay & Hybrid Rubric Grading, Grade Publication Locks, and PostgreSQL Item & Distractor Analysis.
- `src/server/routes.ts`: Fastify `/api/v1` core REST API endpoints with Zod validation and transactional business logic.
- `src/components/TiptapMaterialEditor.tsx`: Canonical Tiptap JSONB rich text editor reused across Learning Materials, Assignment Instructions, Student Responses, Assessment Prompts, Essay Answers, and Instructor Feedback.
- `src/components/DocumentPreviewModal.tsx`: Isolated multi-format preview modal (PDF stream, DOCX sanitized HTML, XLSX SheetJS interactive grid, Image zoom viewer, Video player, and PPTX slide text fallback).
- `src/pages/AcademicPeriodsPage.tsx`: Superadmin Workspace for Academic Periods & Academic Calendar event management with timeline visualization.
- `src/pages/ClassroomBuilderWizardPage.tsx`: Advanced 6-step Classroom Builder wizard (Academic Master, Classroom Profile, Teaching Team, Recurring Schedules & Facilities with Conflict Detection, Enrollment Rules & Quotas, Review & Publication).
- `src/pages/ClassroomParticipantsPage.tsx`: Instructor & Admin Participant Management with teaching team, active student roster, pending approval reviews, waitlist queue, and CSV roster export.
- `src/pages/ClassroomPage.tsx`, `src/components/AppShell.tsx`, `src/components/classroom/StudentDashboardOverview.tsx`: Modern Academic Classroom Workspace UI/UX Redesign (`#F7F9FC` / `#FFFFFF` / `#14213D` / `#2563EB` / `#E2E8F0` design system), compact academic header with optional cover image fallback, copyable join code, responsive 6-tab navigation (horizontal desktop/tablet tabs + mobile 5-destination bar with `Lainnya` drawer for Analytics & Settings), real-time instructor & student KPI strips on Stream, and mobile card views for People & Grades (320px+ responsive).
- `src/pages/AssignmentBuilderPage.tsx`, `src/pages/AssignmentWorkspacePage.tsx`, `src/pages/AssignmentMonitoringPage.tsx`, `src/pages/AssignmentGradingPage.tsx`: Complete Assignment, Submission & Grading lifecycle workspaces.
- `src/pages/AssessmentBuilderPage.tsx`, `src/pages/AssessmentExaminationPage.tsx`, `src/pages/AssessmentMonitoringPage.tsx`, `src/pages/AssessmentEssayGradingPage.tsx`: Full Assessment, Examination & Grading workspaces.
- `src/tests/api.test.ts`: Comprehensive Vitest integration and security verification suite covering all core LMS, Advanced Learning Material Builder (19 points), Advanced Assignment, Submission & Grading Management (25 points), Advanced Assessment & Examination Management Engine (23 points), Master Academic Classroom Management (27 points), Academic Period Management (24 points), and Decoupled Classroom & Module Removal (Phases 15 & 16) requirements.

- `DIGITAL_CLASSROOM_ARCHITECTURE.md`: Comprehensive specification for the autonomous Digital Classroom domain, membership, direct enrollment mechanisms, and learning feature suites.
- `MODULE_REMOVAL_REPORT.md`: Comprehensive architectural report on the complete removal of the 6 legacy academic modules (Course Master, Course Offering, Facilities, Catalog, Lecturer Assignments, Schedules).
- `LOCAL_DEVELOPMENT.md`: Comprehensive local setup, architecture guide, Vite HMR configuration, cookie transport, and verification procedures.

---

## 4. Known Bugs & Pending Requirements

- **Known Bugs**: None. All previous WebSocket HMR connection issues (ws://0.0.0.0:24678), cookie transport rejection (401 on /auth/me, /classrooms, /academic/overview), missing favicon, and React StrictMode duplicate request issues have been completely resolved and verified.
- **Pending Requirements**: All requested deliverables for Politeknik Kampar LMS, Advanced Learning Material Builder, Advanced Assignment, Submission & Grading Management, Advanced Assessment & Examination Management Engine, Master Academic Classroom Management System, Classroom UI/UX Redesign (Responsive All Devices), and Local Development Infrastructure are complete and 100% verified.
