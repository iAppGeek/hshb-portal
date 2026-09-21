import type { ReactElement } from 'react'

export default function StudentFeesLoading(): ReactElement {
  return (
    <div className="max-w-4xl animate-pulse space-y-6">
      <div>
        <div className="h-4 w-28 rounded bg-gray-200" />
        <div className="mt-2 h-8 w-56 rounded bg-gray-200" />
      </div>
      {Array.from({ length: 2 }).map((_, i) => (
        <div
          key={i}
          className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-gray-200"
        >
          <div className="mb-3 h-4 w-32 rounded bg-gray-200" />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {Array.from({ length: 3 }).map((_, j) => (
              <div key={j} className="h-4 w-full rounded bg-gray-100" />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
