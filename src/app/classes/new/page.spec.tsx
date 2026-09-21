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
  getTeachers: vi.fn(),
  getStudentsForList: vi.fn(),
  getAcademicYears: vi.fn(),
  getCurrentAcademicYear: vi.fn(),
}))

vi.mock('../ClassForm', () => ({
  default: ({ submitLabel }: { submitLabel: string }) => (
    <div data-testid="class-form">{submitLabel}</div>
  ),
}))

vi.mock('./actions', () => ({
  createClassAction: vi.fn(),
}))

import { auth } from '@/auth'
import {
  getAcademicYears,
  getCurrentAcademicYear,
  getTeachers,
  getStudentsForList,
} from '@/db'

import AddClassPage from './page'

const mockTeachers = [
  { id: 'staff-1', first_name: 'Jane', last_name: 'Smith', display_name: null },
]
const mockStudents = [
  { id: 'student-1', first_name: 'Alice', last_name: 'Brown' },
]
const mockYears = [
  {
    id: 'year-1',
    code: '2026-27',
    start_date: '2026-09-01',
    end_date: '2027-08-31',
  },
]

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getAcademicYears).mockResolvedValue(mockYears as any)
  vi.mocked(getCurrentAcademicYear).mockResolvedValue(mockYears[0] as any)
})

describe('AddClassPage', () => {
  it('redirects teacher to /classes', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { role: 'teacher', staffId: 'staff-1' },
    } as any)

    await expect(AddClassPage()).rejects.toThrow('NEXT_REDIRECT:/classes')
  })

  it('redirects secretary to /classes', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { role: 'secretary', staffId: 'staff-1' },
    } as any)

    await expect(AddClassPage()).rejects.toThrow('NEXT_REDIRECT:/classes')
  })

  it('renders heading for admin', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { role: 'admin', staffId: 'staff-1' },
    } as any)
    vi.mocked(getTeachers).mockResolvedValue(mockTeachers as any)
    vi.mocked(getStudentsForList).mockResolvedValue(mockStudents as any)

    render(await AddClassPage())
    expect(screen.getByRole('heading', { name: 'Add Class' })).toBeTruthy()
  })

  it('renders heading for headteacher', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { role: 'headteacher', staffId: 'staff-1' },
    } as any)
    vi.mocked(getTeachers).mockResolvedValue(mockTeachers as any)
    vi.mocked(getStudentsForList).mockResolvedValue(mockStudents as any)

    render(await AddClassPage())
    expect(screen.getByRole('heading', { name: 'Add Class' })).toBeTruthy()
  })

  it('renders ClassForm for admin', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { role: 'admin', staffId: 'staff-1' },
    } as any)
    vi.mocked(getTeachers).mockResolvedValue(mockTeachers as any)
    vi.mocked(getStudentsForList).mockResolvedValue(mockStudents as any)

    render(await AddClassPage())
    expect(screen.getByTestId('class-form')).toBeTruthy()
  })

  it('fetches teachers and students', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { role: 'admin', staffId: 'staff-1' },
    } as any)
    vi.mocked(getTeachers).mockResolvedValue(mockTeachers as any)
    vi.mocked(getStudentsForList).mockResolvedValue(mockStudents as any)

    render(await AddClassPage())
    expect(getTeachers).toHaveBeenCalled()
    expect(getStudentsForList).toHaveBeenCalled()
  })
})
