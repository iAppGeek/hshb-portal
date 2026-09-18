import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'

import { table } from '@/lib/grid/styles'

import Table from './Table'

describe('Table', () => {
  it('applies the table token class', () => {
    render(
      <Table>
        <tbody>
          <tr>
            <td>Row</td>
          </tr>
        </tbody>
      </Table>,
    )
    expect(screen.getByRole('table').className).toBe(table)
  })

  it('renders an sr-only caption when given one', () => {
    render(
      <Table caption="List of classes">
        <tbody>
          <tr>
            <td>Row</td>
          </tr>
        </tbody>
      </Table>,
    )
    const caption = screen.getByText('List of classes')
    expect(caption.tagName).toBe('CAPTION')
    expect(caption.className).toBe('sr-only')
  })

  it('renders no caption element when none is given', () => {
    const { container } = render(
      <Table>
        <tbody>
          <tr>
            <td>Row</td>
          </tr>
        </tbody>
      </Table>,
    )
    expect(container.querySelector('caption')).toBeNull()
  })

  it('renders children', () => {
    render(
      <Table>
        <tbody>
          <tr>
            <td>Row content</td>
          </tr>
        </tbody>
      </Table>,
    )
    expect(screen.getByText('Row content')).toBeTruthy()
  })
})
