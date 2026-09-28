import 'server-only'

import { and, count, desc, eq } from 'drizzle-orm'

import { isUuid } from '@/lib/uuid'
import type { Database, Json } from '@/types/database'

import { toSnake, type Snake } from './casing'
import { db, supabase } from './client'
import {
  contactRole,
  registrationSubmissions,
  submissionStatus,
  type RegistrationSubmission,
  type RegistrationSubmissionContact,
} from './schema'

export type RegistrationStatus = (typeof submissionStatus.enumValues)[number]
export type ContactRole = (typeof contactRole.enumValues)[number]

type SubmissionRow = Snake<RegistrationSubmission>
type ContactRow = Snake<RegistrationSubmissionContact>

export type RegistrationSummary = SubmissionRow & {
  primary_contact: Pick<
    ContactRow,
    'first_name' | 'last_name' | 'phone' | 'email'
  > | null
}

export type RegistrationFull = SubmissionRow & {
  contacts: ContactRow[]
}

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
  return { id: data as string }
}

export async function getRegistrationSubmissions(
  status: RegistrationStatus | 'all',
): Promise<RegistrationSummary[]> {
  const rows = await db.query.registrationSubmissions.findMany({
    with: {
      contacts: {
        where: (c, { eq }) => eq(c.contactRole, 'primary'),
        columns: { firstName: true, lastName: true, phone: true, email: true },
      },
    },
    where:
      status === 'all' ? undefined : eq(registrationSubmissions.status, status),
    orderBy: desc(registrationSubmissions.submittedAt),
  })
  return rows.map(({ contacts, ...submission }) => ({
    ...toSnake(submission),
    primary_contact: contacts[0] ? toSnake(contacts[0]) : null,
  }))
}

export async function getPendingRegistrationCount(): Promise<number> {
  const [{ n }] = await db
    .select({ n: count() })
    .from(registrationSubmissions)
    .where(eq(registrationSubmissions.status, 'pending'))
  return n
}

export async function getRegistrationSubmissionById(
  id: string,
): Promise<RegistrationFull | null> {
  // A malformed id finds nothing, rather than failing the uuid cast.
  if (!isUuid(id)) return null

  const row = await db.query.registrationSubmissions.findFirst({
    where: eq(registrationSubmissions.id, id),
    with: { contacts: true },
  })
  return row ? toSnake(row) : null
}

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
  const rows = await db
    .update(registrationSubmissions)
    .set({
      status: 'rejected',
      rejectedReason: reason,
      actionedBy: staffId,
      actionedAt: new Date().toISOString(),
    })
    .where(
      and(
        eq(registrationSubmissions.id, submissionId),
        eq(registrationSubmissions.status, 'pending'),
      ),
    )
    .returning({ id: registrationSubmissions.id })
  if (rows.length === 0)
    throw new Error('Submission not found or already actioned')
}

export async function deleteRegistrationSubmission(id: string): Promise<void> {
  const rows = await db
    .delete(registrationSubmissions)
    .where(eq(registrationSubmissions.id, id))
    .returning({ id: registrationSubmissions.id })
  if (rows.length === 0) throw new Error('Submission not found')
}
