'use server'

import {
  createLessonPlan,
  updateLessonPlan,
  getLessonPlanById,
  getClassesByTeacher,
} from '@/db'
import { ActionError, runAction, type ActionResult } from '@/lib/action'
import {
  canCreateLessonPlans,
  canEditLessonPlans,
  isTeacher,
} from '@/lib/permissions'
import { createLessonPlanSchema, updateLessonPlanSchema } from '@/lib/schemas'

const DUPLICATE =
  'A lesson plan already exists for this class on this date.' as const

/** The unique index on (class_id, lesson_date) has a message of its own. */
function rethrowDuplicate(err: unknown): never {
  if ((err as { code?: string })?.code === '23505')
    throw new ActionError(DUPLICATE)
  throw err
}

async function assertOwnClass(
  staffId: string,
  classId: string,
  message: string,
): Promise<void> {
  const classes = await getClassesByTeacher(staffId)
  if (!classes.some((c) => c.id === classId)) throw new ActionError(message)
}

export async function createLessonPlanAction(
  formData: FormData,
): Promise<ActionResult> {
  return runAction({
    name: 'lesson-plans.create',
    permission: canCreateLessonPlans,
    schema: createLessonPlanSchema,
    formData,
    run: async ({ class_id, lesson_date, description }, { actor }) => {
      if (isTeacher(actor.role)) {
        await assertOwnClass(
          actor.staffId,
          class_id,
          'You can only create lesson plans for your own class.',
        )
      }
      return createLessonPlan({
        class_id,
        lesson_date,
        description,
        created_by: actor.staffId,
      }).catch(rethrowDuplicate)
    },
    audit: {
      entity: 'lesson_plan',
      action: 'create',
      entityId: (plan) => plan.id,
    },
    redirectTo: '/lesson-plans',
    fallbackError: 'Failed to create lesson plan. Please try again.',
  })
}

export async function updateLessonPlanAction(
  id: string,
  formData: FormData,
): Promise<ActionResult> {
  return runAction({
    name: 'lesson-plans.update',
    permission: canEditLessonPlans,
    schema: updateLessonPlanSchema,
    formData,
    run: async ({ lesson_date, description }, { actor }) => {
      if (isTeacher(actor.role)) {
        const plan = await getLessonPlanById(id)
        if (!plan) throw new ActionError('Lesson plan not found.')
        await assertOwnClass(
          actor.staffId,
          plan.class_id,
          'You can only edit lesson plans for your own class.',
        )
      }
      await updateLessonPlan(id, {
        lesson_date,
        description,
        updated_by: actor.staffId,
      }).catch(rethrowDuplicate)
    },
    audit: { entity: 'lesson_plan', action: 'update', entityId: () => id },
    redirectTo: '/lesson-plans',
    fallbackError: 'Failed to update lesson plan. Please try again.',
  })
}
