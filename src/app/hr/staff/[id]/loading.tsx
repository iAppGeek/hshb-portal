import type { ReactElement } from 'react'

import FormSkeleton from '@/components/FormSkeleton'

import PageHeader from '../../../_components/PageHeader'

export default function StaffPayrollLoading(): ReactElement {
  return (
    <div className="max-w-3xl">
      <PageHeader title="Staff Payroll" backHref="/hr" backLabel="HR" />
      <FormSkeleton />
    </div>
  )
}
