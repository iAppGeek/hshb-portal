import type { ReactElement } from 'react'

import FormSkeleton from '@/components/FormSkeleton'

import PageHeader from '../../../../_components/PageHeader'

export default function EditFeePlanLoading(): ReactElement {
  return (
    <div className="max-w-3xl">
      <PageHeader title="Edit Fee Plan" />
      <FormSkeleton />
    </div>
  )
}
