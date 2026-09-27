'use client'

import { useServerForm } from '@/components/form'
import type { ActionResult } from '@/lib/action'

import DialogFrame, { DialogButtons } from './DialogFrame'

export type ConfirmDialogProps = {
  title: string
  body?: React.ReactNode
  confirmLabel: string
  pendingLabel: string
  variant?: 'danger' | 'primary'
  onConfirm: () => Promise<ActionResult>
  onClose: () => void
}

/**
 * A dialog with nothing to fill in, so Headless UI would otherwise land the
 * initial focus on the confirm button — `autoFocusCancel` keeps a destructive
 * confirm off the Enter key.
 */
export default function ConfirmDialog({
  title,
  body,
  confirmLabel,
  pendingLabel,
  variant = 'primary',
  onConfirm,
  onClose,
}: ConfirmDialogProps): React.ReactElement {
  const { handleSubmit, isPending, error } = useServerForm(() => onConfirm())

  return (
    <DialogFrame
      title={title}
      description={body}
      testId="confirm-dialog"
      onClose={onClose}
    >
      <form onSubmit={handleSubmit} className="mt-4 space-y-4">
        <DialogButtons
          confirmLabel={confirmLabel}
          pendingLabel={pendingLabel}
          variant={variant}
          isPending={isPending}
          autoFocusCancel
          error={error}
          onCancel={onClose}
        />
      </form>
    </DialogFrame>
  )
}
