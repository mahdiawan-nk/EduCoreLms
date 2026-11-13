# DATABASE DESIGN — POLITEKNIK KAMPAR LMS

## 1. Architecture & Normalization Rules

- **Database Engine**: External PostgreSQL (Cloud SQL in `asia-southeast1`)
- **ORM & Migration Engine**: Drizzle ORM (`drizzle-orm/node-postgres`) + Drizzle Kit (`drizzle/*.sql`)
- **Primary Keys**: UUID v4 (`gen_random_uuid()`) across all 69 tables
- **Referential Integrity**: Explicit foreign keys (`REFERENCES ... ON DELETE CASCADE / SET NULL`), composite unique constraints, and B-tree indexes on high-cardinality lookup columns (`classroom_id`, `assignment_id`, `assessment_id`, `attempt_id`, `question_id`, `student_id`, `submission_id`, `status`).

---

## 2. Core Assignment, Submission & Grading Schema

### 2.1 `assignments`
Stores comprehensive assignment definitions, submission rules, late policies, and publication schedules:
- **Identity & Hierarchy**: `id` (UUID PK), `classroom_id` (FK -> `classrooms.id`), `topic_id` (FK -> `classroom_topics.id`), `created_by` (FK -> `users.id`), `slug`, `meeting_number`, `sequence_order`
- **Content & Metadata**: `title`, `subtitle`, `short_description`, `learning_objectives`, `assignment_type` (`INDIVIDUAL`, `GROUP`, `PRACTICAL`, `PROJECT`, `REPORT`, `ESSAY`, `PORTFOLIO`), `instruction_json` (`JSONB` canonical Tiptap document), `instruction_html` (`TEXT`), `instructions` (`TEXT`), `cover_image_key`
- **Scoring & Grading Configuration**: `max_score` (`NUMERIC(6,2)`), `max_points` (`INTEGER`), `passing_score` (`NUMERIC(6,2)`), `Estimated_duration_minutes`, `grading_type` (`NUMERIC`, `RUBRIC`, `PASS_FAIL`, `LETTER`), `enable_rubric` (`BOOLEAN`), `show_rubric_to_students` (`BOOLEAN`)
- **Submission Rules**: `submission_type` (`FILE_UPLOAD`, `TEXT_ENTRY`, `EXTERNAL_LINK`, `COMBINED`), `allowed_extensions` (`JSONB` array, e.g., `["pdf","doc","docx","xls","xlsx","ppt","pptx","jpg","jpeg","png","webp"]`), `max_file_size_mb`, `max_files_count`, `allow_resubmission`, `max_attempts`, `resubmission_rule`
- **Deadlines & Late Policy**: `available_from`, `due_at`, `cutoff_at`, `allow_late_submission`, `grace_period_minutes`, `late_penalty_type` (`NONE`, `PERCENT_PER_DAY`, `FIXED_DEDUCTION`, `ZERO_AFTER_DEADLINE`), `late_penalty_percent`, `late_max_score_cap`
- **Publication & Visibility**: `status` (`DRAFT`, `PUBLISHED`, `SCHEDULED`, `CLOSED`, `ARCHIVED`), `scheduled_at`, `published_at`, `visibility` (`ALL_STUDENTS`, `SPECIFIC_GROUPS`, `INSTRUCTOR_ONLY`), `enable_comments`, `require_confirmation`

### 2.2 `assignment_attachments`
Instructor reference files, starter templates, datasets, and rubric documents stored in private S3 storage:
- `id` (UUID PK), `assignment_id` (FK -> `assignments.id` CASCADE), `file_id` (FK -> `stored_files.id`)
- `file_name`, `original_name`, `file_key`, `mime_type`, `file_extension`, `file_size`, `checksum`, `attachment_category` (`INSTRUCTION`, `TEMPLATE`, `WORKSHEET`, `DATASET`, `EXAMPLE`, `RUBRIC`, `OTHER`), `sort_order`, `created_at`

