import { unstable_cache, updateTag } from 'next/cache'

import type { Database, Enums, Json, Tables } from '@/types/database'

import { supabase } from './client'

export type RegistrationStatus = Enums<'submission_status'>
export type ContactRole = Enums<'contact_role'>

export type RegistrationSummary = Tables<'registration_submissions'> & {
  primary_contact: Pick<
    Tables<'registration_submission_contacts'>,
    'first_name' | 'last_name' | 'phone' | 'email'
  > | null
}

export type RegistrationFull = Tables<'registration_submissions'> & {
  contacts: Tables<'registration_submission_contacts'>[]
}

const SUMMARY_SELECT = `
  *,
  primary_contact:registration_submission_contacts(first_name, last_name, phone, email)
`

const OPTS = { revalidate: 60, tags: ['registrations'] }

type CreateRegistrationInput = {
  submission: Database['public']['Tables']['registration_submissions']['Insert']
  contacts: Omit<
    Database['public']['Tables']['registration_submission_contacts']['Insert'],
    'submission_id'
  >[]
}

// Inserts the submission and its contacts via a single RPC so the two writes
// are atomic — the inbox can never contain a submission without a primary
// contact, even if a later write in the request were to fail.
export async function createRegistrationSubmission({
  submission,
  contacts,
}: CreateRegistrationInput): Promise<{ id: string }> {
  const { data, error } = await supabase.rpc('create_registration_submission', {
    p_submission: submission as Json,
    p_contacts: contacts as Json,
  })
  if (error) throw error
  updateTag('registrations')
  return { id: data as string }
}

export const getRegistrationSubmissions = unstable_cache(
  async (
    status: RegistrationStatus | 'all',
  ): Promise<RegistrationSummary[]> => {
    let query = supabase
      .from('registration_submissions')
      .select(SUMMARY_SELECT)
      .eq('registration_submission_contacts.contact_role', 'primary')
      .order('submitted_at', { ascending: false })
    if (status !== 'all') {
      query = query.eq('status', status)
    }
    const { data } = await query
    return (data ?? []).map((row) => ({
      ...row,
      primary_contact: row.primary_contact?.[0] ?? null,
    })) as RegistrationSummary[]
  },
  ['registration-submissions'],
  OPTS,
)

export const getPendingRegistrationCount = unstable_cache(
  async (): Promise<number> => {
    const { count } = await supabase
      .from('registration_submissions')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending')
    return count ?? 0
  },
  ['pending-registration-count'],
  OPTS,
)

export const getRegistrationSubmissionById = unstable_cache(
  async (id: string): Promise<RegistrationFull | null> => {
    const { data: submission } = await supabase
      .from('registration_submissions')
      .select('*')
      .eq('id', id)
      .single()
    if (!submission) return null

    const { data: contacts } = await supabase
      .from('registration_submission_contacts')
      .select('*')
      .eq('submission_id', id)

    return { ...submission, contacts: contacts ?? [] }
  },
  ['registration-submission-by-id'],
  OPTS,
)

type ApproveRegistrationInput = {
  submissionId: string
  staffId: string
  studentCode: string | null
  classId: string | null
  existingStudentId: string | null
  reuseGuardians: boolean
}

export type GuardianChange = {
  contact_role: ContactRole
  guardian_id: string
  reused: boolean
  matched_on: 'email' | 'phone' | null
  changes: Record<string, { old: string | null; new: string | null }>
}

export type ApproveRegistrationResult = {
  student_id: string
  linked_existing: boolean
  guardians: GuardianChange[]
  student_changes: Record<string, { old: string | null; new: string | null }>
}

export async function approveRegistration({
  submissionId,
  staffId,
  studentCode,
  classId,
  existingStudentId,
  reuseGuardians,
}: ApproveRegistrationInput): Promise<ApproveRegistrationResult> {
  const { data, error } = await supabase.rpc('approve_registration', {
    p_submission_id: submissionId,
    p_staff_id: staffId,
    p_student_code: studentCode ?? undefined,
    p_class_id: classId ?? undefined,
    p_existing_student_id: existingStudentId ?? undefined,
    p_reuse_guardians: reuseGuardians,
  } as Database['public']['Functions']['approve_registration']['Args'])
  if (error) throw error
  updateTag('registrations')
  updateTag('students')
  updateTag('classes')
  return data as ApproveRegistrationResult
}

type RejectRegistrationInput = {
  submissionId: string
  staffId: string
  reason: string
}

export async function rejectRegistration({
  submissionId,
  staffId,
  reason,
}: RejectRegistrationInput): Promise<void> {
  const { data, error } = await supabase
    .from('registration_submissions')
    .update({
      status: 'rejected',
      rejected_reason: reason,
      actioned_by: staffId,
      actioned_at: new Date().toISOString(),
    })
    .eq('id', submissionId)
    .eq('status', 'pending')
    .select('id')
  if (error) throw error
  if (!data?.length) throw new Error('Submission not found or already actioned')
  updateTag('registrations')
}

export async function deleteRegistrationSubmission(id: string): Promise<void> {
  const { data, error } = await supabase
    .from('registration_submissions')
    .delete()
    .eq('id', id)
    .select('id')
  if (error) throw error
  if (!data?.length) throw new Error('Submission not found')
  updateTag('registrations')
}
