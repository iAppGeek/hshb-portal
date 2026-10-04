import { describe, it, expect, vi } from 'vitest'

import {
  consentItems,
  isOldEnoughToLeaveAlone,
  LEAVE_ALONE_AGE_HINT,
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
      { label: 'Photos & video', value: 'Not given' },
      { label: 'Home–school agreement', value: 'Yes' },
      { label: 'May leave on their own', value: 'Yes' },
      // 09:30 UTC is 10:30 in London (BST).
      { label: 'Consents recorded', value: '04/10/2026, 10:30' },
      { label: 'Privacy Notice version', value: '1.0' },
    ])
  })

  it('shows anything the parent did not give as "Not given", never "No"', () => {
    const items = consentItems({
      ...record,
      privacy_notice_read: false,
      may_leave_unaccompanied: false,
    })

    expect(items[0]).toEqual({
      label: 'Read the Privacy Notice',
      value: 'Not given',
    })
    expect(items[5]).toEqual({
      label: 'May leave on their own',
      value: 'Not given',
    })
  })

  it('marks values a record from before v1.0 does not have', () => {
    const items = consentItems({
      ...record,
      consents_recorded_at: null,
      privacy_notice_version: null,
    })

    expect(items.slice(6)).toEqual([
      { label: 'Consents recorded', value: 'Not recorded' },
      { label: 'Privacy Notice version', value: 'Unknown' },
    ])
  })
})

describe('isOldEnoughToLeaveAlone', () => {
  const today = '2026-10-04'

  it.each([
    ['turns 12 today', '2014-10-04'],
    ['turned 12 yesterday', '2014-10-03'],
    ['is 17', '2009-01-15'],
  ])('allows a child who %s', (_case, dob) => {
    expect(isOldEnoughToLeaveAlone(dob, today)).toBe(true)
  })

  it.each([
    ['turns 12 tomorrow', '2014-10-05'],
    ['turns 12 next month', '2014-11-01'],
    ['is 5', '2021-03-01'],
  ])('does not allow a child who %s', (_case, dob) => {
    expect(isOldEnoughToLeaveAlone(dob, today)).toBe(false)
  })

  it('counts a 29 February birthday on the day', () => {
    expect(isOldEnoughToLeaveAlone('2012-02-29', '2024-02-28')).toBe(false)
    expect(isOldEnoughToLeaveAlone('2012-02-29', '2024-02-29')).toBe(true)
  })

  it.each(['', null, undefined, 'not a date', '04/10/2014'])(
    'does not allow a missing or malformed date of birth (%j)',
    (dob) => {
      expect(isOldEnoughToLeaveAlone(dob, today)).toBe(false)
    },
  )

  it('defaults to today in the school time zone', () => {
    vi.useFakeTimers()
    // 23:30 UTC on 3 Oct is already 4 Oct in London (BST).
    vi.setSystemTime(new Date('2026-10-03T23:30:00Z'))
    try {
      expect(isOldEnoughToLeaveAlone('2014-10-04')).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })

  it('names the minimum age in the hint', () => {
    expect(LEAVE_ALONE_AGE_HINT).toBe('Only for children aged 12 or over.')
  })
})
