-- job_role was added defaulting to admin_assistant. Teachers and the
-- headteacher hold the Teacher job role.
UPDATE "staff_payroll" AS p
SET "job_role" = 'teacher'
FROM "staff" AS s
WHERE s."id" = p."staff_id"
  AND s."role" IN ('teacher', 'headteacher');
