-- Enrolment history: student_classes rows become dated "stays" instead of
-- current-membership rows, so past registers and reports reflect who was
-- actually enrolled on a given date. See plans/enrolment-history.md.

-- ─── Integrity guard (start) ────────────────────────────────────────────────
CREATE TEMP TABLE _counts ON COMMIT DROP AS
SELECT 'student_classes' AS t, count(*) AS n FROM student_classes
UNION ALL SELECT 'attendance', count(*) FROM attendance
UNION ALL SELECT 'students', count(*) FROM students
UNION ALL SELECT 'student_fee_accounts', count(*) FROM student_fee_accounts
UNION ALL SELECT 'student_payments', count(*) FROM student_payments;

-- ─── Helpers ─────────────────────────────────────────────────────────────────
CREATE FUNCTION "public"."today_london"() RETURNS "date"
    LANGUAGE "sql" STABLE
    AS $$ SELECT ("now"() AT TIME ZONE 'Europe/London')::"date" $$;

ALTER FUNCTION "public"."today_london"() OWNER TO "postgres";
REVOKE ALL ON FUNCTION "public"."today_london"() FROM PUBLIC, "anon", "authenticated";
GRANT ALL ON FUNCTION "public"."today_london"() TO "service_role";

CREATE FUNCTION "public"."is_class_completed"("p_class_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE
    AS $$
  SELECT NOT "c"."active" OR "ay"."start_date" < (SELECT "start_date" FROM "public"."academic_years" WHERE "is_current")
  FROM "public"."classes" "c" JOIN "public"."academic_years" "ay" ON "ay"."id" = "c"."academic_year_id"
  WHERE "c"."id" = "p_class_id"
$$;

ALTER FUNCTION "public"."is_class_completed"("p_class_id" "uuid") OWNER TO "postgres";
REVOKE ALL ON FUNCTION "public"."is_class_completed"("p_class_id" "uuid") FROM PUBLIC, "anon", "authenticated";
GRANT ALL ON FUNCTION "public"."is_class_completed"("p_class_id" "uuid") TO "service_role";

CREATE FUNCTION "public"."enrolment_start_date"("p_class_id" "uuid") RETURNS "date"
    LANGUAGE "sql" STABLE
    AS $$
  SELECT GREATEST("public"."today_london"(), "ay"."start_date")
  FROM "public"."classes" "c" JOIN "public"."academic_years" "ay" ON "ay"."id" = "c"."academic_year_id"
  WHERE "c"."id" = "p_class_id"
$$;

ALTER FUNCTION "public"."enrolment_start_date"("p_class_id" "uuid") OWNER TO "postgres";
REVOKE ALL ON FUNCTION "public"."enrolment_start_date"("p_class_id" "uuid") FROM PUBLIC, "anon", "authenticated";
GRANT ALL ON FUNCTION "public"."enrolment_start_date"("p_class_id" "uuid") TO "service_role";

-- ─── student_classes: dated stays ───────────────────────────────────────────
ALTER TABLE "public"."student_classes"
  ADD COLUMN "start_date" "date",
  ADD COLUMN "end_date" "date";

-- Backfill (decision 13): existing rows start on their class year's start_date.
UPDATE "public"."student_classes" "sc" SET "start_date" = "ay"."start_date"
FROM "public"."classes" "c" JOIN "public"."academic_years" "ay" ON "ay"."id" = "c"."academic_year_id"
WHERE "c"."id" = "sc"."class_id";

-- Rows belonging to a completed (past-year) class close at that year's end.
UPDATE "public"."student_classes" "sc" SET "end_date" = "ay"."end_date" + 1
FROM "public"."classes" "c" JOIN "public"."academic_years" "ay" ON "ay"."id" = "c"."academic_year_id"
WHERE "c"."id" = "sc"."class_id"
  AND "ay"."start_date" < (SELECT "start_date" FROM "public"."academic_years" WHERE "is_current");

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM "public"."student_classes" "sc" JOIN "public"."students" "s" ON "s"."id" = "sc"."student_id"
    WHERE NOT "s"."active" AND "sc"."end_date" IS NULL
  ) THEN
    RAISE EXCEPTION 'Inactive students still have open class enrolments; resolve them before migrating';
  END IF;
END $$;

ALTER TABLE "public"."student_classes"
  ALTER COLUMN "start_date" SET NOT NULL,
  ALTER COLUMN "start_date" SET DEFAULT "public"."today_london"(),
  ADD CONSTRAINT "student_classes_dates_check" CHECK ("end_date" IS NULL OR "end_date" >= "start_date"),
  DROP CONSTRAINT "student_classes_student_id_class_id_key";

