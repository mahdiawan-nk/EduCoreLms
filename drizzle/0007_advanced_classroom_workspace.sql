-- Migration 0007: Advanced Digital Classroom Workspace Enhancement
-- Adds module metadata to classroom_topics, bookmarks, notes, views, resource versions, and classroom-specific audit logs

-- 1. Enhance classroom_topics for comprehensive Module Management
ALTER TABLE "classroom_topics"
  ADD COLUMN IF NOT EXISTS "status" text NOT NULL DEFAULT 'PUBLISHED',
  ADD COLUMN IF NOT EXISTS "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS "updated_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone NOT NULL DEFAULT now();

-- 2. Enhance material_progress with classroom_id for direct aggregation
ALTER TABLE "material_progress"
  ADD COLUMN IF NOT EXISTS "classroom_id" uuid REFERENCES "classrooms"("id") ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS "idx_material_progress_classroom" ON "material_progress" ("classroom_id");

-- Backfill classroom_id in material_progress from learning_materials
UPDATE "material_progress" mp
SET "classroom_id" = lm."classroom_id"
FROM "learning_materials" lm
WHERE mp."material_id" = lm."id" AND mp."classroom_id" IS NULL;

-- 3. Classroom Material Bookmarks
CREATE TABLE IF NOT EXISTS "classroom_material_bookmarks" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "student_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "material_id" uuid NOT NULL REFERENCES "learning_materials"("id") ON DELETE CASCADE,
  "classroom_id" uuid NOT NULL REFERENCES "classrooms"("id") ON DELETE CASCADE,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_material_bookmark" ON "classroom_material_bookmarks" ("student_id", "material_id");
CREATE INDEX IF NOT EXISTS "idx_material_bookmarks_classroom" ON "classroom_material_bookmarks" ("classroom_id");
CREATE INDEX IF NOT EXISTS "idx_material_bookmarks_student" ON "classroom_material_bookmarks" ("student_id");

-- 4. Classroom Material Personal Notes
CREATE TABLE IF NOT EXISTS "classroom_material_notes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "student_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "material_id" uuid NOT NULL REFERENCES "learning_materials"("id") ON DELETE CASCADE,
  "classroom_id" uuid NOT NULL REFERENCES "classrooms"("id") ON DELETE CASCADE,
  "content" text NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_material_notes" ON "classroom_material_notes" ("student_id", "material_id");
CREATE INDEX IF NOT EXISTS "idx_material_notes_classroom" ON "classroom_material_notes" ("classroom_id");
CREATE INDEX IF NOT EXISTS "idx_material_notes_student" ON "classroom_material_notes" ("student_id");

-- 5. Classroom Material View History
CREATE TABLE IF NOT EXISTS "classroom_material_views" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "student_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "material_id" uuid NOT NULL REFERENCES "learning_materials"("id") ON DELETE CASCADE,
  "classroom_id" uuid NOT NULL REFERENCES "classrooms"("id") ON DELETE CASCADE,
  "first_opened_at" timestamp with time zone NOT NULL DEFAULT now(),
  "last_opened_at" timestamp with time zone NOT NULL DEFAULT now(),
  "view_count" integer NOT NULL DEFAULT 1
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_material_views" ON "classroom_material_views" ("student_id", "material_id");
CREATE INDEX IF NOT EXISTS "idx_material_views_classroom" ON "classroom_material_views" ("classroom_id");
CREATE INDEX IF NOT EXISTS "idx_material_views_student" ON "classroom_material_views" ("student_id");

-- 6. Classroom Resource Audit Logs (Append-Only Change History)
CREATE TABLE IF NOT EXISTS "classroom_audit_logs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "classroom_id" uuid NOT NULL REFERENCES "classrooms"("id") ON DELETE CASCADE,
  "actor_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "actor_role" text NOT NULL DEFAULT 'INSTRUCTOR',
  "resource_type" text NOT NULL,
  "resource_id" text,
  "resource_title" text NOT NULL,
  "action" text NOT NULL,
  "before_value" jsonb,
  "after_value" jsonb,
  "change_summary" text NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_classroom_audit_classroom" ON "classroom_audit_logs" ("classroom_id");
CREATE INDEX IF NOT EXISTS "idx_classroom_audit_created" ON "classroom_audit_logs" ("created_at");
CREATE INDEX IF NOT EXISTS "idx_classroom_audit_resource" ON "classroom_audit_logs" ("resource_type");
CREATE INDEX IF NOT EXISTS "idx_classroom_audit_action" ON "classroom_audit_logs" ("action");

-- 7. Classroom Resource Versions (Content Versioning)
CREATE TABLE IF NOT EXISTS "classroom_resource_versions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "classroom_id" uuid NOT NULL REFERENCES "classrooms"("id") ON DELETE CASCADE,
  "resource_type" text NOT NULL,
  "resource_id" uuid NOT NULL,
  "version_number" integer NOT NULL DEFAULT 1,
  "title" text NOT NULL,
  "content_json" jsonb,
  "content_html" text,
  "created_by_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "change_notes" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_resource_versions_resource" ON "classroom_resource_versions" ("resource_id");
CREATE INDEX IF NOT EXISTS "idx_resource_versions_classroom" ON "classroom_resource_versions" ("classroom_id");
