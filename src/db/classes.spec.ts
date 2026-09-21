import { describe, it, expect, vi, beforeEach } from 'vitest'

import {
  getAllClasses,
  getClassesByAcademicYear,
  getClassById,
  getClassesByTeacher,
  getEnrolmentsForClass,
  getEnrolmentsInRange,
  createClass,
  updateClass,
  setClassStudents,
  migrateClass,
} from './classes'

const mockFrom = vi.hoisted(() => vi.fn())
const mockRpc = vi.hoisted(() => vi.fn())
const mockGetCurrentAcademicYear = vi.hoisted(() => vi.fn())

vi.mock('./client', () => ({
  supabase: { from: mockFrom, rpc: mockRpc },
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
  it('returns a class with open student enrolments, flattening the year to its code', async () => {
    const mockData = {
      ...mockRawClass,
      student_classes: [{ student_id: 'student-1' }],
    }
    const mockIs = vi.fn().mockReturnValue({
      single: vi.fn().mockResolvedValue({ data: mockData }),
    })
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({ is: mockIs }),
      }),
    })

    const result = await getClassById('class-1')
    expect(result).toEqual({
      ...mockClass,
      student_classes: [{ student_id: 'student-1' }],
    })
    expect(mockFrom).toHaveBeenCalledWith('classes')
    expect(mockIs).toHaveBeenCalledWith('student_classes.end_date', null)
  })

  it('returns null when class not found', async () => {
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          is: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: null }),
          }),
        }),
      }),
    })

    const result = await getClassById('nonexistent')
    expect(result).toBeNull()
  })
})

describe('getEnrolmentsForClass', () => {
  it('returns dated enrolment rows for the class', async () => {
    const rows = [
      {
        class_id: 'class-1',
        student_id: 'student-1',
        start_date: '2026-09-01',
        end_date: null,
      },
    ]
    const mockEq = vi.fn().mockResolvedValue({ data: rows, error: null })
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({ eq: mockEq }),
    })

    const result = await getEnrolmentsForClass('class-1')
    expect(result).toEqual(rows)
    expect(mockFrom).toHaveBeenCalledWith('student_classes')
    expect(mockEq).toHaveBeenCalledWith('class_id', 'class-1')
  })

  it('throws on error', async () => {
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data: null, error: new Error('boom') }),
      }),
    })

    await expect(getEnrolmentsForClass('class-1')).rejects.toThrow('boom')
  })
})

describe('getEnrolmentsInRange', () => {
  it('pages results and flattens the class embed to a SummaryClass', async () => {
    const rawRow = {
      class_id: 'class-1',
      student_id: 'student-1',
      start_date: '2026-09-01',
      end_date: null,
      class: {
        id: 'class-1',
        name: 'Alpha',
        active: true,
        academic_year: { code: '2026-27' },
      },
    }
    const mockRange = vi.fn().mockResolvedValue({ data: [rawRow], error: null })
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        lte: vi.fn().mockReturnValue({
          or: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({ range: mockRange }),
          }),
        }),
      }),
    })

    const result = await getEnrolmentsInRange('2026-09-01', '2026-09-30')
    expect(result).toEqual([
      {
        class_id: 'class-1',
        student_id: 'student-1',
        start_date: '2026-09-01',
        end_date: null,
        class: {
          id: 'class-1',
          name: 'Alpha',
          active: true,
          yearCode: '2026-27',
        },
      },
    ])
  })

  it('drops rows whose class join failed', async () => {
    const mockRange = vi.fn().mockResolvedValue({
      data: [
        {
          class_id: 'class-1',
          student_id: 'student-1',
          start_date: '2026-09-01',
          end_date: null,
          class: null,
        },
      ],
      error: null,
    })
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        lte: vi.fn().mockReturnValue({
          or: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({ range: mockRange }),
          }),
        }),
      }),
    })

    const result = await getEnrolmentsInRange('2026-09-01', '2026-09-30')
    expect(result).toEqual([])
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
  })
})

describe('updateClass', () => {
  it('calls update with the correct data, without an active field', async () => {
    const mockEq = vi.fn().mockResolvedValue({ error: null })
    mockFrom.mockReturnValue({
      update: vi.fn().mockReturnValue({ eq: mockEq }),
    })

    await updateClass('class-1', { name: 'Year 1B' })
    expect(mockFrom).toHaveBeenCalledWith('classes')
    expect(mockEq).toHaveBeenCalledWith('id', 'class-1')
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
  })
})

describe('setClassStudents', () => {
  it('calls set_enrolments in class mode and never deletes', async () => {
    mockRpc.mockResolvedValue({ error: null })

    await setClassStudents('class-1', ['student-1', 'student-2'])

    expect(mockRpc).toHaveBeenCalledWith('set_enrolments', {
      p_student_id: null,
      p_class_id: 'class-1',
      p_ids: ['student-1', 'student-2'],
    })
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('throws on rpc error', async () => {
    mockRpc.mockResolvedValue({ error: new Error('Completed classes') })

    await expect(setClassStudents('class-1', [])).rejects.toThrow(
      'Completed classes',
    )
  })
})

describe('migrateClass', () => {
  it('passes student actions and new-class fields through to the rpc', async () => {
    mockRpc.mockResolvedValue({
      data: { new_class_id: 'class-2', moved: 1, unassigned: 0, leavers: 1 },
      error: null,
    })

    const result = await migrateClass({
      sourceClassId: 'class-1',
      studentActions: { 'student-1': 'move', 'student-2': 'graduated' },
      newClass: {
        name: 'Year 2A',
        year_group: '2',
        room_number: null,
        academic_year_id: 'year-2',
        teacher_id: 'staff-1',
      },
    })

    expect(result).toEqual({
      new_class_id: 'class-2',
      moved: 1,
      unassigned: 0,
      leavers: 1,
    })
    expect(mockRpc).toHaveBeenCalledWith('migrate_class', {
      p_source_class_id: 'class-1',
      p_student_actions: { 'student-1': 'move', 'student-2': 'graduated' },
      p_academic_year_id: 'year-2',
      p_name: 'Year 2A',
      p_year_group: '2',
      p_room_number: undefined,
      p_teacher_id: 'staff-1',
    })
  })

  it('passes undefined new-class fields when no new class is created', async () => {
    mockRpc.mockResolvedValue({
      data: { new_class_id: null, moved: 0, unassigned: 1, leavers: 0 },
      error: null,
    })

    await migrateClass({
      sourceClassId: 'class-1',
      studentActions: { 'student-1': 'none' },
      newClass: null,
    })

    expect(mockRpc).toHaveBeenCalledWith('migrate_class', {
      p_source_class_id: 'class-1',
      p_student_actions: { 'student-1': 'none' },
      p_academic_year_id: undefined,
      p_name: undefined,
      p_year_group: undefined,
      p_room_number: undefined,
      p_teacher_id: undefined,
    })
  })

  it('throws on rpc error', async () => {
    mockRpc.mockResolvedValue({ data: null, error: new Error('DB error') })

    await expect(
      migrateClass({
        sourceClassId: 'class-1',
        studentActions: {},
        newClass: null,
      }),
    ).rejects.toThrow('DB error')
  })
})
