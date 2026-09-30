import 'server-only'

import {
  and,
  asc,
  count,
  desc,
  eq,
  ilike,
  inArray,
  isNotNull,
  ne,
  or,
  sql,
} from 'drizzle-orm'

import { todayInSchoolTz } from '@/lib/datetime'
import { DbError } from '@/lib/db-error'
import { LEAVING_REASONS, type LeavingReason } from '@/lib/schemas'
import { isUuid } from '@/lib/uuid'

import { toCamel, toSnake, type Snake } from './casing'
import { db, type Queryable, type Tx } from './client'
import { closeEnrolments, setEnrolments } from './enrolments'
import { isCurrentStay, studentIdsTaughtBy } from './membership'
import {
  studentClasses,
  students,
  type Class,
  type Guardian,
  type Student,
} from './schema'

function isLeavingReason(value: string): value is LeavingReason {
  return (LEAVING_REASONS as readonly string[]).includes(value)
}

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

type ClassWithYear = { academicYear: { code: string } }

/** Keeps the flat `class.academic_year: string` shape display components already use. */
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
    studentClasses: links.map(({ class: { academicYear, ...cls } }) => ({
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

/**
 * Possible existing records for a registered or opted-out child: the same
 * last name and either the same date of birth or the same first name
 * (names case-insensitive). Includes inactive students so returning children
 * can be found and reactivated.
 */
export async function findStudentMatches(
  {
    firstName,
    lastName,
    dateOfBirth,
  }: {
    firstName: string
    lastName: string
    dateOfBirth: string
  },
  q: Queryable = db,
): Promise<StudentMatch[]> {
  const rows = await q
    .select({
      id: students.id,
      firstName: students.firstName,
      lastName: students.lastName,
      dateOfBirth: students.dateOfBirth,
      studentCode: students.studentCode,
      active: students.active,
    })
    .from(students)
    .where(
      and(
        sql`lower(${students.lastName}) = lower(${lastName})`,
        or(
          eq(students.dateOfBirth, dateOfBirth),
          sql`lower(${students.firstName}) = lower(${firstName})`,
        ),
      ),
    )
    .orderBy(
      desc(students.active),
      asc(students.lastName),
      asc(students.firstName),
    )
    .limit(10)
  return toSnake(rows)
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
  notes?: string | null
  consent_privacy_notice?: boolean
  consent_emergency_first_aid?: boolean
  consent_photo_media?: boolean
  consent_home_school?: boolean
  consent_comms_email_sms?: boolean
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

/** Makes `classIds` the student's current classes; see setEnrolments. */
export async function updateStudentClasses(
  studentId: string,
  classIds: string[],
): Promise<void> {
  await db.transaction((tx) => setEnrolments(tx, { studentId }, classIds))
}

/**
 * Ends every current stay today and records why the student left. Also run
 * by migrateClass, inside its transaction, for the students leaving with it.
 */
export async function markLeaver(
  tx: Tx,
  studentId: string,
  reason: string,
): Promise<void> {
  const [student] = await tx
    .select({ active: students.active })
    .from(students)
    .where(eq(students.id, studentId))
  if (!student) throw new DbError('Student not found')
  if (!student.active) throw new DbError('This student has already left.')
  if (!isLeavingReason(reason)) throw new DbError('Choose a leaving reason.')

  const stays = await tx
    .select({ id: studentClasses.id })
    .from(studentClasses)
    .where(
      and(
        eq(studentClasses.studentId, studentId),
        isCurrentStay(studentClasses),
      ),
    )
  await closeEnrolments(
    tx,
    stays.map((stay) => stay.id),
    todayInSchoolTz(),
  )

  await tx
    .update(students)
    .set({ active: false, leavingReason: reason })
    .where(eq(students.id, studentId))
}

export async function markStudentAsLeaver(
  studentId: string,
  reason: LeavingReason,
): Promise<void> {
  await db.transaction((tx) => markLeaver(tx, studentId, reason))
}
