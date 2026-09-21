'use client'

import { useState } from 'react'

import type { IncidentRow } from '@/db'
import {
  FormActions,
  FormSection,
  TextAreaField,
  TextField,
  useServerForm,
} from '@/components/form'
import {
  nowDatetimeLocalInSchoolTz,
  toDatetimeLocalInSchoolTz,
} from '@/lib/datetime'

import { updateIncidentAction } from '../../actions'

type Props = {
  incident: IncidentRow
}

export default function EditIncidentForm({ incident }: Props) {
  const [parentNotified, setParentNotified] = useState(
    incident.parent_notified ?? false,
  )
  const { handleSubmit, isPending, error, fieldError } = useServerForm((fd) =>
    updateIncidentAction(incident.id, fd),
  )

  const defaultDateTime = incident.incident_date
    ? toDatetimeLocalInSchoolTz(incident.incident_date)
    : ''

  const defaultNotifiedAt = incident.parent_notified_at
    ? toDatetimeLocalInSchoolTz(incident.parent_notified_at)
    : nowDatetimeLocalInSchoolTz()

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <FormSection title="Incident Details">
        <input type="hidden" name="type" value={incident.type} />

        <div className="grid grid-cols-1 gap-4">
          <div className="rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-500">
            <span className="font-medium text-gray-700">Student: </span>
            {incident.student.last_name}, {incident.student.first_name}
          </div>

          <TextField
            label="Title"
            name="title"
            required
            defaultValue={incident.title}
            error={fieldError('title')}
          />

          <TextAreaField
            label="Description"
            name="description"
            required
            rows={4}
            defaultValue={incident.description}
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
        submitLabel="Save changes"
        isPending={isPending}
        cancelHref={`/incidents?tab=${incident.type}`}
        error={error ?? undefined}
      />
    </form>
  )
}
