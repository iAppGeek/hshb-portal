'use client'

import { useState } from 'react'

import type { IncidentRow, IncidentType } from '@/db'
import {
  FormActions,
  FormSection,
  SelectField,
  StudentSearch,
  TextAreaField,
  TextField,
  useServerForm,
  type StudentSummary,
} from '@/components/form'
import type { ActionResult } from '@/lib/action'
import {
  nowDatetimeLocalInSchoolTz,
  toDatetimeLocalInSchoolTz,
} from '@/lib/datetime'
import { personName } from '@/lib/format'

export type StudentOption = StudentSummary

type Props = {
  initial?: IncidentRow
  students: StudentOption[]
  defaultType?: IncidentType
  action: (formData: FormData) => Promise<ActionResult>
  submitLabel: string
}

export default function IncidentForm({
  initial,
  students,
  defaultType = 'medical',
  action,
  submitLabel,
}: Props): React.ReactElement {
  const [studentId, setStudentId] = useState('')
  const [parentNotified, setParentNotified] = useState(
    initial?.parent_notified ?? false,
  )
  const { handleSubmit, isPending, error, fieldError } = useServerForm(action)

  const type = initial?.type ?? defaultType

  const defaultDateTime = initial
    ? initial.incident_date
      ? toDatetimeLocalInSchoolTz(initial.incident_date)
      : ''
    : nowDatetimeLocalInSchoolTz()

  const defaultNotifiedAt = initial?.parent_notified_at
    ? toDatetimeLocalInSchoolTz(initial.parent_notified_at)
    : nowDatetimeLocalInSchoolTz()

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <FormSection title="Incident Details">
        {/* An incident's type and student are fixed once it is recorded. */}
        {initial && <input type="hidden" name="type" value={initial.type} />}

        <div className="grid grid-cols-1 gap-4">
          {initial ? (
            <div className="rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-500">
              <span className="font-medium text-gray-700">Student: </span>
              {personName(initial.student, 'lastFirst')}
            </div>
          ) : (
            <>
              <SelectField
                label="Type"
                name="type"
                required
                defaultValue={type}
                options={[
                  { value: 'medical', label: 'Medical' },
                  { value: 'behaviour', label: 'Behaviour' },
                  { value: 'other', label: 'Other' },
                ]}
                error={fieldError('type')}
              />

              <input type="hidden" name="student_id" value={studentId} />
              <StudentSearch
                students={students}
                onSelect={setStudentId}
                error={fieldError('student_id')}
              />
            </>
          )}

          <TextField
            label="Title"
            name="title"
            required
            defaultValue={initial?.title}
            error={fieldError('title')}
          />

          <TextAreaField
            label="Description"
            name="description"
            required
            rows={4}
            defaultValue={initial?.description}
            error={fieldError('description')}
          />

          <TextField
            label="Incident date & time"
            name="incident_date"
            type="datetime-local"
            required
            defaultValue={defaultDateTime}
            error={fieldError('incident_date')}
          />
        </div>
      </FormSection>

      <FormSection title="Parent / Guardian Notification">
        {/* `parent_notified` is a boolean-string field (booleanFromString), not
            the on/off checkbox schema helper, so the visible checkbox stays
            unnamed and this hidden input carries the value the schema reads. */}
        <input
          type="hidden"
          name="parent_notified"
          value={String(parentNotified)}
        />
        <label className="flex cursor-pointer items-center gap-3">
          <input
            type="checkbox"
            checked={parentNotified}
            onChange={(e) => setParentNotified(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <span className="text-sm text-gray-700">
            Parent / guardian has been notified
          </span>
        </label>

        {parentNotified && (
          <div className="mt-4">
            <TextField
              label="Date & time notified"
              name="parent_notified_at"
              type="datetime-local"
              defaultValue={defaultNotifiedAt}
              error={fieldError('parent_notified_at')}
            />
          </div>
        )}
      </FormSection>

      <FormActions
        submitLabel={submitLabel}
        isPending={isPending}
        cancelHref={`/incidents?tab=${type}`}
        error={error ?? undefined}
      />
    </form>
  )
}
