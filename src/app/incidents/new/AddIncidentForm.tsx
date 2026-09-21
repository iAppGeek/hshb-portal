'use client'

import { useState, useRef, useEffect } from 'react'

import type { IncidentType } from '@/db'
import {
  FormActions,
  FormSection,
  SelectField,
  TextAreaField,
  TextField,
  useServerForm,
} from '@/components/form'
import { nowDatetimeLocalInSchoolTz } from '@/lib/datetime'

import { createIncidentAction } from '../actions'

type StudentSummary = { id: string; first_name: string; last_name: string }

type Props = {
  students: StudentSummary[]
  staffId: string
  type: IncidentType
}

export default function AddIncidentForm({ students, type }: Props) {
  const [studentId, setStudentId] = useState('')
  const [parentNotified, setParentNotified] = useState(false)
  const { handleSubmit, isPending, error, fieldError } =
    useServerForm(createIncidentAction)

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <FormSection title="Incident Details">
        <div className="grid grid-cols-1 gap-4">
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

          <TextField
            label="Title"
            name="title"
            required
            error={fieldError('title')}
          />

          <TextAreaField
            label="Description"
            name="description"
            required
            rows={4}
            error={fieldError('description')}
          />

          <TextField
            label="Incident date & time"
            name="incident_date"
            type="datetime-local"
            required
            defaultValue={nowDatetimeLocalInSchoolTz()}
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
              defaultValue={nowDatetimeLocalInSchoolTz()}
              error={fieldError('parent_notified_at')}
            />
          </div>
        )}
      </FormSection>

      <FormActions
        submitLabel="Add Incident"
        isPending={isPending}
        cancelHref={`/incidents?tab=${type}`}
        error={error ?? undefined}
      />
    </form>
  )
}

function StudentSearch({
  students,
  onSelect,
  error,
}: {
  students: StudentSummary[]
  onSelect: (id: string) => void
  error?: string
}) {
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<StudentSummary | null>(null)
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const sorted = [...students].sort((a, b) =>
    a.last_name.localeCompare(b.last_name),
  )

  const filtered = search.trim()
    ? sorted.filter((s) =>
        `${s.last_name} ${s.first_name}`
          .toLowerCase()
          .includes(search.toLowerCase()),
      )
    : sorted

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  function select(student: StudentSummary) {
    setSelected(student)
    onSelect(student.id)
    setSearch('')
    setOpen(false)
  }

  function clear() {
    setSelected(null)
    onSelect('')
    setSearch('')
  }

  return (
    <div ref={containerRef} className="relative">
      <label className="block text-sm font-medium text-gray-700">
        Student<span className="ml-0.5 text-red-500">*</span>
      </label>

      {selected ? (
        <div className="mt-1 flex items-center gap-2 rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-sm">
          <span className="flex-1 text-gray-900">
            {selected.last_name}, {selected.first_name}
          </span>
          <button
            type="button"
            onClick={clear}
            className="text-gray-400 hover:text-gray-600"
            aria-label="Clear student selection"
          >
            ✕
          </button>
        </div>
      ) : (
        <>
          <input
            type="text"
            placeholder="Search by name…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setOpen(true)
            }}
            onFocus={() => setOpen(true)}
            autoComplete="off"
            aria-invalid={error ? true : undefined}
            className={`mt-1 block w-full rounded-lg border px-3 py-2 text-sm text-gray-900 shadow-sm placeholder:text-gray-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none ${
              error
                ? 'border-red-400 focus:border-red-500 focus:ring-red-500'
                : 'border-gray-300'
            }`}
          />
          {open && filtered.length > 0 && (
            <ul className="absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg">
              {filtered.slice(0, 30).map((s) => (
                <li
                  key={s.id}
                  onMouseDown={() => select(s)}
                  className="cursor-pointer px-3 py-2 text-sm text-gray-900 hover:bg-blue-50"
                >
                  {s.last_name}, {s.first_name}
                </li>
              ))}
            </ul>
          )}
          {open && search.trim() && filtered.length === 0 && (
            <div className="absolute z-10 mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-500 shadow-lg">
              No students found.
            </div>
          )}
        </>
      )}
      {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
    </div>
  )
}
