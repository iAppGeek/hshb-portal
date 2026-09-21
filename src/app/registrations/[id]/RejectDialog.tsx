'use client'

import {
  Dialog,
  DialogBackdrop,
  DialogPanel,
  DialogTitle,
} from '@headlessui/react'

import { TextAreaField, useServerForm } from '@/components/form'

import { rejectRegistrationAction } from '../actions'

type Props = {
  submissionId: string
  onClose: () => void
}

export default function RejectDialog({ submissionId, onClose }: Props) {
  const { handleSubmit, isPending, error, fieldError } = useServerForm((fd) =>
    rejectRegistrationAction(submissionId, fd),
  )

  return (
    <Dialog open onClose={onClose} className="relative z-50">
      <DialogBackdrop className="fixed inset-0 bg-black/40" />
      <div className="fixed inset-0 flex w-screen items-center justify-center p-4">
        <DialogPanel className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
          <DialogTitle className="text-lg font-semibold text-gray-900">
            Reject registration
          </DialogTitle>

          <form onSubmit={handleSubmit} className="mt-4 space-y-4">
            <TextAreaField
              label="Reason"
              name="reason"
              required
              rows={3}
              error={fieldError('reason')}
            />

            {error && <p className="text-sm text-red-600">{error}</p>}

            <div className="flex items-center gap-3 pt-2">
              <button
                type="submit"
                disabled={isPending}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-red-700 disabled:pointer-events-none disabled:opacity-50"
              >
                {isPending ? 'Rejecting…' : 'Reject'}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-gray-700 ring-1 ring-gray-300 hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </form>
        </DialogPanel>
      </div>
    </Dialog>
  )
}
