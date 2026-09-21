'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

import { LEAVING_REASONS, LEAVING_REASON_LABELS } from '@/lib/schemas'
import type { ActionResult } from '@/lib/action'
import {
  FieldError,
  FormGrid,
  FormSection,
  TextField,
  formStyles,
  useServerForm,
} from '@/components/form'

export type MigrationYear = { id: string; code: string }

export type MigrationClass = {
  id: string
  name: string
  yearCode: string
}

export type MigrationTeacher = {
  id: string
  first_name: string
  last_name: string
  display_name: string | null
}

export type MigrationStudent = {
  id: string
  first_name: string
  last_name: string
}

type Props = {
  /** Years after the selected source class's year — empty until a source is chosen. */
  years: MigrationYear[]
  targetYearId: string | undefined
  classes: MigrationClass[]
  teachers: MigrationTeacher[]
  sourceClassId: string | null
  students: MigrationStudent[]
  action: (formData: FormData) => Promise<ActionResult>
  baseUrl: string
}

const ACTION_LABELS: Record<string, string> = {
  move: 'Move to new class',
  none: 'No class',
  ...Object.fromEntries(
    LEAVING_REASONS.map((r) => [r, `Leaver – ${LEAVING_REASON_LABELS[r]}`]),
  ),
}

export default function ClassMigrationForm({
  years,
  targetYearId,
  classes,
  teachers,
  sourceClassId,
  students,
  action,
  baseUrl,
}: Props): React.ReactElement {
  const router = useRouter()
  const canCreateNewClass = years.length > 0
  const [createNewClass, setCreateNewClass] = useState(canCreateNewClass)
  const { handleSubmit, isPending, error, fieldError } = useServerForm(action)

  function buildUrl(next: {
    sourceClassId?: string | null
    targetYearId?: string | null
  }): string {
    const params = new URLSearchParams()
    const src =
      next.sourceClassId !== undefined ? next.sourceClassId : sourceClassId
    const tgt =
      next.targetYearId !== undefined ? next.targetYearId : targetYearId
    if (src) params.set('sourceClassId', src)
    if (tgt) params.set('targetYearId', tgt)
    const qs = params.toString()
    return qs ? `${baseUrl}&${qs}` : baseUrl
  }

  function handleSourceChange(e: React.ChangeEvent<HTMLSelectElement>): void {
    const value = e.target.value || null
    // Clearing the source leaves no year to validate a target year against.
    router.push(
      buildUrl({
        sourceClassId: value,
        targetYearId: value ? undefined : null,
      }),
    )
  }

  function handleTargetYearChange(
    e: React.ChangeEvent<HTMLSelectElement>,
  ): void {
    router.push(buildUrl({ targetYearId: e.target.value }))
  }

  function handleCreateNewClassToggle(checked: boolean): void {
    setCreateNewClass(checked)
    router.push(
      buildUrl({ targetYearId: checked ? (years[0]?.id ?? null) : null }),
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <input
        type="hidden"
        name="create_new_class"
        value={createNewClass ? 'true' : 'false'}
      />

      <p className="text-sm text-gray-500">
        Migrating completes this class straight away: its register can no longer
        be taken or edited. To move students on, create the new academic year
        first, then link that year&apos;s fee plans to the new class in Finance
        before making the year current.
      </p>

      {/* ── Section 1: Source Class ───────────────────────────────────── */}
      <FormSection title="Class to migrate">
        <div>
          <label htmlFor="source_class_select" className={formStyles.label}>
            Class to migrate<span className={formStyles.requiredMark}>*</span>
          </label>
          <select
            id="source_class_select"
            value={sourceClassId ?? ''}
            onChange={handleSourceChange}
            className={formStyles.input}
          >
            <option value="">Select a class…</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.yearCode})
              </option>
            ))}
          </select>
          {classes.length === 0 && (
            <p className={formStyles.hint}>
              No active classes available to migrate.
            </p>
          )}
        </div>

        {sourceClassId && (
          <>
            <input type="hidden" name="source_class_id" value={sourceClassId} />
            <div className="mt-4">
              <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
                <input
                  type="checkbox"
                  checked={createNewClass}
                  disabled={!canCreateNewClass}
                  onChange={(e) => handleCreateNewClassToggle(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 disabled:opacity-50"
                />
                Create a new class for these students
              </label>
              {!canCreateNewClass && (
                <p className={formStyles.hint}>
                  Create the next academic year first to move students into a
                  new class.
                </p>
              )}
            </div>

            <div className="mt-4">
              <p className="mb-2 text-sm font-medium text-gray-700">
                Students in this class ({students.length})
              </p>
              {students.length === 0 ? (
                <p className="text-sm text-gray-400">No students enrolled.</p>
              ) : (
                <ul
                  key={createNewClass ? 'create' : 'no-create'}
                  data-testid="student-list"
                  className="divide-y divide-gray-100 rounded-lg border border-gray-200"
                >
                  {students.map((s) => (
                    <li
                      key={s.id}
                      className="flex items-center justify-between gap-4 px-4 py-2 text-sm text-gray-700"
                    >
                      <span>
                        {s.last_name}, {s.first_name}
                      </span>
                      <select
                        name={`action_${s.id}`}
                        defaultValue={createNewClass ? 'move' : 'none'}
                        className="rounded-lg border border-gray-300 px-2 py-1 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                      >
                        {createNewClass && (
                          <option value="move">{ACTION_LABELS.move}</option>
                        )}
                        <option value="none">{ACTION_LABELS.none}</option>
                        {LEAVING_REASONS.map((reason) => (
                          <option key={reason} value={reason}>
                            {ACTION_LABELS[reason]}
                          </option>
                        ))}
                      </select>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </FormSection>

      {/* ── Section 2: New Class Details ─────────────────────────────── */}
      {sourceClassId && createNewClass && (
        <FormSection title="New Class Details">
          <div className="mb-4">
            <label htmlFor="target_year_select" className={formStyles.label}>
              Academic year<span className={formStyles.requiredMark}>*</span>
            </label>
            <select
              id="target_year_select"
              name="academic_year_id"
              value={targetYearId ?? ''}
              onChange={handleTargetYearChange}
              className={formStyles.input}
            >
              {years.map((y) => (
                <option key={y.id} value={y.id}>
                  {y.code}
                </option>
              ))}
            </select>
          </div>

          <FormGrid>
            <TextField
              label="Class name"
              name="name"
              required
              error={fieldError('name')}
            />
            <TextField
              label="Year group"
              name="year_group"
              required
              error={fieldError('year_group')}
            />
            <TextField
              label="Room number"
              name="room_number"
              error={fieldError('room_number')}
            />
            <div className="sm:col-span-2">
              <label htmlFor="teacher_id" className={formStyles.label}>
                Teacher<span className={formStyles.requiredMark}>*</span>
              </label>
              <select
                id="teacher_id"
                name="teacher_id"
                required
                aria-invalid={fieldError('teacher_id') ? true : undefined}
                aria-describedby={
                  fieldError('teacher_id') ? 'teacher_id-error' : undefined
                }
                className={`${formStyles.input}${fieldError('teacher_id') ? ` ${formStyles.inputInvalid}` : ''}`}
              >
                <option value="">Select a teacher…</option>
                {teachers.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.last_name}, {t.first_name}
                    {t.display_name ? ` (${t.display_name})` : ''}
                  </option>
                ))}
              </select>
              <FieldError
                id="teacher_id-error"
                error={fieldError('teacher_id')}
              />
            </div>
          </FormGrid>
        </FormSection>
      )}

      {/* ── Actions ──────────────────────────────────────────────────── */}
      <div className="flex items-center gap-4">
        <button
          type="submit"
          disabled={isPending || !sourceClassId}
          className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700 disabled:pointer-events-none disabled:opacity-50"
        >
          {isPending ? 'Migrating…' : 'Migrate Class'}
        </button>
        <Link
          href="/classes"
          className="text-sm font-medium text-gray-500 hover:text-gray-700"
        >
          Cancel
        </Link>
        {error && (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}
      </div>
    </form>
  )
}
