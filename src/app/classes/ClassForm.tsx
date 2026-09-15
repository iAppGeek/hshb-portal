'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'

import LeaverBadge from '@/components/LeaverBadge'

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
  action: (formData: FormData) => Promise<{ error: string } | void>
  submitLabel: string
}

const SEARCH_MIN = 2

function matchesSearch(student: ClassFormStudent, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (q.length < SEARCH_MIN) return true
  return `${student.first_name} ${student.last_name}`.toLowerCase().includes(q)
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
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const rows = buildStudentRows(students, classData?.student_classes ?? [])

  function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const form = e.currentTarget
    startTransition(async () => {
      const result = await action(new FormData(form))
      if (result?.error) setError(result.error)
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* ── Class Details ─────────────────────────────────────────────── */}
      <div className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-gray-200">
        <h2 className="mb-4 text-sm font-semibold text-gray-900">
          Class Details
        </h2>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field
            label="Class name"
            name="name"
            required
            defaultValue={classData?.name}
          />
          <Field
            label="Year group"
            name="year_group"
            required
            defaultValue={classData?.year_group}
          />
          <Field
            label="Room number"
            name="room_number"
            defaultValue={classData?.room_number ?? undefined}
          />
          {classData ? (
            <div>
              <p className="block text-sm font-medium text-gray-700">
                Academic year
              </p>
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
            <div>
              <label
                htmlFor="academic_year_id"
                className="block text-sm font-medium text-gray-700"
              >
                Academic year<span className="ml-0.5 text-red-500">*</span>
              </label>
              <select
                id="academic_year_id"
                name="academic_year_id"
                required
                defaultValue={defaultAcademicYearId ?? ''}
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
              >
                <option value="" disabled>
                  Select a year…
                </option>
                {years.map((y) => (
                  <option key={y.id} value={y.id}>
                    {y.code}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="sm:col-span-2">
            <label
              htmlFor="teacher_id"
              className="block text-sm font-medium text-gray-700"
            >
              Teacher<span className="ml-0.5 text-red-500">*</span>
            </label>
            <select
              id="teacher_id"
              name="teacher_id"
              required
              defaultValue={classData?.teacher_id ?? ''}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
            >
              <option value="">Select a teacher…</option>
              {teachers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.last_name}, {t.first_name}
                  {t.display_name ? ` (${t.display_name})` : ''}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* ── Students ──────────────────────────────────────────────────── */}
      <div className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-gray-200">
        <h2 className="mb-4 text-sm font-semibold text-gray-900">Students</h2>

        <div className="mb-3">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter students by name…"
            className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm placeholder:text-gray-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
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
      </div>

      {/* ── Actions ───────────────────────────────────────────────────── */}
      <div className="flex items-center gap-4">
        <button
          type="submit"
          disabled={isPending}
          className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700 disabled:pointer-events-none disabled:opacity-50"
        >
          {isPending ? 'Saving…' : submitLabel}
        </button>
        <Link
          href="/classes"
          className="text-sm font-medium text-gray-500 hover:text-gray-700"
        >
          Cancel
        </Link>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    </form>
  )
}

function Field({
  label,
  name,
  type = 'text',
  required = false,
  defaultValue,
  placeholder,
}: {
  label: string
  name: string
  type?: string
  required?: boolean
  defaultValue?: string
  placeholder?: string
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
        defaultValue={defaultValue}
        placeholder={placeholder}
        className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm placeholder:text-gray-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
      />
    </div>
  )
}
