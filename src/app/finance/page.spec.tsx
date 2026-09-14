import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { redirect } from 'next/navigation'

import { auth } from '@/auth'
import { getCurrentAcademicYear } from '@/db'

import FinancePage from './page'

vi.mock('@/auth', () => ({ auth: vi.fn() }))
vi.mock('@/db', () => ({ getCurrentAcademicYear: vi.fn() }))
vi.mock('next/navigation', () => ({
  redirect: vi.fn(() => {
    throw new Error('NEXT_REDIRECT')
  }),
}))
vi.mock('./_components/FinanceTabBar', () => ({
  default: ({ currentTab }: { currentTab: string }) => (
    <div data-testid="current-tab">{currentTab}</div>
  ),
}))
vi.mock('./_tabs/staff/StaffPayrollTab', () => ({
  default: () => <div data-testid="staff-tab" />,
}))
vi.mock('./_tabs/students/StudentFeesTab', () => ({
  default: () => <div data-testid="students-tab" />,
}))
vi.mock('./_tabs/fee-plans/FeePlansTab', () => ({
  default: () => <div data-testid="fee-plans-tab" />,
}))

function mockRole(role: string | null): void {
  vi.mocked(auth).mockResolvedValue((role ? { user: { role } } : null) as never)
}

async function renderTab(tab?: string): Promise<void> {
  render(await FinancePage({ searchParams: Promise.resolve({ tab }) }))
}

beforeEach(() => {
  vi.clearAllMocks()
  mockRole('admin')
  vi.mocked(getCurrentAcademicYear).mockResolvedValue({ id: 'year-1' } as never)
})

describe('FinancePage', () => {
  it.each([null, 'headteacher', 'secretary', 'teacher'])(
    'redirects %s to the dashboard',
    async (role) => {
      mockRole(role)
      await expect(renderTab()).rejects.toThrow('NEXT_REDIRECT')
      expect(redirect).toHaveBeenCalledWith('/dashboard')
    },
  )

  it('defaults to the staff tab', async () => {
    await renderTab()
    expect(screen.getByText('Finance')).toBeTruthy()
    expect(screen.getByTestId('current-tab').textContent).toBe('staff')
    expect(screen.getByTestId('staff-tab')).toBeTruthy()
  })

  it('renders the students tab', async () => {
    await renderTab('students')
    expect(screen.getByTestId('students-tab')).toBeTruthy()
    expect(screen.queryByTestId('staff-tab')).toBeNull()
  })

  it('renders the fee plans tab', async () => {
    await renderTab('fee-plans')
    expect(screen.getByTestId('fee-plans-tab')).toBeTruthy()
  })

  it('renders no tab body for an unknown tab', async () => {
    await renderTab('nope')
    expect(screen.queryByTestId('staff-tab')).toBeNull()
    expect(screen.queryByTestId('students-tab')).toBeNull()
    expect(screen.queryByTestId('fee-plans-tab')).toBeNull()
  })
})
