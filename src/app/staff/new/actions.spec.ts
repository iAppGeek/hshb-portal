import { describe, it, expect, vi, beforeEach } from 'vitest'

import { getActor } from '@/auth/require'
import { createStaff } from '@/db'

import { createStaffAction } from './actions'

vi.mock('@/auth/require', () => ({ getActor: vi.fn() }))

vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  redirect: vi.fn().mockImplementation((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`)
  }),
}))

vi.mock('@/db', () => ({
  createStaff: vi.fn(),
  logAuditEvent: vi.fn(),
}))

const adminSession = {
  staffId: 'admin-1',
  role: 'admin',
  name: null,
  email: '',
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getActor).mockResolvedValue(adminSession as any)
})

function makeFormData(fields: Record<string, string>): FormData {
  const fd = new FormData()
  for (const [key, value] of Object.entries(fields)) {
    fd.append(key, value)
  }
  return fd
}

const validFields = {
  title: 'Mr',
  first_name: 'Alice',
  last_name: 'Smith',
  email: 'alice@school.com',
  role: 'teacher',
  display_name: '',
  contact_number: '',
  personal_email: '',
}

describe('createStaffAction', () => {
  it('returns error when not authenticated', async () => {
    vi.mocked(getActor).mockResolvedValue(null as any)

    const result = await createStaffAction(makeFormData(validFields))
    expect(result).toEqual({ error: 'Not authenticated' })
    expect(createStaff).not.toHaveBeenCalled()
  })

  it('returns error when not authorised', async () => {
    vi.mocked(getActor).mockResolvedValue({
      staffId: 'teacher-1',
      role: 'teacher',
      name: null,
      email: '',
    } as any)

    const result = await createStaffAction(makeFormData(validFields))
    expect(result).toEqual({ error: 'Not authorised' })
    expect(createStaff).not.toHaveBeenCalled()
  })

  it('calls createStaff with correct fields', async () => {
    vi.mocked(createStaff).mockResolvedValue({} as any)

    await expect(createStaffAction(makeFormData(validFields))).rejects.toThrow(
      'NEXT_REDIRECT:/staff',
    )

    expect(createStaff).toHaveBeenCalledWith({
      title: 'Mr',
      first_name: 'Alice',
      last_name: 'Smith',
      email: 'alice@school.com',
      role: 'teacher',
      display_name: null,
      contact_number: null,
      personal_email: null,
    })
  })

  it('redirects to /staff on success', async () => {
    vi.mocked(createStaff).mockResolvedValue({} as any)

    await expect(createStaffAction(makeFormData(validFields))).rejects.toThrow(
      'NEXT_REDIRECT:/staff',
    )
  })

  it('returns error when createStaff throws', async () => {
    vi.mocked(createStaff).mockRejectedValue(new Error('DB error'))

    const result = await createStaffAction(makeFormData(validFields))
    expect(result).toEqual({
      error: 'Failed to create staff member. Please try again.',
    })
  })
})
