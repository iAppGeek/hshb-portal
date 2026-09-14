-- A class's academic year is fixed once it is created. Moving a class between
-- years would leave it on another year's fee plan and change which of its
-- registers are editable. Class migration creates a new class instead.

CREATE OR REPLACE FUNCTION "public"."prevent_class_academic_year_change"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF NEW.academic_year_id IS DISTINCT FROM OLD.academic_year_id THEN
    RAISE EXCEPTION 'A class''s academic year cannot be changed';
  END IF;
  RETURN NEW;
END;
$$;

ALTER FUNCTION "public"."prevent_class_academic_year_change"() OWNER TO "postgres";

CREATE OR REPLACE TRIGGER "classes_academic_year_immutable" BEFORE UPDATE OF "academic_year_id" ON "public"."classes" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_class_academic_year_change"();
