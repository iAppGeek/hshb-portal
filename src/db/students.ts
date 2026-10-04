import 'server-only'

import {
  and,
  asc,
  count,
  eq,
  ilike,
  inArray,
  isNotNull,
  ne,
  or,
  sql,
  type SQL,
} from 'drizzle-orm'

import { compareClasses } from '@/lib/classes'
import type { LeavingReason } from '@/lib/schemas'
import { nextStudentCode, studentCodePattern } from '@/lib/student-code'
import { isUuid } from '@/lib/uuid'
import type { Database } from '@/types/database'

import { toCamel, toSnake, type Snake } from './casing'
import { db, supabase, type Tx } from './client'
import type { GuardianInsert } from './guardians'
import { isCurrentStay, studentIdsTaughtBy } from './membership'
import {
  guardians,
  studentClasses,
  students,
  type Class,
  type Guardian,
  type Student,
} from './schema'

type StudentListItem = Snake<
  Pick<Student, 'id' | 'firstName' | 'lastName' | 'studentCode'>
>

type GuardianDetails = Pick<
  Guardian,
  | 'firstName'
  | 'lastName'
  | 'phone'
  | 'email'
  | 'occupation'
  | 'addressLine1'
  | 'addressLine2'
  | 'city'
  | 'postcode'
  | 'notes'
>
type ContactSummary = Pick<Guardian, 'firstName' | 'lastName' | 'phone'>
type GuardianAddress = Pick<
  Guardian,
  'addressLine1' | 'addressLine2' | 'city' | 'postcode'
>

type StudentContacts = {
  primaryGuardian: GuardianDetails
  secondaryGuardian: GuardianDetails | null
  additionalContact1: ContactSummary | null
  additionalContact2: ContactSummary | null
  addressGuardian: GuardianAddress | null
}

/** A student with their contacts and current classes (class year as a code). */
export type StudentRecord = Snake<
  Student &
    StudentContacts & {
      studentClasses: {
        class: Pick<Class, 'id' | 'name' | 'yearGroup'> & {
          academicYear: string
        }
      }[]
    }
>

/** A student with their contacts, current classes and every stay's end date. */
export type StudentDetail = Snake<
  Student &
    StudentContacts & {
      studentClasses: {
        class: Pick<Class, 'id' | 'name' | 'yearGroup' | 'teacherId'> & {
          academicYear: string
        }
      }[]
      enrolmentEndDates: { endDate: string | null }[]
    }
>

export type StudentSummary = Snake<
  Pick<Student, 'id' | 'firstName' | 'lastName' | 'studentCode'> & {
    studentClasses: { class: Pick<Class, 'name'> }[]
  }
>

const listColumns = {
  id: students.id,
  firstName: students.firstName,
  lastName: students.lastName,
  studentCode: students.studentCode,
}

const guardianDetails = {
  columns: {
    firstName: true,
    lastName: true,
    phone: true,
    email: true,
    occupation: true,
    addressLine1: true,
    addressLine2: true,
    city: true,
    postcode: true,
    notes: true,
  },
} as const
const contactSummary = {
  columns: { firstName: true, lastName: true, phone: true },
} as const

const contactsWith = {
  primaryGuardian: guardianDetails,
  secondaryGuardian: guardianDetails,
  additionalContact1: contactSummary,
  additionalContact2: contactSummary,
  addressGuardian: {
    columns: {
      addressLine1: true,
      addressLine2: true,
      city: true,
      postcode: true,
    },
  },
} as const

// Current classes only, like every student_classes embed of a student.
const recordWith = {
  ...contactsWith,
  studentClasses: {
    where: isCurrentStay,
    columns: {},
    with: {
      class: {
        columns: { id: true, name: true, yearGroup: true },
        with: { academicYear: { columns: { code: true } } },
      },
    },
  },
} as const

type ClassWithYear = {
  name: string
  yearGroup: string
  academicYear: { code: string }
}

type ClassLink = { class: { name: string; yearGroup: string } }

/** Orders a student's class links in school order, youngest first. */
function compareClassLinks(a: ClassLink, b: ClassLink): number {
  return compareClasses(
    { name: a.class.name, year_group: a.class.yearGroup },
    { name: b.class.name, year_group: b.class.yearGroup },
  )
}

/** Keeps the flat `class.academic_year: string` shape display components
 * already use, with the classes in school order. */
