import { type Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'

import { auth } from '@/auth'
import {
  getAcademicYears,
  getClassesByAcademicYear,
  getFeePlanById,
  getFeePlans,
} from '@/db'
import { canManageFinance } from '@/lib/permissions'
import type { StaffRole } from '@/types/next-auth'

import { takenClassLabels, toClassOptions } from '../../../_lib/feePlanClasses'
import FeePlanForm from '../../FeePlanForm'
import { updateFeePlanAction } from '../../actions'

export const metadata: Metadata = { title: 'Edit Fee Plan' }

export default async function EditFeePlanPage({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<React.ReactElement> {
  const session = await auth()
  const role = session?.user?.role as StaffRole | undefined

  if (!role || !canManageFinance(role)) {
    redirect('/dashboard')
  }

  const { id } = await params
  const [plan, years, plans] = await Promise.all([
    getFeePlanById(id),
    getAcademicYears(),
    getFeePlans(),
  ])

  if (!plan) {
    redirect('/finance?tab=fee-plans')
  }

  const classes = (
    await Promise.all(years.map((y) => getClassesByAcademicYear(y.id)))
  ).flat()

  return (
    <div className="max-w-3xl">
      <div className="mb-6">
        <Link
          href="/finance?tab=fee-plans"
          className="text-sm font-medium text-blue-600 hover:text-blue-800"
        >
          ← Fee plans
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-gray-900">
          Edit Fee Plan: {plan.name} ({plan.academic_year.code})
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Fields marked with <span className="text-red-500">*</span> are
          required.
        </p>
      </div>

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
