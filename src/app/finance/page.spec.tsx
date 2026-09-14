import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { redirect } from 'next/navigation'

import { auth } from '@/auth'
import { getAcademicYears, getCurrentAcademicYear } from '@/db'

import FinancePage from './page'

vi.mock('@/auth', () => ({ auth: vi.fn() }))
vi.mock('@/db', () => ({
  getAcademicYears: vi.fn(),
  getCurrentAcademicYear: vi.fn(),
}))
vi.mock('next/navigation', () => ({
  redirect: vi.fn(() => {
    throw new Error('NEXT_REDIRECT')
  }),
}))
vi.mock('../_components/YearSelector', () => ({
  default: ({
    value,
    extraParams,
  }: {
    value: string
    extraParams: Record<string, string>
  }) => (
    <div data-testid="year-selector">
      {value}:{extraParams.tab}
    </div>
  ),
}))
vi.mock('./_components/FinanceTabBar', () => ({
  default: ({ currentTab, yearId }: { currentTab: string; yearId: string }) => (
    <div data-testid="tab-bar">
      {currentTab}:{yearId}
    </div>
  ),
}))
vi.mock('./_tabs/students/StudentFeesTab', () => ({
  default: ({ yearId }: { yearId: string }) => (
    <div data-testid="students-tab">{yearId}</div>
  ),
}))
vi.mock('./_tabs/fee-plans/FeePlansTab', () => ({
  default: ({ yearId }: { yearId: string }) => (
    <div data-testid="fee-plans-tab">{yearId}</div>
  ),
}))

const YEARS = [
  { id: 'year-2', code: '2026-27' },
  { id: 'year-1', code: '2025-26' },
]

function mockRole(role: string | null): void {
  vi.mocked(auth).mockResolvedValue((role ? { user: { role } } : null) as never)
}

async function renderPage(params: {
  tab?: string
  year?: string
}): Promise<void> {
  render(await FinancePage({ searchParams: Promise.resolve(params) }))
}

beforeEach(() => {
  vi.clearAllMocks()
  mockRole('admin')
  vi.mocked(getAcademicYears).mockResolvedValue(YEARS as never)
  vi.mocked(getCurrentAcademicYear).mockResolvedValue({ id: 'year-2' } as never)
})

describe('FinancePage', () => {
  it.each([null, 'headteacher', 'secretary', 'teacher'])(
    'redirects %s to the dashboard',
    async (role) => {
      mockRole(role)
      await expect(renderPage({})).rejects.toThrow('NEXT_REDIRECT')
      expect(redirect).toHaveBeenCalledWith('/dashboard')
    },
  )

  it('defaults to the students tab in the current year', async () => {
    await renderPage({})

    expect(screen.getByText('Finance')).toBeTruthy()
    expect(screen.getByTestId('year-selector').textContent).toBe(
      'year-2:students',
    )
    expect(screen.getByTestId('tab-bar').textContent).toBe('students:year-2')
    expect(screen.getByTestId('students-tab').textContent).toBe('year-2')
  })

  it('renders the fee plans tab for the requested year', async () => {
    await renderPage({ tab: 'fee-plans', year: 'year-1' })

    expect(screen.getByTestId('year-selector').textContent).toBe(
      'year-1:fee-plans',
    )
    expect(screen.getByTestId('fee-plans-tab').textContent).toBe('year-1')
    expect(screen.queryByTestId('students-tab')).toBeNull()
  })

  it('falls back to the current year for an unknown year', async () => {
    await renderPage({ tab: 'students', year: 'not-a-year' })

    expect(screen.getByTestId('students-tab').textContent).toBe('year-2')
  })

  it.each(['staff', 'nope'])(
    'renders no tab body for the %s tab',
    async (tab) => {
      await renderPage({ tab })

      expect(screen.queryByTestId('students-tab')).toBeNull()
      expect(screen.queryByTestId('fee-plans-tab')).toBeNull()
    },
  )
})
