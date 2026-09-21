import type { ReactElement } from 'react'

import FormSkeleton from '@/components/FormSkeleton'

import PageHeader from '../../_components/PageHeader'

export default function NewIncidentLoading(): ReactElement {
  return (
    <div className="max-w-2xl">
      <PageHeader
        title="Add Incident"
        backHref="/incidents"
        backLabel="Incidents"
      />
      <FormSkeleton />
    </div>
  )
}
