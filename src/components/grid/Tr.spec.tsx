import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'

import { row, rowStacked } from '@/lib/grid/styles'

import Tr from './Tr'

describe('Tr', () => {
  it('uses the "row" token by default', () => {
    render(
      <table>
        <tbody>
          <Tr>
            <td>Cell</td>
          </Tr>
        </tbody>
      </table>,
    )
    expect(screen.getByRole('row').className).toBe(row)
  })

  it('uses the "rowStacked" token when stacked is true', () => {
    render(
      <table>
        <tbody>
          <Tr stacked>
            <td>Cell</td>
          </Tr>
        </tbody>
      </table>,
    )
    expect(screen.getByRole('row').className).toBe(rowStacked)
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
