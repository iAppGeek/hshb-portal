-- Supports guardian search by email and the four-slot guardian lookup used by
-- the family view (getFamilyForGuardian). Only two of the four student
-- guardian-slot columns were indexed before this.
CREATE INDEX IF NOT EXISTS guardians_email_lower_idx
  ON guardians (lower(email));

CREATE INDEX IF NOT EXISTS students_additional_contact_1_id_idx
  ON students (additional_contact_1_id);

CREATE INDEX IF NOT EXISTS students_additional_contact_2_id_idx
  ON students (additional_contact_2_id);
