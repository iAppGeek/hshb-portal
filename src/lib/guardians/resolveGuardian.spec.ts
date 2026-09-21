import { describe, it, expect, vi, beforeEach } from 'vitest'

import { createGuardian } from '@/db'
import { ActionError } from '@/lib/action'
import { guardianSchema, guardianSchemaWithOccupation } from '@/lib/schemas'

import { resolveGuardian, resolveGuardianSlot } from './resolveGuardian'

vi.mock('@/auth/require', () => ({ getActor: vi.fn() }))
vi.mock('@/db', () => ({
  createGuardian: vi.fn(),
  logAuditEvent: vi.fn(),
}))

const EXISTING_ID = '00000000-0000-4000-8000-000000000001'
const NEW_ID = '00000000-0000-4000-8000-000000000002'

function makeFormData(fields: Record<string, string>): FormData {
  const fd = new FormData()
  for (const [key, value] of Object.entries(fields)) fd.set(key, value)
  return fd
}

const newGuardianFields = {
  contact1_mode: 'new',
  contact1_first_name: 'Maria',
  contact1_last_name: 'Smith',
  contact1_phone: '07700 900000',
  contact1_email: '',
  contact1_relationship: 'Aunt',
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(createGuardian).mockResolvedValue({ id: NEW_ID } as any)
})

describe('resolveGuardian', () => {
  it('returns an existing guardian without creating one', async () => {
    await expect(
      resolveGuardian({ mode: 'existing', existing_id: EXISTING_ID }),
    ).resolves.toBe(EXISTING_ID)
    expect(createGuardian).not.toHaveBeenCalled()
  })

  it('creates a new guardian, passing empty optionals as undefined', async () => {
    await expect(
      resolveGuardian({
        mode: 'new',
        first_name: 'Maria',
        last_name: 'Smith',
        phone: '07700 900000',
        email: null,
        occupation: 'Teacher',
        address_line_1: '1 Main Street',
        address_line_2: null,
        city: 'London',
        postcode: 'EC1A 1BB',
      }),
    ).resolves.toBe(NEW_ID)

    expect(createGuardian).toHaveBeenCalledWith({
      first_name: 'Maria',
      last_name: 'Smith',
      phone: '07700 900000',
      email: undefined,
      occupation: 'Teacher',
      address_line_1: '1 Main Street',
      address_line_2: undefined,
      city: 'London',
      postcode: 'EC1A 1BB',
    })
  })
})

describe('resolveGuardianSlot', () => {
  it('reads the prefixed block and resolves an existing guardian', async () => {
    const fd = makeFormData({
      primary_mode: 'existing',
      primary_existing_id: EXISTING_ID,
    })

    await expect(
      resolveGuardianSlot(fd, 'primary', guardianSchemaWithOccupation),
    ).resolves.toBe(EXISTING_ID)
  })

  it('creates a new contact from the prefixed fields', async () => {
    await expect(
      resolveGuardianSlot(
        makeFormData(newGuardianFields),
        'contact1',
        guardianSchema,
      ),
    ).resolves.toBe(NEW_ID)
    expect(createGuardian).toHaveBeenCalledWith(
      expect.objectContaining({ first_name: 'Maria', phone: '07700 900000' }),
    )
  })

  it('throws prefixed field errors for an invalid block', async () => {
    const fd = makeFormData({ ...newGuardianFields, contact1_phone: 'nope' })

    const err = await resolveGuardianSlot(fd, 'contact1', guardianSchema).catch(
      (e: unknown) => e,
    )

    expect(err).toBeInstanceOf(ActionError)
    expect((err as ActionError).fieldErrors).toHaveProperty('contact1_phone')
    expect(createGuardian).not.toHaveBeenCalled()
  })

  it('requires an occupation only with the parent/carer schema', async () => {
    const fd = makeFormData(newGuardianFields)

    await expect(
      resolveGuardianSlot(fd, 'contact1', guardianSchemaWithOccupation),
    ).rejects.toMatchObject({
      fieldErrors: { contact1_occupation: expect.any(String) },
    })
  })
})
