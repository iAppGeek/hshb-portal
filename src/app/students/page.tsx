import { type Metadata } from 'next'
import Link from 'next/link'

import { requireSession } from '@/auth/require'
import { getAllStudents, getStudentsByTeacher } from '@/db'
import Tooltip from '@/components/Tooltip'
import { isTeacher, canSeeAllData, canCreateStudents } from '@/lib/permissions'

import EmptyState from '../_components/EmptyState'
import PageHeader from '../_components/PageHeader'

import StudentsTable from './StudentsTable'

export const metadata: Metadata = { title: 'Students' }

export default async function StudentsPage({
  searchParams,
}: {
  searchParams: Promise<{ leavers?: string }>
}) {
  const actor = await requireSession()
  const role = actor.role
  const staffId = actor.staffId
  const { leavers } = await searchParams
  const showLeavers = leavers === '1'
  const teacherOnly = isTeacher(role)

  const students = teacherOnly
    ? await getStudentsByTeacher(staffId!)
    : await getAllStudents(showLeavers)

  return (
    <>
      <PageHeader
        title="Students"
        action={
          canCreateStudents(role) ? (
            <Link
              href="/students/new"
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700"
            >
              Add student
            </Link>
          ) : canSeeAllData(role) ? (
            <Tooltip text="You don't have permission to add students">
              <span className="cursor-not-allowed rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white opacity-50 shadow-sm">
                Add student
              </span>
            </Tooltip>
          ) : null
        }
      />

      {!teacherOnly && (
        <div className="mb-4">
          <Link
            href={showLeavers ? '/students' : '/students?leavers=1'}
            className="text-sm font-medium text-blue-600 hover:text-blue-800"
          >
            {showLeavers ? 'Hide leavers' : 'Show leavers'}
          </Link>
        </div>
      )}

      {students.length === 0 ? (
        <EmptyState message="No students found." />
      ) : (
        <StudentsTable students={students} role={role} />
      )}
    </>
  )
}
