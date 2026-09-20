'use server'

import {
  updateClass,
  setClassStudents,
  getClassById,
  getCurrentAcademicYear,
} from '@/db'
import { ActionError, runAction, type ActionResult } from '@/lib/action'
import { isClassOpen } from '@/lib/classes'
import { canEditClasses } from '@/lib/permissions'
import { updateClassSchema } from '@/lib/schemas'

export async function updateClassAction(
  id: string,
  formData: FormData,
): Promise<ActionResult> {
  return runAction({
    name: 'classes.update',
    permission: canEditClasses,
    schema: updateClassSchema,
    arrayFields: ['student_ids'],
    formData,
    run: async ({ student_ids, ...classData }) => {
      const [cls, currentYear] = await Promise.all([
        getClassById(id),
        getCurrentAcademicYear(),
      ])
      if (!cls) throw new ActionError('Class not found')
      if (!isClassOpen(cls, currentYear)) {
        throw new ActionError(
          'Only active classes in the current academic year can be edited.',
        )
      }

      await updateClass(id, {
        name: classData.name,
        year_group: classData.year_group,
        room_number: classData.room_number,
        teacher_id: classData.teacher_id,
      })
      await setClassStudents(id, student_ids)
    },
    audit: { entity: 'class', action: 'update', entityId: () => id },
    revalidate: ['/classes'],
    redirectTo: '/classes',
    fallbackError: 'Failed to update class. Please try again.',
  })
}
