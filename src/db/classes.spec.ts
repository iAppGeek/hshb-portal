import { describe, it, expect, vi, beforeEach } from 'vitest'
import { updateTag } from 'next/cache'

import {
  getAllClasses,
  getClassesByAcademicYear,
  getClassById,
  getClassesByTeacher,
  createClass,
  updateClass,
  setClassStudents,
} from './classes'

const mockFrom = vi.hoisted(() => vi.fn())
const mockGetCurrentAcademicYear = vi.hoisted(() => vi.fn())

vi.mock('next/cache', () => ({
  unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
  updateTag: vi.fn(),
}))

vi.mock('./client', () => ({
  supabase: { from: mockFrom },
}))

vi.mock('./academic-years', () => ({
  getCurrentAcademicYear: mockGetCurrentAcademicYear,
}))

const currentYear = {
  id: 'year-1',
  code: '2026-27',
  start_date: '2026-09-01',
  end_date: '2027-08-31',
}

beforeEach(() => {
  vi.clearAllMocks()
  mockGetCurrentAcademicYear.mockResolvedValue(currentYear)
})

const mockRawClass = {
  id: 'class-1',
  name: 'Year 3A',
  year_group: '3',
  room_number: 'R12',
  teacher_id: 'staff-1',
  active: true,
  teacher: {
    id: 'staff-1',
    first_name: 'Jane',
    last_name: 'Smith',
    display_name: null,
    email: 'jane@school.com',
  },
  academic_year: {
    id: 'year-1',
    code: '2026-27',
    start_date: '2026-09-01',
    end_date: '2027-08-31',
  },
}

const mockClass = { ...mockRawClass, academic_year: '2026-27' }

describe('getAllClasses', () => {
  it('returns active classes in the current year, flattening the year to its code', async () => {
    const mockEq2 = vi.fn().mockReturnValue({
      order: vi.fn().mockResolvedValue({ data: [mockRawClass] }),
    })
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({ eq: mockEq2 }),
      }),
    })

    const result = await getAllClasses()
    expect(result).toEqual([mockClass])
    expect(mockFrom).toHaveBeenCalledWith('classes')
    expect(mockGetCurrentAcademicYear).toHaveBeenCalled()
  })

  it('returns empty array when no classes exist', async () => {
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: null }),
          }),
        }),
      }),
    })

    const result = await getAllClasses()
    expect(result).toEqual([])
  })
})

describe('getClassesByTeacher', () => {
  it('returns active classes assigned to the given teacher in the current year', async () => {
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({ data: [mockRawClass] }),
            }),
          }),
        }),
      }),
    })

    const result = await getClassesByTeacher('staff-1')
    expect(result).toEqual([mockClass])
  })

  it('returns empty array when teacher has no classes', async () => {
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({ data: null }),
            }),
          }),
        }),
      }),
    })

    const result = await getClassesByTeacher('staff-99')
    expect(result).toEqual([])
  })
})

describe('getClassesByAcademicYear', () => {
  it('returns all classes for the given year without an active filter', async () => {
    const mockData = [
      mockRawClass,
      { ...mockRawClass, id: 'class-2', active: false },
    ]
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({ data: mockData }),
        }),
      }),
    })

    const result = await getClassesByAcademicYear('year-1')
    expect(result).toEqual([
      mockClass,
      { ...mockClass, id: 'class-2', active: false },
    ])
    expect(mockFrom).toHaveBeenCalledWith('classes')
  })

  it('returns empty array when no classes exist', async () => {
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({ data: null }),
        }),
      }),
    })

    const result = await getClassesByAcademicYear('year-1')
    expect(result).toEqual([])
  })
})

describe('getClassById', () => {
  it('returns a class with student enrollments, flattening the year to its code', async () => {
    const mockData = {
      ...mockRawClass,
      student_classes: [{ student_id: 'student-1' }],
    }
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: mockData }),
        }),
      }),
    })

    const result = await getClassById('class-1')
    expect(result).toEqual({
      ...mockClass,
      student_classes: [{ student_id: 'student-1' }],
    })
    expect(mockFrom).toHaveBeenCalledWith('classes')
  })

  it('returns null when class not found', async () => {
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: null }),
        }),
      }),
    })

    const result = await getClassById('nonexistent')
    expect(result).toBeNull()
  })
})

