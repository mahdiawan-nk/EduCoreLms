CREATE TABLE "academic_calendar_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"academic_period_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"category" text NOT NULL,
	"start_date" timestamp with time zone NOT NULL,
	"end_date" timestamp with time zone NOT NULL,
	"is_holiday" boolean DEFAULT false NOT NULL,
	"visibility" text DEFAULT 'ALL' NOT NULL,
	"color" text DEFAULT '#2563eb' NOT NULL,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "academic_periods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"academic_year" text NOT NULL,
	"semester_type" text NOT NULL,
	"start_date" timestamp with time zone NOT NULL,
	"end_date" timestamp with time zone NOT NULL,
	"registration_start" timestamp with time zone NOT NULL,
	"registration_end" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_by_id" uuid,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "academic_periods_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "assessment_accommodations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"assessment_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"extra_duration_minutes" integer DEFAULT 0 NOT NULL,
	"extra_attempts" integer DEFAULT 0 NOT NULL,
	"extended_end_date" timestamp with time zone,
	"reason" text DEFAULT '' NOT NULL,
	"granted_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assessment_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"assessment_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"attempt_number" integer DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'IN_PROGRESS' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"server_deadline_at" timestamp with time zone NOT NULL,
	"submitted_at" timestamp with time zone,
	"last_activity_at" timestamp with time zone DEFAULT now() NOT NULL,
	"is_late" boolean DEFAULT false NOT NULL,
	"version_number" integer DEFAULT 1 NOT NULL,
	"idempotency_key" text,
	"objective_score" numeric(6, 2) DEFAULT '0' NOT NULL,
	"essay_score" numeric(6, 2) DEFAULT '0' NOT NULL,
	"total_score" numeric(6, 2) DEFAULT '0' NOT NULL,
	"max_score" numeric(6, 2) DEFAULT '100' NOT NULL,
	"percentage_score" numeric(5, 2) DEFAULT '0' NOT NULL,
	"passed" boolean DEFAULT false NOT NULL,
	"objective_grading_status" text DEFAULT 'PENDING' NOT NULL,
	"essay_grading_status" text DEFAULT 'NOT_APPLICABLE' NOT NULL,
	"final_grading_status" text DEFAULT 'IN_PROGRESS' NOT NULL,
	"is_published_to_student" boolean DEFAULT false NOT NULL,
	"general_feedback" text DEFAULT '' NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assessment_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"assessment_id" uuid NOT NULL,
	"attempt_id" uuid,
	"actor_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"ip_address" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assessment_question_pools" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"assessment_id" uuid NOT NULL,
	"section_id" uuid,
	"question_bank_id" uuid,
	"title" text NOT NULL,
	"category_filter" text DEFAULT '' NOT NULL,
	"topic_filter" text DEFAULT '' NOT NULL,
	"difficulty_filter" text DEFAULT 'ANY' NOT NULL,
	"difficulty_distribution" jsonb DEFAULT '{"easy":0,"medium":0,"hard":0}'::jsonb NOT NULL,
	"question_count" integer DEFAULT 5 NOT NULL,
	"points_per_question" numeric(6, 2) DEFAULT '10' NOT NULL,
	"sort_order" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assessment_questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"assessment_id" uuid NOT NULL,
	"section_id" uuid,
	"question_id" uuid NOT NULL,
	"points_override" numeric(6, 2),
	"negative_points_override" numeric(6, 2),
	"rubric_id" uuid,
	"sort_order" integer DEFAULT 1 NOT NULL,
	"is_required" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assessment_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"assessment_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"best_attempt_id" uuid,
	"latest_attempt_id" uuid,
	"attempts_used" integer DEFAULT 0 NOT NULL,
	"objective_score" numeric(6, 2) DEFAULT '0' NOT NULL,
	"essay_score" numeric(6, 2) DEFAULT '0' NOT NULL,
	"final_score" numeric(6, 2) DEFAULT '0' NOT NULL,
	"max_score" numeric(6, 2) DEFAULT '100' NOT NULL,
	"percentage_score" numeric(5, 2) DEFAULT '0' NOT NULL,
	"passed" boolean DEFAULT false NOT NULL,
	"grading_status" text DEFAULT 'PENDING' NOT NULL,
	"is_published" boolean DEFAULT false NOT NULL,
	"published_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assessment_rubric_criteria" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rubric_id" uuid NOT NULL,
	"criterion_name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"weight" integer DEFAULT 25 NOT NULL,
	"max_score" numeric(6, 2) DEFAULT '25' NOT NULL,
	"performance_levels" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"sort_order" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assessment_rubrics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"assessment_id" uuid,
	"question_id" uuid,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"total_weight" integer DEFAULT 100 NOT NULL,
	"max_score" numeric(6, 2) DEFAULT '100' NOT NULL,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assessment_sections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"assessment_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"section_type" text DEFAULT 'OBJECTIVE' NOT NULL,
	"total_points" integer DEFAULT 50 NOT NULL,
	"sort_order" integer DEFAULT 1 NOT NULL,
	"randomize_questions" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assessments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"classroom_id" uuid NOT NULL,
	"topic_id" uuid,
	"author_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"category" text DEFAULT 'QUIZ' NOT NULL,
	"assessment_mode" text DEFAULT 'OBJECTIVE' NOT NULL,
	"instructions" text DEFAULT '' NOT NULL,
	"instructions_json" jsonb DEFAULT '{"type":"doc","content":[]}'::jsonb NOT NULL,
	"instructions_html" text,
	"max_score" integer DEFAULT 100 NOT NULL,
	"passing_grade" integer DEFAULT 70 NOT NULL,
	"estimated_duration_minutes" integer DEFAULT 60 NOT NULL,
	"duration_minutes" integer DEFAULT 60 NOT NULL,
	"max_attempts" integer DEFAULT 1 NOT NULL,
	"start_date" timestamp with time zone,
	"end_date" timestamp with time zone,
	"late_attempt_policy" text DEFAULT 'REJECT' NOT NULL,
	"late_penalty_percent" integer DEFAULT 0 NOT NULL,
	"settings_config" jsonb DEFAULT '{"randomizeQuestions":false,"randomizeOptions":false,"oneQuestionAtATime":false,"allowBackwardNavigation":true,"allowAnswerChanges":true,"showRemainingTime":true,"autoSubmit":true,"autosave":true,"resultVisibility":"AFTER_PUBLISH","explanationVisibility":"AFTER_PUBLISH","negativeMarkingEnabled":false,"negativeMarkingPercent":0,"gradePublicationPolicy":"MANUAL"}'::jsonb NOT NULL,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"published_at" timestamp with time zone,
	"scheduled_at" timestamp with time zone,
	"results_published" boolean DEFAULT false NOT NULL,
	"results_published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attempt_answers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"attempt_id" uuid NOT NULL,
	"attempt_question_id" uuid NOT NULL,
	"source_question_id" uuid,
	"student_id" uuid NOT NULL,
	"answer_payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_answered" boolean DEFAULT false NOT NULL,
	"is_flagged" boolean DEFAULT false NOT NULL,
	"is_correct" boolean,
	"partial_ratio" numeric(5, 4),
	"auto_score" numeric(6, 2),
	"manual_score" numeric(6, 2),
	"final_question_score" numeric(6, 2),
	"requires_manual_review" boolean DEFAULT false NOT NULL,
	"grading_status" text DEFAULT 'UNGRADED' NOT NULL,
	"autosave_version" integer DEFAULT 1 NOT NULL,
	"saved_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attempt_questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"attempt_id" uuid NOT NULL,
	"assessment_id" uuid NOT NULL,
	"section_id" uuid,
	"source_question_id" uuid,
	"source_pool_id" uuid,
	"question_order" integer DEFAULT 1 NOT NULL,
	"question_mode" text DEFAULT 'OBJECTIVE' NOT NULL,
	"question_type" text DEFAULT 'SINGLE_CHOICE' NOT NULL,
	"prompt_text" text NOT NULL,
	"prompt_json" jsonb DEFAULT '{"type":"doc","content":[]}'::jsonb NOT NULL,
	"prompt_html" text,
	"points" numeric(6, 2) DEFAULT '10' NOT NULL,
	"negative_points" numeric(6, 2) DEFAULT '0' NOT NULL,
	"partial_credit_enabled" boolean DEFAULT true NOT NULL,
	"student_options_snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"server_answer_key_snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"explanation_snapshot" text DEFAULT '' NOT NULL,
	"rubric_snapshot" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campus_buildings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"location" text DEFAULT 'Kampus Utama Politeknik Kampar' NOT NULL,
	"total_floors" integer DEFAULT 3 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "campus_buildings_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "campus_rooms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"building_id" uuid NOT NULL,
	"room_number" text NOT NULL,
	"name" text NOT NULL,
	"room_type" text DEFAULT 'CLASSROOM' NOT NULL,
	"capacity" integer DEFAULT 40 NOT NULL,
	"facilities" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "classroom_approvals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"classroom_id" uuid NOT NULL,
	"requested_by_id" uuid NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"reviewer_id" uuid,
	"review_notes" text,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "classroom_enrollment_policies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"classroom_id" uuid NOT NULL,
	"enrollment_mode" text DEFAULT 'AUTO' NOT NULL,
	"min_participants" integer DEFAULT 10 NOT NULL,
	"max_participants" integer DEFAULT 35 NOT NULL,
	"enrollment_start_date" timestamp with time zone,
	"enrollment_end_date" timestamp with time zone,
	"allowed_study_programs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"allowed_cohorts" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"student_eligibility_rules" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"allow_late_enrollment" boolean DEFAULT false NOT NULL,
	"waiting_list_enabled" boolean DEFAULT true NOT NULL,
	"max_waiting_list" integer DEFAULT 15 NOT NULL,
	"join_code_expires_at" timestamp with time zone,
	"join_code_max_uses" integer DEFAULT 50 NOT NULL,
	"join_code_uses_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "classroom_enrollment_policies_classroom_id_unique" UNIQUE("classroom_id")
);
--> statement-breakpoint
CREATE TABLE "classroom_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"classroom_id" uuid NOT NULL,
	"actor_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"ip_address" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "classroom_invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"classroom_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"invited_by_id" uuid NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"invitation_message" text,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "classroom_schedules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"classroom_id" uuid NOT NULL,
	"day_of_week" integer NOT NULL,
	"start_time" text NOT NULL,
	"end_time" text NOT NULL,
	"effective_start_date" timestamp with time zone,
	"effective_end_date" timestamp with time zone,
	"schedule_type" text DEFAULT 'THEORY' NOT NULL,
	"instructor_id" uuid,
	"building_id" uuid,
	"room_id" uuid,
	"meeting_type" text DEFAULT 'OFFLINE' NOT NULL,
	"online_link" text,
	"exceptions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "classroom_waitlists" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"classroom_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"queue_number" integer NOT NULL,
	"status" text DEFAULT 'WAITING' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "course_offerings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"course_id" uuid NOT NULL,
	"academic_period_id" uuid NOT NULL,
	"study_program" text NOT NULL,
	"course_code" text NOT NULL,
	"course_name" text NOT NULL,
	"theory_credits" integer DEFAULT 2 NOT NULL,
	"practical_credits" integer DEFAULT 1 NOT NULL,
	"total_credits" integer DEFAULT 3 NOT NULL,
	"coordinator_id" uuid,
	"offering_status" text DEFAULT 'OFFERED' NOT NULL,
	"max_classrooms" integer DEFAULT 5 NOT NULL,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "essay_attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"attempt_id" uuid NOT NULL,
	"attempt_question_id" uuid NOT NULL,
	"answer_id" uuid,
	"file_id" uuid,
	"original_name" text DEFAULT '' NOT NULL,
	"object_key" text DEFAULT '' NOT NULL,
	"mime_type" text DEFAULT 'application/octet-stream' NOT NULL,
	"file_extension" text DEFAULT '' NOT NULL,
	"file_size" integer DEFAULT 0 NOT NULL,
	"checksum" text DEFAULT '' NOT NULL,
	"uploaded_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "essay_feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"essay_grade_id" uuid,
	"attempt_id" uuid NOT NULL,
	"attempt_question_id" uuid NOT NULL,
	"author_id" uuid NOT NULL,
	"feedback_text" text NOT NULL,
	"feedback_json" jsonb,
	"visibility" text DEFAULT 'STUDENT_VISIBLE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "essay_grades" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"attempt_id" uuid NOT NULL,
	"attempt_question_id" uuid NOT NULL,
	"answer_id" uuid,
	"graded_by_id" uuid NOT NULL,
	"grading_method" text DEFAULT 'DIRECT' NOT NULL,
	"raw_score" numeric(6, 2) DEFAULT '0' NOT NULL,
	"final_score" numeric(6, 2) DEFAULT '0' NOT NULL,
	"max_score" numeric(6, 2) DEFAULT '10' NOT NULL,
	"criterion_scores" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"feedback" text DEFAULT '' NOT NULL,
	"is_draft" boolean DEFAULT false NOT NULL,
	"revision_number" integer DEFAULT 1 NOT NULL,
	"audit_history" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"graded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "essay_grades_attempt_question_id_unique" UNIQUE("attempt_question_id")
);
--> statement-breakpoint
CREATE TABLE "question_bank_tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"question_id" uuid NOT NULL,
	"tag" text NOT NULL,
	"learning_outcome_code" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "question_banks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"classroom_id" uuid,
	"course_id" uuid,
	"owner_id" uuid NOT NULL,
	"title" text NOT NULL,
	"subject" text DEFAULT '' NOT NULL,
	"topic" text DEFAULT '' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"is_shared" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "question_media" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"question_id" uuid NOT NULL,
	"file_id" uuid,
	"media_type" text DEFAULT 'IMAGE' NOT NULL,
	"object_key" text NOT NULL,
	"original_name" text NOT NULL,
	"mime_type" text DEFAULT 'image/png' NOT NULL,
	"file_size" integer DEFAULT 0 NOT NULL,
	"caption" text DEFAULT '' NOT NULL,
	"sort_order" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "question_options" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"question_id" uuid NOT NULL,
	"option_label" text NOT NULL,
	"option_text" text NOT NULL,
	"option_json" jsonb,
	"image_object_key" text,
	"match_right_text" text,
	"correct_order_index" integer,
	"is_correct" boolean DEFAULT false NOT NULL,
	"score_weight" numeric(5, 2) DEFAULT '100' NOT NULL,
	"feedback" text DEFAULT '' NOT NULL,
	"sort_order" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"question_bank_id" uuid,
	"classroom_id" uuid,
	"author_id" uuid NOT NULL,
	"question_mode" text DEFAULT 'OBJECTIVE' NOT NULL,
	"question_type" text DEFAULT 'SINGLE_CHOICE' NOT NULL,
	"subject" text DEFAULT '' NOT NULL,
	"topic" text DEFAULT '' NOT NULL,
	"category" text DEFAULT 'General' NOT NULL,
	"difficulty" text DEFAULT 'MEDIUM' NOT NULL,
	"learning_outcome" text DEFAULT '' NOT NULL,
	"prompt_text" text NOT NULL,
	"prompt_json" jsonb DEFAULT '{"type":"doc","content":[]}'::jsonb NOT NULL,
	"prompt_html" text,
	"points" numeric(6, 2) DEFAULT '10' NOT NULL,
	"negative_points" numeric(6, 2) DEFAULT '0' NOT NULL,
	"partial_credit_enabled" boolean DEFAULT true NOT NULL,
	"answer_config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"explanation" text DEFAULT '' NOT NULL,
	"explanation_json" jsonb DEFAULT '{"type":"doc","content":[]}'::jsonb,
	"version_number" integer DEFAULT 1 NOT NULL,
	"usage_count" integer DEFAULT 0 NOT NULL,
	"version_history" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"usage_history" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "classroom_enrollments" ADD COLUMN "enrollment_source" text DEFAULT 'CATALOG' NOT NULL;--> statement-breakpoint
