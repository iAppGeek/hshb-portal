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
  tdDark,
  tdStrong,
  hiddenOnMobile,
  tbody,
  row,
  rowStacked,
  tdStackedSummary,
  stackedTitle,
  actionsCell,
  rowLink,
  printTable,
  printTh,
  printTd,
  printBlankLine,
  printThCompact,
  printTdCompact,
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
      tdDark,
      tdStrong,
      hiddenOnMobile,
      tbody,
      row,
      rowStacked,
      tdStackedSummary,
      stackedTitle,
      actionsCell,
      rowLink,
      printTable,
      printTh,
      printTd,
      printBlankLine,
      printThCompact,
      printTdCompact,
    ]) {
      expect(typeof token).toBe('string')
      expect(token.length).toBeGreaterThan(0)
    }
  })
})
