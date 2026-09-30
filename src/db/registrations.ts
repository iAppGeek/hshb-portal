import 'server-only'

import { and, asc, count, desc, eq, isNull } from 'drizzle-orm'

import { todayInSchoolTz } from '@/lib/datetime'
import { asDbError, DbError } from '@/lib/db-error'
import { isUuid } from '@/lib/uuid'

import { snakeKey, toCamel, toSnake, type Snake } from './casing'
import { db, type Tx } from './client'
import { isClassOpen } from './enrolments'
import { findGuardianMatches } from './guardians'
import {
  contactRole,
  guardians,
  registrationSubmissionContacts,
  registrationSubmissions,
  studentClasses,
  students,
  submissionStatus,
  type Guardian,
  type NewRegistrationSubmission,
  type NewRegistrationSubmissionContact,
  type RegistrationSubmission,
  type RegistrationSubmissionContact,
  type Student,
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

/**
 * A submission as the public form writes it; status and review fields keep
 * their defaults.
 */
export type RegistrationSubmissionInsert = Snake<
  Pick<
    NewRegistrationSubmission,
    | 'childFirstName'
    | 'childLastName'
    | 'dateOfBirth'
    | 'preferredYearGroup'
    | 'englishSchoolName'
    | 'addressLine1'
    | 'addressLine2'
    | 'city'
    | 'postcode'
    | 'allergies'
    | 'medicalDetails'
    | 'senDetails'
    | 'collectAuthorised'
    | 'collectPassword'
    | 'mayLeaveUnaccompanied'
    | 'privacyNoticeRead'
    | 'firstAidConsent'
    | 'emailSmsContactAck'
    | 'photoVideoConsent'
    | 'homeSchoolAgreement'
    | 'consentsRecordedAt'
    | 'privacyNoticeVersion'
    | 'declarationName'
  >
>

type ContactInput = Snake<
  Omit<NewRegistrationSubmissionContact, 'id' | 'submissionId' | 'createdAt'>
>

type CreateRegistrationInput = {
  submission: RegistrationSubmissionInsert
  contacts: ContactInput[]
}

// The submission and its contacts are written in one transaction, so the
// inbox can never contain a submission without its primary contact.
export async function createRegistrationSubmission({
  submission,
  contacts,
}: CreateRegistrationInput): Promise<{ id: string }> {
  if (!contacts.some((contact) => contact.contact_role === 'primary'))
    throw new DbError('A primary parent/carer is required')

  return db.transaction(async (tx) => {
    const [created] = await tx
      .insert(registrationSubmissions)
      .values(toCamel(submission))
      .returning({ id: registrationSubmissions.id })
    await tx.insert(registrationSubmissionContacts).values(
      contacts.map((contact) => ({
        ...toCamel(contact),
        submissionId: created.id,
      })),
    )
    return created
  })
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

type Changes = Record<string, { old: string | null; new: string | null }>

function asText(value: unknown): string | null {
  return value === null || value === undefined ? null : String(value)
}

/** `keys` whose value differs between `before` and `after`, as text, in snake_case. */
function changedFields<T extends Record<string, unknown>>(
  before: T,
  after: T,
  keys: readonly (keyof T & string)[],
): Changes {
  const changes: Changes = {}
  for (const key of keys) {
    const old = asText(before[key])
    const next = asText(after[key])
    if (old !== next) changes[snakeKey(key)] = { old, new: next }
  }
  return changes
}

const GUARDIAN_FIELDS = [
  'phone',
  'email',
  'occupation',
  'addressLine1',
  'addressLine2',
  'city',
  'postcode',
] as const satisfies readonly (keyof Guardian)[]

const STUDENT_FIELDS = [
  'firstName',
  'lastName',
  'dateOfBirth',
  'englishSchoolName',
  'addressLine1',
  'addressLine2',
  'city',
  'postcode',
  'allergies',
  'medicalDetails',
  'studentCode',
  'primaryGuardianId',
  'secondaryGuardianId',
  'additionalContact1Id',
  'additionalContact2Id',
  'privacyNoticeRead',
  'firstAidConsent',
  'photoVideoConsent',
  'homeSchoolAgreement',
  'emailSmsContactAck',
  'senDetails',
  'mayLeaveUnaccompanied',
  'consentsRecordedAt',
  'privacyNoticeVersion',
  'active',
] as const satisfies readonly (keyof Student)[]

type Address = Pick<
  Guardian,
  'addressLine1' | 'addressLine2' | 'city' | 'postcode'
>

function childAddress(submission: RegistrationSubmission): Address {
  return {
    addressLine1: submission.addressLine1,
    addressLine2: submission.addressLine2,
    city: submission.city,
    postcode: submission.postcode,
  }
}

type ResolvedContact = { change: GuardianChange; relationship: string | null }

async function lockSubmission(
  tx: Tx,
  submissionId: string,
): Promise<RegistrationSubmission> {
  const [submission] = await tx
    .select()
    .from(registrationSubmissions)
    .where(
      and(
        eq(registrationSubmissions.id, submissionId),
        eq(registrationSubmissions.status, 'pending'),
      ),
    )
    .for('update')
  if (!submission) throw new DbError('Submission not found or already actioned')
  return submission
}

/**
 * The guardian a contact becomes. With `reuse`, an existing guardian is linked
 * by findGuardianMatches' rule (email, else phone digits and last name) — the
 * matches the review page shows — and their details are refreshed from the
 * submission, the parent's newest statement of them. resolveGuardian in
 * src/lib/guardians is not used: it links a guardian an admin picked.
 */
async function resolveContact(
  tx: Tx,
  submission: RegistrationSubmission,
  contact: RegistrationSubmissionContact,
  reuse: boolean,
): Promise<ResolvedContact> {
  const role = { contact_role: contact.contactRole }
  const relationship = contact.relationship
  const [match] = reuse
    ? await findGuardianMatches(
        {
          email: contact.email,
          phone: contact.phone,
          lastName: contact.lastName,
        },
        tx,
      )
    : []

  if (!match) {
    const [created] = await tx
      .insert(guardians)
      .values({
        firstName: contact.firstName,
        lastName: contact.lastName,
        phone: contact.phone,
        email: contact.email,
        occupation: contact.occupation,
        ...(contact.sameAsChildAddress
          ? childAddress(submission)
          : {
              addressLine1: contact.addressLine1,
              addressLine2: contact.addressLine2,
              city: contact.city,
              postcode: contact.postcode,
            }),
      })
      .returning({ id: guardians.id })
    return {
      change: {
        ...role,
        guardian_id: created.id,
        reused: false,
        matched_on: null,
        changes: {},
      },
      relationship,
    }
  }

  const [before] = await tx
    .select()
    .from(guardians)
    .where(eq(guardians.id, match.id))
    .for('update')
  const after = {
    ...before,
    phone: contact.phone,
    email: contact.email ?? before.email,
    occupation: contact.occupation ?? before.occupation,
    ...(contact.sameAsChildAddress
      ? childAddress(submission)
      : {
          addressLine1: contact.addressLine1 ?? before.addressLine1,
          addressLine2: contact.addressLine2 ?? before.addressLine2,
          city: contact.city ?? before.city,
          postcode: contact.postcode ?? before.postcode,
        }),
  }
  await tx
    .update(guardians)
    .set({
      phone: after.phone,
      email: after.email,
      occupation: after.occupation,
      addressLine1: after.addressLine1,
      addressLine2: after.addressLine2,
      city: after.city,
      postcode: after.postcode,
    })
    .where(eq(guardians.id, match.id))
  return {
    change: {
      ...role,
      guardian_id: match.id,
      reused: true,
      matched_on: match.matched_on,
      changes: changedFields(before, after, GUARDIAN_FIELDS),
    },
    relationship,
  }
}

async function resolveGuardians(
  tx: Tx,
  submission: RegistrationSubmission,
  reuse: boolean,
): Promise<ResolvedContact[]> {
  const contacts = await tx
    .select()
    .from(registrationSubmissionContacts)
    .where(eq(registrationSubmissionContacts.submissionId, submission.id))
    .orderBy(asc(registrationSubmissionContacts.contactRole))
  const resolved: ResolvedContact[] = []
  for (const contact of contacts)
    resolved.push(await resolveContact(tx, submission, contact, reuse))
  return resolved
}

type GuardianLinks = Pick<
  Student,
  | 'primaryGuardianId'
  | 'primaryGuardianRelationship'
  | 'secondaryGuardianId'
  | 'secondaryGuardianRelationship'
  | 'additionalContact1Id'
  | 'additionalContact1Relationship'
  | 'additionalContact2Id'
  | 'additionalContact2Relationship'
>

/** The student's guardian slots, one per contact role. */
function linkGuardians(resolved: ResolvedContact[]): GuardianLinks {
  const slot = (role: ContactRole): ResolvedContact | undefined =>
    resolved.find((r) => r.change.contact_role === role)
  const primary = slot('primary')
  if (!primary)
    throw new DbError(
      'Submission has no primary parent/carer — cannot create a student',
    )
  const secondary = slot('secondary')
  const additional1 = slot('additional_1')
  const additional2 = slot('additional_2')
  return {
    primaryGuardianId: primary.change.guardian_id,
    primaryGuardianRelationship: primary.relationship,
    secondaryGuardianId: secondary?.change.guardian_id ?? null,
    secondaryGuardianRelationship: secondary?.relationship ?? null,
    additionalContact1Id: additional1?.change.guardian_id ?? null,
    additionalContact1Relationship: additional1?.relationship ?? null,
    additionalContact2Id: additional2?.change.guardian_id ?? null,
    additionalContact2Relationship: additional2?.relationship ?? null,
  }
}

/**
 * The returning child's photo/video consent after approval. The form's answer
 * only counts if the parent filled it in after any recorded withdrawal: a
 * withdrawal made since still stands.
 */
function photoConsentFromForm(
  submission: RegistrationSubmission,
  student: Student,
): boolean {
  const withdrawnAt = student.photoVideoConsentWithdrawnAt
  if (!submission.photoVideoConsent) return false
  if (withdrawnAt === null) return true
  const filledInAt = submission.consentsRecordedAt ?? submission.submittedAt
  return Date.parse(filledInAt) > Date.parse(withdrawnAt)
}

/**
 * Creates the student, or — for a returning child — makes the submission the
 * source of truth for their names, DOB, address, medical details, consents
 * and contacts, and reactivates them.
 */
async function upsertStudent(
  tx: Tx,
  submission: RegistrationSubmission,
  links: GuardianLinks,
  studentCode: string | null,
  existingStudentId: string | null,
): Promise<{ id: string; changes: Changes }> {
  const details = {
    firstName: submission.childFirstName,
    lastName: submission.childLastName,
    dateOfBirth: submission.dateOfBirth,
    englishSchoolName: submission.englishSchoolName,
    ...childAddress(submission),
    addressGuardianId: null,
    allergies: submission.allergies,
    medicalDetails: submission.medicalDetails,
    senDetails: submission.senDetails,
    mayLeaveUnaccompanied: submission.mayLeaveUnaccompanied,
    privacyNoticeRead: submission.privacyNoticeRead,
    firstAidConsent: submission.firstAidConsent,
    photoVideoConsent: submission.photoVideoConsent,
    homeSchoolAgreement: submission.homeSchoolAgreement,
    emailSmsContactAck: submission.emailSmsContactAck,
    consentsRecordedAt: submission.consentsRecordedAt,
    privacyNoticeVersion: submission.privacyNoticeVersion,
    ...links,
  }

  if (existingStudentId === null) {
    const [created] = await tx
      .insert(students)
      .values({ ...details, studentCode })
      .returning({ id: students.id })
    return { id: created.id, changes: {} }
  }

  const [before] = await tx
    .select()
    .from(students)
    .where(eq(students.id, existingStudentId))
    .for('update')
  if (!before) throw new DbError('Existing student not found')
  const photo = photoConsentFromForm(submission, before)
  const [after] = await tx
    .update(students)
    .set({
      ...details,
      photoVideoConsent: photo,
      // Consent given again on a newer form supersedes the withdrawal.
      ...(photo && {
        photoVideoConsentWithdrawnAt: null,
        photoVideoConsentWithdrawnBy: null,
      }),
      studentCode: studentCode ?? before.studentCode,
      active: true,
      leavingReason: null,
    })
    .where(eq(students.id, existingStudentId))
    .returning()
  return { id: after.id, changes: changedFields(before, after, STUDENT_FIELDS) }
}

async function enrol(
  tx: Tx,
  studentId: string,
  classId: string | null,
): Promise<void> {
  if (classId === null) return
  await tx
    .insert(studentClasses)
    .values({ studentId, classId, startDate: todayInSchoolTz() })
    .onConflictDoNothing({
      target: [studentClasses.studentId, studentClasses.classId],
      where: isNull(studentClasses.endDate),
    })
}

async function markApproved(
  tx: Tx,
  submissionId: string,
  staffId: string,
  studentId: string,
  linkedExisting: boolean,
): Promise<void> {
  await tx
    .update(registrationSubmissions)
    .set({
      status: 'actioned',
      actionedBy: staffId,
      actionedAt: new Date().toISOString(),
      studentId,
      linkedExisting,
    })
    .where(eq(registrationSubmissions.id, submissionId))
}

/**
 * The rules an approval breaks, raised as constraint errors by its writes. A
 * unique violation keeps its constraint name, so the action can tell a taken
 * student code from, say, an open enrolment clash.
 */
function approvalError(err: unknown): unknown {
  switch (asDbError(err)?.code) {
    case '23514':
      return new DbError('Student address is incomplete — cannot approve')
    case '23503':
      return new DbError(
        'Invalid class or student reference — a record may have been deleted',
      )
    default:
      return err
  }
}

/**
 * Turns a pending submission into a student (new, or an existing one
 * reactivated), with a guardian per contact, optionally enrolled in a class.
 */
export async function approveRegistration({
  submissionId,
  staffId,
  studentCode,
  classId,
  existingStudentId,
  reuseGuardians,
}: ApproveRegistrationInput): Promise<ApproveRegistrationResult> {
  try {
    return await db.transaction(async (tx) => {
      const submission = await lockSubmission(tx, submissionId)
      if (classId !== null && !(await isClassOpen(tx, classId)))
        throw new DbError(
          'Students can only be enrolled in active classes of the current year.',
        )

      const resolved = await resolveGuardians(tx, submission, reuseGuardians)
      const student = await upsertStudent(
        tx,
        submission,
        linkGuardians(resolved),
        studentCode,
        existingStudentId,
      )
      await enrol(tx, student.id, classId)
      await markApproved(
        tx,
        submissionId,
        staffId,
        student.id,
        existingStudentId !== null,
      )

      return {
        student_id: student.id,
        linked_existing: existingStudentId !== null,
        guardians: resolved.map((r) => r.change),
        student_changes: student.changes,
      }
    })
  } catch (err) {
    throw approvalError(err)
  }
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
