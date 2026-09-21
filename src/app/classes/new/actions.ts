'use server'

import { createClass, setClassStudents } from '@/db'
import { runAction, type ActionResult } from '@/lib/action'
import { canCreateClasses } from '@/lib/permissions'
import { createClassSchema } from '@/lib/schemas'

export async function createClassAction(
  formData: FormData,
): Promise<ActionResult> {
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
