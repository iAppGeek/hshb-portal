import type { ReactElement } from 'react'

import FormSkeleton from '@/components/FormSkeleton'

import PageHeader from '../../../_components/PageHeader'

export default function NewFeePlanLoading(): ReactElement {
  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Add Fee Plan"
        backHref="/finance?tab=fee-plans"
        backLabel="Fee plans"
      />
      <FormSkeleton />
    </div>
  )
}
