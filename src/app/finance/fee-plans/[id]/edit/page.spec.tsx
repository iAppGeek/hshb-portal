import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

import { auth } from '@/auth'
import {
  getAcademicYears,
  getClassesByAcademicYear,
  getFeePlanById,
  getFeePlans,
} from '@/db'

import EditFeePlanPage from './page'

vi.mock('@/auth', () => ({ auth: vi.fn() }))
vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`)
  }),
}))
vi.mock('@/db', () => ({
  getAcademicYears: vi.fn(),
  getClassesByAcademicYear: vi.fn(),
  getFeePlanById: vi.fn(),
  getFeePlans: vi.fn(),
}))
vi.mock('../../actions', () => ({ updateFeePlanAction: vi.fn() }))
vi.mock('../../FeePlanForm', () => ({
  default: (props: {
    plan: { id: string }
    takenBy: Record<string, string>
    submitLabel: string
    action: unknown
  }) => (
    <div data-testid="form">
      {props.plan.id}|{JSON.stringify(props.takenBy)}|{props.submitLabel}|
      {typeof props.action}
    </div>
  ),
}))

const params = Promise.resolve({ id: 'p1' })

const currentYear = {
  id: 'year-1',
  code: '2025-26',
  start_date: '2025-09-01',
  end_date: '2026-08-31',
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(auth).mockResolvedValue({ user: { role: 'admin' } } as never)
  vi.mocked(getAcademicYears).mockResolvedValue([currentYear] as never)
  vi.mocked(getClassesByAcademicYear).mockResolvedValue([])
  vi.mocked(getFeePlanById).mockResolvedValue({
    id: 'p1',
    name: 'Standard',
    academic_year: currentYear,
    class_ids: ['c1'],
  } as never)
  vi.mocked(getFeePlans).mockResolvedValue([
    {
      id: 'p1',
      name: 'Standard',
      academic_year: currentYear,
      class_ids: ['c1'],
    },
    {
      id: 'p2',
      name: 'Sibling',
      academic_year: currentYear,
      class_ids: ['c2'],
    },
  ] as never)
})

describe('EditFeePlanPage', () => {
  it('redirects non-admins to the dashboard', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { role: 'secretary' } } as never)
    await expect(EditFeePlanPage({ params })).rejects.toThrow(
      'NEXT_REDIRECT:/dashboard',
    )
  })

  it('redirects to the fee plans tab when the plan is missing', async () => {
    vi.mocked(getFeePlanById).mockResolvedValue(null)
    await expect(EditFeePlanPage({ params })).rejects.toThrow(
      'NEXT_REDIRECT:/finance?tab=fee-plans',
    )
  })

  it('renders the form, excluding this plan from taken classes', async () => {
    render(await EditFeePlanPage({ params }))

    expect(
      screen.getByRole('heading', {
        name: 'Edit Fee Plan: Standard (2025-26)',
      }),
    ).toBeTruthy()
    expect(screen.getByTestId('form').textContent).toBe(
      'p1|{"c2":"Sibling (2025-26)"}|Save changes|function',
    )
  })
})
