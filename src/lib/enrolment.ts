// Pure enrolment-history helpers. student_classes rows are dated stays:
// start_date inclusive, end_date exclusive, null = open. See plans/enrolment-history.md.

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
 * The classes whose fee plan applies for one student in one year: their open
 * rows in that year if any, otherwise the rows with the latest end_date.
 */
export function feeClassesForYear<
  T extends { start_date: string; end_date: string | null },
>(rows: T[]): T[] {
  if (rows.length === 0) return []
  const open = rows.filter((r) => r.end_date === null)
  if (open.length > 0) return open
  const maxEndDate = rows.reduce(
    (max, r) => (r.end_date! > max ? r.end_date! : max),
    rows[0].end_date!,
  )
  return rows.filter((r) => r.end_date === maxEndDate)
}
