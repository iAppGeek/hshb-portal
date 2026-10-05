'use client'

import { useEffect, useRef, useState } from 'react'

import TurnstileWidget from '@/clientComponents/TurnstileWidget'
import {
  isOldEnoughToLeaveAlone,
  LEAVE_ALONE_AGE_HINT,
  REQUIRED_CONSENT_MESSAGE,
} from '@/lib/consents'
import { YEAR_GROUP_NOT_SURE } from '@/lib/registration'
import {
  HOME_SCHOOL_AGREEMENT_URL,
  POLICIES_URL,
  PRIVACY_NOTICE_URL,
} from '@/lib/schoolWebsite'
import {
  SHORT_TEXT_MAX,
  ADDRESS_TEXT_MAX,
  LONG_TEXT_MAX,
  PHONE_MAX,
  EMAIL_MAX,
} from '@/lib/schemas'
import {
  CheckboxField,
  FormGrid,
  FormSection,
  TextAreaField,
  TextField,
  useServerForm,
} from '@/components/form'

import { submitRegistrationAction } from './actions'

type Props = {
  yearGroups: string[]
  turnstileSiteKey: string | null
}

export default function RegistrationForm({
  yearGroups,
  turnstileSiteKey,
}: Props) {
  const [showSecondary, setShowSecondary] = useState(false)
  const [showContact1, setShowContact1] = useState(false)
  const [showContact2, setShowContact2] = useState(false)
  // Controlled so the leave-alone box can follow the child's age.
  const [dateOfBirth, setDateOfBirth] = useState('')
  const oldEnoughToLeaveAlone = isOldEnoughToLeaveAlone(dateOfBirth)
  const [leaveAlone, setLeaveAlone] = useState(false)

  function handleDateOfBirth(value: string): void {
    setDateOfBirth(value)
    // A box disabled for a younger child comes back unticked, so the parent
    // decides afresh.
    if (!isOldEnoughToLeaveAlone(value)) setLeaveAlone(false)
  }
  const [token, setToken] = useState<string | null>(null)
  const [captchaError, setCaptchaError] = useState(false)
  const { handleSubmit, isPending, error, fieldError } = useServerForm(
    submitRegistrationAction,
  )

  function handleToken(newToken: string | null) {
    setToken(newToken)
    if (newToken) setCaptchaError(false)
  }

  const disabledReason = isPending
    ? 'Submitting your registration…'
    : captchaError
      ? 'The security check failed to load. Please refresh the page and try again.'
      : !token
        ? 'Please complete the security check above before submitting.'
        : null

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <input type="hidden" name="has_secondary" value={String(showSecondary)} />
      <input type="hidden" name="has_contact1" value={String(showContact1)} />
      <input type="hidden" name="has_contact2" value={String(showContact2)} />

      {/* ── Child's details ─────────────────────────────────────────── */}
      <FormSection title="Child's details">
        <FormGrid>
          <TextField
            label="First name"
            name="child_first_name"
            required
            maxLength={SHORT_TEXT_MAX}
            autoComplete="off"
            error={fieldError('child_first_name')}
          />
          <TextField
            label="Last name"
            name="child_last_name"
            required
            maxLength={SHORT_TEXT_MAX}
            autoComplete="off"
            error={fieldError('child_last_name')}
          />
          <TextField
            label="Date of birth"
            name="date_of_birth"
            type="date"
            required
            autoComplete="off"
            value={dateOfBirth}
            onChange={handleDateOfBirth}
            error={fieldError('date_of_birth')}
          />
          <TextField
            label="English (mainstream) school"
            name="english_school_name"
            required
            maxLength={SHORT_TEXT_MAX}
            hint="The school your child attends during the week"
            autoComplete="off"
            error={fieldError('english_school_name')}
          />
          <div>
            <label
              htmlFor="preferred_year_group"
              className="block text-sm font-medium text-gray-700"
            >
              Year group / class preference
            </label>
            <select
              id="preferred_year_group"
              name="preferred_year_group"
              autoComplete="off"
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
            >
              {yearGroups.map((yg) => (
                <option key={yg} value={yg}>
                  {yg}
                </option>
              ))}
              <option value={YEAR_GROUP_NOT_SURE}>{YEAR_GROUP_NOT_SURE}</option>
            </select>
          </div>
        </FormGrid>
      </FormSection>

      {/* ── Home address ────────────────────────────────────────────── */}
      <FormSection title="Home address">
        <FormGrid>
          <TextField
            label="Address line 1"
            name="address_line_1"
            required
            maxLength={ADDRESS_TEXT_MAX}
            autoComplete="address-line1"
            error={fieldError('address_line_1')}
          />
          <TextField
            label="Address line 2"
            name="address_line_2"
            maxLength={ADDRESS_TEXT_MAX}
            autoComplete="address-line2"
            error={fieldError('address_line_2')}
          />
          <TextField
            label="City"
            name="city"
            required
            maxLength={ADDRESS_TEXT_MAX}
            autoComplete="address-level2"
            error={fieldError('city')}
          />
          <TextField
            label="Postcode"
            name="postcode"
            required
            autoComplete="postal-code"
            maxLength={ADDRESS_TEXT_MAX}
            error={fieldError('postcode')}
          />
        </FormGrid>
      </FormSection>

      {/* ── Medical & dietary ───────────────────────────────────────── */}
      <FormSection title="Medical & dietary">
        <FormGrid>
          <TextAreaField
            label="Allergies"
            name="allergies"
            maxLength={LONG_TEXT_MAX}
            error={fieldError('allergies')}
          />
          <TextAreaField
            label="Medical details"
            name="medical_details"
            maxLength={LONG_TEXT_MAX}
            error={fieldError('medical_details')}
          />
          <TextAreaField
            label="Any special educational needs or disability we should know about, so we can make reasonable adjustments"
            name="sen_details"
            maxLength={LONG_TEXT_MAX}
            error={fieldError('sen_details')}
          />
        </FormGrid>
        <p className="mt-4 text-sm text-gray-600">
          By giving this information, you consent to the School holding it and
          sharing it with the staff and volunteers who need it to keep your
          child safe. See the{' '}
          <ExternalLink href={PRIVACY_NOTICE_URL}>Privacy Notice</ExternalLink>,
          Section 4.
        </p>
      </FormSection>

      {/* ── Parent/carer 1 ──────────────────────────────────────────── */}
      <FormSection title="Parent/carer 1 (required)">
        <ContactFields
          prefix="primary"
          requireEmail={false}
          requireOccupation
          defaultSameAddress
          fieldError={fieldError}
        />
      </FormSection>

      {/* ── Parent/carer 2 ──────────────────────────────────────────── */}
      {showSecondary ? (
        <ScrollSection
          title="Parent/carer 2"
          onRemove={() => setShowSecondary(false)}
        >
          <ContactFields
            prefix="secondary"
            requireOccupation
            defaultSameAddress
            fieldError={fieldError}
          />
        </ScrollSection>
      ) : (
        <button
          type="button"
          onClick={() => setShowSecondary(true)}
          className="text-sm font-medium text-blue-600 hover:text-blue-800"
        >
          + Add a second parent/carer
        </button>
      )}

      {/* ── Emergency contacts ──────────────────────────────────────── */}
      {showContact1 ? (
        <ScrollSection
          title="Emergency contact 1"
          onRemove={() => {
            setShowContact1(false)
            setShowContact2(false)
          }}
        >
          <ContactFields
            prefix="contact1"
            defaultSameAddress
            fieldError={fieldError}
          />
        </ScrollSection>
      ) : (
        <button
          type="button"
          onClick={() => setShowContact1(true)}
          className="text-sm font-medium text-blue-600 hover:text-blue-800"
        >
          + Add an emergency contact
        </button>
      )}

      {showContact1 &&
        (showContact2 ? (
          <ScrollSection
            title="Emergency contact 2"
            onRemove={() => setShowContact2(false)}
          >
            <ContactFields
              prefix="contact2"
              defaultSameAddress
              fieldError={fieldError}
            />
          </ScrollSection>
        ) : (
          <button
            type="button"
            onClick={() => setShowContact2(true)}
            className="text-sm font-medium text-blue-600 hover:text-blue-800"
          >
            + Add a second emergency contact
          </button>
        ))}

      <FormSection title="Collection arrangements">
        {showContact1 && (
          <FormGrid>
            <TextAreaField
              label="Who is authorised to collect the child?"
              name="collect_authorised"
              maxLength={LONG_TEXT_MAX}
              error={fieldError('collect_authorised')}
            />
            <TextField
              label="Collection password"
              name="collect_password"
              maxLength={LONG_TEXT_MAX}
              error={fieldError('collect_password')}
            />
          </FormGrid>
        )}
        <div className={showContact1 ? 'mt-4' : undefined}>
          <CheckboxField
            name="may_leave_unaccompanied"
            label="My child may leave the School on their own at the end of the session."
            disabled={!oldEnoughToLeaveAlone}
            checked={leaveAlone}
            onChange={setLeaveAlone}
            description={
              oldEnoughToLeaveAlone ? undefined : LEAVE_ALONE_AGE_HINT
            }
            error={fieldError('may_leave_unaccompanied')}
          />
        </div>
      </FormSection>

      {/* ── Consents ─────────────────────────────────────────────────── */}
      <FormSection title="Consents">
        <div className="space-y-3">
          <CheckboxField
            name="privacy_notice_read"
            label={
              <>
                I confirm I have read the School&apos;s{' '}
                <ExternalLink href={PRIVACY_NOTICE_URL}>
                  Privacy Notice
                </ExternalLink>
                .
              </>
            }
            required
            requiredMessage={REQUIRED_CONSENT_MESSAGE}
            error={fieldError('privacy_notice_read')}
          />
          <CheckboxField
            name="first_aid_consent"
            label="I consent to emergency first aid being given to my child if needed."
            required
            requiredMessage={REQUIRED_CONSENT_MESSAGE}
            error={fieldError('first_aid_consent')}
          />
          <CheckboxField
            name="email_sms_contact_ack"
            label="I understand the School will contact me by email and SMS about lessons, closures, collection arrangements and emergencies."
            required
            requiredMessage={REQUIRED_CONSENT_MESSAGE}
            error={fieldError('email_sms_contact_ack')}
          />
          <CheckboxField
            name="photo_video_consent"
            label={
              <>
                I consent to photos and video of my child being used on
                ClassDojo, the School website, the School&apos;s social media,
                printed material and in local or community press, as described
                in the{' '}
                <ExternalLink href={PRIVACY_NOTICE_URL}>
                  Privacy Notice
                </ExternalLink>{' '}
                (Section 5). I can withdraw this at any time by contacting the
                School office.
              </>
            }
            error={fieldError('photo_video_consent')}
          />
          <CheckboxField
            name="home_school_agreement"
            label={
              <>
                I agree to the{' '}
                <ExternalLink href={HOME_SCHOOL_AGREEMENT_URL}>
                  home–school agreement
                </ExternalLink>
                .
              </>
            }
            error={fieldError('home_school_agreement')}
          />
        </div>
        <p className="mt-3 text-sm text-gray-500">
          <span className="text-red-500">*</span> Required to register
        </p>
      </FormSection>

      {/* ── Declaration ──────────────────────────────────────────────── */}
      <FormSection title="Declaration">
        <TextField
          label="Your full name"
          name="declaration_name"
          required
          hint="Typing your name here acts as your signature"
          autoComplete="section-declaration name"
          maxLength={SHORT_TEXT_MAX}
          error={fieldError('declaration_name')}
        />
        {turnstileSiteKey && (
          <div className="mt-4">
            <TurnstileWidget
              siteKey={turnstileSiteKey}
              onToken={handleToken}
              onError={() => setCaptchaError(true)}
            />
            <input type="hidden" name="turnstile_token" value={token ?? ''} />
          </div>
        )}
      </FormSection>

      <p className="text-sm text-gray-600">
        By submitting this form, you agree to follow the{' '}
        <ExternalLink href={POLICIES_URL}>School Policies</ExternalLink>,
        including our arrangements for drop-off, collection, behaviour and
        safeguarding.
      </p>

      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-4">
          <span title={disabledReason ?? undefined}>
            <button
              type="submit"
              disabled={isPending || !token}
              aria-describedby={
                disabledReason ? 'submit-disabled-reason' : undefined
              }
              className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700 disabled:pointer-events-none disabled:opacity-50"
            >
              {isPending ? 'Submitting…' : 'Submit registration'}
            </button>
          </span>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
        {disabledReason && (
          <p id="submit-disabled-reason" className="text-sm text-gray-500">
            {disabledReason}
          </p>
        )}
      </div>
    </form>
  )
}

