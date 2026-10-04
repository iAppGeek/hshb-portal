'use client'

import { ConfirmDialog, useDialog } from '@/components/dialogs'

import { withdrawPhotoVideoConsentAction } from '../../actions'

/** For admins, when a parent asks the office to withdraw photo/video consent. */
export default function WithdrawPhotoConsentButton({
  studentId,
}: {
  studentId: string
}): React.ReactElement {
  const dialog = useDialog()

  return (
    <>
      <button
        type="button"
        onClick={() => dialog.open()}
        className="rounded-lg border border-red-300 bg-white px-3 py-1.5 text-sm font-medium text-red-700 shadow-sm transition hover:bg-red-50"
      >
        Withdraw photo consent
      </button>
      {dialog.isOpen && (
        <ConfirmDialog
          title="Withdraw photo consent"
          body="Record that the parent has withdrawn consent for photos and video of this child? Your name and the time will be kept with the record."
          confirmLabel="Withdraw consent"
          pendingLabel="Withdrawing…"
          variant="danger"
          onConfirm={() => withdrawPhotoVideoConsentAction(studentId)}
          onClose={dialog.close}
        />
      )}
    </>
  )
}
