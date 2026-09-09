-- ─── Initial schema (squashed baseline) ────────────────────────────────────────
--
-- This is a fresh baseline generated directly from production
-- (`supabase db dump --linked --schema public`) on 2026-09-09, replacing the
-- prior chain of incremental migration files. Prod and local dev had drifted
-- (migrations applied locally but never run on prod); rather than keep
-- growing a chain of individually-hand-maintained migrations, this dump is
-- the new source of truth, taken *after* prod was reconciled to match local.
--
-- Prod's `supabase_migrations.schema_migrations` history table still lists
-- the old (now-deleted) migration versions as applied. Before running any
-- future `supabase db push`, reconcile it with `supabase migration repair`:
--   supabase migration repair --status reverted 20260413000001 20260413000002 20260906000001 20260908000001 20260909000001
--   supabase migration repair --status applied 00000000000000
--
-- Note: prod also has an `rls_auto_enable()` event-trigger function (captured
-- below) whose owning `CREATE EVENT TRIGGER` is a database-level object not
-- captured by a schema-scoped dump — it was not defined in any prior
-- migration file either. Left as-is; investigate separately if you want it
-- tracked in migrations too.




SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE TYPE "public"."contact_role" AS ENUM (
    'primary',
    'secondary',
    'additional_1',
    'additional_2'
);


ALTER TYPE "public"."contact_role" OWNER TO "postgres";


CREATE TYPE "public"."photo_opt_out_status" AS ENUM (
    'pending',
    'actioned',
    'rejected'
);


ALTER TYPE "public"."photo_opt_out_status" OWNER TO "postgres";


CREATE TYPE "public"."submission_status" AS ENUM (
    'pending',
    'actioned',
    'rejected'
);


