import { describe, it, expect } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'

import type { StudentFeeRow } from '../../_lib/studentFeeSummary'

import StudentFeesTable from './StudentFeesTable'

const alpha = { id: 'c1', name: 'Alpha' }
const beta = { id: 'c2', name: 'Beta' }

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
    priorOwed: 0,
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
    priorOwed: 50,
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
    priorOwed: 0,
  },
]

function visibleNames(): string[] {
  return screen
    .getAllByRole('link', { name: 'Manage' })
    .map((a) => a.getAttribute('href') ?? '')
}

describe('StudentFeesTable', () => {
  it('renders each student with plan, amounts and status', () => {
    render(<StudentFeesTable rows={rows} yearId="year-1" />)

    expect(screen.getByText('Showing 3 of 3 students')).toBeTruthy()
    expect(screen.getByText('A-001')).toBeTruthy()
    expect(screen.getByText('Alpha, Beta')).toBeTruthy()
    expect(screen.getAllByText('Standard (2025-26)')).toHaveLength(2)
    expect(screen.getByText('£100.00')).toBeTruthy()
    expect(screen.getByText('£200.00')).toBeTruthy()
    expect(within(screen.getByRole('table')).getByText('Behind')).toBeTruthy()
    expect(screen.getAllByText('Multiple fee plans').length).toBeGreaterThan(0)
    expect(visibleNames()).toEqual([
      '/finance/students/s1?year=year-1',
      '/finance/students/s2?year=year-1',
      '/finance/students/s3?year=year-1',
    ])
  })

  it('searches by name and student code', () => {
    render(<StudentFeesTable rows={rows} yearId="year-1" />)
    const search = screen.getByLabelText('Search students')

    fireEvent.change(search, { target: { value: 'jones' } })
    expect(visibleNames()).toEqual(['/finance/students/s2?year=year-1'])

    fireEvent.change(search, { target: { value: 'a-001' } })
    expect(visibleNames()).toEqual(['/finance/students/s1?year=year-1'])
  })

  it('filters by class', () => {
    render(<StudentFeesTable rows={rows} yearId="year-1" />)
    fireEvent.change(screen.getByLabelText('Filter by class'), {
      target: { value: 'c2' },
    })
    expect(visibleNames()).toEqual(['/finance/students/s2?year=year-1'])
  })

  it('filters by payment plan, including no plan', () => {
    render(<StudentFeesTable rows={rows} yearId="year-1" />)
    const select = screen.getByLabelText('Filter by payment plan')

    fireEvent.change(select, { target: { value: 'yearly' } })
    expect(visibleNames()).toEqual(['/finance/students/s3?year=year-1'])

    fireEvent.change(select, { target: { value: 'none' } })
    expect(visibleNames()).toEqual(['/finance/students/s2?year=year-1'])
  })

  it('filters by status and by plan conflicts', () => {
    render(<StudentFeesTable rows={rows} yearId="year-1" />)
    const select = screen.getByLabelText('Filter by status')

    fireEvent.change(select, { target: { value: 'paid_in_full' } })
    expect(visibleNames()).toEqual(['/finance/students/s3?year=year-1'])

    fireEvent.change(select, { target: { value: 'conflict' } })
    expect(visibleNames()).toEqual(['/finance/students/s2?year=year-1'])
  })

  it('shows the prior-year balance only when positive', () => {
    render(<StudentFeesTable rows={rows} yearId="year-1" />)
    expect(screen.getByText('£50.00')).toBeTruthy()
  })

  it('filters to students who owe from previous years', () => {
    render(<StudentFeesTable rows={rows} yearId="year-1" />)
    fireEvent.change(screen.getByLabelText('Filter by status'), {
      target: { value: 'owes_prior' },
    })
    expect(visibleNames()).toEqual(['/finance/students/s2?year=year-1'])
  })

  it('shows a message when nothing matches', () => {
    render(<StudentFeesTable rows={rows} yearId="year-1" />)
    fireEvent.change(screen.getByLabelText('Search students'), {
      target: { value: 'zzz' },
    })
    expect(screen.getByText('No students match these filters.')).toBeTruthy()
    expect(screen.getByText('Showing 0 of 3 students')).toBeTruthy()
  })
})
