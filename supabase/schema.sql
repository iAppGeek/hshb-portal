-- Generated from supabase/migrations with `supabase db dump --local --schema public`. Do not edit by hand; regenerate after each migration.




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

  IF p_class_id IS NOT NULL AND NOT "public"."is_class_open"(p_class_id) THEN
    RAISE EXCEPTION 'Students can only be enrolled in active classes of the current year.';
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
      INSERT INTO guardians (first_name, last_name, phone, email, occupation,
                             address_line_1, address_line_2, city, postcode)
      VALUES (v_con.first_name, v_con.last_name, v_con.phone, v_con.email, v_con.occupation,
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
        occupation     = COALESCE(v_con.occupation, occupation),
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
            ARRAY['phone','email','occupation','address_line_1','address_line_2','city','postcode'],
            ARRAY[v_old_g.phone, v_old_g.email, v_old_g.occupation, v_old_g.address_line_1, v_old_g.address_line_2, v_old_g.city, v_old_g.postcode],
            ARRAY[g.phone, g.email, g.occupation, g.address_line_1, g.address_line_2, g.city, g.postcode]
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
      student_code, first_name, last_name, date_of_birth, english_school_name,
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
      v_sub.english_school_name,
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
      english_school_name = v_sub.english_school_name,
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
      active = TRUE,
      leaving_reason = NULL
    WHERE id = p_existing_student_id
    RETURNING id INTO v_student_id;

    SELECT COALESCE(jsonb_object_agg(k, jsonb_build_object('old', o, 'new', n)), '{}'::JSONB)
      INTO v_schanges
    FROM (
      SELECT t.k, t.o, t.n FROM students s,
        UNNEST(
          ARRAY['first_name','last_name','date_of_birth','english_school_name','address_line_1','address_line_2','city','postcode',
                'allergies','medical_details','student_code',
                'primary_guardian_id','secondary_guardian_id','additional_contact_1_id','additional_contact_2_id',
                'consent_privacy_notice','consent_emergency_first_aid','consent_photo_media','consent_home_school','consent_comms_email_sms',
                'active'],
          ARRAY[v_old_s.first_name, v_old_s.last_name, v_old_s.date_of_birth::TEXT, v_old_s.english_school_name, v_old_s.address_line_1, v_old_s.address_line_2, v_old_s.city, v_old_s.postcode,
                v_old_s.allergies, v_old_s.medical_details, v_old_s.student_code,
                v_old_s.primary_guardian_id::TEXT, v_old_s.secondary_guardian_id::TEXT, v_old_s.additional_contact_1_id::TEXT, v_old_s.additional_contact_2_id::TEXT,
                v_old_s.consent_privacy_notice::TEXT, v_old_s.consent_emergency_first_aid::TEXT, v_old_s.consent_photo_media::TEXT, v_old_s.consent_home_school::TEXT, v_old_s.consent_comms_email_sms::TEXT,
                v_old_s.active::TEXT],
          ARRAY[s.first_name, s.last_name, s.date_of_birth::TEXT, s.english_school_name, s.address_line_1, s.address_line_2, s.city, s.postcode,
                s.allergies, s.medical_details, s.student_code,
                s.primary_guardian_id::TEXT, s.secondary_guardian_id::TEXT, s.additional_contact_1_id::TEXT, s.additional_contact_2_id::TEXT,
                s.consent_privacy_notice::TEXT, s.consent_emergency_first_aid::TEXT, s.consent_photo_media::TEXT, s.consent_home_school::TEXT, s.consent_comms_email_sms::TEXT,
                s.active::TEXT]
        ) AS t(k, o, n)
      WHERE s.id = v_student_id AND t.o IS DISTINCT FROM t.n
    ) AS d;
  END IF;

  IF p_class_id IS NOT NULL THEN
    INSERT INTO student_classes (student_id, class_id, start_date)
    VALUES (v_student_id, p_class_id, "public"."today_london"())
    ON CONFLICT (student_id, class_id) WHERE end_date IS NULL DO NOTHING;
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


CREATE OR REPLACE FUNCTION "public"."close_enrolments"("p_ids" "uuid"[], "p_on" "date") RETURNS "void"
    LANGUAGE "sql"
    AS $$
  UPDATE "public"."student_classes" SET "end_date" = GREATEST("start_date", "p_on")
  WHERE "id" = ANY("p_ids") AND "end_date" IS NULL
$$;


ALTER FUNCTION "public"."close_enrolments"("p_ids" "uuid"[], "p_on" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_registration_submission"("p_submission" "jsonb", "p_contacts" "jsonb") RETURNS "uuid"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO registration_submissions (
    child_first_name, child_last_name, date_of_birth, preferred_year_group,
    english_school_name,
    address_line_1, address_line_2, city, postcode,
    allergies, medical_details, collect_authorised, collect_password,
    consent_privacy_notice, consent_emergency_first_aid, consent_photo_media,
    consent_home_school, consent_comms_email_sms, declaration_name
  )
  SELECT
    s.child_first_name, s.child_last_name, s.date_of_birth, s.preferred_year_group,
    s.english_school_name,
    s.address_line_1, s.address_line_2, s.city, s.postcode,
    s.allergies, s.medical_details, s.collect_authorised, s.collect_password,
    COALESCE(s.consent_privacy_notice, FALSE), COALESCE(s.consent_emergency_first_aid, FALSE),
    COALESCE(s.consent_photo_media, FALSE), COALESCE(s.consent_home_school, FALSE),
    COALESCE(s.consent_comms_email_sms, FALSE), s.declaration_name
  FROM jsonb_populate_record(NULL::registration_submissions, p_submission) AS s
  RETURNING id INTO v_id;

  INSERT INTO registration_submission_contacts (
    submission_id, contact_role, first_name, last_name, relationship, phone, email,
    occupation, same_as_child_address, address_line_1, address_line_2, city, postcode
  )
  SELECT
    v_id, c.contact_role, c.first_name, c.last_name, c.relationship, c.phone, c.email,
    c.occupation, COALESCE(c.same_as_child_address, TRUE), c.address_line_1, c.address_line_2, c.city, c.postcode
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


CREATE OR REPLACE FUNCTION "public"."find_guardian_matches"("p_email" "text", "p_phone" "text", "p_last_name" "text") RETURNS TABLE("id" "uuid", "first_name" "text", "last_name" "text", "phone" "text", "email" "text", "occupation" "text", "address_line_1" "text", "address_line_2" "text", "city" "text", "postcode" "text", "matched_on" "text")
    LANGUAGE "sql" STABLE
    AS $$
  SELECT g.id, g.first_name, g.last_name, g.phone, g.email, g.occupation,
         g.address_line_1, g.address_line_2, g.city, g.postcode, 'email'::TEXT
  FROM guardians g
  WHERE p_email IS NOT NULL AND LOWER(g.email) = LOWER(p_email)
  UNION ALL
  SELECT g.id, g.first_name, g.last_name, g.phone, g.email, g.occupation,
         g.address_line_1, g.address_line_2, g.city, g.postcode, 'phone'::TEXT
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


CREATE OR REPLACE FUNCTION "public"."is_class_open"("p_class_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE
    AS $$
  SELECT COALESCE((
    SELECT "c"."active" AND "ay"."is_current"
    FROM "public"."classes" "c" JOIN "public"."academic_years" "ay" ON "ay"."id" = "c"."academic_year_id"
    WHERE "c"."id" = "p_class_id"
  ), false)
$$;


ALTER FUNCTION "public"."is_class_open"("p_class_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mark_student_as_leaver"("p_student_id" "uuid", "p_reason" "text") RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_active boolean;
BEGIN
  SELECT active INTO v_active FROM students WHERE id = p_student_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Student not found';
  END IF;
  IF NOT v_active THEN
    RAISE EXCEPTION 'This student has already left.';
  END IF;
  IF p_reason IS NULL OR p_reason NOT IN ('left', 'graduated', 'transferred') THEN
    RAISE EXCEPTION 'Choose a leaving reason.';
  END IF;

  PERFORM "public"."close_enrolments"(
    ARRAY(SELECT id FROM student_classes WHERE student_id = p_student_id AND end_date IS NULL),
    "public"."today_london"()
  );

  UPDATE students SET active = false, leaving_reason = p_reason WHERE id = p_student_id;
END;
$$;


ALTER FUNCTION "public"."mark_student_as_leaver"("p_student_id" "uuid", "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."migrate_class"("p_source_class_id" "uuid", "p_student_actions" "jsonb", "p_academic_year_id" "uuid" DEFAULT NULL::"uuid", "p_name" "text" DEFAULT NULL::"text", "p_year_group" "text" DEFAULT NULL::"text", "p_room_number" "text" DEFAULT NULL::"text", "p_teacher_id" "uuid" DEFAULT NULL::"uuid") RETURNS json
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_source RECORD;
  v_new_class_id uuid;
  v_create boolean := p_name IS NOT NULL;
  v_target_start date;
  v_expected_ids uuid[];
  v_actual_ids uuid[];
  v_key text;
  v_action text;
  v_student_id uuid;
  v_moved int := 0;
  v_unassigned int := 0;
  v_leavers int := 0;
BEGIN
  SELECT c.id, c.active, ay.start_date, ay.end_date INTO v_source
  FROM classes c
  JOIN academic_years ay ON ay.id = c.academic_year_id
  WHERE c.id = p_source_class_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Source class not found';
  END IF;
  IF NOT v_source.active THEN
    RAISE EXCEPTION 'Source class is already inactive';
  END IF;

  IF v_create AND (p_academic_year_id IS NULL OR p_year_group IS NULL OR p_teacher_id IS NULL) THEN
    RAISE EXCEPTION 'Fill in the new class details';
  END IF;

  IF NOT v_create AND EXISTS (
    SELECT 1 FROM jsonb_each_text(p_student_actions) WHERE value = 'move'
  ) THEN
    RAISE EXCEPTION 'Students can only move when a new class is created';
  END IF;

  -- Only active students need an action. A leaver still on the class (e.g.
  -- after a manual fix) has no choice to make; their row closes with the rest.
  SELECT ARRAY(
    SELECT sc.student_id FROM student_classes sc
    JOIN students s ON s.id = sc.student_id
    WHERE sc.class_id = p_source_class_id AND sc.end_date IS NULL AND s.active
  ) INTO v_expected_ids;
  SELECT ARRAY(SELECT (key)::uuid FROM jsonb_each_text(p_student_actions)) INTO v_actual_ids;

  IF NOT (
    SELECT COALESCE(array_agg(x ORDER BY x), '{}') FROM unnest(v_expected_ids) x
  ) = (
    SELECT COALESCE(array_agg(x ORDER BY x), '{}') FROM unnest(v_actual_ids) x
  ) THEN
    RAISE EXCEPTION 'The class changed since the form was loaded. Reload and try again.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_each_text(p_student_actions)
    WHERE value NOT IN ('move', 'none', 'left', 'graduated', 'transferred')
  ) THEN
    RAISE EXCEPTION 'Invalid action for a student';
  END IF;

  IF v_create THEN
    SELECT start_date INTO v_target_start FROM academic_years WHERE id = p_academic_year_id;
    IF v_target_start <= v_source.start_date THEN
      RAISE EXCEPTION 'Target academic year must be after the source class''s academic year';
    END IF;
    IF v_target_start < (SELECT start_date FROM academic_years WHERE is_current) THEN
      RAISE EXCEPTION 'Students can''t be moved into a past academic year';
    END IF;

    INSERT INTO classes (name, year_group, room_number, academic_year_id, teacher_id, active)
    VALUES (p_name, p_year_group, p_room_number, p_academic_year_id, p_teacher_id, true)
    RETURNING id INTO v_new_class_id;
  END IF;

  -- Migration is a year-boundary change, so its dates come from the academic
  -- years, not the day it runs: stays in the source class end with its year
  -- and moved students start with the target year.
  PERFORM "public"."close_enrolments"(
    ARRAY(SELECT id FROM student_classes WHERE class_id = p_source_class_id AND end_date IS NULL),
    v_source.end_date + 1
  );

  FOR v_key, v_action IN SELECT key, value FROM jsonb_each_text(p_student_actions)
  LOOP
    v_student_id := v_key::uuid;
    IF v_action = 'move' THEN
      INSERT INTO student_classes (student_id, class_id, start_date)
      VALUES (v_student_id, v_new_class_id, v_target_start);
      v_moved := v_moved + 1;
    ELSIF v_action = 'none' THEN
      v_unassigned := v_unassigned + 1;
    ELSE
      PERFORM "public"."mark_student_as_leaver"(v_student_id, v_action);
      v_leavers := v_leavers + 1;
    END IF;
  END LOOP;

  UPDATE classes SET active = false WHERE id = p_source_class_id;

  RETURN json_build_object(
    'new_class_id', v_new_class_id,
    'moved', v_moved,
    'unassigned', v_unassigned,
    'leavers', v_leavers
  );

EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'Class name "%" already exists for this academic year', p_name;
  WHEN foreign_key_violation THEN
    RAISE EXCEPTION 'Invalid teacher or student reference — a record may have been deleted';
  WHEN check_violation THEN
    RAISE EXCEPTION 'Invalid data for class creation — check required fields';
END;
$$;


ALTER FUNCTION "public"."migrate_class"("p_source_class_id" "uuid", "p_student_actions" "jsonb", "p_academic_year_id" "uuid", "p_name" "text", "p_year_group" "text", "p_room_number" "text", "p_teacher_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."prevent_class_academic_year_change"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF NEW.academic_year_id IS DISTINCT FROM OLD.academic_year_id THEN
    RAISE EXCEPTION 'A class''s academic year cannot be changed';
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."prevent_class_academic_year_change"() OWNER TO "postgres";


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


CREATE OR REPLACE FUNCTION "public"."set_enrolments"("p_student_id" "uuid", "p_class_id" "uuid", "p_ids" "uuid"[]) RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_ids uuid[] := COALESCE(p_ids, '{}');
BEGIN
  IF (p_student_id IS NULL) = (p_class_id IS NULL) THEN
    RAISE EXCEPTION 'Provide either a student or a class';
  END IF;

  IF p_class_id IS NOT NULL THEN
    -- Class mode: v_ids are student ids.
    IF NOT "public"."is_class_open"(p_class_id) THEN
      RAISE EXCEPTION 'Only active classes in the current academic year can be changed.';
    END IF;

    -- A leaver already on the class keeps their row; a leaver can't be added.
    IF EXISTS (
      SELECT 1 FROM unnest(v_ids) s
      JOIN students st ON st.id = s
      WHERE NOT st.active AND NOT EXISTS (
        SELECT 1 FROM student_classes WHERE student_id = s AND class_id = p_class_id AND end_date IS NULL
      )
    ) THEN
      RAISE EXCEPTION 'Leavers can''t be enrolled in classes.';
    END IF;

    PERFORM "public"."close_enrolments"(
      ARRAY(
        SELECT id FROM student_classes
        WHERE class_id = p_class_id AND end_date IS NULL AND student_id <> ALL(v_ids)
      ),
      "public"."today_london"()
    );

    INSERT INTO student_classes (student_id, class_id, start_date)
    SELECT s, p_class_id, "public"."today_london"()
    FROM unnest(v_ids) s
    WHERE NOT EXISTS (
      SELECT 1 FROM student_classes WHERE student_id = s AND class_id = p_class_id AND end_date IS NULL
    );
  ELSE
    -- Student mode: v_ids are class ids. Scope = the student's open rows in
    -- open classes.
    IF NOT (SELECT active FROM students WHERE id = p_student_id) THEN
      RAISE EXCEPTION 'Leavers can''t be enrolled in classes.';
    END IF;

    IF EXISTS (SELECT 1 FROM unnest(v_ids) c WHERE NOT "public"."is_class_open"(c)) THEN
      RAISE EXCEPTION 'Students can only be enrolled in active classes of the current year.';
    END IF;

    PERFORM "public"."close_enrolments"(
      ARRAY(
        SELECT id FROM student_classes
        WHERE student_id = p_student_id AND end_date IS NULL
          AND "public"."is_class_open"(class_id)
          AND class_id <> ALL(v_ids)
      ),
      "public"."today_london"()
    );

    INSERT INTO student_classes (student_id, class_id, start_date)
    SELECT p_student_id, c, "public"."today_london"()
    FROM unnest(v_ids) c
    WHERE NOT EXISTS (
      SELECT 1 FROM student_classes WHERE student_id = p_student_id AND class_id = c AND end_date IS NULL
    );
  END IF;
END;
$$;


ALTER FUNCTION "public"."set_enrolments"("p_student_id" "uuid", "p_class_id" "uuid", "p_ids" "uuid"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."today_london"() RETURNS "date"
    LANGUAGE "sql" STABLE
    AS $$ SELECT ("now"() AT TIME ZONE 'Europe/London')::"date" $$;


ALTER FUNCTION "public"."today_london"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."academic_years" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "code" "text" NOT NULL,
    "start_date" "date" NOT NULL,
    "end_date" "date" NOT NULL,
    "is_current" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "academic_years_code_check" CHECK (("code" ~ '^\d{4}-\d{2}$'::"text")),
    CONSTRAINT "academic_years_end_date_check" CHECK (("end_date" > "start_date"))
);


ALTER TABLE "public"."academic_years" OWNER TO "postgres";


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
    "created_at" timestamp with time zone DEFAULT "now"(),
    "active" boolean DEFAULT true NOT NULL,
    "academic_year_id" "uuid" NOT NULL
);


ALTER TABLE "public"."classes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."fee_plan_classes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "fee_plan_id" "uuid" NOT NULL,
    "class_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."fee_plan_classes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."fee_plans" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "full_year_amount" numeric(10,2) NOT NULL,
    "monthly_instalment_amount" numeric(10,2) NOT NULL,
    "termly_instalment_amount" numeric(10,2) NOT NULL,
    "notes" "text",
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "academic_year_id" "uuid" NOT NULL,
    CONSTRAINT "fee_plans_full_year_amount_check" CHECK (("full_year_amount" >= (0)::numeric)),
    CONSTRAINT "fee_plans_monthly_instalment_amount_check" CHECK (("monthly_instalment_amount" >= (0)::numeric)),
    CONSTRAINT "fee_plans_termly_instalment_amount_check" CHECK (("termly_instalment_amount" >= (0)::numeric))
);


ALTER TABLE "public"."fee_plans" OWNER TO "postgres";


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
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "occupation" "text"
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
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "occupation" "text"
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
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "english_school_name" "text"
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
    "title" "text" DEFAULT 'Ms'::"text" NOT NULL,
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


CREATE TABLE IF NOT EXISTS "public"."staff_payroll" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "staff_id" "uuid" NOT NULL,
    "payment_funding" "text" NOT NULL,
    "bank_account_name" "text",
    "bank_sort_code" "text",
    "bank_account_number" "text",
    "payroll_ref" "text",
    "id_verified" boolean DEFAULT false NOT NULL,
    "id_verified_at" "date",
    "id_type" "text",
    "id_verified_by" "uuid",
    "right_to_work_checked" boolean DEFAULT false NOT NULL,
    "right_to_work_checked_at" "date",
    "dbs_verified" boolean DEFAULT false NOT NULL,
    "dbs_level" "text",
    "dbs_barred_list_checked" boolean DEFAULT false NOT NULL,
    "dbs_update_service" boolean DEFAULT false NOT NULL,
    "dbs_reference" "text",
    "dbs_issue_date" "date",
    "dbs_verified_at" "date",
    "dbs_renewal_due" "date",
    "dbs_verified_by" "uuid",
    "first_aid_certified" boolean DEFAULT false NOT NULL,
    "first_aid_issue_date" "date",
    "first_aid_verified_at" "date",
    "first_aid_expiry_date" "date",
    "first_aid_reference" "text",
    "fire_warden_certified" boolean DEFAULT false NOT NULL,
    "fire_warden_issue_date" "date",
    "fire_warden_verified_at" "date",
    "fire_warden_expiry_date" "date",
    "fire_warden_reference" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "staff_payroll_bank_account_number_check" CHECK ((("bank_account_number" IS NULL) OR ("bank_account_number" ~ '^[0-9]{8}$'::"text"))),
    CONSTRAINT "staff_payroll_bank_sort_code_check" CHECK ((("bank_sort_code" IS NULL) OR ("bank_sort_code" ~ '^[0-9]{6}$'::"text"))),
    CONSTRAINT "staff_payroll_dbs_level_check" CHECK ((("dbs_level" IS NULL) OR ("dbs_level" = ANY (ARRAY['enhanced'::"text", 'standard'::"text", 'basic'::"text"])))),
    CONSTRAINT "staff_payroll_dbs_verified_details_check" CHECK (((NOT "dbs_verified") OR (("dbs_reference" IS NOT NULL) AND ("dbs_issue_date" IS NOT NULL) AND ("dbs_verified_at" IS NOT NULL) AND ("dbs_level" IS NOT NULL)))),
    CONSTRAINT "staff_payroll_fire_warden_details_check" CHECK (((NOT "fire_warden_certified") OR (("fire_warden_reference" IS NOT NULL) AND ("fire_warden_issue_date" IS NOT NULL) AND ("fire_warden_verified_at" IS NOT NULL)))),
    CONSTRAINT "staff_payroll_first_aid_details_check" CHECK (((NOT "first_aid_certified") OR (("first_aid_reference" IS NOT NULL) AND ("first_aid_issue_date" IS NOT NULL) AND ("first_aid_verified_at" IS NOT NULL)))),
    CONSTRAINT "staff_payroll_id_type_check" CHECK ((("id_type" IS NULL) OR ("id_type" = ANY (ARRAY['passport'::"text", 'driving_licence'::"text", 'brp'::"text", 'birth_certificate'::"text", 'other'::"text"])))),
    CONSTRAINT "staff_payroll_id_verified_details_check" CHECK (((NOT "id_verified") OR (("id_verified_at" IS NOT NULL) AND ("id_type" IS NOT NULL)))),
    CONSTRAINT "staff_payroll_payment_funding_check" CHECK (("payment_funding" = ANY (ARRAY['kea'::"text", 'school'::"text"])))
);


ALTER TABLE "public"."staff_payroll" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."student_classes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "student_id" "uuid" NOT NULL,
    "class_id" "uuid" NOT NULL,
    "enrolled_at" timestamp with time zone DEFAULT "now"(),
    "start_date" "date" DEFAULT "public"."today_london"() NOT NULL,
    "end_date" "date",
    CONSTRAINT "student_classes_dates_check" CHECK ((("end_date" IS NULL) OR ("end_date" >= "start_date")))
);


