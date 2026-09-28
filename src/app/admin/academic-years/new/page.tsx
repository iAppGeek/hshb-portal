import { type Metadata } from 'next'
import { redirect } from 'next/navigation'

import { requireSession } from '@/auth/require'
import { getAcademicYears } from '@/db'
import { nextAcademicYear } from '@/lib/academicYears'
import { canAccessAdminTasks } from '@/lib/permissions'

import PageHeader, { RequiredFieldsNote } from '../../../_components/PageHeader'
import AcademicYearForm from '../../_tabs/academic-years/AcademicYearForm'
import { saveAcademicYearAction } from '../actions'

export const metadata: Metadata = { title: 'Add Academic Year' }

export default async function NewAcademicYearPage(): Promise<React.ReactElement> {
  const actor = await requireSession()
  if (!canAccessAdminTasks(actor.role)) redirect('/admin')

  const years = await getAcademicYears()
  const latest = years[0] ?? null
  const suggested = latest
    ? nextAcademicYear(latest.code)
    : { code: '', start_date: '', end_date: '' }

  return (
    <div className="max-w-2xl">
      <PageHeader
        title="Add Academic Year"
        subtitle={RequiredFieldsNote}
        backHref="/admin?tab=academic-years"
        backLabel="Admin Tasks"
      />
      <AcademicYearForm
        mode="create"
        defaultValues={suggested}
        action={saveAcademicYearAction.bind(null, null)}
        submitLabel="Add year"
      />
    </div>
  )
}
