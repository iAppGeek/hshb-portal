import { describe, it, expect } from 'vitest'

import { personName, formatGbp } from './format'

describe('personName', () => {
  it('returns "—" for a null person', () => {
    expect(personName(null)).toBe('—')
  })

  it('returns "—" for an undefined person', () => {
    expect(personName(undefined)).toBe('—')
  })

  it('composes "Last, First" for lastFirst style', () => {
    expect(
      personName({ first_name: 'Anna', last_name: 'Smith' }, 'lastFirst'),
    ).toBe('Smith, Anna')
  })

  it('composes "First Last" for firstLast style by default', () => {
    expect(personName({ first_name: 'Anna', last_name: 'Smith' })).toBe(
      'Anna Smith',
    )
  })

  it('prefers display_name for firstLast style when set', () => {
    expect(
      personName({
        first_name: 'Anna',
        last_name: 'Smith',
        display_name: 'Ms Smith',
      }),
    ).toBe('Ms Smith')
  })

  it('ignores display_name for lastFirst style', () => {
    expect(
      personName(
        {
          first_name: 'Anna',
          last_name: 'Smith',
          display_name: 'Ms Smith',
        },
        'lastFirst',
      ),
    ).toBe('Smith, Anna')
  })

  it('falls back to composed name for firstLast style when display_name is null', () => {
    expect(
      personName({
        first_name: 'Anna',
        last_name: 'Smith',
        display_name: null,
      }),
    ).toBe('Anna Smith')
  })
})

describe('formatGbp re-export', () => {
  it('re-exports formatGbp from ./fees', () => {
    expect(formatGbp(12.5)).toBe('£12.50')
  })
})