ALTER TABLE "public"."student_classes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."student_fee_accounts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "student_id" "uuid" NOT NULL,
    "payment_plan" "text",
    "payment_plan_notes" "text",
    "fee_plan_override_id" "uuid",
    "custom_total_amount" numeric(10,2),
    "custom_up_to_date" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "academic_year_id" "uuid" NOT NULL,
    "settled" boolean DEFAULT false NOT NULL,
    "settled_note" "text",
    CONSTRAINT "student_fee_accounts_custom_total_amount_check" CHECK ((("custom_total_amount" IS NULL) OR ("custom_total_amount" >= (0)::numeric))),
    CONSTRAINT "student_fee_accounts_payment_plan_check" CHECK ((("payment_plan" IS NULL) OR ("payment_plan" = ANY (ARRAY['monthly'::"text", 'termly'::"text", 'yearly'::"text", 'custom'::"text"]))))
);


ALTER TABLE "public"."student_fee_accounts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."student_payments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "student_id" "uuid" NOT NULL,
    "amount" numeric(10,2) NOT NULL,
    "payment_date" "date" NOT NULL,
    "reference" "text" NOT NULL,
    "method" "text" NOT NULL,
    "notes" "text",
    "recorded_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "academic_year_id" "uuid" NOT NULL,
    CONSTRAINT "student_payments_amount_check" CHECK (("amount" > (0)::numeric)),
    CONSTRAINT "student_payments_method_check" CHECK (("method" = ANY (ARRAY['bank_transfer'::"text", 'cash'::"text", 'card'::"text", 'other'::"text"])))
);


