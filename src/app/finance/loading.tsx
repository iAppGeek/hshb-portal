import type { ReactElement } from 'react'

import TableSkeleton from '@/components/grid/TableSkeleton'

import PageHeader from '../_components/PageHeader'

export default function FinanceLoading(): ReactElement {
  return (
    <div>
      <PageHeader
        title="Finance"
        subtitle="Student fees and fee plans for the selected academic year."
      />
      <TableSkeleton columns={5} rows={8} />
    </div>
  )
}
