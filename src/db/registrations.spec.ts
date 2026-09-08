import { describe, it, expect, vi, beforeEach } from 'vitest'
import { revalidateTag } from 'next/cache'

import {
  createRegistrationSubmission,
  getRegistrationSubmissions,
  getPendingRegistrationCount,
  getRegistrationSubmissionById,
  approveRegistration,
  rejectRegistration,
  deleteRegistrationSubmission,
  purgeActionedSubmissions,
} from './registrations'

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

describe('createRegistrationSubmission', () => {
  it('calls the rpc with p_submission and p_contacts and returns the id', async () => {
    mockRpc.mockResolvedValue({ data: 'sub-1', error: null })

    const result = await createRegistrationSubmission({
      submission: { child_first_name: 'Seed' } as never,
      contacts: [{ contact_role: 'primary', first_name: 'Petra' } as never],
    })

    expect(result).toEqual({ id: 'sub-1' })
    expect(mockRpc).toHaveBeenCalledWith('create_registration_submission', {
      p_submission: { child_first_name: 'Seed' },
      p_contacts: [{ contact_role: 'primary', first_name: 'Petra' }],
    })
  })

  it('revalidates the registrations tag', async () => {
    mockRpc.mockResolvedValue({ data: 'sub-1', error: null })

    await createRegistrationSubmission({
      submission: { child_first_name: 'Seed' } as never,
      contacts: [],
    })

    expect(revalidateTag).toHaveBeenCalledWith('registrations', 'max')
  })

  it('throws the rpc error', async () => {
    mockRpc.mockResolvedValue({ data: null, error: new Error('rpc failed') })

    await expect(
      createRegistrationSubmission({
        submission: {} as never,
        contacts: [],
      }),
    ).rejects.toThrow('rpc failed')
    expect(revalidateTag).not.toHaveBeenCalled()
  })
})

describe('getRegistrationSubmissions', () => {
  it('filters by status when not "all"', async () => {
    const mockEqStatus = vi.fn().mockResolvedValue({
      data: [
        {
          id: 'sub-1',
          primary_contact: [{ first_name: 'Petra', last_name: 'Pending' }],
        },
      ],
    })
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({ eq: mockEqStatus }),
        }),
      }),
    })

    const result = await getRegistrationSubmissions('pending')
    expect(result[0].primary_contact).toEqual({
      first_name: 'Petra',
      last_name: 'Pending',
    })
  })

  it('does not filter by status when "all"', async () => {
    const mockOrder = vi.fn().mockResolvedValue({
      data: [{ id: 'sub-1', primary_contact: [] }],
    })
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({ order: mockOrder }),
      }),
    })

    const result = await getRegistrationSubmissions('all')
    expect(result[0].primary_contact).toBeNull()
  })
})

describe('getPendingRegistrationCount', () => {
  it('returns the pending count', async () => {
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ count: 3 }),
      }),
    })

    expect(await getPendingRegistrationCount()).toBe(3)
  })

  it('returns 0 when count is null', async () => {
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ count: null }),
      }),
    })

    expect(await getPendingRegistrationCount()).toBe(0)
  })
})

describe('getRegistrationSubmissionById', () => {
  it('returns the submission with its contacts', async () => {
    mockFrom
      .mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: { id: 'sub-1' } }),
          }),
        }),
      })
      .mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: [{ id: 'contact-1' }] }),
        }),
      })

    const result = await getRegistrationSubmissionById('sub-1')
    expect(result).toEqual({ id: 'sub-1', contacts: [{ id: 'contact-1' }] })
  })

  it('returns null when the submission is not found', async () => {
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: null }),
        }),
      }),
    })

    expect(await getRegistrationSubmissionById('missing')).toBeNull()
  })
})

