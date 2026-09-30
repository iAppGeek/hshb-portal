-- Refactor plan 10: the database functions and triggers are now TypeScript in
-- src/db (each write runs in db.transaction), so drop them. RLS stays enabled,
-- with no policies, on every table; the Data API roles lose every grant.
--
-- Apply only after the app version that no longer calls these functions is
-- deployed.

-- ─── Triggers ───────────────────────────────────────────────────────────────
-- set_updated_at → `$onUpdate` on every `updatedAt` column in schema.ts.
DROP TRIGGER "academic_years_updated_at" ON "public"."academic_years";
DROP TRIGGER "attendance_updated_at" ON "public"."attendance";
DROP TRIGGER "fee_plans_updated_at" ON "public"."fee_plans";
DROP TRIGGER "guardians_updated_at" ON "public"."guardians";
DROP TRIGGER "incidents_updated_at" ON "public"."incidents";
DROP TRIGGER "lesson_plans_updated_at" ON "public"."lesson_plans";
DROP TRIGGER "photo_consent_opt_outs_updated_at" ON "public"."photo_consent_opt_outs";
DROP TRIGGER "registration_submissions_updated_at" ON "public"."registration_submissions";
DROP TRIGGER "staff_attendance_updated_at" ON "public"."staff_attendance";
DROP TRIGGER "staff_payroll_updated_at" ON "public"."staff_payroll";
DROP TRIGGER "student_fee_accounts_updated_at" ON "public"."student_fee_accounts";
DROP TRIGGER "students_updated_at" ON "public"."students";
-- prevent_class_academic_year_change → updateClass does not accept the column.
DROP TRIGGER "classes_academic_year_immutable" ON "public"."classes";

-- rls_auto_enable → `.enableRLS()` on every table in schema.ts, enforced by
-- src/db/schema.spec.ts. Its event trigger exists only in production (it was
-- never in a migration); `ensure_rls` is the name Supabase gives it.
DROP EVENT TRIGGER IF EXISTS "ensure_rls";

-- ─── Functions ──────────────────────────────────────────────────────────────
DROP FUNCTION "public"."approve_registration"("p_submission_id" "uuid", "p_staff_id" "uuid", "p_student_code" "text", "p_class_id" "uuid", "p_existing_student_id" "uuid", "p_reuse_guardians" boolean);
DROP FUNCTION "public"."apply_photo_opt_out"("p_request_id" "uuid", "p_staff_id" "uuid", "p_student_id" "uuid");
DROP FUNCTION "public"."create_registration_submission"("p_submission" "jsonb", "p_contacts" "jsonb");
DROP FUNCTION "public"."migrate_class"("p_source_class_id" "uuid", "p_student_actions" "jsonb", "p_academic_year_id" "uuid", "p_name" "text", "p_year_group" "text", "p_room_number" "text", "p_teacher_id" "uuid");
DROP FUNCTION "public"."set_enrolments"("p_student_id" "uuid", "p_class_id" "uuid", "p_ids" "uuid"[]);
DROP FUNCTION "public"."mark_student_as_leaver"("p_student_id" "uuid", "p_reason" "text");
DROP FUNCTION "public"."save_fee_plan"("p_id" "uuid", "p_name" "text", "p_academic_year_id" "uuid", "p_full_year_amount" numeric, "p_monthly_instalment_amount" numeric, "p_termly_instalment_amount" numeric, "p_notes" "text", "p_active" boolean, "p_class_ids" "uuid"[]);
DROP FUNCTION "public"."set_current_academic_year"("p_id" "uuid");
DROP FUNCTION "public"."find_guardian_matches"("p_email" "text", "p_phone" "text", "p_last_name" "text");
DROP FUNCTION "public"."find_student_matches"("p_first_name" "text", "p_last_name" "text", "p_date_of_birth" "date");
DROP FUNCTION "public"."close_enrolments"("p_ids" "uuid"[], "p_on" "date");
DROP FUNCTION "public"."is_class_open"("p_class_id" "uuid");
DROP FUNCTION "public"."today_london"();
DROP FUNCTION "public"."set_updated_at"();
DROP FUNCTION "public"."prevent_class_academic_year_change"();
DROP FUNCTION "public"."rls_auto_enable"();

-- ─── Data API roles ─────────────────────────────────────────────────────────
-- anon and authenticated are the roles Supabase's public Data API
-- (PostgREST/GraphQL) runs as. The app connects as postgres and uses neither.
-- postgres and service_role keep their grants.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon, authenticated;
REVOKE USAGE ON SCHEMA public FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON SEQUENCES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON FUNCTIONS FROM anon, authenticated;
