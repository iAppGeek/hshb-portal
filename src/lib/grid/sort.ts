export function compareNullableText(
  a: string | null,
  b: string | null,
): number {
  if (a === b) return 0
  if (a === null) return 1
  if (b === null) return -1
  return a.localeCompare(b)
}

export function compareByName(
  a: { first_name: string; last_name: string },
  b: { first_name: string; last_name: string },
): number {
  const lnc = a.last_name.localeCompare(b.last_name)
  return lnc !== 0 ? lnc : a.first_name.localeCompare(b.first_name)
}
