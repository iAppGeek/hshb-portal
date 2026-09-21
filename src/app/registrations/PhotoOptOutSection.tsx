'use client'

import type { PhotoOptOutRow, StudentMatch } from '@/db'
import {
  ConfirmDialog,
  MatchStudentDialog,
  ReasonDialog,
  useDialog,
} from '@/components/dialogs'
import Table from '@/components/grid/Table'
import TableCard from '@/components/grid/TableCard'
import Td from '@/components/grid/Td'
import Th from '@/components/grid/Th'
import Tooltip from '@/components/Tooltip'
import { formatDateInSchoolTz, formatDateTimeInSchoolTz } from '@/lib/datetime'
import { personName } from '@/lib/format'
import { tbody, theadStacked } from '@/lib/grid/styles'
import { canApproveRegistrations } from '@/lib/permissions'
import type { StaffRole } from '@/types/next-auth'

import {
  applyPhotoOptOutAction,
  deletePhotoOptOutAction,
  rejectPhotoOptOutAction,
} from './photo-opt-out-actions'

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
  const applyDialog = useDialog<PhotoOptOutRow>()
  const rejectDialog = useDialog<PhotoOptOutRow>()
  const deleteDialog = useDialog<PhotoOptOutRow>()

  const isAdmin = canApproveRegistrations(role)
  const applying = applyDialog.props
  const rejecting = rejectDialog.props
  const deleting = deleteDialog.props

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
                    {personName(
                      {
                        first_name: r.child_first_name,
                        last_name: r.child_last_name,
                      },
                      'lastFirst',
                    )}
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
                              onClick={() => applyDialog.open(r)}
                              className="font-medium text-blue-600 hover:text-blue-800"
                            >
                              Match & apply
                            </button>
                            <button
                              type="button"
                              onClick={() => rejectDialog.open(r)}
                              className="font-medium text-gray-600 hover:text-gray-900"
                            >
                              Reject
                            </button>
                          </>
                        )}
                        {isAdmin && (
                          <button
                            type="button"
                            onClick={() => deleteDialog.open(r)}
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

      {deleting && (
        <ConfirmDialog
          title="Delete opt-out request"
          body={
            deleting.status === 'actioned'
              ? "Delete this opt-out request permanently? The student's consent flag is not affected. This cannot be undone."
              : 'Delete this opt-out request permanently? This cannot be undone.'
          }
          confirmLabel="Confirm delete"
          pendingLabel="Deleting…"
          variant="danger"
          onConfirm={() => deletePhotoOptOutAction(deleting.id)}
          onClose={deleteDialog.close}
        />
      )}

      {applying && (
        <MatchStudentDialog
          title="Match to a student"
          description="Find the student this opt-out applies to. This will turn off photo & media consent for that student."
          confirmLabel="Apply opt-out"
          pendingLabel="Applying…"
          candidates={matchesByRequest[applying.id] ?? []}
          students={studentsForLinking}
          allowNew={false}
          onConfirm={(choice) =>
            applyPhotoOptOutAction(
              applying.id,
              choice.mode === 'existing' ? choice.studentId : '',
            )
          }
          onClose={applyDialog.close}
        />
      )}

      {rejecting && (
        <ReasonDialog
          title="Reject opt-out request"
          confirmLabel="Reject"
          pendingLabel="Rejecting…"
          onConfirm={(reason) => rejectPhotoOptOutAction(rejecting.id, reason)}
          onClose={rejectDialog.close}
        />
      )}
    </div>
  )
}