ALTER TABLE "public"."student_payments" OWNER TO "postgres";


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
    "english_school_name" "text",
    "leaving_reason" "text",
    CONSTRAINT "students_address_source_check" CHECK ((("address_guardian_id" IS NOT NULL) OR (("address_line_1" IS NOT NULL) AND ("city" IS NOT NULL) AND ("postcode" IS NOT NULL)))),
    CONSTRAINT "students_leaving_reason_check" CHECK (("leaving_reason" = ANY (ARRAY['left'::"text", 'graduated'::"text", 'transferred'::"text"])))
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


ALTER TABLE ONLY "public"."academic_years"
    ADD CONSTRAINT "academic_years_code_key" UNIQUE ("code");



ALTER TABLE ONLY "public"."academic_years"
    ADD CONSTRAINT "academic_years_no_overlap" EXCLUDE USING "gist" ("daterange"("start_date", "end_date", '[]'::"text") WITH &&);



ALTER TABLE ONLY "public"."academic_years"
    ADD CONSTRAINT "academic_years_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."attendance"
    ADD CONSTRAINT "attendance_class_student_date_key" UNIQUE ("class_id", "student_id", "date");



ALTER TABLE ONLY "public"."attendance"
    ADD CONSTRAINT "attendance_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."audit_log"
    ADD CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."classes"
    ADD CONSTRAINT "classes_name_academic_year_id_key" UNIQUE ("name", "academic_year_id");



