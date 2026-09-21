import Link from 'next/link'

type Props = {
  submitLabel: string
  pendingLabel?: string
  isPending: boolean
  /** Disables submit for reasons other than a pending save. */
  disabled?: boolean
  cancelHref?: string
  cancelLabel?: string
  error?: string
  children?: React.ReactNode
}

export default function FormActions({
  submitLabel,
  pendingLabel = 'Saving…',
  isPending,
  disabled = false,
  cancelHref,
  cancelLabel = 'Cancel',
  error,
  children,
}: Props): React.ReactElement {
  return (
    <div className="flex items-center gap-4">
      <button
        type="submit"
        disabled={isPending || disabled}
        className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700 disabled:pointer-events-none disabled:opacity-50"
      >
        {isPending ? pendingLabel : submitLabel}
      </button>
      {cancelHref && (
        <Link
          href={cancelHref}
          className="text-sm font-medium text-gray-500 hover:text-gray-700"
        >
          {cancelLabel}
        </Link>
      )}
      {children}
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
    </div>
  )
}
