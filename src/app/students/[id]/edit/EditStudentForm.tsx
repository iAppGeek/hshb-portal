'use client'

import { useState } from 'react'

import type { GuardianSummary } from '@/db'
import {
  CheckboxField,
  FormActions,
  FormGrid,
  FormSection,
  RadioGroup,
  TextField,
  useServerForm,
} from '@/components/form'

import GuardianSelector from '../../_components/GuardianSelector'

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
