# POLITEKNIK KAMPAR LMS — CLASSROOM MANAGEMENT ARCHITECTURE

## 1. Overview
The Academic Classroom Management System in Politeknik Kampar LMS bridges permanent course curricula (`courses`), campus physical facilities (`campus_buildings`, `campus_rooms`), academic periods (`academic_periods`), and student cohort enrollments.

## 2. 6-Step Advanced Classroom Builder
The Classroom Builder ([src/pages/ClassroomBuilderWizardPage.tsx](file:///home/mahdi-nk/Project/EduCoreLms/src/pages/ClassroomBuilderWizardPage.tsx) and `POST /api/v1/classrooms/builder`) provides an enterprise 6-step creation flow:

1. **Step 1: Academic Information**
   - Course Master selector: Connects to permanent academic curriculum.
   - Course Offering selector: Scoped to the selected academic period.
   - Academic Period: Automatically defaults to the Superadmin-designated active semester.
   - Study Program, Student Cohort (e.g. `2026`), Section (e.g. `A`, `B`, `TI-2A`), and Classroom Type (`REGULAR`, `PRACTICAL`, `HYBRID`, `SHORT_SEMESTER`, `REMEDIAL`).
   - Language of instruction (`id` / `en`).

2. **Step 2: Classroom Profile**
   - Official Classroom Name and Unique Classroom Code.
   - Minimum & Maximum Student Capacity limits.
   - Course Learning Objectives (CPMK) and Description.
   - Visibility settings (`PUBLIC_ENROLLED`, `INVITE_ONLY`, `PRIVATE`).

3. **Step 3: Teaching Team**
   - Role allocation: Primary Instructor (`PRIMARY_INSTRUCTOR`), Co-Instructor (`CO_INSTRUCTOR`), Teaching Assistant (`TEACHING_ASSISTANT`), and Guest Lecturer (`GUEST_INSTRUCTOR`).
   - Granular permission flags: Can edit content, can grade assessments, can manage enrollments.

4. **Step 4: Class Schedules & Facilities with Conflict Detection**
   - Day of week (Monday through Sunday) and 24-hour time ranges (`HH:MM`).
   - Building and Room selectors (filtered by building and room type).
   - Meeting Mode: `OFFLINE` (in-person physical room), `ONLINE` (virtual link), `HYBRID`.
   - **Automated Real-Time Conflict Detection**:
     - Evaluates room availability against existing active classroom schedules.
     - Evaluates instructor availability against overlapping teaching assignments.
     - Warns users immediately before submitting via `POST /api/v1/schedules/conflicts`.

5. **Step 5: Enrollment Rules & Policies**
   - Enrollment Mode:
     - `AUTO`: Direct enrollment if capacity is available.
     - `APPROVAL_REQUIRED`: Moderated enrollment requiring lecturer review.
     - `JOIN_CODE`: Requires student entry of a 6-8 character code.
   - Waitlist Policy: Enables waiting list queue with customizable maximum queue limit.
   - Join Code Configuration: Maximum allowable usages and expiration dates.

6. **Step 6: Review & Publication**
   - Summary card reviewing all academic, facility, instructor, schedule, and policy settings.
   - State options:
     - Save as `draft`
     - Submit for Superadmin Approval (`pending_approval`)
     - Publish Immediately (`active`)

## 3. Classroom Lifecycle State Machine
```
[draft] ---> [pending_approval] ---> [active] ---> [enrollment_closed] ---> [completed] ---> [archived]
```

- `draft`: Work-in-progress, not listed in student catalog.
- `pending_approval`: Submitted by lecturer, awaiting Superadmin review.
- `scheduled`: Approved and awaiting semester lecture start date.
- `active`: Open for enrollment, learning materials, assignments, and examinations.
- `enrollment_closed`: Active teaching semester underway; self-enrollment closed.
- `completed`: Lectures completed, final grades calculated and submitted to BAAK.
- `archived`: Read-only historical record preserved indefinitely.

## 4. Endpoints & REST Architecture
- `POST /api/v1/classrooms/builder`: Transactional 6-step creation wizard.
- `GET /api/v1/classrooms/:id/schedules`: Retrieves scheduled slots with room and instructor details.
- `POST /api/v1/classrooms/:id/schedules`: Adds a schedule slot with conflict checking.
- `PATCH /api/v1/schedules/:id`: Updates a schedule slot.
- `DELETE /api/v1/schedules/:id`: Removes a schedule slot.
- `POST /api/v1/schedules/conflicts`: Evaluates schedule conflicts for room and instructor.
- `GET /api/v1/schedules/conflicts`: Query-param conflict detector.
- `POST /api/v1/classrooms/:id/submit-approval`: Lecturer submits classroom for review.
- `POST /api/v1/classrooms/:id/approve`: Superadmin approves classroom.
- `POST /api/v1/classrooms/:id/publish`: Activates a scheduled or draft classroom.
- `POST /api/v1/classrooms/:id/complete`: Marks classroom completed.
- `POST /api/v1/classrooms/:id/archive`: Marks classroom archived.
- `GET /api/v1/campus/buildings`: Lists campus physical buildings.
- `GET /api/v1/campus/rooms`: Lists campus rooms filtered by building.

## 5. Dashboards Integration
Real-time PostgreSQL metrics are provided for each user role:
- **Superadmin** (`GET /api/v1/dashboards/superadmin`): Institutional KPI cards (Total Classrooms, Active Classrooms, Drafts, Pending Approvals, Total Lecturers, Total Students, Classes with 0 students/instructors, Facility utilization).
- **Lecturer** (`GET /api/v1/dashboards/lecturer`): My teaching classrooms count, active student totals, pending submission reviews, and weekly lecture timetable.
- **Student** (`GET /api/v1/dashboards/student`): My enrolled classrooms count, pending assignments and exams, waitlist positions, and weekly class schedule.
