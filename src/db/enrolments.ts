import 'server-only'

import {
  and,
  eq,
  exists,
  inArray,
  isNull,
  not,
  notInArray,
  sql,
  type SQL,
  type SQLWrapper,
} from 'drizzle-orm'

import { DbError } from '@/lib/db-error'
import { todayInSchoolTz } from '@/lib/datetime'

import type { Tx } from './client'
import { academicYears, classes, studentClasses, students } from './schema'

// The writers of enrolments (student_classes stays). A class takes enrolment
// changes only while it is open: active and in the current academic year.
// Stays open and close on dates in Europe/London (todayInSchoolTz).

const open = and(eq(classes.active, true), eq(academicYears.isCurrent, true))

/** SQL: the class `classId` (a value or a column) is open. */
function classIsOpen(tx: Tx, classId: SQLWrapper | string): SQL {
  return exists(
    tx
      .select({ id: classes.id })
      .from(classes)
      .innerJoin(academicYears, eq(academicYears.id, classes.academicYearId))
      .where(and(eq(classes.id, classId), open)),
  )
}

/** Ends the open stays `ids` on `on`, or on their start date if that is later. */
export async function closeEnrolments(
  tx: Tx,
  ids: string[],
  on: string,
): Promise<void> {
  if (ids.length === 0) return
  await tx
    .update(studentClasses)
    .set({ endDate: sql`greatest(${studentClasses.startDate}, ${on}::date)` })
    .where(and(inArray(studentClasses.id, ids), isNull(studentClasses.endDate)))
}

export async function isClassOpen(tx: Tx, classId: string): Promise<boolean> {
  const rows = await tx
    .select({ id: classes.id })
    .from(classes)
    .innerJoin(academicYears, eq(academicYears.id, classes.academicYearId))
    .where(and(eq(classes.id, classId), open))
  return rows.length > 0
}

/** Whether `studentId` has an open stay in `classId` (a value or a column). */
function hasOpenStay(
  tx: Tx,
  studentId: SQLWrapper | string,
  classId: SQLWrapper | string,
): SQL {
  return exists(
    tx
      .select({ id: studentClasses.id })
      .from(studentClasses)
      .where(
        and(
          eq(studentClasses.studentId, studentId),
          eq(studentClasses.classId, classId),
          isNull(studentClasses.endDate),
        ),
      ),
  )
}

async function checkClassMode(
  tx: Tx,
  classId: string,
  studentIds: string[],
): Promise<void> {
  if (!(await isClassOpen(tx, classId)))
    throw new DbError(
      'Only active classes in the current academic year can be changed.',
    )
  if (studentIds.length === 0) return

  // A leaver already on the class keeps their stay; a leaver can't be added.
  const leavers = await tx
    .select({ id: students.id })
    .from(students)
    .where(
      and(
        inArray(students.id, studentIds),
        eq(students.active, false),
        not(hasOpenStay(tx, students.id, classId)),
      ),
    )
    .limit(1)
  if (leavers.length > 0)
    throw new DbError("Leavers can't be enrolled in classes.")
}

async function checkStudentMode(
  tx: Tx,
  studentId: string,
  classIds: string[],
): Promise<void> {
  // A missing student is not a leaver: the insert below fails its foreign key.
  const [student] = await tx
    .select({ active: students.active })
    .from(students)
    .where(eq(students.id, studentId))
  if (student && !student.active)
    throw new DbError("Leavers can't be enrolled in classes.")
  if (classIds.length === 0) return

  const openClasses = await tx
    .select({ id: classes.id })
    .from(classes)
    .innerJoin(academicYears, eq(academicYears.id, classes.academicYearId))
    .where(and(inArray(classes.id, classIds), open))
  if (openClasses.length < classIds.length)
    throw new DbError(
      'Students can only be enrolled in active classes of the current year.',
    )
}

/**
 * Makes `ids` the current enrolments of one student (`ids` are class ids) or
 * of one class (`ids` are student ids), from today: stays no longer wanted
 * end today, new ones start today, the rest are left alone. A student's stays
 * in closed classes (past years, migrated classes) are out of scope.
 */
export async function setEnrolments(
  tx: Tx,
  owner: { studentId: string },
  classIds: string[],
): Promise<void>
export async function setEnrolments(
  tx: Tx,
  owner: { classId: string },
  studentIds: string[],
): Promise<void>
export async function setEnrolments(
  tx: Tx,
  owner: { studentId: string } | { classId: string },
  ids: string[],
): Promise<void> {
  const wanted = [...new Set(ids)]
  const today = todayInSchoolTz()

  let scope: SQL | undefined
  let stays: { studentId: string; classId: string }[]
  if ('classId' in owner) {
    await checkClassMode(tx, owner.classId, wanted)
    scope = and(
      eq(studentClasses.classId, owner.classId),
      notInArray(studentClasses.studentId, wanted),
    )
    stays = wanted.map((studentId) => ({ studentId, classId: owner.classId }))
  } else {
    await checkStudentMode(tx, owner.studentId, wanted)
    scope = and(
      eq(studentClasses.studentId, owner.studentId),
      classIsOpen(tx, studentClasses.classId),
      notInArray(studentClasses.classId, wanted),
    )
    stays = wanted.map((classId) => ({ studentId: owner.studentId, classId }))
  }

  const ending = await tx
    .select({ id: studentClasses.id })
    .from(studentClasses)
    .where(and(scope, isNull(studentClasses.endDate)))
  await closeEnrolments(
    tx,
    ending.map((stay) => stay.id),
    today,
  )

  if (stays.length === 0) return
  await tx
    .insert(studentClasses)
    .values(stays.map((stay) => ({ ...stay, startDate: today })))
    .onConflictDoNothing({
      target: [studentClasses.studentId, studentClasses.classId],
      where: isNull(studentClasses.endDate),
    })
}
