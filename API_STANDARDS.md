# API STANDARDS — POLITEKNIK KAMPAR LMS

## 1. REST API Conventions

- **Base Prefix**: `/api/v1`
- **Transport & Payloads**: JSON (`application/json`) with UTF-8 encoding; binary exports (`text/csv`, `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`) and byte-range streams (`HTTP 206 Partial Content`) where applicable.
- **Validation**: All request bodies, query parameters, and path parameters are validated server-side using **Zod** schemas before executing business logic.
- **Standard Response Envelope**:
  ```json
  {
    "success": true,
    "data": { ... }
  }
  ```
- **Standard Error Envelope**:
  ```json
  {
    "success": false,
    "error": {
      "code": "FORBIDDEN | VALIDATION_ERROR | NOT_FOUND | DEADLINE_PASSED | ...",
      "message": "Human-readable explanation"
    }
  }
  ```

---

## 2. Advanced Assignment, Submission & Grading Endpoints

### 2.1 Assignment Management & Publishing
- `GET /api/v1/classrooms/:id/assignments` — List classroom assignments (filters out `DRAFT`/`SCHEDULED`/`ARCHIVED` for students; strips unpublished grades).
- `POST /api/v1/classrooms/:id/assignments` — Create an assignment with full Tiptap `instructionJson`, submission rules, deadlines, late penalty policy, and rubric criteria inside a PostgreSQL transaction.
- `GET /api/v1/assignments/:id` — Retrieve full assignment details, instructor attachments, rubric criteria, and student/instructor submissions.
- `PATCH /api/v1/assignments/:id` — Update assignment metadata, instructions, submission rules, deadlines, and rubric criteria.
- `DELETE /api/v1/assignments/:id` — Delete an assignment and its associated gradebook item.
- `POST /api/v1/assignments/:id/publish` — Immediately transition assignment to `PUBLISHED` and notify active classroom students.
- `POST /api/v1/assignments/:id/schedule` — Schedule assignment publication (`status = 'SCHEDULED'`, `scheduledAt`).
- `POST /api/v1/assignments/:id/rubric` — Create or replace the assignment's rubric and criteria (`assignment_rubrics`, `assignment_rubric_criteria`).
- `GET /api/v1/assignments/:id/preview` — Instructor preview payload simulating student view.

### 2.2 S3 Presigned Attachment Uploads (Instructor & Student)
- `POST /api/v1/assignments/:id/attachments/upload-url` — Generate S3 presigned PUT URL for instructor reference files (`assignments/<assignmentId>/attachments/<uuid>.<ext>`).
- `POST /api/v1/assignments/:id/attachments/confirm` — Verify SHA-256 checksum & magic bytes in S3 and persist `assignment_attachments`.
- `DELETE /api/v1/assignment-attachments/:attachmentId` — Remove an instructor attachment.
- `POST /api/v1/assignments/:id/submission-upload-url` — Validate allowed file extensions (`pdf, doc, docx, xls, xlsx, ppt, pptx, jpg, jpeg, png, webp`) and max file size (`maxFileSizeMb`), then issue S3 presigned PUT URL (`submissions/<assignmentId>/<studentId>/<uuid>.<ext>`).
- `POST /api/v1/assignments/:id/submission-upload-confirm` — Verify uploaded student file in S3 and persist `stored_files`.

### 2.3 Student Submission & Versioning
- `POST /api/v1/assignments/:id/submissions` — Submit or save draft (`isDraft: true/false`) with Tiptap `submissionContentJson`, S3 `attachments`, and validated `https://` `externalLinks`. Computes late status (`isLate`, `lateMinutes`), enforces `cutoffAt`, `allowLateSubmission`, `allowResubmission`, and `maxAttempts`, and records an immutable `submission_versions` row (`v1, v2, ...`).
- `POST /api/v1/submissions/:id/versions` — Create a new revision on an existing submission.
- `GET /api/v1/submissions/:id` — Inspect submission details, versions, attachments, external links, rubric scores, grade history, and comments (enforces strict student ownership and hides unpublished grades/private notes from students).
- `GET /api/v1/submissions/:id/versions` — Retrieve all historical versions of a submission.
- `GET /api/v1/submissions/:id/preview` — Retrieve in-app preview descriptors for all attachments on a submission.
- `POST /api/v1/submissions/:id/comments` — Post a threaded comment (`STUDENT_VISIBLE` or `INSTRUCTOR_PRIVATE`).

### 2.4 Instructor Participant Monitoring, Grading, Reminders & Export
- `GET /api/v1/assignments/:id/participants` — Derives the full participant list from active classroom enrollments (`classroom_enrollments.status = 'active'`), joining `assignment_submissions` so students who have not submitted appear with `submissionStatus: 'not_submitted'`. Supports `search`, `status`, `gradingStatus`, `lateOnly`, `missingOnly`, and `sortBy`.
- `POST /api/v1/submissions/:id/grade` — Calculate and validate Direct, Rubric-based, or Combined grades on the backend, enforce `[0, maxScore]` bounds across criteria and total score, record `submission_grades` and `submission_rubric_scores`, and synchronize published scores to `grade_records`.
- `PATCH /api/v1/grades/:id` — Update an existing grade entry and synchronize state.
- `POST /api/v1/submissions/:id/return` — Return a submission to the student for revision (`submissionStatus = 'returned_for_revision'`) with revision instructions and notification.
- `POST /api/v1/assignments/:id/reminders` — Send reminders to all or selected students with `not_submitted` status.
- `GET /api/v1/assignments/:id/analytics` — Real-time PostgreSQL aggregation of submission percentage, grading completion percentage, average/highest/lowest grade, late count, missing count, and A–E grade distribution.
- `GET /api/v1/assignments/:id/export?format=csv|xlsx` — Export complete participant submission and grade report as CSV or multi-column Excel (`.xlsx`).

