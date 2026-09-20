import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('server-only', () => ({}))
vi.mock('@/auth', () => ({
  auth: vi.fn(),
}))

vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`)
  }),
}))

vi.mock('@/db', () => ({
  getClassesByAcademicYear: vi.fn(),
  getClassesByTeacher: vi.fn(),
  getClassWithStudents: vi.fn(),
  getCurrentAcademicYear: vi.fn(),
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

vi.mock('../PrintButton', () => ({
  default: ({ label }: { label: string }) => <button>{label}</button>,
}))

import { auth } from '@/auth'
import {
  getClassesByAcademicYear,
  getClassesByTeacher,
  getClassWithStudents,
  getCurrentAcademicYear,
} from '@/db'

import AllClassRegistersPage from './page'

const currentYear = {
  id: 'year-1',
  code: '2026-27',
  start_date: '2026-09-01',
  end_date: '2027-08-31',
}

function makeStudent(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'student-1',
    student_code: 'S001',
    first_name: 'Nikos',
    last_name: 'Papadopoulos',
    allergies: null,
    primary_guardian: null,
    ...overrides,
  }
}

function makeClass(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'class-1',
    name: 'Alpha',
    year_group: '1',
    academic_year: '2026-27',
    teacher: {
      first_name: 'Tom',
      last_name: 'Teacher',
      display_name: null,
      email: 'tom.teacher@hshb.org.uk',
    },
    student_classes: [{ student: makeStudent() }],
    ...overrides,
  }
}

function noSearchParams() {
  return { searchParams: Promise.resolve({}) }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getCurrentAcademicYear).mockResolvedValue(currentYear as any)
})

describe('AllClassRegistersPage', () => {
  it('redirects to /login when there is no session', async () => {
    vi.mocked(auth).mockResolvedValue(null as any)
    await expect(AllClassRegistersPage(noSearchParams())).rejects.toThrow(
      'REDIRECT:/login',
    )
  })

  it('fetches all classes for the current year for admin', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { role: 'admin', staffId: 'staff-1' },
    } as any)
    vi.mocked(getClassesByAcademicYear).mockResolvedValue([
      { id: 'class-1' },
    ] as any)
    vi.mocked(getClassWithStudents).mockResolvedValue(makeClass() as any)

    render(await AllClassRegistersPage(noSearchParams()))

    expect(getClassesByAcademicYear).toHaveBeenCalledWith('year-1')
    expect(getClassesByTeacher).not.toHaveBeenCalled()
    expect(screen.getByText('Alpha — Class Register')).toBeTruthy()
  })

  it('lets an admin browse a past year via the query param', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { role: 'admin', staffId: 'staff-1' },
    } as any)
    vi.mocked(getClassesByAcademicYear).mockResolvedValue([])

    render(
      await AllClassRegistersPage({
        searchParams: Promise.resolve({ year: 'year-0' }),
      }),
    )

    expect(getClassesByAcademicYear).toHaveBeenCalledWith('year-0')
  })

  it('ignores the year query param for a teacher and shows only their classes', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { role: 'teacher', staffId: 'staff-99' },
    } as any)
    vi.mocked(getClassesByTeacher).mockResolvedValue([{ id: 'class-1' }] as any)
    vi.mocked(getClassWithStudents).mockResolvedValue(makeClass() as any)

    render(
      await AllClassRegistersPage({
        searchParams: Promise.resolve({ year: 'year-0' }),
      }),
    )

    expect(getClassesByTeacher).toHaveBeenCalledWith('staff-99')
    expect(getClassesByAcademicYear).not.toHaveBeenCalled()
  })

  it('renders a register section per class with the roster', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { role: 'admin', staffId: 'staff-1' },
    } as any)
    vi.mocked(getClassesByAcademicYear).mockResolvedValue([
      { id: 'class-1' },
      { id: 'class-2' },
    ] as any)
    vi.mocked(getClassWithStudents)
      .mockResolvedValueOnce(makeClass({ id: 'class-1', name: 'Alpha' }) as any)
      .mockResolvedValueOnce(makeClass({ id: 'class-2', name: 'Beta' }) as any)

    render(await AllClassRegistersPage(noSearchParams()))

    expect(screen.getByText('Alpha — Class Register')).toBeTruthy()
    expect(screen.getByText('Beta — Class Register')).toBeTruthy()
    expect(screen.getAllByText('Nikos')).toHaveLength(2)
  })

  it('skips a class that failed to load', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { role: 'admin', staffId: 'staff-1' },
    } as any)
    vi.mocked(getClassesByAcademicYear).mockResolvedValue([
      { id: 'class-1' },
      { id: 'class-2' },
    ] as any)
    vi.mocked(getClassWithStudents)
      .mockResolvedValueOnce(makeClass({ id: 'class-1', name: 'Alpha' }) as any)
      .mockResolvedValueOnce(null as any)

    render(await AllClassRegistersPage(noSearchParams()))

    expect(screen.getByText('Alpha — Class Register')).toBeTruthy()
  })

  it('shows an empty message when there are no classes', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { role: 'admin', staffId: 'staff-1' },
    } as any)
    vi.mocked(getClassesByAcademicYear).mockResolvedValue([])

    render(await AllClassRegistersPage(noSearchParams()))

    expect(screen.getByText('No classes found.')).toBeTruthy()
  })

  it('shows the Print All Registers button', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { role: 'admin', staffId: 'staff-1' },
    } as any)
    vi.mocked(getClassesByAcademicYear).mockResolvedValue([])

    render(await AllClassRegistersPage(noSearchParams()))

    expect(
      screen.getByRole('button', { name: 'Print All Registers' }),
    ).toBeTruthy()
  })
})
