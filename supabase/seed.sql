-- ─── E2E Test Seed Data ───────────────────────────────────────────────────────
-- All UUIDs are deterministic so tests can reference them directly.
-- Run via: npx supabase db reset

-- ─── Staff ────────────────────────────────────────────────────────────────────
-- Roles: 1 admin, 2 teachers, 1 headteacher, 1 secretary
INSERT INTO staff (id, email, first_name, last_name, role, contact_number) VALUES
  ('00000000-0000-0000-0000-000000000001', 'admin@test.hshb.local',       'Alice',   'Admin',      'admin',       '07700000001'),
  ('00000000-0000-0000-0000-000000000002', 'teacher@test.hshb.local',     'Tom',     'Teacher',    'teacher',     '07700000002'),
  ('00000000-0000-0000-0000-000000000003', 'teacher2@test.hshb.local',    'Sarah',   'Teacher',    'teacher',     '07700000003'),
  ('00000000-0000-0000-0000-000000000004', 'headteacher@test.hshb.local', 'Helen',   'Headteacher','headteacher', '07700000004'),
  ('00000000-0000-0000-0000-000000000005', 'secretary@test.hshb.local',   'Sandra',  'Secretary',  'secretary',   '07700000005');

-- ─── Academic Years ───────────────────────────────────────────────────────────
-- The migration's own backfill already created rows for these two codes
-- (with random ids) since the classes/fee_plans tables are empty on a fresh
-- reset; replace them with deterministic ids so tests can reference them.
-- The year containing CURRENT_DATE is current; the previous year exists so
-- prior-year fixtures (finance) have somewhere to point.
DELETE FROM academic_years;
INSERT INTO academic_years (id, code, start_date, end_date, is_current) VALUES
  ('05000000-0000-0000-0000-000000000001', '2026-27', '2026-09-01', '2027-08-31', TRUE),
  ('05000000-0000-0000-0000-000000000002', '2025-26', '2025-09-01', '2026-08-31', FALSE);

-- ─── Classes ──────────────────────────────────────────────────────────────────
-- Alpha → teacher1, Beta → teacher2, Gamma → headteacher. All in the current year.
INSERT INTO classes (id, name, year_group, room_number, teacher_id, academic_year_id) VALUES
  ('10000000-0000-0000-0000-000000000001', 'Alpha', 'Year 1', 'R1', '00000000-0000-0000-0000-000000000002', '05000000-0000-0000-0000-000000000001'),
  ('10000000-0000-0000-0000-000000000002', 'Beta',  'Year 2', 'R2', '00000000-0000-0000-0000-000000000003', '05000000-0000-0000-0000-000000000001'),
  ('10000000-0000-0000-0000-000000000003', 'Gamma', 'Year 3', 'R3', '00000000-0000-0000-0000-000000000004', '05000000-0000-0000-0000-000000000001');

-- ─── Guardians ────────────────────────────────────────────────────────────────
-- Greg deliberately has no occupation: the column is nullable and existing rows
-- predate it, so the UI must cope with it being absent.
INSERT INTO guardians (id, first_name, last_name, phone, email, occupation) VALUES
  ('20000000-0000-0000-0000-000000000001', 'Gary',  'AliceGuardian', '07711000001', 'gary.alice@example.com', 'Bus driver'),
  ('20000000-0000-0000-0000-000000000002', 'Grace', 'BobGuardian',   '07711000002', 'grace.bob@example.com',  'Pharmacist'),
  ('20000000-0000-0000-0000-000000000003', 'Greg',  'CarolGuardian', '07711000003', 'greg.carol@example.com', NULL);

-- ─── Students ─────────────────────────────────────────────────────────────────
-- Alice + Bob in Alpha, Carol in Beta
INSERT INTO students (id, first_name, last_name, address_line_1, city, postcode,
                      primary_guardian_id, allergies, medical_details) VALUES
  ('30000000-0000-0000-0000-000000000001', 'Alice', 'Student', '1 Test St', 'London', 'N1 1AA',
   '20000000-0000-0000-0000-000000000001', 'Peanuts', 'Asthma'),
  ('30000000-0000-0000-0000-000000000002', 'Bob',   'Student', '2 Test St', 'London', 'N1 1AB',
   '20000000-0000-0000-0000-000000000002', NULL, NULL),
  ('30000000-0000-0000-0000-000000000003', 'Carol', 'Student', '3 Test St', 'London', 'N1 1AC',
   '20000000-0000-0000-0000-000000000003', NULL, NULL);

-- ─── Student Classes ──────────────────────────────────────────────────────────
INSERT INTO student_classes (id, student_id, class_id) VALUES
  ('40000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001'), -- Alice → Alpha
  ('40000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001'), -- Bob   → Alpha
  ('40000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000002'); -- Carol → Beta

