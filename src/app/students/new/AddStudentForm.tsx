'use client'

import { useState } from 'react'

import type { GuardianSummary } from '@/db'
import {
  FormActions,
  FormGrid,
  FormSection,
  RadioGroup,
  SelectField,
  TextField,
  formStyles,
  useServerForm,
} from '@/components/form'

import { createStudentAction } from './actions'

type Props = {
  guardians: GuardianSummary[]
}

export default function AddStudentForm({ guardians }: Props) {
  const [showSecondary, setShowSecondary] = useState(false)
  const [showContact1, setShowContact1] = useState(false)
  const [showContact2, setShowContact2] = useState(false)
  const [addressMode, setAddressMode] = useState<'own' | 'guardian'>('guardian')
  const { handleSubmit, isPending, error, fieldError } =
    useServerForm(createStudentAction)

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Hidden flags for optional sections and address source */}
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
            error={fieldError('student_first_name')}
          />
          <TextField
            label="Last name"
            name="student_last_name"
            required
            error={fieldError('student_last_name')}
          />
          <TextField
            label="Date of birth"
            name="student_date_of_birth"
            type="date"
            error={fieldError('student_date_of_birth')}
          />
          <TextField
            label="Student code"
            name="student_code"
            error={fieldError('student_code')}
          />
          <TextField
            label="English (mainstream) school"
            name="student_english_school_name"
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
                autoComplete="address-line1"
                error={fieldError('student_address_line_1')}
              />
              <TextField
                label="Address line 2"
                name="student_address_line_2"
                autoComplete="address-line2"
                error={fieldError('student_address_line_2')}
              />
              <TextField
                label="City"
                name="student_city"
                required
                autoComplete="address-level2"
                error={fieldError('student_city')}
              />
              <TextField
                label="Postcode"
                name="student_postcode"
                required
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
              error={fieldError('student_allergies')}
            />
            <TextField
              label="Medical Details"
              name="student_medical_details"
              error={fieldError('student_medical_details')}
            />
            <TextField
              label="Notes"
              name="student_notes"
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
          fieldError={fieldError}
        />
      </FormSection>

      {/* ── Secondary Guardian ──────────────────────────────────────── */}
      {showSecondary ? (
        <FormSection
          title="Secondary Guardian"
          onRemove={() => setShowSecondary(false)}
        >
          <GuardianSelector
            prefix="secondary"
            guardians={guardians}
            showAddress
            requireOccupation
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

      {/* ── Actions ─────────────────────────────────────────────────── */}
      <FormActions
        submitLabel="Save student"
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
  fieldError,
}: {
  prefix: string
  guardians: GuardianSummary[]
  showAddress?: boolean
  requireAddress?: boolean
  requireEmail?: boolean
  requireOccupation?: boolean
  fieldError: (name: string) => string | undefined
}) {
  const [mode, setMode] = useState<'new' | 'existing'>('new')
  const [search, setSearch] = useState('')

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
              title="Type at least 5 characters to search. Up to 10 results will be shown."
              className={formStyles.input}
            />
            <p className={formStyles.hint}>
              Type at least 5 characters · top 10 results shown
            </p>
          </div>
          <SelectField
            label="Guardian"
            name={`${prefix}_existing_id`}
            required
            className="sm:col-span-2"
            placeholder={
              search.trim().length === 0
                ? 'Search above to find a guardian…'
                : search.trim().length < SEARCH_MIN_LENGTH
                  ? 'Keep typing…'
                  : filtered.length === 0
                    ? 'No matches found'
                    : 'Select a guardian…'
            }
            options={filtered.map((g) => ({
              value: g.id,
              label: `${g.last_name}, ${g.first_name} — ${g.phone}`,
            }))}
            error={fieldError(`${prefix}_existing_id`)}
          />
          <TextField
            label="Relationship to student"
            name={`${prefix}_relationship`}
            required
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
