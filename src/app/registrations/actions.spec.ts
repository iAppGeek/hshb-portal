import { describe, it, expect, vi, beforeEach } from 'vitest'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { auth } from '@/auth'
import {
  approveRegistration,
  rejectRegistration,
  deleteRegistrationSubmission,
  getRegistrationSubmissionById,
  logAuditEvent,
} from '@/db'

import {
  approveRegistrationAction,
  rejectRegistrationAction,
  deleteRegistrationAction,
} from './actions'

vi.mock('@/auth', () => ({ auth: vi.fn() }))
vi.mock('next/navigation', () => ({ redirect: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/db', () => ({
  approveRegistration: vi.fn(),
  rejectRegistration: vi.fn(),
  deleteRegistrationSubmission: vi.fn(),
  getRegistrationSubmissionById: vi.fn(),
  logAuditEvent: vi.fn(),
}))

const STAFF_ID = '00000000-0000-4000-8000-000000000001'
const SUBMISSION_ID = '00000000-0000-4000-8000-000000000010'
const STUDENT_ID = '00000000-0000-4000-8000-000000000020'
const CLASS_ID = '00000000-0000-4000-8000-000000000030'

const adminSession = { user: { staffId: STAFF_ID, role: 'admin' } }

function makeFormData(fields: Record<string, string>): FormData {
  const fd = new FormData()
  for (const [key, value] of Object.entries(fields)) {
    fd.set(key, value)
  }
  return fd
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(auth).mockResolvedValue(adminSession as never)
  vi.mocked(redirect).mockImplementation(() => {
    throw new Error('NEXT_REDIRECT')
  })
})

describe('approveRegistrationAction', () => {
  const validFields = {
    student_code: '',
    class_id: CLASS_ID,
    existing_student_id: '',
    reuse_guardians: 'on',
  }

  it('returns error when not authenticated', async () => {
    vi.mocked(auth).mockResolvedValue(null as never)

    const result = await approveRegistrationAction(
      SUBMISSION_ID,
      makeFormData(validFields),
    )
    expect(result).toEqual({ error: 'Not authenticated' })
    expect(approveRegistration).not.toHaveBeenCalled()
  })

  it('returns error when role is headteacher', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { staffId: STAFF_ID, role: 'headteacher' },
    } as never)

    const result = await approveRegistrationAction(
      SUBMISSION_ID,
      makeFormData(validFields),
    )
    expect(result).toEqual({ error: 'Not authorised' })
    expect(approveRegistration).not.toHaveBeenCalled()
  })

  it('returns error when role is secretary', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { staffId: STAFF_ID, role: 'secretary' },
    } as never)

    const result = await approveRegistrationAction(
      SUBMISSION_ID,
      makeFormData(validFields),
    )
    expect(result).toEqual({ error: 'Not authorised' })
  })

  it('returns a zod validation error for an invalid class id', async () => {
    const result = await approveRegistrationAction(
      SUBMISSION_ID,
      makeFormData({ ...validFields, class_id: 'not-a-uuid' }),
    )
    expect(result?.error).toBeDefined()
    expect(approveRegistration).not.toHaveBeenCalled()
  })

  it('returns a friendly error when the RPC throws', async () => {
    vi.mocked(approveRegistration).mockRejectedValue(
      new Error('Submission not found or already actioned'),
    )
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const result = await approveRegistrationAction(
      SUBMISSION_ID,
      makeFormData(validFields),
    )
    expect(result).toEqual({
      error: 'Failed to approve registration. Please try again.',
    })
    consoleSpy.mockRestore()
  })

  it('approves as a new student, audits, and redirects to the student edit page', async () => {
    vi.mocked(approveRegistration).mockResolvedValue(STUDENT_ID)

    await expect(
      approveRegistrationAction(SUBMISSION_ID, makeFormData(validFields)),
    ).rejects.toThrow('NEXT_REDIRECT')

    expect(approveRegistration).toHaveBeenCalledWith({
      submissionId: SUBMISSION_ID,
      staffId: STAFF_ID,
      studentCode: null,
      classId: CLASS_ID,
      existingStudentId: null,
      reuseGuardians: true,
    })
    expect(logAuditEvent).toHaveBeenCalledWith({
      staffId: STAFF_ID,
      action: 'registration_approved',
      entity: 'registration_submission',
      entityId: SUBMISSION_ID,
      details: {
        studentId: STUDENT_ID,
        linkedExisting: false,
        classId: CLASS_ID,
        reuseGuardians: true,
      },
    })
    expect(revalidatePath).toHaveBeenCalledWith('/registrations')
    expect(revalidatePath).toHaveBeenCalledWith('/dashboard')
    expect(revalidatePath).toHaveBeenCalledWith('/students')
    expect(redirect).toHaveBeenCalledWith(`/students/${STUDENT_ID}/edit`)
  })

  it('approves as linking to an existing student', async () => {
    vi.mocked(approveRegistration).mockResolvedValue(STUDENT_ID)
    const existingId = '00000000-0000-4000-8000-000000000099'

    await expect(
      approveRegistrationAction(
        SUBMISSION_ID,
        makeFormData({ ...validFields, existing_student_id: existingId }),
      ),
    ).rejects.toThrow('NEXT_REDIRECT')

    expect(approveRegistration).toHaveBeenCalledWith(
      expect.objectContaining({ existingStudentId: existingId }),
    )
    expect(logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        details: expect.objectContaining({ linkedExisting: true }),
      }),
    )
  })

  it('returns an error when the session has no staff record', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { staffId: undefined, role: 'admin' },
    } as never)

    const result = await approveRegistrationAction(
      SUBMISSION_ID,
      makeFormData(validFields),
    )
    expect(result).toEqual({
      error: 'Your account is not linked to a staff record',
    })
    expect(approveRegistration).not.toHaveBeenCalled()
  })

  it('forwards reuseGuardians: false when the checkbox is unticked', async () => {
    vi.mocked(approveRegistration).mockResolvedValue(STUDENT_ID)
    const { reuse_guardians: _reuseGuardians, ...withoutReuse } = validFields

    await expect(
      approveRegistrationAction(SUBMISSION_ID, makeFormData(withoutReuse)),
    ).rejects.toThrow('NEXT_REDIRECT')

    expect(approveRegistration).toHaveBeenCalledWith(
      expect.objectContaining({ reuseGuardians: false }),
    )
    expect(logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        details: expect.objectContaining({ reuseGuardians: false }),
      }),
    )
  })
})