ALTER TABLE ONLY "public"."classes"
    ADD CONSTRAINT "classes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."fee_plan_classes"
    ADD CONSTRAINT "fee_plan_classes_class_id_key" UNIQUE ("class_id");



ALTER TABLE ONLY "public"."fee_plan_classes"
    ADD CONSTRAINT "fee_plan_classes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."fee_plans"
    ADD CONSTRAINT "fee_plans_name_academic_year_id_key" UNIQUE ("name", "academic_year_id");



ALTER TABLE ONLY "public"."fee_plans"
    ADD CONSTRAINT "fee_plans_pkey" PRIMARY KEY ("id");



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



ALTER TABLE ONLY "public"."staff_payroll"
    ADD CONSTRAINT "staff_payroll_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."staff_payroll"
    ADD CONSTRAINT "staff_payroll_staff_id_key" UNIQUE ("staff_id");



ALTER TABLE ONLY "public"."staff"
    ADD CONSTRAINT "staff_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."student_classes"
    ADD CONSTRAINT "student_classes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."student_fee_accounts"
    ADD CONSTRAINT "student_fee_accounts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."student_fee_accounts"
    ADD CONSTRAINT "student_fee_accounts_student_id_academic_year_id_key" UNIQUE ("student_id", "academic_year_id");



