const LINKTREE_URL = 'https://www.hshb.org.uk/linktree'
const STAFF_EMAIL_DOMAIN = '@hshb.org.uk'

/**
 * The website's /linktree page, personalised for a staff member: `?t=` takes
 * the local part of their school email, so the page's "Contact Us" link CCs
 * them. Falls back to the plain page for non-school emails.
 */
export function linktreeUrlFor(email: string): string {
  const normalised = email.trim().toLowerCase()
  if (!normalised.endsWith(STAFF_EMAIL_DOMAIN)) return LINKTREE_URL
  const localPart = normalised.slice(0, -STAFF_EMAIL_DOMAIN.length)
  if (!localPart) return LINKTREE_URL
  return `${LINKTREE_URL}?t=${encodeURIComponent(localPart)}`
}
