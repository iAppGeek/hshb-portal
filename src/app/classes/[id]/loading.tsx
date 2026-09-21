import type { ReactElement } from 'react'

export default function ClassRegisterLoading(): ReactElement {
  return (
    <div className="max-w-5xl animate-pulse">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <div className="h-4 w-24 rounded bg-gray-200" />
          <div className="mt-2 h-8 w-56 rounded bg-gray-200" />
        </div>
        <div className="h-9 w-28 rounded-lg bg-gray-200" />
      </div>
      <div className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-gray-200">
        <div className="mb-3 h-4 w-32 rounded bg-gray-200" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-4 w-full rounded bg-gray-100" />
          ))}
        </div>
      </div>
    </div>
  )
}