ALTER TABLE ONLY "public"."student_payments"
    ADD CONSTRAINT "student_payments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."students"
    ADD CONSTRAINT "students_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."students"
    ADD CONSTRAINT "students_student_code_key" UNIQUE ("student_code");



ALTER TABLE ONLY "public"."timetable_slots"
    ADD CONSTRAINT "timetable_slots_pkey" PRIMARY KEY ("id");



CREATE UNIQUE INDEX "academic_years_one_current" ON "public"."academic_years" USING "btree" ("is_current") WHERE "is_current";



CREATE INDEX "attendance_class_id_date_idx" ON "public"."attendance" USING "btree" ("class_id", "date");



CREATE INDEX "attendance_student_id_idx" ON "public"."attendance" USING "btree" ("student_id");



CREATE INDEX "classes_academic_year_id_idx" ON "public"."classes" USING "btree" ("academic_year_id");



CREATE INDEX "classes_active_idx" ON "public"."classes" USING "btree" ("active");



CREATE INDEX "classes_teacher_id_idx" ON "public"."classes" USING "btree" ("teacher_id");



CREATE INDEX "fee_plan_classes_fee_plan_id_idx" ON "public"."fee_plan_classes" USING "btree" ("fee_plan_id");



CREATE INDEX "fee_plans_academic_year_id_idx" ON "public"."fee_plans" USING "btree" ("academic_year_id");



