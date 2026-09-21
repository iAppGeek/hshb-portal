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
  getClassById: vi.fn(),
  getTeachers: vi.fn(),
  getStudentsForList: vi.fn(),
  getAcademicYears: vi.fn(),
  getCurrentAcademicYear: vi.fn(),
}))

vi.mock('../../ClassForm', () => ({
  default: ({
    submitLabel,
    classData,
  }: {
    submitLabel: string
    classData?: { name: string }
  }) => (
    <div data-testid="class-form">
      {submitLabel}
      {classData && <span>{classData.name}</span>}
    </div>
  ),
}))

vi.mock('./actions', () => ({
  updateClassAction: vi.fn(),
}))

import { auth } from '@/auth'
import {
  getAcademicYears,
  getClassById,
  getCurrentAcademicYear,
  getTeachers,
  getStudentsForList,
} from '@/db'

import EditClassPage from './page'

const mockClass = {
  id: 'class-1',
  name: 'Year 1A',
  year_group: '1',
  room_number: 'R1',
  academic_year_id: 'year-1',
  academic_year: '2024-25',
  active: true,
  teacher_id: 'staff-1',
  student_classes: [],
}

const mockTeachers = [
  { id: 'staff-1', first_name: 'Jane', last_name: 'Smith', display_name: null },
]
const mockStudents = [
  { id: 'student-1', first_name: 'Alice', last_name: 'Brown' },
]
const mockYears = [
  {
    id: 'year-1',
    code: '2024-25',
    start_date: '2024-09-01',
    end_date: '2025-08-31',
  },
]

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getAcademicYears).mockResolvedValue(mockYears as any)
  vi.mocked(getCurrentAcademicYear).mockResolvedValue(mockYears[0] as any)
})

describe('EditClassPage', () => {
  it('redirects teacher to /classes', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { role: 'teacher', staffId: 'staff-1' },
    } as any)

    await expect(
      EditClassPage({ params: Promise.resolve({ id: 'class-1' }) }),
    ).rejects.toThrow('NEXT_REDIRECT:/classes')
  })

  it('redirects secretary to /classes', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { role: 'secretary', staffId: 'staff-1' },
    } as any)

    await expect(
      EditClassPage({ params: Promise.resolve({ id: 'class-1' }) }),
    ).rejects.toThrow('NEXT_REDIRECT:/classes')
  })

  it('redirects to /classes when class not found', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { role: 'admin', staffId: 'staff-1' },
    } as any)
    vi.mocked(getClassById).mockResolvedValue(null as any)
    vi.mocked(getTeachers).mockResolvedValue(mockTeachers as any)
    vi.mocked(getStudentsForList).mockResolvedValue(mockStudents as any)

    await expect(
      EditClassPage({ params: Promise.resolve({ id: 'nonexistent' }) }),
    ).rejects.toThrow('NEXT_REDIRECT:/classes')
  })

  it('redirects to the class page when the class is inactive', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { role: 'admin', staffId: 'staff-1' },
    } as any)
    vi.mocked(getClassById).mockResolvedValue({
      ...mockClass,
      active: false,
    } as any)
    vi.mocked(getTeachers).mockResolvedValue(mockTeachers as any)
    vi.mocked(getStudentsForList).mockResolvedValue(mockStudents as any)

    await expect(
      EditClassPage({ params: Promise.resolve({ id: 'class-1' }) }),
    ).rejects.toThrow('NEXT_REDIRECT:/classes/class-1')
  })

  it('redirects to the class page when an active class is not in the current year', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { role: 'admin', staffId: 'staff-1' },
    } as any)
    vi.mocked(getClassById).mockResolvedValue({
      ...mockClass,
      academic_year_id: 'year-2',
    } as any)
    vi.mocked(getTeachers).mockResolvedValue(mockTeachers as any)
    vi.mocked(getStudentsForList).mockResolvedValue(mockStudents as any)

    await expect(
      EditClassPage({ params: Promise.resolve({ id: 'class-1' }) }),
    ).rejects.toThrow('NEXT_REDIRECT:/classes/class-1')
  })

  it('renders heading with class name for admin', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { role: 'admin', staffId: 'staff-1' },
    } as any)
    vi.mocked(getClassById).mockResolvedValue(mockClass as any)
    vi.mocked(getTeachers).mockResolvedValue(mockTeachers as any)
    vi.mocked(getStudentsForList).mockResolvedValue(mockStudents as any)

    render(await EditClassPage({ params: Promise.resolve({ id: 'class-1' }) }))
    expect(screen.getByText('Edit Class: Year 1A')).toBeTruthy()
  })

  it('renders heading for headteacher', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { role: 'headteacher', staffId: 'staff-1' },
    } as any)
    vi.mocked(getClassById).mockResolvedValue(mockClass as any)
    vi.mocked(getTeachers).mockResolvedValue(mockTeachers as any)
    vi.mocked(getStudentsForList).mockResolvedValue(mockStudents as any)

    render(await EditClassPage({ params: Promise.resolve({ id: 'class-1' }) }))
    expect(screen.getByText('Edit Class: Year 1A')).toBeTruthy()
  })

  it('renders ClassForm with class data', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { role: 'admin', staffId: 'staff-1' },
    } as any)
    vi.mocked(getClassById).mockResolvedValue(mockClass as any)
    vi.mocked(getTeachers).mockResolvedValue(mockTeachers as any)
    vi.mocked(getStudentsForList).mockResolvedValue(mockStudents as any)

    render(await EditClassPage({ params: Promise.resolve({ id: 'class-1' }) }))
    expect(screen.getByTestId('class-form')).toBeTruthy()
    expect(screen.getByText('Year 1A')).toBeTruthy()
  })

  it('fetches class, teachers and students', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { role: 'admin', staffId: 'staff-1' },
    } as any)
    vi.mocked(getClassById).mockResolvedValue(mockClass as any)
    vi.mocked(getTeachers).mockResolvedValue(mockTeachers as any)
    vi.mocked(getStudentsForList).mockResolvedValue(mockStudents as any)

    render(await EditClassPage({ params: Promise.resolve({ id: 'class-1' }) }))
    expect(getClassById).toHaveBeenCalledWith('class-1')
    expect(getTeachers).toHaveBeenCalled()
    expect(getStudentsForList).toHaveBeenCalled()
  })
})
