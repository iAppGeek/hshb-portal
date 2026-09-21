'use client'

import {
  Dialog,
  DialogBackdrop,
  DialogPanel,
  DialogTitle,
} from '@headlessui/react'
import clsx from 'clsx'

type DialogFrameProps = {
  title: string
  description?: React.ReactNode
  /** `lg` for dialogs with a student picker. */
  size?: 'md' | 'lg'
  testId: string
  onClose: () => void
  children: React.ReactNode
}

/** The Headless UI modal every review dialog renders inside. */
export default function DialogFrame({
  title,
  description,
  size = 'md',
  testId,
  onClose,
  children,
}: DialogFrameProps): React.ReactElement {
  return (
    <Dialog open onClose={onClose} className="relative z-50">
      <DialogBackdrop className="fixed inset-0 bg-black/40" />
      <div className="fixed inset-0 flex w-screen items-center justify-center p-4">
        <DialogPanel
          data-testid={testId}
          className={clsx(
            'w-full rounded-xl bg-white p-6 shadow-xl',
            size === 'lg' ? 'max-w-lg' : 'max-w-md',
          )}
        >
          <DialogTitle className="text-lg font-semibold text-gray-900">
            {title}
          </DialogTitle>
          {description && (
            <p className="mt-2 text-sm text-gray-600">{description}</p>
          )}
          {children}
        </DialogPanel>
      </div>
    </Dialog>
  )
}

type DialogButtonsProps = {
  confirmLabel: string
  pendingLabel: string
  variant?: 'danger' | 'primary'
  isPending: boolean
  /** Disables confirm for reasons other than a pending save. */
  disabled?: boolean
  error: string | null
  onCancel: () => void
}

/** Inline error, then the confirm (submit) and Cancel buttons. */
export function DialogButtons({
  confirmLabel,
  pendingLabel,
  variant = 'primary',
  isPending,
  disabled = false,
  error,
  onCancel,
}: DialogButtonsProps): React.ReactElement {
  return (
    <>
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}

      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={isPending || disabled}
          className={clsx(
            'rounded-lg px-4 py-2 text-sm font-medium text-white shadow-sm disabled:pointer-events-none disabled:opacity-50',
            variant === 'danger'
              ? 'bg-red-600 hover:bg-red-700'
              : 'bg-blue-600 hover:bg-blue-700',
          )}
        >
          {isPending ? pendingLabel : confirmLabel}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-gray-700 ring-1 ring-gray-300 hover:bg-gray-50"
        >
          Cancel
        </button>
      </div>
    </>
  )
}