ALTER TABLE "classroom_enrollments" ADD COLUMN "rejection_reason" text;--> statement-breakpoint
ALTER TABLE "classroom_enrollments" ADD COLUMN "withdrawn_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "classroom_enrollments" ADD COLUMN "last_activity_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "classroom_instructors" ADD COLUMN "role" text DEFAULT 'PRIMARY_INSTRUCTOR' NOT NULL;--> statement-breakpoint
ALTER TABLE "classroom_instructors" ADD COLUMN "permission_scopes" jsonb DEFAULT '["all"]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "classroom_instructors" ADD COLUMN "status" text DEFAULT 'ACTIVE' NOT NULL;--> statement-breakpoint
ALTER TABLE "classroom_join_codes" ADD COLUMN "max_uses" integer DEFAULT 100 NOT NULL;--> statement-breakpoint
ALTER TABLE "classroom_join_codes" ADD COLUMN "uses_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "classrooms" ADD COLUMN "course_offering_id" uuid;--> statement-breakpoint
ALTER TABLE "classrooms" ADD COLUMN "academic_period_id" uuid;--> statement-breakpoint
ALTER TABLE "classrooms" ADD COLUMN "classroom_code" text;--> statement-breakpoint
ALTER TABLE "classrooms" ADD COLUMN "cohort" text;--> statement-breakpoint
ALTER TABLE "classrooms" ADD COLUMN "classroom_type" text DEFAULT 'REGULAR' NOT NULL;--> statement-breakpoint
ALTER TABLE "classrooms" ADD COLUMN "min_capacity" integer DEFAULT 10 NOT NULL;--> statement-breakpoint
ALTER TABLE "classrooms" ADD COLUMN "max_capacity" integer DEFAULT 35 NOT NULL;--> statement-breakpoint
ALTER TABLE "classrooms" ADD COLUMN "category" text DEFAULT 'REGULAR' NOT NULL;--> statement-breakpoint
ALTER TABLE "classrooms" ADD COLUMN "language" text DEFAULT 'id' NOT NULL;--> statement-breakpoint
ALTER TABLE "classrooms" ADD COLUMN "visibility" text DEFAULT 'PUBLIC_ENROLLED' NOT NULL;--> statement-breakpoint
ALTER TABLE "classrooms" ADD COLUMN "learning_objectives" text;--> statement-breakpoint
ALTER TABLE "classrooms" ADD COLUMN "cover_image_key" text;--> statement-breakpoint
ALTER TABLE "classrooms" ADD COLUMN "lifecycle_status" text DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "classrooms" ADD COLUMN "approval_status" text DEFAULT 'APPROVED' NOT NULL;--> statement-breakpoint
ALTER TABLE "classrooms" ADD COLUMN "scheduled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "classrooms" ADD COLUMN "published_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "classrooms" ADD COLUMN "completed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "classrooms" ADD COLUMN "archived_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "submission_grades" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "academic_calendar_events" ADD CONSTRAINT "academic_calendar_events_academic_period_id_academic_periods_id_fk" FOREIGN KEY ("academic_period_id") REFERENCES "public"."academic_periods"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "academic_calendar_events" ADD CONSTRAINT "academic_calendar_events_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "academic_periods" ADD CONSTRAINT "academic_periods_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_accommodations" ADD CONSTRAINT "assessment_accommodations_assessment_id_assessments_id_fk" FOREIGN KEY ("assessment_id") REFERENCES "public"."assessments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_accommodations" ADD CONSTRAINT "assessment_accommodations_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_accommodations" ADD CONSTRAINT "assessment_accommodations_granted_by_id_users_id_fk" FOREIGN KEY ("granted_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_attempts" ADD CONSTRAINT "assessment_attempts_assessment_id_assessments_id_fk" FOREIGN KEY ("assessment_id") REFERENCES "public"."assessments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_attempts" ADD CONSTRAINT "assessment_attempts_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_events" ADD CONSTRAINT "assessment_events_assessment_id_assessments_id_fk" FOREIGN KEY ("assessment_id") REFERENCES "public"."assessments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_events" ADD CONSTRAINT "assessment_events_attempt_id_assessment_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."assessment_attempts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_events" ADD CONSTRAINT "assessment_events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_question_pools" ADD CONSTRAINT "assessment_question_pools_assessment_id_assessments_id_fk" FOREIGN KEY ("assessment_id") REFERENCES "public"."assessments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_question_pools" ADD CONSTRAINT "assessment_question_pools_section_id_assessment_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."assessment_sections"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_question_pools" ADD CONSTRAINT "assessment_question_pools_question_bank_id_question_banks_id_fk" FOREIGN KEY ("question_bank_id") REFERENCES "public"."question_banks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_questions" ADD CONSTRAINT "assessment_questions_assessment_id_assessments_id_fk" FOREIGN KEY ("assessment_id") REFERENCES "public"."assessments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_questions" ADD CONSTRAINT "assessment_questions_section_id_assessment_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."assessment_sections"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_questions" ADD CONSTRAINT "assessment_questions_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_questions" ADD CONSTRAINT "assessment_questions_rubric_id_assessment_rubrics_id_fk" FOREIGN KEY ("rubric_id") REFERENCES "public"."assessment_rubrics"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_results" ADD CONSTRAINT "assessment_results_assessment_id_assessments_id_fk" FOREIGN KEY ("assessment_id") REFERENCES "public"."assessments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_results" ADD CONSTRAINT "assessment_results_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_results" ADD CONSTRAINT "assessment_results_best_attempt_id_assessment_attempts_id_fk" FOREIGN KEY ("best_attempt_id") REFERENCES "public"."assessment_attempts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_results" ADD CONSTRAINT "assessment_results_latest_attempt_id_assessment_attempts_id_fk" FOREIGN KEY ("latest_attempt_id") REFERENCES "public"."assessment_attempts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_rubric_criteria" ADD CONSTRAINT "assessment_rubric_criteria_rubric_id_assessment_rubrics_id_fk" FOREIGN KEY ("rubric_id") REFERENCES "public"."assessment_rubrics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_rubrics" ADD CONSTRAINT "assessment_rubrics_assessment_id_assessments_id_fk" FOREIGN KEY ("assessment_id") REFERENCES "public"."assessments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_rubrics" ADD CONSTRAINT "assessment_rubrics_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_rubrics" ADD CONSTRAINT "assessment_rubrics_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_sections" ADD CONSTRAINT "assessment_sections_assessment_id_assessments_id_fk" FOREIGN KEY ("assessment_id") REFERENCES "public"."assessments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_classroom_id_classrooms_id_fk" FOREIGN KEY ("classroom_id") REFERENCES "public"."classrooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_topic_id_classroom_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."classroom_topics"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attempt_answers" ADD CONSTRAINT "attempt_answers_attempt_id_assessment_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."assessment_attempts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attempt_answers" ADD CONSTRAINT "attempt_answers_attempt_question_id_attempt_questions_id_fk" FOREIGN KEY ("attempt_question_id") REFERENCES "public"."attempt_questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attempt_answers" ADD CONSTRAINT "attempt_answers_source_question_id_questions_id_fk" FOREIGN KEY ("source_question_id") REFERENCES "public"."questions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attempt_answers" ADD CONSTRAINT "attempt_answers_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attempt_questions" ADD CONSTRAINT "attempt_questions_attempt_id_assessment_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."assessment_attempts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attempt_questions" ADD CONSTRAINT "attempt_questions_assessment_id_assessments_id_fk" FOREIGN KEY ("assessment_id") REFERENCES "public"."assessments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attempt_questions" ADD CONSTRAINT "attempt_questions_section_id_assessment_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."assessment_sections"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attempt_questions" ADD CONSTRAINT "attempt_questions_source_question_id_questions_id_fk" FOREIGN KEY ("source_question_id") REFERENCES "public"."questions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attempt_questions" ADD CONSTRAINT "attempt_questions_source_pool_id_assessment_question_pools_id_fk" FOREIGN KEY ("source_pool_id") REFERENCES "public"."assessment_question_pools"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campus_rooms" ADD CONSTRAINT "campus_rooms_building_id_campus_buildings_id_fk" FOREIGN KEY ("building_id") REFERENCES "public"."campus_buildings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classroom_approvals" ADD CONSTRAINT "classroom_approvals_classroom_id_classrooms_id_fk" FOREIGN KEY ("classroom_id") REFERENCES "public"."classrooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classroom_approvals" ADD CONSTRAINT "classroom_approvals_requested_by_id_users_id_fk" FOREIGN KEY ("requested_by_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classroom_approvals" ADD CONSTRAINT "classroom_approvals_reviewer_id_users_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classroom_enrollment_policies" ADD CONSTRAINT "classroom_enrollment_policies_classroom_id_classrooms_id_fk" FOREIGN KEY ("classroom_id") REFERENCES "public"."classrooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classroom_events" ADD CONSTRAINT "classroom_events_classroom_id_classrooms_id_fk" FOREIGN KEY ("classroom_id") REFERENCES "public"."classrooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classroom_events" ADD CONSTRAINT "classroom_events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classroom_invitations" ADD CONSTRAINT "classroom_invitations_classroom_id_classrooms_id_fk" FOREIGN KEY ("classroom_id") REFERENCES "public"."classrooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classroom_invitations" ADD CONSTRAINT "classroom_invitations_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classroom_invitations" ADD CONSTRAINT "classroom_invitations_invited_by_id_users_id_fk" FOREIGN KEY ("invited_by_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classroom_schedules" ADD CONSTRAINT "classroom_schedules_classroom_id_classrooms_id_fk" FOREIGN KEY ("classroom_id") REFERENCES "public"."classrooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classroom_schedules" ADD CONSTRAINT "classroom_schedules_instructor_id_users_id_fk" FOREIGN KEY ("instructor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classroom_schedules" ADD CONSTRAINT "classroom_schedules_building_id_campus_buildings_id_fk" FOREIGN KEY ("building_id") REFERENCES "public"."campus_buildings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classroom_schedules" ADD CONSTRAINT "classroom_schedules_room_id_campus_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."campus_rooms"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classroom_waitlists" ADD CONSTRAINT "classroom_waitlists_classroom_id_classrooms_id_fk" FOREIGN KEY ("classroom_id") REFERENCES "public"."classrooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classroom_waitlists" ADD CONSTRAINT "classroom_waitlists_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_offerings" ADD CONSTRAINT "course_offerings_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_offerings" ADD CONSTRAINT "course_offerings_academic_period_id_academic_periods_id_fk" FOREIGN KEY ("academic_period_id") REFERENCES "public"."academic_periods"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_offerings" ADD CONSTRAINT "course_offerings_coordinator_id_users_id_fk" FOREIGN KEY ("coordinator_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_offerings" ADD CONSTRAINT "course_offerings_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "essay_attachments" ADD CONSTRAINT "essay_attachments_attempt_id_assessment_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."assessment_attempts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "essay_attachments" ADD CONSTRAINT "essay_attachments_attempt_question_id_attempt_questions_id_fk" FOREIGN KEY ("attempt_question_id") REFERENCES "public"."attempt_questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "essay_attachments" ADD CONSTRAINT "essay_attachments_answer_id_attempt_answers_id_fk" FOREIGN KEY ("answer_id") REFERENCES "public"."attempt_answers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "essay_attachments" ADD CONSTRAINT "essay_attachments_file_id_stored_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."stored_files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "essay_attachments" ADD CONSTRAINT "essay_attachments_uploaded_by_id_users_id_fk" FOREIGN KEY ("uploaded_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "essay_feedback" ADD CONSTRAINT "essay_feedback_essay_grade_id_essay_grades_id_fk" FOREIGN KEY ("essay_grade_id") REFERENCES "public"."essay_grades"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "essay_feedback" ADD CONSTRAINT "essay_feedback_attempt_id_assessment_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."assessment_attempts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "essay_feedback" ADD CONSTRAINT "essay_feedback_attempt_question_id_attempt_questions_id_fk" FOREIGN KEY ("attempt_question_id") REFERENCES "public"."attempt_questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "essay_feedback" ADD CONSTRAINT "essay_feedback_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "essay_grades" ADD CONSTRAINT "essay_grades_attempt_id_assessment_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."assessment_attempts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "essay_grades" ADD CONSTRAINT "essay_grades_attempt_question_id_attempt_questions_id_fk" FOREIGN KEY ("attempt_question_id") REFERENCES "public"."attempt_questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "essay_grades" ADD CONSTRAINT "essay_grades_answer_id_attempt_answers_id_fk" FOREIGN KEY ("answer_id") REFERENCES "public"."attempt_answers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "essay_grades" ADD CONSTRAINT "essay_grades_graded_by_id_users_id_fk" FOREIGN KEY ("graded_by_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_bank_tags" ADD CONSTRAINT "question_bank_tags_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_banks" ADD CONSTRAINT "question_banks_classroom_id_classrooms_id_fk" FOREIGN KEY ("classroom_id") REFERENCES "public"."classrooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_banks" ADD CONSTRAINT "question_banks_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_banks" ADD CONSTRAINT "question_banks_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_media" ADD CONSTRAINT "question_media_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_media" ADD CONSTRAINT "question_media_file_id_stored_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."stored_files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_options" ADD CONSTRAINT "question_options_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_question_bank_id_question_banks_id_fk" FOREIGN KEY ("question_bank_id") REFERENCES "public"."question_banks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_classroom_id_classrooms_id_fk" FOREIGN KEY ("classroom_id") REFERENCES "public"."classrooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_academic_calendar_period" ON "academic_calendar_events" USING btree ("academic_period_id");--> statement-breakpoint
CREATE INDEX "idx_academic_calendar_dates" ON "academic_calendar_events" USING btree ("start_date","end_date");--> statement-breakpoint
CREATE INDEX "idx_academic_calendar_category" ON "academic_calendar_events" USING btree ("category");--> statement-breakpoint
CREATE INDEX "idx_academic_periods_code" ON "academic_periods" USING btree ("code");--> statement-breakpoint
CREATE INDEX "idx_academic_periods_status" ON "academic_periods" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_academic_periods_is_default" ON "academic_periods" USING btree ("is_default");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_assessment_student_accommodation" ON "assessment_accommodations" USING btree ("assessment_id","student_id");--> statement-breakpoint
CREATE INDEX "idx_accommodations_assessment" ON "assessment_accommodations" USING btree ("assessment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_assessment_student_attempt_num" ON "assessment_attempts" USING btree ("assessment_id","student_id","attempt_number");--> statement-breakpoint
CREATE INDEX "idx_assessment_attempts_assessment" ON "assessment_attempts" USING btree ("assessment_id");--> statement-breakpoint
CREATE INDEX "idx_assessment_attempts_student" ON "assessment_attempts" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "idx_assessment_attempts_status" ON "assessment_attempts" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_assessment_events_assessment" ON "assessment_events" USING btree ("assessment_id");--> statement-breakpoint
CREATE INDEX "idx_assessment_events_attempt" ON "assessment_events" USING btree ("attempt_id");--> statement-breakpoint
CREATE INDEX "idx_assessment_pools_assessment" ON "assessment_question_pools" USING btree ("assessment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_assessment_question_item" ON "assessment_questions" USING btree ("assessment_id","question_id");--> statement-breakpoint
CREATE INDEX "idx_assessment_questions_assessment" ON "assessment_questions" USING btree ("assessment_id");--> statement-breakpoint
CREATE INDEX "idx_assessment_questions_section" ON "assessment_questions" USING btree ("section_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_assessment_student_result" ON "assessment_results" USING btree ("assessment_id","student_id");--> statement-breakpoint
CREATE INDEX "idx_assessment_results_assessment" ON "assessment_results" USING btree ("assessment_id");--> statement-breakpoint
CREATE INDEX "idx_assessment_results_student" ON "assessment_results" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "idx_assessment_rubric_criteria_rubric" ON "assessment_rubric_criteria" USING btree ("rubric_id");--> statement-breakpoint
CREATE INDEX "idx_assessment_rubrics_assessment" ON "assessment_rubrics" USING btree ("assessment_id");--> statement-breakpoint
CREATE INDEX "idx_assessment_rubrics_question" ON "assessment_rubrics" USING btree ("question_id");--> statement-breakpoint
CREATE INDEX "idx_assessment_sections_assessment" ON "assessment_sections" USING btree ("assessment_id");--> statement-breakpoint
CREATE INDEX "idx_assessments_classroom" ON "assessments" USING btree ("classroom_id");--> statement-breakpoint
CREATE INDEX "idx_assessments_topic" ON "assessments" USING btree ("topic_id");--> statement-breakpoint
CREATE INDEX "idx_assessments_mode" ON "assessments" USING btree ("assessment_mode");--> statement-breakpoint
CREATE INDEX "idx_assessments_status" ON "assessments" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_attempt_question_answer" ON "attempt_answers" USING btree ("attempt_id","attempt_question_id");--> statement-breakpoint
CREATE INDEX "idx_attempt_answers_attempt" ON "attempt_answers" USING btree ("attempt_id");--> statement-breakpoint
CREATE INDEX "idx_attempt_answers_student" ON "attempt_answers" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "idx_attempt_questions_attempt" ON "attempt_questions" USING btree ("attempt_id");--> statement-breakpoint
CREATE INDEX "idx_attempt_questions_assessment" ON "attempt_questions" USING btree ("assessment_id");--> statement-breakpoint
CREATE INDEX "idx_buildings_code" ON "campus_buildings" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_building_room" ON "campus_rooms" USING btree ("building_id","room_number");--> statement-breakpoint
CREATE INDEX "idx_rooms_building" ON "campus_rooms" USING btree ("building_id");--> statement-breakpoint
CREATE INDEX "idx_rooms_type" ON "campus_rooms" USING btree ("room_type");--> statement-breakpoint
CREATE INDEX "idx_approvals_classroom" ON "classroom_approvals" USING btree ("classroom_id");--> statement-breakpoint
CREATE INDEX "idx_enrollment_policies_classroom" ON "classroom_enrollment_policies" USING btree ("classroom_id");--> statement-breakpoint
CREATE INDEX "idx_classroom_events_classroom" ON "classroom_events" USING btree ("classroom_id");--> statement-breakpoint
CREATE INDEX "idx_invitations_classroom" ON "classroom_invitations" USING btree ("classroom_id");--> statement-breakpoint
CREATE INDEX "idx_invitations_student" ON "classroom_invitations" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "idx_schedules_classroom" ON "classroom_schedules" USING btree ("classroom_id");--> statement-breakpoint
CREATE INDEX "idx_schedules_day_time" ON "classroom_schedules" USING btree ("day_of_week","start_time","end_time");--> statement-breakpoint
CREATE INDEX "idx_schedules_instructor" ON "classroom_schedules" USING btree ("instructor_id");--> statement-breakpoint
CREATE INDEX "idx_schedules_room" ON "classroom_schedules" USING btree ("room_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_waitlist_classroom_student" ON "classroom_waitlists" USING btree ("classroom_id","student_id");--> statement-breakpoint
CREATE INDEX "idx_waitlists_classroom" ON "classroom_waitlists" USING btree ("classroom_id");--> statement-breakpoint
CREATE INDEX "idx_waitlists_student" ON "classroom_waitlists" USING btree ("student_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_course_offering_period" ON "course_offerings" USING btree ("course_id","academic_period_id");--> statement-breakpoint
CREATE INDEX "idx_course_offerings_period" ON "course_offerings" USING btree ("academic_period_id");--> statement-breakpoint
CREATE INDEX "idx_course_offerings_program" ON "course_offerings" USING btree ("study_program");--> statement-breakpoint
CREATE INDEX "idx_essay_attachments_attempt" ON "essay_attachments" USING btree ("attempt_id");--> statement-breakpoint
CREATE INDEX "idx_essay_feedback_attempt" ON "essay_feedback" USING btree ("attempt_id");--> statement-breakpoint
CREATE INDEX "idx_essay_grades_attempt" ON "essay_grades" USING btree ("attempt_id");--> statement-breakpoint
CREATE INDEX "idx_essay_grades_question" ON "essay_grades" USING btree ("attempt_question_id");--> statement-breakpoint
CREATE INDEX "idx_question_tags_question" ON "question_bank_tags" USING btree ("question_id");--> statement-breakpoint
CREATE INDEX "idx_question_tags_tag" ON "question_bank_tags" USING btree ("tag");--> statement-breakpoint
CREATE INDEX "idx_question_banks_classroom" ON "question_banks" USING btree ("classroom_id");--> statement-breakpoint
CREATE INDEX "idx_question_banks_owner" ON "question_banks" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "idx_question_banks_subject" ON "question_banks" USING btree ("subject");--> statement-breakpoint
CREATE INDEX "idx_question_media_question" ON "question_media" USING btree ("question_id");--> statement-breakpoint
CREATE INDEX "idx_question_options_question" ON "question_options" USING btree ("question_id");--> statement-breakpoint
CREATE INDEX "idx_questions_bank" ON "questions" USING btree ("question_bank_id");--> statement-breakpoint
CREATE INDEX "idx_questions_classroom" ON "questions" USING btree ("classroom_id");--> statement-breakpoint
CREATE INDEX "idx_questions_type" ON "questions" USING btree ("question_type");--> statement-breakpoint
CREATE INDEX "idx_questions_difficulty" ON "questions" USING btree ("difficulty");--> statement-breakpoint
CREATE INDEX "idx_questions_category" ON "questions" USING btree ("category");--> statement-breakpoint
ALTER TABLE "classrooms" ADD CONSTRAINT "classrooms_course_offering_id_course_offerings_id_fk" FOREIGN KEY ("course_offering_id") REFERENCES "public"."course_offerings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classrooms" ADD CONSTRAINT "classrooms_academic_period_id_academic_periods_id_fk" FOREIGN KEY ("academic_period_id") REFERENCES "public"."academic_periods"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_classroom_instructors_role" ON "classroom_instructors" USING btree ("role");--> statement-breakpoint
CREATE INDEX "idx_classrooms_offering" ON "classrooms" USING btree ("course_offering_id");--> statement-breakpoint
CREATE INDEX "idx_classrooms_period" ON "classrooms" USING btree ("academic_period_id");--> statement-breakpoint
CREATE INDEX "idx_classrooms_lifecycle" ON "classrooms" USING btree ("lifecycle_status");