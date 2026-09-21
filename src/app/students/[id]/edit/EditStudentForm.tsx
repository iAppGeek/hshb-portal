'use client'

import { useState } from 'react'
import Link from 'next/link'

import type { GuardianSummary } from '@/db'
import {
  CheckboxField,
  FieldError,
  FormActions,
  FormGrid,
  FormSection,
  RadioGroup,
  TextField,
  formStyles,
  useServerForm,
} from '@/components/form'

import { updateStudentAction } from './actions'

type ClassOption = {
  id: string
  name: string
  year_group: string
}

type StudentData = {
  id: string
  first_name: string
  last_name: string
  student_code: string | null
  date_of_birth: string | null
  english_school_name: string | null
  address_guardian_id: string | null
  address_line_1: string | null
  address_line_2: string | null
  city: string | null
  postcode: string | null
  allergies: string | null
  medical_details: string | null
  notes: string | null
  primary_guardian_id: string | null
  primary_guardian_relationship: string | null
  secondary_guardian_id: string | null
  secondary_guardian_relationship: string | null
  additional_contact_1_id: string | null
  additional_contact_1_relationship: string | null
  additional_contact_2_id: string | null
  additional_contact_2_relationship: string | null
  consent_privacy_notice: boolean
  consent_emergency_first_aid: boolean
  consent_photo_media: boolean
  consent_home_school: boolean
  consent_comms_email_sms: boolean
}

type Props = {
  student: StudentData
  guardians: GuardianSummary[]
  classes?: ClassOption[]
  enrolledClassIds?: string[]
}

