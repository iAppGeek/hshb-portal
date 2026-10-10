-- Registers taken before attendance_registers existed have attendance rows but
-- no register row. One row per (class, date), stamped from the marks.
INSERT INTO "attendance_registers" ("class_id", "date", "created_at", "updated_at", "updated_by")
SELECT "class_id",
       "date",
       min("created_at"),
       max("updated_at"),
       (array_agg("recorded_by" ORDER BY "updated_at" DESC))[1]
FROM "attendance"
GROUP BY "class_id", "date";
