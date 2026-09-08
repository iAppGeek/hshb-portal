-- ─── Staff ────────────────────────────────────────────────────────────────────
-- Admins add staff here before they can log in via Microsoft SSO.

CREATE TABLE staff (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email           TEXT UNIQUE NOT NULL,
  first_name      TEXT NOT NULL,
  last_name       TEXT NOT NULL,
  display_name    TEXT,                -- optional override; if null, use first_name || ' ' || last_name
  role            TEXT NOT NULL CHECK (role IN ('teacher', 'admin', 'headteacher', 'secretary')),
  contact_number  TEXT,
  personal_email  TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Classes ──────────────────────────────────────────────────────────────────

CREATE TABLE classes (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  year_group    TEXT NOT NULL,
  room_number   TEXT,
  teacher_id    UUID REFERENCES staff(id) ON DELETE SET NULL,
  academic_year TEXT NOT NULL DEFAULT '2025-26',
  active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Guardians ────────────────────────────────────────────────────────────────
-- Reusable guardian/contact records. Students link to these via FK.

CREATE TABLE guardians (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name      TEXT NOT NULL,
  last_name       TEXT NOT NULL,
  phone           TEXT NOT NULL,
  email           TEXT,
  address_line_1  TEXT,
  address_line_2  TEXT,
  city            TEXT,
  postcode        TEXT,
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Keep updated_at current on every row change
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER guardians_updated_at
  BEFORE UPDATE ON guardians
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── Students ─────────────────────────────────────────────────────────────────
-- student_code preserves existing spreadsheet IDs for import/reference.
-- Each student must have a primary guardian; secondary guardian and two
-- additional contacts are optional and also reference the guardians table.
-- Class enrolment is managed via student_classes (many-to-many).

CREATE TABLE students (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_code            TEXT UNIQUE,                          -- existing spreadsheet ID
  first_name              TEXT NOT NULL,
  last_name               TEXT NOT NULL,
  date_of_birth           DATE,
  -- Student's own address (nullable when address_guardian_id is set)
  address_line_1          TEXT,
  address_line_2          TEXT,
  city                    TEXT,
  postcode                TEXT,
  -- Guardian whose address this student shares (alternative to own address)
  address_guardian_id     UUID REFERENCES guardians(id) ON DELETE SET NULL,
  -- Guardian links with relationship to student
  primary_guardian_id           UUID NOT NULL REFERENCES guardians(id) ON DELETE RESTRICT,
  primary_guardian_relationship TEXT,
  secondary_guardian_id         UUID REFERENCES guardians(id) ON DELETE SET NULL,
  secondary_guardian_relationship TEXT,
  additional_contact_1_id       UUID REFERENCES guardians(id) ON DELETE SET NULL,
  additional_contact_1_relationship TEXT,
  additional_contact_2_id       UUID REFERENCES guardians(id) ON DELETE SET NULL,
  additional_contact_2_relationship TEXT,
  -- Medical
  allergies               TEXT,
  medical_details         TEXT,
  enrollment_date         DATE DEFAULT CURRENT_DATE,
  active                  BOOLEAN NOT NULL DEFAULT TRUE,
  notes                   TEXT,
  created_at              TIMESTAMPTZ DEFAULT NOW(),
  updated_at              TIMESTAMPTZ DEFAULT NOW()
);

CREATE TRIGGER students_updated_at
  BEFORE UPDATE ON students
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE students
  ADD CONSTRAINT students_address_source_check CHECK (
    address_guardian_id IS NOT NULL
    OR (address_line_1 IS NOT NULL AND city IS NOT NULL AND postcode IS NOT NULL)
  );

-- ─── Student Classes ──────────────────────────────────────────────────────────
-- Junction table: a student can be enrolled in multiple classes.

CREATE TABLE student_classes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id  UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  class_id    UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  enrolled_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (student_id, class_id)
);

-- ─── Timetable ────────────────────────────────────────────────────────────────

CREATE TABLE timetable_slots (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id     UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  day_of_week  TEXT NOT NULL CHECK (day_of_week IN (
                 'Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'
               )),
  start_time   TIME NOT NULL,
  end_time     TIME NOT NULL,
  subject      TEXT,
  room         TEXT,
  notes        TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Attendance ───────────────────────────────────────────────────────────────
-- One record per student per date. status: present | absent | late
-- UNIQUE(student_id, date) means upsert on conflict updates the existing row.

CREATE TABLE attendance (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id     UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  student_id   UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  date         DATE NOT NULL,
  status       TEXT NOT NULL CHECK (status IN ('present', 'absent', 'late')),
  notes        TEXT,
  recorded_by  UUID REFERENCES staff(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (student_id, date)
);

CREATE TRIGGER attendance_updated_at
  BEFORE UPDATE ON attendance
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── Incidents ────────────────────────────────────────────────────────────────

CREATE TABLE incidents (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type          TEXT NOT NULL CHECK (type IN ('medical', 'behaviour', 'other')),
  student_id    UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  title         TEXT NOT NULL,
  description   TEXT NOT NULL,
  incident_date TIMESTAMPTZ NOT NULL,
  created_by          UUID NOT NULL REFERENCES staff(id),
  updated_by          UUID REFERENCES staff(id),
  parent_notified     BOOLEAN NOT NULL DEFAULT FALSE,
  parent_notified_at  TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER incidents_updated_at
  BEFORE UPDATE ON incidents
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── Push Subscriptions ───────────────────────────────────────────────────────
-- Stores Web Push API subscriptions per staff member (one row per device).
-- endpoint is UNIQUE: re-subscribing the same device upserts cleanly.
-- No role column — role is joined from staff at query time so promotions propagate automatically.

CREATE TABLE push_subscriptions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id   UUID NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  endpoint   TEXT NOT NULL UNIQUE,
  p256dh     TEXT NOT NULL,
  auth       TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX ON push_subscriptions (staff_id);

-- ─── Row Level Security ───────────────────────────────────────────────────────
-- Access is enforced in the application layer (Next.js) using the service role
-- key, so RLS is enabled but permissive for the service role.

ALTER TABLE staff            ENABLE ROW LEVEL SECURITY;
ALTER TABLE classes          ENABLE ROW LEVEL SECURITY;
ALTER TABLE guardians        ENABLE ROW LEVEL SECURITY;
ALTER TABLE students         ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_classes  ENABLE ROW LEVEL SECURITY;
ALTER TABLE timetable_slots  ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance          ENABLE ROW LEVEL SECURITY;
ALTER TABLE incidents           ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_subscriptions  ENABLE ROW LEVEL SECURITY;

-- Service role bypasses RLS automatically — no policy needed for server-side queries.
-- Add restrictive policies here if you ever expose these tables via the anon key.

-- ─── Indexes ──────────────────────────────────────────────────────────────────

CREATE INDEX ON guardians (last_name);
CREATE INDEX ON students (student_code);
CREATE INDEX ON students (active);
CREATE INDEX ON students (primary_guardian_id);
CREATE INDEX ON students (secondary_guardian_id);
CREATE INDEX ON student_classes (student_id);
CREATE INDEX ON student_classes (class_id);
CREATE INDEX ON classes (teacher_id);
CREATE INDEX ON classes (active);
CREATE INDEX ON timetable_slots (class_id);
CREATE INDEX ON timetable_slots (day_of_week);
CREATE INDEX ON attendance (class_id, date);
CREATE INDEX ON attendance (student_id);
CREATE INDEX ON incidents (student_id);
CREATE INDEX ON incidents (type);
CREATE INDEX ON incidents (incident_date DESC);


-- ─── Lesson Plans ───────────────────────────────────────────────────────────
-- One lesson plan per class per calendar day.

CREATE TABLE lesson_plans (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id      UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  lesson_date   DATE NOT NULL,
  description   TEXT NOT NULL,
  created_by    UUID NOT NULL REFERENCES staff(id),
  updated_by    UUID REFERENCES staff(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (class_id, lesson_date)
);

CREATE TRIGGER lesson_plans_updated_at
  BEFORE UPDATE ON lesson_plans
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE lesson_plans ENABLE ROW LEVEL SECURITY;

CREATE INDEX ON lesson_plans (lesson_date DESC);
CREATE INDEX ON lesson_plans (class_id);

-- ─── Staff Attendance ─────────────────────────────────────────────────────────
-- One record per staff member per date. signed_in_at is user-provided (not auto
-- NOW()) so admins can backfill accurate arrival times for past dates.
-- signed_out_at is nullable: NULL means currently signed in.

CREATE TABLE staff_attendance (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id        UUID NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  date            DATE NOT NULL DEFAULT CURRENT_DATE,
  signed_in_at    TIMESTAMPTZ NOT NULL,
  signed_out_at   TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (staff_id, date)
);

CREATE TRIGGER staff_attendance_updated_at
  BEFORE UPDATE ON staff_attendance
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE staff_attendance ENABLE ROW LEVEL SECURITY;

CREATE INDEX ON staff_attendance (staff_id);
CREATE INDEX ON staff_attendance (date);

-- ─── Functions ────────────────────────────────────────────────────────────────

-- Aggregates attendance records for a given date by class.
-- Returns present count, earliest created_at, and latest updated_at per class.
CREATE OR REPLACE FUNCTION get_attendance_summary(p_date DATE)
RETURNS TABLE(
  class_id        UUID,
  present_count   BIGINT,
  min_created_at  TIMESTAMPTZ,
  max_updated_at  TIMESTAMPTZ
) AS $$
  SELECT
    class_id,
    COUNT(*) FILTER (WHERE status IN ('present', 'late')) AS present_count,
    MIN(created_at)  AS min_created_at,
    MAX(updated_at)  AS max_updated_at
  FROM attendance
  WHERE date = p_date
  GROUP BY class_id
$$ LANGUAGE sql STABLE;

-- Migrates a class to a new academic year: creates a new class with the given
-- details, copies all student enrolments from the source class, and deactivates
-- the source class — all in a single atomic transaction.
CREATE OR REPLACE FUNCTION migrate_class(
  p_source_class_id  UUID,
  p_name             TEXT,
  p_year_group       TEXT,
  p_room_number      TEXT,
  p_academic_year    TEXT,
  p_teacher_id       UUID
)
RETURNS JSON LANGUAGE plpgsql AS $$
DECLARE
  v_source       RECORD;
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

  -- Enrol all students from source class into new class
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

-- ─── Audit Log ───────────────────────────────────────────────────────────────

CREATE TABLE audit_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id    UUID REFERENCES staff(id) ON DELETE SET NULL,
  action      TEXT NOT NULL,
  entity      TEXT NOT NULL,
  entity_id   TEXT,
  details     JSONB,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_audit_log_staff_id ON audit_log(staff_id);
CREATE INDEX idx_audit_log_entity ON audit_log(entity);
CREATE INDEX idx_audit_log_created_at ON audit_log(created_at);

-- ═══════════════════════════════════════════════════════════════════════════
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

-- ═══════════════════════════════════════════════════════════════════════════
-- ─── Photo consent opt-outs (public form staging area) ────────────────────────
-- A public, unauthenticated form (/register/photo-opt-out) for an existing
-- family to withdraw photo/media consent without redoing the full registration.
-- The public form defaults consent_photo_media to ticked, so this is the
-- explicit opt-out path. Staged here (never writes to students directly) so an
-- admin can match the request to the right student before it's applied —
-- mirrors registration_submissions' review-then-act model.

CREATE TYPE photo_opt_out_status AS ENUM ('pending', 'actioned', 'rejected');

CREATE TABLE photo_consent_opt_outs (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status            photo_opt_out_status NOT NULL DEFAULT 'pending',
  submitted_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  child_first_name  TEXT NOT NULL,
  child_last_name   TEXT NOT NULL,
  date_of_birth     DATE NOT NULL,
  declaration_name  TEXT NOT NULL,
  notes             TEXT,

  actioned_by       UUID REFERENCES staff(id) ON DELETE SET NULL,
  actioned_at       TIMESTAMPTZ,
  student_id        UUID REFERENCES students(id) ON DELETE SET NULL,
  rejected_reason   TEXT,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER photo_consent_opt_outs_updated_at
  BEFORE UPDATE ON photo_consent_opt_outs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX ON photo_consent_opt_outs (status);
CREATE INDEX ON photo_consent_opt_outs (submitted_at DESC);

ALTER TABLE photo_consent_opt_outs ENABLE ROW LEVEL SECURITY;
-- No policies: same deny-all-except-service-role model as every other table.

-- ─── apply_photo_opt_out RPC ───────────────────────────────────────────────────
-- Sets students.consent_photo_media = false for the matched student and marks
-- the request actioned — atomically, so a failed student update never leaves
-- the request silently marked done.

CREATE OR REPLACE FUNCTION apply_photo_opt_out(
  p_request_id UUID,
  p_staff_id   UUID,
  p_student_id UUID
) RETURNS UUID AS $$
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
$$ LANGUAGE plpgsql;