export default function EditStudentForm({
  student,
  guardians,
  classes = [],
  enrolledClassIds = [],
}: Props) {
  const [showSecondary, setShowSecondary] = useState(
    Boolean(student.secondary_guardian_id),
  )
  const [showContact1, setShowContact1] = useState(
    Boolean(student.additional_contact_1_id),
  )
  const [showContact2, setShowContact2] = useState(
    Boolean(student.additional_contact_2_id),
  )

  const initialAddressMode: 'own' | 'guardian' =
    student.address_guardian_id != null
      ? 'guardian'
      : student.address_line_1
        ? 'own'
        : 'guardian'

  const [addressMode, setAddressMode] = useState<'own' | 'guardian'>(
    initialAddressMode,
  )

  const { handleSubmit, isPending, error, fieldError } = useServerForm((fd) =>
    updateStudentAction(student.id, fd),
  )

  function handleRemoveSecondary() {
    setShowSecondary(false)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <input type="hidden" name="has_secondary" value={String(showSecondary)} />
      <input type="hidden" name="has_contact1" value={String(showContact1)} />
      <input type="hidden" name="has_contact2" value={String(showContact2)} />
      <input
        type="hidden"
        name="address_guardian_id"
        value={addressMode === 'guardian' ? 'primary' : ''}
      />

      {/* ── Student Details ─────────────────────────────────────────── */}
      <FormSection title="Student Details">
        <FormGrid>
          <TextField
            label="First name"
            name="student_first_name"
            required
            defaultValue={student.first_name}
            error={fieldError('student_first_name')}
          />
          <TextField
            label="Last name"
            name="student_last_name"
            required
            defaultValue={student.last_name}
            error={fieldError('student_last_name')}
          />
          <TextField
            label="Date of birth"
            name="student_date_of_birth"
            type="date"
            defaultValue={student.date_of_birth}
            error={fieldError('student_date_of_birth')}
          />
          <TextField
            label="Student code"
            name="student_code"
            defaultValue={student.student_code}
            error={fieldError('student_code')}
          />
          <TextField
            label="English (mainstream) school"
            name="student_english_school_name"
            defaultValue={student.english_school_name}
            error={fieldError('student_english_school_name')}
          />
        </FormGrid>

        <div className="mt-4">
          <RadioGroup
            name="address_mode"
            legend="Address"
            value={addressMode}
            onChange={(v) => setAddressMode(v as 'own' | 'guardian')}
            options={[
              { value: 'guardian', label: 'Same as guardian' },
              { value: 'own', label: 'Enter address' },
            ]}
          />

          {addressMode === 'guardian' ? (
            <p className="mt-3 text-sm text-gray-500">
              Student will use the primary guardian&apos;s address.
            </p>
          ) : (
            <FormGrid>
              <TextField
                label="Address line 1"
                name="student_address_line_1"
                required
                defaultValue={student.address_line_1}
                autoComplete="address-line1"
                error={fieldError('student_address_line_1')}
              />
              <TextField
                label="Address line 2"
                name="student_address_line_2"
                defaultValue={student.address_line_2}
                autoComplete="address-line2"
                error={fieldError('student_address_line_2')}
              />
              <TextField
                label="City"
                name="student_city"
                required
                defaultValue={student.city}
                autoComplete="address-level2"
                error={fieldError('student_city')}
              />
              <TextField
                label="Postcode"
                name="student_postcode"
                required
                defaultValue={student.postcode}
                autoComplete="postal-code"
                error={fieldError('student_postcode')}
              />
            </FormGrid>
          )}
        </div>

        <div className="mt-4">
          <FormGrid>
            <TextField
              label="Allergies"
              name="student_allergies"
              defaultValue={student.allergies}
              error={fieldError('student_allergies')}
            />
            <TextField
              label="Medical Details"
              name="student_medical_details"
              defaultValue={student.medical_details}
              error={fieldError('student_medical_details')}
            />
            <TextField
              label="Notes"
              name="student_notes"
              defaultValue={student.notes}
              error={fieldError('student_notes')}
            />
          </FormGrid>
        </div>
      </FormSection>

      {/* ── Primary Guardian ────────────────────────────────────────── */}
      <FormSection title="Primary Guardian">
        <GuardianSelector
          prefix="primary"
          guardians={guardians}
          showAddress
          requireAddress={addressMode === 'guardian'}
          requireEmail
          requireOccupation
          defaultId={student.primary_guardian_id ?? undefined}
          defaultRelationship={
            student.primary_guardian_relationship ?? undefined
          }
          fieldError={fieldError}
        />
      </FormSection>

      {/* ── Secondary Guardian ──────────────────────────────────────── */}
      {showSecondary ? (
        <FormSection
          title="Secondary Guardian"
          onRemove={handleRemoveSecondary}
        >
          <GuardianSelector
            prefix="secondary"
            guardians={guardians}
            showAddress
            requireOccupation
            defaultId={student.secondary_guardian_id ?? undefined}
            defaultRelationship={
              student.secondary_guardian_relationship ?? undefined
            }
            fieldError={fieldError}
          />
        </FormSection>
      ) : (
        <button
          type="button"
          onClick={() => setShowSecondary(true)}
          className="text-sm font-medium text-blue-600 hover:text-blue-800"
        >
          + Add secondary guardian
        </button>
      )}

      {/* ── Additional Contacts ─────────────────────────────────────── */}
      {showContact1 ? (
        <FormSection
          title="Additional Contact 1"
          onRemove={() => {
            setShowContact1(false)
            setShowContact2(false)
          }}
        >
          <GuardianSelector
            prefix="contact1"
            guardians={guardians}
            defaultId={student.additional_contact_1_id ?? undefined}
            defaultRelationship={
              student.additional_contact_1_relationship ?? undefined
            }
            fieldError={fieldError}
          />
        </FormSection>
      ) : (
        <button
          type="button"
          onClick={() => setShowContact1(true)}
          className="text-sm font-medium text-blue-600 hover:text-blue-800"
        >
          + Add additional contact
        </button>
      )}

      {showContact1 &&
        (showContact2 ? (
          <FormSection
            title="Additional Contact 2"
            onRemove={() => setShowContact2(false)}
          >
            <GuardianSelector
              prefix="contact2"
              guardians={guardians}
              defaultId={student.additional_contact_2_id ?? undefined}
              defaultRelationship={
                student.additional_contact_2_relationship ?? undefined
              }
              fieldError={fieldError}
            />
          </FormSection>
        ) : (
          <button
            type="button"
            onClick={() => setShowContact2(true)}
            className="text-sm font-medium text-blue-600 hover:text-blue-800"
          >
            + Add second additional contact
          </button>
        ))}

      {/* ── Classes ─────────────────────────────────────────────────── */}
      {classes.length > 0 && (
        <FormSection title="Classes">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {classes.map((cls) => (
              <label
                key={cls.id}
                className="flex items-center gap-2 text-sm text-gray-700"
              >
                <input
                  type="checkbox"
                  name="class_ids"
                  value={cls.id}
                  defaultChecked={enrolledClassIds.includes(cls.id)}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                {cls.name} (Year {cls.year_group})
              </label>
            ))}
          </div>
        </FormSection>
      )}

      {/* ── Consents ─────────────────────────────────────────────────── */}
      <FormSection title="Consents">
        <p className="mb-3 text-xs text-gray-500">
          Tick only what the parent has signed for.
        </p>
        <div className="space-y-2">
          <CheckboxField
            name="consent_privacy_notice"
            label="Privacy notice"
            defaultChecked={student.consent_privacy_notice}
          />
          <CheckboxField
            name="consent_emergency_first_aid"
            label="Emergency first aid"
            defaultChecked={student.consent_emergency_first_aid}
          />
          <CheckboxField
            name="consent_photo_media"
            label="Photo & media"
            defaultChecked={student.consent_photo_media}
          />
          <CheckboxField
            name="consent_home_school"
            label="Home–school agreement"
            defaultChecked={student.consent_home_school}
          />
          <CheckboxField
            name="consent_comms_email_sms"
            label="Email & SMS"
            defaultChecked={student.consent_comms_email_sms}
          />
        </div>
      </FormSection>

      {/* ── Actions ─────────────────────────────────────────────────── */}
      <FormActions
        submitLabel="Save changes"
        isPending={isPending}
        cancelHref="/students"
        error={error ?? undefined}
      />
    </form>
  )
}

