# POLITEKNIK KAMPAR LMS — ACADEMIC PERIOD & CALENDAR SPECIFICATION

## 1. Authority & Governance
Master Academic Periods (`academic_periods`) and Academic Calendar Events (`academic_calendar_events`) are exclusively controlled by Superadmin actors (`SUPERADMIN` role). Lecturers and students receive default periods automatically and cannot mutate master records.

## 2. Core Period Rules
- **Single Active Default**: Exactly 1 academic period can have `is_default = true` at any time. When a period is marked default, an atomic transaction unsets `is_default` on all other periods.
- **Completed/Archived Invariance**: Periods marked `completed` or `archived` cannot be selected for new classroom creation or student self-enrollment.
- **Registration Window**: Student enrollment via the catalog is governed by `registration_start` and `registration_end`. Once closed (`registration_closed`), self-enrollment is blocked.

## 3. Academic Calendar Categories
- `KRS_REGISTRATION`: Masa Pengisian Kartu Rencana Studi
- `LECTURE_START`: Awal Perkuliahan Semester
- `LECTURE_END`: Akhir Perkuliahan Semester
- `UTS`: Ujian Tengah Semester
- `UAS`: Ujian Akhir Semester
- `HOLIDAY`: Hari Libur Nasional & Akademik
- `GRADE_SUBMISSION`: Batas Akhir Finalisasi Nilai
- `OTHER`: Kegiatan & Agenda Khusus Kampus

## 4. Endpoints
- `GET /api/v1/academic-periods/default`: Any authenticated user reads the active default semester.
- `GET /api/v1/admin/academic-periods`: Superadmin list of all periods with offering & classroom counts.
- `POST /api/v1/admin/academic-periods`: Superadmin creates new semester.
- `POST /api/v1/admin/academic-periods/:id/activate`: Transitions to `active`.
- `POST /api/v1/admin/academic-periods/:id/close-registration`: Transitions to `registration_closed`.
- `POST /api/v1/admin/academic-periods/:id/set-default`: Atomically sets single default semester.
- `GET /api/v1/academic-calendar`: Authenticated calendar retrieval filtered by period.
- `POST /api/v1/admin/academic-calendar`: Superadmin adds event with color and category.
