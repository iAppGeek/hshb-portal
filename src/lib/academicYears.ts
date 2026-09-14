// Pure academic-year helpers. See plans/academic-years.md §3.

export type AcademicYearRange = {
  code: string
  start_date: string
  end_date: string
}

/** Classes have used both `2025/26` and `2025-26`; the dash form is canonical. */
export function normaliseAcademicYear(value: string): string {
  return value.trim().replace('/', '-')
}

function startYear(code: string): number | null {
  const match = /^(\d{4})-\d{2}$/.exec(normaliseAcademicYear(code))
  return match ? Number(match[1]) : null
}

/** The year immediately after `code`, spanning 1 Sep to 31 Aug. */
export function nextAcademicYear(code: string): AcademicYearRange {
  const year = (startYear(code) ?? new Date().getUTCFullYear()) + 1
  return {
    code: `${year}-${String((year + 1) % 100).padStart(2, '0')}`,
    start_date: `${year}-09-01`,
    end_date: `${year + 1}-08-31`,
  }
}

/** The year whose inclusive range contains `date`, if any. */
export function academicYearForDate<T extends AcademicYearRange>(
  years: T[],
  date: string,
): T | null {
  return years.find((y) => date >= y.start_date && date <= y.end_date) ?? null
}
