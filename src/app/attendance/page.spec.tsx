import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('server-only', () => ({}))
vi.mock('@/auth', () => ({
  auth: vi.fn(),
}))

vi.mock('@/db', () => ({
  getAcademicYears: vi.fn(),
  getAllClasses: vi.fn(),
  getCurrentAcademicYear: vi.fn(),
  getClassesByAcademicYear: vi.fn(),
  getClassesByTeacher: vi.fn(),
}))

vi.mock('../_components/YearSelector', () => ({
  default: ({ value }: { value: string }) => (
    <div data-testid="year-selector">{value}</div>
  ),
}))

vi.mock('./AttendanceFilters', () => ({
  default: vi.fn(({ classes, selectedClassId, selectedDate }) => (
    <div data-testid="attendance-filters">
      {classes.map((c: { id: string; name: string }) => (
        <span key={c.id}>{c.name}</span>
      ))}
      <span>{selectedClassId}</span>
      <span>{selectedDate}</span>
    </div>
  )),
}))

vi.mock('./AttendanceRegister', () => ({
  default: vi.fn(({ classId, date, className }) => (
    <div data-testid="attendance-register">
      {classId} {date} {className}
    </div>
  )),
}))

import { auth } from '@/auth'
import {
  getAcademicYears,
  getAllClasses,
  getClassesByAcademicYear,
  getClassesByTeacher,
  getCurrentAcademicYear,
} from '@/db'

import AttendancePage from './page'
import AttendanceFilters from './AttendanceFilters'
import AttendanceRegister from './AttendanceRegister'

const currentYear = {
  id: 'year-1',
  code: '2026-27',
  start_date: '2026-09-01',
  end_date: '2027-08-31',
}

const pastYear = {
  id: 'year-0',
  code: '2025-26',
  start_date: '2025-09-01',
  end_date: '2026-08-31',
}

const mockClass = {
  id: 'class-1',
  name: 'Year 3A',
  year_group: '3',
  academic_year: '2026-27',
  academic_year_id: 'year-1',
  active: true,
}

const pastClass = {
  id: 'class-0',
  name: 'Year 2A',
  year_group: '2',
  academic_year: '2025-26',
  academic_year_id: 'year-0',
  active: false,
}

function mockUser(role: string, staffId = 'staff-1'): void {
  vi.mocked(auth).mockResolvedValue({ user: { role, staffId } } as any)
}

function params(search: Record<string, string> = {}) {
  return { searchParams: Promise.resolve(search) }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getAcademicYears).mockResolvedValue([currentYear, pastYear] as any)
  vi.mocked(getCurrentAcademicYear).mockResolvedValue(currentYear as any)
  vi.mocked(getAllClasses).mockResolvedValue([mockClass] as any)
  vi.mocked(getClassesByAcademicYear).mockImplementation(
    async (yearId: string) =>
      (yearId === 'year-1' ? [mockClass] : [pastClass]) as any,
  )
  vi.mocked(getClassesByTeacher).mockResolvedValue([mockClass] as any)
})

