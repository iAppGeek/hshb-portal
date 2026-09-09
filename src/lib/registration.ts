export const PRIVACY_NOTICE_URL = 'https://hshb.org.uk/privacy-notice'

export const YEAR_GROUP_NOT_SURE = 'Not sure'

// Actioned registration submissions and photo opt-out requests are purged
// from Admin Tasks after this many days — see purgeActionedSubmissions in
// src/db/registrations.ts. Kept here (not in src/db) so client components
// can read the value without importing server-only code.
export const SUBMISSION_RETENTION_DAYS = 90

export function distinctYearGroups(
  classes: { year_group: string }[],
): string[] {
  return Array.from(new Set(classes.map((c) => c.year_group))).sort()
}