const SEARCH_MIN_LENGTH = 5
const SEARCH_MAX_RESULTS = 10

function filterGuardians(
  guardians: GuardianSummary[],
  query: string,
): GuardianSummary[] {
  const trimmed = query.trim()
  if (trimmed.length < SEARCH_MIN_LENGTH) return []
  const tokens = trimmed.toLowerCase().split(/\s+/)
  return guardians
    .filter((g) => {
      const haystack = `${g.first_name} ${g.last_name}`.toLowerCase()
      return tokens.every((t) => haystack.includes(t))
    })
    .slice(0, SEARCH_MAX_RESULTS)
}

function GuardianSelector({
  prefix,
  guardians,
  showAddress = false,
  requireAddress = false,
  requireEmail = false,
  requireOccupation = false,
  defaultId,
  defaultRelationship,
  fieldError,
}: {
  prefix: string
  guardians: GuardianSummary[]
  showAddress?: boolean
  requireAddress?: boolean
  requireEmail?: boolean
  requireOccupation?: boolean
  defaultId?: string
  defaultRelationship?: string
  fieldError: (name: string) => string | undefined
}) {
  const [mode, setMode] = useState<'new' | 'existing'>(
    defaultId ? 'existing' : 'new',
  )
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState(defaultId ?? '')

  function switchMode(next: 'new' | 'existing') {
    setMode(next)
    setSearch('')
  }

  const filtered = filterGuardians(guardians, search)

  return (
    <>
      <input type="hidden" name={`${prefix}_mode`} value={mode} />

      {guardians.length > 0 && (
        <div className="mb-4">
          <RadioGroup
            name={`${prefix}_mode_radio`}
            legend="Guardian source"
            value={mode}
            onChange={(v) => switchMode(v as 'new' | 'existing')}
            options={[
              { value: 'new', label: 'Add new' },
              { value: 'existing', label: 'Select existing' },
            ]}
          />
        </div>
      )}

      {mode === 'existing' ? (
        <FormGrid>
          <div className="sm:col-span-2">
            <label htmlFor={`${prefix}_search`} className={formStyles.label}>
              Search guardians
            </label>
            <input
              id={`${prefix}_search`}
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Type at least 5 characters…"
              className={formStyles.input}
            />
            <p className={formStyles.hint}>
              Type at least 5 characters · top 10 results shown
            </p>
          </div>
          <div className="sm:col-span-2">
            <label
              htmlFor={`${prefix}_existing_id`}
              className={formStyles.label}
            >
              Guardian<span className={formStyles.requiredMark}>*</span>
            </label>
            <select
              id={`${prefix}_existing_id`}
              name={`${prefix}_existing_id`}
              required
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
              aria-invalid={
                fieldError(`${prefix}_existing_id`) ? true : undefined
              }
              aria-describedby={
                fieldError(`${prefix}_existing_id`)
                  ? `${prefix}_existing_id-error`
                  : undefined
              }
              className={`${formStyles.input}${fieldError(`${prefix}_existing_id`) ? ` ${formStyles.inputInvalid}` : ''}`}
            >
              <option value="">
                {search.trim().length === 0
                  ? 'Search above to find a guardian…'
                  : search.trim().length < SEARCH_MIN_LENGTH
                    ? 'Keep typing…'
                    : filtered.length === 0
                      ? 'No matches found'
                      : 'Select a guardian…'}
              </option>
              {/* Show currently selected guardian even when not in search results */}
              {selectedId &&
                !filtered.find((g) => g.id === selectedId) &&
                (() => {
                  const current = guardians.find((g) => g.id === selectedId)
                  return current ? (
                    <option key={current.id} value={current.id}>
                      {current.last_name}, {current.first_name} —{' '}
                      {current.phone}
                    </option>
                  ) : null
                })()}
              {filtered.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.last_name}, {g.first_name} — {g.phone}
                </option>
              ))}
            </select>
            <FieldError
              id={`${prefix}_existing_id-error`}
              error={fieldError(`${prefix}_existing_id`)}
            />
            {selectedId && (
              <Link
                href={`/guardians/${selectedId}/edit`}
                className="mt-1 inline-block text-sm text-blue-600 hover:text-blue-800"
                target="_blank"
              >
                Edit guardian
              </Link>
            )}
          </div>
          <TextField
            label="Relationship to student"
            name={`${prefix}_relationship`}
            required
            defaultValue={defaultRelationship}
            error={fieldError(`${prefix}_relationship`)}
          />
        </FormGrid>
      ) : (
        <GuardianFields
          prefix={prefix}
          showAddress={showAddress}
          requireAddress={requireAddress}
          requireEmail={requireEmail}
          requireOccupation={requireOccupation}
          fieldError={fieldError}
        />
      )}
    </>
  )
}