CREATE INDEX "guardians_email_lower_idx" ON "public"."guardians" USING "btree" ("lower"("email"));



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



CREATE INDEX "staff_payroll_staff_id_idx" ON "public"."staff_payroll" USING "btree" ("staff_id");



CREATE INDEX "student_classes_class_dates" ON "public"."student_classes" USING "btree" ("class_id", "start_date", "end_date");



CREATE INDEX "student_classes_class_id_idx" ON "public"."student_classes" USING "btree" ("class_id");



CREATE UNIQUE INDEX "student_classes_one_open" ON "public"."student_classes" USING "btree" ("student_id", "class_id") WHERE ("end_date" IS NULL);



CREATE INDEX "student_classes_student_id_idx" ON "public"."student_classes" USING "btree" ("student_id");



CREATE INDEX "student_fee_accounts_academic_year_id_idx" ON "public"."student_fee_accounts" USING "btree" ("academic_year_id");



CREATE INDEX "student_payments_academic_year_id_idx" ON "public"."student_payments" USING "btree" ("academic_year_id");



CREATE INDEX "student_payments_payment_date_idx" ON "public"."student_payments" USING "btree" ("payment_date" DESC);



CREATE INDEX "student_payments_student_id_idx" ON "public"."student_payments" USING "btree" ("student_id");



