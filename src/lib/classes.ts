// Pure class-status helpers. Mirrors is_class_open in the database.

/**
 * An open class is active and in the current academic year. Only open classes
 * can take registers or have their enrolments and details changed; every other
 * class (inactive, or from any other year) is read-only.
 */
export function isClassOpen(
  cls: { active: boolean; academic_year_id: string },
  currentYear: { id: string },
): boolean {
  return cls.active && cls.academic_year_id === currentYear.id
}
