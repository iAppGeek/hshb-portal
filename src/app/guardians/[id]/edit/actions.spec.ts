import { describe, it, expect, vi, beforeEach } from 'vitest'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'

import { getActor } from '@/auth/require'
import { updateGuardian } from '@/db'

import { updateGuardianAction } from './actions'

vi.mock('server-only', () => ({}))
vi.mock('@/auth/require', () => ({ getActor: vi.fn() }))
vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  redirect: vi.fn(),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/db', () => ({
  updateGuardian: vi.fn(),
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
    fd.set(key, value)
  }
  return fd
}

const baseFields = {
  first_name: 'Maria',
  last_name: 'Smith',
  phone: '07700 900000',
  email: 'maria@example.com',
  occupation: 'Teacher',
  address_line_1: '1 Main Street',
  address_line_2: '',
  city: 'London',
  postcode: 'EC1A 1BB',
  notes: '',
}

describe('updateGuardianAction', () => {
  it('returns error when not authenticated', async () => {
    vi.mocked(getActor).mockResolvedValue(null as any)

    const result = await updateGuardianAction(
      'guardian-1',
      makeFormData(baseFields),
    )
    expect(result).toEqual({ error: 'Not authenticated' })
    expect(updateGuardian).not.toHaveBeenCalled()
  })

  it('returns error when not authorised', async () => {
    vi.mocked(getActor).mockResolvedValue({
      staffId: 'teacher-1',
      role: 'teacher',
      name: null,
      email: '',
    } as any)

    const result = await updateGuardianAction(
      'guardian-1',
      makeFormData(baseFields),
    )
    expect(result).toEqual({ error: 'Not authorised' })
    expect(updateGuardian).not.toHaveBeenCalled()
  })

  it('updates guardian and redirects back to edit page', async () => {
    vi.mocked(updateGuardian).mockResolvedValue(undefined)
    vi.mocked(redirect).mockImplementation(() => {
      throw new Error('NEXT_REDIRECT')
    })

    await expect(
      updateGuardianAction('guardian-1', makeFormData(baseFields)),
    ).rejects.toThrow('NEXT_REDIRECT')

    expect(updateGuardian).toHaveBeenCalledWith(
      'guardian-1',
      expect.objectContaining({
        first_name: 'Maria',
        last_name: 'Smith',
        phone: '07700 900000',
        email: 'maria@example.com',
      }),
    )
    expect(revalidatePath).toHaveBeenCalledWith('/students')
    expect(revalidatePath).toHaveBeenCalledWith('/guardians/guardian-1/edit')
    expect(redirect).toHaveBeenCalledWith('/guardians/guardian-1/edit')
  })

  it('returns error when update throws', async () => {
    vi.mocked(updateGuardian).mockRejectedValue(new Error('DB error'))

    const result = await updateGuardianAction(
      'guardian-1',
      makeFormData(baseFields),
    )
    expect(result).toEqual({
      error: 'Failed to save guardian. Please try again.',
    })
    expect(redirect).not.toHaveBeenCalled()
  })

  it('passes null for empty optional fields', async () => {
    vi.mocked(updateGuardian).mockResolvedValue(undefined)
    vi.mocked(redirect).mockImplementation(() => {
      throw new Error('NEXT_REDIRECT')
    })

    const fields = { ...baseFields, email: '', notes: '', occupation: '' }

    await expect(
      updateGuardianAction('guardian-1', makeFormData(fields)),
    ).rejects.toThrow('NEXT_REDIRECT')

    expect(updateGuardian).toHaveBeenCalledWith(
      'guardian-1',
      expect.objectContaining({
        email: null,
        notes: null,
        // Optional here: this page cannot tell a parent from an emergency
        // contact, so it must never block an unrelated edit.
        occupation: null,
      }),
    )
  })
})
