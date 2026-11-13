-- Migration 0005: Decouple Digital Classroom from Course Master, Offering, and Facility modules

-- 1. Make course_id and semester_id nullable on classrooms
ALTER TABLE "classrooms" ALTER COLUMN "course_id" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "classrooms" ALTER COLUMN "semester_id" DROP NOT NULL;
--> statement-breakpoint

-- 2. Add classroom-owned fields
ALTER TABLE "classrooms"
  ADD COLUMN IF NOT EXISTS "subject_name" text,
  ADD COLUMN IF NOT EXISTS "subject_code" text,
  ADD COLUMN IF NOT EXISTS "academic_year" text,
  ADD COLUMN IF NOT EXISTS "semester_name" text,
  ADD COLUMN IF NOT EXISTS "location_description" text;
--> statement-breakpoint

-- 3. Add location_description to classroom_schedules
ALTER TABLE "classroom_schedules"
  ADD COLUMN IF NOT EXISTS "location_description" text;
--> statement-breakpoint

-- 4. Snapshot existing course and semester data into classroom-owned fields where NULL
UPDATE "classrooms" c
SET 
  "subject_name" = COALESCE(c."subject_name", co."title"),
  "subject_code" = COALESCE(c."subject_code", co."code")
FROM "courses" co
WHERE c."course_id" = co."id" AND c."subject_name" IS NULL;
--> statement-breakpoint

UPDATE "classrooms" c
SET 
  "academic_year" = COALESCE(c."academic_year", ap."academic_year"),
  "semester_name" = COALESCE(c."semester_name", ap."name")
FROM "academic_periods" ap
WHERE c."academic_period_id" = ap."id" AND c."semester_name" IS NULL;
--> statement-breakpoint

UPDATE "classrooms" c
SET 
  "semester_name" = COALESCE(c."semester_name", s."name")
FROM "semesters" s
WHERE c."semester_id" = s."id" AND c."semester_name" IS NULL;
--> statement-breakpoint

UPDATE "classroom_schedules" cs
SET "location_description" = COALESCE(cs."location_description", cr."room_number" || ' - ' || cb."name")
FROM "campus_rooms" cr
JOIN "campus_buildings" cb ON cr."building_id" = cb."id"
WHERE cs."room_id" = cr."id" AND cs."location_description" IS NULL;
