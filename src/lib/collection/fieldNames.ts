/** The editable parts of one collection-permitted adult on the student form. */
export type CollectionAdultField = 'name' | 'relationship' | 'phone'

const FIELD_PREFIX = 'collection_adult'

/**
 * The form field name for one part of the adult at `index` in the student
 * form's list, e.g. `collection_adult_0_name`. Field errors use the same names.
 */
export function collectionAdultFieldName(
  index: number,
  field: CollectionAdultField,
): string {
  return `${FIELD_PREFIX}_${index}_${field}`
}

const NAME_FIELD = new RegExp(`^${FIELD_PREFIX}_(\\d+)_name$`)

/** The list positions present in `formData`, in order. */
export function collectionAdultIndexes(formData: FormData): number[] {
  const indexes = new Set<number>()
  for (const key of formData.keys()) {
    const match = NAME_FIELD.exec(key)
    if (match) indexes.add(Number(match[1]))
  }
  return [...indexes].sort((a, b) => a - b)
}
