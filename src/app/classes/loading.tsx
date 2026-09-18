import type { ReactElement } from 'react'

import TableSkeleton from '@/components/grid/TableSkeleton'

export default function ClassesLoading(): ReactElement {
  return (
    <div className="animate-pulse">
      <div className="mb-6 flex items-center justify-between">
        <div className="h-8 w-28 rounded bg-gray-200" />
        <div className="h-9 w-28 rounded-lg bg-gray-200" />
      </div>

      <TableSkeleton
        columns={5}
        rows={6}
        widths={['8rem', '4rem', '7rem', '3rem', '4rem']}
      />
    </div>
  )
}