ALTER TYPE "public"."submission_status" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."apply_photo_opt_out"("p_request_id" "uuid", "p_staff_id" "uuid", "p_student_id" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_found UUID;
BEGIN
  PERFORM 1 FROM photo_consent_opt_outs
    WHERE id = p_request_id AND status = 'pending' FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request not found or already actioned';
  END IF;

  UPDATE students SET consent_photo_media = FALSE
    WHERE id = p_student_id
    RETURNING id INTO v_found;
  IF v_found IS NULL THEN
    RAISE EXCEPTION 'Student not found';
  END IF;

  UPDATE photo_consent_opt_outs SET
    status      = 'actioned',
    actioned_by = p_staff_id,
    actioned_at = NOW(),
    student_id  = p_student_id
  WHERE id = p_request_id;

  RETURN v_found;
END;
$$;


ALTER FUNCTION "public"."apply_photo_opt_out"("p_request_id" "uuid", "p_staff_id" "uuid", "p_student_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."approve_registration"("p_submission_id" "uuid", "p_staff_id" "uuid", "p_student_code" "text" DEFAULT NULL::"text", "p_class_id" "uuid" DEFAULT NULL::"uuid", "p_existing_student_id" "uuid" DEFAULT NULL::"uuid", "p_reuse_guardians" boolean DEFAULT true) RETURNS json
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_sub        registration_submissions%ROWTYPE;
  v_con        registration_submission_contacts%ROWTYPE;
  v_student_id UUID;
  v_gid        UUID;
  v_reused     BOOLEAN;
  v_primary UUID; v_secondary UUID; v_add1 UUID; v_add2 UUID;
  v_rel_primary TEXT; v_rel_secondary TEXT; v_rel_add1 TEXT; v_rel_add2 TEXT;
  v_old_g      guardians%ROWTYPE;
  v_old_s      students%ROWTYPE;
  v_matched_on TEXT;
  v_gchanges   JSONB;
  v_guardians  JSONB := '[]'::JSONB;
  v_schanges   JSONB := '{}'::JSONB;
BEGIN
  SELECT * INTO v_sub FROM registration_submissions
    WHERE id = p_submission_id AND status = 'pending' FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Submission not found or already actioned';
  END IF;

  -- Resolve each contact to a guardian row. De-dup (when p_reuse_guardians):
  -- case-insensitive email match, else digits-only phone + case-insensitive
  -- last name. Otherwise insert.
  FOR v_con IN
    SELECT * FROM registration_submission_contacts WHERE submission_id = p_submission_id
  LOOP
    v_gid := NULL; v_matched_on := NULL;
    IF p_reuse_guardians AND v_con.email IS NOT NULL THEN
      SELECT id INTO v_gid FROM guardians WHERE LOWER(email) = LOWER(v_con.email) LIMIT 1;
      IF v_gid IS NOT NULL THEN v_matched_on := 'email'; END IF;
    END IF;
    IF p_reuse_guardians AND v_gid IS NULL THEN
      SELECT id INTO v_gid FROM guardians
       WHERE regexp_replace(phone, '\D', '', 'g') = regexp_replace(v_con.phone, '\D', '', 'g')
         AND LOWER(last_name) = LOWER(v_con.last_name)
       LIMIT 1;
      IF v_gid IS NOT NULL THEN v_matched_on := 'phone'; END IF;
    END IF;

    v_reused := (v_gid IS NOT NULL);

    IF v_gid IS NULL THEN
      INSERT INTO guardians (first_name, last_name, phone, email,
                             address_line_1, address_line_2, city, postcode)
      VALUES (v_con.first_name, v_con.last_name, v_con.phone, v_con.email,
        CASE WHEN v_con.same_as_child_address THEN v_sub.address_line_1 ELSE v_con.address_line_1 END,
        CASE WHEN v_con.same_as_child_address THEN v_sub.address_line_2 ELSE v_con.address_line_2 END,
        CASE WHEN v_con.same_as_child_address THEN v_sub.city           ELSE v_con.city           END,
        CASE WHEN v_con.same_as_child_address THEN v_sub.postcode       ELSE v_con.postcode       END)
      RETURNING id INTO v_gid;
    END IF;

    v_gchanges := '{}'::JSONB;
    IF v_reused AND p_reuse_guardians THEN
      -- Reused guardian: the parent's latest submission is the newest statement
      -- of their contact details, so refresh phone and address.
      SELECT * INTO v_old_g FROM guardians WHERE id = v_gid FOR UPDATE;

      UPDATE guardians SET
        phone          = v_con.phone,
        email          = COALESCE(v_con.email, email),
        address_line_1 = CASE WHEN v_con.same_as_child_address THEN v_sub.address_line_1 ELSE COALESCE(v_con.address_line_1, address_line_1) END,
        address_line_2 = CASE WHEN v_con.same_as_child_address THEN v_sub.address_line_2 ELSE COALESCE(v_con.address_line_2, address_line_2) END,
        city           = CASE WHEN v_con.same_as_child_address THEN v_sub.city           ELSE COALESCE(v_con.city, city)           END,
        postcode       = CASE WHEN v_con.same_as_child_address THEN v_sub.postcode       ELSE COALESCE(v_con.postcode, postcode)   END
      WHERE id = v_gid;

      SELECT COALESCE(jsonb_object_agg(k, jsonb_build_object('old', o, 'new', n)), '{}'::JSONB)
        INTO v_gchanges
      FROM (
        SELECT t.k, t.o, t.n FROM guardians g,
          UNNEST(
            ARRAY['phone','email','address_line_1','address_line_2','city','postcode'],
            ARRAY[v_old_g.phone, v_old_g.email, v_old_g.address_line_1, v_old_g.address_line_2, v_old_g.city, v_old_g.postcode],
            ARRAY[g.phone, g.email, g.address_line_1, g.address_line_2, g.city, g.postcode]
          ) AS t(k, o, n)
        WHERE g.id = v_gid AND t.o IS DISTINCT FROM t.n
      ) AS d;
    END IF;

    v_guardians := v_guardians || jsonb_build_object(
      'contact_role', v_con.contact_role,
      'guardian_id',  v_gid,
      'reused',       v_reused,
      'matched_on',   v_matched_on,
      'changes',      v_gchanges
    );

    CASE v_con.contact_role
      WHEN 'primary'      THEN v_primary   := v_gid; v_rel_primary   := v_con.relationship;
      WHEN 'secondary'    THEN v_secondary := v_gid; v_rel_secondary := v_con.relationship;
      WHEN 'additional_1' THEN v_add1      := v_gid; v_rel_add1      := v_con.relationship;
      WHEN 'additional_2' THEN v_add2      := v_gid; v_rel_add2      := v_con.relationship;
    END CASE;
  END LOOP;

  IF v_primary IS NULL THEN
    RAISE EXCEPTION 'Submission has no primary parent/carer — cannot create a student';
  END IF;

  IF p_existing_student_id IS NULL THEN
    INSERT INTO students (
      student_code, first_name, last_name, date_of_birth,
      address_line_1, address_line_2, city, postcode, address_guardian_id,
      allergies, medical_details,
      consent_privacy_notice, consent_emergency_first_aid, consent_photo_media,
      consent_home_school, consent_comms_email_sms,
      primary_guardian_id, primary_guardian_relationship,
      secondary_guardian_id, secondary_guardian_relationship,
      additional_contact_1_id, additional_contact_1_relationship,
      additional_contact_2_id, additional_contact_2_relationship)
    VALUES (
      p_student_code, v_sub.child_first_name, v_sub.child_last_name, v_sub.date_of_birth,
      v_sub.address_line_1, v_sub.address_line_2, v_sub.city, v_sub.postcode, NULL,
      v_sub.allergies, v_sub.medical_details,
      v_sub.consent_privacy_notice, v_sub.consent_emergency_first_aid, v_sub.consent_photo_media,
      v_sub.consent_home_school, v_sub.consent_comms_email_sms,
      v_primary, v_rel_primary, v_secondary, v_rel_secondary,
      v_add1, v_rel_add1, v_add2, v_rel_add2)
    RETURNING id INTO v_student_id;
  ELSE
    -- Returning child: the submission is the source of truth for names, DOB,
    -- address, medical info, consents and contacts. Reactivate the student.
    SELECT * INTO v_old_s FROM students WHERE id = p_existing_student_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Existing student not found';
    END IF;

    UPDATE students SET
      student_code  = COALESCE(p_student_code, student_code),
      first_name    = v_sub.child_first_name,
      last_name     = v_sub.child_last_name,
      date_of_birth = v_sub.date_of_birth,
      address_line_1 = v_sub.address_line_1, address_line_2 = v_sub.address_line_2,
      city = v_sub.city, postcode = v_sub.postcode, address_guardian_id = NULL,
      allergies = v_sub.allergies, medical_details = v_sub.medical_details,
      consent_privacy_notice = v_sub.consent_privacy_notice,
      consent_emergency_first_aid = v_sub.consent_emergency_first_aid,
      consent_photo_media = v_sub.consent_photo_media,
      consent_home_school = v_sub.consent_home_school,
      consent_comms_email_sms = v_sub.consent_comms_email_sms,
      primary_guardian_id = v_primary,     primary_guardian_relationship = v_rel_primary,
      secondary_guardian_id = v_secondary, secondary_guardian_relationship = v_rel_secondary,
      additional_contact_1_id = v_add1,    additional_contact_1_relationship = v_rel_add1,
      additional_contact_2_id = v_add2,    additional_contact_2_relationship = v_rel_add2,
      active = TRUE
    WHERE id = p_existing_student_id
    RETURNING id INTO v_student_id;

    SELECT COALESCE(jsonb_object_agg(k, jsonb_build_object('old', o, 'new', n)), '{}'::JSONB)
      INTO v_schanges
    FROM (
      SELECT t.k, t.o, t.n FROM students s,
        UNNEST(
          ARRAY['first_name','last_name','date_of_birth','address_line_1','address_line_2','city','postcode',
                'allergies','medical_details','student_code',
                'primary_guardian_id','secondary_guardian_id','additional_contact_1_id','additional_contact_2_id',
                'consent_privacy_notice','consent_emergency_first_aid','consent_photo_media','consent_home_school','consent_comms_email_sms',
                'active'],
          ARRAY[v_old_s.first_name, v_old_s.last_name, v_old_s.date_of_birth::TEXT, v_old_s.address_line_1, v_old_s.address_line_2, v_old_s.city, v_old_s.postcode,
                v_old_s.allergies, v_old_s.medical_details, v_old_s.student_code,
                v_old_s.primary_guardian_id::TEXT, v_old_s.secondary_guardian_id::TEXT, v_old_s.additional_contact_1_id::TEXT, v_old_s.additional_contact_2_id::TEXT,
                v_old_s.consent_privacy_notice::TEXT, v_old_s.consent_emergency_first_aid::TEXT, v_old_s.consent_photo_media::TEXT, v_old_s.consent_home_school::TEXT, v_old_s.consent_comms_email_sms::TEXT,
                v_old_s.active::TEXT],
          ARRAY[s.first_name, s.last_name, s.date_of_birth::TEXT, s.address_line_1, s.address_line_2, s.city, s.postcode,
                s.allergies, s.medical_details, s.student_code,
                s.primary_guardian_id::TEXT, s.secondary_guardian_id::TEXT, s.additional_contact_1_id::TEXT, s.additional_contact_2_id::TEXT,
                s.consent_privacy_notice::TEXT, s.consent_emergency_first_aid::TEXT, s.consent_photo_media::TEXT, s.consent_home_school::TEXT, s.consent_comms_email_sms::TEXT,
                s.active::TEXT]
        ) AS t(k, o, n)
      WHERE s.id = v_student_id AND t.o IS DISTINCT FROM t.n
    ) AS d;
  END IF;

  IF p_class_id IS NOT NULL THEN
    INSERT INTO student_classes (student_id, class_id)
    VALUES (v_student_id, p_class_id)
    ON CONFLICT (student_id, class_id) DO NOTHING;
  END IF;

  UPDATE registration_submissions SET
    status          = 'actioned',
    actioned_by     = p_staff_id,
    actioned_at     = NOW(),
    student_id      = v_student_id,
    linked_existing = (p_existing_student_id IS NOT NULL)
  WHERE id = p_submission_id;

  RETURN json_build_object(
    'student_id',      v_student_id,
    'linked_existing', (p_existing_student_id IS NOT NULL),
    'guardians',       v_guardians,
    'student_changes', v_schanges
  );

EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'Student code "%" is already in use', p_student_code;
  WHEN check_violation THEN
    RAISE EXCEPTION 'Student address is incomplete — cannot approve';
  WHEN foreign_key_violation THEN
    RAISE EXCEPTION 'Invalid class or student reference — a record may have been deleted';
END;
$$;


ALTER FUNCTION "public"."approve_registration"("p_submission_id" "uuid", "p_staff_id" "uuid", "p_student_code" "text", "p_class_id" "uuid", "p_existing_student_id" "uuid", "p_reuse_guardians" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_registration_submission"("p_submission" "jsonb", "p_contacts" "jsonb") RETURNS "uuid"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO registration_submissions (
    child_first_name, child_last_name, date_of_birth, preferred_year_group,
    address_line_1, address_line_2, city, postcode,
    allergies, medical_details, collect_authorised, collect_password,
    consent_privacy_notice, consent_emergency_first_aid, consent_photo_media,
    consent_home_school, consent_comms_email_sms, declaration_name
  )
  SELECT
    s.child_first_name, s.child_last_name, s.date_of_birth, s.preferred_year_group,
    s.address_line_1, s.address_line_2, s.city, s.postcode,
    s.allergies, s.medical_details, s.collect_authorised, s.collect_password,
    COALESCE(s.consent_privacy_notice, FALSE), COALESCE(s.consent_emergency_first_aid, FALSE),
    COALESCE(s.consent_photo_media, FALSE), COALESCE(s.consent_home_school, FALSE),
    COALESCE(s.consent_comms_email_sms, FALSE), s.declaration_name
  FROM jsonb_populate_record(NULL::registration_submissions, p_submission) AS s
  RETURNING id INTO v_id;

  INSERT INTO registration_submission_contacts (
    submission_id, contact_role, first_name, last_name, relationship, phone, email,
    same_as_child_address, address_line_1, address_line_2, city, postcode
  )
  SELECT
    v_id, c.contact_role, c.first_name, c.last_name, c.relationship, c.phone, c.email,
    COALESCE(c.same_as_child_address, TRUE), c.address_line_1, c.address_line_2, c.city, c.postcode
  FROM jsonb_populate_recordset(NULL::registration_submission_contacts, p_contacts) AS c;

  IF NOT EXISTS (
    SELECT 1 FROM registration_submission_contacts
    WHERE submission_id = v_id AND contact_role = 'primary'
  ) THEN
    RAISE EXCEPTION 'A primary parent/carer is required';
  END IF;

  RETURN v_id;
END;
$$;


ALTER FUNCTION "public"."create_registration_submission"("p_submission" "jsonb", "p_contacts" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."find_guardian_matches"("p_email" "text", "p_phone" "text", "p_last_name" "text") RETURNS TABLE("id" "uuid", "first_name" "text", "last_name" "text", "phone" "text", "email" "text", "matched_on" "text")
    LANGUAGE "sql" STABLE
    AS $$
  SELECT g.id, g.first_name, g.last_name, g.phone, g.email, 'email'::TEXT
  FROM guardians g
  WHERE p_email IS NOT NULL AND LOWER(g.email) = LOWER(p_email)
  UNION ALL
  SELECT g.id, g.first_name, g.last_name, g.phone, g.email, 'phone'::TEXT
  FROM guardians g
  WHERE regexp_replace(g.phone, '\D', '', 'g') = regexp_replace(p_phone, '\D', '', 'g')
    AND LOWER(g.last_name) = LOWER(p_last_name)
    AND NOT (p_email IS NOT NULL AND LOWER(g.email) = LOWER(p_email))
  LIMIT 5;
$$;


ALTER FUNCTION "public"."find_guardian_matches"("p_email" "text", "p_phone" "text", "p_last_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."find_student_matches"("p_first_name" "text", "p_last_name" "text", "p_date_of_birth" "date") RETURNS TABLE("id" "uuid", "first_name" "text", "last_name" "text", "date_of_birth" "date", "student_code" "text", "active" boolean)
    LANGUAGE "sql" STABLE
    AS $$
  SELECT s.id, s.first_name, s.last_name, s.date_of_birth, s.student_code, s.active
  FROM students s
  WHERE LOWER(s.last_name) = LOWER(p_last_name)
    AND (s.date_of_birth = p_date_of_birth OR LOWER(s.first_name) = LOWER(p_first_name))
  ORDER BY s.active DESC, s.last_name, s.first_name
  LIMIT 10;
$$;


ALTER FUNCTION "public"."find_student_matches"("p_first_name" "text", "p_last_name" "text", "p_date_of_birth" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_attendance_summary"("p_date" "date") RETURNS TABLE("class_id" "uuid", "present_count" bigint, "min_created_at" timestamp with time zone, "max_updated_at" timestamp with time zone)
    LANGUAGE "sql" STABLE
    AS $$
  SELECT
    class_id,
    COUNT(*) FILTER (WHERE status IN ('present', 'late')) AS present_count,
    MIN(created_at)  AS min_created_at,
    MAX(updated_at)  AS max_updated_at
  FROM attendance
  WHERE date = p_date
  GROUP BY class_id
$$;


ALTER FUNCTION "public"."get_attendance_summary"("p_date" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."migrate_class"("p_source_class_id" "uuid", "p_name" "text", "p_year_group" "text", "p_room_number" "text", "p_academic_year" "text", "p_teacher_id" "uuid") RETURNS json
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_source RECORD;
  v_new_class_id UUID;
BEGIN
  -- Verify source class exists and is active
  SELECT id, active INTO v_source FROM classes WHERE id = p_source_class_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Source class not found';
  END IF;
  IF NOT v_source.active THEN
    RAISE EXCEPTION 'Source class is already inactive';
  END IF;

  -- Create new class
  INSERT INTO classes (name, year_group, room_number, academic_year, teacher_id, active)
  VALUES (p_name, p_year_group, p_room_number, p_academic_year, p_teacher_id, true)
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


ALTER FUNCTION "public"."migrate_class"("p_source_class_id" "uuid", "p_name" "text", "p_year_group" "text", "p_room_number" "text", "p_academic_year" "text", "p_teacher_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rls_auto_enable"() RETURNS "event_trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."rls_auto_enable"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."set_updated_at"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."attendance" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "class_id" "uuid" NOT NULL,
    "student_id" "uuid" NOT NULL,
    "date" "date" NOT NULL,
    "status" "text" NOT NULL,
    "notes" "text",
    "recorded_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "attendance_status_check" CHECK (("status" = ANY (ARRAY['present'::"text", 'absent'::"text", 'late'::"text"])))
);


ALTER TABLE "public"."attendance" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."audit_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "staff_id" "uuid",
    "action" "text" NOT NULL,
    "entity" "text" NOT NULL,
    "entity_id" "text",
    "details" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."audit_log" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."classes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "year_group" "text" NOT NULL,
    "room_number" "text",
    "teacher_id" "uuid",
    "academic_year" "text" DEFAULT '2025-26'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "active" boolean DEFAULT true NOT NULL
);


ALTER TABLE "public"."classes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."guardians" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "first_name" "text" NOT NULL,
    "last_name" "text" NOT NULL,
    "phone" "text" NOT NULL,
    "email" "text",
    "address_line_1" "text",
    "address_line_2" "text",
    "city" "text",
    "postcode" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."guardians" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."incidents" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "type" "text" NOT NULL,
    "student_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text" NOT NULL,
    "incident_date" timestamp with time zone NOT NULL,
    "created_by" "uuid" NOT NULL,
    "updated_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "parent_notified" boolean DEFAULT false NOT NULL,
    "parent_notified_at" timestamp with time zone,
    CONSTRAINT "incidents_type_check" CHECK (("type" = ANY (ARRAY['medical'::"text", 'behaviour'::"text", 'other'::"text"])))
);


ALTER TABLE "public"."incidents" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."lesson_plans" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "class_id" "uuid" NOT NULL,
    "lesson_date" "date" NOT NULL,
    "description" "text" NOT NULL,
    "created_by" "uuid" NOT NULL,
    "updated_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."lesson_plans" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."photo_consent_opt_outs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "status" "public"."photo_opt_out_status" DEFAULT 'pending'::"public"."photo_opt_out_status" NOT NULL,
    "submitted_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "child_first_name" "text" NOT NULL,
    "child_last_name" "text" NOT NULL,
    "date_of_birth" "date" NOT NULL,
    "declaration_name" "text" NOT NULL,
    "notes" "text",
    "actioned_by" "uuid",
    "actioned_at" timestamp with time zone,
    "student_id" "uuid",
    "rejected_reason" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."photo_consent_opt_outs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."push_subscriptions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "staff_id" "uuid" NOT NULL,
    "endpoint" "text" NOT NULL,
    "p256dh" "text" NOT NULL,
    "auth" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."push_subscriptions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."registration_submission_contacts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "submission_id" "uuid" NOT NULL,
    "contact_role" "public"."contact_role" NOT NULL,
    "first_name" "text" NOT NULL,
    "last_name" "text" NOT NULL,
    "relationship" "text",
    "phone" "text" NOT NULL,
    "email" "text",
    "same_as_child_address" boolean DEFAULT true NOT NULL,
    "address_line_1" "text",
    "address_line_2" "text",
    "city" "text",
    "postcode" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."registration_submission_contacts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."registration_submissions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "status" "public"."submission_status" DEFAULT 'pending'::"public"."submission_status" NOT NULL,
    "submitted_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "child_first_name" "text" NOT NULL,
    "child_last_name" "text" NOT NULL,
    "date_of_birth" "date" NOT NULL,
    "preferred_year_group" "text",
    "address_line_1" "text" NOT NULL,
    "address_line_2" "text",
    "city" "text" NOT NULL,
    "postcode" "text" NOT NULL,
    "allergies" "text",
    "medical_details" "text",
    "collect_authorised" "text",
    "collect_password" "text",
    "consent_privacy_notice" boolean DEFAULT false NOT NULL,
    "consent_emergency_first_aid" boolean DEFAULT false NOT NULL,
    "consent_photo_media" boolean DEFAULT false NOT NULL,
    "consent_home_school" boolean DEFAULT false NOT NULL,
    "consent_comms_email_sms" boolean DEFAULT false NOT NULL,
    "declaration_name" "text" NOT NULL,
    "actioned_by" "uuid",
    "actioned_at" timestamp with time zone,
    "student_id" "uuid",
    "linked_existing" boolean DEFAULT false NOT NULL,
    "rejected_reason" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."registration_submissions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."staff" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "email" "text" NOT NULL,
    "role" "text" NOT NULL,
    "contact_number" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "first_name" "text" NOT NULL,
    "last_name" "text" NOT NULL,
    "display_name" "text",
    "personal_email" "text",
    CONSTRAINT "staff_role_check" CHECK (("role" = ANY (ARRAY['teacher'::"text", 'admin'::"text", 'headteacher'::"text", 'secretary'::"text"])))
);


ALTER TABLE "public"."staff" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."staff_attendance" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "staff_id" "uuid" NOT NULL,
    "date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "signed_in_at" timestamp with time zone NOT NULL,
    "signed_out_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."staff_attendance" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."student_classes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "student_id" "uuid" NOT NULL,
    "class_id" "uuid" NOT NULL,
    "enrolled_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."student_classes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."students" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "student_code" "text",
    "first_name" "text" NOT NULL,
    "last_name" "text" NOT NULL,
    "date_of_birth" "date",
    "allergies" "text",
    "enrollment_date" "date" DEFAULT CURRENT_DATE,
    "active" boolean DEFAULT true NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "address_line_1" "text",
    "address_line_2" "text",
    "city" "text",
    "postcode" "text",
    "primary_guardian_id" "uuid" NOT NULL,
    "secondary_guardian_id" "uuid",
    "additional_contact_1_id" "uuid",
    "additional_contact_2_id" "uuid",
    "primary_guardian_relationship" "text",
    "secondary_guardian_relationship" "text",
    "additional_contact_1_relationship" "text",
    "additional_contact_2_relationship" "text",
    "medical_details" "text",
    "address_guardian_id" "uuid",
    "consent_privacy_notice" boolean DEFAULT false NOT NULL,
    "consent_emergency_first_aid" boolean DEFAULT false NOT NULL,
    "consent_photo_media" boolean DEFAULT false NOT NULL,
    "consent_home_school" boolean DEFAULT false NOT NULL,
    "consent_comms_email_sms" boolean DEFAULT false NOT NULL,
    CONSTRAINT "students_address_source_check" CHECK ((("address_guardian_id" IS NOT NULL) OR (("address_line_1" IS NOT NULL) AND ("city" IS NOT NULL) AND ("postcode" IS NOT NULL))))
);


ALTER TABLE "public"."students" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."timetable_slots" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "class_id" "uuid" NOT NULL,
    "day_of_week" "text" NOT NULL,
    "start_time" time without time zone NOT NULL,
    "end_time" time without time zone NOT NULL,
    "subject" "text",
    "room" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "timetable_slots_day_of_week_check" CHECK (("day_of_week" = ANY (ARRAY['Monday'::"text", 'Tuesday'::"text", 'Wednesday'::"text", 'Thursday'::"text", 'Friday'::"text", 'Saturday'::"text", 'Sunday'::"text"])))
);


ALTER TABLE "public"."timetable_slots" OWNER TO "postgres";


ALTER TABLE ONLY "public"."attendance"
    ADD CONSTRAINT "attendance_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."attendance"
    ADD CONSTRAINT "attendance_student_id_date_key" UNIQUE ("student_id", "date");



ALTER TABLE ONLY "public"."audit_log"
    ADD CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."classes"
    ADD CONSTRAINT "classes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."guardians"
    ADD CONSTRAINT "guardians_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."incidents"
    ADD CONSTRAINT "incidents_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."lesson_plans"
    ADD CONSTRAINT "lesson_plans_class_id_lesson_date_key" UNIQUE ("class_id", "lesson_date");



ALTER TABLE ONLY "public"."lesson_plans"
    ADD CONSTRAINT "lesson_plans_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."photo_consent_opt_outs"
    ADD CONSTRAINT "photo_consent_opt_outs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."push_subscriptions"
    ADD CONSTRAINT "push_subscriptions_endpoint_key" UNIQUE ("endpoint");



ALTER TABLE ONLY "public"."push_subscriptions"
    ADD CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."registration_submission_contacts"
    ADD CONSTRAINT "registration_submission_contacts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."registration_submission_contacts"
    ADD CONSTRAINT "registration_submission_contacts_submission_id_contact_role_key" UNIQUE ("submission_id", "contact_role");



ALTER TABLE ONLY "public"."registration_submissions"
    ADD CONSTRAINT "registration_submissions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."staff_attendance"
    ADD CONSTRAINT "staff_attendance_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."staff_attendance"
    ADD CONSTRAINT "staff_attendance_staff_id_date_key" UNIQUE ("staff_id", "date");



ALTER TABLE ONLY "public"."staff"
    ADD CONSTRAINT "staff_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."staff"
    ADD CONSTRAINT "staff_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."student_classes"
    ADD CONSTRAINT "student_classes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."student_classes"
    ADD CONSTRAINT "student_classes_student_id_class_id_key" UNIQUE ("student_id", "class_id");



ALTER TABLE ONLY "public"."students"
    ADD CONSTRAINT "students_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."students"
    ADD CONSTRAINT "students_student_code_key" UNIQUE ("student_code");



ALTER TABLE ONLY "public"."timetable_slots"
    ADD CONSTRAINT "timetable_slots_pkey" PRIMARY KEY ("id");



CREATE INDEX "attendance_class_id_date_idx" ON "public"."attendance" USING "btree" ("class_id", "date");



CREATE INDEX "attendance_student_id_idx" ON "public"."attendance" USING "btree" ("student_id");



CREATE INDEX "classes_active_idx" ON "public"."classes" USING "btree" ("active");



CREATE INDEX "classes_teacher_id_idx" ON "public"."classes" USING "btree" ("teacher_id");



CREATE INDEX "guardians_last_name_idx" ON "public"."guardians" USING "btree" ("last_name");



CREATE INDEX "idx_audit_log_created_at" ON "public"."audit_log" USING "btree" ("created_at");



CREATE INDEX "idx_audit_log_entity" ON "public"."audit_log" USING "btree" ("entity");



CREATE INDEX "idx_audit_log_staff_id" ON "public"."audit_log" USING "btree" ("staff_id");



CREATE INDEX "idx_incidents_incident_date" ON "public"."incidents" USING "btree" ("incident_date" DESC);



CREATE INDEX "idx_incidents_student_id" ON "public"."incidents" USING "btree" ("student_id");



CREATE INDEX "idx_incidents_type" ON "public"."incidents" USING "btree" ("type");



CREATE INDEX "lesson_plans_class_id_idx" ON "public"."lesson_plans" USING "btree" ("class_id");



CREATE INDEX "lesson_plans_lesson_date_idx" ON "public"."lesson_plans" USING "btree" ("lesson_date" DESC);



CREATE INDEX "photo_consent_opt_outs_status_idx" ON "public"."photo_consent_opt_outs" USING "btree" ("status");



CREATE INDEX "photo_consent_opt_outs_submitted_at_idx" ON "public"."photo_consent_opt_outs" USING "btree" ("submitted_at" DESC);



CREATE INDEX "push_subscriptions_staff_id_idx" ON "public"."push_subscriptions" USING "btree" ("staff_id");



CREATE INDEX "registration_submission_contacts_submission_id_idx" ON "public"."registration_submission_contacts" USING "btree" ("submission_id");



CREATE INDEX "registration_submissions_status_idx" ON "public"."registration_submissions" USING "btree" ("status");



CREATE INDEX "registration_submissions_student_id_idx" ON "public"."registration_submissions" USING "btree" ("student_id");



CREATE INDEX "registration_submissions_submitted_at_idx" ON "public"."registration_submissions" USING "btree" ("submitted_at" DESC);



CREATE INDEX "staff_attendance_date_idx" ON "public"."staff_attendance" USING "btree" ("date");



CREATE INDEX "staff_attendance_staff_id_idx" ON "public"."staff_attendance" USING "btree" ("staff_id");



CREATE INDEX "student_classes_class_id_idx" ON "public"."student_classes" USING "btree" ("class_id");



CREATE INDEX "student_classes_student_id_idx" ON "public"."student_classes" USING "btree" ("student_id");



CREATE INDEX "students_active_idx" ON "public"."students" USING "btree" ("active");



CREATE INDEX "students_primary_guardian_id_idx" ON "public"."students" USING "btree" ("primary_guardian_id");



CREATE INDEX "students_secondary_guardian_id_idx" ON "public"."students" USING "btree" ("secondary_guardian_id");



CREATE INDEX "students_student_code_idx" ON "public"."students" USING "btree" ("student_code");



CREATE INDEX "timetable_slots_class_id_idx" ON "public"."timetable_slots" USING "btree" ("class_id");



CREATE INDEX "timetable_slots_day_of_week_idx" ON "public"."timetable_slots" USING "btree" ("day_of_week");



CREATE OR REPLACE TRIGGER "attendance_updated_at" BEFORE UPDATE ON "public"."attendance" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "guardians_updated_at" BEFORE UPDATE ON "public"."guardians" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "incidents_updated_at" BEFORE UPDATE ON "public"."incidents" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "lesson_plans_updated_at" BEFORE UPDATE ON "public"."lesson_plans" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "photo_consent_opt_outs_updated_at" BEFORE UPDATE ON "public"."photo_consent_opt_outs" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "registration_submissions_updated_at" BEFORE UPDATE ON "public"."registration_submissions" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "staff_attendance_updated_at" BEFORE UPDATE ON "public"."staff_attendance" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "students_updated_at" BEFORE UPDATE ON "public"."students" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



ALTER TABLE ONLY "public"."attendance"
    ADD CONSTRAINT "attendance_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."attendance"
    ADD CONSTRAINT "attendance_recorded_by_fkey" FOREIGN KEY ("recorded_by") REFERENCES "public"."staff"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."attendance"
    ADD CONSTRAINT "attendance_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."audit_log"
    ADD CONSTRAINT "audit_log_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."classes"
    ADD CONSTRAINT "classes_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "public"."staff"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."incidents"
    ADD CONSTRAINT "incidents_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."staff"("id");



ALTER TABLE ONLY "public"."incidents"
    ADD CONSTRAINT "incidents_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."incidents"
    ADD CONSTRAINT "incidents_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "public"."staff"("id");



ALTER TABLE ONLY "public"."lesson_plans"
    ADD CONSTRAINT "lesson_plans_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."lesson_plans"
    ADD CONSTRAINT "lesson_plans_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."staff"("id");



ALTER TABLE ONLY "public"."lesson_plans"
    ADD CONSTRAINT "lesson_plans_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "public"."staff"("id");



ALTER TABLE ONLY "public"."photo_consent_opt_outs"
    ADD CONSTRAINT "photo_consent_opt_outs_actioned_by_fkey" FOREIGN KEY ("actioned_by") REFERENCES "public"."staff"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."photo_consent_opt_outs"
    ADD CONSTRAINT "photo_consent_opt_outs_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."push_subscriptions"
    ADD CONSTRAINT "push_subscriptions_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."registration_submission_contacts"
    ADD CONSTRAINT "registration_submission_contacts_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "public"."registration_submissions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."registration_submissions"
    ADD CONSTRAINT "registration_submissions_actioned_by_fkey" FOREIGN KEY ("actioned_by") REFERENCES "public"."staff"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."registration_submissions"
    ADD CONSTRAINT "registration_submissions_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."staff_attendance"
    ADD CONSTRAINT "staff_attendance_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."student_classes"
    ADD CONSTRAINT "student_classes_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."student_classes"
    ADD CONSTRAINT "student_classes_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."students"
    ADD CONSTRAINT "students_additional_contact_1_id_fkey" FOREIGN KEY ("additional_contact_1_id") REFERENCES "public"."guardians"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."students"
    ADD CONSTRAINT "students_additional_contact_2_id_fkey" FOREIGN KEY ("additional_contact_2_id") REFERENCES "public"."guardians"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."students"
    ADD CONSTRAINT "students_address_guardian_id_fkey" FOREIGN KEY ("address_guardian_id") REFERENCES "public"."guardians"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."students"
    ADD CONSTRAINT "students_primary_guardian_id_fkey" FOREIGN KEY ("primary_guardian_id") REFERENCES "public"."guardians"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."students"
    ADD CONSTRAINT "students_secondary_guardian_id_fkey" FOREIGN KEY ("secondary_guardian_id") REFERENCES "public"."guardians"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."timetable_slots"
    ADD CONSTRAINT "timetable_slots_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE CASCADE;



ALTER TABLE "public"."attendance" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."audit_log" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."classes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."guardians" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."incidents" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."lesson_plans" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."photo_consent_opt_outs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."push_subscriptions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."registration_submission_contacts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."registration_submissions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."staff" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."staff_attendance" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."student_classes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."students" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."timetable_slots" ENABLE ROW LEVEL SECURITY;


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON FUNCTION "public"."apply_photo_opt_out"("p_request_id" "uuid", "p_staff_id" "uuid", "p_student_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."apply_photo_opt_out"("p_request_id" "uuid", "p_staff_id" "uuid", "p_student_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."apply_photo_opt_out"("p_request_id" "uuid", "p_staff_id" "uuid", "p_student_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."approve_registration"("p_submission_id" "uuid", "p_staff_id" "uuid", "p_student_code" "text", "p_class_id" "uuid", "p_existing_student_id" "uuid", "p_reuse_guardians" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."approve_registration"("p_submission_id" "uuid", "p_staff_id" "uuid", "p_student_code" "text", "p_class_id" "uuid", "p_existing_student_id" "uuid", "p_reuse_guardians" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."approve_registration"("p_submission_id" "uuid", "p_staff_id" "uuid", "p_student_code" "text", "p_class_id" "uuid", "p_existing_student_id" "uuid", "p_reuse_guardians" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."create_registration_submission"("p_submission" "jsonb", "p_contacts" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."create_registration_submission"("p_submission" "jsonb", "p_contacts" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_registration_submission"("p_submission" "jsonb", "p_contacts" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."find_guardian_matches"("p_email" "text", "p_phone" "text", "p_last_name" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."find_guardian_matches"("p_email" "text", "p_phone" "text", "p_last_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."find_guardian_matches"("p_email" "text", "p_phone" "text", "p_last_name" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."find_student_matches"("p_first_name" "text", "p_last_name" "text", "p_date_of_birth" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."find_student_matches"("p_first_name" "text", "p_last_name" "text", "p_date_of_birth" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."find_student_matches"("p_first_name" "text", "p_last_name" "text", "p_date_of_birth" "date") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_attendance_summary"("p_date" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."get_attendance_summary"("p_date" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_attendance_summary"("p_date" "date") TO "service_role";



GRANT ALL ON FUNCTION "public"."migrate_class"("p_source_class_id" "uuid", "p_name" "text", "p_year_group" "text", "p_room_number" "text", "p_academic_year" "text", "p_teacher_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."migrate_class"("p_source_class_id" "uuid", "p_name" "text", "p_year_group" "text", "p_room_number" "text", "p_academic_year" "text", "p_teacher_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."migrate_class"("p_source_class_id" "uuid", "p_name" "text", "p_year_group" "text", "p_room_number" "text", "p_academic_year" "text", "p_teacher_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "anon";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "service_role";



GRANT ALL ON TABLE "public"."attendance" TO "anon";
GRANT ALL ON TABLE "public"."attendance" TO "authenticated";
GRANT ALL ON TABLE "public"."attendance" TO "service_role";



GRANT ALL ON TABLE "public"."audit_log" TO "anon";
GRANT ALL ON TABLE "public"."audit_log" TO "authenticated";
GRANT ALL ON TABLE "public"."audit_log" TO "service_role";



GRANT ALL ON TABLE "public"."classes" TO "anon";
GRANT ALL ON TABLE "public"."classes" TO "authenticated";
GRANT ALL ON TABLE "public"."classes" TO "service_role";



GRANT ALL ON TABLE "public"."guardians" TO "anon";
GRANT ALL ON TABLE "public"."guardians" TO "authenticated";
GRANT ALL ON TABLE "public"."guardians" TO "service_role";



GRANT ALL ON TABLE "public"."incidents" TO "anon";
GRANT ALL ON TABLE "public"."incidents" TO "authenticated";
GRANT ALL ON TABLE "public"."incidents" TO "service_role";



GRANT ALL ON TABLE "public"."lesson_plans" TO "anon";
GRANT ALL ON TABLE "public"."lesson_plans" TO "authenticated";
GRANT ALL ON TABLE "public"."lesson_plans" TO "service_role";



GRANT ALL ON TABLE "public"."photo_consent_opt_outs" TO "anon";
GRANT ALL ON TABLE "public"."photo_consent_opt_outs" TO "authenticated";
GRANT ALL ON TABLE "public"."photo_consent_opt_outs" TO "service_role";



GRANT ALL ON TABLE "public"."push_subscriptions" TO "anon";
GRANT ALL ON TABLE "public"."push_subscriptions" TO "authenticated";
GRANT ALL ON TABLE "public"."push_subscriptions" TO "service_role";



GRANT ALL ON TABLE "public"."registration_submission_contacts" TO "anon";
GRANT ALL ON TABLE "public"."registration_submission_contacts" TO "authenticated";
GRANT ALL ON TABLE "public"."registration_submission_contacts" TO "service_role";



GRANT ALL ON TABLE "public"."registration_submissions" TO "anon";
GRANT ALL ON TABLE "public"."registration_submissions" TO "authenticated";
GRANT ALL ON TABLE "public"."registration_submissions" TO "service_role";



GRANT ALL ON TABLE "public"."staff" TO "anon";
GRANT ALL ON TABLE "public"."staff" TO "authenticated";
GRANT ALL ON TABLE "public"."staff" TO "service_role";



GRANT ALL ON TABLE "public"."staff_attendance" TO "anon";
GRANT ALL ON TABLE "public"."staff_attendance" TO "authenticated";
GRANT ALL ON TABLE "public"."staff_attendance" TO "service_role";



GRANT ALL ON TABLE "public"."student_classes" TO "anon";
GRANT ALL ON TABLE "public"."student_classes" TO "authenticated";
GRANT ALL ON TABLE "public"."student_classes" TO "service_role";



GRANT ALL ON TABLE "public"."students" TO "anon";
GRANT ALL ON TABLE "public"."students" TO "authenticated";
GRANT ALL ON TABLE "public"."students" TO "service_role";



GRANT ALL ON TABLE "public"."timetable_slots" TO "anon";
GRANT ALL ON TABLE "public"."timetable_slots" TO "authenticated";
GRANT ALL ON TABLE "public"."timetable_slots" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";

-- pg_dump sets search_path to '' above for restore safety; reset it so later
-- statements in this session (e.g. supabase db reset's seed.sql, which uses
-- unqualified table names) resolve against public again.
RESET search_path;







