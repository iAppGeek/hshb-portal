'use server'

import { createStaff, updateStaff } from '@/db'
import { runAction, type ActionResult } from '@/lib/action'
import { canCreateStaff, canEditStaff } from '@/lib/permissions'
import { staffSchema } from '@/lib/schemas'

export async function saveStaffAction(
  id: string | null,
  formData: FormData,
): Promise<ActionResult> {
  return runAction({
    name: id === null ? 'staff.create' : 'staff.update',
    permission: id === null ? canCreateStaff : canEditStaff,
    schema: staffSchema,
    formData,
    run: async (input) => {
      if (id === null) return createStaff(input)
      await updateStaff(id, input)
      return { id }
    },
    audit: {
      entity: 'staff',
      action: id === null ? 'create' : 'update',
      entityId: (staff) => staff.id,
    },
    redirectTo: '/staff',
    fallbackError:
      id === null
        ? 'Failed to create staff member. Please try again.'
        : 'Failed to update staff member. Please try again.',
  })
}
