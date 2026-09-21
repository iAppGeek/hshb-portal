import type { ReactElement } from 'react'

import FormSkeleton from '@/components/FormSkeleton'

import PageHeader from '../../_components/PageHeader'

export default function NewLessonPlanLoading(): ReactElement {
  return (
    <div className="max-w-2xl">
      <PageHeader
        title="Add Lesson Plan"
        backHref="/lesson-plans"
        backLabel="Lesson Plans"
      />
      <FormSkeleton />
    </div>
  )
}
