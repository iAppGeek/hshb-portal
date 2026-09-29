-- Right to work needs the National Insurance number, and HR keeps the staff
-- member's home address alongside their payroll record.
ALTER TABLE "public"."staff_payroll"
    ADD COLUMN "national_insurance_number" "text",
    ADD COLUMN "address_line_1" "text",
    ADD COLUMN "address_line_2" "text",
    ADD COLUMN "city" "text",
    ADD COLUMN "postcode" "text",
    -- An address is either absent or has its line 1, city and postcode.
    ADD CONSTRAINT "staff_payroll_address_details_check" CHECK (
        (("address_line_1" IS NULL) AND ("address_line_2" IS NULL) AND ("city" IS NULL) AND ("postcode" IS NULL))
        OR (("address_line_1" IS NOT NULL) AND ("city" IS NOT NULL) AND ("postcode" IS NOT NULL))
    );
