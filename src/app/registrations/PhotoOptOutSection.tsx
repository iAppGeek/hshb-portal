'use client'

import { useState, useTransition } from 'react'

import type { PhotoOptOutRow, StudentMatch } from '@/db'
import Table from '@/components/grid/Table'
import TableCard from '@/components/grid/TableCard'
import Td from '@/components/grid/Td'
import Th from '@/components/grid/Th'
import Tooltip from '@/components/Tooltip'
import { formatDateInSchoolTz, formatDateTimeInSchoolTz } from '@/lib/datetime'
import { tbody, theadStacked } from '@/lib/grid/styles'
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
      <TableCard>
        <Table>
          <thead className={theadStacked}>
            <tr>
              <Th>Child</Th>
              <Th>DOB</Th>
              <Th>Declared by</Th>
              <Th>Submitted</Th>
              <Th>Status</Th>
              <Th meta={{ srOnlyHeader: true }}>Actions</Th>
            </tr>
          </thead>
          <tbody className={tbody}>
            {requests.map((r) => {
              const canAct = isAdmin && r.status === 'pending'
              return (
                <tr key={r.id} className="hover:bg-gray-50">
                  <Td mobile="hide-columns" meta={{ primary: true }}>
                    {r.child_last_name}, {r.child_first_name}
                  </Td>
                  <Td mobile="hide-columns" meta={{ mobile: 'hide' }}>
                    {formatDateInSchoolTz(r.date_of_birth)}
                  </Td>
                  <Td mobile="hide-columns" meta={{ mobile: 'hide' }}>
                    {r.declaration_name}
                  </Td>
                  <Td mobile="hide-columns" meta={{ mobile: 'hide' }}>
                    {formatDateTimeInSchoolTz(r.submitted_at)}
                  </Td>
                  <Td mobile="hide-columns">
                    <span
                      className={`inline-flex rounded-full px-2 py-1 text-xs font-medium capitalize ${STATUS_BADGE[r.status] ?? 'bg-gray-100 text-gray-800'}`}
                    >
                      {r.status}
                    </span>
                  </Td>
                  <Td mobile="hide-columns" meta={{ align: 'right' }}>
                    {canAct || isAdmin ? (
                      <div className="flex justify-end gap-3">
                        {canAct && (
                          <>
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
                          </>
                        )}
                        {isAdmin && (
                          <button
                            type="button"
                            onClick={() => setDeletingId(r.id)}
                            className="font-medium text-red-600 hover:text-red-800"
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    ) : (
                      <Tooltip text="Only admins can action opt-out requests">
                        <span className="cursor-not-allowed text-sm text-gray-400">
                          —
                        </span>
                      </Tooltip>
                    )}
                  </Td>
                </tr>
              )
            })}
          </tbody>
        </Table>
      </TableCard>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      {deletingId && (
        <div className="mt-3 rounded-lg bg-red-50 p-4">
          <p className="mb-3 text-sm text-red-800">
            {requests.find((r) => r.id === deletingId)?.status === 'actioned'
              ? "Delete this opt-out request permanently? The student's consent flag is not affected. This cannot be undone."
              : 'Delete this opt-out request permanently? This cannot be undone.'}
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
