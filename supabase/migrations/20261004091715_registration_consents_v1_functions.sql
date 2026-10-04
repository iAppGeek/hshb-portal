-- Registration consents v1 (Privacy Notice v1.0 / School Policies v1.0).
--
-- The previous migration renamed the consent columns and added the new ones.
-- These three functions name the columns explicitly, so they are replaced with
-- the new names and the new fields:
--   * create_registration_submission stores SEN details, may_leave_unaccompanied,
--     consents_recorded_at and privacy_notice_version from the submission JSON.
--     A key missing from the column list is dropped with no error, so the list
--     must be kept in step with registrationSubmissionSchema.
--   * approve_registration copies them onto the student. A returning child's
--     new form replaces any staff change to may_leave_unaccompanied (so its
--     changed_at/by are cleared), and clears a recorded photo/video withdrawal
--     when it gives that consent again.
--   * apply_photo_opt_out records who withdrew photo/video consent and when.

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
    allergies, medical_details, sen_details,
    collect_authorised, collect_password, may_leave_unaccompanied,
    privacy_notice_read, first_aid_consent, email_sms_contact_ack,
    photo_video_consent, home_school_agreement,
    consents_recorded_at, privacy_notice_version, declaration_name
  )
  SELECT
    s.child_first_name, s.child_last_name, s.date_of_birth, s.preferred_year_group,
    s.english_school_name,
    s.address_line_1, s.address_line_2, s.city, s.postcode,
    s.allergies, s.medical_details, s.sen_details,
    s.collect_authorised, s.collect_password, COALESCE(s.may_leave_unaccompanied, FALSE),
    COALESCE(s.privacy_notice_read, FALSE), COALESCE(s.first_aid_consent, FALSE),
    COALESCE(s.email_sms_contact_ack, FALSE),
    COALESCE(s.photo_video_consent, FALSE), COALESCE(s.home_school_agreement, FALSE),
    s.consents_recorded_at, s.privacy_notice_version, s.declaration_name
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
--> statement-breakpoint

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

  UPDATE students SET
    photo_video_consent              = FALSE,
    photo_video_consent_withdrawn_at = NOW(),
    photo_video_consent_withdrawn_by = p_staff_id
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
--> statement-breakpoint

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
      allergies, medical_details, sen_details, may_leave_unaccompanied,
      privacy_notice_read, first_aid_consent, photo_video_consent,
      home_school_agreement, email_sms_contact_ack,
      consents_recorded_at, privacy_notice_version,
      primary_guardian_id, primary_guardian_relationship,
      secondary_guardian_id, secondary_guardian_relationship,
      additional_contact_1_id, additional_contact_1_relationship,
      additional_contact_2_id, additional_contact_2_relationship)
    VALUES (
      p_student_code, v_sub.child_first_name, v_sub.child_last_name, v_sub.date_of_birth,
      v_sub.english_school_name,
      v_sub.address_line_1, v_sub.address_line_2, v_sub.city, v_sub.postcode, NULL,
      v_sub.allergies, v_sub.medical_details, v_sub.sen_details, v_sub.may_leave_unaccompanied,
      v_sub.privacy_notice_read, v_sub.first_aid_consent, v_sub.photo_video_consent,
      v_sub.home_school_agreement, v_sub.email_sms_contact_ack,
      v_sub.consents_recorded_at, v_sub.privacy_notice_version,
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
      sen_details = v_sub.sen_details,
      may_leave_unaccompanied = v_sub.may_leave_unaccompanied,
      privacy_notice_read = v_sub.privacy_notice_read,
      first_aid_consent = v_sub.first_aid_consent,
      photo_video_consent = v_sub.photo_video_consent,
      home_school_agreement = v_sub.home_school_agreement,
      email_sms_contact_ack = v_sub.email_sms_contact_ack,
      consents_recorded_at = v_sub.consents_recorded_at,
      privacy_notice_version = v_sub.privacy_notice_version,
      -- Consent given again on the new form supersedes an earlier withdrawal.
      photo_video_consent_withdrawn_at = CASE WHEN v_sub.photo_video_consent THEN NULL ELSE photo_video_consent_withdrawn_at END,
      photo_video_consent_withdrawn_by = CASE WHEN v_sub.photo_video_consent THEN NULL ELSE photo_video_consent_withdrawn_by END,
      -- The parent's answer on the new form replaces any staff change.
      may_leave_unaccompanied_changed_at = NULL,
      may_leave_unaccompanied_changed_by = NULL,
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
                'privacy_notice_read','first_aid_consent','photo_video_consent','home_school_agreement','email_sms_contact_ack',
                'sen_details','may_leave_unaccompanied','consents_recorded_at','privacy_notice_version',
                'active'],
          ARRAY[v_old_s.first_name, v_old_s.last_name, v_old_s.date_of_birth::TEXT, v_old_s.english_school_name, v_old_s.address_line_1, v_old_s.address_line_2, v_old_s.city, v_old_s.postcode,
                v_old_s.allergies, v_old_s.medical_details, v_old_s.student_code,
                v_old_s.primary_guardian_id::TEXT, v_old_s.secondary_guardian_id::TEXT, v_old_s.additional_contact_1_id::TEXT, v_old_s.additional_contact_2_id::TEXT,
                v_old_s.privacy_notice_read::TEXT, v_old_s.first_aid_consent::TEXT, v_old_s.photo_video_consent::TEXT, v_old_s.home_school_agreement::TEXT, v_old_s.email_sms_contact_ack::TEXT,
                v_old_s.sen_details, v_old_s.may_leave_unaccompanied::TEXT, v_old_s.consents_recorded_at::TEXT, v_old_s.privacy_notice_version,
                v_old_s.active::TEXT],
          ARRAY[s.first_name, s.last_name, s.date_of_birth::TEXT, s.english_school_name, s.address_line_1, s.address_line_2, s.city, s.postcode,
                s.allergies, s.medical_details, s.student_code,
                s.primary_guardian_id::TEXT, s.secondary_guardian_id::TEXT, s.additional_contact_1_id::TEXT, s.additional_contact_2_id::TEXT,
                s.privacy_notice_read::TEXT, s.first_aid_consent::TEXT, s.photo_video_consent::TEXT, s.home_school_agreement::TEXT, s.email_sms_contact_ack::TEXT,
                s.sen_details, s.may_leave_unaccompanied::TEXT, s.consents_recorded_at::TEXT, s.privacy_notice_version,
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
  WHEN check_violation THEN
    RAISE EXCEPTION 'Student address is incomplete — cannot approve';
  WHEN foreign_key_violation THEN
    RAISE EXCEPTION 'Invalid class or student reference — a record may have been deleted';
END;
$$;
