# POLITEKNIK KAMPAR LMS — ACADEMIC PERIOD MANAGEMENT (PURE SEMESTER CRUD & RBAC)

## 1. Objective & Architectural Scope
The Academic Period Management module of Politeknik Kampar LMS is a dedicated, secure, and robust semester administration subsystem.
It exclusively manages official academic periods, semester lifecycles, single system-wide default semester designation, granular RBAC authorization, and comprehensive audit history.

### Strict Module Isolation:
- **No KRS / Registration Logic**: There are no KRS windows, registration start/end dates, registration opening/closing, registration buttons, or registration permissions in this module.
- **No Academic Calendar UI**: Academic calendar tabs, agenda navigation, and event CRUD are removed from the active interface. Unrelated historical calendar database tables are preserved safely without deletion.
- **Data Retention**: Preserves all existing LMS classrooms, course offerings, enrollments, and academic transcripts without data loss.

---

## 2. Core Semester Rules & State Machine

The semester lifecycle follows a validated, non-destructive state machine:

```
                  ┌──────────────────────┐
                  │        DRAFT         │
                  └──────────┬───────────┘
                             │
                             ▼
                  ┌──────────────────────┐
         ┌───────►│      SCHEDULED       ├───────┐
         │        └──────────┬───────────┘       │
         │                   │                   │
         │                   ▼                   │
         │        ┌──────────────────────┐       │
         └────────┤        ACTIVE        │◄──────┘
                  └──────────┬───────────┘
                             │
                             ▼
                  ┌──────────────────────┐
                  │      COMPLETED       │
                  └──────────┬───────────┘
                             │
                             ▼
                  ┌──────────────────────┐
                  │       ARCHIVED       │ (Read-Only)
                  └──────────────────────┘
```

### Lifecycle Rules:
1. **Superadmin Governance**: Only authorized actors with `academic_period.*` permissions can manage and transition academic period lifecycles.
2. **Single Default Semester**: Exactly one academic period can have `is_default = true` at any time. A PostgreSQL unique partial index (`idx_academic_periods_single_default`) and atomic transactions enforce that setting a new default unsets all others.
3. **Active vs. Default Independence**: "Default Semester" and "Active Semester" are independent concepts. Setting a period as default does not force status mutation.
4. **Archived Invariance**: Archived semesters are permanently read-only (`PERIOD_ARCHIVED`). Modifying an archived semester is blocked with HTTP 400.
5. **Classroom Creation Guard**: Archived and Completed semesters cannot be used to instantiate new classrooms (`PERIOD_INACTIVE`).
6. **Deletion Eligibility Guard**: A period can only be deleted if:
   - It has no associated classrooms (`classroomCount === 0`).
   - It has no associated course offerings (`courseOfferingCount === 0`).
   - It has never been activated (status is `DRAFT` or `SCHEDULED`, and audit history contains no `ACADEMIC_PERIOD_ACTIVATED`).
7. **Audit Trail**: Every creation, update, deletion, activation, default change, completion, and archival is immutably logged in `audit_logs`.

---

## 3. Granular RBAC Specification

| Permission Code | Module | Description | Authorized Roles |
| :--- | :--- | :--- | :--- |
| `academic_period.view` | Academic Period | View official academic periods, details, and metrics | **SUPERADMIN, DOSEN, MAHASISWA** |
| `academic_period.create` | Academic Period | Create new academic periods and semester records | **SUPERADMIN** |
| `academic_period.update` | Academic Period | Edit eligible academic period details and lecture dates | **SUPERADMIN** |
| `academic_period.delete` | Academic Period | Delete eligible academic periods without dependencies | **SUPERADMIN** |
| `academic_period.activate` | Academic Period | Activate a draft or scheduled academic period | **SUPERADMIN** |
| `academic_period.set_default` | Academic Period | Designate the single default academic period | **SUPERADMIN** |
| `academic_period.complete` | Academic Period | Mark an active academic period as completed | **SUPERADMIN** |
| `academic_period.archive` | Academic Period | Archive a completed academic period as read-only | **SUPERADMIN** |
| `academic_period.view_history` | Academic Period | View academic period lifecycle and audit logs | **SUPERADMIN** |

