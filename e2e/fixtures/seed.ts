import { createClient } from '@supabase/supabase-js'

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321'
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''

export const db = createClient(supabaseUrl, supabaseKey)

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
} as const

export async function deleteStudentsByEmail(emails: string[]): Promise<void> {
  await db.from('students').delete().in('email', emails)
}

export async function deleteStaffByEmail(email: string): Promise<void> {
  await db.from('staff').delete().eq('email', email)
}

export async function deleteClassByName(name: string): Promise<void> {
  await db.from('classes').delete().eq('name', name)
}

export async function deleteIncidentsByTitle(title: string): Promise<void> {
  await db.from('incidents').delete().eq('title', title)
}

export async function deleteLessonPlansByClassAndDate(
  classId: string,
  date: string,
): Promise<void> {
  await db
    .from('lesson_plans')
    .delete()
    .eq('class_id', classId)
    .eq('lesson_date', date)
}

// Inserts a pending registration submission with a primary contact, for
// review/approval E2E tests. Give child_last_name (and contact_last_name /
// contact_email, since approve_registration de-dupes guardians by email) a
// project-unique suffix so parallel projects don't share a guardian row.
export async function createRegistrationSubmission(
  overrides: {
    child_first_name?: string
    child_last_name?: string
    date_of_birth?: string
    contact_last_name?: string
    contact_email?: string
  } = {},
): Promise<{ id: string }> {
  const { data: submission, error } = await db
    .from('registration_submissions')
    .insert({
      child_first_name: overrides.child_first_name ?? 'E2E',
      child_last_name: overrides.child_last_name ?? 'Fixture',
      date_of_birth: overrides.date_of_birth ?? '2020-01-01',
      address_line_1: '1 Fixture St',
      city: 'London',
      postcode: 'N1 1AA',
      consent_privacy_notice: true,
      consent_emergency_first_aid: true,
      declaration_name: 'E2E Parent',
    })
    .select('id')
    .single()
  if (error) throw error

  await db.from('registration_submission_contacts').insert({
    submission_id: submission.id,
    contact_role: 'primary',
    first_name: 'E2E',
    last_name: overrides.contact_last_name ?? 'Parent',
    phone: '07700 900000',
    email: overrides.contact_email ?? 'e2e.parent@example.com',
  })

  return submission
}

export async function deleteRegistrationSubmissionsByChildLastName(
  lastName: string,
): Promise<void> {
  await db
    .from('registration_submissions')
    .delete()
    .eq('child_last_name', lastName)
}

export async function deletePhotoOptOutsByChildLastName(
  lastName: string,
): Promise<void> {
  await db
    .from('photo_consent_opt_outs')
    .delete()
    .eq('child_last_name', lastName)
}
