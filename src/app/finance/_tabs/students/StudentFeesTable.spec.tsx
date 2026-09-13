import { describe, it, expect } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'

import type { StudentFeeRow } from '../../_lib/studentFeeSummary'

import StudentFeesTable from './StudentFeesTable'

const alpha = { id: 'c1', name: 'Alpha', academic_year: '2025-26' }
const beta = { id: 'c2', name: 'Beta', academic_year: '2025-26' }

const rows: StudentFeeRow[] = [
  {
    id: 's1',
    name: 'Student, Alice',
    studentCode: 'A-001',
    classes: [alpha],
    paymentPlan: 'monthly',
    feePlanName: 'Standard (2025-26)',
    conflict: false,
    paid: 100,
    due: 200,
    status: 'behind',
  },
  {
    id: 's2',
    name: 'Jones, Bob',
    studentCode: null,
    classes: [alpha, beta],
    paymentPlan: null,
    feePlanName: null,
    conflict: true,
    paid: 0,
    due: null,
    status: 'no_plan',
  },
  {
    id: 's3',
    name: 'Brown, Carol',
    studentCode: null,
    classes: [],
    paymentPlan: 'yearly',
    feePlanName: 'Standard (2025-26)',
    conflict: false,
    paid: 800,
    due: 800,
    status: 'paid_in_full',
  },
]

function visibleNames(): string[] {
  return screen
    .getAllByRole('link', { name: 'Manage' })
    .map((a) => a.getAttribute('href') ?? '')
}

describe('StudentFeesTable', () => {
  it('renders each student with plan, amounts and status', () => {
    render(<StudentFeesTable rows={rows} />)

    expect(screen.getByText('Showing 3 of 3 students')).toBeTruthy()
    expect(screen.getByText('A-001')).toBeTruthy()
    expect(screen.getByText('Alpha, Beta')).toBeTruthy()
    expect(screen.getAllByText('Standard (2025-26)')).toHaveLength(2)
    expect(screen.getByText('£100.00')).toBeTruthy()
    expect(screen.getByText('£200.00')).toBeTruthy()
    expect(within(screen.getByRole('table')).getByText('Behind')).toBeTruthy()
    expect(screen.getAllByText('Multiple fee plans').length).toBeGreaterThan(0)
    expect(visibleNames()).toEqual([
      '/finance/students/s1',
      '/finance/students/s2',
      '/finance/students/s3',
    ])
  })

  it('searches by name and student code', () => {
    render(<StudentFeesTable rows={rows} />)
    const search = screen.getByLabelText('Search students')

    fireEvent.change(search, { target: { value: 'jones' } })
    expect(visibleNames()).toEqual(['/finance/students/s2'])

    fireEvent.change(search, { target: { value: 'a-001' } })
    expect(visibleNames()).toEqual(['/finance/students/s1'])
  })

  it('filters by class', () => {
    render(<StudentFeesTable rows={rows} />)
    fireEvent.change(screen.getByLabelText('Filter by class'), {
      target: { value: 'c2' },
    })
    expect(visibleNames()).toEqual(['/finance/students/s2'])
  })

  it('filters by payment plan, including no plan', () => {
    render(<StudentFeesTable rows={rows} />)
    const select = screen.getByLabelText('Filter by payment plan')

    fireEvent.change(select, { target: { value: 'yearly' } })
    expect(visibleNames()).toEqual(['/finance/students/s3'])

    fireEvent.change(select, { target: { value: 'none' } })
    expect(visibleNames()).toEqual(['/finance/students/s2'])
  })

  it('filters by status and by plan conflicts', () => {
    render(<StudentFeesTable rows={rows} />)
    const select = screen.getByLabelText('Filter by status')

    fireEvent.change(select, { target: { value: 'paid_in_full' } })
    expect(visibleNames()).toEqual(['/finance/students/s3'])

    fireEvent.change(select, { target: { value: 'conflict' } })
    expect(visibleNames()).toEqual(['/finance/students/s2'])
  })

  it('shows a message when nothing matches', () => {
    render(<StudentFeesTable rows={rows} />)
    fireEvent.change(screen.getByLabelText('Search students'), {
      target: { value: 'zzz' },
    })
    expect(screen.getByText('No students match these filters.')).toBeTruthy()
    expect(screen.getByText('Showing 0 of 3 students')).toBeTruthy()
  })
})
