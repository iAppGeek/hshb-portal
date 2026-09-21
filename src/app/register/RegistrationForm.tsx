'use client'

import { useEffect, useRef, useState } from 'react'

import TurnstileWidget from '@/clientComponents/TurnstileWidget'
import { PRIVACY_NOTICE_URL, YEAR_GROUP_NOT_SURE } from '@/lib/registration'
import {
  SHORT_TEXT_MAX,
  ADDRESS_TEXT_MAX,
  LONG_TEXT_MAX,
  PHONE_MAX,
  EMAIL_MAX,
} from '@/lib/schemas'
import {
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
        </FormGrid>
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

      {showContact1 && (
        <FormSection title="Collection arrangements">
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
        </FormSection>
      )}

      {/* ── Consents ─────────────────────────────────────────────────── */}
      <FormSection title="Consents">
        <div className="space-y-3">
          <ConsentCheckbox
            name="consent_privacy_notice"
            required
            error={fieldError('consent_privacy_notice')}
          >
            I have read and accept the school&apos;s{' '}
            <a
              href={PRIVACY_NOTICE_URL}
              target="_blank"
              rel="noreferrer"
              className="text-blue-600 underline"
            >
              privacy notice
            </a>
          </ConsentCheckbox>
          <ConsentCheckbox
            name="consent_emergency_first_aid"
            required
            error={fieldError('consent_emergency_first_aid')}
          >
            I consent to emergency first aid being given to my child if needed
          </ConsentCheckbox>
          <ConsentCheckbox name="consent_photo_media">
            I consent to my child&apos;s photo being used on social media, the
            school website and promotional material. You can withdraw this at
            any time via the school office.
          </ConsentCheckbox>
          <ConsentCheckbox name="consent_home_school">
            I agree to the home–school agreement
          </ConsentCheckbox>
          <ConsentCheckbox name="consent_comms_email_sms">
            I consent to receiving communications by email and SMS
          </ConsentCheckbox>
        </div>
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

function ConsentCheckbox({
  name,
  required = false,
  defaultChecked = false,
  error,
  children,
}: {
  name: string
  required?: boolean
  defaultChecked?: boolean
  error?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <label className="flex cursor-pointer items-start gap-2 text-sm text-gray-700">
        <input
          type="checkbox"
          name={name}
          required={required}
          defaultChecked={defaultChecked}
          aria-invalid={error ? true : undefined}
          className="mt-0.5 rounded text-blue-600 focus:ring-blue-500"
        />
        <span>
          {children}
          {required && <span className="ml-0.5 text-red-500">*</span>}
        </span>
      </label>
      {error && <p className="mt-1 ml-6 text-sm text-red-600">{error}</p>}
    </div>
  )
}
