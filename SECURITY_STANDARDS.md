# SECURITY STANDARDS — POLITEKNIK KAMPAR LMS

## 1. Authentication & Session Security

- **Password Hashing**: Argon2id (`argon2` package) with memory-hard parameters. Plaintext passwords are never logged or persisted.
- **Database Sessions**: Opaque random session tokens are hashed with **SHA-256** (`tokenHash`) before storage in `user_sessions`.
- **Cookie Policy**: Session cookies (`pk_lms_session`) and CSRF tokens (`pk_lms_csrf`) are issued with path `/`.
  - In local development over HTTP (`NODE_ENV=development`), cookies use `SameSite=Lax` and omit the `Secure` flag, allowing standard local browsers (localhost and LAN) to accept and persist cookies without SSL certificate errors.
  - In production (`NODE_ENV=production`) or when running over HTTPS, `Secure=true` and `SameSite=Lax` (or `SameSite=None` if cross-site) are strictly enforced.
  - `pk_lms_session` is strictly `HttpOnly=true`, preventing XSS cookie extraction.
  - `pk_lms_csrf` is readable by the client (`HttpOnly=false`) to support the double-submit / custom header CSRF protection pattern.
- **CSRF Protection**: All state-changing requests (`POST`, `PUT`, `PATCH`, `DELETE`) require a valid `X-CSRF-Token` header matching the authenticated session's `csrfToken`. Missing or mismatched tokens are rejected with `403 CSRF_TOKEN_MISMATCH`.

---

## 2. Authorization & Resource Ownership Policies (Deny-by-Default)

1. **Role-Based Access Control (RBAC)**:
   - Permissions are resolved from `user_roles` -> `role_permissions` -> `permissions` on every request.
2. **Classroom Ownership & Enrollment Verification**:
   - **Instructors (`DOSEN`)**: Must be assigned to the classroom in `classroom_instructors` (or be `SUPERADMIN`) to create/edit/delete assignments, view all participants, grade submissions, view analytics, or export grades.
   - **Students (`MAHASISWA`)**: Must hold an `active` enrollment in `classroom_enrollments` for the assignment's classroom to view published assignments or submit work.
3. **Strict Student Submission Isolation**:
   - A student can only view, edit, or upload files to their own submission (`submission.studentId === req.user.id` or membership in `submission.groupId`).
   - Requests by Student A to `GET /api/v1/submissions/:submissionIdOfStudentB` or `GET /api/v1/s3-presigned/object?key=submissions/<assignmentId>/<studentB>/...` are rejected with `403 FORBIDDEN`.
4. **Unpublished Grade & Instructor Private Note Confidentiality**:
   - When an instructor saves a grade as a draft (`publish: false` / `isGradePublished: false`), the backend strips `score`, `finalScore`, `feedback`, `grade`, and `rubricScores` from all student-facing API responses (`GET /api/v1/assignments/:id`, `GET /api/v1/submissions/:id`, `GET /api/v1/classrooms/:id`).
   - Instructor private notes (`privateInstructorNotes`, `submission_grades.private_notes`) and comments marked `INSTRUCTOR_PRIVATE` are never returned to student accounts under any circumstances.

---

## 3. File Upload & S3 Private Storage Security

- **No Public Buckets**: All instructor attachments and student submission files are stored in private S3-compatible storage (`submissions/${assignmentId}/${studentId}/${uuid}.${ext}`).
- **Extension & MIME Allowlist**: Student uploads are validated against the assignment's `allowedExtensions` (restricted to `pdf, doc, docx, xls, xlsx, ppt, pptx, jpg, jpeg, png, webp`). Executable and script formats (`.exe`, `.sh`, `.bat`, `.php`, `.js`, `.html`, `.svg`) are strictly blocked.
- **Magic-Byte & SHA-256 Verification**: Upon upload confirmation, the backend inspects the stored object's binary signature (magic bytes), enforces `maxFileSizeMb`, and verifies the SHA-256 digest before creating database records.
- **HTML & Rich Text Sanitization**: All Tiptap HTML output and Mammoth DOCX previews are sanitized via `sanitize-html` to strip `<script>`, `<iframe>` (except whitelisted YouTube/Vimeo embeds), `object`, `embed`, and inline `on*` event handlers.

---

## 4. Examination & Assessment Security Controls