-- ─── Timetable Slots ──────────────────────────────────────────────────────────
INSERT INTO timetable_slots (id, class_id, day_of_week, start_time, end_time, subject) VALUES
  ('50000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Saturday', '10:00', '11:00', 'Maths'),
  ('50000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', 'Saturday', '11:00', '12:00', 'Greek'),
  ('50000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000003', 'Sunday',   '10:00', '11:00', 'History');

-- ─── Incidents ────────────────────────────────────────────────────────────────
INSERT INTO incidents (id, type, student_id, title, description, incident_date, created_by) VALUES
  ('60000000-0000-0000-0000-000000000001', 'medical',   '30000000-0000-0000-0000-000000000001',
   'Allergic reaction', 'Alice had a mild allergic reaction in class.', NOW() - INTERVAL '2 days',
   '00000000-0000-0000-0000-000000000002'),
  ('60000000-0000-0000-0000-000000000002', 'behaviour', '30000000-0000-0000-0000-000000000002',
   'Disruptive in class', 'Bob was disruptive during the lesson.', NOW() - INTERVAL '1 day',
   '00000000-0000-0000-0000-000000000002');

-- ─── Lesson Plans ─────────────────────────────────────────────────────────────
INSERT INTO lesson_plans (id, class_id, lesson_date, description, created_by) VALUES
  ('70000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001',
   CURRENT_DATE, 'Introduction to addition and subtraction.',
   '00000000-0000-0000-0000-000000000002');

-- ─── Registration Submissions ──────────────────────────────────────────────────
-- One pending (with a primary contact) and one rejected, so the inbox has rows
-- on first `supabase db reset`. E2E tests create their own rows and only read these.
INSERT INTO registration_submissions (id, status, child_first_name, child_last_name, date_of_birth,
                      address_line_1, city, postcode, consent_privacy_notice,
                      consent_emergency_first_aid, declaration_name, rejected_reason) VALUES
  ('80000000-0000-0000-0000-000000000001', 'pending', 'Seed', 'Pending', '2020-01-15',
   '1 Seed St', 'London', 'N1 2AA', TRUE, TRUE, 'Petra Pending', NULL),
  ('80000000-0000-0000-0000-000000000002', 'rejected', 'Seed', 'Rejected', '2020-02-20',
   '2 Seed St', 'London', 'N1 2AB', TRUE, TRUE, 'Rhonda Rejected', 'Duplicate');

INSERT INTO registration_submission_contacts (id, submission_id, contact_role, first_name, last_name, phone, email, occupation) VALUES
  ('81000000-0000-0000-0000-000000000001', '80000000-0000-0000-0000-000000000001', 'primary', 'Petra', 'Pending', '07722000001', 'petra.pending@example.com', 'Software engineer'),
  ('81000000-0000-0000-0000-000000000002', '80000000-0000-0000-0000-000000000002', 'primary', 'Rhonda', 'Rejected', '07722000002', 'rhonda.rejected@example.com', 'Accountant');

-- ─── Photo Consent Opt-Outs ─────────────────────────────────────────────────────
-- One pending request for Alice Student, so the admin review UI has a row on
-- first `supabase db reset`. E2E tests create their own rows.
INSERT INTO photo_consent_opt_outs (id, status, child_first_name, child_last_name, date_of_birth, declaration_name) VALUES
  ('82000000-0000-0000-0000-000000000001', 'pending', 'Alice', 'Student', '2015-06-01', 'Gary AliceGuardian');

-- ─── Finance ──────────────────────────────────────────────────────────────────
-- One fee plan covering Alpha + Beta, Alice on a monthly plan with one payment,
-- and a payroll record for Tom. E2E tests create their own rows and only read these.
INSERT INTO fee_plans (id, name, academic_year_id, full_year_amount, monthly_instalment_amount, termly_instalment_amount) VALUES
  ('90000000-0000-0000-0000-000000000001', 'Standard', '05000000-0000-0000-0000-000000000001', 800.00, 100.00, 266.67);

INSERT INTO fee_plan_classes (id, fee_plan_id, class_id) VALUES
  ('91000000-0000-0000-0000-000000000001', '90000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001'),
  ('91000000-0000-0000-0000-000000000002', '90000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002');

INSERT INTO student_fee_accounts (id, student_id, academic_year_id, payment_plan) VALUES
  ('92000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', '05000000-0000-0000-0000-000000000001', 'monthly');

INSERT INTO student_payments (id, student_id, amount, payment_date, reference, method, recorded_by, academic_year_id) VALUES
  ('93000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 100.00, '2026-09-01', 'SEED-001', 'bank_transfer', '00000000-0000-0000-0000-000000000001', '05000000-0000-0000-0000-000000000001');

INSERT INTO staff_payroll (id, staff_id, payment_funding, payroll_ref) VALUES
  ('94000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', 'school', 'PR-002');
