import type { ReactElement } from 'react'

import TableSkeleton from '@/components/grid/TableSkeleton'

import PageHeader from '../_components/PageHeader'

export default function HrLoading(): ReactElement {
  return (
    <div>
      <PageHeader title="HR" subtitle="Staff payroll and compliance records." />
      <TableSkeleton columns={5} rows={8} />
    </div>
  )
}