1. **Strict Answer-Key Isolation**:
   - Students are blocked (`403 FORBIDDEN_ANSWER_KEY_ISOLATION`) from querying `GET /api/v1/question-banks/:id/questions`.
   - When an attempt is created, `buildQuestionSnapshots` splits the question into `student_options_snapshot` (which strips `isCorrect`, `scoreWeight`, `correctOrderIndex`, `correctSequenceIds`, `acceptedAnswers`, `acceptedVariants`, `exactValue`, `tolerance`, and `modelAnswer`) and `server_answer_key_snapshot`.
   - Student-facing endpoints (`GET /api/v1/assessments/:id` and `GET /api/v1/attempts/:id/questions`) never serialize `server_answer_key_snapshot`.
2. **Server-Authoritative Timers & Deadline Enforcement**:
   - The server calculates `serverDeadlineAt = startedAt + durationMinutes + extraDurationMinutes` when an attempt starts.
   - Client clocks are never trusted: `PUT /api/v1/attempts/:id/answers/:questionId` and `GET /api/v1/attempts/:id` compare `new Date()` on the server against `serverDeadlineAt` and automatically finalize/auto-submit expired attempts (`status = 'AUTO_SUBMITTED'`).
3. **Immutable Attempt Snapshots & Resume Integrity**:
   - Refreshing the browser or calling `POST /api/v1/assessments/:id/attempts` while an attempt is `IN_PROGRESS` resumes the existing attempt (`resumed: true`) with its frozen `attempt_questions` snapshot rather than regenerating questions or resetting the timer.
4. **Cross-Student Attempt & Attachment Isolation**:
   - Students cannot view, save answers to, or submit another student's attempt (`403 FORBIDDEN_ATTEMPT_OWNERSHIP`), nor can they access another student's `exam-attachments/<assessmentId>/<studentId>/...` S3 objects.
5. **Hybrid & Essay Grade Publication Locks**:
   - Unpublished scores (`isPublishedToStudent: false` and `resultsPublished: false`) are masked as `null` in all student responses.
   - `POST /api/v1/assessments/:id/publish-results` and `POST /api/v1/attempts/:id/essay-grades` (`publishToStudent: true`) reject publication with `400 INCOMPLETE_MANDATORY_GRADING` if any mandatory essay or manual-review question remains ungraded or in draft state.

---

## 5. Academic Period Management & Semester Lifecycle Security Controls

1. **Granular RBAC Matrix**:
   - Granular permissions: `academic_period.view`, `academic_period.create`, `academic_period.update`, `academic_period.delete`, `academic_period.activate`, `academic_period.set_default`, `academic_period.complete`, `academic_period.archive`, `academic_period.view_history`.
   - `SUPERADMIN`: Holds all academic period permissions.
   - `DOSEN` & `MAHASISWA`: Assigned `academic_period.view` only. Any mutating request (`POST`, `PATCH`, `DELETE`) or audit history request by non-superadmin actors is rejected with `403 FORBIDDEN_INSUFFICIENT_PERMISSIONS`.
2. **Strict Invariant Guards**:
   - **Single Default Semester**: Enforced at the database level via PostgreSQL partial unique index `idx_academic_periods_single_default` and atomic transactions.
   - **Archived Immutability**: Semesters marked `ARCHIVED` are permanently frozen. Any `PATCH` request targeting an archived period is blocked with `400 PERIOD_ARCHIVED`.
   - **Classroom Instantiation Prevention**: Instantiating classrooms under `COMPLETED` or `ARCHIVED` periods is blocked with `400 PERIOD_INACTIVE`.
   - **Non-destructive Deletion Eligibility**: Academic periods can only be deleted if they have 0 classrooms, 0 course offerings, and were never activated. Historical academic records are never cascade-deleted.
3. **No KRS / Registration Attack Surface**:
   - All registration endpoints (`close-registration`, `reopen-registration`), permissions, and form states have been permanently eliminated.
4. **Immutable Audit Logging**:
   - Every lifecycle mutation (`ACADEMIC_PERIOD_CREATED`, `ACADEMIC_PERIOD_UPDATED`, `ACADEMIC_PERIOD_DELETED`, `ACADEMIC_PERIOD_ACTIVATED`, `ACADEMIC_PERIOD_DEFAULT_CHANGED`, `ACADEMIC_PERIOD_COMPLETED`, `ACADEMIC_PERIOD_ARCHIVED`) is recorded in `audit_logs` capturing actor ID, timestamp, IP address, previous values, and new values.

