'use client'

import { useState } from 'react'

import LeaverBadge from '@/components/LeaverBadge'
import {
  FormActions,
  FormGrid,
  FormSection,
  SelectField,
  TextField,
  formStyles,
  useServerForm,
} from '@/components/form'
import { matchesAny, normaliseQuery } from '@/lib/grid/search'
import type { ActionResult } from '@/lib/action'

export type ClassFormTeacher = {
  id: string
  first_name: string
  last_name: string
  display_name: string | null
}

export type ClassFormStudent = {
  id: string
  first_name: string
  last_name: string
  student_code: string | null
}

export type ClassFormMember = {
  student_id: string
  student:
    | (ClassFormStudent & { active: boolean; leaving_reason: string | null })
    | null
}

export type ClassFormData = {
  id: string
  name: string
  year_group: string
  room_number: string | null
  academic_year_id: string
  teacher_id: string | null
  student_classes: ClassFormMember[]
}

type StudentRow = ClassFormStudent & {
  enrolled: boolean
  leavingReason: string | null
  leaver: boolean
}

export type ClassFormAcademicYear = { id: string; code: string }

type Props = {
  teachers: ClassFormTeacher[]
  students: ClassFormStudent[]
  years: ClassFormAcademicYear[]
  defaultAcademicYearId?: string
  classData?: ClassFormData
  action: (formData: FormData) => Promise<ActionResult>
  submitLabel: string
}

const SEARCH_MIN = 2

function matchesSearch(student: ClassFormStudent, query: string): boolean {
  const q = normaliseQuery(query)
  if (q.length < SEARCH_MIN) return true
  return matchesAny([`${student.first_name} ${student.last_name}`], q)
}

/**
 * Every row the form submits: leavers still on the class first (they aren't
 * in the selectable active list), then current members, then everyone else.
 */
function buildStudentRows(
  students: ClassFormStudent[],
  members: ClassFormMember[],
): StudentRow[] {
  const enrolledIds = new Set(members.map((m) => m.student_id))
  const selectableIds = new Set(students.map((s) => s.id))
  const leavers: StudentRow[] = members.flatMap((m) =>
    m.student && !m.student.active && !selectableIds.has(m.student_id)
      ? [
          {
            id: m.student.id,
            first_name: m.student.first_name,
            last_name: m.student.last_name,
            student_code: m.student.student_code,
            enrolled: true,
            leavingReason: m.student.leaving_reason,
            leaver: true,
          },
        ]
      : [],
  )
  const selectable: StudentRow[] = students.map((s) => ({
    ...s,
    enrolled: enrolledIds.has(s.id),
    leavingReason: null,
    leaver: false,
  }))
  return [
    ...leavers,
    ...selectable.filter((s) => s.enrolled),
    ...selectable.filter((s) => !s.enrolled),
  ]
}

export default function ClassForm({
  teachers,
  students,
  years,
  defaultAcademicYearId,
  classData,
  action,
  submitLabel,
}: Props) {
  const [search, setSearch] = useState('')
  const { handleSubmit, isPending, error, fieldError } = useServerForm(action)

  const rows = buildStudentRows(students, classData?.student_classes ?? [])

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* ── Class Details ─────────────────────────────────────────────── */}
      <FormSection title="Class Details">
        <FormGrid>
          <TextField
            label="Class name"
            name="name"
            required
            defaultValue={classData?.name}
            error={fieldError('name')}
          />
          <TextField
            label="Year group"
            name="year_group"
            required
            defaultValue={classData?.year_group}
            error={fieldError('year_group')}
          />
          <TextField
            label="Room number"
            name="room_number"
            defaultValue={classData?.room_number}
            error={fieldError('room_number')}
          />
          {classData ? (
            <div>
              <p className={formStyles.label}>Academic year</p>
              <p
                data-testid="class-academic-year"
                className="mt-1 py-2 text-sm text-gray-900"
              >
                {years.find((y) => y.id === classData.academic_year_id)?.code ??
                  '—'}
              </p>
              <p className="text-xs text-gray-500">
                A class&apos;s academic year can&apos;t be changed after it is
                created.
              </p>
            </div>
          ) : (
            <SelectField
              label="Academic year"
              name="academic_year_id"
              required
              defaultValue={defaultAcademicYearId}
              placeholder="Select a year…"
              options={years.map((y) => ({ value: y.id, label: y.code }))}
              error={fieldError('academic_year_id')}
            />
          )}
          <SelectField
            label="Teacher"
            name="teacher_id"
            required
            className="sm:col-span-2"
            defaultValue={classData?.teacher_id}
            placeholder="Select a teacher…"
            options={teachers.map((t) => ({
              value: t.id,
              label: `${t.last_name}, ${t.first_name}${t.display_name ? ` (${t.display_name})` : ''}`,
            }))}
            error={fieldError('teacher_id')}
          />
        </FormGrid>
      </FormSection>

      {/* ── Students ──────────────────────────────────────────────────── */}
      <FormSection title="Students">
        <div className="mb-3">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter students by name…"
            className={formStyles.input}
          />
        </div>

        {rows.length === 0 ? (
          <p className="text-sm text-gray-400">No students found.</p>
        ) : (
          // Search only hides rows: every checkbox stays in the form so a
          // hidden member is still submitted and kept on save.
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {rows.map((s) => (
              <label
                key={s.id}
                className={`flex items-center gap-2 text-sm text-gray-700 ${
                  matchesSearch(s, search) ? '' : 'hidden'
                }`}
              >
                <input
                  type="checkbox"
                  name="student_ids"
                  value={s.id}
                  defaultChecked={s.enrolled}
                  className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                {s.last_name}, {s.first_name}
                {s.student_code && (
                  <span className="text-gray-400">({s.student_code})</span>
                )}
                {s.leaver && <LeaverBadge reason={s.leavingReason} />}
              </label>
            ))}
          </div>
        )}
      </FormSection>

      {/* ── Actions ───────────────────────────────────────────────────── */}
      <FormActions
        submitLabel={submitLabel}
        isPending={isPending}
        cancelHref="/classes"
        error={error ?? undefined}
      />
    </form>
  )
}
