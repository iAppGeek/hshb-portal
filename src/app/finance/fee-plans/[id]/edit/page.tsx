import { type Metadata } from 'next'
import { notFound } from 'next/navigation'

import { requireRouteAccess } from '@/auth/require'
import {
  getAcademicYears,
  getClassesByAcademicYear,
  getFeePlanById,
  getFeePlans,
} from '@/db'

import PageHeader, {
  RequiredFieldsNote,
} from '../../../../_components/PageHeader'
import { takenClassLabels, toClassOptions } from '../../../_lib/feePlanClasses'
import FeePlanForm from '../../FeePlanForm'
import { updateFeePlanAction } from '../../actions'

export const metadata: Metadata = { title: 'Edit Fee Plan' }

export default async function EditFeePlanPage({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<React.ReactElement> {
  await requireRouteAccess('/finance')

  const { id } = await params
  const [plan, years, plans] = await Promise.all([
    getFeePlanById(id),
    getAcademicYears(),
    getFeePlans(),
  ])

  if (!plan) {
    notFound()
  }

  const classes = (
    await Promise.all(years.map((y) => getClassesByAcademicYear(y.id)))
  ).flat()

  return (
    <div className="max-w-3xl">
      <PageHeader
        title={`Edit Fee Plan: ${plan.name} (${plan.academic_year.code})`}
        subtitle={RequiredFieldsNote}
        backHref="/finance?tab=fee-plans"
        backLabel="Fee plans"
      />

      <FeePlanForm
        plan={plan}
        classes={toClassOptions(classes)}
        years={years}
        takenBy={takenClassLabels(plans, plan.id)}
        action={updateFeePlanAction.bind(null, plan.id)}
        submitLabel="Save changes"
      />
    </div>
  )
}
