export const BANK_DETAIL_FIELDS = [
  'bank_account_name',
  'bank_sort_code',
  'bank_account_number',
]

/**
 * Replaces sensitive values with whether they changed, so the audit log
 * records that bank details were edited without ever storing them.
 */
export function redactChanges(
  next: Record<string, unknown>,
  previous: Record<string, unknown> | null,
  fields: string[],
): Record<string, unknown> {
  const redacted = { ...next }
  for (const field of fields) {
    if (!(field in next)) continue
    const before = previous?.[field] ?? null
    const after = next[field] ?? null
    redacted[field] = before === after ? '[unchanged]' : '[changed]'
  }
  return redacted
}
