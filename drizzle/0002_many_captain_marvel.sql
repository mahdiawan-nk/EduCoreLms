CREATE TABLE "assignment_group_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"role" text DEFAULT 'MEMBER' NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assignment_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"assignment_id" uuid NOT NULL,
	"classroom_id" uuid NOT NULL,
	"name" text NOT NULL,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assignment_reminders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"assignment_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"sent_by_id" uuid NOT NULL,
	"message" text NOT NULL,
	"channel" text DEFAULT 'IN_APP' NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assignment_rubric_criteria" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rubric_id" uuid NOT NULL,
	"assignment_id" uuid NOT NULL,
	"criterion_name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"max_score" integer DEFAULT 100 NOT NULL,
	"weight" integer DEFAULT 25 NOT NULL,
	"performance_levels" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"sort_order" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assignment_rubrics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"assignment_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"total_weight" integer DEFAULT 100 NOT NULL,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assignment_rubrics_assignment_id_unique" UNIQUE("assignment_id")
);
--> statement-breakpoint
CREATE TABLE "submission_comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"submission_id" uuid NOT NULL,
	"assignment_id" uuid NOT NULL,
	"author_id" uuid NOT NULL,
	"parent_comment_id" uuid,
	"content" text NOT NULL,
	"visibility" text DEFAULT 'STUDENT_VISIBLE' NOT NULL,
	"attachment_object_key" text,
	"attachment_name" text,
	"is_read" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "submission_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"submission_id" uuid,
	"assignment_id" uuid NOT NULL,
	"actor_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "submission_grades" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"submission_id" uuid NOT NULL,
	"assignment_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"graded_by_id" uuid NOT NULL,
	"grading_method" text DEFAULT 'DIRECT' NOT NULL,
	"raw_score" numeric(5, 2) DEFAULT '0' NOT NULL,
	"final_score" numeric(5, 2) DEFAULT '0' NOT NULL,
	"previous_score" numeric(5, 2),
	"max_score" integer DEFAULT 100 NOT NULL,
	"general_feedback" text DEFAULT '' NOT NULL,
	"private_comment" text DEFAULT '' NOT NULL,
	"revision_instructions" text DEFAULT '' NOT NULL,
	"feedback_attachment_key" text,
	"feedback_attachment_name" text,
	"is_published" boolean DEFAULT false NOT NULL,
	"modification_reason" text,
	"audit_history" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "submission_grades_submission_id_unique" UNIQUE("submission_id")
);
--> statement-breakpoint
CREATE TABLE "submission_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"submission_id" uuid NOT NULL,
	"version_id" uuid,
	"url" text NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"link_category" text DEFAULT 'HTTPS' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "submission_rubric_scores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"grade_id" uuid NOT NULL,
	"submission_id" uuid NOT NULL,
	"criterion_id" uuid NOT NULL,
	"score" numeric(5, 2) DEFAULT '0' NOT NULL,
	"max_score" integer DEFAULT 100 NOT NULL,
	"weight" integer DEFAULT 25 NOT NULL,
	"weighted_score" numeric(5, 2) DEFAULT '0' NOT NULL,
	"feedback" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "submission_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"submission_id" uuid NOT NULL,
	"assignment_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"version_number" integer DEFAULT 1 NOT NULL,
	"submission_text" text DEFAULT '' NOT NULL,
	"submission_json" jsonb DEFAULT '{"type":"doc","content":[]}'::jsonb NOT NULL,
	"submission_html" text,
	"links_snapshot" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"attachments_snapshot" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_late" boolean DEFAULT false NOT NULL,
	"late_minutes" integer DEFAULT 0 NOT NULL,
	"idempotency_key" text,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "assignment_attachments" DROP CONSTRAINT "assignment_attachments_file_id_stored_files_id_fk";
