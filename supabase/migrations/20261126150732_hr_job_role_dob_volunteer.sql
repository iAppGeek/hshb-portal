ALTER TABLE "staff_payroll" DROP CONSTRAINT "staff_payroll_dbs_level_check";--> statement-breakpoint
ALTER TABLE "staff_payroll" DROP CONSTRAINT "staff_payroll_payment_funding_check";--> statement-breakpoint
ALTER TABLE "staff_payroll" ADD COLUMN "job_role" text DEFAULT 'admin_assistant' NOT NULL;--> statement-breakpoint
ALTER TABLE "staff_payroll" ADD COLUMN "date_of_birth" date;--> statement-breakpoint
ALTER TABLE "staff_payroll" ADD COLUMN "dbs_update_service_number" text;--> statement-breakpoint
ALTER TABLE "staff_payroll" ADD CONSTRAINT "staff_payroll_job_role_check" CHECK ("staff_payroll"."job_role" = ANY (ARRAY['teacher'::text, 'classroom_assistant'::text, 'admin'::text, 'admin_assistant'::text, 'committee'::text]));--> statement-breakpoint
ALTER TABLE "staff_payroll" ADD CONSTRAINT "staff_payroll_dbs_level_check" CHECK (("staff_payroll"."dbs_level" IS NULL) OR ("staff_payroll"."dbs_level" = ANY (ARRAY['enhanced'::text, 'basic'::text])));--> statement-breakpoint
ALTER TABLE "staff_payroll" ADD CONSTRAINT "staff_payroll_payment_funding_check" CHECK ("staff_payroll"."payment_funding" = ANY (ARRAY['kea'::text, 'school'::text, 'volunteer'::text]));