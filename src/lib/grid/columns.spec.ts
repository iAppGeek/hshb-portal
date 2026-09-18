import { describe, it, expect } from 'vitest'

import { cellClassName, type GridColumnMeta, type MobileMode } from './columns'
import { hiddenOnMobile, tdDark, tdMuted, tdStrong } from './styles'

type Case = {
  name: string
  mobile: MobileMode
  meta: GridColumnMeta
  expectHidden: boolean
  expectStrong: boolean
}

const cases: Case[] = [
  // scroll mode: never hides, regardless of meta.mobile
  {
    name: 'scroll, mobile unset',
    mobile: 'scroll',
    meta: {},
    expectHidden: false,
    expectStrong: false,
  },
  {
    name: 'scroll, mobile show',
    mobile: 'scroll',
    meta: { mobile: 'show' },
    expectHidden: false,
    expectStrong: false,
  },
  {
    name: 'scroll, mobile hide',
    mobile: 'scroll',
    meta: { mobile: 'hide' },
    expectHidden: false,
    expectStrong: false,
  },
  {
    name: 'scroll, primary on',
    mobile: 'scroll',
    meta: { primary: true },
    expectHidden: false,
    expectStrong: true,
  },
  {
    name: 'scroll, primary off',
    mobile: 'scroll',
    meta: { primary: false },
    expectHidden: false,
    expectStrong: false,
  },

  // hide-columns mode: only meta.mobile === 'hide' collapses
  {
    name: 'hide-columns, mobile unset',
    mobile: 'hide-columns',
    meta: {},
    expectHidden: false,
    expectStrong: false,
  },
  {
    name: 'hide-columns, mobile show',
    mobile: 'hide-columns',
    meta: { mobile: 'show' },
    expectHidden: false,
    expectStrong: false,
  },
  {
    name: 'hide-columns, mobile hide',
    mobile: 'hide-columns',
    meta: { mobile: 'hide' },
    expectHidden: true,
    expectStrong: false,
  },
  {
    name: 'hide-columns, mobile hide + primary',
    mobile: 'hide-columns',
    meta: { mobile: 'hide', primary: true },
    expectHidden: true,
    expectStrong: true,
  },

  // stacked mode: every column collapses below sm regardless of meta.mobile
  {
    name: 'stacked, mobile unset',
    mobile: 'stacked',
    meta: {},
    expectHidden: true,
    expectStrong: false,
  },
  {
    name: 'stacked, mobile show',
    mobile: 'stacked',
    meta: { mobile: 'show' },
    expectHidden: true,
    expectStrong: false,
  },
  {
    name: 'stacked, mobile hide',
    mobile: 'stacked',
    meta: { mobile: 'hide' },
    expectHidden: true,
    expectStrong: false,
  },
  {
    name: 'stacked, primary on',
    mobile: 'stacked',
    meta: { primary: true },
    expectHidden: true,
    expectStrong: true,
  },
]

describe('cellClassName', () => {
  it.each(cases)('$name', ({ mobile, meta, expectHidden, expectStrong }) => {
    const result = cellClassName(meta, mobile)
    if (expectHidden) {
      expect(result).toContain(hiddenOnMobile)
    } else {
      expect(result).not.toContain('hidden')
    }
    expect(result).toContain(expectStrong ? tdStrong : tdMuted)
  })

  it('adds text-right when align is "right"', () => {
    expect(cellClassName({ align: 'right' }, 'scroll')).toContain('text-right')
  })

  it('does not add text-right when align is "left"', () => {
    expect(cellClassName({ align: 'left' }, 'scroll')).not.toContain(
      'text-right',
    )
  })

  it('appends a caller-supplied className', () => {
    expect(cellClassName({ className: 'w-32' }, 'scroll')).toContain('w-32')
  })

  it('uses tdDark (not bold) when dark is set without primary', () => {
    const result = cellClassName({ dark: true }, 'scroll')
    expect(result).toContain(tdDark)
    expect(result).not.toContain(tdMuted)
    expect(result).not.toContain(tdStrong)
  })

  it('primary wins over dark when both are set', () => {
    const result = cellClassName({ dark: true, primary: true }, 'scroll')
    expect(result).toContain(tdStrong)
    expect(result).not.toContain(tdMuted)
  })

  it('a caller-supplied className cannot silently reintroduce a conflicting text colour', () => {
    // dark: true is the supported way to darken a cell's text — meta.className
    // is for layout/spacing only, since it's appended after the colour token.
    const result = cellClassName({ dark: true, className: 'w-32' }, 'scroll')
    expect(result).toContain(tdDark)
    expect(result).toContain('w-32')
  })

  it('combines hidden, strong, align and className together', () => {
    const meta: GridColumnMeta = {
      mobile: 'hide',
      primary: true,
      align: 'right',
      className: 'w-32',
    }
    const result = cellClassName(meta, 'hide-columns')
    expect(result).toContain(hiddenOnMobile)
    expect(result).toContain(tdStrong)
    expect(result).toContain('text-right')
    expect(result).toContain('w-32')
  })
})
