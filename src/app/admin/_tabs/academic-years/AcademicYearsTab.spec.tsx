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
vi.mock('../../academic-years/actions', () => ({
  setCurrentAcademicYearAction: vi.fn(),
}))
vi.mock('next/link', () => ({
  default: ({
    children,
    href,
  }: {
    children: React.ReactNode
    href: string
  }) => <a href={href}>{children}</a>,
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
  it('renders the years table and an "Add academic year" link', async () => {
    vi.mocked(getAcademicYears).mockResolvedValue(years as any)

    render(await AcademicYearsTab())

    expect(screen.getByTestId('years-table').textContent).toBe('2')
    const addLink = screen.getByRole('link', { name: 'Add academic year' })
    expect(addLink.getAttribute('href')).toBe('/admin/academic-years/new')
  })

  it('renders the table with an empty list when there are no years yet', async () => {
    vi.mocked(getAcademicYears).mockResolvedValue([])

    render(await AcademicYearsTab())

    expect(screen.getByTestId('years-table').textContent).toBe('0')
  })
})
