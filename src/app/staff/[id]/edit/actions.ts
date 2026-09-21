'use server'

import { updateStaff } from '@/db'
import { runAction, type ActionResult } from '@/lib/action'
import { canEditStaff } from '@/lib/permissions'
import { updateStaffSchema } from '@/lib/schemas'

export async function updateStaffAction(
  id: string,
  formData: FormData,
): Promise<ActionResult> {
  return runAction({
    name: 'staff.update',
    permission: canEditStaff,
    schema: updateStaffSchema,
    formData,
    run: (input) => updateStaff(id, input),
    audit: { entity: 'staff', action: 'update', entityId: () => id },
    redirectTo: '/staff',
    fallbackError: 'Failed to update staff member. Please try again.',
  })
}
