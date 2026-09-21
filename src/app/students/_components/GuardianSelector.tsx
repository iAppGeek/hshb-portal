'use client'

import { useState } from 'react'
import Link from 'next/link'

import type { GuardianSummary } from '@/db'
import {
  FormGrid,
  RadioGroup,
  SelectField,
  TextField,
  formStyles,
} from '@/components/form'

const SEARCH_MIN_LENGTH = 5
const SEARCH_MAX_RESULTS = 10

type FieldErrorLookup = (name: string) => string | undefined

type GuardianFieldsProps = {
  prefix: string
  showAddress?: boolean
  requireAddress?: boolean
  requireEmail?: boolean
  requireOccupation?: boolean
  fieldError: FieldErrorLookup
}

type Props = GuardianFieldsProps & {
  guardians: GuardianSummary[]
  /** Pre-selects an existing guardian, starting in "Select existing" mode. */
  defaultId?: string
  defaultRelationship?: string
}

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

function searchPlaceholder(search: string, matchCount: number): string {
  const length = search.trim().length
  if (length === 0) return 'Search above to find a guardian…'
  if (length < SEARCH_MIN_LENGTH) return 'Keep typing…'
  if (matchCount === 0) return 'No matches found'
  return 'Select a guardian…'
}

function guardianOption(g: GuardianSummary): { value: string; label: string } {
  return { value: g.id, label: `${g.last_name}, ${g.first_name} — ${g.phone}` }
}

/**
 * One guardian/contact slot on the student forms: either link an existing
 * guardian (search + select) or enter a new one. Field names are prefixed
 * (`${prefix}_first_name`, `${prefix}_existing_id`, …) to match the parsing
 * in the student actions.
 */
export default function GuardianSelector({
  prefix,
  guardians,
  defaultId,
  defaultRelationship,
  fieldError,
  ...fieldsProps
}: Props): React.ReactElement {
  const [mode, setMode] = useState<'new' | 'existing'>(
    defaultId ? 'existing' : 'new',
  )
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState(defaultId ?? '')

  function switchMode(next: 'new' | 'existing'): void {
    setMode(next)
    setSearch('')
  }

  const filtered = filterGuardians(guardians, search)
  // Keep the current selection listed even when it's not in the search results.
  const selected = filtered.some((g) => g.id === selectedId)
    ? undefined
    : guardians.find((g) => g.id === selectedId)
  const options = (selected ? [selected, ...filtered] : filtered).map(
    guardianOption,
  )

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
          <div className="sm:col-span-2">
            <SelectField
              label="Guardian"
              name={`${prefix}_existing_id`}
              required
              value={selectedId}
              onChange={setSelectedId}
              placeholder={searchPlaceholder(search, filtered.length)}
              options={options}
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
          fieldError={fieldError}
          {...fieldsProps}
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
}: GuardianFieldsProps): React.ReactElement {
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
