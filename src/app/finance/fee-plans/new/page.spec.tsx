import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

import { auth } from '@/auth'
import { getAllClassesIncludingInactive, getFeePlans } from '@/db'

import NewFeePlanPage from './page'

vi.mock('@/auth', () => ({ auth: vi.fn() }))
vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`)
  }),
}))
vi.mock('@/db', () => ({
  getAllClassesIncludingInactive: vi.fn(),
  getFeePlans: vi.fn(),
}))
vi.mock('../actions', () => ({ createFeePlanAction: vi.fn() }))
vi.mock('../FeePlanForm', () => ({
  default: (props: {
    plan: unknown
    classes: { name: string }[]
    takenBy: Record<string, string>
    submitLabel: string
  }) => (
    <div data-testid="form">
      {String(props.plan)}|{props.classes.map((c) => c.name).join(',')}|
      {JSON.stringify(props.takenBy)}|{props.submitLabel}
    </div>
  ),
}))

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(auth).mockResolvedValue({ user: { role: 'admin' } } as never)
  vi.mocked(getAllClassesIncludingInactive).mockResolvedValue([
    { id: 'c2', name: 'Beta', year_group: '2', academic_year: '2025-26' },
    { id: 'c1', name: 'Alpha', year_group: '1', academic_year: '2025-26' },
  ] as never)
  vi.mocked(getFeePlans).mockResolvedValue([
    { id: 'p1', name: 'Standard', academic_year: '2025-26', class_ids: ['c1'] },
  ] as never)
})

describe('NewFeePlanPage', () => {
  it('redirects non-admins to the dashboard', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { role: 'teacher' } } as never)
    await expect(NewFeePlanPage()).rejects.toThrow('NEXT_REDIRECT:/dashboard')
  })

  it('renders an empty form with sorted classes and taken classes', async () => {
    render(await NewFeePlanPage())

    expect(screen.getByRole('heading', { name: 'Add Fee Plan' })).toBeTruthy()
    expect(screen.getByTestId('form').textContent).toBe(
      'null|Alpha,Beta|{"c1":"Standard (2025-26)"}|Add fee plan',
    )
  })
})
