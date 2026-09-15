-- Verifies the enrolment-history SQL functions added in
-- 20260916120000_enrolment_history.sql against the seed data. Run against a
-- freshly reset local database (uses psql meta-commands, which `supabase db
-- query` does not support, so run via the local postgres container):
--   supabase db reset
--   docker exec -i supabase_db_hshb psql -U postgres -d postgres < supabase/scripts/verify_enrolment_history.sql
-- Each block runs inside BEGIN … ROLLBACK so it never mutates the seed for
-- the next block, and RAISEs on the first failed assertion (aborting that
-- block's transaction, which ROLLBACK then makes explicit).

\set ON_ERROR_STOP on

-- Seed ids used below (see supabase/seed.sql):
--   academic_years: 2026-27 (current) 05000000-0000-4000-8000-000000000001
--                   2025-26           05000000-0000-4000-8000-000000000002
--   classes: Alpha 10000000-0000-0000-0000-000000000001 (Alice, Bob)
--            Beta  10000000-0000-0000-0000-000000000002 (Carol)
--            Gamma 10000000-0000-0000-0000-000000000003 (empty, headteacher)
--   students: Alice 30000000-0000-0000-0000-000000000001
--             Bob   30000000-0000-0000-0000-000000000002
--             Carol 30000000-0000-0000-0000-000000000003
--   staff: teacher2 00000000-0000-0000-0000-000000000003 (Beta)

-- ─── 1. close_enrolments on a future-starting row ───────────────────────────
BEGIN;
DO $$
DECLARE
  v_id uuid;
  v_row student_classes%ROWTYPE;
BEGIN
  INSERT INTO student_classes (student_id, class_id, start_date)
  VALUES ('30000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', today_london() + 30)
  RETURNING id INTO v_id;

  PERFORM close_enrolments(ARRAY[v_id], today_london());

  SELECT * INTO v_row FROM student_classes WHERE id = v_id;
  IF v_row.end_date <> v_row.start_date THEN
    RAISE EXCEPTION 'FAIL 1: expected end_date = start_date, got start=% end=%', v_row.start_date, v_row.end_date;
  END IF;
END $$;
ROLLBACK;

-- ─── 2. set_enrolments class mode ────────────────────────────────────────────
BEGIN;
DO $$
DECLARE
  v_bob_row student_classes%ROWTYPE;
  v_carol_row student_classes%ROWTYPE;
  v_alice_open boolean;
BEGIN
  -- Alpha currently has Alice + Bob open. Set to [Alice, Carol]: Bob closes,
  -- Carol is inserted, Alice is untouched.
  PERFORM set_enrolments(NULL, '10000000-0000-0000-0000-000000000001',
    ARRAY['30000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000003']::uuid[]);

  SELECT * INTO v_bob_row FROM student_classes
    WHERE student_id = '30000000-0000-0000-0000-000000000002' AND class_id = '10000000-0000-0000-0000-000000000001';
  IF v_bob_row.end_date IS NULL THEN
    RAISE EXCEPTION 'FAIL 2: Bob (unticked) should have been closed';
  END IF;

  SELECT * INTO v_carol_row FROM student_classes
    WHERE student_id = '30000000-0000-0000-0000-000000000003' AND class_id = '10000000-0000-0000-0000-000000000001' AND end_date IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'FAIL 2: Carol (ticked) should have a new open row';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM student_classes
    WHERE id = '40000000-0000-0000-0000-000000000001' AND end_date IS NULL
  ) INTO v_alice_open;
  IF NOT v_alice_open THEN
    RAISE EXCEPTION 'FAIL 2: Alice (unchanged) row should be untouched and still open';
  END IF;

  -- Completed class raises.
  UPDATE classes SET active = false WHERE id = '10000000-0000-0000-0000-000000000002';
  BEGIN
    PERFORM set_enrolments(NULL, '10000000-0000-0000-0000-000000000002', ARRAY[]::uuid[]);
    RAISE EXCEPTION 'FAIL 2: completed class should have raised';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'Completed classes%' THEN RAISE; END IF;
  END;
END $$;
ROLLBACK;

-- ─── 3. set_enrolments student mode ──────────────────────────────────────────
BEGIN;
DO $$
DECLARE
  v_alice_alpha_open boolean;
  v_alice_beta_open boolean;
