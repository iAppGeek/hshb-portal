'use client'

import { useState } from 'react'
import { ArrowTopRightOnSquareIcon } from '@heroicons/react/24/outline'
import { QRCodeSVG } from 'qrcode.react'

import { DialogFrame } from '@/components/dialogs'

/**
 * Shares the website linktree with a parent in person: a QR code to scan, the
 * URL to copy, and a link to open it in a new tab. LinktreeTile lazy-loads
 * this, so the QR library is only downloaded when someone opens it.
 */
export default function LinktreeDialog({
  url,
  onClose,
}: {
  url: string
  onClose: () => void
}): React.ReactElement {
  const [copied, setCopied] = useState(false)
  const [copyError, setCopyError] = useState(false)

  async function copy(): Promise<void> {
    setCopyError(false)
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopyError(true)
    }
  }

  return (
    <DialogFrame
      title="Share the Linktree"
      description="Ask the parent to scan the QR code with their phone camera."
      testId="linktree-dialog"
      onClose={onClose}
    >
      <div className="mt-4 flex justify-center">
        <QRCodeSVG
          value={url}
          size={224}
          level="M"
          marginSize={4}
          title="QR code for the Linktree"
          role="img"
        />
      </div>

      <p className="mt-4 rounded-lg bg-gray-50 px-3 py-2 text-center font-mono text-sm break-all text-gray-800">
        {url}
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={copy}
          className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm transition hover:bg-gray-50"
        >
          {copied ? 'Copied' : copyError ? 'Copy failed' : 'Copy link'}
        </button>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700"
        >
          Open Linktree
          <ArrowTopRightOnSquareIcon aria-hidden="true" className="h-4 w-4" />
        </a>
        <button
          type="button"
          onClick={onClose}
          className="ml-auto rounded-lg bg-white px-4 py-2 text-sm font-medium text-gray-700 ring-1 ring-gray-300 hover:bg-gray-50"
        >
          Close
        </button>
      </div>
    </DialogFrame>
  )
}
