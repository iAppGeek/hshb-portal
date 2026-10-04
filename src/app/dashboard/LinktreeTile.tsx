'use client'

import dynamic from 'next/dynamic'
import { QrCodeIcon } from '@heroicons/react/24/outline'

import { useDialog } from '@/components/dialogs/useDialog'

// The dialog (with the QR library and Headless UI's Dialog) is its own chunk,
// fetched on hover or focus so it is usually ready by the time of the click.
const loadDialog = (): Promise<typeof import('./LinktreeDialog')> =>
  import('./LinktreeDialog')
const LinktreeDialog = dynamic(loadDialog, { ssr: false })

/** Dashboard tile that opens LinktreeDialog for sharing with parents. */
export default function LinktreeTile({
  url,
}: {
  url: string
}): React.ReactElement {
  const dialog = useDialog()

  return (
    <>
      <button
        type="button"
        onClick={() => dialog.open()}
        onPointerEnter={() => void loadDialog()}
        onFocus={() => void loadDialog()}
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
        </div>
      </button>

      {dialog.isOpen && <LinktreeDialog url={url} onClose={dialog.close} />}
    </>
  )
}
