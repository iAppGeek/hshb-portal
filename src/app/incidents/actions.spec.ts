import { describe, it, expect, vi, beforeEach } from 'vitest'
import { redirect } from 'next/navigation'

import { getActor } from '@/auth/require'
import { createIncident, updateIncident } from '@/db'
import { getUserFriendlyDbError } from '@/lib/db-error'

import { saveIncidentAction } from './actions'

vi.mock('@/auth/require', () => ({ getActor: vi.fn() }))
vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  redirect: vi.fn(),
}))
vi.mock('@/db', () => ({
  createIncident: vi.fn(),
  updateIncident: vi.fn(),
  logAuditEvent: vi.fn(),
}))
vi.mock('@/lib/db-error', () => ({
  getUserFriendlyDbError: vi.fn((_err: unknown, fallback: string) => fallback),
}))

const STAFF_ID = '00000000-0000-4000-8000-000000000001'
const STUDENT_ID = '00000000-0000-4000-8000-000000000010'
const INCIDENT_ID = '00000000-0000-4000-8000-000000000020'

const adminSession = { staffId: STAFF_ID, role: 'admin', name: null, email: '' }
const teacherSession = {
  staffId: STAFF_ID,
  role: 'teacher',
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

const baseCreateFields: Record<string, string> = {
  type: 'medical',
  student_id: STUDENT_ID,
  title: 'Fell in playground',
  description: 'Student fell and scraped knee',
  incident_date: '2026-03-28T10:30',
  parent_notified: 'false',
  parent_notified_at: '',
}

const baseUpdateFields: Record<string, string> = {
  type: 'medical',
  title: 'Fell in playground',
  description: 'Student fell and scraped knee — updated',
  incident_date: '2026-03-28T10:30',
  parent_notified: 'true',
  parent_notified_at: '2026-03-28T11:00',
}

// ─── saveIncidentAction: create ─────────────────────────────────────────────

describe('saveIncidentAction (create)', () => {
  it('returns error when not authenticated', async () => {
    vi.mocked(getActor).mockResolvedValue(null as any)

    const result = await saveIncidentAction(
      null,
      makeFormData(baseCreateFields),
    )
    expect(result).toEqual({ error: 'Not authenticated' })
    expect(createIncident).not.toHaveBeenCalled()
  })

  it('returns error when validation fails', async () => {
    const fields = { ...baseCreateFields, title: '' }
    const result = await saveIncidentAction(null, makeFormData(fields))

    expect(result).toMatchObject({ error: expect.any(String) })
    expect(createIncident).not.toHaveBeenCalled()
  })

  it('creates incident and redirects on success', async () => {
    vi.mocked(createIncident).mockResolvedValue({ id: INCIDENT_ID } as any)
    vi.mocked(redirect).mockImplementation(() => {
      throw new Error('NEXT_REDIRECT')
    })

    await expect(
      saveIncidentAction(null, makeFormData(baseCreateFields)),
    ).rejects.toThrow('NEXT_REDIRECT')

    expect(createIncident).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'medical',
        title: 'Fell in playground',
        created_by: STAFF_ID,
      }),
    )
    expect(redirect).toHaveBeenCalledWith('/incidents?tab=medical')
  })

  it('sets parent_notified_at to null when parent_notified is false', async () => {
    vi.mocked(createIncident).mockResolvedValue({ id: INCIDENT_ID } as any)
    vi.mocked(redirect).mockImplementation(() => {
      throw new Error('NEXT_REDIRECT')
    })

    await expect(
      saveIncidentAction(null, makeFormData(baseCreateFields)),
    ).rejects.toThrow('NEXT_REDIRECT')

    expect(createIncident).toHaveBeenCalledWith(
      expect.objectContaining({
        parent_notified: false,
        parent_notified_at: null,
      }),
    )
  })

  it('accepts a missing parent_notified_at, which the unticked form omits', async () => {
    vi.mocked(createIncident).mockResolvedValue({ id: INCIDENT_ID } as any)
    vi.mocked(redirect).mockImplementation(() => {
      throw new Error('NEXT_REDIRECT')
    })

    const fields = { ...baseCreateFields }
    delete fields.parent_notified_at

    await expect(
      saveIncidentAction(null, makeFormData(fields)),
    ).rejects.toThrow('NEXT_REDIRECT')

    expect(createIncident).toHaveBeenCalledWith(
      expect.objectContaining({ parent_notified_at: null }),
    )
  })

  it('returns error when creation fails', async () => {
    vi.mocked(createIncident).mockRejectedValue(new Error('DB error'))

    const result = await saveIncidentAction(
      null,
      makeFormData(baseCreateFields),
    )
    expect(result).toEqual({
      error: 'Failed to create incident. Please try again.',
    })
    expect(redirect).not.toHaveBeenCalled()
  })

  it('delegates DB errors to getUserFriendlyDbError', async () => {
    const dbErr = new Error('DB error')
    vi.mocked(createIncident).mockRejectedValue(dbErr)

    await saveIncidentAction(null, makeFormData(baseCreateFields))

    expect(getUserFriendlyDbError).toHaveBeenCalledWith(
      dbErr,
      'Failed to create incident. Please try again.',
    )
  })
})

