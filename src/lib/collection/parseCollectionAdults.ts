import 'server-only'

import type { CollectionAdult } from '@/db/schema'
import { ActionError, firstFieldErrors } from '@/lib/action'
import { collectionAdultSchema } from '@/lib/schemas'

import {
  collectionAdultFieldName,
  collectionAdultIndexes,
  type CollectionAdultField,
} from './fieldNames'

const FIELDS: CollectionAdultField[] = ['name', 'relationship', 'phone']

function fieldValue(
  formData: FormData,
  index: number,
  field: CollectionAdultField,
): string {
  const value = formData.get(collectionAdultFieldName(index, field))
  return typeof value === 'string' ? value : ''
}

/**
 * The student form's list of adults allowed to collect the child, in the
 * order shown. A row left completely blank is dropped. Every row is checked
 * before throwing, so the form can show each row's mistakes at once; field
 * errors keep the names the form renders.
 */
export function parseCollectionAdults(formData: FormData): CollectionAdult[] {
  const adults: CollectionAdult[] = []
  const fieldErrors: Record<string, string> = {}
  let firstMessage: string | null = null

  for (const index of collectionAdultIndexes(formData)) {
    const raw = Object.fromEntries(
      FIELDS.map((field) => [field, fieldValue(formData, index, field)]),
    )
    if (FIELDS.every((field) => raw[field].trim() === '')) continue

    const parsed = collectionAdultSchema.safeParse(raw)
    if (parsed.success) {
      adults.push(parsed.data)
      continue
    }
    firstMessage ??= parsed.error.issues[0].message
    for (const [field, message] of Object.entries(
      firstFieldErrors(parsed.error),
    )) {
      fieldErrors[
        collectionAdultFieldName(index, field as CollectionAdultField)
      ] = message
    }
  }

  if (firstMessage !== null) throw new ActionError(firstMessage, fieldErrors)
  return adults
}
