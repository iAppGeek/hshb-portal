import type { ReactElement } from 'react'

import FormSkeleton from '@/components/FormSkeleton'

import PageHeader from '../../../_components/PageHeader'

export default function EditIncidentLoading(): ReactElement {
  return (
    <div className="max-w-2xl">
      <PageHeader
        title="Edit Incident"
        backHref="/incidents"
        backLabel="Incidents"
      />
      <FormSkeleton />
    </div>
  )
}
