const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Whether a string is a syntactically valid UUID. Guard any id that flows
 * into an interpolated `.or()`/filter string before it reaches the
 * database — a crafted value such as `<uuid>,active.eq.true` would
 * otherwise inject an extra disjunct into the filter.
 */
export function isUuid(value: string): boolean {
  return UUID_RE.test(value)
}