describe('AttendancePage', () => {
  it('renders the Attendance Register heading', async () => {
    mockUser('admin')

    render(await AttendancePage(params()))
    expect(screen.getByText('Attendance Register')).toBeTruthy()
  })

  it('shows empty state when no classes are assigned', async () => {
    mockUser('teacher')
    vi.mocked(getClassesByTeacher).mockResolvedValue([])

    render(await AttendancePage(params()))
    expect(screen.getByText('No classes assigned.')).toBeTruthy()
  })

  it('lists every current-year class (active or not) with a year selector for admin', async () => {
    mockUser('admin')

    render(await AttendancePage(params()))
    expect(getClassesByAcademicYear).toHaveBeenCalledWith('year-1')
    expect(getAllClasses).not.toHaveBeenCalled()
    expect(screen.getByTestId('year-selector').textContent).toBe('year-1')
    expect(vi.mocked(AttendanceRegister)).toHaveBeenCalledWith(
      expect.objectContaining({ classId: 'class-1', archived: false }),
      undefined,
    )
  })

  it('lists every class of a past year, read-only, for admin', async () => {
    mockUser('admin')

    render(await AttendancePage(params({ year: 'year-0' })))
    expect(getClassesByAcademicYear).toHaveBeenCalledWith('year-0')
    expect(getAllClasses).not.toHaveBeenCalled()
    expect(vi.mocked(AttendanceRegister)).toHaveBeenCalledWith(
      expect.objectContaining({
        classId: 'class-0',
        date: '2026-08-31',
        archived: true,
      }),
      undefined,
    )
  })

  it('falls back to the current year for an unknown year', async () => {
    mockUser('admin')

    render(await AttendancePage(params({ year: 'not-a-year' })))
    expect(getClassesByAcademicYear).toHaveBeenCalledWith('year-1')
    expect(getAllClasses).not.toHaveBeenCalled()
  })

  it('admin viewing an inactive current-year class sees it read-only', async () => {
    mockUser('admin')
    vi.mocked(getClassesByAcademicYear).mockResolvedValue([
      { ...mockClass, id: 'class-1', active: false },
    ] as any)

    render(await AttendancePage(params()))
    expect(vi.mocked(AttendanceRegister)).toHaveBeenCalledWith(
      expect.objectContaining({ classId: 'class-1', archived: true }),
      undefined,
    )
  })

  it('shows an error panel when the requested classId is not in the list', async () => {
    mockUser('teacher')

    render(await AttendancePage(params({ classId: 'not-my-class' })))
    expect(
      screen.getByText(
        "This class isn't available. It may have been completed or you may not have access.",
      ),
    ).toBeTruthy()
    expect(vi.mocked(AttendanceRegister)).not.toHaveBeenCalled()
  })

  it.each(['headteacher', 'secretary'])(
    'keeps %s on active current-year classes with no year selector',
    async (role) => {
      mockUser(role)

      render(await AttendancePage(params({ year: 'year-0' })))
      expect(getAllClasses).toHaveBeenCalled()
      expect(getClassesByAcademicYear).not.toHaveBeenCalled()
      expect(getAcademicYears).not.toHaveBeenCalled()
      expect(screen.queryByTestId('year-selector')).toBeNull()
      expect(vi.mocked(AttendanceRegister)).toHaveBeenCalledWith(
        expect.objectContaining({ archived: false }),
        undefined,
      )
    },
  )

  it('fetches only teacher classes for teacher role', async () => {
    mockUser('teacher', 'staff-2')

    render(await AttendancePage(params({ year: 'year-0' })))
    expect(getClassesByTeacher).toHaveBeenCalledWith('staff-2')
    expect(getAllClasses).not.toHaveBeenCalled()
    expect(getClassesByAcademicYear).not.toHaveBeenCalled()
    expect(screen.queryByTestId('year-selector')).toBeNull()
  })

  it('passes classes, selectedClassId, and selectedDate to AttendanceFilters', async () => {
    mockUser('admin')

    render(
      await AttendancePage(params({ classId: 'class-1', date: '2024-06-15' })),
    )

    expect(vi.mocked(AttendanceFilters)).toHaveBeenCalledWith(
      expect.objectContaining({
        classes: [mockClass],
        selectedClassId: 'class-1',
        selectedDate: '2024-06-15',
        yearId: 'year-1',
      }),
      undefined,
    )
  })

  it('does not pass a year to AttendanceFilters for non-admins', async () => {
    mockUser('secretary')

    render(await AttendancePage(params()))

    expect(vi.mocked(AttendanceFilters)).toHaveBeenCalledWith(
      expect.objectContaining({ yearId: undefined }),
      undefined,
    )
  })

  it('renders AttendanceRegister with correct classId, date, and className', async () => {
    mockUser('admin')

    render(
      await AttendancePage(params({ classId: 'class-1', date: '2024-06-15' })),
    )

    expect(vi.mocked(AttendanceRegister)).toHaveBeenCalledWith(
      expect.objectContaining({
        classId: 'class-1',
        date: '2024-06-15',
        className: 'Year 3A',
        role: 'admin',
      }),
      undefined,
    )
  })

  it('defaults to today when no date is provided', async () => {
    mockUser('admin')
    const today = new Date().toISOString().split('T')[0]

    render(await AttendancePage(params({ classId: 'class-1' })))

    expect(vi.mocked(AttendanceRegister)).toHaveBeenCalledWith(
      expect.objectContaining({ date: today }),
      undefined,
    )
  })

  it('defaults to the first class when no classId is in searchParams', async () => {
    mockUser('admin')

    render(await AttendancePage(params()))

    expect(vi.mocked(AttendanceRegister)).toHaveBeenCalledWith(
      expect.objectContaining({ classId: 'class-1' }),
      undefined,
    )
  })

  it('keeps filters visible and hides register content while AttendanceRegister is loading', async () => {
    mockUser('admin')

    // Use mockImplementation (not Once) so React's internal Suspense retries also suspend.
    // React retries suspended components within act(), consuming a mockImplementationOnce.
    const neverResolves = new Promise<void>(() => {})
    vi.mocked(AttendanceRegister).mockImplementation((): never => {
      throw neverResolves
    })

    const { container } = render(
      await AttendancePage(params({ classId: 'class-1', date: '2024-06-15' })),
    )

    // Filters remain visible while the register loads — the key UX requirement
    expect(screen.getByTestId('attendance-filters')).toBeTruthy()
    // Register content is not shown while suspended
    expect(screen.queryByTestId('attendance-register')).toBeNull()
    // The Suspense fallback skeleton is shown in place of the register
    expect(container.querySelector('.animate-pulse')).toBeTruthy()
  })
})
