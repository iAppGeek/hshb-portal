import { isGcseOrALevel } from './classes'
import { formatDateTimeInSchoolTz } from './datetime'

/**
 * The version of the School's Privacy Notice the registration form's consents
 * are worded against. Stored with each submission; bump it when the notice
 * changes.
 */
export const PRIVACY_NOTICE_VERSION = '1.0'

/** Shown on an unticked required consent on the registration form. */
export const REQUIRED_CONSENT_MESSAGE =
  'Please tick this box to continue — it is required to register.'

/**
 * Whether a parent is asked if their child may leave on their own at the end
 * of the session: only for GCSE and A Level year groups.
 */
export function asksMayLeaveUnaccompanied(
  yearGroup: string | null | undefined,
): boolean {
  return yearGroup != null && isGcseOrALevel(yearGroup)
}

/** The consent fields a registration submission and a student both carry. */
export type ConsentRecord = {
  privacy_notice_read: boolean
  first_aid_consent: boolean
  email_sms_contact_ack: boolean
  photo_video_consent: boolean
  home_school_agreement: boolean
  may_leave_unaccompanied: boolean | null
  consents_recorded_at: string | null
  privacy_notice_version: string | null
}

export type ConsentItem = { label: string; value: string }

function yesNo(value: boolean): string {
  return value ? 'Yes' : 'No'
}

/**
 * The six consents, when they were recorded and against which Privacy Notice,
 * as label/value rows. Null means the record predates the question.
 */
export function consentItems(record: ConsentRecord): ConsentItem[] {
  return [
    {
      label: 'Read the Privacy Notice',
      value: yesNo(record.privacy_notice_read),
    },
    { label: 'Emergency first aid', value: yesNo(record.first_aid_consent) },
    {
      label: 'Email & SMS contact understood',
      value: yesNo(record.email_sms_contact_ack),
    },
    { label: 'Photos & video', value: yesNo(record.photo_video_consent) },
    {
      label: 'Home–school agreement',
      value: yesNo(record.home_school_agreement),
    },
    {
      label: 'May leave on their own',
      value:
        record.may_leave_unaccompanied === null
          ? 'Not recorded'
          : yesNo(record.may_leave_unaccompanied),
    },
    {
      label: 'Consents recorded',
      value: record.consents_recorded_at
        ? formatDateTimeInSchoolTz(record.consents_recorded_at)
        : 'Not recorded',
    },
    {
      label: 'Privacy Notice version',
      value: record.privacy_notice_version ?? 'Unknown',
    },
  ]
}
