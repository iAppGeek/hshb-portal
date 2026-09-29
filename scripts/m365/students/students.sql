-- Builds the student list for the Microsoft 365 student account scripts.
-- Run by fetch-students.sh; returns a single JSON document (see README.md).
-- Read-only: selects student ids, codes, names and current classes, class
-- names/year groups, class teachers' school email (for Team owners), and
-- inactive students' codes and names (to explain unlinked accounts).
-- Which year groups need an account is decided in config.psd1, not here.

with
current_years as (
  select id, code from academic_years where is_current
),

-- Active classes in the current academic year.
year_classes as (
  select c.id, btrim(c.name) as name, btrim(c.year_group) as year_group,
         lower(btrim(coalesce(t.email, ''))) as teacher_email
  from classes c
  join current_years y on y.id = c.academic_year_id
  left join staff t on t.id = c.teacher_id
  where c.active
),

-- Current enrolments: start_date inclusive, end_date exclusive, null = open
-- (same rule as src/lib/enrolment.ts).
enrolments as (
  select sc.student_id, sc.class_id
  from student_classes sc
  join year_classes yc on yc.id = sc.class_id
  where sc.start_date <= public.today_london()
    and (sc.end_date is null or sc.end_date > public.today_london())
),

active_students as (
  select st.id,
         nullif(btrim(coalesce(st.student_code, '')), '') as code,
         btrim(coalesce(st.first_name, '')) as first_name,
         btrim(coalesce(st.last_name, '')) as last_name
  from students st
  where st.active
),

valid_students as (
  select * from active_students where first_name <> '' and last_name <> ''
)

select json_build_object(
  'version', 1,
  'generatedAt', now(),
  'currentYearCount', (select count(*) from current_years),
  'academicYear', (select json_build_object('id', id, 'code', code) from current_years limit 1),
  'classes', coalesce((
    select json_agg(json_build_object(
      'id', id, 'name', name, 'yearGroup', year_group, 'teacherEmail', nullif(teacher_email, '')
    ) order by year_group, name)
    from year_classes
  ), '[]'::json),
  'students', coalesce((
    select json_agg(json_build_object(
      'id', s.id, 'code', s.code, 'firstName', s.first_name, 'lastName', s.last_name,
      'classIds', coalesce((
        select json_agg(e.class_id order by e.class_id) from enrolments e where e.student_id = s.id
      ), '[]'::json)
    ) order by s.code nulls last, s.last_name, s.first_name, s.id)
    from valid_students s
  ), '[]'::json),
  -- Codes of students who are no longer active, so the sync can tell a
  -- leaver's account apart from an account it doesn't recognise.
  'inactiveCodes', coalesce((
    select json_agg(distinct btrim(st.student_code))
    from students st
    where not st.active and nullif(btrim(coalesce(st.student_code, '')), '') is not null
  ), '[]'::json),
  -- Inactive students' names too, to say why an unlinked Microsoft 365
  -- account exists ("student has left").
  'inactiveStudents', coalesce((
    select json_agg(json_build_object(
      'code', nullif(btrim(coalesce(st.student_code, '')), ''),
      'firstName', btrim(coalesce(st.first_name, '')),
      'lastName', btrim(coalesce(st.last_name, ''))
    ) order by st.last_name, st.first_name, st.id)
    from students st
    where not st.active
  ), '[]'::json),
  'skipped', coalesce((
    select json_agg(json_build_object('reason', 'missing first or last name', 'count', n))
    from (select count(*) as n from active_students where first_name = '' or last_name = '') t
    where n > 0
  ), '[]'::json),
  -- Codes of the active students skipped above, so their accounts aren't
  -- mistaken for orphans.
  'skippedCodes', coalesce((
    select json_agg(code order by code)
    from active_students
    where (first_name = '' or last_name = '') and code is not null
  ), '[]'::json)
) as data;