function withClassYearCodes<R extends object, C extends ClassWithYear>(
  row: R & { studentClasses: { class: C }[] },
): Omit<R, 'studentClasses'> & {
  studentClasses: {
    class: Omit<C, 'academicYear'> & { academicYear: string }
  }[]
} {
  const { studentClasses: links, ...rest } = row
  return {
    ...rest,
    studentClasses: [...links]
      .sort(compareClassLinks)
      .map(({ class: { academicYear, ...cls } }) => ({
        class: { ...cls, academicYear: academicYear.code },
      })),
  }
}

export async function getStudentsForList(): Promise<StudentListItem[]> {
  const rows = await db
    .select(listColumns)
    .from(students)
    .where(eq(students.active, true))
    .orderBy(asc(students.lastName))
  return toSnake(rows)
}

/** Every active student as name plus current classes, ordered by last name. */
export async function getStudentSummaries(): Promise<StudentSummary[]> {
  const rows = await db.query.students.findMany({
    columns: { id: true, firstName: true, lastName: true, studentCode: true },
    with: {
      studentClasses: {
        where: isCurrentStay,
        columns: {},
        with: { class: { columns: { name: true } } },
      },
    },
    where: eq(students.active, true),
    orderBy: asc(students.lastName),
  })
  return toSnake(rows)
}

export async function searchStudents(
  query: string,
): Promise<StudentListItem[]> {
  const trimmed = query.trim()
  if (!trimmed) return []
  const rows = await db
    .select(listColumns)
    .from(students)
    .where(
      and(
        eq(students.active, true),
        or(
          ilike(students.firstName, `%${trimmed}%`),
          ilike(students.lastName, `%${trimmed}%`),
        ),
      ),
    )
    .orderBy(asc(students.lastName))
    .limit(20)
  return toSnake(rows)
}

export async function getStudentsByTeacher(
  teacherId: string,
): Promise<StudentRecord[]> {
  const rows = await db.query.students.findMany({
    with: recordWith,
    where: and(
      eq(students.active, true),
      inArray(students.id, studentIdsTaughtBy(teacherId)),
    ),
    orderBy: asc(students.lastName),
  })
  return toSnake(rows.map(withClassYearCodes))
}

export async function getStudentIdsByTeacher(
  teacherId: string,
): Promise<string[]> {
  const rows = await studentIdsTaughtBy(teacherId)
  return rows.map((r) => r.id)
}

export async function getStudentCount(): Promise<number> {
  const [{ n }] = await db
    .select({ n: count() })
    .from(students)
    .where(eq(students.active, true))
  return n
}

export async function getStudentsWithAllergiesCount(): Promise<number> {
  const [{ n }] = await db
    .select({ n: count() })
    .from(students)
    .where(
      and(
        eq(students.active, true),
        isNotNull(students.allergies),
        ne(students.allergies, ''),
      ),
    )
  return n
}

export async function getAllStudents(
  includeInactive: boolean,
): Promise<StudentRecord[]> {
  const rows = await db.query.students.findMany({
    with: recordWith,
    where: includeInactive ? undefined : eq(students.active, true),
    orderBy: asc(students.lastName),
  })
  return toSnake(rows.map(withClassYearCodes))
}

export async function getStudentsByClass(
  classId: string,
): Promise<StudentRecord[]> {
  const inClass = db
    .select({ id: studentClasses.studentId })
    .from(studentClasses)
    .where(
      and(eq(studentClasses.classId, classId), isCurrentStay(studentClasses)),
    )
  const rows = await db.query.students.findMany({
    with: recordWith,
    where: and(eq(students.active, true), inArray(students.id, inClass)),
    orderBy: asc(students.lastName),
  })
  return toSnake(rows.map(withClassYearCodes))
}

export async function getStudentById(
  id: string,
): Promise<StudentDetail | null> {
  // A malformed id finds nothing, rather than failing the uuid cast.
  if (!isUuid(id)) return null

  // Every stay, once: current classes are the open ones, and the end dates
  // cover all of them.
  const row = await db.query.students.findFirst({
    where: eq(students.id, id),
    with: {
      ...contactsWith,
      studentClasses: {
        columns: { endDate: true },
        with: {
          class: {
            columns: { id: true, name: true, yearGroup: true, teacherId: true },
            with: { academicYear: { columns: { code: true } } },
          },
        },
      },
    },
  })
  if (!row) return null

  const { studentClasses: stays, ...student } = row
  return toSnake({
    ...student,
    studentClasses: stays
      .filter((stay) => stay.endDate === null)
      .sort(compareClassLinks)
      .map(({ class: { academicYear, ...cls } }) => ({
        class: { ...cls, academicYear: academicYear.code },
      })),
    enrolmentEndDates: stays.map((stay) => ({ endDate: stay.endDate })),
  })
}

