import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

import {
  getAcademicYears,
  getFeePlans,
  getPriorYearBalances,
  getStudentFeeList,
} from '@/db'

import type { StudentFeeRow } from '../../_lib/studentFeeSummary'

import StudentFeesTab from './StudentFeesTab'

vi.mock('@/db', () => ({
  getAcademicYears: vi.fn(),
  getStudentFeeList: vi.fn(),
  getFeePlans: vi.fn(),
  getPriorYearBalances: vi.fn(),
}))
vi.mock('@/lib/datetime', () => ({ todayInSchoolTz: () => '2025-10-15' }))
vi.mock('../../../_components/YearSelector', () => ({
  default: () => <div data-testid="year-selector" />,
}))
vi.mock('./StudentFeesTable', () => ({
  default: ({ rows }: { rows: StudentFeeRow[] }) => (
    <ul>
      {rows.map((r) => (
        <li key={r.id}>
          {r.name}:{r.status}:{r.priorOwed}
        </li>
      ))}
    </ul>
  ),
}))

const years = [
  {
    id: 'year-1',
    code: '2025-26',
    start_date: '2025-09-01',
    end_date: '2026-08-31',
  },
]

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getAcademicYears).mockResolvedValue(years as any)
  vi.mocked(getFeePlans).mockResolvedValue([])
  vi.mocked(getPriorYearBalances).mockResolvedValue({})
})

describe('StudentFeesTab', () => {
  it('shows an empty state with no active students', async () => {
    vi.mocked(getStudentFeeList).mockResolvedValue([])
    render(await StudentFeesTab({ yearId: 'year-1' }))
    expect(screen.getByText('No active students.')).toBeTruthy()
  })

  it('builds a row per student for the table, including prior-year balances', async () => {
    vi.mocked(getStudentFeeList).mockResolvedValue([
      {
        id: 's1',
        first_name: 'Alice',
        last_name: 'Student',
        student_code: null,
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
  })
})
