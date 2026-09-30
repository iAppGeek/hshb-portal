import 'server-only'

import { and, eq, gt, isNull, lte, or, type SQL } from 'drizzle-orm'
import type { PgColumn } from 'drizzle-orm/pg-core'

import { db } from './client'
import { classes, studentClasses } from './schema'

// "Current classes" (membership): a student's stays with no end date. This
// includes a stay that starts in the future (e.g. after being migrated into
// next year's class), so it always matches what the enrolment writers
// (setEnrolments, migrateClass, markLeaver) act on. Questions
// about a particular date use enrolledOn (same rule as isEnrolledOn in
// @/lib/enrolment).
//
// The helpers take the stay's columns rather than the table, so they also
// work inside a relational `with`, where Drizzle aliases the nested table:
//   with: { studentClasses: { where: isCurrentStay } }

type StayColumns = { startDate: PgColumn; endDate: PgColumn }

/** Stays with no end date. */
export function isCurrentStay(stay: Pick<StayColumns, 'endDate'>): SQL {
  return isNull(stay.endDate)
}

/** Stays that overlap [start, end]: started by `end`, not ended by `start`. */
export function staysOverlapping(
  stay: StayColumns,
  start: string,
  end: string,
): SQL {
  return and(
    lte(stay.startDate, end),
    or(isNull(stay.endDate), gt(stay.endDate, start)),
  ) as SQL
}

/** Stays that cover `date`. */
export function enrolledOn(stay: StayColumns, date: string): SQL {
  return staysOverlapping(stay, date, date)
}

/**
 * Subquery: ids of students with a current stay in one of the teacher's
 * active classes (any academic year), for `inArray(students.id, …)`.
 */
export function studentIdsTaughtBy(teacherId: string) {
  return db
    .selectDistinct({ id: studentClasses.studentId })
    .from(studentClasses)
    .innerJoin(classes, eq(classes.id, studentClasses.classId))
    .where(
      and(
        eq(classes.teacherId, teacherId),
        eq(classes.active, true),
        isCurrentStay(studentClasses),
      ),
    )
}