describe('createClass', () => {
  it('inserts a class record and returns it', async () => {
    const input = {
      name: 'Year 1A',
      year_group: '1',
      room_number: 'R1',
      academic_year_id: 'year-1',
      teacher_id: 'staff-1',
    }
    const created = { id: 'class-new', ...input, active: true }
    mockFrom.mockReturnValue({
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: created, error: null }),
        }),
      }),
    })

    const result = await createClass(input)
    expect(result).toEqual(created)
    expect(mockFrom).toHaveBeenCalledWith('classes')
    expect(updateTag).toHaveBeenCalledWith('classes')
  })

  it('throws when supabase returns an error', async () => {
    mockFrom.mockReturnValue({
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi
            .fn()
            .mockResolvedValue({ data: null, error: new Error('DB error') }),
        }),
      }),
    })

    await expect(
      createClass({
        name: 'X',
        year_group: '1',
        academic_year_id: 'year-1',
        teacher_id: 'staff-1',
      }),
    ).rejects.toThrow('DB error')
    expect(updateTag).not.toHaveBeenCalled()
  })
})

describe('updateClass', () => {
  it('calls update with the correct data', async () => {
    const mockEq = vi.fn().mockResolvedValue({ error: null })
    mockFrom.mockReturnValue({
      update: vi.fn().mockReturnValue({ eq: mockEq }),
    })

    await updateClass('class-1', { name: 'Year 1B', active: false })
    expect(mockFrom).toHaveBeenCalledWith('classes')
    expect(mockEq).toHaveBeenCalledWith('id', 'class-1')
    expect(updateTag).toHaveBeenCalledWith('classes')
    expect(updateTag).toHaveBeenCalledWith('students')
  })

  it('throws when supabase returns an error', async () => {
    mockFrom.mockReturnValue({
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: new Error('DB error') }),
      }),
    })

    await expect(updateClass('class-1', { name: 'X' })).rejects.toThrow(
      'DB error',
    )
    expect(updateTag).not.toHaveBeenCalled()
  })
})

describe('setClassStudents', () => {
  it('deletes existing enrollments then inserts new ones', async () => {
    const mockInsert = vi.fn().mockResolvedValue({ error: null })
    const mockDeleteEq = vi.fn().mockResolvedValue({ error: null })
    mockFrom
      .mockReturnValueOnce({
        delete: vi.fn().mockReturnValue({ eq: mockDeleteEq }),
      })
      .mockReturnValueOnce({ insert: mockInsert })

    await setClassStudents('class-1', ['student-1', 'student-2'])

    expect(mockDeleteEq).toHaveBeenCalledWith('class_id', 'class-1')
    expect(mockInsert).toHaveBeenCalledWith([
      { class_id: 'class-1', student_id: 'student-1' },
      { class_id: 'class-1', student_id: 'student-2' },
    ])
    expect(updateTag).toHaveBeenCalledWith('classes')
    expect(updateTag).toHaveBeenCalledWith('students')
  })

  it('skips insert when studentIds is empty', async () => {
    const mockDeleteEq = vi.fn().mockResolvedValue({ error: null })
    mockFrom.mockReturnValue({
      delete: vi.fn().mockReturnValue({ eq: mockDeleteEq }),
    })

    await setClassStudents('class-1', [])
    expect(mockFrom).toHaveBeenCalledTimes(1)
    expect(updateTag).toHaveBeenCalledWith('classes')
    expect(updateTag).toHaveBeenCalledWith('students')
  })

  it('throws when delete fails', async () => {
    mockFrom.mockReturnValue({
      delete: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: new Error('delete error') }),
      }),
    })

    await expect(setClassStudents('class-1', ['s-1'])).rejects.toThrow(
      'delete error',
    )
    expect(updateTag).not.toHaveBeenCalled()
  })
})
