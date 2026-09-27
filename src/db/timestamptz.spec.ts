import { describe, expect, it } from 'vitest'

import { toIsoTimestamp } from './timestamptz'

describe('toIsoTimestamp', () => {
  it('converts Postgres text output to the ISO form PostgREST returned', () => {
    expect(toIsoTimestamp('2026-09-27 12:00:00.123456+00')).toBe(
      '2026-09-27T12:00:00.123456+00:00',
    )
    expect(toIsoTimestamp('2026-09-27 12:00:00-05')).toBe(
      '2026-09-27T12:00:00-05:00',
    )
  })

  it('keeps an offset that already has minutes', () => {
    expect(toIsoTimestamp('2026-09-27 12:00:00+05:30')).toBe(
      '2026-09-27T12:00:00+05:30',
    )
  })

  it('is idempotent for values already in ISO form', () => {
    const iso = '2026-09-27T12:00:00.123+00:00'
    expect(toIsoTimestamp(iso)).toBe(iso)
  })
})
