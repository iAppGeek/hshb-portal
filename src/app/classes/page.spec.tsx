import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('@/auth', () => ({
  auth: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  redirect: vi.fn().mockImplementation((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`)
  }),
}))

vi.mock('@/db', () => ({
  getAcademicYears: vi.fn(),
  getCurrentAcademicYear: vi.fn(),
  getClassesByAcademicYear: vi.fn(),
  getClassesByTeacher: vi.fn(),
}))

vi.mock('./ClassesTable', () => ({
  default: ({
    classes,
  }: {
    classes: { id: string; name: string; completed: boolean }[]
  }) => (
    <div data-testid="classes-table">
      {classes.map((c) => (
        <span key={c.id}>
          {c.name}
          {c.completed ? ' (completed)' : ''}
        </span>
      ))}
    </div>
  ),
}))

vi.mock('../_components/YearSelector', () => ({
  default: () => <div data-testid="year-selector" />,
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

import { auth } from '@/auth'
import {
  getAcademicYears,
  getClassesByAcademicYear,
  getClassesByTeacher,
  getCurrentAcademicYear,
} from '@/db'

import ClassesPage from './page'

const mockClasses = [
  {
    id: 'class-1',
    name: 'Year 1A',
    year_group: '1',
    room_number: 'R1',
    academic_year: '2024-25',
    academic_year_id: 'year-1',
    active: true,
    teacher: { first_name: 'Jane', last_name: 'Smith' },
  },
]

const currentYear = {
  id: 'year-1',
  code: '2026-27',
  start_date: '2026-09-01',
  end_date: '2027-08-31',
}

const previousYear = {
  id: 'year-0',
  code: '2025-26',
  start_date: '2025-09-01',
  end_date: '2026-08-31',
}

function noSearchParams() {
  return { searchParams: Promise.resolve({}) }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getAcademicYears).mockResolvedValue([
    currentYear,
    previousYear,
  ] as any)
  vi.mocked(getCurrentAcademicYear).mockResolvedValue(currentYear as any)
})

describe('ClassesPage', () => {
  it('redirects to login when not authenticated', async () => {
    vi.mocked(auth).mockResolvedValue(null as any)

    await expect(ClassesPage(noSearchParams())).rejects.toThrow(
      'NEXT_REDIRECT:/login',
    )
  })

  it('renders heading for admin', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { role: 'admin', staffId: 'staff-1' },
    } as any)
    vi.mocked(getClassesByAcademicYear).mockResolvedValue(mockClasses as any)

    render(await ClassesPage(noSearchParams()))
    expect(screen.getByText('Classes')).toBeTruthy()
  })

  it('shows Add Class button for admin', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { role: 'admin', staffId: 'staff-1' },
    } as any)
    vi.mocked(getClassesByAcademicYear).mockResolvedValue(mockClasses as any)

    render(await ClassesPage(noSearchParams()))
    expect(screen.getByRole('link', { name: 'Add Class' })).toBeTruthy()
  })

  it('shows Add Class button for headteacher', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { role: 'headteacher', staffId: 'staff-1' },
    } as any)
    vi.mocked(getClassesByAcademicYear).mockResolvedValue(mockClasses as any)

    render(await ClassesPage(noSearchParams()))
    expect(screen.getByRole('link', { name: 'Add Class' })).toBeTruthy()
  })

  it('does not show Add Class button for teacher', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { role: 'teacher', staffId: 'staff-1' },
    } as any)
    vi.mocked(getClassesByTeacher).mockResolvedValue(mockClasses as any)

    render(await ClassesPage(noSearchParams()))
    expect(screen.queryByRole('link', { name: 'Add Class' })).toBeNull()
  })

  it('fetches own classes for teacher role', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { role: 'teacher', staffId: 'staff-99' },
    } as any)
    vi.mocked(getClassesByTeacher).mockResolvedValue(mockClasses as any)

    render(await ClassesPage(noSearchParams()))
    expect(getClassesByTeacher).toHaveBeenCalledWith('staff-99')
    expect(getClassesByAcademicYear).not.toHaveBeenCalled()
  })

  it('shows empty state when no classes', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { role: 'admin', staffId: 'staff-1' },
    } as any)
    vi.mocked(getClassesByAcademicYear).mockResolvedValue([])

    render(await ClassesPage(noSearchParams()))
    expect(screen.getByText('No classes found.')).toBeTruthy()
  })

  it('renders the ClassesTable with class data', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { role: 'admin', staffId: 'staff-1' },
    } as any)
    vi.mocked(getClassesByAcademicYear).mockResolvedValue(mockClasses as any)

    render(await ClassesPage(noSearchParams()))
    expect(screen.getByTestId('classes-table')).toBeTruthy()
    expect(screen.getByText('Year 1A')).toBeTruthy()
  })

  it('fetches all classes for secretary role, defaulting to the current year', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { role: 'secretary', staffId: 'staff-4' },
    } as any)
    vi.mocked(getClassesByAcademicYear).mockResolvedValue(mockClasses as any)

    render(await ClassesPage(noSearchParams()))
    expect(getClassesByAcademicYear).toHaveBeenCalledWith('year-1')
    expect(getClassesByTeacher).not.toHaveBeenCalled()
    expect(screen.getByTestId('classes-table')).toBeTruthy()
  })

  it('lets an admin browse a past year with the year selector', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { role: 'admin', staffId: 'staff-1' },
    } as any)
    vi.mocked(getClassesByAcademicYear).mockResolvedValue(mockClasses as any)

    render(
      await ClassesPage({ searchParams: Promise.resolve({ year: 'year-0' }) }),
    )
    expect(getClassesByAcademicYear).toHaveBeenCalledWith('year-0')
    expect(screen.getByTestId('year-selector')).toBeTruthy()
  })

  it('falls back to the current year for an unknown year', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { role: 'admin', staffId: 'staff-1' },
    } as any)
    vi.mocked(getClassesByAcademicYear).mockResolvedValue(mockClasses as any)

    render(
      await ClassesPage({
        searchParams: Promise.resolve({ year: 'not-a-year' }),
      }),
    )
    expect(getClassesByAcademicYear).toHaveBeenCalledWith('year-1')
  })

  it.each(['headteacher', 'secretary'])(
    'keeps %s on the current year with no year selector',
    async (role) => {
      vi.mocked(auth).mockResolvedValue({
        user: { role, staffId: 'staff-2' },
      } as any)
      vi.mocked(getClassesByAcademicYear).mockResolvedValue(mockClasses as any)

      render(
        await ClassesPage({
          searchParams: Promise.resolve({ year: 'year-0' }),
        }),
      )
      expect(getClassesByAcademicYear).toHaveBeenCalledWith('year-1')
      expect(screen.queryByTestId('year-selector')).toBeNull()
    },
  )

  it('shows no year selector for a teacher', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { role: 'teacher', staffId: 'staff-99' },
    } as any)
    vi.mocked(getClassesByTeacher).mockResolvedValue(mockClasses as any)

    render(await ClassesPage(noSearchParams()))
    expect(screen.queryByTestId('year-selector')).toBeNull()
  })

  it('marks an inactive class as completed', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { role: 'admin', staffId: 'staff-1' },
    } as any)
    vi.mocked(getClassesByAcademicYear).mockResolvedValue([
      { ...mockClasses[0], active: false },
    ] as any)

    render(await ClassesPage(noSearchParams()))
    expect(screen.getByText('Year 1A (completed)')).toBeTruthy()
  })

  it('marks a class from a past year as completed', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { role: 'admin', staffId: 'staff-1' },
    } as any)
    vi.mocked(getClassesByAcademicYear).mockResolvedValue([
      { ...mockClasses[0], academic_year_id: 'year-0' },
    ] as any)

    render(
      await ClassesPage({ searchParams: Promise.resolve({ year: 'year-0' }) }),
    )
    expect(screen.getByText('Year 1A (completed)')).toBeTruthy()
  })

  it('does not mark an active current-year class as completed', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { role: 'admin', staffId: 'staff-1' },
    } as any)
    vi.mocked(getClassesByAcademicYear).mockResolvedValue(mockClasses as any)

    render(await ClassesPage(noSearchParams()))
    expect(screen.getByText('Year 1A')).toBeTruthy()
    expect(screen.queryByText('Year 1A (completed)')).toBeNull()
  })

  it('does not show Add Class button for secretary', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { role: 'secretary', staffId: 'staff-4' },
    } as any)
    vi.mocked(getClassesByAcademicYear).mockResolvedValue(mockClasses as any)

    render(await ClassesPage(noSearchParams()))
    expect(screen.queryByRole('link', { name: 'Add Class' })).toBeNull()
  })
})
