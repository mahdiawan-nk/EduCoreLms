-- Migration 0004: Academic Period Management — Pure Semester CRUD & RBAC
ALTER TABLE "academic_periods"
  ADD COLUMN IF NOT EXISTS "description" text DEFAULT '' NOT NULL,
  ADD COLUMN IF NOT EXISTS "preparation_start_date" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "administrative_notes" text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE "academic_periods"
  DROP COLUMN IF EXISTS "registration_start",
  DROP COLUMN IF EXISTS "registration_end";
--> statement-breakpoint
UPDATE "academic_periods" SET "status" = 'ACTIVE' WHERE LOWER("status") = 'registration_closed';
--> statement-breakpoint
UPDATE "academic_periods" SET "status" = UPPER("status");
--> statement-breakpoint
UPDATE "academic_periods" SET "semester_type" = 'ODD' WHERE "semester_type" ILIKE 'ganjil';
--> statement-breakpoint
UPDATE "academic_periods" SET "semester_type" = 'EVEN' WHERE "semester_type" ILIKE 'genap';
--> statement-breakpoint
UPDATE "academic_periods" SET "semester_type" = 'SHORT' WHERE "semester_type" ILIKE 'pendek';
--> statement-breakpoint
UPDATE "academic_periods" SET "semester_type" = UPPER("semester_type");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_academic_periods_single_default"
  ON "academic_periods" ("is_default")
  WHERE "is_default" = true;
--> statement-breakpoint
ALTER TABLE "academic_periods" DROP CONSTRAINT IF EXISTS "chk_academic_periods_semester_type";
--> statement-breakpoint
ALTER TABLE "academic_periods" ADD CONSTRAINT "chk_academic_periods_semester_type"
  CHECK ("semester_type" IN ('ODD', 'EVEN', 'SHORT'));
--> statement-breakpoint
ALTER TABLE "academic_periods" DROP CONSTRAINT IF EXISTS "chk_academic_periods_status";
--> statement-breakpoint
ALTER TABLE "academic_periods" ADD CONSTRAINT "chk_academic_periods_status"
  CHECK ("status" IN ('DRAFT', 'SCHEDULED', 'ACTIVE', 'COMPLETED', 'ARCHIVED'));
--> statement-breakpoint
ALTER TABLE "academic_periods" DROP CONSTRAINT IF EXISTS "chk_academic_periods_dates";
--> statement-breakpoint
ALTER TABLE "academic_periods" ADD CONSTRAINT "chk_academic_periods_dates"
  CHECK ("start_date" < "end_date");
