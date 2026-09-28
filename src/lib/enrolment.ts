// Pure enrolment-history helpers. student_classes rows are dated stays:
// startDate inclusive, endDate exclusive, null = open. Rows come straight
// from Drizzle (src/db), so fields are camelCase.
//
// Two questions, two rules:
// - "Current classes" (membership): stays with no end date, including one that
//   starts in the future. Queried via isCurrentStay in @/db/membership.
// - "In the class on a date": isEnrolledOn / buildRegisterRoster below.

export type EnrolmentRow = {
  classId: string
  studentId: string
  startDate: string
  endDate: string | null
}

/** A zero-length row (startDate === endDate) is never enrolled. */
export function isEnrolledOn(
  row: Pick<EnrolmentRow, 'startDate' | 'endDate'>,
  date: string,
): boolean {
  return row.startDate <= date && (row.endDate === null || row.endDate > date)
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
    if (isEnrolledOn(row, date)) ids.add(row.studentId)
  }
  return [...ids].sort()
}

/**
 * The classes whose fee plan applies for one student in one year: their
 * current stays in that year if any, otherwise the stays that ended last.
 * A zero-length stay (added and removed the same day) never counts.
 */
export function feeClassesForYear<
  T extends { startDate: string; endDate: string | null },
>(rows: T[]): T[] {
  const stays = rows.filter((r) => r.endDate !== r.startDate)
  const current = stays.filter((r) => r.endDate === null)
  if (current.length > 0) return current
  const ended = stays.filter(
    (r): r is T & { endDate: string } => r.endDate !== null,
  )
  if (ended.length === 0) return []
  const lastEndDate = ended.reduce(
    (max, r) => (r.endDate > max ? r.endDate : max),
    ended[0].endDate,
  )
  return ended.filter((r) => r.endDate === lastEndDate)
}
