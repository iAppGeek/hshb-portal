import { describe, it, expect, vi, beforeEach } from 'vitest'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { auth } from '@/auth'
import {
  createFeePlan,
  getAllClassesIncludingInactive,
  getFeePlanById,
  getFeePlans,
  logAuditEvent,
  updateFeePlan,
} from '@/db'

import { createFeePlanAction, updateFeePlanAction } from './actions'

vi.mock('@/auth', () => ({ auth: vi.fn() }))
vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`)
  }),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/db', () => ({
  createFeePlan: vi.fn(),
  updateFeePlan: vi.fn(),
  getFeePlanById: vi.fn(),
  getFeePlans: vi.fn(),
  getAllClassesIncludingInactive: vi.fn(),
  logAuditEvent: vi.fn(),
}))

const CLASS_ID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'
const OTHER_CLASS_ID = 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a12'

function makeFormData(classIds: string[] = [CLASS_ID]): FormData {
  const fd = new FormData()
  fd.append('name', 'Standard')
  fd.append('academic_year', '2025/26')
  fd.append('full_year_amount', '800')
  fd.append('monthly_instalment_amount', '100')
  fd.append('termly_instalment_amount', '266.67')
  fd.append('notes', '')
  fd.append('active', 'on')
  for (const id of classIds) fd.append('class_ids', id)
  return fd
}

const expectedInput = {
  name: 'Standard',
  academic_year: '2025-26',
  full_year_amount: 800,
  monthly_instalment_amount: 100,
  termly_instalment_amount: 266.67,
  notes: null,
  active: true,
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(auth).mockResolvedValue({
    user: { role: 'admin', staffId: 'admin-1' },
  } as never)
  vi.mocked(getAllClassesIncludingInactive).mockResolvedValue([
    { id: CLASS_ID, name: 'Alpha', year_group: '1', academic_year: '2025-26' },
    {
      id: OTHER_CLASS_ID,
      name: 'Beta',
      year_group: '2',
      academic_year: '2024-25',
    },
  ] as never)
  vi.mocked(getFeePlans).mockResolvedValue([])
  vi.mocked(getFeePlanById).mockResolvedValue({ id: 'p1' } as never)
  vi.mocked(createFeePlan).mockResolvedValue({ id: 'p1' })
})

describe.each([
  ['createFeePlanAction', () => createFeePlanAction(makeFormData())],
  ['updateFeePlanAction', () => updateFeePlanAction('p1', makeFormData())],
])('%s access and validation', (_name, run) => {
  it('rejects unauthenticated users', async () => {
    vi.mocked(auth).mockResolvedValue(null as never)
    expect(await run()).toEqual({ error: 'Not authenticated' })
  })

  it('rejects non-admins', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { role: 'headteacher' },
    } as never)
    expect(await run()).toEqual({ error: 'Not authorised' })
  })

  it('returns a friendly error when saving fails', async () => {
    vi.mocked(getFeePlans).mockRejectedValue(new Error('down'))
    expect(await run()).toEqual({ error: expect.stringContaining('Failed to') })
    expect(redirect).not.toHaveBeenCalled()
  })
})

describe('createFeePlanAction', () => {
  it('returns schema errors', async () => {
    const fd = makeFormData()
    fd.set('academic_year', '2025')
    expect(await createFeePlanAction(fd)).toEqual({
      error: 'Academic year must look like 2025-26',
    })
  })

  it('rejects a class from another academic year', async () => {
    expect(await createFeePlanAction(makeFormData([OTHER_CLASS_ID]))).toEqual({
      error: 'Beta is not a 2025-26 class.',
    })
    expect(createFeePlan).not.toHaveBeenCalled()
  })

  it('creates the plan with its classes, logs it and redirects', async () => {
    await expect(createFeePlanAction(makeFormData())).rejects.toThrow(
      'NEXT_REDIRECT:/finance?tab=fee-plans',
    )

    expect(createFeePlan).toHaveBeenCalledWith(expectedInput, [CLASS_ID])
    expect(logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        staffId: 'admin-1',
        action: 'create',
        entity: 'fee_plan',
        entityId: 'p1',
      }),
    )
    expect(revalidatePath).toHaveBeenCalledWith('/finance')
  })
})

describe('updateFeePlanAction', () => {
  it('returns an error when the plan does not exist', async () => {
    vi.mocked(getFeePlanById).mockResolvedValue(null)
    expect(await updateFeePlanAction('p1', makeFormData())).toEqual({
      error: 'Fee plan not found.',
    })
    expect(updateFeePlan).not.toHaveBeenCalled()
  })

  it('rejects a class owned by another plan', async () => {
    vi.mocked(getFeePlans).mockResolvedValue([
      {
        id: 'p2',
        name: 'Sibling',
        academic_year: '2025-26',
        class_ids: [CLASS_ID],
      },
    ] as never)
    expect(await updateFeePlanAction('p1', makeFormData())).toEqual({
      error: 'Alpha is already on the Sibling (2025-26) fee plan.',
    })
  })

  it('updates the plan, logs it and redirects', async () => {
    await expect(updateFeePlanAction('p1', makeFormData([]))).rejects.toThrow(
      'NEXT_REDIRECT:/finance?tab=fee-plans',
    )

    expect(updateFeePlan).toHaveBeenCalledWith('p1', expectedInput, [])
    expect(logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'update', entityId: 'p1' }),
    )
  })
})
