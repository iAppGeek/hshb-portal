'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'

import { auth } from '@/auth'
import { migrateClass, logAuditEvent } from '@/db'
import type { MigrationAction } from '@/db'
import { getUserFriendlyDbError } from '@/lib/db-error'
import { canMigrateClasses } from '@/lib/permissions'
import {
  migrateClassSchema,
  extractFormFields,
  type ActionResult,
} from '@/lib/schemas'
import type { StaffRole } from '@/types/next-auth'

const ACTION_PREFIX = 'action_'

export async function migrateClassAction(
  formData: FormData,
): Promise<ActionResult> {
  const session = await auth()
  if (!session) return { error: 'Not authenticated' }
  const role = session.user.role as StaffRole
  if (!canMigrateClasses(role)) return { error: 'Not authorised' }
  const staffId = session.user.staffId ?? null

  const student_actions: Record<string, string> = {}
  for (const [key, value] of formData.entries()) {
    if (key.startsWith(ACTION_PREFIX)) {
      student_actions[key.slice(ACTION_PREFIX.length)] = value as string
    }
  }

  const raw = { ...extractFormFields(formData), student_actions }
  const parsed = migrateClassSchema.safeParse(raw)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const newClass =
    parsed.data.create_new_class === 'true'
      ? {
          name: parsed.data.name,
          year_group: parsed.data.year_group,
          room_number: parsed.data.room_number,
          academic_year_id: parsed.data.academic_year_id,
          teacher_id: parsed.data.teacher_id,
        }
      : null

  try {
    const result = await migrateClass({
      sourceClassId: parsed.data.source_class_id,
      studentActions: parsed.data.student_actions as Record<
        string,
        MigrationAction
      >,
      newClass,
    })

    if (result.new_class_id) {
      logAuditEvent({
        staffId,
        action: 'create',
        entity: 'class',
        entityId: result.new_class_id,
        details: parsed.data as Record<string, unknown>,
      })
    }
    logAuditEvent({
      staffId,
      action: 'update',
      entity: 'class',
      entityId: parsed.data.source_class_id,
      details: {
        migrated_to: result.new_class_id,
        deactivated: true,
        moved: result.moved,
        unassigned: result.unassigned,
        leavers: result.leavers,
      },
    })
    revalidatePath('/admin')
  } catch (err) {
    console.error('[migrateClassAction] error:', err)
    return {
      error: getUserFriendlyDbError(
        err,
        'Failed to migrate class. Please try again.',
      ),
    }
  }

  redirect('/admin')
}
