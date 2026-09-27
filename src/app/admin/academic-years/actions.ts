'use server'

import {
  createAcademicYear,
  setCurrentAcademicYear,
  updateAcademicYear,
} from '@/db'
import { parseOrThrow, runAction, type ActionResult } from '@/lib/action'
import { canAccessAdminTasks } from '@/lib/permissions'
import {
  academicYearDatesSchema,
  academicYearSchema,
  extractFormFields,
} from '@/lib/schemas'

/** Merged create/update, following the plan 05 pattern: `id === null` creates. */
export async function saveAcademicYearAction(
  id: string | null,
  formData: FormData,
): Promise<ActionResult> {
  const isCreate = id === null

  return runAction({
    name: isCreate
      ? 'admin.academic-years.create'
      : 'admin.academic-years.update',
    permission: canAccessAdminTasks,
    formData,
    run: async (_input, { formData }) => {
      const fields = extractFormFields(formData)

      if (isCreate) {
        const d = parseOrThrow(academicYearSchema, fields)
        const year = await createAcademicYear(d)
        return { id: year.id }
      }

      const d = parseOrThrow(academicYearDatesSchema, fields)
      await updateAcademicYear(id, d)
      return { id }
    },
    audit: {
      entity: 'academic_year',
      action: isCreate ? 'create' : 'update',
      entityId: (result) => result.id,
    },
    redirectTo: '/admin?tab=academic-years',
    fallbackError: 'Failed to save academic year. Please try again.',
  })
}

/** Stays on the tab: returns the new current year's id for the table to show. */
export async function setCurrentAcademicYearAction(
  id: string,
  previousId: string | null,
): Promise<ActionResult<{ currentId: string }>> {
  return runAction({
    name: 'admin.academic-years.set-current',
    permission: canAccessAdminTasks,
    formData: new FormData(),
    run: async () => {
      await setCurrentAcademicYear(id)
      return { currentId: id }
    },
    audit: {
      entity: 'academic_year',
      action: 'update',
      entityId: () => id,
      details: () => ({ previous: previousId, current: id }),
    },
    fallbackError: 'Failed to set the current academic year. Please try again.',
  })
}
