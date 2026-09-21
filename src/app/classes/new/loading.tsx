import type { ReactElement } from 'react'

import FormSkeleton from '@/components/FormSkeleton'

import PageHeader from '../../_components/PageHeader'

export default function NewClassLoading(): ReactElement {
  return (
    <div className="max-w-2xl">
      <PageHeader title="Add Class" backHref="/classes" backLabel="Classes" />
      <FormSkeleton />
    </div>
  )
}
