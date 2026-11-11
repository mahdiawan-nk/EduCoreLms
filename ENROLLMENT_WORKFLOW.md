# POLITEKNIK KAMPAR LMS — ENROLLMENT & PARTICIPANT WORKFLOW

## 1. Enrollment Modes
- `AUTO`: Direct enrollment. Mahasiswa automatically becomes `active` if capacity is available.
- `APPROVAL_REQUIRED`: Moderated enrollment. Mahasiswa is assigned `pending` status until approved by lecturer/admin.
- `JOIN_CODE`: Code-gated enrollment. Requires valid 6-8 character code with expiration and usage count limits.
- `ADMIN_ASSIGNMENT` / `BULK_IMPORT`: Administrative registration directly through participant manager.

## 2. Capacity Enforcement & Concurrency Control
All enrollment actions run within PostgreSQL transactions:
1. Active enrollments are counted (`status = 'active'`).
2. If `active_count >= max_participants`:
   - If `waiting_list_enabled = true` and waitlist capacity is not exceeded, the student is queued in `classroom_waitlists` with `queue_number = count + 1` and `status = 'WAITING'`.
   - If waitlist is disabled or full, returns `409 CLASSROOM_FULL` / `409 WAITLIST_FULL`.

## 3. Automatic Waitlist Promotion
When an active student withdraws or is dropped (`POST /api/v1/enrollments/:id/withdraw`):
1. The student's enrollment is marked `status = 'dropped'` with `withdrawn_at = NOW()`.
2. The transaction inspects `classroom_waitlists` for the lowest `queue_number` with `status = 'WAITING'`.
3. The next student in line is promoted to `status = 'PROMOTED'` in waitlists and automatically enrolled with `status = 'active'` and `enrollment_source = 'WAITLIST_PROMOTED'`.