*Note*: There are no registration-related permissions in the academic period security registry.

---

## 4. API Contracts

Base Path: `/api/v1/admin/academic-periods` (and `/api/v1/academic-periods`)

All endpoints return the standard Politeknik Kampar envelope:
```json
{
  "success": true,
  "data": { ... },
  "meta": { ... }
}
```

### Endpoints Specification:

#### 1. List Academic Periods
- **Method**: `GET /api/v1/admin/academic-periods`
- **Permission**: `academic_period.view`
- **Query Parameters**:
  - `search` (optional): Filter by name, code, or academic year.
  - `academicYear` (optional): Filter by year (e.g. `2026/2027`).
  - `semesterType` (optional): `ODD` | `EVEN` | `SHORT`.
  - `status` (optional): `DRAFT` | `SCHEDULED` | `ACTIVE` | `COMPLETED` | `ARCHIVED`.
  - `sortBy` (optional): `startDate` | `code` | `name` | `status`.
  - `sortOrder` (optional): `asc` | `desc`.
  - `page` & `limit` (optional): Pagination controls.
- **Enrichment**: Injects `classroomCount` and `courseOfferingCount`.

#### 2. Get Single Academic Period
- **Method**: `GET /api/v1/admin/academic-periods/:id`
- **Permission**: `academic_period.view`
- **Response**: Detailed period record with active classroom and course offering counts.

#### 3. Create Academic Period
- **Method**: `POST /api/v1/admin/academic-periods`
- **Permission**: `academic_period.create`
- **Payload Schema (Zod)**:
  - `academic_code` (or `code`): String (3-30 chars, unique).
  - `name`: String (3-150 chars).
  - `academic_year` (or `academicYear`): String (e.g., `"2026/2027"`).
  - `semester_type` (or `semesterType`): `'ODD' | 'EVEN' | 'SHORT'`.
  - `description`: String (optional).
  - `preparation_start_date`: ISO timestamp (optional).
  - `lecture_start_date` (or `startDate`): ISO timestamp (required).
  - `lecture_end_date` (or `endDate`): ISO timestamp (required, must be `> lecture_start_date`).
  - `status`: `'DRAFT' | 'SCHEDULED' | 'ACTIVE' | 'COMPLETED' | 'ARCHIVED'` (default `'DRAFT'`).
  - `is_default`: Boolean (default `false`).
  - `administrative_notes`: String (optional).
- **Status**: 201 Created.

#### 4. Update Academic Period
- **Method**: `PATCH /api/v1/admin/academic-periods/:id`
- **Permission**: `academic_period.update`
- **Payload**: Partial update of eligible fields. Validates code uniqueness, date ranges, and status transitions.
- **Status**: 200 OK.

#### 5. Delete Academic Period
- **Method**: `DELETE /api/v1/admin/academic-periods/:id`
- **Permission**: `academic_period.delete`
- **Validation**: Fails with HTTP 400 if period has classrooms, offerings, or was ever activated.
- **Status**: 200 OK (`{ deleted: true, id: "..." }`).

#### 6. Lifecycle Transitions
- `POST /api/v1/admin/academic-periods/:id/activate` (`academic_period.activate`) -> Sets `status: 'ACTIVE'`.
- `POST /api/v1/admin/academic-periods/:id/set-default` (`academic_period.set_default`) -> Atomically sets `is_default: true`.
- `POST /api/v1/admin/academic-periods/:id/complete` (`academic_period.complete`) -> Sets `status: 'COMPLETED'`.
- `POST /api/v1/admin/academic-periods/:id/archive` (`academic_period.archive`) -> Sets `status: 'ARCHIVED'`.

#### 7. Audit & Lifecycle History
- **Method**: `GET /api/v1/admin/academic-periods/:id/history`
- **Permission**: `academic_period.view_history`
- **Response**: List of immutable audit entries detailing actor, action, previous values, new values, IP address, and timestamp.

---

## 5. PostgreSQL Database Design