CREATE INDEX "students_active_idx" ON "public"."students" USING "btree" ("active");



CREATE INDEX "students_additional_contact_1_id_idx" ON "public"."students" USING "btree" ("additional_contact_1_id");



CREATE INDEX "students_additional_contact_2_id_idx" ON "public"."students" USING "btree" ("additional_contact_2_id");



CREATE INDEX "students_primary_guardian_id_idx" ON "public"."students" USING "btree" ("primary_guardian_id");



CREATE INDEX "students_secondary_guardian_id_idx" ON "public"."students" USING "btree" ("secondary_guardian_id");



CREATE INDEX "students_student_code_idx" ON "public"."students" USING "btree" ("student_code");



CREATE INDEX "timetable_slots_class_id_idx" ON "public"."timetable_slots" USING "btree" ("class_id");



CREATE INDEX "timetable_slots_day_of_week_idx" ON "public"."timetable_slots" USING "btree" ("day_of_week");



CREATE OR REPLACE TRIGGER "academic_years_updated_at" BEFORE UPDATE ON "public"."academic_years" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "attendance_updated_at" BEFORE UPDATE ON "public"."attendance" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "classes_academic_year_immutable" BEFORE UPDATE OF "academic_year_id" ON "public"."classes" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_class_academic_year_change"();



CREATE OR REPLACE TRIGGER "fee_plans_updated_at" BEFORE UPDATE ON "public"."fee_plans" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "guardians_updated_at" BEFORE UPDATE ON "public"."guardians" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "incidents_updated_at" BEFORE UPDATE ON "public"."incidents" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "lesson_plans_updated_at" BEFORE UPDATE ON "public"."lesson_plans" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "photo_consent_opt_outs_updated_at" BEFORE UPDATE ON "public"."photo_consent_opt_outs" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "registration_submissions_updated_at" BEFORE UPDATE ON "public"."registration_submissions" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "staff_attendance_updated_at" BEFORE UPDATE ON "public"."staff_attendance" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "staff_payroll_updated_at" BEFORE UPDATE ON "public"."staff_payroll" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "student_fee_accounts_updated_at" BEFORE UPDATE ON "public"."student_fee_accounts" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



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
    ADD CONSTRAINT "classes_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "public"."academic_years"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."classes"
    ADD CONSTRAINT "classes_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "public"."staff"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."fee_plan_classes"
    ADD CONSTRAINT "fee_plan_classes_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."fee_plan_classes"
    ADD CONSTRAINT "fee_plan_classes_fee_plan_id_fkey" FOREIGN KEY ("fee_plan_id") REFERENCES "public"."fee_plans"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."fee_plans"
    ADD CONSTRAINT "fee_plans_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "public"."academic_years"("id") ON DELETE RESTRICT;



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



ALTER TABLE ONLY "public"."staff_payroll"
    ADD CONSTRAINT "staff_payroll_dbs_verified_by_fkey" FOREIGN KEY ("dbs_verified_by") REFERENCES "public"."staff"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."staff_payroll"
    ADD CONSTRAINT "staff_payroll_id_verified_by_fkey" FOREIGN KEY ("id_verified_by") REFERENCES "public"."staff"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."staff_payroll"
    ADD CONSTRAINT "staff_payroll_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."student_classes"
    ADD CONSTRAINT "student_classes_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."student_classes"
    ADD CONSTRAINT "student_classes_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."student_fee_accounts"
    ADD CONSTRAINT "student_fee_accounts_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "public"."academic_years"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."student_fee_accounts"
    ADD CONSTRAINT "student_fee_accounts_fee_plan_override_id_fkey" FOREIGN KEY ("fee_plan_override_id") REFERENCES "public"."fee_plans"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."student_fee_accounts"
    ADD CONSTRAINT "student_fee_accounts_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."student_payments"
    ADD CONSTRAINT "student_payments_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "public"."academic_years"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."student_payments"
    ADD CONSTRAINT "student_payments_recorded_by_fkey" FOREIGN KEY ("recorded_by") REFERENCES "public"."staff"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."student_payments"
    ADD CONSTRAINT "student_payments_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE CASCADE;



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



ALTER TABLE "public"."academic_years" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."attendance" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."audit_log" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."classes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."fee_plan_classes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."fee_plans" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."guardians" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."incidents" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."lesson_plans" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."photo_consent_opt_outs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."push_subscriptions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."registration_submission_contacts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."registration_submissions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."staff" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."staff_attendance" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."staff_payroll" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."student_classes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."student_fee_accounts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."student_payments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."students" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."timetable_slots" ENABLE ROW LEVEL SECURITY;


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



