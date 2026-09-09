import { describe, it, expect } from 'vitest'

import {
  PRIVACY_NOTICE_URL,
  YEAR_GROUP_NOT_SURE,
  distinctYearGroups,
} from './registration'

describe('constants', () => {
  it('exports a placeholder privacy notice URL', () => {
    expect(PRIVACY_NOTICE_URL).toMatch(/^https:\/\//)
  })

  it('exports the "Not sure" year group option', () => {
    expect(YEAR_GROUP_NOT_SURE).toBe('Not sure')
  })
})

describe('distinctYearGroups', () => {
  it('sorts and dedupes year groups', () => {
    const classes = [
      { year_group: 'Year 3' },
      { year_group: 'Year 1' },
      { year_group: 'Year 1' },
      { year_group: 'Year 2' },
    ]
    expect(distinctYearGroups(classes)).toEqual(['Year 1', 'Year 2', 'Year 3'])
  })

  it('returns an empty array for no classes', () => {
    expect(distinctYearGroups([])).toEqual([])
  })
})