---

## 6. Decoupled Digital Classroom & Module Removal Security Controls

1. **Permission Registry Hardening**:
   - The legacy master-data permission `academic:manage` has been completely purged from `PERMISSION_REGISTRY` and all role definitions.
   - Digital classroom management is guarded strictly by scoped permissions: `classrooms:create` (Superadmin, Dosen), `classrooms:teach` (Assigned Instructors), and `classrooms:manage_all` (Superadmin).
2. **Autonomous Classroom Data Isolation**:
   - Digital classrooms own their subject metadata (`subject_name`, `subject_code`, `academic_year`, `semester_name`, `location_description`) directly, eliminating unauthorized cross-module cascades or side-effects when curriculum templates change.
3. **Purged Attack Surface for Removed Modules**:
   - Endpoints for Course Master creation (`POST /api/v1/academic/courses`), Course Offerings (`/api/v1/course-offerings`), Campus Facilities (`/api/v1/campus/buildings`, `/api/v1/campus/rooms`), and Student Course Catalog (`GET /api/v1/classrooms/catalog`, `POST /api/v1/classrooms/:id/enroll`) return `404 Not Found`.
   - Frontend routes (`/courses`, `/course-offerings`, `/facilities`, `/catalog`, `/lecturer-assignments`, `/schedules`) redirect cleanly to `/classrooms`.
4. **Safe Referential Integrity & Non-Destructive Migrations**:
   - Legacy foreign keys (`course_id`, `semester_id`, `course_offering_id`) are made nullable with `ON DELETE SET NULL` constraints. No cascading deletion is permitted to protect historical student learning activities, submissions, and grades.
5. **Classroom-Scoped Enrollment & Membership Controls**:
   - Independent enrollment is governed by cryptographically unique join codes (`POST /api/v1/classrooms/join` and `POST /api/v1/classrooms/:id/join`) with strict usage caps (`max_uses`), expiration validation (`expires_at`), and atomic concurrency locking.
   - Teaching team assignments are governed directly per classroom via `classroom_instructors`, enforcing primary instructor invariants without reliance on institutional course offering mapping.

---

## 7. Classroom Cover Image & Media Upload Security

1. **Magic-Byte Binary Signature Validation**:
   - Every uploaded cover image is inspected by verifying its initial binary signature (magic bytes).
   - Only standard raster image formats (`image/jpeg`, `image/png`, `image/webp`) are permitted.
   - SVG files (`image/svg+xml`) and XML/HTML polyglots are strictly rejected (`400 UNSUPPORTED_IMAGE_TYPE`) to eliminate SVG-based stored Cross-Site Scripting (XSS) vectors.
2. **Corrupted & Malformed Buffer Rejection**:
   - Uploaded buffers undergo a test decode via `sharp`. If headers or payloads are corrupted, truncated, or unparseable, the file is rejected with `400 INVALID_IMAGE_CONTENT`.
3. **EXIF Stripping & Auto-Rotation**:
   - `sharp(buffer).rotate()` automatically inspects EXIF orientation, rotates the pixels accordingly, and strips all EXIF metadata tags.
   - This prevents location tracking (GPS tags), camera serial number disclosures, and device metadata leakage.
4. **Sanitized WebP Re-encoding & Variant Generation**:
   - User-supplied image binaries are never served raw. They are re-encoded into optimized WebP formats:
     - Standard cover: max 1280x720, `fit: 'inside'`, `withoutEnlargement: true`, quality 82.
     - Thumbnail: 480x270, `fit: 'cover'`, quality 80.
5. **Path Traversal Prevention & Safe Key Generation**:
   - File storage paths are generated using cryptographic UUIDs (`crypto.randomUUID()`) inside `storage/classroom-covers/`.
   - The serving endpoint (`GET /api/v1/storage/covers/:filename`) strictly enforces regex validation `^[a-zA-Z0-9_-]+\.webp$`, verifies the canonical path resides within the root storage folder, and sends public caching headers (`Cache-Control: public, max-age=86400, stale-while-revalidate=604800`).
6. **Authorization & Cleanup Lifecycle**:
   - Only authorized instructors (`DOSEN` assigned to the classroom) or `SUPERADMIN` can upload or delete classroom covers (`DELETE /api/v1/classrooms/:id/cover-image`).
   - Obsolete image files and thumbnails are safely unlinked from disk upon replacement or deletion.

