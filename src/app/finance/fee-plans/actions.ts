'use server'

import {
  createFeePlan,
  getClassesByAcademicYear,
  getFeePlanById,
  getFeePlans,
  updateFeePlan,
} from '@/db'
import { ActionError, runAction, type ActionResult } from '@/lib/action'
import { canManageFinance } from '@/lib/permissions'
import { feePlanSchema } from '@/lib/schemas'

import { validateFeePlan } from '../_lib/feePlanClasses'

export async function saveFeePlanAction(
  id: string | null,
  formData: FormData,
): Promise<ActionResult> {
  return runAction({
    name: id === null ? 'finance.fee-plans.create' : 'finance.fee-plans.update',
    permission: canManageFinance,
    schema: feePlanSchema,
    arrayFields: ['class_ids'],
    formData,
    run: async (parsed) => {
      const { class_ids, ...input } = parsed
      const [existing, classes, plans] = await Promise.all([
        id === null ? null : getFeePlanById(id),
        getClassesByAcademicYear(input.academic_year_id),
        getFeePlans(input.academic_year_id),
      ])
      if (id !== null && !existing) throw new ActionError('Fee plan not found.')
      const invalid = validateFeePlan(parsed, classes, plans, id)
      if (invalid) throw new ActionError(invalid)

      if (id === null) return createFeePlan(input, class_ids)
      await updateFeePlan(id, input, class_ids)
      return { id }
    },
    audit: {
      entity: 'fee_plan',
      action: id === null ? 'create' : 'update',
      entityId: (plan) => plan.id,
    },
    redirectTo: '/finance?tab=fee-plans',
    fallbackError:
      id === null
        ? 'Failed to create the fee plan. Please try again.'
        : 'Failed to update the fee plan. Please try again.',
  })
}
