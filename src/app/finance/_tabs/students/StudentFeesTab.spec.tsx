import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

import { getFeePlans, getStudentFeeList } from '@/db'

import type { StudentFeeRow } from '../../_lib/studentFeeSummary'

import StudentFeesTab from './StudentFeesTab'

vi.mock('@/db', () => ({
  getStudentFeeList: vi.fn(),
  getFeePlans: vi.fn(),
}))
vi.mock('@/lib/datetime', () => ({ todayInSchoolTz: () => '2025-10-15' }))
vi.mock('./StudentFeesTable', () => ({
  default: ({ rows }: { rows: StudentFeeRow[] }) => (
    <ul>
      {rows.map((r) => (
        <li key={r.id}>
          {r.name}:{r.status}
        </li>
      ))}
    </ul>
  ),
}))

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getFeePlans).mockResolvedValue([])
})

describe('StudentFeesTab', () => {
  it('shows an empty state with no active students', async () => {
    vi.mocked(getStudentFeeList).mockResolvedValue([])
    render(await StudentFeesTab())
    expect(screen.getByText('No active students.')).toBeTruthy()
  })

  it('builds a row per student for the table', async () => {
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
    render(await StudentFeesTab())
    expect(screen.getByText('Student, Alice:no_plan')).toBeTruthy()
  })
})