---

## 3. Advanced Assessment & Examination Management Endpoints

### 3.1 Question Bank & Question Lifecycle
- `GET /api/v1/question-banks` — List reusable question banks with counts of objective and essay questions.
- `POST /api/v1/question-banks` — Create a new question bank (`title`, `subject`, `topic`, `description`, `isShared`).
- `GET /api/v1/question-banks/:id/questions` — Retrieve questions inside a bank with filtering by `questionMode`, `questionType`, `difficulty`, `category`, `topic`, `tag`, and `search` (restricted to `DOSEN`/`SUPERADMIN`; returns `403 FORBIDDEN_ANSWER_KEY_ISOLATION` for students).
- `POST /api/v1/questions` — Create any of the 8 Objective or 7 Essay question types with options, `answerConfig`, learning outcome tags, and optional essay rubric.
- `PATCH /api/v1/questions/:id` — Update a question and append the previous state to `version_history` (`version_number + 1`) without mutating historical `attempt_questions` snapshots.
- `POST /api/v1/questions/:id/duplicate` — Clone an existing question and its options inside the Question Bank.

### 3.2 Assessment Builder & Configuration
- `GET /api/v1/classrooms/:id/assessments` — List classroom assessments (`OBJECTIVE`, `ESSAY`, `HYBRID`) with sections, question counts, and student attempt status (hides unpublished scores from students).
- `POST /api/v1/classrooms/:id/assessments` — Create a complete assessment with sections, linked or inline questions, random question pools (`assessment_question_pools`), student accommodations (`assessment_accommodations`), and automatic gradebook item registration inside a PostgreSQL transaction.
- `GET /api/v1/assessments/:id` — Retrieve assessment configuration (strips answer keys and question lists for students outside active attempts; supports `?previewAsStudent=true` for instructors).
- `PATCH /api/v1/assessments/:id` — Update assessment metadata, timing, policies, sections, and question pools.
- `POST /api/v1/assessments/:id/publish` — Transition assessment status (`PUBLISHED`, `SCHEDULED`, `CLOSED`, `ARCHIVED`).

### 3.3 Server-Authoritative Attempt Engine
- `POST /api/v1/assessments/:id/attempts` — Start a new attempt or resume an existing `IN_PROGRESS` attempt (`resumed: true`). Enforces `startDate`, `endDate`, `maxAttempts` (plus student accommodations), and freezes an immutable `attempt_questions` snapshot (resolving direct questions + random question pools and stripping answer keys from `student_options_snapshot`).
- `GET /api/v1/attempts/:id` — Retrieve attempt state, progress counts, and server-authoritative `remainingSeconds` (`serverDeadlineAt - serverNow`). Automatically triggers `finalizeAttemptSubmission` if the server deadline has expired.
- `GET /api/v1/attempts/:id/questions` — Retrieve the attempt's frozen question snapshots (`studentOptionsSnapshot`, `rubricSnapshot`) and saved answers. Never exposes `serverAnswerKeySnapshot`.
- `PUT /api/v1/attempts/:id/answers/:questionId` — Autosave a student's answer payload and flag state (`autosaveVersion + 1`), enforcing `serverDeadlineAt` and `allowAnswerChanges`.
- `POST /api/v1/attempts/:id/answers/:questionId/attachments/presign` & `/confirm` — Upload private S3 attachments (`exam-attachments/<assessmentId>/<studentId>/...`) for essay questions.
- `POST /api/v1/attempts/:id/submit` — Idempotently finalize an attempt inside a PostgreSQL transaction, executing automatic server-side grading for all 8 objective question types and transitioning status to `GRADED` or `SUBMITTED` (when awaiting manual essay grading).
- `POST /api/v1/attempts/:id/events` — Record client examination telemetry events (`assessment_events`).

### 3.4 Instructor Live Monitoring, Essay/Hybrid Grading & Analytics
- `GET /api/v1/assessments/:id/monitoring` — Real-time participant monitoring derived from active classroom enrollments (`NOT_STARTED`, `IN_PROGRESS`, `SUBMITTED`, `AUTO_SUBMITTED`, `TIMED_OUT`), progress percentages, objective/essay/final scores, and `?format=csv|xlsx` export.
- `GET /api/v1/attempts/:id/grading` — Instructor grading payload containing student answers, S3 essay attachments, `serverAnswerKeySnapshot`, model answers, rubric criteria, and grading history.
- `POST /api/v1/attempts/:id/essay-grades` — Save draft (`isDraft: true`) or finalize (`isDraft: false`) manual essay/short-answer scores using `DIRECT` or `RUBRIC` calculation, recomputing `totalScore = objectiveScore + essayScore` and recording `essay_grades.audit_history`. Blocks `publishToStudent: true` if any mandatory manual question is ungraded.
- `POST /api/v1/assessments/:id/publish-results` — Publish finalized assessment results to students (blocks publication with `400 INCOMPLETE_MANDATORY_GRADING` if any submitted attempt still has pending mandatory essay grading).
- `GET /api/v1/assessments/:id/results` — Retrieve student assessment results (`assessment_results`).
- `GET /api/v1/assessments/:id/analytics` — Real PostgreSQL statistical and item analysis (mean, median, high/low, pass/fail rate, A–E distribution, per-question difficulty index, point-biserial/upper-lower 27% discrimination index, distractor selection frequencies, and `sampleSizeSufficient` reliability indicator).
