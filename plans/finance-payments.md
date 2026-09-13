# Finance — Staff Payroll & Compliance, Student Fees, Fee Plans (hshb-portal)

**Goal:** Give admins one place to record how staff are paid and whether their credentials are verified, how each student pays their fees and whether they are up to date, and the fee plans those amounts come from. All of it lives in **new tables** and **new pages** under a single **Finance** section. Nothing new appears on the existing Staff, Students or Classes pages, with one deliberate exception: **staff title**.

---

## 0. Decisions (confirmed with the owner, 13 Sep 2026)

| #   | Decision                 | Outcome                                                                                                                                                                                                                                                           |
| --- | ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Navigation**           | One sidebar item **Finance** at `/finance`, with tabs: **Staff**, **Students**, **Fee Plans**. Detail pages sit under `/finance/staff/[id]`, `/finance/students/[id]`, `/finance/fee-plans/…`.                                                                    |
| 2   | **Access**               | **Admin only**, view and edit. New `canManageFinance()` permission. Nav item hidden, pages redirect to `/dashboard`, `proxy.ts` redirects too, every server action checks it.                                                                                     |
| 3   | **Up to date**           | **Computed from the plan schedule.** Monthly = 8 instalments due 1 Sep – 1 Apr; Termly = 3 due 1 Sep / 1 Jan / 1 Apr; Yearly = full amount due 1 Sep. Academic year comes from the fee plan. Custom = manual toggle.                                              |
| 4   | **Plan linking**         | **Derived from class membership, with a per-student override.** A class belongs to at most one fee plan. If a student's classes map to more than one plan the page shows all of them and flags it; the override resolves it.                                      |
| 5   | **Plan amounts**         | Fee plan stores `full_year_amount`, `monthly_instalment_amount`, `termly_instalment_amount`. The student's payment plan picks which applies. Custom uses a per-student `custom_total_amount` + notes.                                                             |
| 6   | **Academic year**        | Fee plan has `name` + `academic_year` (e.g. `2025-26`). Only classes in that academic year can be attached. Lets next year's plans be set up early.                                                                                                               |
| 7   | **Custom plan**          | Admin enters an agreed total and explains the arrangement in notes. "Up to date" is a manual checkbox for custom plans.                                                                                                                                           |
| 8   | **Bank details**         | Stored **plain** (DB is service-role only), **validated** (sort code 6 digits, account 8 digits), plus account holder name. List shows last four digits only; the edit page masks them with an **eye toggle** to reveal. Audit log records "changed", not values. |
| 9   | **ID + right to work**   | ID type dropdown (Passport, Driving licence, BRP, Birth certificate, Other), verified-by auto-recorded. Separate **right to work** checked + date.                                                                                                                |
| 10  | **DBS**                  | Verified flag, certificate reference, issue date, verification date, **level** (Enhanced / Standard / Basic), **barred list checked**, **Update Service enrolled**, **renewal due** (defaults to issue + 3 years, editable). Past-due rows are highlighted.       |
| 11  | **First aid / fire**     | Certified flag, issue date, verification date, reference, **expiry date**. List flags expired or expiring within 60 days.                                                                                                                                         |
| 12  | **Payments**             | Amount, date, reference (required) + **method** (bank transfer / cash / card / other) + optional notes. `recorded_by` auto-set. **Delete only**, no edit. Everything audit logged.                                                                                |
| 13  | **Title**                | New `staff.title` column, required, DB default `Ms` so existing rows are backfilled. Free text. Shown on the **Staff list and add/edit forms only**. Names elsewhere are unchanged.                                                                               |
| 14  | **Staff finance record** | **Lazy.** Finance › Staff lists every staff member with "No record" until an admin saves one. Payment Funding is required on that first save. Deleting a staff member cascades.                                                                                   |
| 15  | **Student list**         | All active students with filters by class / payment plan / status and a per-student page for plan, override, notes and payments.                                                                                                                                  |
| 16  | **Audit**                | Existing `audit_log` + `logAuditEvent`. Bank fields redacted.                                                                                                                                                                                                     |

---

## 1. Repo realities

