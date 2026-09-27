import 'server-only'

import type { z } from 'zod'

import { createGuardian } from '@/db'
import { ActionError, firstFieldErrors, prefixFieldErrors } from '@/lib/action'
import {
  extractGuardianFields,
  type guardianSchema,
  type guardianSchemaWithOccupation,
} from '@/lib/schemas'

/** The id of the linked guardian, creating the guardian first when new. */
export async function resolveGuardian(
  guardian: z.infer<typeof guardianSchema>,
): Promise<string> {
  if (guardian.mode === 'existing') return guardian.existing_id

  const { mode: _, ...data } = guardian
  const created = await createGuardian({
    first_name: data.first_name,
    last_name: data.last_name,
    phone: data.phone,
    email: data.email ?? undefined,
    occupation: data.occupation ?? undefined,
    address_line_1: data.address_line_1 ?? undefined,
    address_line_2: data.address_line_2 ?? undefined,
    city: data.city ?? undefined,
    postcode: data.postcode ?? undefined,
  })
  return created.id
}

/**
 * The validating half of one `GuardianPicker`. Guardians live in several
 * prefixed blocks of the same form, so each is parsed here rather than through
 * `runAction`'s single `schema`; field errors keep the `${prefix}_` names the
 * picker renders. Parsing is separate from `resolveGuardian` so a caller
 * filling several slots can reject the whole form before writing any row.
 */
export function parseGuardianSlot(
  formData: FormData,
  prefix: string,
  schema: typeof guardianSchema | typeof guardianSchemaWithOccupation,
): z.infer<typeof guardianSchema> {
  const parsed = schema.safeParse(extractGuardianFields(formData, prefix))
  if (!parsed.success)
    throw new ActionError(
      parsed.error.issues[0].message,
      prefixFieldErrors(firstFieldErrors(parsed.error), prefix),
    )
  return parsed.data
}
