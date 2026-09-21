import type { ReactElement } from 'react'

import TableSkeleton from '@/components/grid/TableSkeleton'

export default function PeriodReportSkeleton(): ReactElement {
  return (
    <div className="animate-pulse space-y-6">
      <div className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-gray-200">
        <div className="border-b border-gray-200 bg-gray-50 px-6 py-3">
          <div className="h-4 w-36 rounded bg-gray-200" />
        </div>
        <TableSkeleton columns={4} rows={5} frame="none" />
      </div>
      <div className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-gray-200">
        <div className="border-b border-gray-200 bg-gray-50 px-6 py-3">
          <div className="h-4 w-36 rounded bg-gray-200" />
        </div>
        <TableSkeleton columns={5} rows={5} frame="none" />
      </div>
    </div>
  )
}
