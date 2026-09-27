'use client'

import type { PhotoOptOutRow, StudentMatch } from '@/db'
import DefinitionList from '@/components/DefinitionList'
import PermissionedButton from '@/components/PermissionedButton'
import {
  ConfirmDialog,
  MatchStudentDialog,
  ReasonDialog,
  useDialog,
} from '@/components/dialogs'
import { formatDateInSchoolTz, formatDateTimeInSchoolTz } from '@/lib/datetime'
import { personName } from '@/lib/format'
import { canApproveRegistrations } from '@/lib/permissions'
import type { StaffRole } from '@/types/next-auth'

import PageHeader from '../../../_components/PageHeader'
import {
  applyPhotoOptOutAction,
  deletePhotoOptOutAction,
  rejectPhotoOptOutAction,
} from '../../actions'
import { OPT_OUTS_PATH } from '../../paths'
import { workflowItems } from '../../workflowItems'

type Props = {
  request: PhotoOptOutRow
  role: StaffRole
  matches: StudentMatch[]
  studentsForLinking: StudentMatch[]
}

const ADMIN_ONLY = 'Only admins can action opt-out requests'

export default function PhotoOptOutReview({
  request,
  role,
  matches,
  studentsForLinking,
}: Props): React.ReactElement {
  const applyDialog = useDialog()
  const rejectDialog = useDialog()
  const deleteDialog = useDialog()

  const isAdmin = canApproveRegistrations(role)
  const canAct = isAdmin && request.status === 'pending'

  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader
        title={personName(
          {
            first_name: request.child_first_name,
            last_name: request.child_last_name,
          },
          'lastFirst',
        )}
        subtitle={`Submitted ${formatDateTimeInSchoolTz(request.submitted_at)}`}
        backHref={OPT_OUTS_PATH}
        backLabel="Photo opt-outs"
      />

      <DefinitionList
        title="Child"
        items={[
          { label: 'First name', value: request.child_first_name },
          { label: 'Last name', value: request.child_last_name },
          {
            label: 'Date of birth',
            value: formatDateInSchoolTz(request.date_of_birth),
          },
        ]}
      />

      <DefinitionList
        title="Request"
        items={[
          { label: 'Declared by', value: request.declaration_name },
          { label: 'Notes', value: request.notes ?? '—' },
        ]}
      />

      <DefinitionList title="Workflow" items={workflowItems(request)} />

      <div className="flex flex-wrap items-center gap-3">
        <PermissionedButton
          allowed={canAct}
          showDisabled={!isAdmin}
          disabledReason={ADMIN_ONLY}
          onClick={() => applyDialog.open()}
          className="bg-blue-600 text-white hover:bg-blue-700"
        >
          Match & apply
        </PermissionedButton>
        <PermissionedButton
          allowed={canAct}
          showDisabled={!isAdmin}
          disabledReason={ADMIN_ONLY}
          onClick={() => rejectDialog.open()}
          className="bg-white text-gray-700 ring-1 ring-gray-300 hover:bg-gray-50"
        >
          Reject
        </PermissionedButton>
        <PermissionedButton
          allowed={isAdmin}
          showDisabled={!isAdmin}
          disabledReason={ADMIN_ONLY}
          onClick={() => deleteDialog.open()}
          className="bg-white text-red-600 ring-1 ring-gray-300 hover:bg-red-50"
        >
          Delete
        </PermissionedButton>
      </div>

      {applyDialog.isOpen && (
        <MatchStudentDialog
          title="Match to a student"
          description="Find the student this opt-out applies to. This will turn off photo & media consent for that student."
          confirmLabel="Apply opt-out"
          pendingLabel="Applying…"
          candidates={matches}
          students={studentsForLinking}
          allowNew={false}
          onConfirm={(choice) =>
            applyPhotoOptOutAction(
              request.id,
              choice.mode === 'existing' ? choice.studentId : '',
            )
          }
          onClose={applyDialog.close}
        />
      )}

      {rejectDialog.isOpen && (
        <ReasonDialog
          title="Reject opt-out request"
          confirmLabel="Reject"
          pendingLabel="Rejecting…"
          onConfirm={(reason) => rejectPhotoOptOutAction(request.id, reason)}
          onClose={rejectDialog.close}
        />
      )}

      {deleteDialog.isOpen && (
        <ConfirmDialog
          title="Delete opt-out request"
          body={
            request.status === 'actioned'
              ? "Delete this opt-out request permanently? The student's consent flag is not affected. This cannot be undone."
              : 'Delete this opt-out request permanently? This cannot be undone.'
          }
          confirmLabel="Confirm delete"
          pendingLabel="Deleting…"
          variant="danger"
          onConfirm={() => deletePhotoOptOutAction(request.id)}
          onClose={deleteDialog.close}
        />
      )}
    </div>
  )
}
