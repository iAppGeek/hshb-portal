ALTER TABLE "registration_submissions" RENAME COLUMN "consent_privacy_notice" TO "privacy_notice_read";--> statement-breakpoint
ALTER TABLE "registration_submissions" RENAME COLUMN "consent_emergency_first_aid" TO "first_aid_consent";--> statement-breakpoint
ALTER TABLE "registration_submissions" RENAME COLUMN "consent_photo_media" TO "photo_video_consent";--> statement-breakpoint
ALTER TABLE "registration_submissions" RENAME COLUMN "consent_home_school" TO "home_school_agreement";--> statement-breakpoint
ALTER TABLE "registration_submissions" RENAME COLUMN "consent_comms_email_sms" TO "email_sms_contact_ack";--> statement-breakpoint
ALTER TABLE "students" RENAME COLUMN "consent_privacy_notice" TO "privacy_notice_read";--> statement-breakpoint
ALTER TABLE "students" RENAME COLUMN "consent_emergency_first_aid" TO "first_aid_consent";--> statement-breakpoint
ALTER TABLE "students" RENAME COLUMN "consent_photo_media" TO "photo_video_consent";--> statement-breakpoint
ALTER TABLE "students" RENAME COLUMN "consent_home_school" TO "home_school_agreement";--> statement-breakpoint
ALTER TABLE "students" RENAME COLUMN "consent_comms_email_sms" TO "email_sms_contact_ack";--> statement-breakpoint
ALTER TABLE "registration_submissions" ADD COLUMN "sen_details" text;--> statement-breakpoint
ALTER TABLE "registration_submissions" ADD COLUMN "may_leave_unaccompanied" boolean;--> statement-breakpoint
ALTER TABLE "registration_submissions" ADD COLUMN "consents_recorded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "registration_submissions" ADD COLUMN "privacy_notice_version" text;--> statement-breakpoint
ALTER TABLE "students" ADD COLUMN "sen_details" text;--> statement-breakpoint
ALTER TABLE "students" ADD COLUMN "may_leave_unaccompanied" boolean;--> statement-breakpoint
ALTER TABLE "students" ADD COLUMN "consents_recorded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "students" ADD COLUMN "privacy_notice_version" text;--> statement-breakpoint
ALTER TABLE "students" ADD COLUMN "photo_video_consent_withdrawn_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "students" ADD COLUMN "photo_video_consent_withdrawn_by" uuid;--> statement-breakpoint
ALTER TABLE "students" ADD CONSTRAINT "students_photo_video_consent_withdrawn_by_fkey" FOREIGN KEY ("photo_video_consent_withdrawn_by") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;