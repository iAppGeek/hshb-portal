import { type Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'

import { requireSession } from '@/auth/require'
import { getAcademicYearById } from '@/db'
import { canAccessAdminTasks } from '@/lib/permissions'

import PageHeader, {
  RequiredFieldsNote,
} from '../../../../_components/PageHeader'
import AcademicYearForm from '../../../_tabs/academic-years/AcademicYearForm'
import { saveAcademicYearAction } from '../../actions'

export const metadata: Metadata = { title: 'Edit Academic Year' }

export default async function EditAcademicYearPage({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<React.ReactElement> {
  const actor = await requireSession()
  if (!canAccessAdminTasks(actor.role)) redirect('/admin')

  const { id } = await params
  const year = await getAcademicYearById(id)
  if (!year) notFound()

  return (
    <div className="max-w-2xl">
      <PageHeader
        title={`Edit Academic Year: ${year.code}`}
        subtitle={RequiredFieldsNote}
        backHref="/admin?tab=academic-years"
        backLabel="Admin Tasks"
      />
      <AcademicYearForm
        mode="edit"
        defaultValues={year}
        action={saveAcademicYearAction.bind(null, year.id)}
        submitLabel="Save changes"
      />
    </div>
  )
}
