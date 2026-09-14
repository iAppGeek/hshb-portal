-- Academic years become a first-class table; classes, fee plans, student fee
-- accounts and student payments reference it by id instead of a free-text
-- year string. See plans/academic-years.md for the decisions behind this.

CREATE EXTENSION IF NOT EXISTS "btree_gist";

-- ─── Academic years ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "public"."academic_years" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "code" "text" NOT NULL,
    "start_date" "date" NOT NULL,
    "end_date" "date" NOT NULL,
    "is_current" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "academic_years_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "academic_years_code_key" UNIQUE ("code"),
    CONSTRAINT "academic_years_code_check" CHECK (("code" ~ '^\d{4}-\d{2}$'::"text")),
    CONSTRAINT "academic_years_end_date_check" CHECK (("end_date" > "start_date")),
    -- Inclusive ranges; no two years may cover the same date.
    CONSTRAINT "academic_years_no_overlap" EXCLUDE USING "gist" ("daterange"("start_date", "end_date", '[]'::"text") WITH &&)
);

ALTER TABLE "public"."academic_years" OWNER TO "postgres";
ALTER TABLE "public"."academic_years" ENABLE ROW LEVEL SECURITY;
-- At most one row may have is_current = true.
CREATE UNIQUE INDEX "academic_years_one_current" ON "public"."academic_years" USING "btree" ("is_current") WHERE "is_current";
CREATE OR REPLACE TRIGGER "academic_years_updated_at" BEFORE UPDATE ON "public"."academic_years" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();

-- ─── Backfill: one academic_years row per distinct year on record ──────────
DO $$
DECLARE
  v_code text;
  v_start_year int;
BEGIN
  FOR v_code IN
    SELECT DISTINCT "replace"("academic_year", '/', '-') FROM "public"."classes"
    UNION
    SELECT DISTINCT "replace"("academic_year", '/', '-') FROM "public"."fee_plans"
    UNION
    SELECT '2025-26'
    UNION
    SELECT '2026-27'
  LOOP
    v_start_year := substring(v_code from 1 for 4)::int;
    INSERT INTO "public"."academic_years" ("code", "start_date", "end_date")
    VALUES (v_code, "make_date"(v_start_year, 9, 1), "make_date"(v_start_year + 1, 8, 31))
    ON CONFLICT ("code") DO NOTHING;
  END LOOP;
END $$;

-- Mark the year containing today (Europe/London) as current; fall back to
-- the latest year if none contains today.
UPDATE "public"."academic_years"
SET "is_current" = true
WHERE "id" = (
  SELECT "id" FROM "public"."academic_years"
  WHERE "daterange"("start_date", "end_date", '[]'::"text") @> (("now"() AT TIME ZONE 'Europe/London')::date)
  ORDER BY "start_date" DESC
  LIMIT 1
);

UPDATE "public"."academic_years"
SET "is_current" = true
WHERE "id" = (SELECT "id" FROM "public"."academic_years" ORDER BY "start_date" DESC LIMIT 1)
  AND NOT EXISTS (SELECT 1 FROM "public"."academic_years" WHERE "is_current");

-- ─── Classes ─────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_dupes text;
BEGIN
  SELECT "string_agg"("format"('%s (%s) x%s', "name", "academic_year", "cnt"), '; ')
  INTO v_dupes
  FROM (
    SELECT "replace"("academic_year", '/', '-') AS "academic_year", "name", COUNT(*) AS "cnt"
    FROM "public"."classes"
    GROUP BY "replace"("academic_year", '/', '-'), "name"
    HAVING COUNT(*) > 1
  ) "d";

  IF v_dupes IS NOT NULL THEN
    RAISE EXCEPTION 'Duplicate class names within an academic year, resolve before migrating: %', v_dupes;
  END IF;
END $$;

ALTER TABLE "public"."classes" ADD COLUMN "academic_year_id" "uuid";

UPDATE "public"."classes" "c"
SET "academic_year_id" = "ay"."id"
FROM "public"."academic_years" "ay"
WHERE "ay"."code" = "replace"("c"."academic_year", '/', '-');

