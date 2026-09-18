import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'

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
    const scrollDiv = content.closest('.overflow-x-auto')
    expect(scrollDiv).not.toBeNull()
    expect(scrollDiv?.parentElement?.className).toContain('rounded-xl')
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
    expect(container.firstElementChild?.className).toContain('overflow-x-auto')
    expect(container.firstElementChild?.className).not.toContain('rounded-xl')
  })

  it('appends a caller-supplied className', () => {
    const { container } = render(
      <TableCard className="animate-pulse">
        <span>Inner</span>
      </TableCard>,
    )
    expect(container.firstElementChild?.className).toContain('animate-pulse')
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