/** Returns [] for empty input rather than issuing an unfiltered `.in()`. */
export async function getStudentsByIds(
  ids: string[],
): Promise<StudentRecord[]> {
  if (ids.length === 0) return []
  const rows = await db.query.students.findMany({
    with: recordWith,
    where: inArray(students.id, ids),
    orderBy: asc(students.lastName),
  })
  return toSnake(rows.map(withClassYearCodes))
}

export type StudentMatch = {
  id: string
  first_name: string
  last_name: string
  date_of_birth: string | null
  student_code: string | null
  active: boolean
}

// Includes inactive students so returning children can be found and reactivated.
// Uses a parameterised RPC rather than a string-built PostgREST filter, since
// firstName and lastName originate from the public registration form.
export async function findStudentMatches({
  firstName,
  lastName,
  dateOfBirth,
}: {
  firstName: string
  lastName: string
  dateOfBirth: string
}): Promise<StudentMatch[]> {
  const { data, error } = await supabase.rpc('find_student_matches', {
    p_first_name: firstName,
    p_last_name: lastName,
    p_date_of_birth: dateOfBirth,
  })
  if (error) throw error
  return (data ?? []) as StudentMatch[]
}

export async function getStudentsForLinking(): Promise<StudentMatch[]> {
  const rows = await db
    .select({
      id: students.id,
      firstName: students.firstName,
      lastName: students.lastName,
      dateOfBirth: students.dateOfBirth,
      studentCode: students.studentCode,
      active: students.active,
    })
    .from(students)
    .orderBy(asc(students.lastName))
  return toSnake(rows)
}

type StudentInsert = {
  first_name: string
  last_name: string
  student_code?: string | null
  date_of_birth?: string | null
  english_school_name?: string | null
  address_guardian_id?: string | null
  address_line_1?: string | null
  address_line_2?: string | null
  city?: string | null
  postcode?: string | null
  primary_guardian_id: string
  primary_guardian_relationship?: string | null
  secondary_guardian_id?: string | null
  secondary_guardian_relationship?: string | null
  additional_contact_1_id?: string | null
  additional_contact_1_relationship?: string | null
  additional_contact_2_id?: string | null
  additional_contact_2_relationship?: string | null
  allergies?: string | null
  medical_details?: string | null
  sen_details?: string | null
  may_leave_unaccompanied?: boolean
  notes?: string | null
  privacy_notice_read?: boolean
  first_aid_consent?: boolean
  photo_video_consent?: boolean
  home_school_agreement?: boolean
  email_sms_contact_ack?: boolean
}

/**
 * The code to offer a new student: one after the highest `<prefix><number>`
 * held by any student, leavers included, so a code is never reused. Codes
 * saved in lower case before input was upper-cased still count.
 */
export async function getNextStudentCode(): Promise<string> {
  const [row] = await db
    .select({
      highest: sql<
        number | null
      >`max(substring(upper(${students.studentCode}) from ${studentCodePattern()})::int)`,
    })
    .from(students)
  return nextStudentCode(row.highest)
}

/**
 * Whether a student other than `exceptId` (leavers included) holds `code`,
 * ignoring case.
 */
export async function isStudentCodeTaken(
  code: string,
  exceptId: string | null,
): Promise<boolean> {
  const [row] = await db
    .select({ id: students.id })
    .from(students)
    .where(
      and(
        sql`upper(${students.studentCode}) = upper(${code})`,
        exceptId === null ? undefined : ne(students.id, exceptId),
      ),
    )
    .limit(1)
  return row !== undefined
}

export async function createStudent(
  data: StudentInsert,
): Promise<{ id: string }> {
  const [row] = await db
    .insert(students)
    .values(toCamel(data))
    .returning({ id: students.id })
  return row
}

type StudentUpdate = Partial<StudentInsert>

export async function updateStudent(
  id: string,
  data: StudentUpdate,
): Promise<void> {
  await db.update(students).set(toCamel(data)).where(eq(students.id, id))
}

/** A guardian link on a student: an existing guardian, or one to create. */
export type GuardianSlot = { id: string } | { create: GuardianInsert }

type StudentGuardianSlots = {
  primary: GuardianSlot
  secondary: GuardianSlot | null
  contact1: GuardianSlot | null
  contact2: GuardianSlot | null
}

