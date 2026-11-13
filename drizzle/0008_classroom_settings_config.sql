-- Migration 0008: Advanced Classroom Settings Center
-- Adds privacy_config and notification_config JSONB columns to classrooms

ALTER TABLE "classrooms"
  ADD COLUMN IF NOT EXISTS "privacy_config" jsonb NOT NULL DEFAULT '{"discoverability":"ENROLLED_ONLY","enrollmentVisibility":"INSTRUCTORS_ONLY","studentRosterVisibility":"CLASSMATES","contentVisibility":"ENROLLED_ONLY","restrictJoinCode":false,"requireApprovalForWaitlist":true}'::jsonb,
  ADD COLUMN IF NOT EXISTS "notification_config" jsonb NOT NULL DEFAULT '{"onNewEnrollment":true,"onEnrollmentRequest":true,"onAssignmentSubmission":true,"onLateSubmission":true,"onMaterialCompletion":false,"onAssessmentCompletion":true,"onNewComment":true,"onNewAnnouncement":true,"inAppEnabled":true,"emailEnabled":false}'::jsonb;
