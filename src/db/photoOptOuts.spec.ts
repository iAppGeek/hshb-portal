import { describe, it, expect, vi, beforeEach } from 'vitest'
import { revalidateTag } from 'next/cache'

import {
  createPhotoOptOut,
  getPhotoOptOuts,
  getPendingPhotoOptOutCount,
  getPhotoOptOutById,
  applyPhotoOptOut,
  rejectPhotoOptOut,
  deletePhotoOptOut,
} from './photoOptOuts'

const mockFrom = vi.hoisted(() => vi.fn())
const mockRpc = vi.hoisted(() => vi.fn())

vi.mock('next/cache', () => ({
  unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
  revalidateTag: vi.fn(),
}))

vi.mock('./client', () => ({
  supabase: { from: mockFrom, rpc: mockRpc },
}))

beforeEach(() => {
  vi.clearAllMocks()
})

describe('createPhotoOptOut', () => {
  it('inserts a request and revalidates', async () => {
    mockFrom.mockReturnValue({
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: { id: 'req-1' } }),
        }),
      }),
    })

    const result = await createPhotoOptOut({
      child_first_name: 'Alice',
      child_last_name: 'Student',
      date_of_birth: '2015-06-01',
      declaration_name: 'Gary AliceGuardian',
    } as never)

    expect(result).toEqual({ id: 'req-1' })
    expect(revalidateTag).toHaveBeenCalledWith('photo-opt-outs', 'max')
  })

  it('throws when the insert fails', async () => {
    mockFrom.mockReturnValue({
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ error: new Error('failed') }),
        }),
      }),
    })

    await expect(createPhotoOptOut({} as never)).rejects.toThrow('failed')
  })
})

describe('getPhotoOptOuts', () => {
  it('filters by status when not "all"', async () => {
    const mockEq = vi.fn().mockResolvedValue({ data: [{ id: 'req-1' }] })
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        order: vi.fn().mockReturnValue({ eq: mockEq }),
      }),
    })

    const result = await getPhotoOptOuts('pending')
    expect(result).toEqual([{ id: 'req-1' }])
    expect(mockEq).toHaveBeenCalledWith('status', 'pending')
  })

  it('does not filter when "all"', async () => {
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        order: vi.fn().mockResolvedValue({ data: [] }),
      }),
    })

    expect(await getPhotoOptOuts('all')).toEqual([])
  })
})

describe('getPendingPhotoOptOutCount', () => {
  it('returns the pending count', async () => {
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ count: 2 }),
      }),
    })

    expect(await getPendingPhotoOptOutCount()).toBe(2)
  })

  it('returns 0 when count is null', async () => {
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ count: null }),
      }),
    })

    expect(await getPendingPhotoOptOutCount()).toBe(0)
  })
})

describe('getPhotoOptOutById', () => {
  it('returns the request', async () => {
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: { id: 'req-1' } }),
        }),
      }),
    })

    expect(await getPhotoOptOutById('req-1')).toEqual({ id: 'req-1' })
  })

  it('returns null when not found', async () => {
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: null }),
        }),
      }),
    })

    expect(await getPhotoOptOutById('missing')).toBeNull()
  })
})

describe('applyPhotoOptOut', () => {
  it('passes rpc args through and revalidates', async () => {
    mockRpc.mockResolvedValue({ data: 'student-1', error: null })

    const result = await applyPhotoOptOut({
      requestId: 'req-1',
      staffId: 'staff-1',
      studentId: 'student-1',
    })

    expect(result).toBe('student-1')
    expect(mockRpc).toHaveBeenCalledWith('apply_photo_opt_out', {
      p_request_id: 'req-1',
      p_staff_id: 'staff-1',
      p_student_id: 'student-1',
    })
    expect(revalidateTag).toHaveBeenCalledWith('photo-opt-outs', 'max')
    expect(revalidateTag).toHaveBeenCalledWith('students', 'max')
  })

  it('throws the rpc error', async () => {
    mockRpc.mockResolvedValue({ data: null, error: new Error('rpc failed') })

    await expect(
      applyPhotoOptOut({
        requestId: 'req-1',
        staffId: 'staff-1',
        studentId: 'student-1',
      }),
    ).rejects.toThrow('rpc failed')
  })
})

describe('rejectPhotoOptOut', () => {
  it('updates the request when pending', async () => {
    mockFrom.mockReturnValue({
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            select: vi.fn().mockResolvedValue({ data: [{ id: 'req-1' }] }),
          }),
        }),
      }),
    })

    await rejectPhotoOptOut({
      requestId: 'req-1',
      staffId: 'staff-1',
      reason: 'Cannot match',
    })
    expect(revalidateTag).toHaveBeenCalledWith('photo-opt-outs', 'max')
  })

  it('throws when already actioned', async () => {
    mockFrom.mockReturnValue({
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            select: vi.fn().mockResolvedValue({ data: [] }),
          }),
        }),
      }),
    })

    await expect(
      rejectPhotoOptOut({
        requestId: 'req-1',
        staffId: 'staff-1',
        reason: 'Cannot match',
      }),
    ).rejects.toThrow('already actioned')
  })
})

describe('deletePhotoOptOut', () => {
  it('deletes a non-actioned request', async () => {
    mockFrom.mockReturnValue({
      delete: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          neq: vi.fn().mockReturnValue({
            select: vi.fn().mockResolvedValue({ data: [{ id: 'req-1' }] }),
          }),
        }),
      }),
    })

    await deletePhotoOptOut('req-1')
    expect(revalidateTag).toHaveBeenCalledWith('photo-opt-outs', 'max')
  })

  it('throws when no row is deleted', async () => {
    mockFrom.mockReturnValue({
      delete: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          neq: vi.fn().mockReturnValue({
            select: vi.fn().mockResolvedValue({ data: [] }),
          }),
        }),
      }),
    })

    await expect(deletePhotoOptOut('req-1')).rejects.toThrow(
      'cannot be deleted',
    )
  })
})
