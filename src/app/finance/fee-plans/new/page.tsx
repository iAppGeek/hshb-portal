import { type Metadata } from 'next'

import { requireRouteAccess } from '@/auth/require'
import {
  getAcademicYears,
  getClassesByAcademicYear,
  getCurrentAcademicYear,
  getFeePlans,
} from '@/db'

import PageHeader, { RequiredFieldsNote } from '../../../_components/PageHeader'
import { takenClassLabels, toClassOptions } from '../../_lib/feePlanClasses'
import FeePlanForm from '../FeePlanForm'
import { createFeePlanAction } from '../actions'

export const metadata: Metadata = { title: 'Add Fee Plan' }

export default async function NewFeePlanPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>
}): Promise<React.ReactElement> {
  await requireRouteAccess('/finance')

  const { year } = await searchParams
  const [years, currentYear] = await Promise.all([
    getAcademicYears(),
    getCurrentAcademicYear(),
  ])
  const defaultAcademicYearId = year ?? currentYear.id

  const [classesByYear, plans] = await Promise.all([
    Promise.all(years.map((y) => getClassesByAcademicYear(y.id))),
    getFeePlans(),
  ])
  const classes = classesByYear.flat()

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Add Fee Plan"
        subtitle={RequiredFieldsNote}
        backHref="/finance?tab=fee-plans"
        backLabel="Fee plans"
      />

      <FeePlanForm
        plan={null}
        classes={toClassOptions(classes)}
        years={years}
        defaultAcademicYearId={defaultAcademicYearId}
        takenBy={takenClassLabels(plans, null)}
        action={createFeePlanAction}
        submitLabel="Add fee plan"
      />
    </div>
  )
}
