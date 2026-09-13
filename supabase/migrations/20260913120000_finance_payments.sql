-- Finance: staff payroll & compliance, student fee accounts, fee plans.
-- See plans/finance-payments.md for the decisions behind every column.
--
-- Everything here is admin-only in the app (canManageFinance). The DB is only
-- ever reached as service_role, so RLS is enabled with no policies, matching
-- the rest of the schema. Allowed values use text + CHECK (like staff.role) so
-- the Zod enums in src/lib/schemas.ts stay the single source of truth.

-- ─── Staff title ──────────────────────────────────────────────────────────────
-- Free text for now. DB default backfills every existing row with 'Ms'.
ALTER TABLE "public"."staff" ADD COLUMN "title" "text" DEFAULT 'Ms'::"text" NOT NULL;

-- ─── Staff payroll & compliance ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "public"."staff_payroll" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "staff_id" "uuid" NOT NULL,
    "payment_funding" "text" NOT NULL,
    "bank_account_name" "text",
    "bank_sort_code" "text",
    "bank_account_number" "text",
    "payroll_ref" "text",
    "id_verified" boolean DEFAULT false NOT NULL,
    "id_verified_at" "date",
    "id_type" "text",
    "id_verified_by" "uuid",
    "right_to_work_checked" boolean DEFAULT false NOT NULL,
    "right_to_work_checked_at" "date",
    "dbs_verified" boolean DEFAULT false NOT NULL,
    "dbs_level" "text",
    "dbs_barred_list_checked" boolean DEFAULT false NOT NULL,
    "dbs_update_service" boolean DEFAULT false NOT NULL,
    "dbs_reference" "text",
    "dbs_issue_date" "date",
    "dbs_verified_at" "date",
    "dbs_renewal_due" "date",
    "dbs_verified_by" "uuid",
    "first_aid_certified" boolean DEFAULT false NOT NULL,
    "first_aid_issue_date" "date",
    "first_aid_verified_at" "date",
    "first_aid_expiry_date" "date",
    "first_aid_reference" "text",
    "fire_warden_certified" boolean DEFAULT false NOT NULL,
    "fire_warden_issue_date" "date",
    "fire_warden_verified_at" "date",
    "fire_warden_expiry_date" "date",
    "fire_warden_reference" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "staff_payroll_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "staff_payroll_staff_id_key" UNIQUE ("staff_id"),
    CONSTRAINT "staff_payroll_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE CASCADE,
    CONSTRAINT "staff_payroll_id_verified_by_fkey" FOREIGN KEY ("id_verified_by") REFERENCES "public"."staff"("id") ON DELETE SET NULL,
    CONSTRAINT "staff_payroll_dbs_verified_by_fkey" FOREIGN KEY ("dbs_verified_by") REFERENCES "public"."staff"("id") ON DELETE SET NULL,
    CONSTRAINT "staff_payroll_payment_funding_check" CHECK (("payment_funding" = ANY (ARRAY['kea'::"text", 'school'::"text"]))),
    CONSTRAINT "staff_payroll_bank_sort_code_check" CHECK (("bank_sort_code" IS NULL) OR ("bank_sort_code" ~ '^[0-9]{6}$')),
    CONSTRAINT "staff_payroll_bank_account_number_check" CHECK (("bank_account_number" IS NULL) OR ("bank_account_number" ~ '^[0-9]{8}$')),
    CONSTRAINT "staff_payroll_id_type_check" CHECK (("id_type" IS NULL) OR ("id_type" = ANY (ARRAY['passport'::"text", 'driving_licence'::"text", 'brp'::"text", 'birth_certificate'::"text", 'other'::"text"]))),
    CONSTRAINT "staff_payroll_dbs_level_check" CHECK (("dbs_level" IS NULL) OR ("dbs_level" = ANY (ARRAY['enhanced'::"text", 'standard'::"text", 'basic'::"text"]))),
    -- A verified/certified flag must be backed by the details that prove it.
    CONSTRAINT "staff_payroll_id_verified_details_check" CHECK ((NOT "id_verified") OR (("id_verified_at" IS NOT NULL) AND ("id_type" IS NOT NULL))),
    CONSTRAINT "staff_payroll_dbs_verified_details_check" CHECK ((NOT "dbs_verified") OR (("dbs_reference" IS NOT NULL) AND ("dbs_issue_date" IS NOT NULL) AND ("dbs_verified_at" IS NOT NULL) AND ("dbs_level" IS NOT NULL))),
    CONSTRAINT "staff_payroll_first_aid_details_check" CHECK ((NOT "first_aid_certified") OR (("first_aid_reference" IS NOT NULL) AND ("first_aid_issue_date" IS NOT NULL) AND ("first_aid_verified_at" IS NOT NULL))),
    CONSTRAINT "staff_payroll_fire_warden_details_check" CHECK ((NOT "fire_warden_certified") OR (("fire_warden_reference" IS NOT NULL) AND ("fire_warden_issue_date" IS NOT NULL) AND ("fire_warden_verified_at" IS NOT NULL)))
);