BEGIN
  -- Move Alice from Alpha to Beta.
  PERFORM set_enrolments('30000000-0000-0000-0000-000000000001', NULL,
    ARRAY['10000000-0000-0000-0000-000000000002']::uuid[]);

  SELECT EXISTS (
    SELECT 1 FROM student_classes
    WHERE id = '40000000-0000-0000-0000-000000000001' AND end_date IS NULL
  ) INTO v_alice_alpha_open;
  IF v_alice_alpha_open THEN
    RAISE EXCEPTION 'FAIL 3: Alice''s Alpha row should have closed';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM student_classes
    WHERE student_id = '30000000-0000-0000-0000-000000000001' AND class_id = '10000000-0000-0000-0000-000000000002' AND end_date IS NULL
  ) INTO v_alice_beta_open;
  IF NOT v_alice_beta_open THEN
    RAISE EXCEPTION 'FAIL 3: Alice should have a new open row in Beta';
  END IF;

  -- Inactive student raises.
  UPDATE students SET active = false, leaving_reason = 'left' WHERE id = '30000000-0000-0000-0000-000000000002';
  BEGIN
    PERFORM set_enrolments('30000000-0000-0000-0000-000000000002', NULL, ARRAY[]::uuid[]);
    RAISE EXCEPTION 'FAIL 3: inactive student should have raised';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'Leavers can''t be enrolled%' THEN RAISE; END IF;
  END;
END $$;
ROLLBACK;

-- ─── 4. set_enrolments class mode on a future-year class ────────────────────
BEGIN;
DO $$
DECLARE
  v_future_year_id uuid;
  v_future_class_id uuid;
  v_row student_classes%ROWTYPE;
BEGIN
  INSERT INTO academic_years (code, start_date, end_date)
  VALUES ('2027-28', '2027-09-01', '2028-08-31')
  RETURNING id INTO v_future_year_id;

  INSERT INTO classes (name, year_group, room_number, teacher_id, academic_year_id, active)
  VALUES ('Future Class', 'Year 1', 'R9', '00000000-0000-0000-0000-000000000003', v_future_year_id, true)
  RETURNING id INTO v_future_class_id;

  PERFORM set_enrolments(NULL, v_future_class_id, ARRAY['30000000-0000-0000-0000-000000000003']::uuid[]);

  SELECT * INTO v_row FROM student_classes
    WHERE class_id = v_future_class_id AND student_id = '30000000-0000-0000-0000-000000000003';
  IF v_row.start_date <> '2027-09-01' THEN
    RAISE EXCEPTION 'FAIL 4: expected start_date 2027-09-01, got %', v_row.start_date;
  END IF;
END $$;
ROLLBACK;

-- ─── 5. mark_student_as_leaver ───────────────────────────────────────────────
BEGIN;
DO $$
DECLARE
  v_open_count int;
  v_reason text;
BEGIN
  PERFORM mark_student_as_leaver('30000000-0000-0000-0000-000000000001', 'graduated');

  SELECT count(*) INTO v_open_count FROM student_classes
    WHERE student_id = '30000000-0000-0000-0000-000000000001' AND end_date IS NULL;
  IF v_open_count <> 0 THEN
    RAISE EXCEPTION 'FAIL 5: expected all rows closed, % still open', v_open_count;
  END IF;

  SELECT leaving_reason INTO v_reason FROM students WHERE id = '30000000-0000-0000-0000-000000000001';
  IF v_reason <> 'graduated' THEN
    RAISE EXCEPTION 'FAIL 5: expected leaving_reason graduated, got %', v_reason;
  END IF;

  BEGIN
    PERFORM mark_student_as_leaver('30000000-0000-0000-0000-000000000001', 'left');
    RAISE EXCEPTION 'FAIL 5: second call should have raised';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'This student has already left.%' THEN RAISE; END IF;
  END;
END $$;
ROLLBACK;

-- ─── 6. migrate_class ─────────────────────────────────────────────────────────
BEGIN;
DO $$
DECLARE
  v_next_year_id uuid;
  v_result json;
  v_new_class_id uuid;
  v_moved_open boolean;
  v_bob_active boolean;
  v_carol_active boolean;
  v_carol_reason text;
