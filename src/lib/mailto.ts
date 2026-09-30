/** Rough ceiling for mailto href length across common mail clients and OS limits. */
export const DEFAULT_MAX_MAILTO_LENGTH = 2000

export function normalizeAndDedupeEmails(
  inputs: readonly (string | null | undefined)[],
): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of inputs) {
    if (raw == null) continue
    const trimmed = raw.trim()
    if (!trimmed) continue
    const key = trimmed.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(trimmed)
  }
  return out
}

export function mailtoWithBcc(
  emails: string[],
  opts?: {
    subject?: string
    body?: string
    maxTotalLength?: number
  },
): string | null {
  const list = normalizeAndDedupeEmails(emails)
  if (list.length === 0) return null

  const params = new URLSearchParams()
  params.set('bcc', list.join(','))
  if (opts?.subject) params.set('subject', opts.subject)
  if (opts?.body) params.set('body', opts.body)

  const href = `mailto:?${params.toString()}`
  const max = opts?.maxTotalLength ?? DEFAULT_MAX_MAILTO_LENGTH
  if (href.length > max) return null
  return href
}

export function staffEmailsForMailto(
  staff: ReadonlyArray<{ email: string; personal_email?: string | null }>,
  includePersonal: boolean,
): string[] {
  const raw: (string | null | undefined)[] = []
  for (const m of staff) {
    raw.push(m.email)
    if (includePersonal) raw.push(m.personal_email)
  }
  return normalizeAndDedupeEmails(raw)
}

export function guardianEmailsForMailto(
  students: ReadonlyArray<{
    primary_guardian?: { email?: string | null } | null
    secondary_guardian?: { email?: string | null } | null
  }>,
): string[] {
  const raw: (string | null | undefined)[] = []
  for (const s of students) {
    raw.push(s.primary_guardian?.email)
    raw.push(s.secondary_guardian?.email)
  }
  return normalizeAndDedupeEmails(raw)
}

/**
 * Semicolon-separated addresses. Outlook uses `;` between recipients, so this
 * pastes into a To, Cc, or Bcc box as one address per person.
 * A value may already be `"Name" <email>`; that form is kept as-is.
 */
export function formatEmailsForOutlook(emails: string[]): string {
  return normalizeAndDedupeEmails(emails).join('; ')
}

/** `"Name" <email>` becomes the address. A bare address is unchanged. */
function emailForMailto(
  value: string | null | undefined,
): string | null | undefined {
  if (value == null) return value
  const match = value.match(/<([^<>]+)>\s*$/)
  return match ? match[1].trim() : value
}

export function mailtoWithRecipients(fields: {
  to?: readonly (string | null | undefined)[]
  cc?: readonly (string | null | undefined)[]
  bcc?: readonly (string | null | undefined)[]
  subject?: string
  body?: string
  maxTotalLength?: number
}): string | null {
  const to = normalizeAndDedupeEmails((fields.to ?? []).map(emailForMailto))
  const cc = normalizeAndDedupeEmails((fields.cc ?? []).map(emailForMailto))
  const bcc = normalizeAndDedupeEmails((fields.bcc ?? []).map(emailForMailto))
  if (to.length === 0 && cc.length === 0 && bcc.length === 0) return null

  const params = new URLSearchParams()
  if (cc.length > 0) params.set('cc', cc.join(','))
  if (bcc.length > 0) params.set('bcc', bcc.join(','))
  if (fields.subject) params.set('subject', fields.subject)
  if (fields.body) params.set('body', fields.body)

  const query = params.toString()
  const toPart = to.map((email) => encodeURIComponent(email)).join(',')
  const href = `mailto:${toPart}${query ? `?${query}` : ''}`
  const max = fields.maxTotalLength ?? DEFAULT_MAX_MAILTO_LENGTH
  if (href.length > max) return null
  return href
}
