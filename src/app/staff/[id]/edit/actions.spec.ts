import { describe, it, expect, vi, beforeEach } from 'vitest'

import { getActor } from '@/auth/require'
import { updateStaff } from '@/db'

import { updateStaffAction } from './actions'

vi.mock('@/auth/require', () => ({ getActor: vi.fn() }))

vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  redirect: vi.fn().mockImplementation((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`)
  }),
}))

vi.mock('@/db', () => ({
  updateStaff: vi.fn(),
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
  display_name: 'Ms Smith',
  contact_number: '07700 900001',
  personal_email: 'alice@gmail.com',
}

describe('updateStaffAction', () => {
  it('returns error when not authenticated', async () => {
    vi.mocked(getActor).mockResolvedValue(null as any)

    const result = await updateStaffAction('staff-1', makeFormData(validFields))
    expect(result).toEqual({ error: 'Not authenticated' })
    expect(updateStaff).not.toHaveBeenCalled()
  })

  it('returns error when not authorised', async () => {
    vi.mocked(getActor).mockResolvedValue({
      staffId: 'teacher-1',
      role: 'teacher',
      name: null,
      email: '',
    } as any)

    const result = await updateStaffAction('staff-1', makeFormData(validFields))
    expect(result).toEqual({ error: 'Not authorised' })
    expect(updateStaff).not.toHaveBeenCalled()
  })

  it('calls updateStaff with correct fields', async () => {
    vi.mocked(updateStaff).mockResolvedValue(undefined)

    await expect(
      updateStaffAction('staff-1', makeFormData(validFields)),
    ).rejects.toThrow('NEXT_REDIRECT:/staff')

    expect(updateStaff).toHaveBeenCalledWith('staff-1', {
      title: 'Mr',
      first_name: 'Alice',
      last_name: 'Smith',
      email: 'alice@school.com',
      role: 'teacher',
      display_name: 'Ms Smith',
      contact_number: '07700 900001',
      personal_email: 'alice@gmail.com',
    })
  })

  it('treats empty optional fields as null', async () => {
    vi.mocked(updateStaff).mockResolvedValue(undefined)

    const fields = {
      ...validFields,
      display_name: '',
      contact_number: '',
      personal_email: '',
    }

    await expect(
      updateStaffAction('staff-1', makeFormData(fields)),
    ).rejects.toThrow('NEXT_REDIRECT:/staff')

    expect(updateStaff).toHaveBeenCalledWith(
      'staff-1',
      expect.objectContaining({
        display_name: null,
        contact_number: null,
        personal_email: null,
      }),
    )
  })

  it('redirects to /staff on success', async () => {
    vi.mocked(updateStaff).mockResolvedValue(undefined)

    await expect(
      updateStaffAction('staff-1', makeFormData(validFields)),
    ).rejects.toThrow('NEXT_REDIRECT:/staff')
  })

  it('returns error when updateStaff throws', async () => {
    vi.mocked(updateStaff).mockRejectedValue(new Error('DB error'))

    const result = await updateStaffAction('staff-1', makeFormData(validFields))
    expect(result).toEqual({
      error: 'Failed to update staff member. Please try again.',
    })
  })
})
