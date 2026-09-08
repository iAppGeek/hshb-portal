-- ─── find_student_matches RPC ────────────────────────────────────────────────
-- Case-insensitive exact match on last name, plus either the same DOB or the
-- same first name. Includes inactive students so returning children can be
-- linked and reactivated. Parameterised so form-supplied text is never
-- interpolated into a PostgREST filter string.
CREATE OR REPLACE FUNCTION find_student_matches(
  p_first_name    TEXT,
  p_last_name     TEXT,
  p_date_of_birth DATE
) RETURNS TABLE (
  id             UUID,
  first_name     TEXT,
  last_name      TEXT,
  date_of_birth  DATE,
  student_code   TEXT,
  active         BOOLEAN
) AS $$
  SELECT s.id, s.first_name, s.last_name, s.date_of_birth, s.student_code, s.active
  FROM students s
  WHERE LOWER(s.last_name) = LOWER(p_last_name)
    AND (s.date_of_birth = p_date_of_birth OR LOWER(s.first_name) = LOWER(p_first_name))
  ORDER BY s.active DESC, s.last_name, s.first_name
  LIMIT 10;
$$ LANGUAGE sql STABLE;

-- ─── find_guardian_matches RPC ───────────────────────────────────────────────
-- Same rule approve_registration uses to de-dupe: case-insensitive email, else
-- digits-only phone + case-insensitive last name. Surfaced on the review page
-- so an admin can see which contacts would be linked to an existing guardian.
CREATE OR REPLACE FUNCTION find_guardian_matches(
  p_email     TEXT,
  p_phone     TEXT,
  p_last_name TEXT
) RETURNS TABLE (
  id         UUID,
  first_name TEXT,
  last_name  TEXT,
  phone      TEXT,
  email      TEXT,
  matched_on TEXT
) AS $$
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
$$ LANGUAGE sql STABLE;

-- ─── approve_registration RPC (v2: optional guardian reuse) ──────────────────
-- Adds p_reuse_guardians so an admin can decline to link a submission to an
-- existing guardian even when the de-dupe rule matches (email or phone+last
-- name) — the review page surfaces the match and lets them choose. When
-- reusing, refreshes the guardian's phone and address from this submission,
-- since it is the newest statement of their contact details. The function
-- signature changed, so the old overload must be dropped explicitly.
DROP FUNCTION IF EXISTS approve_registration(UUID, UUID, TEXT, UUID, UUID);

CREATE OR REPLACE FUNCTION approve_registration(
  p_submission_id       UUID,
  p_staff_id            UUID,
  p_student_code        TEXT DEFAULT NULL,
  p_class_id            UUID DEFAULT NULL,
  p_existing_student_id UUID DEFAULT NULL,    -- NULL = create; set = link/update returning child
  p_reuse_guardians     BOOLEAN DEFAULT TRUE
) RETURNS UUID AS $$
DECLARE
  v_sub        registration_submissions%ROWTYPE;
  v_con        registration_submission_contacts%ROWTYPE;
  v_student_id UUID;
  v_gid        UUID;
  v_reused     BOOLEAN;
  v_primary UUID; v_secondary UUID; v_add1 UUID; v_add2 UUID;
  v_rel_primary TEXT; v_rel_secondary TEXT; v_rel_add1 TEXT; v_rel_add2 TEXT;
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
    v_gid := NULL;
    IF p_reuse_guardians AND v_con.email IS NOT NULL THEN
      SELECT id INTO v_gid FROM guardians WHERE LOWER(email) = LOWER(v_con.email) LIMIT 1;
    END IF;
    IF p_reuse_guardians AND v_gid IS NULL THEN
      SELECT id INTO v_gid FROM guardians
       WHERE regexp_replace(phone, '\D', '', 'g') = regexp_replace(v_con.phone, '\D', '', 'g')
         AND LOWER(last_name) = LOWER(v_con.last_name)
       LIMIT 1;
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

    IF v_reused AND p_reuse_guardians THEN
      -- Reused guardian: the parent's latest submission is the newest statement
      -- of their contact details, so refresh phone and address.
      UPDATE guardians SET
        phone          = v_con.phone,
        email          = COALESCE(v_con.email, email),
        address_line_1 = CASE WHEN v_con.same_as_child_address THEN v_sub.address_line_1 ELSE COALESCE(v_con.address_line_1, address_line_1) END,
        address_line_2 = CASE WHEN v_con.same_as_child_address THEN v_sub.address_line_2 ELSE COALESCE(v_con.address_line_2, address_line_2) END,
        city           = CASE WHEN v_con.same_as_child_address THEN v_sub.city           ELSE COALESCE(v_con.city, city)           END,
        postcode       = CASE WHEN v_con.same_as_child_address THEN v_sub.postcode       ELSE COALESCE(v_con.postcode, postcode)   END
      WHERE id = v_gid;
    END IF;

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
    IF v_student_id IS NULL THEN
      RAISE EXCEPTION 'Existing student not found';
    END IF;
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

  RETURN v_student_id;

EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'Student code "%" is already in use', p_student_code;
  WHEN check_violation THEN
    RAISE EXCEPTION 'Student address is incomplete — cannot approve';
  WHEN foreign_key_violation THEN
    RAISE EXCEPTION 'Invalid class or student reference — a record may have been deleted';
END;
$$ LANGUAGE plpgsql;

-- ─── create_registration_submission RPC ──────────────────────────────────────
-- Inserts a submission and its contacts in one transaction so the inbox can
-- never contain a submission without a primary contact.
CREATE OR REPLACE FUNCTION create_registration_submission(
  p_submission JSONB,
  p_contacts   JSONB
) RETURNS UUID AS $$
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
$$ LANGUAGE plpgsql;

-- ─── purge_actioned_submissions RPC ──────────────────────────────────────────
-- Data minimisation: once a registration or opt-out has been actioned, its
-- personal data lives on the student record. Remove the staging rows after a
-- retention window. Returns the number of rows removed across both tables.
CREATE OR REPLACE FUNCTION purge_actioned_submissions(
  p_older_than_days INT DEFAULT 90
) RETURNS INT AS $$
DECLARE
  v_reg INT;
  v_opt INT;
BEGIN
  DELETE FROM registration_submissions
   WHERE status = 'actioned' AND actioned_at < NOW() - (p_older_than_days || ' days')::INTERVAL;
  GET DIAGNOSTICS v_reg = ROW_COUNT;

  DELETE FROM photo_consent_opt_outs
   WHERE status = 'actioned' AND actioned_at < NOW() - (p_older_than_days || ' days')::INTERVAL;
  GET DIAGNOSTICS v_opt = ROW_COUNT;

  RETURN v_reg + v_opt;
END;
$$ LANGUAGE plpgsql;
