import 'server-only'

import { and, gt, isNull, lte, or, type SQL } from 'drizzle-orm'
import type { PgColumn } from 'drizzle-orm/pg-core'

// "Current classes" (membership): a student's stays with no end date. This
// includes a stay that starts in the future (e.g. after being migrated into
// next year's class), so it always matches what the enrolment writers
// (set_enrolments, migrate_class, mark_student_as_leaver) act on. Questions
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
