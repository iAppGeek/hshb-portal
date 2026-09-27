import { type Metadata } from 'next'
import Link from 'next/link'

import { requireSession } from '@/auth/require'
import {
  getAcademicYears,
  getClassesByAcademicYear,
  getClassesByTeacher,
  getCurrentAcademicYear,
} from '@/db'
import PermissionedLink from '@/components/PermissionedLink'
import { resolveYearId } from '@/lib/academicYears'
import { isClassOpen } from '@/lib/classes'
import {
  canEditClasses,
  canCreateClasses,
  canSeeAllData,
  isAdmin,
} from '@/lib/permissions'

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
  const actor = await requireSession()

  const role = actor.role
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
    : await getClassesByTeacher(actor.staffId)

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
          <div className="flex items-center gap-3">
            {classRows.length > 1 && (
              <Link
                href={
                  selectedYearId
                    ? `/classes/print?year=${selectedYearId}`
                    : '/classes/print'
                }
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 shadow-sm transition hover:bg-gray-50"
              >
                Print All Registers
              </Link>
            )}
            <PermissionedLink
              href="/classes/new"
              allowed={canCreateClasses(role)}
              showDisabled={canSeeAllData(role)}
              disabledReason="You don't have permission to add classes"
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700"
            >
              Add Class
            </PermissionedLink>
          </div>
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
