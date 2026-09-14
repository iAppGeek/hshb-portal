import type { FeePlanWithClasses } from '@/db'

export type FeePlanClassOption = {
  id: string
  name: string
  year_group: string
  academic_year_id: string
}

export function toClassOptions(
  classes: FeePlanClassOption[],
): FeePlanClassOption[] {
  return classes
    .map(({ id, name, year_group, academic_year_id }) => ({
      id,
      name,
      year_group,
      academic_year_id,
    }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

export function planLabel(plan: {
  name: string
  academic_year: { code: string }
}): string {
  return `${plan.name} (${plan.academic_year.code})`
}

/** Class id → label of the other plan that already owns it. */
export function takenClassLabels(
  plans: FeePlanWithClasses[],
  currentPlanId: string | null,
): Record<string, string> {
  const taken: Record<string, string> = {}
  for (const plan of plans) {
    if (plan.id === currentPlanId) continue
    for (const classId of plan.class_ids) taken[classId] = planLabel(plan)
  }
  return taken
}

/**
 * Checks that run before saving a fee plan, so admins get a specific message
 * instead of a generic unique-constraint error.
 */
export function validateFeePlan(
  input: { name: string; academic_year_id: string; class_ids: string[] },
  classes: FeePlanClassOption[],
  plans: FeePlanWithClasses[],
  currentPlanId: string | null,
): string | null {
  const duplicate = plans.find(
    (p) =>
      p.id !== currentPlanId &&
      p.academic_year.id === input.academic_year_id &&
      p.name.toLowerCase() === input.name.toLowerCase(),
  )
  if (duplicate) {
    return `A fee plan called ${duplicate.name} already exists for ${duplicate.academic_year.code}.`
  }

  const classesById = new Map(classes.map((c) => [c.id, c]))
  const taken = takenClassLabels(plans, currentPlanId)
  for (const classId of input.class_ids) {
    const cls = classesById.get(classId)
    if (!cls) return 'One of the selected classes no longer exists.'
    if (cls.academic_year_id !== input.academic_year_id) {
      return `${cls.name} does not belong to this fee plan's academic year.`
    }
    if (taken[classId]) {
      return `${cls.name} is already on the ${taken[classId]} fee plan.`
    }
  }
  return null
}
