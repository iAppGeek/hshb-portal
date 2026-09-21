'use client'

import { useEffect, useRef, useState } from 'react'

import { personName } from '@/lib/format'

import FieldError from './FieldError'
import { input, inputInvalid, label, requiredMark } from './styles'

export type StudentSummary = {
  id: string
  first_name: string
  last_name: string
}

type Props = {
  students: StudentSummary[]
  onSelect: (id: string) => void
  error?: string
}

/**
 * Type-ahead picker over an in-memory student list. It holds no form value of
 * its own: the parent renders the hidden input and receives the id through
 * `onSelect` ('' when cleared). Errors link to `student_id-error`.
 */
export default function StudentSearch({
  students,
  onSelect,
  error,
}: Props): React.ReactElement {
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
    function handleClickOutside(e: MouseEvent): void {
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

  function select(student: StudentSummary): void {
    setSelected(student)
    onSelect(student.id)
    setSearch('')
    setOpen(false)
  }

  function clear(): void {
    setSelected(null)
    onSelect('')
    setSearch('')
  }

  return (
    <div ref={containerRef} className="relative">
      <label htmlFor="student_search" className={label}>
        Student<span className={requiredMark}>*</span>
      </label>

      {selected ? (
        <div className="mt-1 flex items-center gap-2 rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-sm">
          <span className="flex-1 text-gray-900">
            {personName(selected, 'lastFirst')}
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
            id="student_search"
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
            aria-describedby={error ? 'student_id-error' : undefined}
            className={`${input}${error ? ` ${inputInvalid}` : ''}`}
          />
          {open && filtered.length > 0 && (
            <ul className="absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg">
              {filtered.slice(0, 30).map((s) => (
                <li
                  key={s.id}
                  onMouseDown={() => select(s)}
                  className="cursor-pointer px-3 py-2 text-sm text-gray-900 hover:bg-blue-50"
                >
                  {personName(s, 'lastFirst')}
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
      <FieldError id="student_id-error" error={error} />
    </div>
  )
}
