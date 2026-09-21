import type { ReactElement } from 'react'

import TableSkeleton from '@/components/grid/TableSkeleton'

import PageHeader from '../_components/PageHeader'

export default function GuardiansLoading(): ReactElement {
  return (
    <div>
      <PageHeader title="Guardians" />
      <TableSkeleton columns={4} rows={8} />
    </div>
  )
}
