'use client'

import { TextAreaField, useServerForm } from '@/components/form'
import type { ActionResult } from '@/lib/action'

import type { ConfirmDialogProps } from './ConfirmDialog'
import DialogFrame, { DialogButtons } from './DialogFrame'

export type ReasonDialogProps = Omit<ConfirmDialogProps, 'onConfirm'> & {
  reasonLabel?: string
  onConfirm: (reason: string) => Promise<ActionResult>
}

/**
 * ConfirmDialog with a required reason. `required` is the only client check;
 * the action's `rejectReasonSchema` reports anything else as a field error.
 */
export default function ReasonDialog({
  title,
  body,
  confirmLabel,
  pendingLabel,
  variant = 'danger',
  reasonLabel = 'Reason',
  onConfirm,
  onClose,
}: ReasonDialogProps): React.ReactElement {
  const { handleSubmit, isPending, error, fieldError } = useServerForm((fd) =>
    onConfirm(String(fd.get('reason') ?? '')),
  )

  return (
    <DialogFrame
      title={title}
      description={body}
      testId="reason-dialog"
      onClose={onClose}
    >
      <form onSubmit={handleSubmit} className="mt-4 space-y-4">
        <TextAreaField
          label={reasonLabel}
          name="reason"
          required
          rows={3}
          error={fieldError('reason')}
        />
        <DialogButtons
          confirmLabel={confirmLabel}
          pendingLabel={pendingLabel}
          variant={variant}
          isPending={isPending}
          error={error}
          onCancel={onClose}
        />
      </form>
    </DialogFrame>
  )
}