| Fact (verified)                                                                                                   | Consequence                                                                                                                    |
| ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `src/db/client.ts` connects as `service_role`; new tables get RLS via the prod `rls_auto_enable` event trigger.   | Migration enables RLS explicitly for local parity and grants to `service_role`. No policies needed.                            |
| `staff.role` uses `text` + `CHECK`, not an enum.                                                                  | New enumerations use the same pattern so the Zod enums are the single source of allowed values.                                |
| `set_updated_at()` trigger function exists.                                                                       | Reused on every new table with an `updated_at`.                                                                                |
| `src/types/database.ts` is generated. The gentypes skill targets the linked prod project.                         | Migration is applied locally and types are generated with `--local`. Header comment kept as-is. Prod push is the owner's call. |
| `/admin` uses a `?tab=` query param with a `Link`-based tab bar.                                                  | `/finance` copies that pattern.                                                                                                |
| `ActionResult` is `{ error: string } \| void`; actions redirect on success.                                       | All new actions follow it.                                                                                                     |
| `src/security.spec.ts` requires every `'use server'` file to `await auth()` and bans `@/db` in client components. | Forms are client components that receive server actions; data loading happens in server pages/tabs.                            |
| Coverage thresholds: 75% lines / 68% branches / 65% functions.                                                    | Every new module ships with a spec.                                                                                            |

---

## 2. Schema (`supabase/migrations/20260913120000_finance_payments.sql`)

```text
staff                       + title text NOT NULL DEFAULT 'Ms'

staff_payroll               1:1 staff (staff_id UNIQUE, ON DELETE CASCADE)
  payment_funding           text NOT NULL  CHECK (kea | school)
  bank_account_name, bank_sort_code (6 digits), bank_account_number (8 digits), payroll_ref
  id_verified bool, id_verified_at date, id_type CHECK (passport|driving_licence|brp|birth_certificate|other), id_verified_by → staff
  right_to_work_checked bool, right_to_work_checked_at date
  dbs_verified bool, dbs_level CHECK (enhanced|standard|basic), dbs_barred_list_checked bool,
  dbs_update_service bool, dbs_reference, dbs_issue_date, dbs_verified_at, dbs_renewal_due, dbs_verified_by → staff
  first_aid_certified bool, first_aid_issue_date, first_aid_verified_at, first_aid_expiry_date, first_aid_reference
  fire_warden_certified bool, fire_warden_issue_date, fire_warden_verified_at, fire_warden_expiry_date, fire_warden_reference
  CHECKs: verified/certified = true ⇒ its reference + issue date + verification date (and id_type / dbs_level) NOT NULL
  created_at, updated_at (trigger)

fee_plans                   name, academic_year, full_year_amount, monthly_instalment_amount,
                            termly_instalment_amount numeric(10,2) ≥ 0, notes, active, timestamps
                            UNIQUE (name, academic_year)
fee_plan_classes            fee_plan_id → fee_plans CASCADE, class_id → classes CASCADE, UNIQUE (class_id)

student_fee_accounts        1:1 student (student_id UNIQUE, CASCADE)
  payment_plan              CHECK (monthly|termly|yearly|custom) NULL
  payment_plan_notes, fee_plan_override_id → fee_plans SET NULL,
  custom_total_amount numeric(10,2), custom_up_to_date bool, timestamps

student_payments            student_id → students CASCADE, amount numeric(10,2) > 0, payment_date date,
                            reference text, method CHECK (bank_transfer|cash|card|other), notes,
                            recorded_by → staff SET NULL, created_at
```

---

## 3. Fee status rules (`src/lib/fees.ts`, pure and unit-tested)

- `academicYearStart('2025-26')` → `2025-09-01`.
- Due dates: monthly `[1 Sep … 1 Apr]` (8), termly `[1 Sep, 1 Jan, 1 Apr]`, yearly `[1 Sep]`.
- `dueToDate = instalmentAmount × instalmentsWhoseDueDate ≤ today`, capped at the year total.
- `paidToDate = Σ payments`.
- Status: `no_plan` (no payment plan or no resolvable fee plan) · `paid_in_full` (paid ≥ year total) · `up_to_date` (paid ≥ due) · `behind` (paid < due). Custom: `custom_up_to_date ? up_to_date : behind`, or `paid_in_full` when paid ≥ custom total.
- `resolveFeePlan(override, classPlans)`: override wins; else the single plan across the student's classes; multiple distinct plans ⇒ `conflict` and the UI asks for an override.

---

## 4. Files

