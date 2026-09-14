import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

import { getClassesByAcademicYear, getFeePlans } from '@/db'

import FeePlansTab from './FeePlansTab'

vi.mock('@/db', () => ({
  getFeePlans: vi.fn(),
  getClassesByAcademicYear: vi.fn(),
}))

const years = [
  {
    id: 'year-1',
    code: '2025-26',
    start_date: '2025-09-01',
    end_date: '2026-08-31',
  },
]

const plan = {
  id: 'p1',
  name: 'Standard',
  academic_year: years[0],
  full_year_amount: 800,
  monthly_instalment_amount: 100,
  termly_instalment_amount: 266.67,
  notes: null,
  active: true,
  created_at: '',
  updated_at: '',
  class_ids: ['c1', 'c2', 'deleted'],
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getClassesByAcademicYear).mockResolvedValue([
    { id: 'c1', name: 'Alpha' },
    { id: 'c2', name: 'Beta' },
  ] as never)
})

describe('FeePlansTab', () => {
  it('shows an empty state and the add link with no plans', async () => {
    vi.mocked(getFeePlans).mockResolvedValue([])
    render(await FeePlansTab({ yearId: 'year-1' }))

    expect(screen.getByText('No fee plans yet.')).toBeTruthy()
    expect(
      screen.getByRole('link', { name: 'Add fee plan' }).getAttribute('href'),
    ).toBe('/finance/fee-plans/new?year=year-1')
  })

  it('lists plans with amounts, class names and status for the requested year', async () => {
    vi.mocked(getFeePlans).mockResolvedValue([
      plan,
      { ...plan, id: 'p2', name: 'Old', active: false, class_ids: [] },
    ])
    render(await FeePlansTab({ yearId: 'year-1' }))

    expect(getFeePlans).toHaveBeenCalledWith('year-1')
    expect(getClassesByAcademicYear).toHaveBeenCalledWith('year-1')
    expect(screen.getByText('Standard')).toBeTruthy()
    expect(screen.getAllByText('£800.00')).toHaveLength(2)
    expect(screen.getAllByText('£266.67')).toHaveLength(2)
    expect(screen.getByText('Alpha, Beta')).toBeTruthy()
    expect(screen.getByText('—')).toBeTruthy()
    expect(screen.getByText('Active')).toBeTruthy()
    expect(screen.getByText('Inactive')).toBeTruthy()
    expect(
      screen.getAllByRole('link', { name: 'Edit' })[0].getAttribute('href'),
    ).toBe('/finance/fee-plans/p1/edit')
  })
})
