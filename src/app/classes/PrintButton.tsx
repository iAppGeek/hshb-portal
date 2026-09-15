'use client'

export default function PrintButton({
  label = 'Print Register',
}: {
  label?: string
}) {
  return (
    <button
      onClick={() => window.print()}
      className="rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 shadow-sm transition hover:bg-gray-200"
    >
      {label}
    </button>
  )
}
