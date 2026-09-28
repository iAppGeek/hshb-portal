import 'server-only'

import { and, asc, eq, inArray } from 'drizzle-orm'

import type { EnrolmentRangeRow } from '@/lib/attendanceSummary'
import { toClassEmailRoster, type ClassEmailRoster } from '@/lib/communication'
import type { EnrolmentRow } from '@/lib/enrolment'
import { isUuid } from '@/lib/uuid'
import type { Database } from '@/types/database'

import { toCamel, toSnake, type Snake } from './casing'
import { db, supabase } from './client'
import { isCurrentStay, staysOverlapping } from './membership'
import {
  academicYears,
  classes,
  studentClasses,
  type Class,
  type Guardian,
  type Staff,
  type Student,
} from './schema'

/** The fields a form needs to list a class as a choice. */
export type ClassOption = { id: string; name: string; year_group: string }

type TeacherSummary = Pick<
  Staff,
  'id' | 'firstName' | 'lastName' | 'displayName' | 'email'
>

/** A class with its teacher and its academic year's code. */
export type ClassRow = Snake<Class & { teacher: TeacherSummary | null }> & {
  academic_year: string
}

type ClassMember = Pick<
  Student,
  'id' | 'firstName' | 'lastName' | 'studentCode' | 'active' | 'leavingReason'
>

export type ClassWithMembers = ClassRow &
  Snake<{ studentClasses: { studentId: string; student: ClassMember }[] }>

type RosterGuardian = Pick<
  Guardian,
  'firstName' | 'lastName' | 'phone' | 'email'
>

export type ClassWithStudents = Omit<ClassRow, 'teacher'> &
  Snake<{
    teacher: Omit<TeacherSummary, 'id'> | null
    studentClasses: {
      student: Pick<
        Student,
        'id' | 'studentCode' | 'firstName' | 'lastName' | 'allergies'
      > & {
        primaryGuardian: RosterGuardian
        secondaryGuardian: RosterGuardian | null
      }
    }[]
    enrolmentHistory: {
      id: string
      startDate: string
      endDate: string | null
      student: Pick<Student, 'id' | 'firstName' | 'lastName'>
    }[]
  }>

const teacherColumns = {
  id: true,
  firstName: true,
  lastName: true,
  displayName: true,
  email: true,
} as const

const classWith = {
  teacher: { columns: teacherColumns },
  academicYear: { columns: { code: true } },
} as const

/** The current academic year's id, as a subquery for `inArray`. */
const currentYearId = db
  .select({ id: academicYears.id })
  .from(academicYears)
  .where(eq(academicYears.isCurrent, true))

/** Keeps the flat `academic_year: string` shape display components already use. */
function withYearCode<T extends { academicYear: { code: string } }>(
  row: T,
): Omit<T, 'academicYear'> & { academicYear: string } {
  const { academicYear, ...rest } = row
  return { ...rest, academicYear: academicYear.code }
}

export async function getAllClasses(): Promise<ClassRow[]> {
  const rows = await db.query.classes.findMany({
    with: classWith,
    where: and(
      eq(classes.active, true),
      inArray(classes.academicYearId, currentYearId),
    ),
    orderBy: asc(classes.yearGroup),
  })
  return toSnake(rows.map(withYearCode))
}

/** Active classes in the current year, with the teacher school email and guardian emails. */
export async function getClassEmailRosters(): Promise<{
  yearCode: string
  classes: ClassEmailRoster[]
}> {
  const year = await db.query.academicYears.findFirst({
    where: eq(academicYears.isCurrent, true),
    columns: { code: true },
    with: {
      classes: {
        where: eq(classes.active, true),
        columns: { id: true, name: true, yearGroup: true },
        with: {
          teacher: {
            columns: {
              firstName: true,
              lastName: true,
              displayName: true,
              email: true,
            },
          },
          studentClasses: {
            where: isCurrentStay,
            columns: { id: true },
            with: {
              student: {
                columns: { id: true },
                with: {
                  primaryGuardian: { columns: { email: true } },
                  secondaryGuardian: { columns: { email: true } },
                },
              },
            },
          },
        },
      },
    },
  })
  if (!year) throw new Error('No current academic year is set')

  const rows = toSnake(year.classes).sort((a, b) => {
    const byYear = a.year_group.localeCompare(b.year_group, 'en', {
      numeric: true,
    })
    if (byYear !== 0) return byYear
    return a.name.localeCompare(b.name, 'en')
  })

  return {
    yearCode: year.code,
    classes: rows.map(toClassEmailRoster),
  }
}

export async function getClassesByAcademicYear(
  yearId: string,
): Promise<ClassRow[]> {
  const rows = await db.query.classes.findMany({
    with: classWith,
    where: eq(classes.academicYearId, yearId),
    orderBy: asc(classes.yearGroup),
  })
  return toSnake(rows.map(withYearCode))
}

export async function getClassById(
  id: string,
): Promise<ClassWithMembers | null> {
  // A malformed id finds nothing, rather than failing the uuid cast.
  if (!isUuid(id)) return null

  // Member details let the class form show a leaver still on the class,
  // who isn't in the selectable (active) student list.
  const row = await db.query.classes.findFirst({
    where: eq(classes.id, id),
    with: {
      ...classWith,
      studentClasses: {
        where: isCurrentStay,
        columns: { studentId: true },
        with: {
          student: {
            columns: {
              id: true,
              firstName: true,
              lastName: true,
              studentCode: true,
              active: true,
              leavingReason: true,
            },
          },
        },
      },
    },
  })
  return row ? toSnake(withYearCode(row)) : null
}