ALTER TABLE "public"."staff_payroll" OWNER TO "postgres";
ALTER TABLE "public"."staff_payroll" ENABLE ROW LEVEL SECURITY;
CREATE INDEX "staff_payroll_staff_id_idx" ON "public"."staff_payroll" USING "btree" ("staff_id");
CREATE OR REPLACE TRIGGER "staff_payroll_updated_at" BEFORE UPDATE ON "public"."staff_payroll" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();

-- ─── Fee plans ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "public"."fee_plans" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "academic_year" "text" NOT NULL,
    "full_year_amount" numeric(10,2) NOT NULL,
    "monthly_instalment_amount" numeric(10,2) NOT NULL,
    "termly_instalment_amount" numeric(10,2) NOT NULL,
    "notes" "text",
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "fee_plans_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "fee_plans_name_academic_year_key" UNIQUE ("name", "academic_year"),
    CONSTRAINT "fee_plans_full_year_amount_check" CHECK (("full_year_amount" >= 0)),
    CONSTRAINT "fee_plans_monthly_instalment_amount_check" CHECK (("monthly_instalment_amount" >= 0)),
    CONSTRAINT "fee_plans_termly_instalment_amount_check" CHECK (("termly_instalment_amount" >= 0))
);

ALTER TABLE "public"."fee_plans" OWNER TO "postgres";
ALTER TABLE "public"."fee_plans" ENABLE ROW LEVEL SECURITY;
CREATE INDEX "fee_plans_academic_year_idx" ON "public"."fee_plans" USING "btree" ("academic_year");
CREATE OR REPLACE TRIGGER "fee_plans_updated_at" BEFORE UPDATE ON "public"."fee_plans" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();

-- A class belongs to at most one fee plan (decision 4).
CREATE TABLE IF NOT EXISTS "public"."fee_plan_classes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "fee_plan_id" "uuid" NOT NULL,
    "class_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "fee_plan_classes_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "fee_plan_classes_class_id_key" UNIQUE ("class_id"),
    CONSTRAINT "fee_plan_classes_fee_plan_id_fkey" FOREIGN KEY ("fee_plan_id") REFERENCES "public"."fee_plans"("id") ON DELETE CASCADE,
    CONSTRAINT "fee_plan_classes_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE CASCADE
);

ALTER TABLE "public"."fee_plan_classes" OWNER TO "postgres";
ALTER TABLE "public"."fee_plan_classes" ENABLE ROW LEVEL SECURITY;
CREATE INDEX "fee_plan_classes_fee_plan_id_idx" ON "public"."fee_plan_classes" USING "btree" ("fee_plan_id");

-- ─── Student fee accounts & payments ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "public"."student_fee_accounts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "student_id" "uuid" NOT NULL,
    "payment_plan" "text",
    "payment_plan_notes" "text",
    "fee_plan_override_id" "uuid",
    "custom_total_amount" numeric(10,2),
    "custom_up_to_date" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "student_fee_accounts_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "student_fee_accounts_student_id_key" UNIQUE ("student_id"),
    CONSTRAINT "student_fee_accounts_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE CASCADE,
    CONSTRAINT "student_fee_accounts_fee_plan_override_id_fkey" FOREIGN KEY ("fee_plan_override_id") REFERENCES "public"."fee_plans"("id") ON DELETE SET NULL,
    CONSTRAINT "student_fee_accounts_payment_plan_check" CHECK (("payment_plan" IS NULL) OR ("payment_plan" = ANY (ARRAY['monthly'::"text", 'termly'::"text", 'yearly'::"text", 'custom'::"text"]))),
    CONSTRAINT "student_fee_accounts_custom_total_amount_check" CHECK (("custom_total_amount" IS NULL) OR ("custom_total_amount" >= 0))
);

ALTER TABLE "public"."student_fee_accounts" OWNER TO "postgres";
ALTER TABLE "public"."student_fee_accounts" ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE TRIGGER "student_fee_accounts_updated_at" BEFORE UPDATE ON "public"."student_fee_accounts" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();

