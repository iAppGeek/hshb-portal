import type { ReactElement } from 'react'

import PageHeader from '../../_components/PageHeader'

export default function AllClassRegistersLoading(): ReactElement {
  return (
    <div className="max-w-5xl animate-pulse">
      <PageHeader
        title="All Class Registers"
        backHref="/classes"
        backLabel="Classes"
      />
      {Array.from({ length: 3 }).map((_, i) => (
        <div
          key={i}
          className="mb-6 rounded-xl bg-white p-6 shadow-sm ring-1 ring-gray-200"
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
