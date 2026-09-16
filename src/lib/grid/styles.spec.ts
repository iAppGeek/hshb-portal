import { describe, it, expect } from 'vitest'

import {
  card,
  scroll,
  table,
  thead,
  theadStacked,
  th,
  td,
  tdVisible,
  tdPrimary,
  tdPrimaryHidden,
  tbody,
  row,
  rowStacked,
  tdStackedSummary,
} from './styles'

describe('grid styles tokens', () => {
  it('card', () => {
    expect(card).toBe(
      'overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-gray-200',
    )
  })

  it('scroll', () => {
    expect(scroll).toBe('overflow-x-auto')
  })

  it('table', () => {
    expect(table).toBe('min-w-full divide-y divide-gray-200')
  })

  it('thead', () => {
    expect(thead).toBe('bg-gray-50')
  })

  it('theadStacked', () => {
    expect(theadStacked).toBe('hidden bg-gray-50 sm:table-header-group')
  })

  it('th', () => {
    expect(th).toBe(
      'px-3 py-3 text-left text-xs font-medium tracking-wide text-gray-500 uppercase sm:px-6',
    )
  })

  it('td', () => {
    expect(td).toBe(
      'hidden px-3 py-4 text-sm text-gray-500 sm:table-cell sm:px-6',
    )
  })

  it('tdVisible', () => {
    expect(tdVisible).toBe('px-3 py-4 text-sm text-gray-500 sm:px-6')
  })

  it('tdPrimary', () => {
    expect(tdPrimary).toBe(
      'px-3 py-4 text-sm font-medium text-gray-900 sm:px-6',
    )
  })

  it('tdPrimaryHidden', () => {
    expect(tdPrimaryHidden).toBe(
      'hidden px-3 py-4 text-sm font-medium text-gray-900 sm:table-cell sm:px-6',
    )
  })

  it('tbody', () => {
    expect(tbody).toBe('divide-y divide-gray-200 bg-white')
  })

  it('row', () => {
    expect(row).toBe('hover:bg-gray-50')
  })

  it('rowStacked', () => {
    expect(rowStacked).toBe(
      'block border-b border-gray-200 last:border-0 hover:bg-gray-50 sm:table-row sm:border-0',
    )
  })

  it('tdStackedSummary', () => {
    expect(tdStackedSummary).toBe(
      'block px-4 py-4 text-sm text-gray-500 sm:hidden',
    )
  })

  it('every token is a non-empty string', () => {
    for (const token of [
      card,
      scroll,
      table,
      thead,
      theadStacked,
      th,
      td,
      tdVisible,
      tdPrimary,
      tdPrimaryHidden,
      tbody,
      row,
      rowStacked,
      tdStackedSummary,
    ]) {
      expect(typeof token).toBe('string')
      expect(token.length).toBeGreaterThan(0)
    }
  })
})
