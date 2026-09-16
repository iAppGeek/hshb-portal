import { describe, it, expect } from 'vitest'

import { card, scroll, table, theadStacked, th, td, tbody } from './styles'

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

  it('tbody', () => {
    expect(tbody).toBe('divide-y divide-gray-200 bg-white')
  })

  it('every token is a non-empty string', () => {
    for (const token of [card, scroll, table, theadStacked, th, td, tbody]) {
      expect(typeof token).toBe('string')
      expect(token.length).toBeGreaterThan(0)
    }
  })
})