BEGIN
  INSERT INTO academic_years (code, start_date, end_date)
  VALUES ('2027-28', '2027-09-01', '2028-08-31')
  RETURNING id INTO v_next_year_id;

  -- Alpha has Alice + Bob open. Alice moves, Bob is a leaver.
  v_result := migrate_class(
    '10000000-0000-0000-0000-000000000001',
    jsonb_build_object(
      '30000000-0000-0000-0000-000000000001', 'move',
      '30000000-0000-0000-0000-000000000002', 'graduated'
    ),
    v_next_year_id, 'Alpha 2', 'Year 2', 'R1', '00000000-0000-0000-0000-000000000002'
  );

  v_new_class_id := (v_result->>'new_class_id')::uuid;
  IF v_new_class_id IS NULL THEN
    RAISE EXCEPTION 'FAIL 6: expected a new class to be created';
  END IF;
  IF (v_result->>'moved')::int <> 1 OR (v_result->>'leavers')::int <> 1 THEN
    RAISE EXCEPTION 'FAIL 6: expected moved=1 leavers=1, got %', v_result;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM student_classes
    WHERE student_id = '30000000-0000-0000-0000-000000000001' AND class_id = v_new_class_id AND end_date IS NULL
  ) INTO v_moved_open;
  IF NOT v_moved_open THEN
    RAISE EXCEPTION 'FAIL 6: Alice should have an open row in the new class';
  END IF;

  SELECT active INTO v_bob_active FROM students WHERE id = '30000000-0000-0000-0000-000000000002';
  IF v_bob_active THEN
    RAISE EXCEPTION 'FAIL 6: Bob should be an inactive leaver';
  END IF;

  IF (SELECT active FROM classes WHERE id = '10000000-0000-0000-0000-000000000001') THEN
    RAISE EXCEPTION 'FAIL 6: source class should be inactive';
  END IF;

  -- Without a new class: "no class" + one leaver on Beta (Carol only).
  v_result := migrate_class(
    '10000000-0000-0000-0000-000000000002',
    jsonb_build_object('30000000-0000-0000-0000-000000000003', 'transferred')
  );
  IF (v_result->>'new_class_id') IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL 6: expected no new class';
  END IF;
  SELECT active, leaving_reason INTO v_carol_active, v_carol_reason
    FROM students WHERE id = '30000000-0000-0000-0000-000000000003';
  IF v_carol_active OR v_carol_reason <> 'transferred' THEN
    RAISE EXCEPTION 'FAIL 6: expected Carol transferred, got active=% reason=%', v_carol_active, v_carol_reason;
  END IF;

  -- A `move` action without a new class raises.
  UPDATE students SET active = true, leaving_reason = NULL WHERE id = '30000000-0000-0000-0000-000000000003';
  INSERT INTO student_classes (student_id, class_id, start_date)
    VALUES ('30000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000003', today_london());
  BEGIN
    PERFORM migrate_class(
      '10000000-0000-0000-0000-000000000003',
      jsonb_build_object('30000000-0000-0000-0000-000000000003', 'move')
    );
    RAISE EXCEPTION 'FAIL 6: move without a new class should have raised';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'Students can only move%' THEN RAISE; END IF;
  END;

  -- Stale action map (missing a current open member) raises.
  BEGIN
    PERFORM migrate_class('10000000-0000-0000-0000-000000000003', '{}'::jsonb);
    RAISE EXCEPTION 'FAIL 6: stale action map should have raised';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'The class changed since the form was loaded%' THEN RAISE; END IF;
  END;

  -- Close date: today when before year end (Gamma, current year, holding
  -- Carol from the setup above).
  v_result := migrate_class(
    '10000000-0000-0000-0000-000000000003',
    jsonb_build_object('30000000-0000-0000-0000-000000000003', 'none')
  );
  IF (v_result->>'new_class_id') IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL 6: expected no new class for Gamma';
  END IF;

  -- Close date: year end + 1 when the source year has already ended
  -- (simulated with a fresh past-year class).
  DECLARE
    v_past_class_id uuid;
    v_past_row_id uuid;
    v_close_row student_classes%ROWTYPE;
  BEGIN
    INSERT INTO classes (name, year_group, room_number, teacher_id, academic_year_id, active)
    VALUES ('Past Class', 'Year 1', 'R8', '00000000-0000-0000-0000-000000000003',
            '05000000-0000-4000-8000-000000000002', true)
    RETURNING id INTO v_past_class_id;

    INSERT INTO student_classes (student_id, class_id, start_date)
    VALUES ('30000000-0000-0000-0000-000000000001', v_past_class_id, '2025-09-01')
    RETURNING id INTO v_past_row_id;

    PERFORM migrate_class(v_past_class_id, jsonb_build_object('30000000-0000-0000-0000-000000000001', 'none'));

    SELECT * INTO v_close_row FROM student_classes WHERE id = v_past_row_id;
    IF v_close_row.end_date <> '2026-09-01' THEN
      RAISE EXCEPTION 'FAIL 6: expected close date 2026-09-01 (year end + 1), got %', v_close_row.end_date;
    END IF;
  END;
