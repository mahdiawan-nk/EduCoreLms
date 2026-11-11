CREATE TABLE "material_progress" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"material_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"progress_percent" integer DEFAULT 0 NOT NULL,
	"last_position" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'NOT_STARTED' NOT NULL,
	"completed_at" timestamp,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "material_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"material_id" uuid NOT NULL,
	"revision_number" integer DEFAULT 1 NOT NULL,
	"title" text NOT NULL,
	"content_json" jsonb NOT NULL,
	"status" text NOT NULL,
	"edited_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "material_videos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"material_id" uuid NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"source_type" text NOT NULL,
	"video_url" text,
	"video_id" text,
	"object_key" text,
	"thumbnail_key" text,
	"mime_type" text,
	"file_size" integer DEFAULT 0 NOT NULL,
	"duration" integer DEFAULT 0 NOT NULL,
	"sort_order" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "material_attachments" DROP CONSTRAINT "material_attachments_file_id_stored_files_id_fk";
--> statement-breakpoint
ALTER TABLE "learning_materials" ALTER COLUMN "content" SET DEFAULT '';--> statement-breakpoint
ALTER TABLE "material_attachments" ALTER COLUMN "file_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "comments" ADD COLUMN "material_id" uuid;--> statement-breakpoint
ALTER TABLE "learning_materials" ADD COLUMN "created_by" uuid;--> statement-breakpoint
ALTER TABLE "learning_materials" ADD COLUMN "meeting_number" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "learning_materials" ADD COLUMN "slug" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "learning_materials" ADD COLUMN "subtitle" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "learning_materials" ADD COLUMN "description" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "learning_materials" ADD COLUMN "content_json" jsonb DEFAULT '{"type":"doc","content":[]}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "learning_materials" ADD COLUMN "content_html" text;--> statement-breakpoint
ALTER TABLE "learning_materials" ADD COLUMN "thumbnail_key" text;--> statement-breakpoint
ALTER TABLE "learning_materials" ADD COLUMN "estimated_duration" integer DEFAULT 45 NOT NULL;--> statement-breakpoint
ALTER TABLE "learning_materials" ADD COLUMN "is_required" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "learning_materials" ADD COLUMN "sequence_order" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "learning_materials" ADD COLUMN "completion_rule" text DEFAULT 'VIEW_AND_SCROLL' NOT NULL;--> statement-breakpoint
ALTER TABLE "learning_materials" ADD COLUMN "min_completion_percent" integer DEFAULT 80 NOT NULL;--> statement-breakpoint
ALTER TABLE "learning_materials" ADD COLUMN "enable_comments" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "learning_materials" ADD COLUMN "enable_downloads" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "learning_materials" ADD COLUMN "allow_access_after_publish" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "learning_materials" ADD COLUMN "prerequisite_material_id" uuid;--> statement-breakpoint
ALTER TABLE "learning_materials" ADD COLUMN "status" text DEFAULT 'PUBLISHED' NOT NULL;--> statement-breakpoint
ALTER TABLE "learning_materials" ADD COLUMN "scheduled_at" timestamp;--> statement-breakpoint
ALTER TABLE "learning_materials" ADD COLUMN "published_at" timestamp DEFAULT now();--> statement-breakpoint
ALTER TABLE "learning_materials" ADD COLUMN "availability_start_at" timestamp;--> statement-breakpoint
ALTER TABLE "learning_materials" ADD COLUMN "availability_end_at" timestamp;--> statement-breakpoint
ALTER TABLE "learning_materials" ADD COLUMN "visibility" text DEFAULT 'ENROLLED_ONLY' NOT NULL;--> statement-breakpoint
ALTER TABLE "material_attachments" ADD COLUMN "original_name" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "material_attachments" ADD COLUMN "object_key" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "material_attachments" ADD COLUMN "mime_type" text DEFAULT 'application/octet-stream' NOT NULL;--> statement-breakpoint
ALTER TABLE "material_attachments" ADD COLUMN "file_extension" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "material_attachments" ADD COLUMN "file_size" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "material_attachments" ADD COLUMN "checksum" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "material_attachments" ADD COLUMN "preview_key" text;--> statement-breakpoint
ALTER TABLE "material_attachments" ADD COLUMN "description" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "material_attachments" ADD COLUMN "processing_status" text DEFAULT 'READY' NOT NULL;--> statement-breakpoint
ALTER TABLE "material_attachments" ADD COLUMN "sort_order" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "material_progress" ADD CONSTRAINT "material_progress_material_id_learning_materials_id_fk" FOREIGN KEY ("material_id") REFERENCES "public"."learning_materials"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_progress" ADD CONSTRAINT "material_progress_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_revisions" ADD CONSTRAINT "material_revisions_material_id_learning_materials_id_fk" FOREIGN KEY ("material_id") REFERENCES "public"."learning_materials"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_revisions" ADD CONSTRAINT "material_revisions_edited_by_users_id_fk" FOREIGN KEY ("edited_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_videos" ADD CONSTRAINT "material_videos_material_id_learning_materials_id_fk" FOREIGN KEY ("material_id") REFERENCES "public"."learning_materials"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_material_student_progress" ON "material_progress" USING btree ("material_id","student_id");--> statement-breakpoint
CREATE INDEX "idx_material_progress_material" ON "material_progress" USING btree ("material_id");--> statement-breakpoint
CREATE INDEX "idx_material_progress_student" ON "material_progress" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "idx_material_revisions_material" ON "material_revisions" USING btree ("material_id");--> statement-breakpoint
CREATE INDEX "idx_material_videos_material" ON "material_videos" USING btree ("material_id");--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_material_id_learning_materials_id_fk" FOREIGN KEY ("material_id") REFERENCES "public"."learning_materials"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_materials" ADD CONSTRAINT "learning_materials_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_attachments" ADD CONSTRAINT "material_attachments_file_id_stored_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."stored_files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_comments_material" ON "comments" USING btree ("material_id");--> statement-breakpoint
CREATE INDEX "idx_materials_status" ON "learning_materials" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_material_attachments_object_key" ON "material_attachments" USING btree ("object_key");