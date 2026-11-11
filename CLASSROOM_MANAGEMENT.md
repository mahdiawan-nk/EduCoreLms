# POLITEKNIK KAMPAR LMS — CLASSROOM MANAGEMENT ARCHITECTURE

## 1. Overview
The Academic Classroom Management System in Politeknik Kampar LMS bridges permanent course curricula (`courses`), campus facilities (`campus_buildings`, `campus_rooms`), academic periods (`academic_periods`), and student cohort enrollments.

## 2. 6-Step Advanced Classroom Builder
The Classroom Builder (`/classrooms/new` and `POST /api/v1/classrooms/builder`) enforces an enterprise 6-step creation flow:
1. **Academic Info**: Links to active Course Master, Course Offering, and Academic Period (default semester auto-resolved). Sets section (e.g. `A`, `B`, `TI-2A`), cohort (`2026`), and classroom type (`REGULAR`, `PRACTICAL`, `HYBRID`, `SHORT_SEMESTER`, `REMEDIAL`).
2. **Classroom Profile**: Sets official name, unique classroom code, minimum capacity, maximum capacity, category, language (`id`), and Course Learning Objectives (CPMK).
3. **Teaching Team**: Assigns Primary Instructor (`PRIMARY_INSTRUCTOR`), Co-Instructors (`CO_INSTRUCTOR`), Teaching Assistants (`TEACHING_ASSISTANT`), and Guest Instructors (`GUEST_INSTRUCTOR`) with granular permission scopes.
4. **Class Schedules & Facilities**: Allocates recurring day-of-week slots, start/end times in 24h format, physical campus buildings & rooms, and meeting mode (`OFFLINE`, `ONLINE`, `HYBRID`). Includes automated real-time schedule conflict detection.
5. **Enrollment Rules & Policies**: Configures enrollment mode (`AUTO`, `APPROVAL_REQUIRED`, `JOIN_CODE`), seat capacity caps, waitlist enablement with queue limit, and join code usage caps.
6. **Review & Publication**: Verifies full configuration with options to save as `draft`, submit for superadmin approval (`pending_approval`), or publish immediately (`active`).

## 3. Classroom Lifecycle States
- `draft`: Work-in-progress, hidden from student catalog.
- `pending_approval`: Submitted by lecturer for Superadmin review.
- `scheduled`: Approved and awaiting semester start date.
- `active`: Open for student enrollment, learning materials, assignments, and assessments.
- `enrollment_closed`: Teaching underway, no new student enrollments permitted.
- `completed`: Semester finished, grades finalized, archived for historical reference.
- `archived`: Read-only historical record.
