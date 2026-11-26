import { describe, it, expect, vi, beforeEach } from 'vitest'

import { getAcademicYears, getStaffPayrollList } from '@/db'

import { loadHrCompliance } from './loadHrCompliance'

vi.mock('@/db', () => ({
  getAcademicYears: vi.fn(),
  getStaffPayrollList: vi.fn(),
}))

const current = {
  id: 'y2',
  code: '2026-27',
  start_date: '2026-09-01',
  end_date: '2027-08-31',
  is_current: true,
}
const previous = {
  id: 'y1',
  code: '2025-26',
  start_date: '2025-09-01',
  end_date: '2026-08-31',
  is_current: false,
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getStaffPayrollList).mockResolvedValue([
    {
      id: 's1',
      title: 'Ms',
      first_name: 'Ann',
      last_name: 'Lee',
      role: 'teacher',
      payroll: null,
    },
  ])
})

describe('loadHrCompliance', () => {
  it('uses the current school year and summarises every staff member', async () => {
    vi.mocked(getAcademicYears).mockResolvedValue([current, previous] as never)

    const result = await loadHrCompliance('2026-11-26')

    expect(result.year).toBe(current)
    expect(result.staff).toHaveLength(1)
    expect(result.summary.staff).toEqual({ ok: 0, warning: 0, error: 1 })
    expect(result.summary.noCurrentYear).toBe(false)
  })

  it('reports no current year when none is marked current', async () => {
    vi.mocked(getAcademicYears).mockResolvedValue([previous] as never)

    const result = await loadHrCompliance('2026-11-26')

    expect(result.year).toBeNull()
    expect(result.summary.noCurrentYear).toBe(true)
  })
})