### 2.3 `assignment_rubrics` & `assignment_rubric_criteria`
Multi-criterion weighted rubrics:
- `assignment_rubrics`: `id` (UUID PK), `assignment_id` (FK -> `assignments.id` CASCADE), `title`, `description`, `total_weight`, `created_at`, `updated_at`
- `assignment_rubric_criteria`: `id` (UUID PK), `rubric_id` (FK -> `assignment_rubrics.id` CASCADE), `assignment_id` (FK -> `assignments.id` CASCADE), `title`, `description`, `weight` (`NUMERIC(6,2)`), `max_score` (`NUMERIC(6,2)`), `sort_order`

### 2.4 `assignment_groups` & `assignment_group_members`
Group assignment support:
- `assignment_groups`: `id` (UUID PK), `assignment_id` (FK), `name`, `leader_id` (FK -> `users.id`)
- `assignment_group_members`: `id` (UUID PK), `group_id` (FK), `student_id` (FK -> `users.id`), unique index on `(group_id, student_id)`

### 2.5 `assignment_submissions` & `submission_versions`
Canonical student submission state and immutable version history:
- `assignment_submissions`:
  - `id` (UUID PK), `assignment_id` (FK -> `assignments.id` CASCADE), `student_id` (FK -> `users.id` CASCADE), `group_id` (FK -> `assignment_groups.id`)
  - `submission_status` (`not_submitted`, `draft`, `submitted`, `resubmitted`, `late`, `under_review`, `graded`, `returned_for_revision`, `excused`)
  - `grading_status` (`not_graded`, `draft`, `graded`, `returned_for_revision`, `published`)
  - `current_version`, `attempt_count`, `submission_content_json` (`JSONB`), `submission_content_html`, `submission_text`, `student_notes`, `external_links_json` (`JSONB`)
  - `is_late`, `late_minutes`, `penalty_percent_applied`, `raw_score`, `score`, `final_score`, `feedback`, `feedback_json` (`JSONB`), `private_instructor_notes`, `is_grade_published`, `published_grade_at`, `returned_at`, `idempotency_key`
  - Composite unique index on `(assignment_id, student_id)`
- `submission_versions`:
  - `id` (UUID PK), `submission_id` (FK -> `assignment_submissions.id` CASCADE), `version_number`
  - `submission_content_json` (`JSONB`), `submission_content_html`, `submission_text`, `student_notes`, `external_links_json` (`JSONB`), `is_late`, `late_minutes`, `submitted_by` (FK -> `users.id`), `submitted_at`
  - Composite unique index on `(submission_id, version_number)`

### 2.6 `submission_attachments` & `submission_links`
Student uploaded files and external links per submission version:
- `submission_attachments`: `id` (UUID PK), `submission_id` (FK), `version_id` (FK -> `submission_versions.id`), `file_id` (FK -> `stored_files.id`), `file_name`, `original_name`, `file_key` (`submissions/<assignmentId>/<studentId>/<uuid>.<ext>`), `mime_type`, `file_extension`, `file_size`, `checksum`, `uploaded_by`, `created_at`
- `submission_links`: `id` (UUID PK), `submission_id` (FK), `version_id` (FK), `label`, `title`, `url`, `created_at`

### 2.7 `submission_grades`, `submission_rubric_scores`, `submission_comments`, `submission_events`, `assignment_reminders`
- `submission_grades`: Immutable audit log of every grading action (`grading_method`, `raw_score`, `rubric_score`, `late_penalty_score`, `final_score`, `letter_grade`, `pass_fail`, `feedback_text`, `feedback_json`, `private_notes`, `grading_status`, `is_published`, `graded_by`, `graded_at`, `published_at`).
- `submission_rubric_scores`: Per-criterion score (`criterion_id`, `score`, `weighted_score`, `feedback`).
- `submission_comments`: Threaded discussion on a submission with `visibility` (`STUDENT_VISIBLE` vs. `INSTRUCTOR_PRIVATE`).
- `submission_events`: Immutable lifecycle timeline (`SUBMITTED`, `RESUBMITTED`, `GRADE_PUBLISHED`, `GRADE_SAVED_DRAFT`, `RETURNED_FOR_REVISION`).
- `assignment_reminders`: Tracks instructor reminders sent to students who have not yet submitted.