ALTER TABLE "public"."classes" ALTER COLUMN "academic_year_id" SET NOT NULL;
ALTER TABLE "public"."classes" ADD CONSTRAINT "classes_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "public"."academic_years"("id") ON DELETE RESTRICT;
ALTER TABLE "public"."classes" ADD CONSTRAINT "classes_name_academic_year_id_key" UNIQUE ("name", "academic_year_id");
CREATE INDEX "classes_academic_year_id_idx" ON "public"."classes" USING "btree" ("academic_year_id");
ALTER TABLE "public"."classes" DROP COLUMN "academic_year";

-- ─── Fee plans ───────────────────────────────────────────────────────────────
ALTER TABLE "public"."fee_plans" ADD COLUMN "academic_year_id" "uuid";

UPDATE "public"."fee_plans" "fp"
SET "academic_year_id" = "ay"."id"
FROM "public"."academic_years" "ay"
WHERE "ay"."code" = "replace"("fp"."academic_year", '/', '-');

ALTER TABLE "public"."fee_plans" ALTER COLUMN "academic_year_id" SET NOT NULL;
ALTER TABLE "public"."fee_plans" ADD CONSTRAINT "fee_plans_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "public"."academic_years"("id") ON DELETE RESTRICT;
ALTER TABLE "public"."fee_plans" DROP CONSTRAINT "fee_plans_name_academic_year_key";
ALTER TABLE "public"."fee_plans" ADD CONSTRAINT "fee_plans_name_academic_year_id_key" UNIQUE ("name", "academic_year_id");
DROP INDEX IF EXISTS "public"."fee_plans_academic_year_idx";
CREATE INDEX "fee_plans_academic_year_id_idx" ON "public"."fee_plans" USING "btree" ("academic_year_id");
ALTER TABLE "public"."fee_plans" DROP COLUMN "academic_year";