REVOKE ALL ON FUNCTION "public"."apply_photo_opt_out"("p_request_id" "uuid", "p_staff_id" "uuid", "p_student_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."apply_photo_opt_out"("p_request_id" "uuid", "p_staff_id" "uuid", "p_student_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."approve_registration"("p_submission_id" "uuid", "p_staff_id" "uuid", "p_student_code" "text", "p_class_id" "uuid", "p_existing_student_id" "uuid", "p_reuse_guardians" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."approve_registration"("p_submission_id" "uuid", "p_staff_id" "uuid", "p_student_code" "text", "p_class_id" "uuid", "p_existing_student_id" "uuid", "p_reuse_guardians" boolean) TO "service_role";



REVOKE ALL ON FUNCTION "public"."close_enrolments"("p_ids" "uuid"[], "p_on" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."close_enrolments"("p_ids" "uuid"[], "p_on" "date") TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_registration_submission"("p_submission" "jsonb", "p_contacts" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_registration_submission"("p_submission" "jsonb", "p_contacts" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."find_guardian_matches"("p_email" "text", "p_phone" "text", "p_last_name" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."find_guardian_matches"("p_email" "text", "p_phone" "text", "p_last_name" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."find_student_matches"("p_first_name" "text", "p_last_name" "text", "p_date_of_birth" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."find_student_matches"("p_first_name" "text", "p_last_name" "text", "p_date_of_birth" "date") TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_class_open"("p_class_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_class_open"("p_class_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."mark_student_as_leaver"("p_student_id" "uuid", "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."mark_student_as_leaver"("p_student_id" "uuid", "p_reason" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."migrate_class"("p_source_class_id" "uuid", "p_student_actions" "jsonb", "p_academic_year_id" "uuid", "p_name" "text", "p_year_group" "text", "p_room_number" "text", "p_teacher_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."migrate_class"("p_source_class_id" "uuid", "p_student_actions" "jsonb", "p_academic_year_id" "uuid", "p_name" "text", "p_year_group" "text", "p_room_number" "text", "p_teacher_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."prevent_class_academic_year_change"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."rls_auto_enable"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."save_fee_plan"("p_id" "uuid", "p_name" "text", "p_academic_year_id" "uuid", "p_full_year_amount" numeric, "p_monthly_instalment_amount" numeric, "p_termly_instalment_amount" numeric, "p_notes" "text", "p_active" boolean, "p_class_ids" "uuid"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."save_fee_plan"("p_id" "uuid", "p_name" "text", "p_academic_year_id" "uuid", "p_full_year_amount" numeric, "p_monthly_instalment_amount" numeric, "p_termly_instalment_amount" numeric, "p_notes" "text", "p_active" boolean, "p_class_ids" "uuid"[]) TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_current_academic_year"("p_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_current_academic_year"("p_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_enrolments"("p_student_id" "uuid", "p_class_id" "uuid", "p_ids" "uuid"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_enrolments"("p_student_id" "uuid", "p_class_id" "uuid", "p_ids" "uuid"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."today_london"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."today_london"() TO "service_role";



GRANT ALL ON TABLE "public"."academic_years" TO "anon";
GRANT ALL ON TABLE "public"."academic_years" TO "authenticated";
GRANT ALL ON TABLE "public"."academic_years" TO "service_role";



GRANT ALL ON TABLE "public"."attendance" TO "anon";
GRANT ALL ON TABLE "public"."attendance" TO "authenticated";
GRANT ALL ON TABLE "public"."attendance" TO "service_role";



GRANT ALL ON TABLE "public"."audit_log" TO "anon";
GRANT ALL ON TABLE "public"."audit_log" TO "authenticated";
GRANT ALL ON TABLE "public"."audit_log" TO "service_role";



GRANT ALL ON TABLE "public"."classes" TO "anon";
GRANT ALL ON TABLE "public"."classes" TO "authenticated";
GRANT ALL ON TABLE "public"."classes" TO "service_role";



GRANT ALL ON TABLE "public"."fee_plan_classes" TO "anon";
GRANT ALL ON TABLE "public"."fee_plan_classes" TO "authenticated";
GRANT ALL ON TABLE "public"."fee_plan_classes" TO "service_role";



GRANT ALL ON TABLE "public"."fee_plans" TO "anon";
GRANT ALL ON TABLE "public"."fee_plans" TO "authenticated";
GRANT ALL ON TABLE "public"."fee_plans" TO "service_role";



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



GRANT ALL ON TABLE "public"."staff_payroll" TO "anon";
GRANT ALL ON TABLE "public"."staff_payroll" TO "authenticated";
GRANT ALL ON TABLE "public"."staff_payroll" TO "service_role";



GRANT ALL ON TABLE "public"."student_classes" TO "anon";
GRANT ALL ON TABLE "public"."student_classes" TO "authenticated";
GRANT ALL ON TABLE "public"."student_classes" TO "service_role";



GRANT ALL ON TABLE "public"."student_fee_accounts" TO "anon";
GRANT ALL ON TABLE "public"."student_fee_accounts" TO "authenticated";
GRANT ALL ON TABLE "public"."student_fee_accounts" TO "service_role";



GRANT ALL ON TABLE "public"."student_payments" TO "anon";
GRANT ALL ON TABLE "public"."student_payments" TO "authenticated";
GRANT ALL ON TABLE "public"."student_payments" TO "service_role";



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
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";







