import { describe, it, expect } from 'vitest'

import {
  card,
  scroll,
  table,
  thead,
  theadStacked,
  th,
  tdHiddenOnMobile,
  tdBase,
  tdMuted,
  tdStrong,
  hiddenOnMobile,
  tbody,
  row,
  rowStacked,
  tdStackedSummary,
  stackedTitle,
  actionsCell,
  rowLink,
} from './styles'

describe('grid styles tokens', () => {
  it('every token is a non-empty string', () => {
    for (const token of [
      card,
      scroll,
      table,
      thead,
      theadStacked,
      th,
      tdHiddenOnMobile,
      tdBase,
      tdMuted,
      tdStrong,
      hiddenOnMobile,
      tbody,
      row,
      rowStacked,
      tdStackedSummary,
      stackedTitle,
      actionsCell,
      rowLink,
    ]) {
      expect(typeof token).toBe('string')
      expect(token.length).toBeGreaterThan(0)
    }
  })
})
