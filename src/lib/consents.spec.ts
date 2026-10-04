import { describe, it, expect } from 'vitest'

import {
  asksMayLeaveUnaccompanied,
  consentItems,
  PRIVACY_NOTICE_VERSION,
  REQUIRED_CONSENT_MESSAGE,
  type ConsentRecord,
} from './consents'

describe('consent config', () => {
  it('records consents against Privacy Notice v1.0', () => {
    expect(PRIVACY_NOTICE_VERSION).toBe('1.0')
  })

  it('uses the approved wording for an unticked required box', () => {
    expect(REQUIRED_CONSENT_MESSAGE).toBe(
      'Please tick this box to continue — it is required to register.',
    )
  })
})

describe('consentItems', () => {
  const record: ConsentRecord = {
    privacy_notice_read: true,
    first_aid_consent: true,
    email_sms_contact_ack: true,
    photo_video_consent: false,
    home_school_agreement: true,
    may_leave_unaccompanied: true,
    consents_recorded_at: '2026-10-04T09:30:00Z',
    privacy_notice_version: '1.0',
  }

  it('lists all six consents, the time recorded and the notice version', () => {
    expect(consentItems(record)).toEqual([
      { label: 'Read the Privacy Notice', value: 'Yes' },
      { label: 'Emergency first aid', value: 'Yes' },
      { label: 'Email & SMS contact understood', value: 'Yes' },
      { label: 'Photos & video', value: 'No' },
      { label: 'Home–school agreement', value: 'Yes' },
      { label: 'May leave on their own', value: 'Yes' },
      // 09:30 UTC is 10:30 in London (BST).
      { label: 'Consents recorded', value: '04/10/2026, 10:30' },
      { label: 'Privacy Notice version', value: '1.0' },
    ])
  })

  it('marks values a record from before v1.0 does not have', () => {
    const items = consentItems({
      ...record,
      may_leave_unaccompanied: null,
      consents_recorded_at: null,
      privacy_notice_version: null,
    })

    expect(items.slice(5)).toEqual([
      { label: 'May leave on their own', value: 'Not recorded' },
      { label: 'Consents recorded', value: 'Not recorded' },
      { label: 'Privacy Notice version', value: 'Unknown' },
    ])
  })
})

describe('asksMayLeaveUnaccompanied', () => {
  it.each(['GCSE 1', 'GCSE 2', 'GCSE 3', 'GCSE', 'A Level'])(
    'asks for %s',
    (yearGroup) => {
      expect(asksMayLeaveUnaccompanied(yearGroup)).toBe(true)
    },
  )

  it.each(['Year 6', 'Reception', 'Not sure', '', null, undefined])(
    'does not ask for %s',
    (yearGroup) => {
      expect(asksMayLeaveUnaccompanied(yearGroup)).toBe(false)
    },
  )
})
