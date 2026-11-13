# POLITEKNIK KAMPAR LMS — ENROLLMENT & PARTICIPANT WORKFLOW

## 1. Student Course Catalog Discovery
Students access available classrooms via the Course Catalog ([src/pages/ClassroomCatalogPage.tsx](file:///home/mahdi-nk/Project/EduCoreLms/src/pages/ClassroomCatalogPage.tsx) and `GET /api/v1/classrooms/catalog`):
- Filtered by Academic Period (defaults to active semester).
- Search by Course Name, Classroom Code, or Lecturer Name.
- Live seat quota indicators showing remaining capacity (e.g. `18 / 30 Kursi Terisi`).
- Visual badges for `Tersedia`, `Penuh (Waiting List)`, and `Terdaftar`.

## 2. Enrollment Modes & Policies
- **`AUTO` (Direct Enrollment)**:
  - If seats are available (`activeCount < maxParticipants`), the student is immediately enrolled with status `active`.
  - If the class is full and `waitingListEnabled` is true, the student is automatically routed to the FIFO waitlist (`classroom_waitlists`).
- **`APPROVAL_REQUIRED` (Moderated Enrollment)**:
  - Student application creates an enrollment record with status `pending`.
  - Lecturer reviews and approves or rejects via `POST /api/v1/enrollments/:id/approve` or `reject`.
- **`JOIN_CODE` (Code-Gated Enrollment)**:
  - Secure 6-8 alphanumeric code generated during classroom creation.
  - Concurrency protected with usage counting (`usesCount < maxUses`) and expiration verification.
- **`INVITATION` (Direct Faculty Invitation)**:
  - Lecturer sends direct invitation to a student via email or ID (`POST /api/v1/classrooms/:id/invitations`).

## 3. Waitlist Mechanics & Automatic Promotion
Waitlist processing is strictly transactional in PostgreSQL to prevent race conditions:
1. **Queueing**:
   - When a classroom reaches maximum capacity, students who attempt to enroll are placed in `classroom_waitlists`.
   - Each entry receives an ascending `queueNumber` (1, 2, 3...) and status `WAITING`.
2. **Automatic Promotion on Withdrawal**:
   - When an active student drops the course (`POST /api/v1/enrollments/:id/withdraw`):
     - The withdrawing student's status is changed to `dropped` with `withdrawn_at = NOW()`.
     - The transaction immediately searches for the lowest `queueNumber` with status `WAITING` in `classroom_waitlists`.
     - The next student in line is marked `status = 'PROMOTED'` with `promoted_at = NOW()`.
     - An active enrollment is inserted/updated for the promoted student with `status = 'active'` and `enrollmentSource = 'WAITLIST_PROMOTED'`.

## 4. Participant Management Workspace
Lecturers and Admins manage enrolled students via [src/pages/ClassroomParticipantsPage.tsx](file:///home/mahdi-nk/Project/EduCoreLms/src/pages/ClassroomParticipantsPage.tsx):
- **Teaching Team Tab**: Displays Primary Instructor, Co-Instructors, and Teaching Assistants with contact details.
- **Enrolled Students Tab**: Active student roster with NIM, Full Name, Email, Enrollment Date, and Enrollment Source.
- **Pending Approvals Tab**: Review queue for classrooms with `APPROVAL_REQUIRED` policy.
- **Waitlist Tab**: Real-time queue view showing position numbers and request timestamps.
- **CSV Roster Export**: One-click download of the complete classroom attendance and grading roster.
- **Bulk Enrollment**: Batch enrollment of student IDs for cohort onboarding (`POST /api/v1/classrooms/:id/bulk-enroll`).

## 5. Endpoints & REST Architecture
- `GET /api/v1/classrooms/catalog`: Student course catalog discovery.
- `POST /api/v1/classrooms/:id/enroll`: Transactional enrollment with automatic waitlist fallback.
- `POST /api/v1/classrooms/:id/join`: Join classroom using alphanumeric access code.
- `POST /api/v1/enrollments/:id/withdraw`: Student course drop with atomic waitlist promotion.
- `POST /api/v1/enrollments/:id/approve`: Lecturer approves pending student.
- `POST /api/v1/enrollments/:id/reject`: Lecturer rejects pending student.
- `GET /api/v1/classrooms/:id/participants`: Complete teaching team, student roster, and waitlist.
- `GET /api/v1/classrooms/:id/waitlist`: Waiting list queue details.
- `POST /api/v1/classrooms/:id/invitations`: Send student invitation.
- `POST /api/v1/classrooms/:id/bulk-enroll`: Batch enroll an array of student IDs.
