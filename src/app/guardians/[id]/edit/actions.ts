'use server'

import { updateGuardian } from '@/db'
import { runAction, type ActionResult } from '@/lib/action'
import { canEditGuardians } from '@/lib/permissions'
import { updateGuardianSchema } from '@/lib/schemas'

export async function updateGuardianAction(
  id: string,
  formData: FormData,
): Promise<ActionResult> {
  return runAction({
    name: 'guardians.update',
    permission: canEditGuardians,
    schema: updateGuardianSchema,
    formData,
    run: (input) => updateGuardian(id, input),
    audit: { entity: 'guardian', action: 'update', entityId: () => id },
    revalidate: ['/students', `/guardians/${id}/edit`],
    redirectTo: `/guardians/${id}/edit`,
    fallbackError: 'Failed to save guardian. Please try again.',
  })
}
