'use server'

import { migrateClass, logAuditEvent } from '@/db'
import type { MigrationAction } from '@/db'
import { ActionError, runAction, type ActionResult } from '@/lib/action'
import { canMigrateClasses } from '@/lib/permissions'
import { migrateClassSchema, extractFormFields } from '@/lib/schemas'

const ACTION_PREFIX = 'action_'

export async function migrateClassAction(
  formData: FormData,
): Promise<ActionResult> {
  return runAction({
    name: 'admin.class-migration.migrate',
    permission: canMigrateClasses,
    formData,
    // Per-student choices arrive as `action_<studentId>` fields, so the raw
    // object is assembled here rather than through `runAction`'s `schema`.
    run: async (_input, { actor, formData }) => {
      const student_actions: Record<string, string> = {}
      for (const [key, value] of formData.entries()) {
        if (key.startsWith(ACTION_PREFIX)) {
          student_actions[key.slice(ACTION_PREFIX.length)] = value as string
        }
      }

      const parsed = migrateClassSchema.safeParse({
        ...extractFormFields(formData),
        student_actions,
      })
      if (!parsed.success) throw new ActionError(parsed.error.issues[0].message)

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

      const result = await migrateClass({
        sourceClassId: parsed.data.source_class_id,
        studentActions: parsed.data.student_actions as Record<
          string,
          MigrationAction
        >,
        newClass,
      })

      // Two entries, so these are logged here rather than through the single
      // `audit` option: one for the class created, one for the class retired.
      if (result.new_class_id) {
        logAuditEvent({
          staffId: actor.staffId,
          action: 'create',
          entity: 'class',
          entityId: result.new_class_id,
          details: parsed.data as Record<string, unknown>,
        })
      }
      logAuditEvent({
        staffId: actor.staffId,
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
    },
    revalidate: ['/admin'],
    redirectTo: '/admin',
    fallbackError: 'Failed to migrate class. Please try again.',
  })
}
