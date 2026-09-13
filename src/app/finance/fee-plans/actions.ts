'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'

import { auth } from '@/auth'
import {
  createFeePlan,
  getAllClassesIncludingInactive,
  getFeePlanById,
  getFeePlans,
  logAuditEvent,
  updateFeePlan,
} from '@/db'
import { getUserFriendlyDbError } from '@/lib/db-error'
import { canManageFinance } from '@/lib/permissions'
import {
  extractFormFields,
  feePlanSchema,
  type ActionResult,
} from '@/lib/schemas'
import type { StaffRole } from '@/types/next-auth'

import { validateFeePlan } from '../_lib/feePlanClasses'

export async function createFeePlanAction(
  formData: FormData,
): Promise<ActionResult> {
  const session = await auth()
  if (!session) return { error: 'Not authenticated' }
  const role = session.user.role as StaffRole
  if (!canManageFinance(role)) return { error: 'Not authorised' }
  const staffId = session.user.staffId ?? null

  const parsed = feePlanSchema.safeParse(
    extractFormFields(formData, ['class_ids']),
  )
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const { class_ids, ...input } = parsed.data

  try {
    const [classes, plans] = await Promise.all([
      getAllClassesIncludingInactive(),
      getFeePlans(),
    ])
    const invalid = validateFeePlan(parsed.data, classes, plans, null)
    if (invalid) return { error: invalid }

    const plan = await createFeePlan(input, class_ids)
    logAuditEvent({
      staffId,
      action: 'create',
      entity: 'fee_plan',
      entityId: plan.id,
      details: parsed.data,
    })
    revalidatePath('/finance')
  } catch (err) {
    console.error('[createFeePlanAction] error:', err)
    return {
      error: getUserFriendlyDbError(
        err,
        'Failed to create the fee plan. Please try again.',
      ),
    }
  }

  redirect('/finance?tab=fee-plans')
}

export async function updateFeePlanAction(
  id: string,
  formData: FormData,
): Promise<ActionResult> {
  const session = await auth()
  if (!session) return { error: 'Not authenticated' }
  const role = session.user.role as StaffRole
  if (!canManageFinance(role)) return { error: 'Not authorised' }
  const staffId = session.user.staffId ?? null

  const parsed = feePlanSchema.safeParse(
    extractFormFields(formData, ['class_ids']),
  )
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const { class_ids, ...input } = parsed.data

  try {
    const [existing, classes, plans] = await Promise.all([
      getFeePlanById(id),
      getAllClassesIncludingInactive(),
      getFeePlans(),
    ])
    if (!existing) return { error: 'Fee plan not found.' }
    const invalid = validateFeePlan(parsed.data, classes, plans, id)
    if (invalid) return { error: invalid }

    await updateFeePlan(id, input, class_ids)
    logAuditEvent({
      staffId,
      action: 'update',
      entity: 'fee_plan',
      entityId: id,
      details: parsed.data,
    })
    revalidatePath('/finance')
  } catch (err) {
    console.error('[updateFeePlanAction] error:', err)
    return {
      error: getUserFriendlyDbError(
        err,
        'Failed to update the fee plan. Please try again.',
      ),
    }
  }

  redirect('/finance?tab=fee-plans')
}
