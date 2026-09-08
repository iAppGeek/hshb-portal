'use client'

import { useState, useTransition } from 'react'

import TurnstileWidget from '@/clientComponents/TurnstileWidget'
import { PRIVACY_NOTICE_URL, YEAR_GROUP_NOT_SURE } from '@/lib/registration'

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
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const form = e.currentTarget
    startTransition(async () => {
      const result = await submitRegistrationAction(new FormData(form))
      if (result?.error) setError(result.error)
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <input type="hidden" name="has_secondary" value={String(showSecondary)} />
      <input type="hidden" name="has_contact1" value={String(showContact1)} />
      <input type="hidden" name="has_contact2" value={String(showContact2)} />

      {/* ── Child's details ─────────────────────────────────────────── */}
      <FormSection title="Child's details">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="First name" name="child_first_name" required />
          <Field label="Last name" name="child_last_name" required />
          <Field
            label="Date of birth"
            name="date_of_birth"
            type="date"
            required
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
        </div>
      </FormSection>

      {/* ── Home address ────────────────────────────────────────────── */}
      <FormSection title="Home address">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Address line 1" name="address_line_1" required />
          <Field label="Address line 2" name="address_line_2" />
          <Field label="City" name="city" required />
          <Field label="Postcode" name="postcode" required />
        </div>
      </FormSection>

      {/* ── Medical & dietary ───────────────────────────────────────── */}
      <FormSection title="Medical & dietary">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <TextArea label="Allergies" name="allergies" />
          <TextArea label="Medical details" name="medical_details" />
        </div>
      </FormSection>

      {/* ── Parent/carer 1 ──────────────────────────────────────────── */}
      <FormSection title="Parent/carer 1 (required)">
        <ContactFields
          prefix="primary"
          requireEmail={false}
          defaultSameAddress
        />
      </FormSection>

      {/* ── Parent/carer 2 ──────────────────────────────────────────── */}
      {showSecondary ? (
        <FormSection
          title="Parent/carer 2"
          onRemove={() => setShowSecondary(false)}
        >
          <ContactFields prefix="secondary" defaultSameAddress />
        </FormSection>
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
        <FormSection
          title="Emergency contact 1"
          onRemove={() => {
            setShowContact1(false)
            setShowContact2(false)
          }}
        >
          <ContactFields prefix="contact1" defaultSameAddress />
        </FormSection>
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
          <FormSection
            title="Emergency contact 2"
            onRemove={() => setShowContact2(false)}
          >
            <ContactFields prefix="contact2" defaultSameAddress />
          </FormSection>
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
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <TextArea
              label="Who is authorised to collect the child?"
              name="collect_authorised"
            />
            <Field label="Collection password" name="collect_password" />
          </div>
        </FormSection>
      )}

      {/* ── Consents ─────────────────────────────────────────────────── */}
      <FormSection title="Consents">
        <div className="space-y-3">
          <Checkbox name="consent_privacy_notice" required>
            I have read and accept the school&apos;s{' '}
            <a
              href={PRIVACY_NOTICE_URL}
              target="_blank"
              rel="noreferrer"
              className="text-blue-600 underline"
            >
              privacy notice
            </a>
          </Checkbox>
          <Checkbox name="consent_emergency_first_aid" required>
            I consent to emergency first aid being given to my child if needed
          </Checkbox>
          <Checkbox name="consent_photo_media">
            I consent to my child&apos;s photo being used on social media, the
            school website and promotional material. You can withdraw this at
            any time via the school office.
          </Checkbox>
          <Checkbox name="consent_home_school">
            I agree to the home–school agreement
          </Checkbox>
          <Checkbox name="consent_comms_email_sms">
            I consent to receiving communications by email and SMS
          </Checkbox>
        </div>
      </FormSection>

      {/* ── Declaration ──────────────────────────────────────────────── */}
      <FormSection title="Declaration">
        <Field
          label="Your full name"
          name="declaration_name"
          required
          hint="Typing your name here acts as your signature"
        />
        {turnstileSiteKey && (
          <div className="mt-4">
            <TurnstileWidget siteKey={turnstileSiteKey} onToken={setToken} />
            <input type="hidden" name="turnstile_token" value={token ?? ''} />
          </div>
        )}
      </FormSection>

      <div className="flex items-center gap-4">
        <button
          type="submit"
          disabled={isPending || !token}
          className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700 disabled:pointer-events-none disabled:opacity-50"
        >
          {isPending ? 'Submitting…' : 'Submit registration'}
        </button>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    </form>
  )
}

function ContactFields({
  prefix,
  requireEmail = false,
  defaultSameAddress = false,
}: {
  prefix: string
  requireEmail?: boolean
  defaultSameAddress?: boolean
}) {
  const [sameAddress, setSameAddress] = useState(defaultSameAddress)

  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="First name" name={`${prefix}_first_name`} required />
        <Field label="Last name" name={`${prefix}_last_name`} required />
        <Field label="Relationship to child" name={`${prefix}_relationship`} />
        <Field label="Phone" name={`${prefix}_phone`} type="tel" required />
        <Field
          label="Email"
          name={`${prefix}_email`}
          type="email"
          required={requireEmail}
        />
      </div>
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
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Address line 1" name={`${prefix}_address_line_1`} />
          <Field label="Address line 2" name={`${prefix}_address_line_2`} />
          <Field label="City" name={`${prefix}_city`} />
          <Field label="Postcode" name={`${prefix}_postcode`} />
        </div>
      )}
    </>
  )
}

function FormSection({
  title,
  children,
  onRemove,
}: {
  title: string
  children: React.ReactNode
  onRemove?: () => void
}) {
  return (
    <div className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-gray-200">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="text-xs text-gray-400 hover:text-red-500"
          >
            Remove
          </button>
        )}
      </div>
      {children}
    </div>
  )
}

function Field({
  label,
  name,
  type = 'text',
  required = false,
  hint,
}: {
  label: string
  name: string
  type?: string
  required?: boolean
  hint?: string
}) {
  return (
    <div>
      <label htmlFor={name} className="block text-sm font-medium text-gray-700">
        {label}
        {required && <span className="ml-0.5 text-red-500">*</span>}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        required={required}
        className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm placeholder:text-gray-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
      />
      {hint && <p className="mt-1 text-xs text-gray-400">{hint}</p>}
    </div>
  )
}

function TextArea({ label, name }: { label: string; name: string }) {
  return (
    <div>
      <label htmlFor={name} className="block text-sm font-medium text-gray-700">
        {label}
      </label>
      <textarea
        id={name}
        name={name}
        rows={3}
        className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm placeholder:text-gray-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
      />
    </div>
  )
}

function Checkbox({
  name,
  required = false,
  defaultChecked = false,
  children,
}: {
  name: string
  required?: boolean
  defaultChecked?: boolean
  children: React.ReactNode
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2 text-sm text-gray-700">
      <input
        type="checkbox"
        name={name}
        required={required}
        defaultChecked={defaultChecked}
        className="mt-0.5 rounded text-blue-600 focus:ring-blue-500"
      />
      <span>
        {children}
        {required && <span className="ml-0.5 text-red-500">*</span>}
      </span>
    </label>
  )
}