-- ─── Student payments ────────────────────────────────────────────────────────
-- Attribute each existing payment to the year its date falls in; anything
-- outside every known range (shouldn't happen after the backfill above)
-- falls back to the current year.
ALTER TABLE "public"."student_payments" ADD COLUMN "academic_year_id" "uuid";

UPDATE "public"."student_payments" "sp"
SET "academic_year_id" = "ay"."id"
FROM "public"."academic_years" "ay"
WHERE "daterange"("ay"."start_date", "ay"."end_date", '[]'::"text") @> "sp"."payment_date";

UPDATE "public"."student_payments"
SET "academic_year_id" = (SELECT "id" FROM "public"."academic_years" WHERE "is_current")
WHERE "academic_year_id" IS NULL;

ALTER TABLE "public"."student_payments" ALTER COLUMN "academic_year_id" SET NOT NULL;
ALTER TABLE "public"."student_payments" ADD CONSTRAINT "student_payments_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "public"."academic_years"("id") ON DELETE RESTRICT;
CREATE INDEX "student_payments_academic_year_id_idx" ON "public"."student_payments" USING "btree" ("academic_year_id");

-- ─── Student fee accounts ────────────────────────────────────────────────────
ALTER TABLE "public"."student_fee_accounts" ADD COLUMN "academic_year_id" "uuid";
ALTER TABLE "public"."student_fee_accounts" ADD COLUMN "settled" boolean DEFAULT false NOT NULL;
ALTER TABLE "public"."student_fee_accounts" ADD COLUMN "settled_note" "text";

UPDATE "public"."student_fee_accounts" "sfa"
SET "academic_year_id" = "fp"."academic_year_id"
FROM "public"."fee_plans" "fp"
WHERE "sfa"."fee_plan_override_id" = "fp"."id";

UPDATE "public"."student_fee_accounts"
SET "academic_year_id" = (SELECT "id" FROM "public"."academic_years" WHERE "is_current")
WHERE "academic_year_id" IS NULL;

ALTER TABLE "public"."student_fee_accounts" ALTER COLUMN "academic_year_id" SET NOT NULL;

-- Belt and braces: an override must belong to the account's own year. By
-- construction above it always does, but this guards against that ever
-- silently going wrong on this or a future backfill.
DO $$
DECLARE
  v_bad text;
BEGIN
  SELECT "string_agg"("sfa"."id"::text, ', ')
  INTO v_bad
  FROM "public"."student_fee_accounts" "sfa"
  JOIN "public"."fee_plans" "fp" ON "fp"."id" = "sfa"."fee_plan_override_id"
  WHERE "fp"."academic_year_id" != "sfa"."academic_year_id";

  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'Fee accounts with an override plan in a different year than the account: %', v_bad;
  END IF;
END $$;

ALTER TABLE "public"."student_fee_accounts" DROP CONSTRAINT "student_fee_accounts_student_id_key";
ALTER TABLE "public"."student_fee_accounts" ADD CONSTRAINT "student_fee_accounts_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "public"."academic_years"("id") ON DELETE RESTRICT;
ALTER TABLE "public"."student_fee_accounts" ADD CONSTRAINT "student_fee_accounts_student_id_academic_year_id_key" UNIQUE ("student_id", "academic_year_id");
CREATE INDEX "student_fee_accounts_academic_year_id_idx" ON "public"."student_fee_accounts" USING "btree" ("academic_year_id");

-- ─── Grants ───────────────────────────────────────────────────────────────────
GRANT ALL ON TABLE "public"."academic_years" TO "service_role";

-- ─── Functions ───────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS "public"."migrate_class"("p_source_class_id" "uuid", "p_name" "text", "p_year_group" "text", "p_room_number" "text", "p_academic_year" "text", "p_teacher_id" "uuid");
DROP FUNCTION IF EXISTS "public"."save_fee_plan"("p_id" "uuid", "p_name" "text", "p_academic_year" "text", "p_full_year_amount" numeric, "p_monthly_instalment_amount" numeric, "p_termly_instalment_amount" numeric, "p_notes" "text", "p_active" boolean, "p_class_ids" "uuid"[]);

CREATE OR REPLACE FUNCTION "public"."migrate_class"("p_source_class_id" "uuid", "p_name" "text", "p_year_group" "text", "p_room_number" "text", "p_academic_year_id" "uuid", "p_teacher_id" "uuid") RETURNS "json"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_source RECORD;
  v_target_start_date date;
  v_new_class_id UUID;
BEGIN
  -- Verify source class exists and is active
  SELECT c.id, c.active, ay.start_date INTO v_source
  FROM classes c
  JOIN academic_years ay ON ay.id = c.academic_year_id
  WHERE c.id = p_source_class_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Source class not found';
  END IF;
  IF NOT v_source.active THEN
    RAISE EXCEPTION 'Source class is already inactive';
  END IF;

  SELECT start_date INTO v_target_start_date FROM academic_years WHERE id = p_academic_year_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target academic year not found';
  END IF;
  IF v_target_start_date <= v_source.start_date THEN
    RAISE EXCEPTION 'Target academic year must be after the source class''s academic year';
  END IF;

  -- Create new class
  INSERT INTO classes (name, year_group, room_number, academic_year_id, teacher_id, active)
  VALUES (p_name, p_year_group, p_room_number, p_academic_year_id, p_teacher_id, true)
  RETURNING id INTO v_new_class_id;

  -- Enroll all students from source class into new class
  INSERT INTO student_classes (student_id, class_id)
  SELECT student_id, v_new_class_id
  FROM student_classes
  WHERE class_id = p_source_class_id;

  -- Deactivate source class
  UPDATE classes SET active = false WHERE id = p_source_class_id;

  RETURN json_build_object('new_class_id', v_new_class_id);

EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'Class name "%" already exists for this academic year', p_name;
  WHEN foreign_key_violation THEN
    RAISE EXCEPTION 'Invalid teacher or student reference — a record may have been deleted';
  WHEN check_violation THEN
    RAISE EXCEPTION 'Invalid data for class creation — check required fields';
END;
$$;

ALTER FUNCTION "public"."migrate_class"("p_source_class_id" "uuid", "p_name" "text", "p_year_group" "text", "p_room_number" "text", "p_academic_year_id" "uuid", "p_teacher_id" "uuid") OWNER TO "postgres";
REVOKE ALL ON FUNCTION "public"."migrate_class"("p_source_class_id" "uuid", "p_name" "text", "p_year_group" "text", "p_room_number" "text", "p_academic_year_id" "uuid", "p_teacher_id" "uuid") FROM PUBLIC, "anon", "authenticated";
GRANT ALL ON FUNCTION "public"."migrate_class"("p_source_class_id" "uuid", "p_name" "text", "p_year_group" "text", "p_room_number" "text", "p_academic_year_id" "uuid", "p_teacher_id" "uuid") TO "service_role";

CREATE OR REPLACE FUNCTION "public"."save_fee_plan"("p_id" "uuid", "p_name" "text", "p_academic_year_id" "uuid", "p_full_year_amount" numeric, "p_monthly_instalment_amount" numeric, "p_termly_instalment_amount" numeric, "p_notes" "text", "p_active" boolean, "p_class_ids" "uuid"[]) RETURNS "uuid"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_id UUID;
  v_wrong_year_count int;
BEGIN
  IF p_id IS NULL THEN
    INSERT INTO fee_plans (name, academic_year_id, full_year_amount, monthly_instalment_amount, termly_instalment_amount, notes, active)
    VALUES (p_name, p_academic_year_id, p_full_year_amount, p_monthly_instalment_amount, p_termly_instalment_amount, p_notes, p_active)
    RETURNING id INTO v_id;
  ELSE
    UPDATE fee_plans
    SET name = p_name,
        academic_year_id = p_academic_year_id,
        full_year_amount = p_full_year_amount,
        monthly_instalment_amount = p_monthly_instalment_amount,
        termly_instalment_amount = p_termly_instalment_amount,
        notes = p_notes,
        active = p_active
    WHERE id = p_id
    RETURNING id INTO v_id;
    IF v_id IS NULL THEN
      RAISE EXCEPTION 'Fee plan not found.';
    END IF;
    DELETE FROM fee_plan_classes WHERE fee_plan_id = v_id;
  END IF;

  SELECT COUNT(*) INTO v_wrong_year_count
  FROM classes
  WHERE id = ANY(COALESCE(p_class_ids, ARRAY[]::uuid[]))
    AND academic_year_id != p_academic_year_id;

  IF v_wrong_year_count > 0 THEN
    RAISE EXCEPTION 'One or more selected classes do not belong to this fee plan''s academic year.';
  END IF;

  INSERT INTO fee_plan_classes (fee_plan_id, class_id)
  SELECT v_id, class_id FROM unnest(COALESCE(p_class_ids, ARRAY[]::uuid[])) AS class_id;

  RETURN v_id;

EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'A fee plan with this name already exists for this academic year, or a selected class is already on another plan.';
  WHEN foreign_key_violation THEN
    RAISE EXCEPTION 'One of the selected classes no longer exists.';
END;
$$;

ALTER FUNCTION "public"."save_fee_plan"("p_id" "uuid", "p_name" "text", "p_academic_year_id" "uuid", "p_full_year_amount" numeric, "p_monthly_instalment_amount" numeric, "p_termly_instalment_amount" numeric, "p_notes" "text", "p_active" boolean, "p_class_ids" "uuid"[]) OWNER TO "postgres";
REVOKE ALL ON FUNCTION "public"."save_fee_plan"("p_id" "uuid", "p_name" "text", "p_academic_year_id" "uuid", "p_full_year_amount" numeric, "p_monthly_instalment_amount" numeric, "p_termly_instalment_amount" numeric, "p_notes" "text", "p_active" boolean, "p_class_ids" "uuid"[]) FROM PUBLIC, "anon", "authenticated";
GRANT ALL ON FUNCTION "public"."save_fee_plan"("p_id" "uuid", "p_name" "text", "p_academic_year_id" "uuid", "p_full_year_amount" numeric, "p_monthly_instalment_amount" numeric, "p_termly_instalment_amount" numeric, "p_notes" "text", "p_active" boolean, "p_class_ids" "uuid"[]) TO "service_role";

-- Flips is_current atomically: the partial unique index only ever sees the
-- post-statement state, so it never sees two rows with is_current = true.
CREATE OR REPLACE FUNCTION "public"."set_current_academic_year"("p_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM academic_years WHERE id = p_id) THEN
    RAISE EXCEPTION 'Academic year not found';
  END IF;

  UPDATE academic_years SET is_current = (id = p_id);
END;
$$;

ALTER FUNCTION "public"."set_current_academic_year"("p_id" "uuid") OWNER TO "postgres";
REVOKE ALL ON FUNCTION "public"."set_current_academic_year"("p_id" "uuid") FROM PUBLIC, "anon", "authenticated";
GRANT ALL ON FUNCTION "public"."set_current_academic_year"("p_id" "uuid") TO "service_role";
