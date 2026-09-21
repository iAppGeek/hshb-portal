import { describe, it, expect, vi, beforeEach } from 'vitest'
import { redirect } from 'next/navigation'

import { getActor } from '@/auth/require'
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

vi.mock('@/auth/require', () => ({ getActor: vi.fn() }))
vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  redirect: vi.fn(),
}))
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

const adminSession = { staffId: STAFF_ID, role: 'admin', name: null, email: '' }

function makeFormData(fields: Record<string, string>): FormData {
  const fd = new FormData()
  for (const [key, value] of Object.entries(fields)) {
    fd.set(key, value)
  }
  return fd
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getActor).mockResolvedValue(adminSession as never)
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
    vi.mocked(getActor).mockResolvedValue(null as never)

    const result = await approveRegistrationAction(
      SUBMISSION_ID,
      makeFormData(validFields),
    )
    expect(result).toEqual({ error: 'Not authenticated' })
    expect(approveRegistration).not.toHaveBeenCalled()
  })

  it('returns error when role is headteacher', async () => {
    vi.mocked(getActor).mockResolvedValue({
      staffId: STAFF_ID,
      role: 'headteacher',
      name: null,
      email: '',
    } as never)

    const result = await approveRegistrationAction(
      SUBMISSION_ID,
      makeFormData(validFields),
    )
    expect(result).toEqual({ error: 'Not authorised' })
    expect(approveRegistration).not.toHaveBeenCalled()
  })

  it('returns error when role is secretary', async () => {
    vi.mocked(getActor).mockResolvedValue({
      staffId: STAFF_ID,
      role: 'secretary',
      name: null,
      email: '',
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
    vi.mocked(approveRegistration).mockResolvedValue({
      student_id: STUDENT_ID,
      linked_existing: false,
      guardians: [],
      student_changes: {},
    })

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
        guardians: [],
        studentChanges: {},
      },
    })
    expect(redirect).toHaveBeenCalledWith(`/students/${STUDENT_ID}/edit`)
  })

  it('audits the guardian and student change record from the RPC result', async () => {
    vi.mocked(approveRegistration).mockResolvedValue({
      student_id: STUDENT_ID,
      linked_existing: false,
      guardians: [
        {
          contact_role: 'primary',
          guardian_id: 'guardian-1',
          reused: true,
          matched_on: 'email',
          changes: {
            phone: { old: '07700 900333', new: '07700 900000' },
          },
        },
      ],
      student_changes: {
        first_name: { old: 'Alice', new: 'Alicia' },
      },
    })

    await expect(
      approveRegistrationAction(SUBMISSION_ID, makeFormData(validFields)),
    ).rejects.toThrow('NEXT_REDIRECT')

    expect(logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        details: expect.objectContaining({
          guardians: [
            expect.objectContaining({
              changes: {
                phone: { old: '07700 900333', new: '07700 900000' },
              },
            }),
          ],
          studentChanges: { first_name: { old: 'Alice', new: 'Alicia' } },
        }),
      }),
    )
    const call = vi.mocked(logAuditEvent).mock.calls[0][0]
    expect(
      (
        call.details as {
          guardians: { changes: Record<string, unknown> }[]
        }
      ).guardians[0].changes.phone,
    ).toEqual({ old: '07700 900333', new: '07700 900000' })
  })

  it('approves as linking to an existing student', async () => {
    const existingId = '00000000-0000-4000-8000-000000000099'
    vi.mocked(approveRegistration).mockResolvedValue({
      student_id: STUDENT_ID,
      linked_existing: true,
      guardians: [],
      student_changes: {},
    })

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

  it('returns an error when there is no signed-in staff member', async () => {
    vi.mocked(getActor).mockResolvedValue(null)

    const result = await approveRegistrationAction(
      SUBMISSION_ID,
      makeFormData(validFields),
    )
    expect(result).toEqual({ error: 'Not authenticated' })
    expect(approveRegistration).not.toHaveBeenCalled()
  })

  it('forwards reuseGuardians: false when the checkbox is unticked', async () => {
    vi.mocked(approveRegistration).mockResolvedValue({
      student_id: STUDENT_ID,
      linked_existing: false,
      guardians: [],
      student_changes: {},
    })
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
    vi.mocked(getActor).mockResolvedValue({
      staffId: STAFF_ID,
      role: 'secretary',
      name: null,
      email: '',
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

  it('returns an error when there is no signed-in staff member', async () => {
    vi.mocked(getActor).mockResolvedValue(null)

    const result = await rejectRegistrationAction(
      SUBMISSION_ID,
      makeFormData({ reason: 'Duplicate' }),
    )
    expect(result).toEqual({ error: 'Not authenticated' })
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
    vi.mocked(getActor).mockResolvedValue({
      staffId: STAFF_ID,
      role: 'teacher',
      name: null,
      email: '',
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

  it('deletes, audits with the child name and status, and redirects', async () => {
    vi.mocked(getRegistrationSubmissionById).mockResolvedValue({
      child_first_name: 'Seed',
      child_last_name: 'Pending',
      status: 'actioned',
    } as never)
    vi.mocked(deleteRegistrationSubmission).mockResolvedValue(undefined)

    await expect(deleteRegistrationAction(SUBMISSION_ID)).rejects.toThrow(
      'NEXT_REDIRECT',
    )

    expect(deleteRegistrationSubmission).toHaveBeenCalledWith(SUBMISSION_ID)
    expect(logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'registration_deleted',
        details: { childName: 'Seed Pending', status: 'actioned' },
      }),
    )
    expect(redirect).toHaveBeenCalledWith('/registrations?status=rejected')
  })
})
