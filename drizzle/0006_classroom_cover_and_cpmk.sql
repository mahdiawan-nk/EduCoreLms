-- Migration 0006: Add CPMK (Learning Outcomes / Short Syllabus) and Cover Image metadata to classrooms

ALTER TABLE "classrooms"
  ADD COLUMN IF NOT EXISTS "cpmk" text,
  ADD COLUMN IF NOT EXISTS "cover_image_path" text,
  ADD COLUMN IF NOT EXISTS "cover_thumbnail_path" text,
  ADD COLUMN IF NOT EXISTS "cover_mime_type" text,
  ADD COLUMN IF NOT EXISTS "cover_file_size" integer,
  ADD COLUMN IF NOT EXISTS "cover_width" integer,
  ADD COLUMN IF NOT EXISTS "cover_height" integer,
  ADD COLUMN IF NOT EXISTS "cover_updated_at" timestamp with time zone;
