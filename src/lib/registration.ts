import { compareYearGroups } from './classes'

export const YEAR_GROUP_NOT_SURE = 'Not sure'

export function distinctYearGroups(
  classes: { year_group: string }[],
): string[] {
  return Array.from(new Set(classes.map((c) => c.year_group))).sort(
    compareYearGroups,
  )
}
