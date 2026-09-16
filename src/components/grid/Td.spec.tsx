import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'

import { td, tdPrimary, tdVisible } from '@/lib/grid/styles'

import Td from './Td'

function renderTd(props: React.ComponentProps<typeof Td>) {
  return render(
    <table>
      <tbody>
        <tr>
          <Td {...props} />
        </tr>
      </tbody>
    </table>,
  )
}

describe('Td', () => {
  it('uses the hidden-on-mobile "td" token in stacked mode', () => {
    renderTd({ children: 'Room 1', mobile: 'stacked' })
    expect(screen.getByRole('cell').className).toBe(td)
  })

  it('uses the always-visible "tdVisible" token in scroll mode', () => {
    renderTd({ children: 'Room 1', mobile: 'scroll' })
    expect(screen.getByRole('cell').className).toBe(tdVisible)
  })

  it('uses the always-visible "tdVisible" token in hide-columns mode by default', () => {
    renderTd({ children: 'Room 1', mobile: 'hide-columns' })
    expect(screen.getByRole('cell').className).toBe(tdVisible)
  })

  it('uses "tdPrimary" when primary is set, outside stacked mode', () => {
    renderTd({ children: 'Ada Lovelace', mobile: 'scroll', primary: true })
    expect(screen.getByRole('cell').className).toBe(tdPrimary)
  })

  it('ignores primary in stacked mode (desktop cells are never primary)', () => {
    renderTd({ children: 'Ada Lovelace', mobile: 'stacked', primary: true })
    expect(screen.getByRole('cell').className).toBe(td)
  })

  it('hides columns marked mobile: "hide" in hide-columns mode', () => {
    renderTd({
      children: 'Room 1',
      mobile: 'hide-columns',
      meta: { mobile: 'hide' },
    })
    expect(screen.getByRole('cell').className).toContain('hidden sm:table-cell')
  })

  it('never hides columns in scroll mode, even when marked "hide"', () => {
    renderTd({
      children: 'Room 1',
      mobile: 'scroll',
      meta: { mobile: 'hide' },
    })
    expect(screen.getByRole('cell').className).not.toContain('hidden')
  })

  it('right-aligns when meta.align is "right"', () => {
    renderTd({ children: '£10', mobile: 'scroll', meta: { align: 'right' } })
    expect(screen.getByRole('cell').className).toContain('text-right')
  })

  it('appends a caller-supplied className', () => {
    renderTd({ children: 'x', mobile: 'scroll', meta: { className: 'w-8' } })
    expect(screen.getByRole('cell').className).toContain('w-8')
  })

  it('renders children', () => {
    renderTd({ children: 'Hello', mobile: 'scroll' })
    expect(screen.getByText('Hello')).toBeTruthy()
  })
})
