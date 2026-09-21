'use client'

import { useState } from 'react'
import {
  Dialog,
  DialogBackdrop,
  DialogPanel,
  DialogTitle,
} from '@headlessui/react'

import type { StudentMatch } from '@/db'
import {
  CheckboxField,
  RadioGroup,
  SelectField,
  TextField,
  formStyles,
  useServerForm,
} from '@/components/form'

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
  const { handleSubmit, isPending, error, fieldError } = useServerForm((fd) =>
    approveRegistrationAction(submissionId, fd),
  )

  const selectedExisting = studentsForLinking.find(
    (s) => s.id === existingStudentId,
  )
  const filtered = filterStudents(studentsForLinking, search)

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

            <RadioGroup
              name="approve_mode"
              legend="Student record"
              value={mode}
              onChange={(v) => setMode(v as 'create' | 'link')}
              options={[
                { value: 'create', label: 'Create new student' },
                { value: 'link', label: 'Link to existing student' },
              ]}
            />

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
                      className={formStyles.input}
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
                    className={formStyles.input}
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

            <TextField
              label="Student code"
              name="student_code"
              defaultValue={selectedExisting?.student_code}
              error={fieldError('student_code')}
            />

            <SelectField
              label="Class"
              name="class_id"
              placeholder="No class"
              options={classes.map((c) => ({
                value: c.id,
                label: `${c.name} (Year ${c.year_group})`,
              }))}
              error={fieldError('class_id')}
            />

            <CheckboxField
              label="Reuse matching guardian records (updates their phone and address from this submission)"
              name="reuse_guardians"
              defaultChecked
              description={
                !hasGuardianMatches
                  ? 'No existing guardians match this submission.'
                  : undefined
              }
            />

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
