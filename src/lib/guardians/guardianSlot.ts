import 'server-only'

import type { z } from 'zod'

import type { GuardianSlot } from '@/db'
import { parseOrThrow } from '@/lib/action'
import {
  extractGuardianFields,
  type guardianSchema,
  type guardianSchemaWithOccupation,
} from '@/lib/schemas'

/** The guardian to link: an existing one, or a new one for `saveStudent` to create. */
export function toGuardianSlot(
  guardian: z.infer<typeof guardianSchema>,
): GuardianSlot {
  if (guardian.mode === 'existing') return { id: guardian.existing_id }

  const { mode: _, ...data } = guardian
  return {
    create: {
      first_name: data.first_name,
      last_name: data.last_name,
      phone: data.phone,
      email: data.email ?? undefined,
      occupation: data.occupation ?? undefined,
      address_line_1: data.address_line_1 ?? undefined,
      address_line_2: data.address_line_2 ?? undefined,
      city: data.city ?? undefined,
      postcode: data.postcode ?? undefined,
    },
  }
}

/**
 * The validating half of one `GuardianPicker`. Guardians live in several
 * prefixed blocks of the same form, so each is parsed here rather than through
 * `runAction`'s single `schema`; field errors keep the `${prefix}_` names the
 * picker renders. A caller filling several slots parses them all, so it can
 * reject the whole form before writing any row.
 */
export function parseGuardianSlot(
  formData: FormData,
  prefix: string,
  schema: typeof guardianSchema | typeof guardianSchemaWithOccupation,
): z.infer<typeof guardianSchema> {
  return parseOrThrow<z.infer<typeof guardianSchema>>(
    schema,
    extractGuardianFields(formData, prefix),
    prefix,
  )
}