END $$;
ROLLBACK;

-- ─── 7. approve_registration ──────────────────────────────────────────────────
BEGIN;
DO $$
DECLARE
  v_submission_id uuid;
  v_result json;
  v_student_id uuid;
  v_row student_classes%ROWTYPE;
BEGIN
  INSERT INTO registration_submissions (
    id, status, child_first_name, child_last_name, date_of_birth,
    address_line_1, city, postcode, consent_privacy_notice, consent_emergency_first_aid, declaration_name
  ) VALUES (
    gen_random_uuid(), 'pending', 'Verify', 'New', '2020-01-01',
    '1 Verify St', 'London', 'N1 9ZZ', true, true, 'Verify Parent'
  ) RETURNING id INTO v_submission_id;

  INSERT INTO registration_submission_contacts (submission_id, contact_role, first_name, last_name, phone, email)
  VALUES (v_submission_id, 'primary', 'Verify', 'Parent', '07700099999', 'verify.parent@example.com');

  v_result := approve_registration(v_submission_id, '00000000-0000-0000-0000-000000000001',
    'VER-001', '10000000-0000-0000-0000-000000000001');
  v_student_id := (v_result->>'student_id')::uuid;

  SELECT * INTO v_row FROM student_classes
    WHERE student_id = v_student_id AND class_id = '10000000-0000-0000-0000-000000000001' AND end_date IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'FAIL 7: new student should have an open row in the class';
  END IF;

  -- Returning leaver into a class they previously left.
  UPDATE students SET active = false, leaving_reason = 'left' WHERE id = v_student_id;
  PERFORM close_enrolments(ARRAY[v_row.id], today_london());

  INSERT INTO registration_submissions (
    id, status, child_first_name, child_last_name, date_of_birth,
    address_line_1, city, postcode, consent_privacy_notice, consent_emergency_first_aid, declaration_name
  ) VALUES (
    gen_random_uuid(), 'pending', 'Verify', 'New', '2020-01-01',
    '1 Verify St', 'London', 'N1 9ZZ', true, true, 'Verify Parent'
  ) RETURNING id INTO v_submission_id;

  INSERT INTO registration_submission_contacts (submission_id, contact_role, first_name, last_name, phone, email)
  VALUES (v_submission_id, 'primary', 'Verify', 'Parent', '07700099999', 'verify.parent@example.com');

  PERFORM approve_registration(v_submission_id, '00000000-0000-0000-0000-000000000001',
    NULL, '10000000-0000-0000-0000-000000000001', v_student_id);

  IF (SELECT active FROM students WHERE id = v_student_id) IS NOT TRUE THEN
    RAISE EXCEPTION 'FAIL 7: returning student should be active';
  END IF;
  IF (SELECT leaving_reason FROM students WHERE id = v_student_id) IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL 7: returning student should have leaving_reason cleared';
  END IF;

  IF (SELECT count(*) FROM student_classes
      WHERE student_id = v_student_id AND class_id = '10000000-0000-0000-0000-000000000001' AND end_date IS NULL) <> 1 THEN
    RAISE EXCEPTION 'FAIL 7: expected exactly one new open row for the returning student';
  END IF;
END $$;
ROLLBACK;

-- ─── 8. student_classes_one_open ──────────────────────────────────────────────
BEGIN;
DO $$
BEGIN
  BEGIN
    INSERT INTO student_classes (student_id, class_id, start_date)
    VALUES ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', today_london());
    RAISE EXCEPTION 'FAIL 8: second open row for the same student+class should have violated the unique index';
  EXCEPTION WHEN unique_violation THEN
    NULL;
  END;
END $$;
ROLLBACK;

\echo 'All enrolment-history checks passed.'