describe('rejectRegistrationAction', () => {
  it('returns error when not authorised', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { staffId: STAFF_ID, role: 'secretary' },
    } as never)

    const result = await rejectRegistrationAction(
      SUBMISSION_ID,
      makeFormData({ reason: 'Duplicate' }),
    )
    expect(result).toEqual({ error: 'Not authorised' })
    expect(rejectRegistration).not.toHaveBeenCalled()
  })

  it('returns a zod error when reason is missing', async () => {
    const result = await rejectRegistrationAction(
      SUBMISSION_ID,
      makeFormData({ reason: '' }),
    )
    expect(result?.error).toBeDefined()
    expect(rejectRegistration).not.toHaveBeenCalled()
  })

  it('returns an error when the session has no staff record', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { staffId: undefined, role: 'admin' },
    } as never)

    const result = await rejectRegistrationAction(
      SUBMISSION_ID,
      makeFormData({ reason: 'Duplicate' }),
    )
    expect(result).toEqual({
      error: 'Your account is not linked to a staff record',
    })
    expect(rejectRegistration).not.toHaveBeenCalled()
  })

  it('returns a friendly error when reject throws', async () => {
    vi.mocked(rejectRegistration).mockRejectedValue(
      new Error('already actioned'),
    )
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const result = await rejectRegistrationAction(
      SUBMISSION_ID,
      makeFormData({ reason: 'Duplicate' }),
    )
    expect(result).toEqual({
      error: 'Failed to reject registration. Please try again.',
    })
    consoleSpy.mockRestore()
  })

  it('rejects, audits, and redirects on success', async () => {
    vi.mocked(rejectRegistration).mockResolvedValue(undefined)

    await expect(
      rejectRegistrationAction(
        SUBMISSION_ID,
        makeFormData({ reason: 'Duplicate' }),
      ),
    ).rejects.toThrow('NEXT_REDIRECT')

    expect(rejectRegistration).toHaveBeenCalledWith({
      submissionId: SUBMISSION_ID,
      staffId: STAFF_ID,
      reason: 'Duplicate',
    })
    expect(logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'registration_rejected' }),
    )
    expect(redirect).toHaveBeenCalledWith('/registrations?status=rejected')
  })
})

describe('deleteRegistrationAction', () => {
  it('returns error when not authorised', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { staffId: STAFF_ID, role: 'teacher' },
    } as never)

    const result = await deleteRegistrationAction(SUBMISSION_ID)
    expect(result).toEqual({ error: 'Not authorised' })
    expect(deleteRegistrationSubmission).not.toHaveBeenCalled()
  })

  it('returns a friendly error when delete throws', async () => {
    vi.mocked(getRegistrationSubmissionById).mockResolvedValue({
      child_first_name: 'Seed',
      child_last_name: 'Pending',
    } as never)
    vi.mocked(deleteRegistrationSubmission).mockRejectedValue(
      new Error('cannot be deleted'),
    )
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const result = await deleteRegistrationAction(SUBMISSION_ID)
    expect(result).toEqual({
      error: 'Failed to delete registration. Please try again.',
    })
    consoleSpy.mockRestore()
  })

  it('deletes, audits with the child name, and redirects', async () => {
    vi.mocked(getRegistrationSubmissionById).mockResolvedValue({
      child_first_name: 'Seed',
      child_last_name: 'Pending',
    } as never)
    vi.mocked(deleteRegistrationSubmission).mockResolvedValue(undefined)

    await expect(deleteRegistrationAction(SUBMISSION_ID)).rejects.toThrow(
      'NEXT_REDIRECT',
    )

    expect(deleteRegistrationSubmission).toHaveBeenCalledWith(SUBMISSION_ID)
    expect(logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'registration_deleted',
        details: { childName: 'Seed Pending' },
      }),
    )
    expect(redirect).toHaveBeenCalledWith('/registrations?status=rejected')
  })
})
