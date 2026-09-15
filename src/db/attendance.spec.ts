import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockFrom = vi.hoisted(() => vi.fn())

vi.mock('./client', () => ({
  supabase: { from: mockFrom },
}))

import {
  getAttendanceByClassAndDate,
  getAttendanceByDateRange,
  saveAttendance,
} from './attendance'

beforeEach(() => {
  vi.clearAllMocks()
})

const mockRow = {
  id: 'att-1',
  class_id: 'class-1',
  student_id: 'student-1',
  date: '2024-03-08',
  status: 'present',
  notes: null,
  recorded_by: 'staff-1',
  created_at: '2024-03-08T10:00:00Z',
  updated_at: '2024-03-08T10:00:00Z',
}

describe('getAttendanceByClassAndDate', () => {
  it('returns attendance rows for the given class and date', async () => {
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: [mockRow], error: null }),
        }),
      }),
    })

    const result = await getAttendanceByClassAndDate('class-1', '2024-03-08')
    expect(result).toEqual([mockRow])
    expect(mockFrom).toHaveBeenCalledWith('attendance')
  })

  it('returns empty array when no records exist', async () => {
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
      }),
    })

    const result = await getAttendanceByClassAndDate('class-1', '2024-03-08')
    expect(result).toEqual([])
  })

  it('throws on database error', async () => {
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi
            .fn()
            .mockResolvedValue({ data: null, error: { message: 'DB error' } }),
        }),
      }),
    })

    await expect(
      getAttendanceByClassAndDate('class-1', '2024-03-08'),
    ).rejects.toEqual({
      message: 'DB error',
    })
  })
})

// ─── getAttendanceByDateRange ────────────────────────────────────────────────

describe('getAttendanceByDateRange', () => {
  const rawRow = {
    class_id: 'class-1',
    student_id: 'student-1',
    date: '2024-03-08',
    status: 'present',
    created_at: '2024-03-08T09:00:00Z',
    updated_at: '2024-03-08T09:00:00Z',
    class: {
      id: 'class-1',
      name: 'Alpha',
      active: true,
      academic_year: { code: '2026-27' },
    },
  }

  function mockPage(data: unknown, error: unknown = null) {
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        gte: vi.fn().mockReturnValue({
          lte: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              range: vi.fn().mockResolvedValue({ data, error }),
            }),
          }),
        }),
      }),
    })
  }

  it('returns attendance rows for a date range, flattened to a SummaryClass', async () => {
    mockPage([rawRow])

    const result = await getAttendanceByDateRange('2024-03-08', '2024-03-09')
    expect(result).toEqual([
      {
        class_id: 'class-1',
        student_id: 'student-1',
        date: '2024-03-08',
        status: 'present',
        created_at: '2024-03-08T09:00:00Z',
        updated_at: '2024-03-08T09:00:00Z',
        class: {
          id: 'class-1',
          name: 'Alpha',
          active: true,
          yearCode: '2026-27',
        },
      },
    ])
    expect(mockFrom).toHaveBeenCalledWith('attendance')
  })

  it('returns empty array when data is null', async () => {
    mockPage(null)
    const result = await getAttendanceByDateRange('2024-03-08', '2024-03-09')
    expect(result).toEqual([])
  })

  it('drops rows whose class join failed', async () => {
    mockPage([{ ...rawRow, class: null }])
    const result = await getAttendanceByDateRange('2024-03-08', '2024-03-09')
    expect(result).toEqual([])
  })

  it('throws on database error', async () => {
    mockPage(null, { message: 'DB error' })
    await expect(
      getAttendanceByDateRange('2024-03-08', '2024-03-09'),
    ).rejects.toEqual({ message: 'DB error' })
  })
})

// ─── saveAttendance ─────────────────────────────────────────────────────────

describe('saveAttendance', () => {
  it('upserts attendance records, keyed by class+student+date', async () => {
    const mockUpsert = vi.fn().mockReturnValue({
      select: vi.fn().mockResolvedValue({ data: [mockRow], error: null }),
    })
    mockFrom.mockReturnValue({ upsert: mockUpsert })

    const records = [
      {
        class_id: 'class-1',
        student_id: 'student-1',
        date: '2024-03-08',
        status: 'present' as const,
        recorded_by: 'staff-1',
      },
    ]

    const result = await saveAttendance(records)
    expect(result).toEqual([mockRow])
    expect(mockFrom).toHaveBeenCalledWith('attendance')
    expect(mockUpsert).toHaveBeenCalledWith(records, {
      onConflict: 'class_id,student_id,date',
    })
  })

  it('throws on database error', async () => {
    mockFrom.mockReturnValue({
      upsert: vi.fn().mockReturnValue({
        select: vi.fn().mockResolvedValue({
          data: null,
          error: { message: 'Upsert failed' },
        }),
      }),
    })

    await expect(saveAttendance([])).rejects.toEqual({
      message: 'Upsert failed',
    })
  })
})
