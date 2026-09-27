'use client'

import { useState } from 'react'

import type { StudentMatch } from '@/db'
import { useServerForm } from '@/components/form'
import type { ActionResult } from '@/lib/action'

import DialogFrame, { DialogButtons } from './DialogFrame'
import StudentMatchList, {
  initialStudentSelection,
  toStudentChoice,
  type StudentChoice,
} from './StudentMatchList'

type Props = {
  title: string
  description?: React.ReactNode
  confirmLabel: string
  pendingLabel: string
  candidates: StudentMatch[]
  students: StudentMatch[]
  /** False when the action can only apply to a student who already exists. */
  allowNew?: boolean
  onConfirm: (choice: StudentChoice) => Promise<ActionResult>
  onClose: () => void
}

export default function MatchStudentDialog({
  title,
  description,
  confirmLabel,
  pendingLabel,
  candidates,
  students,
  allowNew = true,
  onConfirm,
  onClose,
}: Props): React.ReactElement {
  const [selection, setSelection] = useState(() =>
    initialStudentSelection(candidates, allowNew),
  )
  const choice = toStudentChoice(selection)
  // The confirm button stays disabled until there is a choice to submit.
  const { handleSubmit, isPending, error } = useServerForm(async () =>
    choice ? onConfirm(choice) : undefined,
  )

  return (
    <DialogFrame
      title={title}
      description={description}
      size="lg"
      testId="match-student-dialog"
      onClose={onClose}
    >
      <form onSubmit={handleSubmit} className="mt-4 space-y-4">
        <StudentMatchList
          candidates={candidates}
          students={students}
          allowNew={allowNew}
          value={selection}
          onChange={setSelection}
        />
        <DialogButtons
          confirmLabel={confirmLabel}
          pendingLabel={pendingLabel}
          isPending={isPending}
          disabled={!choice}
          error={error}
          onCancel={onClose}
        />
      </form>
    </DialogFrame>
  )
}
