'use client'

import { useId, useState } from 'react'

import type { StudentMatch } from '@/db'
import { RadioGroup, formStyles } from '@/components/form'
import { personName } from '@/lib/format'

export type StudentChoice =
  { mode: 'existing'; studentId: string } | { mode: 'new' }

/** The picker's raw state; `studentId` survives toggling back to "new". */
export type StudentSelection = { mode: 'new' | 'existing'; studentId: string }

const SEARCH_MIN_LENGTH = 5
const SEARCH_MAX_RESULTS = 10

export function initialStudentSelection(
  candidates: StudentMatch[],
  allowNew: boolean,
): StudentSelection {
  return {
    mode: allowNew ? 'new' : 'existing',
    studentId: candidates[0]?.id ?? '',
  }
}

/** Null while "existing" is chosen but no student is selected yet. */
export function toStudentChoice(
  selection: StudentSelection,
): StudentChoice | null {
  if (selection.mode === 'new') return { mode: 'new' }
  return selection.studentId
    ? { mode: 'existing', studentId: selection.studentId }
    : null
}

function filterStudents(
  students: StudentMatch[],
  query: string,
): StudentMatch[] {
  const trimmed = query.trim()
  if (trimmed.length < SEARCH_MIN_LENGTH) return []
  const tokens = trimmed.toLowerCase().split(/\s+/)
  return students
    .filter((s) => {
      const haystack = `${s.first_name} ${s.last_name}`.toLowerCase()
      return tokens.every((t) => haystack.includes(t))
    })
    .slice(0, SEARCH_MAX_RESULTS)
}

function studentLabel(s: StudentMatch): string {
  return `${personName(s, 'lastFirst')}${s.student_code ? ` (${s.student_code})` : ''}`
}

type Props = {
  /** Likely matches from `findStudentMatches`, offered first. */
  candidates: StudentMatch[]
  /** Everyone the search box can find. */
  students: StudentMatch[]
  /** Offer "Create new student" alongside linking to an existing one. */
  allowNew: boolean
  value: StudentSelection
  onChange: (value: StudentSelection) => void
  /** Shown above the picker while linking to an existing student. */
  existingNote?: React.ReactNode
}

/** The student section of MatchStudentDialog, shared with registration approval. */
export default function StudentMatchList({
  candidates,
  students,
  allowNew,
  value,
  onChange,
  existingNote,
}: Props): React.ReactElement {
  const [search, setSearch] = useState('')
  const searchId = useId()

  const selected = students.find((s) => s.id === value.studentId)
  const filtered = filterStudents(students, search)
  const select = (studentId: string): void => onChange({ ...value, studentId })

  const picker = (
    <>
      {existingNote && (
        <p className="text-xs text-yellow-800">{existingNote}</p>
      )}

      {candidates.length > 0 && (
        <div>
          <p className="mb-1 text-xs font-medium text-gray-500 uppercase">
            Possible matches
          </p>
          <select
            aria-label="Possible matches"
            value={value.studentId}
            onChange={(e) => select(e.target.value)}
            className={formStyles.input}
          >
            {candidates.map((m) => (
              <option key={m.id} value={m.id}>
                {studentLabel(m)}
              </option>
            ))}
          </select>
        </div>
      )}

      <div>
        <label
          htmlFor={searchId}
          className="block text-xs font-medium text-gray-500 uppercase"
        >
          Search all students
        </label>
        <input
          id={searchId}
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Type at least 5 characters…"
          className={formStyles.input}
        />
        {filtered.length > 0 && (
          <ul className="mt-2 max-h-40 divide-y divide-gray-100 overflow-y-auto rounded-lg border border-gray-200">
            {filtered.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => select(s.id)}
                  className={`block w-full px-3 py-2 text-left text-sm hover:bg-gray-50 ${
                    value.studentId === s.id
                      ? 'bg-blue-50 text-blue-700'
                      : 'text-gray-700'
                  }`}
                >
                  {studentLabel(s)}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {selected && (
        <p className="text-sm text-gray-600">
          Selected: {personName(selected, 'lastFirst')}
        </p>
      )}
    </>
  )

  if (!allowNew) return <div className="space-y-4">{picker}</div>

  return (
    <div className="space-y-4">
      <RadioGroup
        name="student_choice"
        legend="Student record"
        value={value.mode}
        onChange={(mode) =>
          onChange({ ...value, mode: mode === 'existing' ? 'existing' : 'new' })
        }
        options={[
          { value: 'new', label: 'Create new student' },
          { value: 'existing', label: 'Link to existing student' },
        ]}
      />
      {value.mode === 'existing' && (
        <div className="space-y-3 rounded-lg bg-gray-50 p-3">{picker}</div>
      )}
    </div>
  )
}
