import { describe, it, expect, vi } from 'vitest'

import { ActionError } from '@/lib/action'

import { parseCollectionAdults } from './parseCollectionAdults'

vi.mock('@/auth/require', () => ({ getActor: vi.fn() }))
vi.mock('@/db', () => ({ logAuditEvent: vi.fn() }))

function makeFormData(fields: Record<string, string>): FormData {
  const fd = new FormData()
  for (const [key, value] of Object.entries(fields)) fd.set(key, value)
  return fd
}

function catchActionError(fn: () => unknown): ActionError {
  try {
    fn()
  } catch (e: unknown) {
    if (e instanceof ActionError) return e
    throw e
  }
  throw new Error('expected an ActionError')
}

describe('parseCollectionAdults', () => {
  it('returns no adults for a form without the list', () => {
    expect(parseCollectionAdults(new FormData())).toEqual([])
  })

  it('trims each adult and turns blank optional fields into null', () => {
    const adults = parseCollectionAdults(
      makeFormData({
        collection_adult_0_name: '  Eleni Georgiou ',
        collection_adult_0_relationship: ' ',
        collection_adult_0_phone: ' 07700 900003 ',
      }),
    )

    expect(adults).toEqual([
      { name: 'Eleni Georgiou', relationship: null, phone: '07700 900003' },
    ])
  })

  it('keeps the order shown and drops rows left blank', () => {
    const adults = parseCollectionAdults(
      makeFormData({
        collection_adult_2_name: 'Second',
        collection_adult_1_name: '',
        collection_adult_1_relationship: '',
        collection_adult_1_phone: '',
        collection_adult_0_name: 'First',
      }),
    )

    expect(adults.map((adult) => adult.name)).toEqual(['First', 'Second'])
  })

  it('reports every row’s mistakes under the names the form renders', () => {
    const error = catchActionError(() =>
      parseCollectionAdults(
        makeFormData({
          collection_adult_0_name: '',
          collection_adult_0_relationship: 'Aunt',
          collection_adult_1_name: 'Kostas',
          collection_adult_1_phone: 'call me',
        }),
      ),
    )

    expect(error.message).toBe('Required')
    expect(error.fieldErrors).toEqual({
      collection_adult_0_name: 'Required',
      collection_adult_1_phone: 'Invalid phone number',
    })
  })

  it('refuses a phone number that is too long', () => {
    const error = catchActionError(() =>
      parseCollectionAdults(
        makeFormData({
          collection_adult_0_name: 'Eleni',
          collection_adult_0_phone: '0'.repeat(21),
        }),
      ),
    )

    expect(error.fieldErrors).toEqual({
      collection_adult_0_phone: 'Must be 20 characters or fewer',
    })
  })
})
