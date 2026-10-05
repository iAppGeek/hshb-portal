import { addYears } from './compliance'
import { formatDateTimeInSchoolTz, todayInSchoolTz } from './datetime'

/**
 * The version of the School's Privacy Notice the registration form's consents
 * are worded against. Stored with each submission; bump it when the notice
 * changes.
 */
export const PRIVACY_NOTICE_VERSION = '1.0'

/** Shown on an unticked required consent on the registration form. */
export const REQUIRED_CONSENT_MESSAGE =
  'Please tick this box to continue — it is required to register.'

/** The youngest a child can be for a parent to let them leave on their own. */
export const LEAVE_ALONE_MIN_AGE = 12

/** Shown beside the leave-alone box while the child is too young for it. */
export const LEAVE_ALONE_AGE_HINT = `Only for children aged ${LEAVE_ALONE_MIN_AGE} or over.`

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

/**
 * Whether a child born on `dateOfBirth` may be allowed to leave the School on
 * their own: aged {@link LEAVE_ALONE_MIN_AGE} or over on `today`. Both dates
 * are `YYYY-MM-DD`; a missing or malformed date of birth never qualifies.
 */
export function isOldEnoughToLeaveAlone(
  dateOfBirth: string | null | undefined,
  today: string = todayInSchoolTz(),
): boolean {
  if (!dateOfBirth || !ISO_DATE.test(dateOfBirth)) return false
  return addYears(dateOfBirth, LEAVE_ALONE_MIN_AGE) <= today
}

/** The consent fields a registration submission and a student both carry. */
export type ConsentRecord = {
  privacy_notice_read: boolean
  first_aid_consent: boolean
  email_sms_contact_ack: boolean
  photo_video_consent: boolean
  home_school_agreement: boolean
  may_leave_unaccompanied: boolean
  consents_recorded_at: string | null
  privacy_notice_version: string | null
}

export type ConsentItem = { label: string; value: string }

/** Only a consent the parent gave counts; anything else is "Not given". */
function given(value: boolean): string {
  return value ? 'Yes' : 'Not given'
}

/**
 * The six consents, when they were recorded and against which Privacy Notice,
 * as label/value rows. Null means the record predates versions being tracked.
 */
export function consentItems(record: ConsentRecord): ConsentItem[] {
  return [
    {
      label: 'Read the Privacy Notice',
      value: given(record.privacy_notice_read),
    },
    { label: 'Emergency first aid', value: given(record.first_aid_consent) },
    {
      label: 'Email & SMS contact understood',
      value: given(record.email_sms_contact_ack),
    },
    { label: 'Photos & video', value: given(record.photo_video_consent) },
    {
      label: 'Home–school agreement',
      value: given(record.home_school_agreement),
    },
    {
      label: 'May leave on their own',
      value: given(record.may_leave_unaccompanied),
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
