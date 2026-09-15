// Pure class-status helpers. See plans/enrolment-history.md decision 14.

type YearRef = { id: string; start_date: string }

/** A completed class is read-only everywhere: inactive, or from a past year. */
export function isClassCompleted(
  cls: { active: boolean; academic_year_id: string },
  years: YearRef[],
  currentYear: YearRef,
): boolean {
  const year = years.find((y) => y.id === cls.academic_year_id)
  if (!year) return true
  return !cls.active || year.start_date < currentYear.start_date
}

/** Registers can only be taken for an active class in the current year. */
export function canTakeRegister(
  cls: { active: boolean; academic_year_id: string },
  currentYear: { id: string },
): boolean {
  return cls.active && cls.academic_year_id === currentYear.id
}