type StudentGuardianIds = Pick<
  StudentInsert,
  | 'primary_guardian_id'
  | 'secondary_guardian_id'
  | 'additional_contact_1_id'
  | 'additional_contact_2_id'
  | 'address_guardian_id'
>

async function guardianIdOf(tx: Tx, slot: GuardianSlot): Promise<string> {
  if ('id' in slot) return slot.id
  const [row] = await tx
    .insert(guardians)
    .values(toCamel(slot.create))
    .returning({ id: guardians.id })
  return row.id
}

/**
 * Creates the student (`id` null) or updates it, first creating any guardian
 * entered as new. One transaction, so a refused student write (such as a code
 * another student took a moment earlier) leaves no orphaned guardians behind.
 * With `addressFromPrimary` the student shares the primary guardian's address.
 */
export async function saveStudent(
  id: string | null,
  data: Omit<StudentInsert, keyof StudentGuardianIds>,
  slots: StudentGuardianSlots,
  addressFromPrimary: boolean,
  /** Recorded as who withdrew photo/video consent, if this save does so. */
  savedBy: string | null = null,
): Promise<{ id: string }> {
  return db.transaction(async (tx) => {
    const primaryId = await guardianIdOf(tx, slots.primary)
    const values = toCamel({
      ...data,
      primary_guardian_id: primaryId,
      secondary_guardian_id: slots.secondary
        ? await guardianIdOf(tx, slots.secondary)
        : null,
      additional_contact_1_id: slots.contact1
        ? await guardianIdOf(tx, slots.contact1)
        : null,
      additional_contact_2_id: slots.contact2
        ? await guardianIdOf(tx, slots.contact2)
        : null,
      address_guardian_id: addressFromPrimary ? primaryId : null,
    })

    if (id === null) {
      const [row] = await tx
        .insert(students)
        .values(values)
        .returning({ id: students.id })
      return row
    }

    await tx
      .update(students)
      .set({
        ...values,
        ...(data.photo_video_consent !== undefined &&
          savedBy !== null &&
          photoConsentChange(data.photo_video_consent, savedBy)),
      })
      .where(eq(students.id, id))
    return { id }
  })
}

/**
 * The withdrawal columns for an update that sets photo/video consent to
 * `given`: turning it off records when and by whom (unless it was already off,
 * which keeps the original record), and giving it again clears them. The CASE
 * reads the row's consent from before the update.
 */
function photoConsentChange(
  given: boolean,
  staffId: string,
): {
  photoVideoConsentWithdrawnAt: SQL | null
  photoVideoConsentWithdrawnBy: SQL | null
} {
  if (given)
    return {
      photoVideoConsentWithdrawnAt: null,
      photoVideoConsentWithdrawnBy: null,
    }
  return {
    photoVideoConsentWithdrawnAt: sql`CASE WHEN ${students.photoVideoConsent} THEN now() ELSE ${students.photoVideoConsentWithdrawnAt} END`,
    photoVideoConsentWithdrawnBy: sql`CASE WHEN ${students.photoVideoConsent} THEN ${staffId}::uuid ELSE ${students.photoVideoConsentWithdrawnBy} END`,
  }
}

/**
 * Records a parent withdrawing photo/video consent: the consent is turned off
 * and the staff member and time are kept with it. Withdrawing consent that is
 * already off changes nothing.
 */
export async function withdrawPhotoVideoConsent(
  studentId: string,
  staffId: string,
): Promise<void> {
  const rows = await db
    .update(students)
    .set({ photoVideoConsent: false, ...photoConsentChange(false, staffId) })
    .where(eq(students.id, studentId))
    .returning({ id: students.id })
  if (rows.length === 0) throw new Error('Student not found')
}

export async function updateStudentClasses(
  studentId: string,
  classIds: string[],
): Promise<void> {
  // Supabase codegen marks p_class_id as a required string — the SQL function
  // treats a NULL p_class_id as "student mode" (p_ids are class ids).
  const { error } = await supabase.rpc('set_enrolments', {
    p_student_id: studentId,
    p_class_id: null,
    p_ids: classIds,
  } as unknown as Database['public']['Functions']['set_enrolments']['Args'])
  if (error) throw error
}

export async function markStudentAsLeaver(
  studentId: string,
  reason: LeavingReason,
): Promise<void> {
  const { error } = await supabase.rpc('mark_student_as_leaver', {
    p_student_id: studentId,
    p_reason: reason,
  })
  if (error) throw error
}
