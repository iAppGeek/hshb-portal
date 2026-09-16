import { describe, it, expect } from 'vitest'

import { isUuid } from './uuid'

describe('isUuid', () => {
  it('accepts a canonical lowercase uuid', () => {
    expect(isUuid('20000000-0000-0000-0000-000000000001')).toBe(true)
  })

  it('accepts a mixed-case uuid', () => {
    expect(isUuid('20000000-0000-0000-0000-00000000000A')).toBe(true)
  })

  it('rejects an injection attempt via the or-filter separator', () => {
    expect(isUuid('20000000-0000-0000-0000-000000000001,active.eq.true')).toBe(
      false,
    )
  })

  it('rejects a non-uuid string', () => {
    expect(isUuid('not-a-uuid')).toBe(false)
  })

  it('rejects an empty string', () => {
    expect(isUuid('')).toBe(false)
  })

  it('rejects a uuid missing a segment', () => {
    expect(isUuid('20000000-0000-0000-0000')).toBe(false)
  })

  it('rejects a uuid with an extra trailing character', () => {
    expect(isUuid('20000000-0000-0000-0000-0000000000011')).toBe(false)
  })
})
