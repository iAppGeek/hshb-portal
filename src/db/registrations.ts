import { unstable_cache, revalidateTag } from 'next/cache'

import type { Database, Enums, Tables } from '@/types/database'

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

export async function createRegistrationSubmission({
  submission,
  contacts,
}: CreateRegistrationInput): Promise<{ id: string }> {
  const { data, error } = await supabase
    .from('registration_submissions')
    .insert(submission)
    .select('id')
    .single()
  if (error) throw error

  const { error: contactsError } = await supabase
    .from('registration_submission_contacts')
    .insert(contacts.map((c) => ({ ...c, submission_id: data.id })))
  if (contactsError) {
    await supabase.from('registration_submissions').delete().eq('id', data.id)
    throw contactsError
  }

  revalidateTag('registrations', 'max')
  return { id: data.id }
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
}

export async function approveRegistration({
  submissionId,
  staffId,
  studentCode,
  classId,
  existingStudentId,
}: ApproveRegistrationInput): Promise<string> {
  const { data, error } = await supabase.rpc('approve_registration', {
    p_submission_id: submissionId,
    p_staff_id: staffId,
    p_student_code: studentCode ?? undefined,
    p_class_id: classId ?? undefined,
    p_existing_student_id: existingStudentId ?? undefined,
  } as Database['public']['Functions']['approve_registration']['Args'])
  if (error) throw error
  revalidateTag('registrations', 'max')
  revalidateTag('students', 'max')
  revalidateTag('classes', 'max')
  return data as string
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
  revalidateTag('registrations', 'max')
}

export async function deleteRegistrationSubmission(id: string): Promise<void> {
  const { data, error } = await supabase
    .from('registration_submissions')
    .delete()
    .eq('id', id)
    .neq('status', 'actioned')
    .select('id')
  if (error) throw error
  if (!data?.length)
    throw new Error('Submission not found or cannot be deleted once actioned')
  revalidateTag('registrations', 'max')
}