CREATE TABLE IF NOT EXISTS "public"."student_payments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "student_id" "uuid" NOT NULL,
    "amount" numeric(10,2) NOT NULL,
    "payment_date" "date" NOT NULL,
    "reference" "text" NOT NULL,
    "method" "text" NOT NULL,
    "notes" "text",
    "recorded_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "student_payments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "student_payments_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE CASCADE,
    CONSTRAINT "student_payments_recorded_by_fkey" FOREIGN KEY ("recorded_by") REFERENCES "public"."staff"("id") ON DELETE SET NULL,
    CONSTRAINT "student_payments_amount_check" CHECK (("amount" > 0)),
    CONSTRAINT "student_payments_method_check" CHECK (("method" = ANY (ARRAY['bank_transfer'::"text", 'cash'::"text", 'card'::"text", 'other'::"text"])))
);

ALTER TABLE "public"."student_payments" OWNER TO "postgres";
ALTER TABLE "public"."student_payments" ENABLE ROW LEVEL SECURITY;
CREATE INDEX "student_payments_student_id_idx" ON "public"."student_payments" USING "btree" ("student_id");
CREATE INDEX "student_payments_payment_date_idx" ON "public"."student_payments" USING "btree" ("payment_date" DESC);

-- ─── Grants ───────────────────────────────────────────────────────────────────
GRANT ALL ON TABLE "public"."staff_payroll" TO "service_role";
GRANT ALL ON TABLE "public"."fee_plans" TO "service_role";
GRANT ALL ON TABLE "public"."fee_plan_classes" TO "service_role";
GRANT ALL ON TABLE "public"."student_fee_accounts" TO "service_role";
GRANT ALL ON TABLE "public"."student_payments" TO "service_role";

-- ─── Save a fee plan atomically ───────────────────────────────────────────────
-- Writes the plan and replaces its class links in one transaction, so a failed
-- link (e.g. a class already on another plan) never leaves a half-saved plan.
-- p_id NULL creates a plan; otherwise the plan is updated. Returns the plan id.
CREATE OR REPLACE FUNCTION "public"."save_fee_plan"("p_id" "uuid", "p_name" "text", "p_academic_year" "text", "p_full_year_amount" numeric, "p_monthly_instalment_amount" numeric, "p_termly_instalment_amount" numeric, "p_notes" "text", "p_active" boolean, "p_class_ids" "uuid"[]) RETURNS "uuid"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_id UUID;
BEGIN
  IF p_id IS NULL THEN
    INSERT INTO fee_plans (name, academic_year, full_year_amount, monthly_instalment_amount, termly_instalment_amount, notes, active)
    VALUES (p_name, p_academic_year, p_full_year_amount, p_monthly_instalment_amount, p_termly_instalment_amount, p_notes, p_active)
    RETURNING id INTO v_id;
  ELSE
    UPDATE fee_plans
    SET name = p_name,
        academic_year = p_academic_year,
        full_year_amount = p_full_year_amount,
        monthly_instalment_amount = p_monthly_instalment_amount,
        termly_instalment_amount = p_termly_instalment_amount,
        notes = p_notes,
        active = p_active
    WHERE id = p_id
    RETURNING id INTO v_id;
    IF v_id IS NULL THEN
      RAISE EXCEPTION 'Fee plan not found.';
    END IF;
    DELETE FROM fee_plan_classes WHERE fee_plan_id = v_id;
  END IF;

  INSERT INTO fee_plan_classes (fee_plan_id, class_id)
  SELECT v_id, class_id FROM unnest(COALESCE(p_class_ids, ARRAY[]::uuid[])) AS class_id;

  RETURN v_id;

EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'A fee plan with this name already exists for this academic year, or a selected class is already on another plan.';
  WHEN foreign_key_violation THEN
    RAISE EXCEPTION 'One of the selected classes no longer exists.';
END;
$$;

ALTER FUNCTION "public"."save_fee_plan"("p_id" "uuid", "p_name" "text", "p_academic_year" "text", "p_full_year_amount" numeric, "p_monthly_instalment_amount" numeric, "p_termly_instalment_amount" numeric, "p_notes" "text", "p_active" boolean, "p_class_ids" "uuid"[]) OWNER TO "postgres";
REVOKE ALL ON FUNCTION "public"."save_fee_plan"("p_id" "uuid", "p_name" "text", "p_academic_year" "text", "p_full_year_amount" numeric, "p_monthly_instalment_amount" numeric, "p_termly_instalment_amount" numeric, "p_notes" "text", "p_active" boolean, "p_class_ids" "uuid"[]) FROM PUBLIC, "anon", "authenticated";
GRANT ALL ON FUNCTION "public"."save_fee_plan"("p_id" "uuid", "p_name" "text", "p_academic_year" "text", "p_full_year_amount" numeric, "p_monthly_instalment_amount" numeric, "p_termly_instalment_amount" numeric, "p_notes" "text", "p_active" boolean, "p_class_ids" "uuid"[]) TO "service_role";
