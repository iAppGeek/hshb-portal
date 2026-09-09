'use client'

import { useState, useTransition } from 'react'
import {
  Dialog,
  DialogBackdrop,
  DialogPanel,
  DialogTitle,
} from '@headlessui/react'

import type { StudentMatch } from '@/db'

import { applyPhotoOptOutAction } from './photo-opt-out-actions'

type Props = {
  requestId: string
  matches: StudentMatch[]
  studentsForLinking: StudentMatch[]
  onClose: () => void
}

const SEARCH_MIN_LENGTH = 5
const SEARCH_MAX_RESULTS = 10

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

export default function ApplyOptOutDialog({
  requestId,
  matches,
  studentsForLinking,
  onClose,
}: Props) {
  const [studentId, setStudentId] = useState(matches[0]?.id ?? '')
  const [search, setSearch] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const selected = studentsForLinking.find((s) => s.id === studentId)
  const filtered = filterStudents(studentsForLinking, search)

  function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const form = e.currentTarget
    const fd = new FormData(form)
    startTransition(async () => {
      const result = await applyPhotoOptOutAction(requestId, fd)
      if (result?.error) setError(result.error)
    })
  }

  return (
    <Dialog open onClose={onClose} className="relative z-50">
      <DialogBackdrop className="fixed inset-0 bg-black/40" />
      <div className="fixed inset-0 flex w-screen items-center justify-center p-4">
        <DialogPanel className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl">
          <DialogTitle className="text-lg font-semibold text-gray-900">
            Match to a student
          </DialogTitle>
          <p className="mt-2 text-sm text-gray-600">
            Find the student this opt-out applies to. This will turn off photo &
            media consent for that student.
          </p>

          <form onSubmit={handleSubmit} className="mt-4 space-y-4">
            <input type="hidden" name="student_id" value={studentId} />

            {matches.length > 0 && (
              <div>
                <p className="mb-1 text-xs font-medium text-gray-500 uppercase">
                  Possible matches
                </p>
                <select
                  value={studentId}
                  onChange={(e) => setStudentId(e.target.value)}
                  className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                >
                  {matches.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.last_name}, {m.first_name}
                      {m.student_code ? ` (${m.student_code})` : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label
                htmlFor="opt_out_student_search"
                className="block text-xs font-medium text-gray-500 uppercase"
              >
                Search all students
              </label>
              <input
                id="opt_out_student_search"
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Type at least 5 characters…"
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm placeholder:text-gray-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
              />
              {filtered.length > 0 && (
                <ul className="mt-2 max-h-40 divide-y divide-gray-100 overflow-y-auto rounded-lg border border-gray-200">
                  {filtered.map((s) => (
                    <li key={s.id}>
                      <button
                        type="button"
                        onClick={() => setStudentId(s.id)}
                        className={`block w-full px-3 py-2 text-left text-sm hover:bg-gray-50 ${
                          studentId === s.id
                            ? 'bg-blue-50 text-blue-700'
                            : 'text-gray-700'
                        }`}
                      >
                        {s.last_name}, {s.first_name}
                        {s.student_code ? ` (${s.student_code})` : ''}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {selected && (
              <p className="text-sm text-gray-600">
                Selected: {selected.last_name}, {selected.first_name}
              </p>
            )}

            {error && <p className="text-sm text-red-600">{error}</p>}

            <div className="flex items-center gap-3 pt-2">
              <button
                type="submit"
                disabled={isPending || !studentId}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:pointer-events-none disabled:opacity-50"
              >
                {isPending ? 'Applying…' : 'Apply opt-out'}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-gray-700 ring-1 ring-gray-300 hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </form>
        </DialogPanel>
      </div>
    </Dialog>
  )
}
