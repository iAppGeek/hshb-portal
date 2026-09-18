import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'

import Tr from './Tr'

describe('Tr', () => {
  it('uses the hover-highlight class by default, not the stacked layout', () => {
    render(
      <table>
        <tbody>
          <Tr>
            <td>Cell</td>
          </Tr>
        </tbody>
      </table>,
    )
    const className = screen.getByRole('row').className
    expect(className).toContain('hover:bg-gray-50')
    expect(className).not.toContain('sm:table-row')
  })

  it('uses the stacked layout classes when stacked is true', () => {
    render(
      <table>
        <tbody>
          <Tr stacked>
            <td>Cell</td>
          </Tr>
        </tbody>
      </table>,
    )
    const className = screen.getByRole('row').className
    expect(className).toContain('sm:table-row')
  })

  it('appends a caller-supplied className', () => {
    render(
      <table>
        <tbody>
          <Tr className="bg-red-50">
            <td>Cell</td>
          </Tr>
        </tbody>
      </table>,
    )
    expect(screen.getByRole('row').className).toContain('bg-red-50')
  })

  it('applies a caller-supplied testId as data-testid', () => {
    render(
      <table>
        <tbody>
          <Tr testId="row-1">
            <td>Cell</td>
          </Tr>
        </tbody>
      </table>,
    )
    expect(screen.getByRole('row').getAttribute('data-testid')).toBe('row-1')
  })

  it('renders children', () => {
    render(
      <table>
        <tbody>
          <Tr>
            <td>Row content</td>
          </Tr>
        </tbody>
      </table>,
    )
    expect(screen.getByText('Row content')).toBeTruthy()
  })
})
