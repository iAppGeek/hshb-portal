'use client'

import { useState } from 'react'

import type { StudentMatch } from '@/db'
import {
  DialogButtons,
  DialogFrame,
  StudentMatchList,
  initialStudentSelection,
  toStudentChoice,
} from '@/components/dialogs'
import {
  CheckboxField,
  SelectField,
  TextField,
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

/** MatchStudentDialog's student section plus class and guardian choices. */
export default function RegistrationApproveDialog({
  submissionId,
  matches,
  studentsForLinking,
  classes,
  hasGuardianMatches,
  onClose,
}: Props): React.ReactElement {
  const [selection, setSelection] = useState(() =>
    initialStudentSelection(matches, true),
  )
  const choice = toStudentChoice(selection)
  const { handleSubmit, isPending, error, fieldError } = useServerForm((fd) =>
    approveRegistrationAction(submissionId, fd),
  )

  const selectedExisting =
    choice?.mode === 'existing'
      ? studentsForLinking.find((s) => s.id === choice.studentId)
      : undefined

  return (
    <DialogFrame
      title="Approve & save student"
      size="lg"
      testId="registration-approve-dialog"
      onClose={onClose}
    >
      <form onSubmit={handleSubmit} className="mt-4 space-y-4">
        <input
          type="hidden"
          name="existing_student_id"
          value={choice?.mode === 'existing' ? choice.studentId : ''}
        />

        <StudentMatchList
          candidates={matches}
          students={studentsForLinking}
          allowNew
          value={selection}
          onChange={setSelection}
          existingNote="This overwrites the student's name, DOB, address, medical info and contacts with this submission."
        />

        {/* Remount so the default follows the linked student. */}
        <TextField
          key={selectedExisting?.id ?? 'new'}
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

        <DialogButtons
          confirmLabel="Approve"
          pendingLabel="Approving…"
          isPending={isPending}
          disabled={!choice}
          error={error}
          onCancel={onClose}
        />
      </form>
    </DialogFrame>
  )
}