// ─── saveIncidentAction: update ─────────────────────────────────────────────

describe('saveIncidentAction (update)', () => {
  it('returns error when not authenticated', async () => {
    vi.mocked(getActor).mockResolvedValue(null as any)

    const result = await saveIncidentAction(
      INCIDENT_ID,
      makeFormData(baseUpdateFields),
    )
    expect(result).toEqual({ error: 'Not authenticated' })
    expect(updateIncident).not.toHaveBeenCalled()
  })

  it('returns error when not authorised', async () => {
    vi.mocked(getActor).mockResolvedValue(teacherSession as any)

    const result = await saveIncidentAction(
      INCIDENT_ID,
      makeFormData(baseUpdateFields),
    )
    expect(result).toEqual({ error: 'Not authorised' })
    expect(updateIncident).not.toHaveBeenCalled()
  })

  it('updates incident and redirects on success', async () => {
    vi.mocked(updateIncident).mockResolvedValue(undefined as any)
    vi.mocked(redirect).mockImplementation(() => {
      throw new Error('NEXT_REDIRECT')
    })

    await expect(
      saveIncidentAction(INCIDENT_ID, makeFormData(baseUpdateFields)),
    ).rejects.toThrow('NEXT_REDIRECT')

    expect(updateIncident).toHaveBeenCalledWith(
      INCIDENT_ID,
      expect.objectContaining({
        updated_by: STAFF_ID,
        parent_notified: true,
      }),
    )
    expect(redirect).toHaveBeenCalledWith('/incidents?tab=medical')
  })

  it('returns error when update fails', async () => {
    vi.mocked(updateIncident).mockRejectedValue(new Error('DB error'))

    const result = await saveIncidentAction(
      INCIDENT_ID,
      makeFormData(baseUpdateFields),
    )
    expect(result).toEqual({
      error: 'Failed to update incident. Please try again.',
    })
    expect(redirect).not.toHaveBeenCalled()
  })

  it('accepts a missing parent_notified_at, which the unticked form omits', async () => {
    vi.mocked(updateIncident).mockResolvedValue(undefined as any)
    vi.mocked(redirect).mockImplementation(() => {
      throw new Error('NEXT_REDIRECT')
    })

    const fields: Record<string, string> = {
      ...baseUpdateFields,
      parent_notified: 'false',
    }
    delete fields.parent_notified_at

    await expect(
      saveIncidentAction(INCIDENT_ID, makeFormData(fields)),
    ).rejects.toThrow('NEXT_REDIRECT')

    expect(updateIncident).toHaveBeenCalledWith(
      INCIDENT_ID,
      expect.objectContaining({ parent_notified_at: null }),
    )
  })

  it('returns error when validation fails', async () => {
    const fields = { ...baseUpdateFields, description: '' }
    const result = await saveIncidentAction(INCIDENT_ID, makeFormData(fields))

    expect(result).toMatchObject({ error: expect.any(String) })
    expect(updateIncident).not.toHaveBeenCalled()
  })
})
