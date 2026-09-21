import type { ReactElement } from 'react'

import FormSkeleton from '@/components/FormSkeleton'

import PageHeader from '../../../_components/PageHeader'

export default function EditStudentLoading(): ReactElement {
  return (
    <div className="max-w-2xl">
      <PageHeader
        title="Edit Student"
        backHref="/students"
        backLabel="Students"
      />
      <FormSkeleton />
    </div>
  )
}
