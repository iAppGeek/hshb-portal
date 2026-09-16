import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'

import { card, scroll } from '@/lib/grid/styles'

import TableCard from './TableCard'

describe('TableCard', () => {
  it('wraps children in card + scroll wrappers by default', () => {
    render(
      <TableCard>
        <table>
          <tbody>
            <tr>
              <td>Content</td>
            </tr>
          </tbody>
        </table>
      </TableCard>,
    )
    const content = screen.getByText('Content')
    const scrollDiv = content.closest(`.${scroll.split(' ')[0]}`)
    expect(scrollDiv).not.toBeNull()
    expect(scrollDiv?.parentElement?.className).toBe(card)
  })

  it('renders only the scroll wrapper when frame is "none"', () => {
    const { container } = render(
      <TableCard frame="none">
        <table>
          <tbody>
            <tr>
              <td>Content</td>
            </tr>
          </tbody>
        </table>
      </TableCard>,
    )
    expect(container.firstElementChild?.className).toBe(scroll)
  })

  it('renders children', () => {
    render(
      <TableCard>
        <span>Inner</span>
      </TableCard>,
    )
    expect(screen.getByText('Inner')).toBeTruthy()
  })
})
