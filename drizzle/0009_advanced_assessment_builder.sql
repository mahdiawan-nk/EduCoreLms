-- Phase 21: Advanced Assessment & Examination Builder Migration (Non-destructive)

CREATE TABLE IF NOT EXISTS "question_import_jobs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "classroom_id" uuid REFERENCES "classrooms"("id") ON DELETE CASCADE,
  "assessment_id" uuid REFERENCES "assessments"("id") ON DELETE SET NULL,
  "uploaded_by_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "filename" text NOT NULL,
  "file_format" text NOT NULL,
  "import_mode" text DEFAULT 'SKIP_DUPLICATES' NOT NULL,
  "fingerprint" text NOT NULL,
  "status" text DEFAULT 'PENDING' NOT NULL,
  "batch_size" integer DEFAULT 100 NOT NULL,
  "total_rows" integer DEFAULT 0 NOT NULL,
  "processed_rows" integer DEFAULT 0 NOT NULL,
  "successful_rows" integer DEFAULT 0 NOT NULL,
  "failed_rows" integer DEFAULT 0 NOT NULL,
  "skipped_rows" integer DEFAULT 0 NOT NULL,
  "payload_rows" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "error_report" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "summary" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "completed_at" timestamp with time zone
);

CREATE INDEX IF NOT EXISTS "idx_question_import_jobs_classroom" ON "question_import_jobs" ("classroom_id");
CREATE INDEX IF NOT EXISTS "idx_question_import_jobs_user" ON "question_import_jobs" ("uploaded_by_id");
CREATE INDEX IF NOT EXISTS "idx_question_import_jobs_fingerprint" ON "question_import_jobs" ("fingerprint");

CREATE TABLE IF NOT EXISTS "question_import_errors" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "job_id" uuid NOT NULL REFERENCES "question_import_jobs"("id") ON DELETE CASCADE,
  "row_number" integer NOT NULL,
  "external_question_id" text DEFAULT '' NOT NULL,
  "field" text DEFAULT '' NOT NULL,
  "error_message" text NOT NULL,
  "raw_row" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_question_import_errors_job" ON "question_import_errors" ("job_id");

ALTER TABLE "questions"
  ADD COLUMN IF NOT EXISTS "title" text DEFAULT '' NOT NULL,
  ADD COLUMN IF NOT EXISTS "question_code" text,
  ADD COLUMN IF NOT EXISTS "status" text DEFAULT 'READY' NOT NULL,
  ADD COLUMN IF NOT EXISTS "source_type" text DEFAULT 'EDITOR' NOT NULL,
  ADD COLUMN IF NOT EXISTS "external_question_id" text,
  ADD COLUMN IF NOT EXISTS "import_job_id" uuid REFERENCES "question_import_jobs"("id") ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS "tags" jsonb DEFAULT '[]'::jsonb NOT NULL;

CREATE INDEX IF NOT EXISTS "idx_questions_status" ON "questions" ("status");
CREATE INDEX IF NOT EXISTS "idx_questions_source_type" ON "questions" ("source_type");
CREATE INDEX IF NOT EXISTS "idx_questions_external_id" ON "questions" ("author_id", "external_question_id");

ALTER TABLE "question_options"
  ADD COLUMN IF NOT EXISTS "audio_object_key" text;

ALTER TABLE "question_media"
  ADD COLUMN IF NOT EXISTS "duration_seconds" integer,
  ADD COLUMN IF NOT EXISTS "width" integer,
  ADD COLUMN IF NOT EXISTS "height" integer,
  ADD COLUMN IF NOT EXISTS "thumbnail_key" text,
  ADD COLUMN IF NOT EXISTS "optimized_filename" text,
  ADD COLUMN IF NOT EXISTS "uploaded_by_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS "option_id" uuid;

ALTER TABLE "assessment_questions"
  ADD COLUMN IF NOT EXISTS "question_snapshot" jsonb,
  ADD COLUMN IF NOT EXISTS "source_version_number" integer DEFAULT 1 NOT NULL;
