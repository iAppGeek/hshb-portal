export function normaliseQuery(query: string): string {
  return query.toLowerCase().trim()
}

export function matchesAny(haystacks: string[], query: string): boolean {
  return haystacks.some((h) => h.toLowerCase().includes(query))
}

export function digitsOnly(value: string): string {
  return value.replace(/\D/g, '')
}

// Digits and phone punctuation only, with at least 3 digits once that
// punctuation is stripped — enough to route "07700 900000" or "+44 7700"
// to the phone comparison while a name or mixed query like "smith1" (or a
// bare digit or two) falls through to name/email matching instead. Without
// this, a query is routed to phone matching whenever it contains any digit
// at all, which makes something like "3" match nearly every phone number
// and bury the result the admin actually wanted.
const PHONE_SHAPE_RE = /^[\d\s()+-]+$/
const MIN_PHONE_QUERY_DIGITS = 3

export function isPhoneShapedQuery(query: string): boolean {
  return (
    PHONE_SHAPE_RE.test(query) &&
    digitsOnly(query).length >= MIN_PHONE_QUERY_DIGITS
  )
}

// Both name orderings ("First Last" and "Last, First") joined into one
// string, so a search query matches regardless of which order the admin
// types the name in.
export function fullName(firstName: string, lastName: string): string {
  return `${firstName} ${lastName} ${lastName}, ${firstName}`
}
