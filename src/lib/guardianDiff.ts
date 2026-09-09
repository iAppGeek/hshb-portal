import type { GuardianMatch } from '@/db'
import type { Tables } from '@/types/database'

type Contact = Tables<'registration_submission_contacts'>
type Submission = Pick<
  Tables<'registration_submissions'>,
  'address_line_1' | 'address_line_2' | 'city' | 'postcode'
>

export type FieldDiff = {
  field: string
  old: string | null
  new: string | null
}

// Mirrors the UPDATE in approve_registration's reuse branch so the page shows
// exactly what approval will write.
export function guardianReuseDiff(
  match: GuardianMatch,
  contact: Contact,
  submission: Submission,
): FieldDiff[] {
  const same = contact.same_as_child_address
  const next = {
    phone: contact.phone,
    email: contact.email ?? match.email,
    occupation: contact.occupation ?? match.occupation,
    address_line_1: same
      ? submission.address_line_1
      : (contact.address_line_1 ?? match.address_line_1),
    address_line_2: same
      ? submission.address_line_2
      : (contact.address_line_2 ?? match.address_line_2),
    city: same ? submission.city : (contact.city ?? match.city),
    postcode: same ? submission.postcode : (contact.postcode ?? match.postcode),
  }
  return (Object.keys(next) as (keyof typeof next)[])
    .filter((k) => (match[k] ?? null) !== (next[k] ?? null))
    .map((k) => ({ field: k, old: match[k] ?? null, new: next[k] ?? null }))
}
