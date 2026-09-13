import { type Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'

import { auth } from '@/auth'
import { getAllClassesIncludingInactive, getFeePlans } from '@/db'
import { canManageFinance } from '@/lib/permissions'
import type { StaffRole } from '@/types/next-auth'

import { takenClassLabels, toClassOptions } from '../../_lib/feePlanClasses'
import FeePlanForm from '../FeePlanForm'
import { createFeePlanAction } from '../actions'

export const metadata: Metadata = { title: 'Add Fee Plan' }

export default async function NewFeePlanPage(): Promise<React.ReactElement> {
  const session = await auth()
  const role = session?.user?.role as StaffRole | undefined

  if (!role || !canManageFinance(role)) {
    redirect('/dashboard')
  }

  const [classes, plans] = await Promise.all([
    getAllClassesIncludingInactive(),
    getFeePlans(),
  ])

  return (
    <div className="max-w-3xl">
      <div className="mb-6">
        <Link
          href="/finance?tab=fee-plans"
          className="text-sm font-medium text-blue-600 hover:text-blue-800"
        >
          ← Fee plans
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-gray-900">Add Fee Plan</h1>
        <p className="mt-1 text-sm text-gray-500">
          Fields marked with <span className="text-red-500">*</span> are
          required.
        </p>
      </div>

      <FeePlanForm
        plan={null}
        classes={toClassOptions(classes)}
        takenBy={takenClassLabels(plans, null)}
        action={createFeePlanAction}
        submitLabel="Add fee plan"
      />
    </div>
  )
}
