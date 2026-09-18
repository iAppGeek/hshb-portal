import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'

import { cellClassName } from '@/lib/grid/columns'

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
  it('renders children', () => {
    renderTd({ children: 'Hello', mobile: 'scroll' })
    expect(screen.getByText('Hello')).toBeTruthy()
  })

  it("uses cellClassName's output for its class", () => {
    const meta = { align: 'right' as const, primary: true }
    renderTd({ children: 'Room 1', mobile: 'hide-columns', meta })
    expect(screen.getByRole('cell').className).toBe(
      cellClassName(meta, 'hide-columns'),
    )
  })

  it('has no colSpan attribute by default', () => {
    renderTd({ children: 'Hello', mobile: 'scroll' })
    expect(screen.getByRole('cell')).not.toHaveAttribute('colspan')
  })

  it('applies a colSpan when given one', () => {
    renderTd({ children: 'Hello', mobile: 'scroll', colSpan: 5 })
    expect(screen.getByRole('cell')).toHaveAttribute('colspan', '5')
  })
})