CREATE UNIQUE INDEX "student_classes_one_open" ON "public"."student_classes" USING "btree" ("student_id", "class_id") WHERE "end_date" IS NULL;
CREATE INDEX "student_classes_class_dates" ON "public"."student_classes" USING "btree" ("class_id", "start_date", "end_date");

-- ─── attendance: allow the same date across concurrent classes ─────────────
ALTER TABLE "public"."attendance"
  DROP CONSTRAINT "attendance_student_id_date_key",
  ADD CONSTRAINT "attendance_class_student_date_key" UNIQUE ("class_id", "student_id", "date");

DROP FUNCTION "public"."get_attendance_summary"("date");

-- ─── students: leaving reason ───────────────────────────────────────────────
ALTER TABLE "public"."students" ADD COLUMN "leaving_reason" "text"
  CHECK ("leaving_reason" IN ('left', 'graduated', 'transferred'));

-- ─── close_enrolments ────────────────────────────────────────────────────────
CREATE FUNCTION "public"."close_enrolments"("p_ids" "uuid"[], "p_on" "date") RETURNS "void"
    LANGUAGE "sql"
    AS $$
  UPDATE "public"."student_classes" SET "end_date" = GREATEST("start_date", "p_on")
  WHERE "id" = ANY("p_ids") AND "end_date" IS NULL
$$;

ALTER FUNCTION "public"."close_enrolments"("p_ids" "uuid"[], "p_on" "date") OWNER TO "postgres";
REVOKE ALL ON FUNCTION "public"."close_enrolments"("p_ids" "uuid"[], "p_on" "date") FROM PUBLIC, "anon", "authenticated";
GRANT ALL ON FUNCTION "public"."close_enrolments"("p_ids" "uuid"[], "p_on" "date") TO "service_role";

-- ─── set_enrolments ──────────────────────────────────────────────────────────
CREATE FUNCTION "public"."set_enrolments"("p_student_id" "uuid", "p_class_id" "uuid", "p_ids" "uuid"[]) RETURNS "void"
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
    IF "public"."is_class_completed"(p_class_id) THEN
      RAISE EXCEPTION 'Completed classes can''t be changed.';
    END IF;

    PERFORM "public"."close_enrolments"(
      ARRAY(
        SELECT id FROM student_classes
        WHERE class_id = p_class_id AND end_date IS NULL AND student_id <> ALL(v_ids)
      ),
      "public"."today_london"()
    );

    INSERT INTO student_classes (student_id, class_id, start_date)
    SELECT s, p_class_id, "public"."enrolment_start_date"(p_class_id)
    FROM unnest(v_ids) s
    WHERE NOT EXISTS (
      SELECT 1 FROM student_classes WHERE student_id = s AND class_id = p_class_id AND end_date IS NULL
    );
  ELSE
    -- Student mode: v_ids are class ids. Scope = the student's open rows in
    -- active classes of the current year.
    IF NOT (SELECT active FROM students WHERE id = p_student_id) THEN
      RAISE EXCEPTION 'Leavers can''t be enrolled in classes.';
    END IF;

    IF EXISTS (
      SELECT 1 FROM unnest(v_ids) c
      JOIN classes cl ON cl.id = c
      JOIN academic_years ay ON ay.id = cl.academic_year_id
      WHERE NOT cl.active OR NOT ay.is_current
    ) OR (SELECT count(*) FROM classes WHERE id = ANY(v_ids)) <> cardinality(v_ids) THEN
      RAISE EXCEPTION 'Students can only be enrolled in active classes of the current year.';
    END IF;

    PERFORM "public"."close_enrolments"(
      ARRAY(
        SELECT sc.id FROM student_classes sc
        JOIN classes cl ON cl.id = sc.class_id
        JOIN academic_years ay ON ay.id = cl.academic_year_id
        WHERE sc.student_id = p_student_id AND sc.end_date IS NULL
          AND cl.active AND ay.is_current
          AND sc.class_id <> ALL(v_ids)
      ),
      "public"."today_london"()
    );

    INSERT INTO student_classes (student_id, class_id, start_date)
    SELECT p_student_id, c, "public"."enrolment_start_date"(c)
    FROM unnest(v_ids) c
    WHERE NOT EXISTS (
      SELECT 1 FROM student_classes WHERE student_id = p_student_id AND class_id = c AND end_date IS NULL
    );
  END IF;
END;
$$;

ALTER FUNCTION "public"."set_enrolments"("p_student_id" "uuid", "p_class_id" "uuid", "p_ids" "uuid"[]) OWNER TO "postgres";
REVOKE ALL ON FUNCTION "public"."set_enrolments"("p_student_id" "uuid", "p_class_id" "uuid", "p_ids" "uuid"[]) FROM PUBLIC, "anon", "authenticated";
GRANT ALL ON FUNCTION "public"."set_enrolments"("p_student_id" "uuid", "p_class_id" "uuid", "p_ids" "uuid"[]) TO "service_role";

