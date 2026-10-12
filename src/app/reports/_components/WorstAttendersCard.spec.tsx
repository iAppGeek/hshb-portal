import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'

import type { WorstAttenderRow } from '@/lib/studentAttendance'

import WorstAttendersCard from './WorstAttendersCard'

function row(
  n: number,
  overrides: Partial<WorstAttenderRow> = {},
): WorstAttenderRow {
  return {
    studentId: `student-${n}`,
    firstName: `First${n}`,
    lastName: `Last${n}`,
    classNames: ['Alpha'],
    leavingReason: null,
    possible: 5,
    attended: 2,
    late: 1,
    absent: 2,
    unmarked: 1,
    ...overrides,
  }
}

const rows = Array.from({ length: 12 }, (_, n) => row(n))

describe('WorstAttendersCard', () => {
  it('defaults to 10 rows', () => {
    render(<WorstAttendersCard rows={rows} />)
    expect(screen.getAllByRole('link')).toHaveLength(10)
    expect(screen.queryByRole('link', { name: 'Last10, First10' })).toBeNull()
  })

  it('shows the typed count', () => {
    render(<WorstAttendersCard rows={rows} />)
    fireEvent.change(screen.getByLabelText('Show top'), {
      target: { value: '3' },
    })
    expect(screen.getAllByRole('link')).toHaveLength(3)
  })

  it('shows 10 when the input is cleared', () => {
    render(<WorstAttendersCard rows={rows} />)
    fireEvent.change(screen.getByLabelText('Show top'), {
      target: { value: '' },
    })
    expect(screen.getAllByRole('link')).toHaveLength(10)
  })

  it('shows every row when the count is larger than the list', () => {
    render(<WorstAttendersCard rows={rows.slice(0, 4)} />)
    fireEvent.change(screen.getByLabelText('Show top'), {
      target: { value: '9' },
    })
    expect(screen.getAllByRole('link')).toHaveLength(4)
  })

  it('shows the empty state when nobody missed a register', () => {
    render(<WorstAttendersCard rows={[]} />)
    expect(
      screen.getByText('Every student attended every register in this period.'),
    ).toBeTruthy()
    expect(screen.queryByRole('table')).toBeNull()
  })

  it('links the student and shows a leaver badge', () => {
    render(
      <WorstAttendersCard
        rows={[
          row(0, { leavingReason: 'left', classNames: ['Alpha', 'Beta'] }),
        ]}
      />,
    )
    expect(screen.getByRole('link', { name: 'Last0, First0' })).toHaveAttribute(
      'href',
      '/students/student-0',
    )
    expect(screen.getByText('Left')).toBeTruthy()
    expect(screen.getByText('Alpha, Beta')).toBeTruthy()
  })

  it('shows not marked, and absent plus not marked equals the days missed', () => {
    render(<WorstAttendersCard rows={[row(0)]} />)
    const table = screen.getByRole('table', { name: 'Worst attenders' })
    const headers = [...table.querySelectorAll('th')].map(
      (header) => header.textContent,
    )
    const cells = [...table.querySelectorAll('tbody td')].map(
      (cell) => cell.textContent,
    )
    const absent = Number(cells[headers.indexOf('Absent')])
    const unmarked = Number(cells[headers.indexOf('Not marked')])
    expect(unmarked).toBe(1)
    expect(absent + unmarked).toBe(5 - 2)
    expect(screen.getByText('2/5')).toBeTruthy()
    expect(screen.getByText('40%')).toBeTruthy()
  })
})