---

## 3. Advanced Assessment & Examination Management Schema (20 Tables)

### 3.1 `assessments` & `assessment_sections`
- `assessments`: Unified examination definition supporting `assessment_mode` (`OBJECTIVE`, `ESSAY`, `HYBRID`), `category` (`QUIZ`, `MIDTERM`, `FINAL_EXAM`, `PRACTICAL_TEST`, `DIAGNOSTIC`, `REMEDIAL`), Tiptap `instructions_json`, `max_score`, `passing_grade`, `duration_minutes`, `max_attempts`, `start_date`, `end_date`, `late_attempt_policy` (`REJECT`, `ALLOW_MARK_LATE`, `PENALTY_PERCENT`), `settings_config` (`JSONB` for randomization, navigation, autosave, negative marking, explanation & result visibility), and `status` (`DRAFT`, `PUBLISHED`, `SCHEDULED`, `CLOSED`, `ARCHIVED`).
- `assessment_sections`: Divides an assessment into ordered sections (e.g., Section A Objective, Section B Essay) with `section_type`, `total_points`, `sort_order`, and `randomize_questions`.

### 3.2 `question_banks`, `questions`, `question_options`, `question_media`, `question_bank_tags`
- `question_banks`: Reusable repositories of questions categorized by `classroom_id`, `course_id`, `subject`, `topic`, and `is_shared`.
- `questions`: Supports 8 Objective types (`SINGLE_CHOICE`, `MULTIPLE_SELECT`, `TRUE_FALSE`, `MATCHING`, `ORDERING`, `FILL_IN_BLANK`, `SHORT_ANSWER`, `NUMERIC`) and 7 Essay types (`SHORT_ESSAY`, `LONG_ESSAY`, `CASE_STUDY`, `ANALYTICAL_RESPONSE`, `PROBLEM_SOLVING`, `PROGRAMMING_EXPLANATION`, `DOCUMENT_RESPONSE`). Includes `difficulty` (`EASY`, `MEDIUM`, `HARD`), `learning_outcome`, `points`, `negative_points`, `partial_credit_enabled`, `answer_config` (`JSONB` storing matching pairs, ordering sequences, fill-in-blank answers, short-answer variants, numeric exact value & tolerance, or essay word limits & model answer), `version_number`, and `version_history` (`JSONB`).
- `question_options`: Choice options (`option_label`, `option_text`, `is_correct`, `score_weight`, `feedback`, `sort_order`).
- `question_media` & `question_bank_tags`: Private S3 media attachments and searchable learning outcome tags per question.

### 3.3 `assessment_questions`, `assessment_question_pools`, `assessment_accommodations`
- `assessment_questions`: Links specific questions to an assessment section with optional `points_override`, `negative_points_override`, and `rubric_id`.
- `assessment_question_pools`: Configures random question sampling from a question bank by `category_filter`, `topic_filter`, `difficulty_filter` (`ANY`, `EASY`, `MEDIUM`, `HARD`, `DISTRIBUTION`), `difficulty_distribution`, `question_count`, and `points_per_question`.
- `assessment_accommodations`: Per-student accessibility/medical accommodations (`extra_duration_minutes`, `extra_attempts`, `extended_end_date`, `reason`), uniquely indexed on `(assessment_id, student_id)`.

### 3.4 `assessment_attempts`, `attempt_questions`, `attempt_answers`, `essay_attachments`
- `assessment_attempts`: Server-authoritative examination attempt state (`IN_PROGRESS`, `SUBMITTED`, `AUTO_SUBMITTED`, `TIMED_OUT`, `GRADED`, `ABANDONED`, `INVALIDATED`), `started_at`, `server_deadline_at`, `submitted_at`, `objective_score`, `essay_score`, `total_score`, `percentage_score`, `passed`, `objective_grading_status`, `essay_grading_status`, `final_grading_status` (`IN_PROGRESS`, `PENDING_ESSAY`, `READY`, `PUBLISHED`), and `is_published_to_student`.
- `attempt_questions`: **Immutable question snapshot** created when an attempt starts. Stores `student_options_snapshot` (`JSONB` stripped of all answer keys for student delivery) separately from `server_answer_key_snapshot` (`JSONB` used exclusively on the server for grading). Editing a question later in the Question Bank never corrupts historical attempts.
- `attempt_answers`: Stores the student's autosaved answer payload (`answer_payload` `JSONB`), `is_answered`, `is_flagged`, `autosave_version`, `auto_score`, `manual_score`, `final_question_score`, `is_correct`, `partial_ratio`, and `grading_status`.
- `essay_attachments`: Private S3 files uploaded by students as part of `DOCUMENT_RESPONSE` or `CASE_STUDY` essay answers (`exam-attachments/<assessmentId>/<studentId>/...`).

