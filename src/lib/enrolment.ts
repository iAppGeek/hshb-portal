// Pure enrolment-history helpers. student_classes rows are dated stays:
// start_date inclusive, end_date exclusive, null = open.
//
// Two questions, two rules:
// - "Current classes" (membership): stays with no end date, including one that
//   starts in the future. Queried via withCurrentClasses in @/db/membership.
// - "In the class on a date": isEnrolledOn / buildRegisterRoster below.

export type EnrolmentRow = {
  class_id: string
  student_id: string
  start_date: string
  end_date: string | null
}

/** A zero-length row (start_date === end_date) is never enrolled. */
export function isEnrolledOn(
  row: Pick<EnrolmentRow, 'start_date' | 'end_date'>,
  date: string,
): boolean {
  return (
    row.start_date <= date && (row.end_date === null || row.end_date > date)
  )
}

/**
 * The register roster for a class on a date: everyone with a saved mark,
 * plus everyone enrolled on that date, so movers who left after the mark was
 * saved still show and late joiners appear unmarked.
 */
export function buildRegisterRoster(
  markedStudentIds: string[],
  enrolments: EnrolmentRow[],
  date: string,
): string[] {
  const ids = new Set(markedStudentIds)
  for (const row of enrolments) {
    if (isEnrolledOn(row, date)) ids.add(row.student_id)
  }
  return [...ids].sort()
}

/**
 * The classes whose fee plan applies for one student in one year: their
 * current stays in that year if any, otherwise the stays that ended last.
 * A zero-length stay (added and removed the same day) never counts.
 */
export function feeClassesForYear<
  T extends { start_date: string; end_date: string | null },
>(rows: T[]): T[] {
  const stays = rows.filter((r) => r.end_date !== r.start_date)
  const current = stays.filter((r) => r.end_date === null)
  if (current.length > 0) return current
  const ended = stays.filter(
    (r): r is T & { end_date: string } => r.end_date !== null,
  )
  if (ended.length === 0) return []
  const lastEndDate = ended.reduce(
    (max, r) => (r.end_date > max ? r.end_date : max),
    ended[0].end_date,
  )
  return ended.filter((r) => r.end_date === lastEndDate)
}