function ContactFields({
  prefix,
  requireEmail = false,
  requireOccupation = false,
  defaultSameAddress = false,
  fieldError,
}: {
  prefix: string
  requireEmail?: boolean
  requireOccupation?: boolean
  defaultSameAddress?: boolean
  fieldError: (name: string) => string | undefined
}) {
  const [sameAddress, setSameAddress] = useState(defaultSameAddress)
  // Scope autofill per contact so the browser offers each person separately
  // rather than filling the same profile into all four blocks.
  const section = `section-${prefix}`

  return (
    <>
      <FormGrid>
        <TextField
          label="First name"
          name={`${prefix}_first_name`}
          required
          maxLength={SHORT_TEXT_MAX}
          autoComplete={`${section} given-name`}
          error={fieldError(`${prefix}_first_name`)}
        />
        <TextField
          label="Last name"
          name={`${prefix}_last_name`}
          required
          maxLength={SHORT_TEXT_MAX}
          autoComplete={`${section} family-name`}
          error={fieldError(`${prefix}_last_name`)}
        />
        <TextField
          label="Relationship to child"
          name={`${prefix}_relationship`}
          maxLength={SHORT_TEXT_MAX}
          autoComplete="off"
          error={fieldError(`${prefix}_relationship`)}
        />
        <TextField
          label="Occupation"
          name={`${prefix}_occupation`}
          required={requireOccupation}
          maxLength={SHORT_TEXT_MAX}
          autoComplete="off"
          error={fieldError(`${prefix}_occupation`)}
        />
        <TextField
          label="Phone"
          name={`${prefix}_phone`}
          type="tel"
          required
          maxLength={PHONE_MAX}
          autoComplete={`${section} tel`}
          error={fieldError(`${prefix}_phone`)}
        />
        <TextField
          label="Email"
          name={`${prefix}_email`}
          type="email"
          required={requireEmail}
          maxLength={EMAIL_MAX}
          autoComplete={`${section} email`}
          error={fieldError(`${prefix}_email`)}
        />
      </FormGrid>
      <label className="mt-4 flex cursor-pointer items-center gap-2 text-sm text-gray-700">
        <input
          type="checkbox"
          name={`${prefix}_same_as_child_address`}
          checked={sameAddress}
          onChange={(e) => setSameAddress(e.target.checked)}
          className="rounded text-blue-600 focus:ring-blue-500"
        />
        Same address as the child
      </label>
      {!sameAddress && (
        <div className="mt-4">
          <FormGrid>
            <TextField
              label="Address line 1"
              name={`${prefix}_address_line_1`}
              maxLength={ADDRESS_TEXT_MAX}
              autoComplete={`${section} address-line1`}
              error={fieldError(`${prefix}_address_line_1`)}
            />
            <TextField
              label="Address line 2"
              name={`${prefix}_address_line_2`}
              maxLength={ADDRESS_TEXT_MAX}
              autoComplete={`${section} address-line2`}
              error={fieldError(`${prefix}_address_line_2`)}
            />
            <TextField
              label="City"
              name={`${prefix}_city`}
              maxLength={ADDRESS_TEXT_MAX}
              autoComplete={`${section} address-level2`}
              error={fieldError(`${prefix}_city`)}
            />
            <TextField
              label="Postcode"
              name={`${prefix}_postcode`}
              maxLength={ADDRESS_TEXT_MAX}
              autoComplete={`${section} postal-code`}
              error={fieldError(`${prefix}_postcode`)}
            />
          </FormGrid>
        </div>
      )}
    </>
  )
}

/**
 * Wraps the kit's `FormSection` to preserve the smooth scroll-into-view a
 * newly revealed optional block gets on this public form; the kit's
 * `FormSection` has no such option.
 */
function ScrollSection({
  title,
  children,
  onRemove,
}: {
  title: string
  children: React.ReactNode
  onRemove?: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // Runs once on mount: this component only mounts when its parent starts
    // showing it.
    ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  return (
    <div ref={ref}>
      <FormSection title={title} onRemove={onRemove}>
        {children}
      </FormSection>
    </div>
  )
}

/** A link inside a form label that opens the school website in a new tab. */
function ExternalLink({
  href,
  children,
}: {
  href: string
  children: React.ReactNode
}): React.ReactElement {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-blue-600 underline hover:text-blue-800 focus-visible:outline-2 focus-visible:outline-blue-500"
    >
      {children} <span className="sr-only">(opens in a new tab)</span>
    </a>
  )
}