-- ─── mark_student_as_leaver ──────────────────────────────────────────────────
CREATE FUNCTION "public"."mark_student_as_leaver"("p_student_id" "uuid", "p_reason" "text") RETURNS "void"
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

  PERFORM "public"."close_enrolments"(
    ARRAY(SELECT id FROM student_classes WHERE student_id = p_student_id AND end_date IS NULL),
    "public"."today_london"()
  );

  UPDATE students SET active = false, leaving_reason = p_reason WHERE id = p_student_id;
END;
$$;

ALTER FUNCTION "public"."mark_student_as_leaver"("p_student_id" "uuid", "p_reason" "text") OWNER TO "postgres";
REVOKE ALL ON FUNCTION "public"."mark_student_as_leaver"("p_student_id" "uuid", "p_reason" "text") FROM PUBLIC, "anon", "authenticated";
GRANT ALL ON FUNCTION "public"."mark_student_as_leaver"("p_student_id" "uuid", "p_reason" "text") TO "service_role";

-- ─── migrate_class ───────────────────────────────────────────────────────────
DROP FUNCTION "public"."migrate_class"("p_source_class_id" "uuid", "p_name" "text", "p_year_group" "text", "p_room_number" "text", "p_academic_year_id" "uuid", "p_teacher_id" "uuid");

CREATE FUNCTION "public"."migrate_class"(
  "p_source_class_id" "uuid",
  "p_student_actions" "jsonb",
  "p_academic_year_id" "uuid" DEFAULT NULL,
  "p_name" "text" DEFAULT NULL,
  "p_year_group" "text" DEFAULT NULL,
  "p_room_number" "text" DEFAULT NULL,
  "p_teacher_id" "uuid" DEFAULT NULL
) RETURNS "json"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_source RECORD;
  v_new_class_id uuid;
  v_create boolean := p_name IS NOT NULL;
  v_expected_ids uuid[];
  v_actual_ids uuid[];
  v_close_on date;
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

  SELECT ARRAY(SELECT student_id FROM student_classes WHERE class_id = p_source_class_id AND end_date IS NULL)
    INTO v_expected_ids;
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
    IF (SELECT start_date FROM academic_years WHERE id = p_academic_year_id) <= v_source.start_date THEN
      RAISE EXCEPTION 'Target academic year must be after the source class''s academic year';
    END IF;

    INSERT INTO classes (name, year_group, room_number, academic_year_id, teacher_id, active)
    VALUES (p_name, p_year_group, p_room_number, p_academic_year_id, p_teacher_id, true)
    RETURNING id INTO v_new_class_id;
  END IF;

  v_close_on := LEAST("public"."today_london"(), v_source.end_date + 1);
  PERFORM "public"."close_enrolments"(
    ARRAY(SELECT id FROM student_classes WHERE class_id = p_source_class_id AND end_date IS NULL),
    v_close_on
  );

  FOR v_key, v_action IN SELECT key, value FROM jsonb_each_text(p_student_actions)
  LOOP
    v_student_id := v_key::uuid;
    IF v_action = 'move' THEN
      INSERT INTO student_classes (student_id, class_id, start_date)
      VALUES (v_student_id, v_new_class_id, "public"."enrolment_start_date"(v_new_class_id));
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
REVOKE ALL ON FUNCTION "public"."migrate_class"("p_source_class_id" "uuid", "p_student_actions" "jsonb", "p_academic_year_id" "uuid", "p_name" "text", "p_year_group" "text", "p_room_number" "text", "p_teacher_id" "uuid") FROM PUBLIC, "anon", "authenticated";
GRANT ALL ON FUNCTION "public"."migrate_class"("p_source_class_id" "uuid", "p_student_actions" "jsonb", "p_academic_year_id" "uuid", "p_name" "text", "p_year_group" "text", "p_room_number" "text", "p_teacher_id" "uuid") TO "service_role";

-- ─── approve_registration: dated enrolment insert ───────────────────────────
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
    VALUES (v_student_id, p_class_id, "public"."enrolment_start_date"(p_class_id))
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

-- ─── Integrity guard (end) ───────────────────────────────────────────────────
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM _counts c WHERE c.n <> CASE c.t
      WHEN 'student_classes' THEN (SELECT count(*) FROM student_classes)
      WHEN 'attendance' THEN (SELECT count(*) FROM attendance)
      WHEN 'students' THEN (SELECT count(*) FROM students)
      WHEN 'student_fee_accounts' THEN (SELECT count(*) FROM student_fee_accounts)
      WHEN 'student_payments' THEN (SELECT count(*) FROM student_payments) END
  ) THEN RAISE EXCEPTION 'Row counts changed during migration'; END IF;
END $$;
