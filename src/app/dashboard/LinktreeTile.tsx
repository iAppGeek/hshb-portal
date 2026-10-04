'use client'

import { useState } from 'react'
import { QrCodeIcon } from '@heroicons/react/24/outline'

import { useDialog } from '@/components/dialogs/useDialog'

type LinktreeDialogComponent = typeof import('./LinktreeDialog').default

// The dialog (with the QR library and Headless UI's Dialog) is its own chunk,
// fetched on hover or focus so it is usually ready by the time of the click.
const loadDialog = (): Promise<typeof import('./LinktreeDialog')> =>
  import('./LinktreeDialog')

/** Dashboard tile that opens LinktreeDialog for sharing with parents. */
export default function LinktreeTile({
  url,
}: {
  url: string
}): React.ReactElement {
  const dialog = useDialog()
  // Loaded by hand rather than with next/dynamic so a failed chunk fetch
  // (a stale tab after a deploy, flaky Wi-Fi) shows a retry message on the
  // tile instead of throwing to the error boundary and losing the dashboard.
  const [Dialog, setDialog] = useState<LinktreeDialogComponent | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)

  function prefetch(): void {
    // Best effort only: a failure here is reported when the tile is clicked.
    loadDialog().catch(() => undefined)
  }

  async function open(): Promise<void> {
    setLoadFailed(false)
    try {
      const { default: loaded } = await loadDialog()
      setDialog(() => loaded)
      dialog.open()
    } catch {
      setLoadFailed(true)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => void open()}
        onPointerEnter={prefetch}
        onFocus={prefetch}
        className="group flex items-center gap-3 rounded-xl bg-white p-4 text-left shadow-sm ring-1 ring-gray-200 transition hover:shadow-md sm:gap-4 sm:p-6"
      >
        <div className="rounded-lg bg-blue-50 p-3 transition group-hover:bg-blue-100">
          <QrCodeIcon className="h-6 w-6 text-blue-600" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-gray-500">Linktree</p>
          <p className="mt-0.5 text-base font-semibold text-gray-900">
            Share with parents
          </p>
          <p role="status" className="text-sm text-red-600 empty:hidden">
            {loadFailed &&
              "Couldn't open. Check your connection and try again."}
          </p>
        </div>
      </button>

      {dialog.isOpen && Dialog && <Dialog url={url} onClose={dialog.close} />}
    </>
  )
}
