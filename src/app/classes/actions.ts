'use server'

import {
  createClass,
  getClassById,
  getCurrentAcademicYear,
  setClassStudents,
  updateClass,
} from '@/db'
import { ActionError, runAction, type ActionResult } from '@/lib/action'
import { isClassOpen } from '@/lib/classes'
import { canCreateClasses, canEditClasses } from '@/lib/permissions'
import { createClassSchema, updateClassSchema } from '@/lib/schemas'

export async function saveClassAction(
  id: string | null,
  formData: FormData,
): Promise<ActionResult> {
  // A class's academic year is fixed once created, so creating parses
  // `academic_year_id` and editing does not: the two schemas differ, hence
  // two runAction calls.
  if (id === null) {
    return runAction({
      name: 'classes.create',
      permission: canCreateClasses,
      schema: createClassSchema,
      arrayFields: ['student_ids'],
      formData,
      run: async ({ student_ids, ...classData }) => {
        const cls = await createClass({
          name: classData.name,
          year_group: classData.year_group,
          room_number: classData.room_number,
          academic_year_id: classData.academic_year_id,
          teacher_id: classData.teacher_id,
        })
        await setClassStudents(cls.id, student_ids)
        return cls
      },
      audit: { entity: 'class', action: 'create', entityId: (cls) => cls.id },
      redirectTo: '/classes',
      fallbackError: 'Failed to create class. Please try again.',
    })
  }

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
    redirectTo: '/classes',
    fallbackError: 'Failed to update class. Please try again.',
  })
}
