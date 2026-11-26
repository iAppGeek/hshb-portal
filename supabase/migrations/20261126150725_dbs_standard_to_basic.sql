-- "Standard" and "basic" DBS checks are now one level, called basic. Runs
-- before the next migration narrows staff_payroll_dbs_level_check.
UPDATE "staff_payroll" SET "dbs_level" = 'basic' WHERE "dbs_level" = 'standard';