describe('approveRegistration', () => {
  it('passes rpc args through and revalidates', async () => {
    mockRpc.mockResolvedValue({ data: 'student-1', error: null })

    const result = await approveRegistration({
      submissionId: 'sub-1',
      staffId: 'staff-1',
      studentCode: 'S001',
      classId: 'class-1',
      existingStudentId: null,
      reuseGuardians: true,
    })

    expect(result).toBe('student-1')
    expect(mockRpc).toHaveBeenCalledWith('approve_registration', {
      p_submission_id: 'sub-1',
      p_staff_id: 'staff-1',
      p_student_code: 'S001',
      p_class_id: 'class-1',
      p_existing_student_id: undefined,
      p_reuse_guardians: true,
    })
    expect(revalidateTag).toHaveBeenCalledWith('registrations', 'max')
    expect(revalidateTag).toHaveBeenCalledWith('students', 'max')
    expect(revalidateTag).toHaveBeenCalledWith('classes', 'max')
  })

  it('throws the rpc error', async () => {
    mockRpc.mockResolvedValue({ data: null, error: new Error('rpc failed') })

    await expect(
      approveRegistration({
        submissionId: 'sub-1',
        staffId: 'staff-1',
        studentCode: null,
        classId: null,
        existingStudentId: null,
        reuseGuardians: true,
      }),
    ).rejects.toThrow('rpc failed')
  })
})

describe('rejectRegistration', () => {
  it('updates the submission when pending', async () => {
    const mockSelect = vi.fn().mockResolvedValue({ data: [{ id: 'sub-1' }] })
    mockFrom.mockReturnValue({
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({ select: mockSelect }),
        }),
      }),
    })

    await rejectRegistration({
      submissionId: 'sub-1',
      staffId: 'staff-1',
      reason: 'Duplicate',
    })
    expect(revalidateTag).toHaveBeenCalledWith('registrations', 'max')
  })

  it('throws when already actioned (no row returned)', async () => {
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
      rejectRegistration({
        submissionId: 'sub-1',
        staffId: 'staff-1',
        reason: 'Duplicate',
      }),
    ).rejects.toThrow('already actioned')
  })
})

describe('deleteRegistrationSubmission', () => {
  it('deletes a non-actioned submission', async () => {
    mockFrom.mockReturnValue({
      delete: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          neq: vi.fn().mockReturnValue({
            select: vi.fn().mockResolvedValue({ data: [{ id: 'sub-1' }] }),
          }),
        }),
      }),
    })

    await deleteRegistrationSubmission('sub-1')
    expect(revalidateTag).toHaveBeenCalledWith('registrations', 'max')
  })

  it('throws when no row is deleted (actioned or missing)', async () => {
    mockFrom.mockReturnValue({
      delete: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          neq: vi.fn().mockReturnValue({
            select: vi.fn().mockResolvedValue({ data: [] }),
          }),
        }),
      }),
    })

    await expect(deleteRegistrationSubmission('sub-1')).rejects.toThrow(
      'cannot be deleted',
    )
  })
})

describe('purgeActionedSubmissions', () => {
  it('passes the day count and returns the rpc number', async () => {
    mockRpc.mockResolvedValue({ data: 5, error: null })

    const result = await purgeActionedSubmissions(30)

    expect(result).toBe(5)
    expect(mockRpc).toHaveBeenCalledWith('purge_actioned_submissions', {
      p_older_than_days: 30,
    })
    expect(revalidateTag).toHaveBeenCalledWith('registrations', 'max')
    expect(revalidateTag).toHaveBeenCalledWith('photo-opt-outs', 'max')
  })

  it('defaults to 90 days when not given', async () => {
    mockRpc.mockResolvedValue({ data: 0, error: null })

    await purgeActionedSubmissions()

    expect(mockRpc).toHaveBeenCalledWith('purge_actioned_submissions', {
      p_older_than_days: 90,
    })
  })

  it('returns 0 when data is null', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null })

    const result = await purgeActionedSubmissions()
    expect(result).toBe(0)
  })

  it('throws the rpc error', async () => {
    mockRpc.mockResolvedValue({ data: null, error: new Error('rpc failed') })

    await expect(purgeActionedSubmissions()).rejects.toThrow('rpc failed')
  })
})