### 3.5 `assessment_rubrics`, `assessment_rubric_criteria`, `essay_grades`, `essay_feedback`, `assessment_results`, `assessment_events`
- `assessment_rubrics` & `assessment_rubric_criteria`: Weighted evaluation criteria (`criterion_name`, `weight`, `max_score`, `performance_levels`) for essay and hybrid questions.
- `essay_grades` & `essay_feedback`: Stores instructor manual scores (`DIRECT` or `RUBRIC`), per-criterion breakdowns, `is_draft`, `revision_number`, `audit_history` (`JSONB`), and student-visible vs. instructor-private feedback.
- `assessment_results`: Aggregated student result per assessment (`best_attempt_id`, `latest_attempt_id`, `attempts_used`, `objective_score`, `essay_score`, `final_score`, `grading_status`, `is_published`), uniquely indexed on `(assessment_id, student_id)`.
- `assessment_events`: Immutable telemetry & audit log (`ATTEMPT_STARTED`, `ATTEMPT_SUBMITTED`, `ATTEMPT_AUTO_SUBMITTED`, `ESSAY_DRAFT_SAVED`, `ESSAY_GRADED`, `RESULTS_PUBLISHED`).

---

## 4. Academic Classroom Management Schema (11 Domain Tables)

### 4.1 `academic_periods` (Pure Semester Administration)
- Stores institution-wide academic periods and semester lifecycles exclusively controlled by Superadmin.
- **Fields**:
  - `id`: UUID (Primary Key, `defaultRandom()`)
  - `code`: text NOT NULL UNIQUE (academic_code, e.g. `20261`)
  - `name`: text NOT NULL (e.g. `Semester Ganjil 2026/2027`)
  - `academic_year`: text NOT NULL (e.g. `2026/2027`)
  - `semester_type`: text NOT NULL (`ODD`, `EVEN`, `SHORT`)
  - `description`: text NOT NULL DEFAULT ''
  - `preparation_start_date`: timestamp with time zone (nullable)
  - `start_date`: timestamp with time zone NOT NULL (lecture_start_date)
  - `end_date`: timestamp with time zone NOT NULL (lecture_end_date)
  - `status`: text NOT NULL DEFAULT 'DRAFT' (`DRAFT`, `SCHEDULED`, `ACTIVE`, `COMPLETED`, `ARCHIVED`)
  - `is_default`: boolean NOT NULL DEFAULT false
  - `administrative_notes`: text NOT NULL DEFAULT ''
  - `created_by_id`: uuid REFERENCES `users(id)` ON DELETE SET NULL
  - `metadata`: JSONB NOT NULL DEFAULT '{}'
  - `created_at`: timestamp with time zone NOT NULL DEFAULT now()
  - `updated_at`: timestamp with time zone NOT NULL DEFAULT now()
- **Database Constraints & Indexes**:
  - `idx_academic_periods_single_default`: UNIQUE INDEX ON `academic_periods(is_default)` WHERE `is_default = true` (enforces at most one default semester across the institution)
  - `chk_academic_periods_semester_type`: CHECK (`semester_type` IN ('ODD', 'EVEN', 'SHORT'))
  - `chk_academic_periods_status`: CHECK (`status` IN ('DRAFT', 'SCHEDULED', 'ACTIVE', 'COMPLETED', 'ARCHIVED'))
  - `chk_academic_periods_dates`: CHECK (`start_date` < `end_date`)
