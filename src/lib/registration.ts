import { compareYearGroups } from './classes'

export const PRIVACY_NOTICE_URL =
  'https://www.hshb.org.uk/policies/privacy-policy'
export const POLICIES_URL = 'https://www.hshb.org.uk/policies'

export const YEAR_GROUP_NOT_SURE = 'Not sure'

export function distinctYearGroups(
  classes: { year_group: string }[],
): string[] {
  return Array.from(new Set(classes.map((c) => c.year_group))).sort(
    compareYearGroups,
  )
}
