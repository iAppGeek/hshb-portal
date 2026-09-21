import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

import { auth } from '@/auth'
import {
  getAcademicYears,
  getClassesByAcademicYear,
  getCurrentAcademicYear,
  getFeePlans,
} from '@/db'

import NewFeePlanPage from './page'

vi.mock('@/auth', () => ({ auth: vi.fn() }))
vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`)
  }),
}))
vi.mock('@/db', () => ({
  getAcademicYears: vi.fn(),
  getCurrentAcademicYear: vi.fn(),
  getClassesByAcademicYear: vi.fn(),
  getFeePlans: vi.fn(),
}))
vi.mock('../actions', () => ({ createFeePlanAction: vi.fn() }))
vi.mock('../FeePlanForm', () => ({
  default: (props: {
    plan: unknown
    classes: { name: string }[]
    defaultAcademicYearId: string
    takenBy: Record<string, string>
    submitLabel: string
  }) => (
    <div data-testid="form">
      {String(props.plan)}|{props.classes.map((c) => c.name).join(',')}|
      {props.defaultAcademicYearId}|{JSON.stringify(props.takenBy)}|
      {props.submitLabel}
    </div>
  ),
}))

const currentYear = {
  id: 'year-1',
  code: '2025-26',
  start_date: '2025-09-01',
  end_date: '2026-08-31',
}

function noSearchParams() {
  return { searchParams: Promise.resolve({}) }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(auth).mockResolvedValue({
    user: { role: 'admin', staffId: 'staff-1' },
  } as never)
  vi.mocked(getAcademicYears).mockResolvedValue([currentYear] as never)
  vi.mocked(getCurrentAcademicYear).mockResolvedValue(currentYear as never)
  vi.mocked(getClassesByAcademicYear).mockResolvedValue([
    { id: 'c2', name: 'Beta', year_group: '2', academic_year_id: 'year-1' },
    { id: 'c1', name: 'Alpha', year_group: '1', academic_year_id: 'year-1' },
  ] as never)
  vi.mocked(getFeePlans).mockResolvedValue([
    {
      id: 'p1',
      name: 'Standard',
      academic_year: currentYear,
      class_ids: ['c1'],
    },
  ] as never)
})

describe('NewFeePlanPage', () => {
  it('redirects non-admins to the dashboard', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { role: 'teacher', staffId: 'staff-1' },
    } as never)
    await expect(NewFeePlanPage(noSearchParams())).rejects.toThrow(
      'NEXT_REDIRECT:/dashboard',
    )
  })

  it('renders an empty form defaulting to the current year, with sorted and taken classes', async () => {
    render(await NewFeePlanPage(noSearchParams()))

    expect(screen.getByRole('heading', { name: 'Add Fee Plan' })).toBeTruthy()
    expect(screen.getByTestId('form').textContent).toBe(
      'null|Alpha,Beta|year-1|{"c1":"Standard (2025-26)"}|Add fee plan',
    )
  })

  it('defaults to the year requested in the search params', async () => {
    render(
      await NewFeePlanPage({
        searchParams: Promise.resolve({ year: 'year-0' }),
      }),
    )

    expect(screen.getByTestId('form').textContent).toContain('|year-0|')
  })
})
