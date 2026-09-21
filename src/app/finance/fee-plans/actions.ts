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

export async function createFeePlanAction(
  formData: FormData,
): Promise<ActionResult> {
  return runAction({
    name: 'finance.fee-plans.create',
    permission: canManageFinance,
    schema: feePlanSchema,
    arrayFields: ['class_ids'],
    formData,
    run: async (parsed) => {
      const { class_ids, ...input } = parsed
      const [classes, plans] = await Promise.all([
        getClassesByAcademicYear(input.academic_year_id),
        getFeePlans(input.academic_year_id),
      ])
      const invalid = validateFeePlan(parsed, classes, plans, null)
      if (invalid) throw new ActionError(invalid)

      return createFeePlan(input, class_ids)
    },
    audit: {
      entity: 'fee_plan',
      action: 'create',
      entityId: (plan) => plan.id,
    },
    revalidate: ['/finance'],
    redirectTo: '/finance?tab=fee-plans',
    fallbackError: 'Failed to create the fee plan. Please try again.',
  })
}

export async function updateFeePlanAction(
  id: string,
  formData: FormData,
): Promise<ActionResult> {
  return runAction({
    name: 'finance.fee-plans.update',
    permission: canManageFinance,
    schema: feePlanSchema,
    arrayFields: ['class_ids'],
    formData,
    run: async (parsed) => {
      const { class_ids, ...input } = parsed
      const [existing, classes, plans] = await Promise.all([
        getFeePlanById(id),
        getClassesByAcademicYear(input.academic_year_id),
        getFeePlans(input.academic_year_id),
      ])
      if (!existing) throw new ActionError('Fee plan not found.')
      const invalid = validateFeePlan(parsed, classes, plans, id)
      if (invalid) throw new ActionError(invalid)

      await updateFeePlan(id, input, class_ids)
    },
    audit: { entity: 'fee_plan', action: 'update', entityId: () => id },
    revalidate: ['/finance'],
    redirectTo: '/finance?tab=fee-plans',
    fallbackError: 'Failed to update the fee plan. Please try again.',
  })
}