- **Purity & Non-destructive Guarantees**:
  - Obsolete KRS registration fields (`registration_start`, `registration_end`) purged cleanly.
  - Foreign keys from `classrooms` and `course_offerings` are preserved (`ON DELETE RESTRICT / SET NULL`).
  - Deletion blocked if referenced by classrooms, course offerings, or if the period was ever activated.

### 4.2 `academic_calendar_events`
- Categorized institutional events tied to an academic period.
- Fields: `id` (UUID PK), `academic_period_id` (FK -> `academic_periods`), `title`, `description`, `category` (`KRS_REGISTRATION`, `LECTURE_START`, `LECTURE_END`, `UTS`, `UAS`, `HOLIDAY`, `GRADE_SUBMISSION`, `GRADE_CORRECTION`, `REMEDIAL`, `REGISTRATION_DEADLINE`, `OTHER`), `start_date`, `end_date`, `is_holiday` (boolean), `visibility` (`ALL`, `LECTURER_ONLY`, `STUDENT_ONLY`, `ADMIN_ONLY`), `color` (hex string), `created_by_id` (FK -> `users`), `created_at`, `updated_at`.

### 4.3 `classrooms` (Decoupled Autonomous Architecture)
- Central digital learning environment, fully decoupled from master course and facility tables.
- **Identity & Academic Metadata**: `id` (UUID PK), `name` (text), `classroom_code` (text), `subject_name` (text), `subject_code` (text), `academic_year` (text), `semester_name` (text), `location_description` (text), `section` (text), `cohort` (text), `classroom_type` (`REGULAR`, `PRACTICAL`, `HYBRID`, `SHORT_SEMESTER`, `REMEDIAL`), `min_capacity` (int), `max_capacity` (int), `capacity` (int), `category` (text), `language` (text), `visibility` (`PUBLIC_ENROLLED`, `CAMPUS_WIDE`, `PRIVATE_RESTRICTED`), `learning_objectives` (text), `cpmk` (text, dedicated learning outcomes / syllabus), `cover_image_key` (text), `cover_image_path` (text, standard WebP cover), `cover_thumbnail_path` (text, 480x270 WebP thumbnail), `cover_mime_type` (text, 'image/webp'), `cover_file_size` (int), `cover_width` (int), `cover_height` (int), `cover_updated_at` (timestamp with time zone), `description` (text, sanitized lightweight rich text).
- **Lifecycle & Approvals**: `lifecycle_status` (`draft`, `pending_approval`, `scheduled`, `published`, `active`, `completed`, `archived`, `cancelled`), `approval_status` (`DRAFT`, `PENDING`, `APPROVED`, `REJECTED`), `scheduled_at`, `published_at`, `completed_at`, `archived_at`.
- **Decoupled Foreign Keys**: `academic_period_id` (FK -> `academic_periods`), `course_id` (UUID nullable, `onDelete: 'set null'`), `semester_id` (UUID nullable, `onDelete: 'set null'`), `course_offering_id` (UUID nullable, `onDelete: 'set null'`).

### 4.4 Legacy Historical Master Tables (Preserved for Historical Integrity)
- `courses`, `course_offerings`, `campus_buildings`, `campus_rooms`: Preserved in the database schema to maintain referential integrity with historical audit logs and past academic cycles, but completely decoupled from active LMS runtime logic, routes, wizards, and navigation.

### 4.5 `classroom_schedules`
- Weekly recurring timetable slots with flexible physical and online location metadata.
- Fields: `id` (UUID PK), `classroom_id` (FK -> `classrooms`), `day_of_week` (int 1-7, 1=Monday), `start_time` (varchar(10), e.g. `08:00`), `end_time` (varchar(10), e.g. `10:30`), `schedule_type` (`THEORY`, `PRACTICAL`, `TUTORIAL`, `SEMINAR`, `EXAM`), `location_description` (text, e.g. `Lab Komputer Lantai 2`, `Gedung Utama R-301`), `building_id` (FK nullable -> `campus_buildings`), `room_id` (FK nullable -> `campus_rooms`), `instructor_id` (FK -> `users`), `meeting_type` (`OFFLINE`, `ONLINE`, `HYBRID`), `online_link` (text), `created_at`, `updated_at`.
- Conflict detection: Checked across overlapping day of week and 24h time ranges for instructor and room. Operates reliably without requiring a physical `room_id`.

