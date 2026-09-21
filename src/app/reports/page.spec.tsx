import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('@/auth', () => ({
  auth: vi.fn(),
}))

vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  redirect: vi.fn().mockImplementation((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`)
  }),
}))

vi.mock('@/db', () => ({
  getAllStaff: vi.fn(),
  getStaffAttendedCount: vi.fn(),
  getStaffAttendanceByDateRange: vi.fn(),
  getAttendanceByDateRange: vi.fn(),
  getEnrolmentsInRange: vi.fn(),
  getIncidentCountsByDateRange: vi.fn(),
}))

vi.mock('./_components/ReportsModeSelector', () => ({
  default: vi.fn((props: Record<string, unknown>) => (
    <div data-testid="mode-selector" data-mode={props.mode} />
  )),
}))

vi.mock('./_components/DayReport', () => ({
  default: vi.fn(() => <div data-testid="day-report" />),
}))

vi.mock('./_components/PeriodReport', () => ({
  default: vi.fn(() => <div data-testid="period-report" />),
}))

import { auth } from '@/auth'
import {
  getAllStaff,
  getStaffAttendedCount,
  getStaffAttendanceByDateRange,
  getAttendanceByDateRange,
  getEnrolmentsInRange,
  getIncidentCountsByDateRange,
} from '@/db'

import ReportsPage from './page'

const defaultSearchParams = Promise.resolve({})

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(auth).mockResolvedValue({
    user: { role: 'admin', staffId: 'staff-1' },
  } as any)
  // Day mode defaults
  vi.mocked(getAllStaff).mockResolvedValue([])
  vi.mocked(getStaffAttendedCount).mockResolvedValue(0)
  vi.mocked(getAttendanceByDateRange).mockResolvedValue([])
  vi.mocked(getEnrolmentsInRange).mockResolvedValue([])
  // Range mode defaults
  vi.mocked(getStaffAttendanceByDateRange).mockResolvedValue([])
  vi.mocked(getIncidentCountsByDateRange).mockResolvedValue({
    medical: 0,
    behaviour: 0,
    other: 0,
    total: 0,
  })
})

describe('ReportsPage', () => {
  // ── Auth tests ──────────────────────────────────────────────────────────

  it('redirects to the login page when not authenticated', async () => {
    vi.mocked(auth).mockResolvedValue(null as any)

    await expect(
      ReportsPage({ searchParams: defaultSearchParams }),
    ).rejects.toThrow('NEXT_REDIRECT:/login')
  })

  it('redirects to dashboard when role is teacher', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { role: 'teacher', staffId: 'staff-1' },
    } as any)

    await expect(
      ReportsPage({ searchParams: defaultSearchParams }),
    ).rejects.toThrow('NEXT_REDIRECT:/dashboard')
  })

  it('does not redirect secretary (can access reports)', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { role: 'secretary', staffId: 'staff-1' },
    } as any)

    render(await ReportsPage({ searchParams: defaultSearchParams }))
    expect(screen.getByText('Reports & Analytics')).toBeTruthy()
  })

  // ── Mode selector ───────────────────────────────────────────────────────

  it('renders the mode selector', async () => {
    render(await ReportsPage({ searchParams: defaultSearchParams }))
    expect(screen.getByTestId('mode-selector')).toBeTruthy()
  })

  // ── Day mode ────────────────────────────────────────────────────────────

  it('defaults to day mode when no mode param', async () => {
    render(await ReportsPage({ searchParams: defaultSearchParams }))
    expect(screen.getByTestId('day-report')).toBeTruthy()
    expect(screen.queryByTestId('period-report')).toBeNull()
  })

  it('renders DayReport with mode=day', async () => {
    const searchParams = Promise.resolve({ mode: 'day', date: '2024-01-15' })
    render(await ReportsPage({ searchParams }))
    expect(screen.getByTestId('day-report')).toBeTruthy()
  })

  it('calls day-specific DB functions with selected date', async () => {
    const searchParams = Promise.resolve({ mode: 'day', date: '2024-01-15' })
    render(await ReportsPage({ searchParams }))
    expect(getAttendanceByDateRange).toHaveBeenCalledWith(
      '2024-01-15',
      '2024-01-15',
    )
    expect(getEnrolmentsInRange).toHaveBeenCalledWith(
      '2024-01-15',
      '2024-01-15',
    )
    expect(getStaffAttendedCount).toHaveBeenCalledWith('2024-01-15')
  })

  // ── Month mode ──────────────────────────────────────────────────────────

  it('renders PeriodReport in month mode', async () => {
    const searchParams = Promise.resolve({ mode: 'month', month: '2024-03' })
    render(await ReportsPage({ searchParams }))
    expect(screen.getByTestId('period-report')).toBeTruthy()
    expect(screen.queryByTestId('day-report')).toBeNull()
  })

  it('calls range DB functions with first/last day of month', async () => {
    const searchParams = Promise.resolve({ mode: 'month', month: '2024-03' })
    render(await ReportsPage({ searchParams }))
    expect(getStaffAttendanceByDateRange).toHaveBeenCalledWith(
      '2024-03-01',
      '2024-03-31',
    )
    expect(getAttendanceByDateRange).toHaveBeenCalledWith(
      '2024-03-01',
      '2024-03-31',
    )
    expect(getIncidentCountsByDateRange).toHaveBeenCalledWith(
      '2024-03-01',
      '2024-03-31',
    )
  })

  // ── Range mode ──────────────────────────────────────────────────────────

  it('renders PeriodReport in range mode', async () => {
    const searchParams = Promise.resolve({
      mode: 'range',
      from: '2024-03-01',
      to: '2024-03-15',
    })
    render(await ReportsPage({ searchParams }))
    expect(screen.getByTestId('period-report')).toBeTruthy()
    expect(screen.queryByTestId('day-report')).toBeNull()
  })

  it('calls range DB functions with from/to params', async () => {
    const searchParams = Promise.resolve({
      mode: 'range',
      from: '2024-03-01',
      to: '2024-03-15',
    })
    render(await ReportsPage({ searchParams }))
    expect(getStaffAttendanceByDateRange).toHaveBeenCalledWith(
      '2024-03-01',
      '2024-03-15',
    )
    expect(getAttendanceByDateRange).toHaveBeenCalledWith(
      '2024-03-01',
      '2024-03-15',
    )
  })

  // ── Mode selector receives correct props ────────────────────────────────

  it('passes mode=day to selector by default', async () => {
    render(await ReportsPage({ searchParams: defaultSearchParams }))
    const selector = screen.getByTestId('mode-selector')
    expect(selector.getAttribute('data-mode')).toBe('day')
  })

  it('passes mode=month to selector', async () => {
    const searchParams = Promise.resolve({ mode: 'month', month: '2024-03' })
    render(await ReportsPage({ searchParams }))
    const selector = screen.getByTestId('mode-selector')
    expect(selector.getAttribute('data-mode')).toBe('month')
  })
})
