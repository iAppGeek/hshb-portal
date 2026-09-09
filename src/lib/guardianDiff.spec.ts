import { describe, it, expect } from 'vitest'

import type { GuardianMatch } from '@/db'
import type { Tables } from '@/types/database'

import { guardianReuseDiff } from './guardianDiff'

type Contact = Tables<'registration_submission_contacts'>

const baseMatch: GuardianMatch = {
  id: 'guardian-1',
  first_name: 'Petra',
  last_name: 'Existing',
  phone: '07700 900333',
  email: 'petra@example.com',
  address_line_1: 'Old Address',
  address_line_2: null,
  city: 'Oldtown',
  postcode: 'OL1 1AA',
  matched_on: 'email',
}

const baseContact: Contact = {
  id: 'contact-1',
  submission_id: 'sub-1',
  contact_role: 'primary',
  first_name: 'Petra',
  last_name: 'New',
  relationship: 'Mother',
  phone: '07700 900333',
  email: 'petra@example.com',
  same_as_child_address: false,
  address_line_1: 'Old Address',
  address_line_2: null,
  city: 'Oldtown',
  postcode: 'OL1 1AA',
  created_at: '2026-09-01T10:00:00Z',
}

const baseSubmission = {
  address_line_1: '1 Fixture St',
  address_line_2: null,
  city: 'Fixtureville',
  postcode: 'FX1 1AA',
}

describe('guardianReuseDiff', () => {
  it('returns no changes when values match', () => {
    expect(guardianReuseDiff(baseMatch, baseContact, baseSubmission)).toEqual(
      [],
    )
  })

  it('reports a phone change only', () => {
    const contact: Contact = { ...baseContact, phone: '07700 900000' }
    expect(guardianReuseDiff(baseMatch, contact, baseSubmission)).toEqual([
      { field: 'phone', old: '07700 900333', new: '07700 900000' },
    ])
  })

  it('takes the address from the submission when same_as_child_address is true', () => {
    const contact: Contact = { ...baseContact, same_as_child_address: true }
    const diff = guardianReuseDiff(baseMatch, contact, baseSubmission)
    expect(diff).toContainEqual({
      field: 'address_line_1',
      old: 'Old Address',
      new: '1 Fixture St',
    })
    expect(diff).toContainEqual({
      field: 'city',
      old: 'Oldtown',
      new: 'Fixtureville',
    })
  })

  it('takes the address from the contact when same_as_child_address is false and the contact supplied it', () => {
    const contact: Contact = {
      ...baseContact,
      same_as_child_address: false,
      address_line_1: 'New Contact Address',
      city: 'Newtown',
    }
    const diff = guardianReuseDiff(baseMatch, contact, baseSubmission)
    expect(diff).toContainEqual({
      field: 'address_line_1',
      old: 'Old Address',
      new: 'New Contact Address',
    })
    expect(diff).toContainEqual({
      field: 'city',
      old: 'Oldtown',
      new: 'Newtown',
    })
  })

  it('keeps the existing guardian address when the contact left it blank', () => {
    const contact: Contact = {
      ...baseContact,
      same_as_child_address: false,
      address_line_1: null,
      city: null,
      postcode: null,
    }
    expect(guardianReuseDiff(baseMatch, contact, baseSubmission)).toEqual([])
  })

  it('keeps the existing email when the contact has none', () => {
    const contact: Contact = { ...baseContact, email: null }
    expect(guardianReuseDiff(baseMatch, contact, baseSubmission)).toEqual([])
  })
})
