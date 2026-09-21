import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('@/db', () => ({
  getAcademicYears: vi.fn(),
  getClassesByAcademicYear: vi.fn(),
  getFeePlans: vi.fn(),
}))
vi.mock('./AcademicYearsTable', () => ({
  default: ({ years }: { years: { code: string }[] }) => (
    <div data-testid="years-table">{years.length}</div>
  ),
}))
vi.mock('./AcademicYearForm', () => ({
  default: ({ defaultValues }: { defaultValues: { code: string } }) => (
    <div data-testid="add-form">{defaultValues.code}</div>
  ),
}))
vi.mock('./actions', () => ({
  createAcademicYearAction: vi.fn(),
  updateAcademicYearAction: vi.fn(),
  setCurrentAcademicYearAction: vi.fn(),
}))

import { getAcademicYears, getClassesByAcademicYear, getFeePlans } from '@/db'

import AcademicYearsTab from './AcademicYearsTab'

const years = [
  {
    id: 'year-2',
    code: '2026-27',
    start_date: '2026-09-01',
    end_date: '2027-08-31',
    is_current: true,
  },
  {
    id: 'year-1',
    code: '2025-26',
    start_date: '2025-09-01',
    end_date: '2026-08-31',
    is_current: false,
  },
]

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getClassesByAcademicYear).mockResolvedValue([])
  vi.mocked(getFeePlans).mockResolvedValue([] as any)
})

describe('AcademicYearsTab', () => {
  it('renders the years table and suggests the next code for a new year', async () => {
    vi.mocked(getAcademicYears).mockResolvedValue(years as any)

    render(await AcademicYearsTab())

    expect(screen.getByTestId('years-table').textContent).toBe('2')
    expect(screen.getByTestId('add-form').textContent).toBe('2027-28')
  })

  it('leaves the no-current warning to the table, which can clear it', async () => {
    vi.mocked(getAcademicYears).mockResolvedValue(
      years.map((y) => ({ ...y, is_current: false })) as any,
    )

    render(await AcademicYearsTab())

    // The table is mocked here; AcademicYearsTable.spec covers the warning.
    expect(screen.getByTestId('years-table')).toBeTruthy()
    expect(screen.queryByText(/no academic year is marked current/i)).toBeNull()
  })

  it('does not warn when a year is current', async () => {
    vi.mocked(getAcademicYears).mockResolvedValue(years as any)

    render(await AcademicYearsTab())

    expect(screen.queryByText(/no academic year is marked current/i)).toBeNull()
  })

  it('does not render the table or warning when there are no years yet', async () => {
    vi.mocked(getAcademicYears).mockResolvedValue([])

    render(await AcademicYearsTab())

    expect(screen.queryByTestId('years-table')).toBeNull()
    expect(screen.queryByText(/no academic year is marked current/i)).toBeNull()
  })
})
