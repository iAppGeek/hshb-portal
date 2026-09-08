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
