import type { ReactElement } from 'react'

import FormSkeleton from '@/components/FormSkeleton'

import PageHeader from '../../_components/PageHeader'

export default function NewStaffLoading(): ReactElement {
  return (
    <div className="max-w-2xl">
      <PageHeader
        title="Add Staff Member"
        backHref="/staff"
        backLabel="Staff"
      />
      <FormSkeleton />
    </div>
  )
}
