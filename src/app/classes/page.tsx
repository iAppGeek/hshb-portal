import { type Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'

import { auth } from '@/auth'
import {
  getAcademicYears,
  getClassesByAcademicYear,
  getClassesByTeacher,
  getCurrentAcademicYear,
} from '@/db'
import Tooltip from '@/components/Tooltip'
import { resolveYearId } from '@/lib/academicYears'
import { isClassOpen } from '@/lib/classes'
import {
  canEditClasses,
  canCreateClasses,
  canSeeAllData,
  isAdmin,
} from '@/lib/permissions'
import type { StaffRole } from '@/types/next-auth'

import EmptyState from '../_components/EmptyState'
import PageHeader from '../_components/PageHeader'
import YearSelector from '../_components/YearSelector'

import ClassesTable, { type ClassRow } from './ClassesTable'

export const metadata: Metadata = { title: 'Classes' }

export default async function ClassesPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>
}) {
  const session = await auth()
  if (!session) {
    redirect('/login')
  }

  const role = session.user?.role as StaffRole
  const canEdit = canEditClasses(role)
  const canSeeAll = canSeeAllData(role)
  // Only admins browse past years; other all-data roles see the current year.
  const canBrowseYears = isAdmin(role)

  const { year } = await searchParams
  const [years, currentYear] = canSeeAll
    ? await Promise.all([getAcademicYears(), getCurrentAcademicYear()])
    : [[], null]
  const selectedYearId = currentYear
    ? canBrowseYears
      ? resolveYearId(years, year, currentYear.id)
      : currentYear.id
    : null

  const classes = selectedYearId
    ? await getClassesByAcademicYear(selectedYearId)
    : await getClassesByTeacher(session.user.staffId)

  const classRows: ClassRow[] = (classes as Omit<ClassRow, 'editable'>[]).map(
    (cls) => ({
      ...cls,
      editable: currentYear ? isClassOpen(cls, currentYear) : false,
    }),
  )

  return (
    <>
      <PageHeader
        title="Classes"
        action={
          canCreateClasses(role) ? (
            <Link
              href="/classes/new"
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700"
            >
              Add Class
            </Link>
          ) : canSeeAllData(role) ? (
            <Tooltip text="You don't have permission to add classes">
              <span className="cursor-not-allowed rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white opacity-50 shadow-sm">
                Add Class
              </span>
            </Tooltip>
          ) : null
        }
      />

      {canBrowseYears && selectedYearId && (
        <div className="mb-4">
          <YearSelector
            years={years}
            value={selectedYearId}
            basePath="/classes"
          />
        </div>
      )}

      {classRows.length === 0 ? (
        <EmptyState message="No classes found." />
      ) : (
        <ClassesTable classes={classRows} canEdit={canEdit} role={role} />
      )}
    </>
  )
}