--> statement-breakpoint
ALTER TABLE "submission_attachments" DROP CONSTRAINT "submission_attachments_file_id_stored_files_id_fk";
--> statement-breakpoint
ALTER TABLE "assignment_attachments" ALTER COLUMN "file_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "assignment_attachments" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "assignment_attachments" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "assignment_submissions" ALTER COLUMN "submission_text" SET DEFAULT '';--> statement-breakpoint
ALTER TABLE "assignment_submissions" ALTER COLUMN "status" SET DEFAULT 'submitted';--> statement-breakpoint
ALTER TABLE "assignment_submissions" ALTER COLUMN "submitted_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "assignment_submissions" ALTER COLUMN "submitted_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "assignment_submissions" ALTER COLUMN "graded_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "assignment_submissions" ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "assignment_submissions" ALTER COLUMN "updated_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "assignments" ALTER COLUMN "due_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "assignments" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "assignments" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "assignments" ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "assignments" ALTER COLUMN "updated_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "submission_attachments" ALTER COLUMN "file_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "submission_attachments" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "submission_attachments" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "submission_revisions" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "submission_revisions" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "assignment_attachments" ADD COLUMN "original_name" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "assignment_attachments" ADD COLUMN "object_key" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "assignment_attachments" ADD COLUMN "mime_type" text DEFAULT 'application/octet-stream' NOT NULL;--> statement-breakpoint
ALTER TABLE "assignment_attachments" ADD COLUMN "file_extension" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "assignment_attachments" ADD COLUMN "file_size" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "assignment_attachments" ADD COLUMN "checksum" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "assignment_attachments" ADD COLUMN "description" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "assignment_attachments" ADD COLUMN "sort_order" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "assignment_submissions" ADD COLUMN "group_id" uuid;--> statement-breakpoint
ALTER TABLE "assignment_submissions" ADD COLUMN "submission_json" jsonb DEFAULT '{"type":"doc","content":[]}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "assignment_submissions" ADD COLUMN "submission_html" text;--> statement-breakpoint
ALTER TABLE "assignment_submissions" ADD COLUMN "is_late" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "assignment_submissions" ADD COLUMN "late_minutes" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "assignment_submissions" ADD COLUMN "current_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "assignment_submissions" ADD COLUMN "idempotency_key" text;--> statement-breakpoint
ALTER TABLE "assignment_submissions" ADD COLUMN "published_score" numeric(5, 2);--> statement-breakpoint
ALTER TABLE "assignment_submissions" ADD COLUMN "is_grade_published" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "assignment_submissions" ADD COLUMN "grading_status" text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "assignment_submissions" ADD COLUMN "private_notes" text;--> statement-breakpoint
ALTER TABLE "assignment_submissions" ADD COLUMN "revision_instructions" text;--> statement-breakpoint
ALTER TABLE "assignment_submissions" ADD COLUMN "returned_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "assignment_submissions" ADD COLUMN "last_activity_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "assignments" ADD COLUMN "meeting_number" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "assignments" ADD COLUMN "sequence_order" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "assignments" ADD COLUMN "subtitle" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "assignments" ADD COLUMN "short_description" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "assignments" ADD COLUMN "assignment_type" text DEFAULT 'Individual' NOT NULL;--> statement-breakpoint
ALTER TABLE "assignments" ADD COLUMN "learning_objectives" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "assignments" ADD COLUMN "instructions_json" jsonb DEFAULT '{"type":"doc","content":[]}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "assignments" ADD COLUMN "instructions_html" text;--> statement-breakpoint
ALTER TABLE "assignments" ADD COLUMN "estimated_completion_minutes" integer DEFAULT 120 NOT NULL;--> statement-breakpoint
ALTER TABLE "assignments" ADD COLUMN "cover_image_key" text;--> statement-breakpoint
ALTER TABLE "assignments" ADD COLUMN "submission_config" jsonb DEFAULT '{"submissionMethods":["FILE_UPLOAD","TEXT_RESPONSE","EXTERNAL_URL"],"allowFileUpload":true,"allowTextResponse":true,"allowExternalLinks":true,"allowedExtensions":["pdf","doc","docx","xls","xlsx","ppt","pptx","jpg","jpeg","png","webp"],"maxFileSizeMb":25,"maxFiles":5,"maxLinks":5,"requireAttachment":false,"requireLink":false,"allowMultipleVersions":true,"maxRevisions":5,"allowLateSubmission":true,"gracePeriodMinutes":15,"allowAfterDeadline":true,"allowEditBeforeDeadline":true,"allowReturnForRevision":true,"gradingMethod":"COMBINED"}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "assignments" ADD COLUMN "published_at" timestamp with time zone DEFAULT now();--> statement-breakpoint
ALTER TABLE "assignments" ADD COLUMN "scheduled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "assignments" ADD COLUMN "available_from" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "assignments" ADD COLUMN "available_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "assignments" ADD COLUMN "timezone" text DEFAULT 'Asia/Jakarta' NOT NULL;--> statement-breakpoint
ALTER TABLE "assignments" ADD COLUMN "late_submission_policy" text DEFAULT 'ACCEPT_WITH_LATE_FLAG' NOT NULL;--> statement-breakpoint
ALTER TABLE "assignments" ADD COLUMN "grade_publication_policy" text DEFAULT 'MANUAL_PUBLISH' NOT NULL;--> statement-breakpoint
ALTER TABLE "submission_attachments" ADD COLUMN "version_id" uuid;--> statement-breakpoint
ALTER TABLE "submission_attachments" ADD COLUMN "original_name" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "submission_attachments" ADD COLUMN "object_key" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "submission_attachments" ADD COLUMN "mime_type" text DEFAULT 'application/octet-stream' NOT NULL;--> statement-breakpoint
ALTER TABLE "submission_attachments" ADD COLUMN "file_extension" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "submission_attachments" ADD COLUMN "file_size" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "submission_attachments" ADD COLUMN "checksum" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "submission_attachments" ADD COLUMN "description" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "submission_attachments" ADD COLUMN "uploaded_by_id" uuid;--> statement-breakpoint
ALTER TABLE "assignment_group_members" ADD CONSTRAINT "assignment_group_members_group_id_assignment_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."assignment_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignment_group_members" ADD CONSTRAINT "assignment_group_members_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignment_groups" ADD CONSTRAINT "assignment_groups_assignment_id_assignments_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."assignments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignment_groups" ADD CONSTRAINT "assignment_groups_classroom_id_classrooms_id_fk" FOREIGN KEY ("classroom_id") REFERENCES "public"."classrooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignment_groups" ADD CONSTRAINT "assignment_groups_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignment_reminders" ADD CONSTRAINT "assignment_reminders_assignment_id_assignments_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."assignments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignment_reminders" ADD CONSTRAINT "assignment_reminders_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignment_reminders" ADD CONSTRAINT "assignment_reminders_sent_by_id_users_id_fk" FOREIGN KEY ("sent_by_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignment_rubric_criteria" ADD CONSTRAINT "assignment_rubric_criteria_rubric_id_assignment_rubrics_id_fk" FOREIGN KEY ("rubric_id") REFERENCES "public"."assignment_rubrics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignment_rubric_criteria" ADD CONSTRAINT "assignment_rubric_criteria_assignment_id_assignments_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."assignments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignment_rubrics" ADD CONSTRAINT "assignment_rubrics_assignment_id_assignments_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."assignments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignment_rubrics" ADD CONSTRAINT "assignment_rubrics_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submission_comments" ADD CONSTRAINT "submission_comments_submission_id_assignment_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."assignment_submissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submission_comments" ADD CONSTRAINT "submission_comments_assignment_id_assignments_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."assignments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submission_comments" ADD CONSTRAINT "submission_comments_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submission_events" ADD CONSTRAINT "submission_events_submission_id_assignment_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."assignment_submissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submission_events" ADD CONSTRAINT "submission_events_assignment_id_assignments_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."assignments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submission_events" ADD CONSTRAINT "submission_events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submission_grades" ADD CONSTRAINT "submission_grades_submission_id_assignment_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."assignment_submissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submission_grades" ADD CONSTRAINT "submission_grades_assignment_id_assignments_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."assignments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submission_grades" ADD CONSTRAINT "submission_grades_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submission_grades" ADD CONSTRAINT "submission_grades_graded_by_id_users_id_fk" FOREIGN KEY ("graded_by_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submission_links" ADD CONSTRAINT "submission_links_submission_id_assignment_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."assignment_submissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submission_links" ADD CONSTRAINT "submission_links_version_id_submission_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."submission_versions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submission_rubric_scores" ADD CONSTRAINT "submission_rubric_scores_grade_id_submission_grades_id_fk" FOREIGN KEY ("grade_id") REFERENCES "public"."submission_grades"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submission_rubric_scores" ADD CONSTRAINT "submission_rubric_scores_submission_id_assignment_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."assignment_submissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submission_rubric_scores" ADD CONSTRAINT "submission_rubric_scores_criterion_id_assignment_rubric_criteria_id_fk" FOREIGN KEY ("criterion_id") REFERENCES "public"."assignment_rubric_criteria"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submission_versions" ADD CONSTRAINT "submission_versions_submission_id_assignment_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."assignment_submissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submission_versions" ADD CONSTRAINT "submission_versions_assignment_id_assignments_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."assignments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submission_versions" ADD CONSTRAINT "submission_versions_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_assignment_group_member" ON "assignment_group_members" USING btree ("group_id","student_id");--> statement-breakpoint
CREATE INDEX "idx_assignment_group_members_student" ON "assignment_group_members" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "idx_assignment_groups_assignment" ON "assignment_groups" USING btree ("assignment_id");--> statement-breakpoint
CREATE INDEX "idx_assignment_reminders_assignment" ON "assignment_reminders" USING btree ("assignment_id");--> statement-breakpoint
CREATE INDEX "idx_assignment_reminders_student" ON "assignment_reminders" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "idx_rubric_criteria_rubric" ON "assignment_rubric_criteria" USING btree ("rubric_id");--> statement-breakpoint
CREATE INDEX "idx_rubric_criteria_assignment" ON "assignment_rubric_criteria" USING btree ("assignment_id");--> statement-breakpoint
CREATE INDEX "idx_assignment_rubrics_assignment" ON "assignment_rubrics" USING btree ("assignment_id");--> statement-breakpoint
CREATE INDEX "idx_submission_comments_sub" ON "submission_comments" USING btree ("submission_id");--> statement-breakpoint
CREATE INDEX "idx_submission_comments_assignment" ON "submission_comments" USING btree ("assignment_id");--> statement-breakpoint
CREATE INDEX "idx_submission_events_sub" ON "submission_events" USING btree ("submission_id");--> statement-breakpoint
CREATE INDEX "idx_submission_events_assignment" ON "submission_events" USING btree ("assignment_id");--> statement-breakpoint
CREATE INDEX "idx_submission_grades_sub" ON "submission_grades" USING btree ("submission_id");--> statement-breakpoint
CREATE INDEX "idx_submission_grades_assignment" ON "submission_grades" USING btree ("assignment_id");--> statement-breakpoint
CREATE INDEX "idx_submission_grades_student" ON "submission_grades" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "idx_submission_links_sub" ON "submission_links" USING btree ("submission_id");--> statement-breakpoint
CREATE INDEX "idx_rubric_scores_grade" ON "submission_rubric_scores" USING btree ("grade_id");--> statement-breakpoint
CREATE INDEX "idx_rubric_scores_submission" ON "submission_rubric_scores" USING btree ("submission_id");--> statement-breakpoint
CREATE INDEX "idx_submission_versions_sub" ON "submission_versions" USING btree ("submission_id");--> statement-breakpoint
CREATE INDEX "idx_submission_versions_assignment" ON "submission_versions" USING btree ("assignment_id");--> statement-breakpoint
ALTER TABLE "assignment_attachments" ADD CONSTRAINT "assignment_attachments_file_id_stored_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."stored_files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignment_submissions" ADD CONSTRAINT "assignment_submissions_group_id_assignment_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."assignment_groups"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submission_attachments" ADD CONSTRAINT "submission_attachments_version_id_submission_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."submission_versions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submission_attachments" ADD CONSTRAINT "submission_attachments_uploaded_by_id_users_id_fk" FOREIGN KEY ("uploaded_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submission_attachments" ADD CONSTRAINT "submission_attachments_file_id_stored_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."stored_files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_assignment_attachments_key" ON "assignment_attachments" USING btree ("object_key");--> statement-breakpoint
CREATE INDEX "idx_submissions_status" ON "assignment_submissions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_assignments_status" ON "assignments" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_submission_attachments_key" ON "submission_attachments" USING btree ("object_key");