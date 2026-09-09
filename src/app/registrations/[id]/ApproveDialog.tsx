'use client'

import { useState, useTransition } from 'react'
import {
  Dialog,
  DialogBackdrop,
  DialogPanel,
  DialogTitle,
} from '@headlessui/react'

import type { StudentMatch } from '@/db'

import { approveRegistrationAction } from '../actions'

type ClassOption = { id: string; name: string; year_group: string }

type Props = {
  submissionId: string
  matches: StudentMatch[]
  studentsForLinking: StudentMatch[]
  classes: ClassOption[]
  hasGuardianMatches: boolean
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

export default function ApproveDialog({
  submissionId,
  matches,
  studentsForLinking,
  classes,
  hasGuardianMatches,
  onClose,
}: Props) {
  const [mode, setMode] = useState<'create' | 'link'>('create')
  const [existingStudentId, setExistingStudentId] = useState(
    matches[0]?.id ?? '',
  )
  const [search, setSearch] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const selectedExisting = studentsForLinking.find(
    (s) => s.id === existingStudentId,
  )
  const filtered = filterStudents(studentsForLinking, search)

  function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const form = e.currentTarget
    startTransition(async () => {
      const result = await approveRegistrationAction(
        submissionId,
        new FormData(form),
      )
      if (result?.error) setError(result.error)
    })
  }

  return (
    <Dialog open onClose={onClose} className="relative z-50">
      <DialogBackdrop className="fixed inset-0 bg-black/40" />
      <div className="fixed inset-0 flex w-screen items-center justify-center p-4">
        <DialogPanel className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl">
          <DialogTitle className="text-lg font-semibold text-gray-900">
            Approve & save student
          </DialogTitle>

          <form onSubmit={handleSubmit} className="mt-4 space-y-4">
            <input
              type="hidden"
              name="existing_student_id"
              value={mode === 'link' ? existingStudentId : ''}
            />

            <div className="flex gap-4">
              <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-700">
                <input
                  type="radio"
                  checked={mode === 'create'}
                  onChange={() => setMode('create')}
                  className="text-blue-600 focus:ring-blue-500"
                />
                Create new student
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-700">
                <input
                  type="radio"
                  checked={mode === 'link'}
                  onChange={() => setMode('link')}
                  className="text-blue-600 focus:ring-blue-500"
                />
                Link to existing student
              </label>
            </div>

            {mode === 'link' && (
              <div className="space-y-3 rounded-lg bg-gray-50 p-3">
                <p className="text-xs text-yellow-800">
                  This overwrites the student&apos;s name, DOB, address, medical
                  info and contacts with this submission.
                </p>

                {matches.length > 0 && (
                  <div>
                    <p className="mb-1 text-xs font-medium text-gray-500 uppercase">
                      Possible matches
                    </p>
                    <select
                      value={existingStudentId}
                      onChange={(e) => setExistingStudentId(e.target.value)}
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
                    htmlFor="approve_student_search"
                    className="block text-xs font-medium text-gray-500 uppercase"
                  >
                    Search all students
                  </label>
                  <input
                    id="approve_student_search"
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
                            onClick={() => setExistingStudentId(s.id)}
                            className={`block w-full px-3 py-2 text-left text-sm hover:bg-gray-50 ${
                              existingStudentId === s.id
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

                {selectedExisting && (
                  <p className="text-sm text-gray-600">
                    Selected: {selectedExisting.last_name},{' '}
                    {selectedExisting.first_name}
                  </p>
                )}
              </div>
            )}

            <div>
              <label
                htmlFor="approve_student_code"
                className="block text-sm font-medium text-gray-700"
              >
                Student code
              </label>
              <input
                id="approve_student_code"
                name="student_code"
                type="text"
                defaultValue={selectedExisting?.student_code ?? ''}
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
              />
            </div>

            <div>
              <label
                htmlFor="approve_class_id"
                className="block text-sm font-medium text-gray-700"
              >
                Class
              </label>
              <select
                id="approve_class_id"
                name="class_id"
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
              >
                <option value="">No class</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} (Year {c.year_group})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="flex cursor-pointer items-start gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  name="reuse_guardians"
                  defaultChecked
                  className="mt-0.5 rounded text-blue-600 focus:ring-blue-500"
                />
                Reuse matching guardian records (updates their phone and address
                from this submission)
              </label>
              {!hasGuardianMatches && (
                <p className="mt-1 text-xs text-gray-400">
                  No existing guardians match this submission.
                </p>
              )}
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <div className="flex items-center gap-3 pt-2">
              <button
                type="submit"
                disabled={isPending || (mode === 'link' && !existingStudentId)}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:pointer-events-none disabled:opacity-50"
              >
                {isPending ? 'Approving…' : 'Approve'}
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
