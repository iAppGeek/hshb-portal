import type { ReactElement } from 'react'

import FormSkeleton from '@/components/FormSkeleton'

import PageHeader from '../../../_components/PageHeader'

export default function EditLessonPlanLoading(): ReactElement {
  return (
    <div className="max-w-2xl">
      <PageHeader
        title="Edit Lesson Plan"
        backHref="/lesson-plans"
        backLabel="Lesson Plans"
      />
      <FormSkeleton />
    </div>
  )
}