function GuardianFields({
  prefix,
  showAddress = false,
  requireAddress = false,
  requireEmail = false,
  requireOccupation = false,
  fieldError,
}: {
  prefix: string
  showAddress?: boolean
  requireAddress?: boolean
  requireEmail?: boolean
  requireOccupation?: boolean
  fieldError: (name: string) => string | undefined
}) {
  return (
    <>
      <FormGrid>
        <TextField
          label="First name"
          name={`${prefix}_first_name`}
          required
          autoComplete="given-name"
          error={fieldError(`${prefix}_first_name`)}
        />
        <TextField
          label="Last name"
          name={`${prefix}_last_name`}
          required
          autoComplete="family-name"
          error={fieldError(`${prefix}_last_name`)}
        />
        <TextField
          label="Phone"
          name={`${prefix}_phone`}
          type="tel"
          required
          error={fieldError(`${prefix}_phone`)}
        />
        <TextField
          label="Email"
          name={`${prefix}_email`}
          type="email"
          required={requireEmail}
          error={fieldError(`${prefix}_email`)}
        />
        <TextField
          label="Relationship to student"
          name={`${prefix}_relationship`}
          required
          error={fieldError(`${prefix}_relationship`)}
        />
        <TextField
          label="Occupation"
          name={`${prefix}_occupation`}
          required={requireOccupation}
          error={fieldError(`${prefix}_occupation`)}
        />
      </FormGrid>
      {showAddress && (
        <div className="mt-4">
          <FormGrid>
            <TextField
              label="Address line 1"
              name={`${prefix}_address_line_1`}
              required={requireAddress}
              autoComplete="address-line1"
              error={fieldError(`${prefix}_address_line_1`)}
            />
            <TextField
              label="Address line 2"
              name={`${prefix}_address_line_2`}
              autoComplete="address-line2"
              error={fieldError(`${prefix}_address_line_2`)}
            />
            <TextField
              label="City"
              name={`${prefix}_city`}
              required={requireAddress}
              autoComplete="address-level2"
              error={fieldError(`${prefix}_city`)}
            />
            <TextField
              label="Postcode"
              name={`${prefix}_postcode`}
              required={requireAddress}
              autoComplete="postal-code"
              error={fieldError(`${prefix}_postcode`)}
            />
          </FormGrid>
        </div>
      )}
    </>
  )
}
