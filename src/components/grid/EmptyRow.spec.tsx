import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'

import EmptyRow from './EmptyRow'

describe('EmptyRow', () => {
  it('renders the message', () => {
    render(
      <table>
        <tbody>
          <EmptyRow colSpan={5} message="No students match these filters." />
        </tbody>
      </table>,
    )
    expect(screen.getByText('No students match these filters.')).toBeTruthy()
  })

  it('spans the given number of columns', () => {
    render(
      <table>
        <tbody>
          <EmptyRow colSpan={5} message="Nothing here" />
        </tbody>
      </table>,
    )
    expect(screen.getByRole('cell').getAttribute('colspan')).toBe('5')
  })

  it('renders exactly one cell', () => {
    render(
      <table>
        <tbody>
          <EmptyRow colSpan={3} message="Nothing here" />
        </tbody>
      </table>,
    )
    expect(screen.getAllByRole('cell')).toHaveLength(1)
  })
})