### 4.6 `classroom_enrollment_policies`
- Per-classroom enrollment governance rules and quota controls.
- Fields: `id` (UUID PK), `classroom_id` (FK -> `classrooms` UNIQUE), `enrollment_mode` (`AUTO`, `APPROVAL_REQUIRED`, `JOIN_CODE`), `min_participants` (int), `max_participants` (int), `waiting_list_enabled` (boolean), `max_waiting_list` (int), `join_code_max_uses` (int), `created_at`, `updated_at`.

### 4.7 `classroom_waitlists`
- First-In, First-Out (FIFO) queue for classrooms that have reached maximum student capacity.
- Fields: `id` (UUID PK), `classroom_id` (FK -> `classrooms`), `student_id` (FK -> `users`), `queue_number` (int), `status` (`WAITING`, `PROMOTED`, `EXPIRED`, `CANCELLED`), `request_date` (timestamp), `promoted_at` (timestamp).
- Unique constraint: Composite unique on `(classroom_id, student_id)`.

### 4.8 `classroom_invitations`
- Direct faculty or administrative invitations sent to students.
- Fields: `id` (UUID PK), `classroom_id` (FK -> `classrooms`), `student_id` (FK -> `users`), `invited_by_id` (FK -> `users`), `status` (`PENDING`, `ACCEPTED`, `REJECTED`, `EXPIRED`), `invitation_message` (text), `expires_at` (timestamp), `responded_at` (timestamp), `created_at`.

### 4.9 `classroom_approvals`
- Workflow records for classrooms requiring administrative verification prior to activation.
- Fields: `id` (UUID PK), `classroom_id` (FK -> `classrooms`), `requested_by_id` (FK -> `users`), `reviewer_id` (FK -> `users`), `status` (`PENDING`, `APPROVED`, `REJECTED`), `review_notes` (text), `requested_at` (timestamp), `reviewed_at` (timestamp).

### 4.10 `classroom_events`
- Immutable event stream logging classroom lifecycle transitions (`CLASSROOM_CREATED`, `CLASSROOM_SUBMITTED`, `CLASSROOM_APPROVED`, `CLASSROOM_PUBLISHED`, `CLASSROOM_COMPLETED`, `CLASSROOM_ARCHIVED`).
- Fields: `id` (UUID PK), `classroom_id` (FK -> `classrooms`), `actor_id` (FK -> `users`), `event_type` (varchar(50)), `payload` (JSONB), `created_at`.

### 4.11 `classroom_instructors` (Direct Classroom Teaching Team)
- Replaces institutional lecturer assignment mapping by managing teaching teams directly per classroom.
- Fields: `id` (UUID PK), `classroom_id` (FK -> `classrooms` CASCADE), `instructor_id` (FK -> `users` CASCADE), `role` (`PRIMARY_INSTRUCTOR`, `CO_INSTRUCTOR`, `TEACHING_ASSISTANT`), `is_primary` (boolean), `status` (`ACTIVE`, `PENDING_ACCEPTANCE`, `INACTIVE`), `assigned_at` (timestamp), `created_at`, `updated_at`.
- Invariant: Exactly one primary instructor per classroom (`is_primary = true`). Scoped permissions govern classroom management without dependency on institutional course offerings.

### 4.12 `classroom_join_codes` & Independent Enrollment
- Concurrency-safe self-enrollment mechanism decoupled from semester KRS registration.
- Fields: `id` (UUID PK), `classroom_id` (FK -> `classrooms` CASCADE), `code` (text UNIQUE), `is_active` (boolean), `max_uses` (int), `uses_count` (int), `expires_at` (timestamp), `created_at`, `updated_at`.
- Transactional enrollment locks guarantee that `uses_count` is incremented safely and capacity/waitlists are enforced atomically.
