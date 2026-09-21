'use server'

import { createStaff } from '@/db'
import { runAction, type ActionResult } from '@/lib/action'
import { canCreateStaff } from '@/lib/permissions'
import { createStaffSchema } from '@/lib/schemas'

export async function createStaffAction(
  formData: FormData,
): Promise<ActionResult> {
  return runAction({
    name: 'staff.create',
    permission: canCreateStaff,
    schema: createStaffSchema,
    formData,
    run: (input) => createStaff(input),
    audit: {
      entity: 'staff',
      action: 'create',
      entityId: (staff) => staff.id,
    },
    redirectTo: '/staff',
    fallbackError: 'Failed to create staff member. Please try again.',
  })
}
