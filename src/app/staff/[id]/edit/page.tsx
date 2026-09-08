import { type Metadata } from 'next'
import { redirect } from 'next/navigation'

import { auth } from '@/auth'
import { getStaffById, getDocumentsForStaff } from '@/db'
import { canEditStaff, canManageDocuments } from '@/lib/permissions'
import DocumentsSection from '@/clientComponents/DocumentsSection'
import type { StaffRole } from '@/types/next-auth'

import EditStaffForm from './EditStaffForm'

export const metadata: Metadata = { title: 'Edit Staff Member' }

export default async function EditStaffPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const session = await auth()
  const role = session?.user?.role as StaffRole

  if (!canEditStaff(role)) {
    redirect('/staff')
  }

  const { id } = await params
  const [staff, documents] = await Promise.all([
    getStaffById(id),
    getDocumentsForStaff(id),
  ])

  if (!staff) {
    redirect('/staff')
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">
          Edit Staff: {staff.last_name}, {staff.first_name}
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Fields marked with <span className="text-red-500">*</span> are
          required.
        </p>
      </div>

      <EditStaffForm staff={staff} />

      <DocumentsSection
        ownerType="staff"
        ownerId={id}
        documents={documents}
        canManage={canManageDocuments(role)}
      />
    </div>
  )
}
