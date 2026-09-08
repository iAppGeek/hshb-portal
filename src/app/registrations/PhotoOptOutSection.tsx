'use client'

import { useState, useTransition } from 'react'

import type { PhotoOptOutRow, StudentMatch } from '@/db'
import Tooltip from '@/components/Tooltip'
import { formatDateInSchoolTz, formatDateTimeInSchoolTz } from '@/lib/datetime'
import { canApproveRegistrations } from '@/lib/permissions'
import type { StaffRole } from '@/types/next-auth'

import ApplyOptOutDialog from './ApplyOptOutDialog'
import RejectOptOutDialog from './RejectOptOutDialog'
import { deletePhotoOptOutAction } from './photo-opt-out-actions'

const STATUS_BADGE: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  actioned: 'bg-green-100 text-green-800',
  rejected: 'bg-red-100 text-red-800',
}

type Props = {
  requests: PhotoOptOutRow[]
  matchesByRequest: Record<string, StudentMatch[]>
  studentsForLinking: StudentMatch[]
  role: StaffRole
}

export default function PhotoOptOutSection({
  requests,
  matchesByRequest,
  studentsForLinking,
  role,
}: Props) {
  const [applyingId, setApplyingId] = useState<string | null>(null)
  const [rejectingId, setRejectingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const isAdmin = canApproveRegistrations(role)

  function handleDelete(id: string) {
    setError(null)
    startTransition(async () => {
      const result = await deletePhotoOptOutAction(id)
      if (result?.error) setError(result.error)
      else setDeletingId(null)
    })
  }

  if (requests.length === 0) return null

  return (
    <div className="mb-8">
      <h2 className="mb-3 text-lg font-semibold text-gray-900">
        Photo consent opt-outs
      </h2>
      <div className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-gray-200">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="hidden bg-gray-50 sm:table-header-group">
              <tr>
                <th className="px-3 py-3 text-left text-xs font-medium tracking-wide text-gray-500 uppercase sm:px-6">
                  Child
                </th>
                <th className="px-3 py-3 text-left text-xs font-medium tracking-wide text-gray-500 uppercase sm:px-6">
                  DOB
                </th>
                <th className="px-3 py-3 text-left text-xs font-medium tracking-wide text-gray-500 uppercase sm:px-6">
                  Declared by
                </th>
                <th className="px-3 py-3 text-left text-xs font-medium tracking-wide text-gray-500 uppercase sm:px-6">
                  Submitted
                </th>
                <th className="px-3 py-3 text-left text-xs font-medium tracking-wide text-gray-500 uppercase sm:px-6">
                  Status
                </th>
                <th className="relative px-3 py-3 sm:px-6">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {requests.map((r) => {
                const canAct = isAdmin && r.status === 'pending'
                return (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-4 py-4 text-sm font-medium text-gray-900 sm:px-6">
                      {r.child_last_name}, {r.child_first_name}
                    </td>
                    <td className="hidden px-3 py-4 text-sm text-gray-500 sm:table-cell sm:px-6">
                      {formatDateInSchoolTz(r.date_of_birth)}
                    </td>
                    <td className="hidden px-3 py-4 text-sm text-gray-500 sm:table-cell sm:px-6">
                      {r.declaration_name}
                    </td>
                    <td className="hidden px-3 py-4 text-sm text-gray-500 sm:table-cell sm:px-6">
                      {formatDateTimeInSchoolTz(r.submitted_at)}
                    </td>
                    <td className="px-4 py-4 text-sm sm:px-6">
                      <span
                        className={`inline-flex rounded-full px-2 py-1 text-xs font-medium capitalize ${STATUS_BADGE[r.status] ?? 'bg-gray-100 text-gray-800'}`}
                      >
                        {r.status}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-right text-sm sm:px-6">
                      {canAct ? (
                        <div className="flex justify-end gap-3">
                          <button
                            type="button"
                            onClick={() => setApplyingId(r.id)}
                            className="font-medium text-blue-600 hover:text-blue-800"
                          >
                            Match & apply
                          </button>
                          <button
                            type="button"
                            onClick={() => setRejectingId(r.id)}
                            className="font-medium text-gray-600 hover:text-gray-900"
                          >
                            Reject
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeletingId(r.id)}
                            className="font-medium text-red-600 hover:text-red-800"
                          >
                            Delete
                          </button>
                        </div>
                      ) : (
                        !isAdmin && (
                          <Tooltip text="Only admins can action opt-out requests">
                            <span className="cursor-not-allowed text-sm text-gray-400">
                              —
                            </span>
                          </Tooltip>
                        )
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      {deletingId && (
        <div className="mt-3 rounded-lg bg-red-50 p-4">
          <p className="mb-3 text-sm text-red-800">
            Delete this opt-out request permanently? This cannot be undone.
          </p>
          <div className="flex gap-3">
            <button
              type="button"
              disabled={isPending}
              onClick={() => handleDelete(deletingId)}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
            >
              {isPending ? 'Deleting…' : 'Confirm delete'}
            </button>
            <button
              type="button"
              onClick={() => setDeletingId(null)}
              className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-gray-700 ring-1 ring-gray-300 hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {applyingId && (
        <ApplyOptOutDialog
          requestId={applyingId}
          matches={matchesByRequest[applyingId] ?? []}
          studentsForLinking={studentsForLinking}
          onClose={() => setApplyingId(null)}
        />
      )}

      {rejectingId && (
        <RejectOptOutDialog
          requestId={rejectingId}
          onClose={() => setRejectingId(null)}
        />
      )}
    </div>
  )
}
