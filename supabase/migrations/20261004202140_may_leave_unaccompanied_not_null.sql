ALTER TABLE "students" DROP CONSTRAINT "students_may_leave_unaccompanied_changed_by_fkey";
--> statement-breakpoint
-- Not asked or not answered counts as not given.
UPDATE "registration_submissions" SET "may_leave_unaccompanied" = false WHERE "may_leave_unaccompanied" IS NULL;--> statement-breakpoint
UPDATE "students" SET "may_leave_unaccompanied" = false WHERE "may_leave_unaccompanied" IS NULL;--> statement-breakpoint
ALTER TABLE "registration_submissions" ALTER COLUMN "may_leave_unaccompanied" SET DEFAULT false;--> statement-breakpoint
ALTER TABLE "registration_submissions" ALTER COLUMN "may_leave_unaccompanied" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "students" ALTER COLUMN "may_leave_unaccompanied" SET DEFAULT false;--> statement-breakpoint
ALTER TABLE "students" ALTER COLUMN "may_leave_unaccompanied" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "students" DROP COLUMN "may_leave_unaccompanied_changed_at";--> statement-breakpoint
ALTER TABLE "students" DROP COLUMN "may_leave_unaccompanied_changed_by";