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
          error={error}
          onCancel={onClose}
        />
      </form>
    </DialogFrame>
  )
}
