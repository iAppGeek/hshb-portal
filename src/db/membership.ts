// "Current classes" (membership): a student's stays with no end date. This
// includes a stay that starts in the future (e.g. after being migrated into
// next year's class), so it always matches what the enrolment writers
// (set_enrolments, migrate_class, mark_student_as_leaver) act on. Questions
// about a particular date use isEnrolledOn in @/lib/enrolment instead.

type FilterableQuery<Q> = { is(column: string, value: null): Q }

/** Filters a query on the `student_classes` table to current stays. */
export function currentStays<Q extends FilterableQuery<Q>>(query: Q): Q {
  return query.is('end_date', null)
}

/**
 * Filters a `student_classes` embed to current stays. Never use `!inner` for
 * this: it would drop students (or classes) that have no current stay.
 */
export function withCurrentClasses<Q extends FilterableQuery<Q>>(
  query: Q,
  embed = 'student_classes',
): Q {
  return query.is(`${embed}.end_date`, null)
}