export async function getClassesByTeacher(
  teacherId: string,
): Promise<ClassRow[]> {
  const rows = await db.query.classes.findMany({
    with: classWith,
    where: and(
      eq(classes.teacherId, teacherId),
      eq(classes.active, true),
      inArray(classes.academicYearId, currentYearId),
    ),
    orderBy: asc(classes.yearGroup),
  })
  return toSnake(rows.map(withYearCode))
}

export async function getClassWithStudents(
  id: string,
): Promise<ClassWithStudents | null> {
  const guardianColumns = {
    firstName: true,
    lastName: true,
    phone: true,
    email: true,
  } as const
  // Every stay, once: the roster is the current ones, the history all of them.
  const row = await db.query.classes.findFirst({
    where: eq(classes.id, id),
    with: {
      teacher: {
        columns: {
          firstName: true,
          lastName: true,
          displayName: true,
          email: true,
        },
      },
      academicYear: { columns: { code: true } },
      studentClasses: {
        columns: { id: true, startDate: true, endDate: true },
        with: {
          student: {
            columns: {
              id: true,
              studentCode: true,
              firstName: true,
              lastName: true,
              allergies: true,
            },
            with: {
              primaryGuardian: { columns: guardianColumns },
              secondaryGuardian: { columns: guardianColumns },
            },
          },
        },
      },
    },
  })
  if (!row) return null

  const { studentClasses: stays, ...cls } = withYearCode(row)
  return toSnake({
    ...cls,
    studentClasses: stays
      .filter((stay) => stay.endDate === null)
      .map((stay) => ({ student: stay.student })),
    enrolmentHistory: stays.map((stay) => ({
      id: stay.id,
      startDate: stay.startDate,
      endDate: stay.endDate,
      student: {
        id: stay.student.id,
        firstName: stay.student.firstName,
        lastName: stay.student.lastName,
      },
    })),
  })
}

export async function getEnrolmentsForClass(
  classId: string,
): Promise<EnrolmentRow[]> {
  return db
    .select({
      classId: studentClasses.classId,
      studentId: studentClasses.studentId,
      startDate: studentClasses.startDate,
      endDate: studentClasses.endDate,
    })
    .from(studentClasses)
    .where(eq(studentClasses.classId, classId))
}

export async function getEnrolmentsInRange(
  start: string,
  end: string,
): Promise<EnrolmentRangeRow[]> {
  return db
    .select({
      classId: studentClasses.classId,
      studentId: studentClasses.studentId,
      startDate: studentClasses.startDate,
      endDate: studentClasses.endDate,
      class: {
        id: classes.id,
        name: classes.name,
        active: classes.active,
        yearCode: academicYears.code,
      },
    })
    .from(studentClasses)
    .innerJoin(classes, eq(classes.id, studentClasses.classId))
    .innerJoin(academicYears, eq(academicYears.id, classes.academicYearId))
    .where(staysOverlapping(studentClasses, start, end))
    .orderBy(asc(studentClasses.id))
}

type ClassInsert = {
  name: string
  year_group: string
  room_number?: string | null
  academic_year_id: string
  teacher_id: string
  active?: boolean
}

export async function createClass(data: ClassInsert): Promise<Snake<Class>> {
  const [row] = await db.insert(classes).values(toCamel(data)).returning()
  return toSnake(row)
}

/** A class's academic year is fixed once created; deactivation only happens
 * via migration, so `active` is not accepted here either. */
export async function updateClass(
  id: string,
  data: Partial<Omit<ClassInsert, 'academic_year_id' | 'active'>>,
): Promise<void> {
  await db.update(classes).set(toCamel(data)).where(eq(classes.id, id))
}

export type MigrationAction =
  'move' | 'none' | 'left' | 'graduated' | 'transferred'

type MigrateClassInput = {
  name: string
  year_group: string
  room_number: string | null
  academic_year_id: string
  teacher_id: string
}

export type MigrateClassResult = {
  new_class_id: string | null
  moved: number
  unassigned: number
  leavers: number
}

export async function migrateClass(input: {
  sourceClassId: string
  studentActions: Record<string, MigrationAction>
  newClass: MigrateClassInput | null
}): Promise<MigrateClassResult> {
  // Supabase codegen marks these as optional strings rather than nullable —
  // the SQL function treats all-NULL new-class params as "no new class".
  const { data, error } = await supabase.rpc('migrate_class', {
    p_source_class_id: input.sourceClassId,
    p_student_actions: input.studentActions,
    p_academic_year_id: input.newClass?.academic_year_id,
    p_name: input.newClass?.name,
    p_year_group: input.newClass?.year_group,
    p_room_number: input.newClass?.room_number ?? undefined,
    p_teacher_id: input.newClass?.teacher_id,
  } as Database['public']['Functions']['migrate_class']['Args'])
  if (error) throw error
  return data as unknown as MigrateClassResult
}

export async function setClassStudents(
  classId: string,
  studentIds: string[],
): Promise<void> {
  const { error } = await supabase.rpc('set_enrolments', {
    p_student_id: null,
    p_class_id: classId,
    p_ids: studentIds,
  } as unknown as Database['public']['Functions']['set_enrolments']['Args'])
  if (error) throw error
}
