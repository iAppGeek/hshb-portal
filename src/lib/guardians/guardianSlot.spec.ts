import { describe, it, expect, vi } from 'vitest'

import { ActionError } from '@/lib/action'
import { guardianSchema, guardianSchemaWithOccupation } from '@/lib/schemas'

import { parseGuardianSlot, toGuardianSlot } from './guardianSlot'

vi.mock('@/auth/require', () => ({ getActor: vi.fn() }))
vi.mock('@/db', () => ({ logAuditEvent: vi.fn() }))

const EXISTING_ID = '00000000-0000-4000-8000-000000000001'

function catchActionError(fn: () => unknown): ActionError {
  try {
    fn()
  } catch (e: unknown) {
    return e as ActionError
  }
  throw new Error('expected an ActionError')
}

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

describe('toGuardianSlot', () => {
  it('links an existing guardian by id', () => {
    expect(
      toGuardianSlot({ mode: 'existing', existing_id: EXISTING_ID }),
    ).toEqual({ id: EXISTING_ID })
  })

  it('describes a new guardian, passing empty optionals as undefined', () => {
    expect(
      toGuardianSlot({
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
    ).toEqual({
      create: {
        first_name: 'Maria',
        last_name: 'Smith',
        phone: '07700 900000',
        email: undefined,
        occupation: 'Teacher',
        address_line_1: '1 Main Street',
        address_line_2: undefined,
        city: 'London',
        postcode: 'EC1A 1BB',
      },
    })
  })
})

describe('parseGuardianSlot', () => {
  it('reads the prefixed block', () => {
    expect(
      parseGuardianSlot(
        makeFormData(newGuardianFields),
        'contact1',
        guardianSchema,
      ),
    ).toMatchObject({ mode: 'new', first_name: 'Maria', last_name: 'Smith' })
  })

  it('reads an existing guardian reference from the prefixed block', () => {
    const fd = makeFormData({
      primary_mode: 'existing',
      primary_existing_id: EXISTING_ID,
    })

    expect(
      parseGuardianSlot(fd, 'primary', guardianSchemaWithOccupation),
    ).toEqual({ mode: 'existing', existing_id: EXISTING_ID })
  })

  it('throws prefixed field errors for an invalid block', () => {
    const fd = makeFormData({ ...newGuardianFields, contact1_phone: 'nope' })

    const err = catchActionError(() =>
      parseGuardianSlot(fd, 'contact1', guardianSchema),
    )

    expect(err).toBeInstanceOf(ActionError)
    expect(err.fieldErrors).toHaveProperty('contact1_phone')
  })

  it('requires an occupation only with the parent/carer schema', () => {
    const fd = makeFormData(newGuardianFields)

    const err = catchActionError(() =>
      parseGuardianSlot(fd, 'contact1', guardianSchemaWithOccupation),
    )

    expect(err.fieldErrors).toMatchObject({
      contact1_occupation: expect.any(String),
    })
  })
})
