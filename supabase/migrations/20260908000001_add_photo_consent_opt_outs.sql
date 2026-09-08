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