### Table: `academic_periods`
```sql
CREATE TABLE "academic_periods" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "code" text NOT NULL UNIQUE,
  "name" text NOT NULL,
  "academic_year" text NOT NULL,
  "semester_type" text NOT NULL,
  "description" text DEFAULT '' NOT NULL,
  "preparation_start_date" timestamp with time zone,
  "start_date" timestamp with time zone NOT NULL,
  "end_date" timestamp with time zone NOT NULL,
  "status" text DEFAULT 'DRAFT' NOT NULL,
  "is_default" boolean DEFAULT false NOT NULL,
  "administrative_notes" text DEFAULT '' NOT NULL,
  "created_by_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "chk_academic_periods_semester_type" CHECK ("semester_type" IN ('ODD', 'EVEN', 'SHORT')),
  CONSTRAINT "chk_academic_periods_status" CHECK ("status" IN ('DRAFT', 'SCHEDULED', 'ACTIVE', 'COMPLETED', 'ARCHIVED')),
  CONSTRAINT "chk_academic_periods_dates" CHECK ("start_date" < "end_date")
);

CREATE UNIQUE INDEX "idx_academic_periods_single_default"
  ON "academic_periods" ("is_default")
  WHERE "is_default" = true;
```

### Foreign Key Dependencies (Preserved):
- `classrooms.academic_period_id` -> `academic_periods.id` (`ON DELETE RESTRICT / SET NULL`)
- `course_offerings.academic_period_id` -> `academic_periods.id` (`ON DELETE RESTRICT`)
- `audit_logs.entity_id` -> references period ID for `entity_type = 'ACADEMIC_PERIOD'`

---

## 6. Frontend User Interface Architecture

- **Route**: `/academic-periods`
- **Component**: [src/pages/AcademicPeriodsPage.tsx](file:///home/mahdi-nk/Project/EduCoreLms/src/pages/AcademicPeriodsPage.tsx)
- **Title**: Manajemen Periode Akademik
- **Description**: Pengelolaan semester dan tahun akademik resmi Politeknik Kampar.
- **Summary Cards**:
  1. Total Periode Akademik
  2. Semester Aktif
  3. Semester Terjadwal
  4. Semester Selesai
- **Main Section**: Daftar Periode Akademik
  - Search by name & academic code.
  - Filter by Academic Year, Semester Type, Lifecycle Status.
  - Sort by Start Date, Code, Name, Status (ASC/DESC).
  - Pagination, Loading, Empty, and Error states.
- **Role Visibility**:
  - **Superadmin**: Full management controls (Create, Edit, Delete, Activate, Set Default, Complete, Archive, Detail & History).
  - **Dosen & Mahasiswa**: Read-only access to semester data and lecture dates with Detail modal. Modifying controls are hidden.

---

## 7. Verification & Test Suite Results

Comprehensive automated testing covers all 24 verification items in [src/tests/api.test.ts](file:///home/mahdi-nk/Project/EduCoreLms/src/tests/api.test.ts):

```
✓ Politeknik Kampar LMS — Security, RBAC, and Advanced Learning Material Builder Suite (9 tests)
  ✓ hashes and verifies passwords with Argon2id and hashes session tokens with SHA-256
  ✓ serves OpenAPI 3.1 specification in standard /api/v1 envelope
  ✓ enforces deny-by-default 401 UNAUTHORIZED for unauthenticated requests
  ✓ authenticates Mahasiswa, enforces CSRF on mutating endpoints, and blocks RBAC escalation
  ✓ verifies complete Advanced Learning Material Builder lifecycle (19 verification items)
  ✓ verifies all 25 items of the Advanced Assignment, Submission & Grading Management lifecycle
  ✓ verifies all 23 items of the Advanced Assessment & Examination Management Engine lifecycle
  ✓ Phase 11: Comprehensive Academic Classroom Management & Lifecycle Verification
  ✓ verifies complete Academic Period Management lifecycle — Pure Semester CRUD & RBAC (all 24 verification items)

Test Files: 1 passed (1)
Tests: 9 passed (9)
```
