import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

import { getFeePlans, getPriorYearBalances, getStudentFeeList } from '@/db'

import type { StudentFeeRow } from '../../_lib/studentFeeSummary'

import StudentFeesTab from './StudentFeesTab'

vi.mock('@/db', () => ({
  getStudentFeeList: vi.fn(),
  getFeePlans: vi.fn(),
  getPriorYearBalances: vi.fn(),
}))
vi.mock('@/lib/datetime', () => ({ todayInSchoolTz: () => '2025-10-15' }))
vi.mock('./StudentFeesTable', () => ({
  default: ({ rows, yearId }: { rows: StudentFeeRow[]; yearId: string }) => (
    <ul data-year={yearId}>
      {rows.map((r) => (
        <li key={r.id}>
          {r.name}:{r.status}:{r.priorOwed}
        </li>
      ))}
    </ul>
  ),
}))

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getFeePlans).mockResolvedValue([])
  vi.mocked(getPriorYearBalances).mockResolvedValue({})
})

describe('StudentFeesTab', () => {
  it('shows an empty state with no students', async () => {
    vi.mocked(getStudentFeeList).mockResolvedValue([])
    render(await StudentFeesTab({ yearId: 'year-1' }))
    expect(screen.getByText('No students.')).toBeTruthy()
  })

  it('builds a row per student for the table, including prior-year balances', async () => {
    vi.mocked(getStudentFeeList).mockResolvedValue([
      {
        id: 's1',
        first_name: 'Alice',
        last_name: 'Student',
        student_code: null,
        active: true,
        leaving_reason: null,
        classes: [],
        account: null,
        payments: [],
      },
    ])
    vi.mocked(getPriorYearBalances).mockResolvedValue({ s1: 120 })

    render(await StudentFeesTab({ yearId: 'year-1' }))

    expect(getStudentFeeList).toHaveBeenCalledWith('year-1')
    expect(getFeePlans).toHaveBeenCalledWith('year-1')
    expect(getPriorYearBalances).toHaveBeenCalledWith('year-1')
    expect(screen.getByText('Student, Alice:no_plan:120')).toBeTruthy()
    expect(screen.getByRole('list').getAttribute('data-year')).toBe('year-1')
  })
})
