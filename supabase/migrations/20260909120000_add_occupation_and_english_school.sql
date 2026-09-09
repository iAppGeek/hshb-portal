-- Guardian occupation and student English school name.
--
-- Adds two free-text fields:
--   * guardians.occupation / registration_submission_contacts.occupation —
--     required for parent/carer contacts on the public form and in the admin
--     "add student" parent slots, optional for emergency contacts and on the
--     standalone guardian edit page. Nullable here: the role that makes it
--     required lives on the student→guardian link, not on the guardian row.
--   * students.english_school_name / registration_submissions.english_school_name —
--     required on the public registration form, optional for admin data entry.
--
-- Both RPCs below use explicit column lists over jsonb_populate_record. A key
-- present in the JSON but missing from the column list is dropped with no
-- error, so the lists must be kept in step with the Zod schemas.

ALTER TABLE "public"."guardians" ADD COLUMN "occupation" "text";
ALTER TABLE "public"."registration_submission_contacts" ADD COLUMN "occupation" "text";


-- Carry occupation from the public form into the submission staging table.
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


-- Carry occupation onto the guardian row on approval, and include it in the
-- reuse diff. COALESCE, not an unconditional assignment: occupation is
-- optional on emergency-contact blocks, so a blank submission must never wipe
-- an occupation already on record.
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


-- The review screen previews exactly what approval will write to a reused
-- guardian, so the match rows must carry every column that preview compares.
-- The address columns were already declared on the GuardianMatch TS type but
-- never returned, which made the preview report address changes that were
-- no-ops. RETURNS TABLE cannot be widened by CREATE OR REPLACE, hence the DROP.
DROP FUNCTION IF EXISTS "public"."find_guardian_matches"("p_email" "text", "p_phone" "text", "p_last_name" "text");

CREATE FUNCTION "public"."find_guardian_matches"("p_email" "text", "p_phone" "text", "p_last_name" "text") RETURNS TABLE("id" "uuid", "first_name" "text", "last_name" "text", "phone" "text", "email" "text", "occupation" "text", "address_line_1" "text", "address_line_2" "text", "city" "text", "postcode" "text", "matched_on" "text")
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

-- DROP took the old grants with it; restore them.
REVOKE ALL ON FUNCTION "public"."find_guardian_matches"("p_email" "text", "p_phone" "text", "p_last_name" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."find_guardian_matches"("p_email" "text", "p_phone" "text", "p_last_name" "text") TO "service_role";