```text
src/lib/permissions.ts                         + canManageFinance
src/lib/PERMISSIONS.md                         + Finance row
src/lib/fees.ts (+spec)                        schedule + status + plan resolution + money formatting
src/lib/schemas.ts (+spec)                     title on staff; staffPayrollSchema; feePlanSchema;
                                               studentFeeAccountSchema; studentPaymentSchema
src/db/staff.ts                                title in select/insert/update
src/db/staff-payroll.ts (+spec)                get list / get by staff / upsert
src/db/fee-plans.ts (+spec)                    list / get / create / update / class links
src/db/student-fees.ts (+spec)                 accounts + payments
src/db/index.ts                                exports
src/db/audit-log.ts                            no change (entity names are free text)
src/app/layout.tsx, _components/PortalSidebar  Finance nav item (BanknotesIcon)
src/proxy.ts (+spec)                           /finance gated to admin
src/app/staff/page.tsx, new/, [id]/edit/       Title column + field
src/app/finance/page.tsx (+spec)               tab switch
src/app/finance/_components/FinanceTabBar      tabs
src/app/finance/_components/SecretField        eye-toggle reveal (client)
src/app/finance/_tabs/staff/StaffPayrollTab    list with compliance flags
src/app/finance/_tabs/students/StudentFeesTab  list with status + filters (client table)
src/app/finance/_tabs/fee-plans/FeePlansTab    list
src/app/finance/staff/[id]/                    page + StaffPayrollForm + actions
src/app/finance/students/[id]/                 page + StudentFeesForm + PaymentForm + actions
src/app/finance/fee-plans/new/, [id]/edit/     page + FeePlanForm + actions
e2e/fixtures/seed.ts                           cleanup helpers
e2e/tests/finance/finance.e2e.ts               admin flow; non-admin redirect
e2e/tests/permissions/entitlements.e2e.ts      /finance rule
e2e/tests/navigation/sidebar.e2e.ts            Finance visible to admin only
supabase/seed.sql                              one fee plan + one payment so the tabs have rows
```

---

## 5. Out of scope (tracked, not built)

- Parent-facing statements or reminders.
- Exporting payroll data to a provider.
- Encrypting bank details at rest (owner chose plain storage; service-role-only DB).
- Editing a payment record (delete + re-add instead).

---

## 6. Handover status (updated 13 Sep 2026)

Branch: `feat/finance-payments` (uncommitted). The migration is applied to the **local** DB only — pushing it to prod is the owner's call.

### Done

- [x] Requirements clarified with the owner (section 0 is the full record; do not re-ask).
- [x] Migration `20260913120000_finance_payments.sql` (tables, constraints, grants) plus a `save_fee_plan` RPC that writes a plan and replaces its class links in one transaction. The RPC was applied to the local DB directly; a fresh `supabase db reset` applies the whole file.
- [x] Seed: fee plan `9000…0001` (Alpha + Beta), Alice on a monthly plan with one £100 payment, payroll row for Tom.
- [x] Types regenerated with `--local`; original header and the `__InternalSupabase` block restored by hand (local codegen drops it).
- [x] `canManageFinance` (admin only) in permissions, `PERMISSIONS.md`, `proxy.ts` and every page/action.
- [x] Staff `title` on schema, `src/db/staff.ts`, add/edit forms and the Staff list.
- [x] Schemas: `staffPayrollSchema`, `feePlanSchema`, `studentFeeAccountSchema`, `studentPaymentSchema`.
- [x] Pure helpers: `src/lib/fees.ts`, `src/lib/compliance.ts`, `src/lib/audit-redaction.ts`.
- [x] DB modules: `staff-payroll.ts`, `fee-plans.ts` (RPC-backed saves), `student-fees.ts` (pages payments past the 1000-row cap).
- [x] Finance nav item; "Refresh data" also clears `staff-payroll`, `fee-plans`, `student-fees`.
- [x] Pages: `/finance` (Staff / Students / Fee Plans tabs), `/finance/staff/[id]`, `/finance/students/[id]`, `/finance/fee-plans/new`, `/finance/fee-plans/[id]/edit`. All actions audit-logged; bank fields logged as `[changed]` / `[unchanged]`.
- [x] Payroll form: ticking a verified/certified/checked box makes that group's details required in the browser.
- [x] Vitest specs for every new module; E2E `finance/finance.e2e.ts`, `/finance` rules in `entitlements.e2e.ts`, Finance item in `sidebar.e2e.ts`.

### Decisions made during the build

- **Paid this year** counts only payments dated inside the resolved fee plan's academic year (1 Sep – 31 Aug). With no resolvable plan, every payment counts. Payments outside the year are tagged "Other year" on the student page.
- **Plan resolution** uses active classes and active fee plans only. An inactive plan can still be chosen as an override.
- **Once all instalment dates have passed** the full-year amount is due, so rounded termly amounts (3 × £266.67) never over- or under-charge.
- **Bank details:** entering any one bank field requires all three.
- **Academic year** accepts `2025/26` or `2025-26` and is stored as `2025-26`; classes in either format match.
- **Fee plan names** must be unique per academic year (case-insensitive check in the action, backed by the DB unique constraint).
- **Mobile:** finance table header `sr-only` labels sit in `relative` cells (an unpositioned one widened the page to ~900px), and the mobile drawer nav scrolls so the footer stays reachable.

### Remaining

- [ ] Commit and open a PR.
- [ ] Owner: push the migration to prod, then regenerate types from prod to confirm they match.
