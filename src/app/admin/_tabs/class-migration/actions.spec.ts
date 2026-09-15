import { describe, it, expect, vi, beforeEach } from 'vitest'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { auth } from '@/auth'
import { migrateClass, logAuditEvent } from '@/db'

import { migrateClassAction } from './actions'

vi.mock('@/auth', () => ({ auth: vi.fn() }))
vi.mock('next/navigation', () => ({ redirect: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/db', () => ({
  migrateClass: vi.fn(),
  logAuditEvent: vi.fn(),
}))

const STAFF_ID = '00000000-0000-4000-8000-000000000001'
const SOURCE_CLASS_ID = '00000000-0000-4000-8000-000000000010'
const NEW_CLASS_ID = '00000000-0000-4000-8000-000000000011'
const TEACHER_ID = '00000000-0000-4000-8000-000000000020'
const YEAR_ID = '00000000-0000-4000-8000-000000000030'
const STUDENT_1 = '00000000-0000-4000-8000-000000000040'
const STUDENT_2 = '00000000-0000-4000-8000-000000000050'

const adminSession = { user: { staffId: STAFF_ID, role: 'admin' } }

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(auth).mockResolvedValue(adminSession as any)
})

function makeFormData(fields: Record<string, string>): FormData {
  const fd = new FormData()
  for (const [key, value] of Object.entries(fields)) {
    fd.set(key, value)
  }
  return fd
}

const withNewClassFields = {
  create_new_class: 'true',
  source_class_id: SOURCE_CLASS_ID,
  name: 'Year 2A',
  year_group: '2',
  room_number: 'R2',
  academic_year_id: YEAR_ID,
  teacher_id: TEACHER_ID,
  [`action_${STUDENT_1}`]: 'move',
  [`action_${STUDENT_2}`]: 'graduated',
}

const withoutNewClassFields = {
  create_new_class: 'false',
  source_class_id: SOURCE_CLASS_ID,
  [`action_${STUDENT_1}`]: 'none',
  [`action_${STUDENT_2}`]: 'left',
}

describe('migrateClassAction', () => {
  it('returns error when not authenticated', async () => {
    vi.mocked(auth).mockResolvedValue(null as any)

    const result = await migrateClassAction(makeFormData(withNewClassFields))
    expect(result).toEqual({ error: 'Not authenticated' })
    expect(migrateClass).not.toHaveBeenCalled()
  })

  it('returns error when role is teacher', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { staffId: STAFF_ID, role: 'teacher' },
    } as any)

    const result = await migrateClassAction(makeFormData(withNewClassFields))
    expect(result).toEqual({ error: 'Not authorised' })
    expect(migrateClass).not.toHaveBeenCalled()
  })

  it('returns validation error for invalid source_class_id', async () => {
    const result = await migrateClassAction(
      makeFormData({ ...withNewClassFields, source_class_id: 'not-a-uuid' }),
    )
    expect(result).toEqual({ error: expect.any(String) })
    expect(migrateClass).not.toHaveBeenCalled()
  })

  it('rejects a move action when create_new_class is false', async () => {
    const result = await migrateClassAction(
      makeFormData({
        ...withoutNewClassFields,
        [`action_${STUDENT_1}`]: 'move',
      }),
    )
    expect(result).toEqual({ error: expect.any(String) })
    expect(migrateClass).not.toHaveBeenCalled()
  })

  it('returns user-friendly error when migrateClass throws', async () => {
    vi.mocked(migrateClass).mockRejectedValue({
      code: '23505',
      message: 'duplicate key value violates unique constraint',
      details: 'Key (name)=(Year 2A) already exists.',
    })

    const result = await migrateClassAction(makeFormData(withNewClassFields))
    expect(result).toEqual({
      error: 'A record with this name already exists.',
    })
    expect(redirect).not.toHaveBeenCalled()
  })

  it('calls migrateClass with correct args when creating a new class, logs audit, revalidates, and redirects', async () => {
    vi.mocked(migrateClass).mockResolvedValue({
      new_class_id: NEW_CLASS_ID,
      moved: 1,
      unassigned: 0,
      leavers: 1,
    })
    vi.mocked(redirect).mockImplementation(() => {
      throw new Error('NEXT_REDIRECT')
    })

    await expect(
      migrateClassAction(makeFormData(withNewClassFields)),
    ).rejects.toThrow('NEXT_REDIRECT')

    expect(migrateClass).toHaveBeenCalledWith({
      sourceClassId: SOURCE_CLASS_ID,
      studentActions: { [STUDENT_1]: 'move', [STUDENT_2]: 'graduated' },
      newClass: {
        name: 'Year 2A',
        year_group: '2',
        room_number: 'R2',
        academic_year_id: YEAR_ID,
        teacher_id: TEACHER_ID,
      },
    })
    expect(logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        staffId: STAFF_ID,
        action: 'create',
        entity: 'class',
        entityId: NEW_CLASS_ID,
      }),
    )
    expect(logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        staffId: STAFF_ID,
        action: 'update',
        entity: 'class',
        entityId: SOURCE_CLASS_ID,
        details: {
          migrated_to: NEW_CLASS_ID,
          deactivated: true,
          moved: 1,
          unassigned: 0,
          leavers: 1,
        },
      }),
    )
    expect(revalidatePath).toHaveBeenCalledWith('/admin')
    expect(redirect).toHaveBeenCalledWith('/admin')
  })

  it('calls migrateClass with newClass: null when not creating a new class', async () => {
    vi.mocked(migrateClass).mockResolvedValue({
      new_class_id: null,
      moved: 0,
      unassigned: 1,
      leavers: 1,
    })
    vi.mocked(redirect).mockImplementation(() => {
      throw new Error('NEXT_REDIRECT')
    })

    await expect(
      migrateClassAction(makeFormData(withoutNewClassFields)),
    ).rejects.toThrow('NEXT_REDIRECT')

    expect(migrateClass).toHaveBeenCalledWith({
      sourceClassId: SOURCE_CLASS_ID,
      studentActions: { [STUDENT_1]: 'none', [STUDENT_2]: 'left' },
      newClass: null,
    })
    // No new class was created, so there is no create audit entry.
    expect(logAuditEvent).not.toHaveBeenCalledWith(
      expect.objectContaining({ action: 'create' }),
    )
    expect(logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'update',
        entityId: SOURCE_CLASS_ID,
        details: expect.objectContaining({ migrated_to: null }),
      }),
    )
  })

  it('converts empty room_number to null', async () => {
    vi.mocked(migrateClass).mockResolvedValue({
      new_class_id: NEW_CLASS_ID,
      moved: 2,
      unassigned: 0,
      leavers: 0,
    })
    vi.mocked(redirect).mockImplementation(() => {
      throw new Error('NEXT_REDIRECT')
    })

    await expect(
      migrateClassAction(
        makeFormData({ ...withNewClassFields, room_number: '' }),
      ),
    ).rejects.toThrow('NEXT_REDIRECT')

    expect(migrateClass).toHaveBeenCalledWith(
      expect.objectContaining({
        newClass: expect.objectContaining({ room_number: null }),
      }),
    )
  })
})
