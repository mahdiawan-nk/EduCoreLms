# SECURITY STANDARDS — POLITEKNIK KAMPAR LMS

## 1. Authentication & Session Security

- **Password Hashing**: Argon2id (`argon2` package) with memory-hard parameters. Plaintext passwords are never logged or persisted.
- **Database Sessions**: Opaque random session tokens are hashed with **SHA-256** (`tokenHash`) before storage in `user_sessions`.
- **Cookie Policy**: Session cookies (`pk_lms_session`) are issued with `HttpOnly`, `SameSite=Lax`, and path `/`.
- **CSRF Protection**: All state-changing requests (`POST`, `PUT`, `PATCH`, `DELETE`) require a valid `x-csrf-token` header matching the authenticated session's `csrfToken`.

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
