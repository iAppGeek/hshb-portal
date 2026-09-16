import { describe, it, expect } from 'vitest'

import { cellClassName, type GridColumnMeta } from './columns'

describe('cellClassName', () => {
  it('scroll mode: no hidden classes regardless of meta.mobile', () => {
    expect(cellClassName({ mobile: 'hide' }, 'scroll')).toBe('')
    expect(cellClassName({ mobile: 'show' }, 'scroll')).toBe('')
    expect(cellClassName({}, 'scroll')).toBe('')
  })

  it('stacked mode: no hidden classes (StackedRow applies its own)', () => {
    expect(cellClassName({ mobile: 'hide' }, 'stacked')).toBe('')
  })

  it('hide-columns mode: hides columns marked mobile "hide"', () => {
    expect(cellClassName({ mobile: 'hide' }, 'hide-columns')).toBe(
      'hidden sm:table-cell',
    )
  })

  it('hide-columns mode: leaves columns marked "show" alone', () => {
    expect(cellClassName({ mobile: 'show' }, 'hide-columns')).toBe('')
  })

  it('hide-columns mode: leaves columns with no mobile meta alone', () => {
    expect(cellClassName({}, 'hide-columns')).toBe('')
  })

  it('adds text-right when align is "right"', () => {
    expect(cellClassName({ align: 'right' }, 'scroll')).toBe('text-right')
  })

  it('does not add text-right when align is "left"', () => {
    expect(cellClassName({ align: 'left' }, 'scroll')).toBe('')
  })

  it('appends a caller-supplied className', () => {
    expect(cellClassName({ className: 'w-32' }, 'scroll')).toBe('w-32')
  })

  it('combines hidden, align and className together', () => {
    const meta: GridColumnMeta = {
      mobile: 'hide',
      align: 'right',
      className: 'w-32',
    }
    expect(cellClassName(meta, 'hide-columns')).toBe(
      'hidden sm:table-cell text-right w-32',
    )
  })
})
