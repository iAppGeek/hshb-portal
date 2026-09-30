import postgres from 'postgres'

/**
 * The local Supabase Postgres, for fixtures and assertions — the same
 * DATABASE_URL the app under test uses. Tagged-template SQL:
 *   const [row] = await sql`select active from students where id = ${id}`
 * `date` and `timestamptz` values come back as the text Postgres prints
 * (`2026-09-01`), not as `Date`s; `numeric` values come back as strings.
 */
export const sql = postgres(
  process.env.DATABASE_URL ??
    'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
  {
    max: 2,
    idle_timeout: 5,
    onnotice: () => {},
    transform: { undefined: null },
    types: {
      date: {
        to: 1184,
        from: [1082, 1114, 1184],
        serialize: (value: unknown) =>
          value instanceof Date ? value.toISOString() : value,
        parse: (value: string) => value,
      },
    },
  },
)

/** Inserts `row` into `table` and returns the new row's id. */
export async function insertRow(
  table: string,
  row: Record<string, unknown>,
): Promise<string> {
  const [{ id }] = await sql<{ id: string }[]>`
    insert into ${sql(table)} ${sql(row)} returning id`
  return id
}

/** Inserts `rows` (all with the same columns) and returns their ids in order. */
export async function insertRows(
  table: string,
  rows: Record<string, unknown>[],
): Promise<string[]> {
  const inserted = await sql<{ id: string }[]>`
    insert into ${sql(table)} ${sql(rows)} returning id`
  return inserted.map((row) => row.id)
}

// Known seed UUIDs for reliable assertions
export const SEED_IDS = {
  staff: {
    admin: '00000000-0000-0000-0000-000000000001',
    teacher: '00000000-0000-0000-0000-000000000002',
    teacher2: '00000000-0000-0000-0000-000000000003',
    headteacher: '00000000-0000-0000-0000-000000000004',
    secretary: '00000000-0000-0000-0000-000000000005',
  },
  classes: {
    alpha: '10000000-0000-0000-0000-000000000001',
    beta: '10000000-0000-0000-0000-000000000002',
    gamma: '10000000-0000-0000-0000-000000000003',
  },
  guardians: {
    // Gary is Alice's primary guardian and Bob's secondary guardian — the
    // different-primary-guardians case for the family view.
    gary: '20000000-0000-0000-0000-000000000001',
    grace: '20000000-0000-0000-0000-000000000002',
    greg: '20000000-0000-0000-0000-000000000003',
  },
  students: {
    alice: '30000000-0000-0000-0000-000000000001',
    bob: '30000000-0000-0000-0000-000000000002',
    carol: '30000000-0000-0000-0000-000000000003',
  },
  incidents: {
    medical: '60000000-0000-0000-0000-000000000001',
    behaviour: '60000000-0000-0000-0000-000000000002',
  },
  lessonPlan: {
    alpha: '70000000-0000-0000-0000-000000000001',
  },
  registrations: {
    pending: '80000000-0000-0000-0000-000000000001',
    rejected: '80000000-0000-0000-0000-000000000002',
  },
  academicYears: {
    current: '05000000-0000-4000-8000-000000000001',
    previous: '05000000-0000-4000-8000-000000000002',
  },
} as const

export async function deleteStaffByEmail(email: string): Promise<void> {
  await sql`delete from staff where email = ${email}`
}

export async function deleteClassByName(name: string): Promise<void> {
  await sql`delete from classes where name = ${name}`
}

// Inserts a pending registration submission with a primary contact, for
// review/approval E2E tests. Give child_last_name (and contact_last_name /
// contact_email, since approveRegistration de-dupes guardians by email) a
// project-unique suffix so parallel projects don't share a guardian row.
export async function createRegistrationSubmission(
  overrides: {
    child_first_name?: string
    child_last_name?: string
    date_of_birth?: string
    contact_last_name?: string
    contact_email?: string
    contact_occupation?: string
  } = {},
): Promise<{ id: string }> {
  const id = await insertRow('registration_submissions', {
    child_first_name: overrides.child_first_name ?? 'E2E',
    child_last_name: overrides.child_last_name ?? 'Fixture',
    date_of_birth: overrides.date_of_birth ?? '2020-01-01',
    english_school_name: 'Fixture Primary',
    address_line_1: '1 Fixture St',
    city: 'London',
    postcode: 'N1 1AA',
    privacy_notice_read: true,
    first_aid_consent: true,
    declaration_name: 'E2E Parent',
  })

  await insertRow('registration_submission_contacts', {
    submission_id: id,
    contact_role: 'primary',
    first_name: 'E2E',
    last_name: overrides.contact_last_name ?? 'Parent',
    phone: '07700 900000',
    email: overrides.contact_email ?? 'e2e.parent@example.com',
    occupation: overrides.contact_occupation ?? 'Engineer',
  })

  return { id }
}

export async function deleteRegistrationSubmissionsByChildLastName(
  lastName: string,
): Promise<void> {
  await sql`delete from registration_submissions where child_last_name = ${lastName}`
}

// Inserts a pending photo opt-out request directly, for review tests that do
// not need to go through the public form (the apply test does).
export async function createPhotoOptOut(
  childLastName: string,
): Promise<{ id: string }> {
  const id = await insertRow('photo_consent_opt_outs', {
    child_first_name: 'E2E',
    child_last_name: childLastName,
    date_of_birth: '2016-03-10',
    declaration_name: 'E2E Parent',
  })
  return { id }
}

export async function deletePhotoOptOutsByChildLastName(
  lastName: string,
): Promise<void> {
  await sql`delete from photo_consent_opt_outs where child_last_name = ${lastName}`
}

export async function deleteStudentsByLastName(
  lastName: string,
): Promise<void> {
  await sql`delete from students where last_name = ${lastName}`
}

// Links in fee_plan_classes cascade with the plan.
export async function deleteFeePlansByName(name: string): Promise<void> {
  await sql`delete from fee_plans where name = ${name}`
}

// Restores the seeded current year after a test that switches it. Two
// updates, like the app's setCurrentAcademicYear, so the one-current partial
// unique index never sees two current years.
export async function setCurrentAcademicYear(id: string): Promise<void> {
  await sql.begin(async (tx) => {
    await tx`update academic_years set is_current = false where is_current and id <> ${id}`
    await tx`update academic_years set is_current = true where id = ${id}`
  })
}

// Classes/fee plans/payments referencing this year must be deleted first
// (ON DELETE RESTRICT).
export async function deleteAcademicYearByCode(code: string): Promise<void> {
  await sql`delete from academic_years where code = ${code}`
}
