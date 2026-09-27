'use server'

import { createStaff, updateStaff } from '@/db'
import { runAction, type ActionResult } from '@/lib/action'
import { canCreateStaff, canEditStaff } from '@/lib/permissions'
import { staffSchema } from '@/lib/schemas'

export async function saveStaffAction(
  id: string | null,
  formData: FormData,
): Promise<ActionResult> {
  const isCreate = id === null

  return runAction({
    name: isCreate ? 'staff.create' : 'staff.update',
    permission: isCreate ? canCreateStaff : canEditStaff,
    schema: staffSchema,
    formData,
    run: async (input) => {
      if (isCreate) return createStaff(input)
      await updateStaff(id, input)
      return { id }
    },
    audit: {
      entity: 'staff',
      action: isCreate ? 'create' : 'update',
      entityId: (staff) => staff.id,
    },
    redirectTo: '/staff',
    fallbackError: isCreate
      ? 'Failed to create staff member. Please try again.'
      : 'Failed to update staff member. Please try again.',
  })
}
