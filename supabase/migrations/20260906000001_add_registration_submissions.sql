-- ─── Registration submissions (public form staging area) ─────────────────────
-- Parents submit via the public /register form; submissions land here rather
-- than directly in students/guardians. An admin reviews and approves each one
-- via approve_registration(), which creates or links a student atomically.

CREATE TYPE submission_status AS ENUM ('pending', 'actioned', 'rejected');
CREATE TYPE contact_role      AS ENUM ('primary', 'secondary', 'additional_1', 'additional_2');

CREATE TABLE registration_submissions (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status                submission_status NOT NULL DEFAULT 'pending',
  submitted_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Child
  child_first_name      TEXT NOT NULL,
  child_last_name       TEXT NOT NULL,
  date_of_birth         DATE NOT NULL,
  preferred_year_group  TEXT,                       -- parent's placement hint; not copied to students

  -- Home address (NOT NULL here, so students_address_source_check is always satisfiable on approval)
  address_line_1        TEXT NOT NULL,
  address_line_2        TEXT,
  city                  TEXT NOT NULL,
  postcode              TEXT NOT NULL,

  -- Medical
  allergies             TEXT,
  medical_details       TEXT,

  -- Collection arrangements (submission-only; surfaced to the admin, who can copy into students.notes)
  collect_authorised    TEXT,
  collect_password      TEXT,

  -- Consents (parent's declaration)
  consent_privacy_notice      BOOLEAN NOT NULL DEFAULT FALSE,
  consent_emergency_first_aid BOOLEAN NOT NULL DEFAULT FALSE,
  consent_photo_media         BOOLEAN NOT NULL DEFAULT FALSE,
  consent_home_school         BOOLEAN NOT NULL DEFAULT FALSE,
  consent_comms_email_sms     BOOLEAN NOT NULL DEFAULT FALSE,
  declaration_name            TEXT NOT NULL,

  -- Workflow (approve and reject both set actioned_*)
  actioned_by           UUID REFERENCES staff(id) ON DELETE SET NULL,
  actioned_at           TIMESTAMPTZ,
  student_id            UUID REFERENCES students(id) ON DELETE SET NULL,   -- created OR linked
  linked_existing       BOOLEAN NOT NULL DEFAULT FALSE,
  rejected_reason       TEXT,

  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER registration_submissions_updated_at
  BEFORE UPDATE ON registration_submissions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX ON registration_submissions (status);
CREATE INDEX ON registration_submissions (submitted_at DESC);
CREATE INDEX ON registration_submissions (student_id);

CREATE TABLE registration_submission_contacts (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id         UUID NOT NULL REFERENCES registration_submissions(id) ON DELETE CASCADE,
  contact_role          contact_role NOT NULL,
  first_name            TEXT NOT NULL,
  last_name             TEXT NOT NULL,
  relationship          TEXT,
  phone                 TEXT NOT NULL,
  email                 TEXT,
  same_as_child_address BOOLEAN NOT NULL DEFAULT TRUE,
  address_line_1        TEXT,
  address_line_2        TEXT,
  city                  TEXT,
  postcode              TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (submission_id, contact_role)
);

CREATE INDEX ON registration_submission_contacts (submission_id);

-- ─── Consent flags on students (current state only; no history) ──────────────

ALTER TABLE students
  ADD COLUMN consent_privacy_notice      BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN consent_emergency_first_aid BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN consent_photo_media         BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN consent_home_school         BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN consent_comms_email_sms     BOOLEAN NOT NULL DEFAULT FALSE;
-- Existing students default to FALSE; the office sets them on the edit page as paper forms are checked.

ALTER TABLE registration_submissions         ENABLE ROW LEVEL SECURITY;
ALTER TABLE registration_submission_contacts ENABLE ROW LEVEL SECURITY;
-- No policies: same deny-all-except-service-role model as every other table.

-- ─── approve_registration RPC ─────────────────────────────────────────────────
-- Creates (or updates/links a returning) student, resolves/de-dupes guardians,
-- copies consent flags, enrols in a class, and marks the submission actioned —
-- all atomically. Modelled on migrate_class(). No SECURITY DEFINER / role check:
-- the calling server action has already verified the session role.

CREATE OR REPLACE FUNCTION approve_registration(
  p_submission_id       UUID,
  p_staff_id            UUID,
  p_student_code        TEXT DEFAULT NULL,
  p_class_id            UUID DEFAULT NULL,
  p_existing_student_id UUID DEFAULT NULL     -- NULL = create; set = link/update returning child
) RETURNS UUID AS $$
DECLARE
  v_sub        registration_submissions%ROWTYPE;
  v_con        registration_submission_contacts%ROWTYPE;
  v_student_id UUID;
  v_gid        UUID;
  v_primary UUID; v_secondary UUID; v_add1 UUID; v_add2 UUID;
  v_rel_primary TEXT; v_rel_secondary TEXT; v_rel_add1 TEXT; v_rel_add2 TEXT;
BEGIN
  SELECT * INTO v_sub FROM registration_submissions
    WHERE id = p_submission_id AND status = 'pending' FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Submission not found or already actioned';
  END IF;

  -- Resolve each contact to a guardian row. De-dup: case-insensitive email match,
  -- else digits-only phone + case-insensitive last name. Otherwise insert.
  FOR v_con IN
    SELECT * FROM registration_submission_contacts WHERE submission_id = p_submission_id
  LOOP
    v_gid := NULL;
    IF v_con.email IS NOT NULL THEN
      SELECT id INTO v_gid FROM guardians WHERE LOWER(email) = LOWER(v_con.email) LIMIT 1;
    END IF;
    IF v_gid IS NULL THEN
      SELECT id INTO v_gid FROM guardians
       WHERE regexp_replace(phone, '\D', '', 'g') = regexp_replace(v_con.phone, '\D', '', 'g')
         AND LOWER(last_name) = LOWER(v_con.last_name)
       LIMIT 1;
    END IF;
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
