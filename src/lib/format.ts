export type NamedPerson = {
  first_name: string
  last_name: string
  display_name?: string | null
}

/** '—' for a missing person (guardians may be null); otherwise the composed name. */
export function personName(
  p: NamedPerson | null | undefined,
  style: 'lastFirst' | 'firstLast' = 'firstLast',
): string {
  if (!p) return '—'
  if (style === 'lastFirst') return `${p.last_name}, ${p.first_name}`
  return p.display_name ?? `${p.first_name} ${p.last_name}`
}

export { formatGbp } from './fees'
