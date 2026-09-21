import { type Metadata } from 'next'

import { requireSession } from '@/auth/require'
import PrintPageSetup from '@/components/grid/PrintPageSetup'
import {
  getClassesByAcademicYear,
  getClassesByTeacher,
  getClassWithStudents,
  getCurrentAcademicYear,
} from '@/db'
import { compareByName } from '@/lib/grid/sort'
import { canSeeAllData, isAdmin } from '@/lib/permissions'

import PageHeader from '../../_components/PageHeader'
import ClassRegisterCard, {
  type RegisterStudent,
} from '../[id]/ClassRegisterCard'
import PrintButton from '../PrintButton'

export const metadata: Metadata = { title: 'All Class Registers' }

export default async function AllClassRegistersPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>
}) {
  const actor = await requireSession()
  const role = actor.role
  const canSeeAll = canSeeAllData(role)
  const canBrowseYears = isAdmin(role)

  const { year } = await searchParams
  const currentYear = await getCurrentAcademicYear()
  const yearId = canBrowseYears && year ? year : currentYear.id

  const classList = canSeeAll
    ? await getClassesByAcademicYear(yearId)
    : await getClassesByTeacher(actor.staffId)

  const classes = (
    await Promise.all(
      classList.map((c) => getClassWithStudents(c.id as string)),
    )
  ).filter((cls): cls is NonNullable<typeof cls> => cls !== null)

  return (
    <div className="max-w-5xl print:max-w-none">
      <PrintPageSetup />

      <div className="print:hidden">
        <PageHeader
          title="All Class Registers"
          backHref="/classes"
          backLabel="Classes"
          action={<PrintButton label="Print All Registers" />}
        />
      </div>

      {classes.length === 0 ? (
        <p className="text-sm text-gray-500">No classes found.</p>
      ) : (
        classes.map((cls, i) => {
          const teacher = cls.teacher as {
            first_name: string
            last_name: string
            display_name: string | null
            email: string | null
          } | null

          const teacherName = teacher
            ? (teacher.display_name ??
              `${teacher.first_name} ${teacher.last_name}`)
            : '—'

          const students = (
            cls.student_classes as Array<{ student: RegisterStudent | null }>
          )
            .map((sc) => sc.student)
            .filter((s): s is RegisterStudent => s !== null)
            .sort(compareByName)

          return (
            <div
              key={cls.id}
              className={i > 0 ? 'print:break-before-page' : undefined}
            >
              <h2 className="mb-4 text-xl font-bold text-gray-900 print:mb-4">
                {cls.name} — Class Register
              </h2>
              <ClassRegisterCard
                teacherName={teacherName}
                teacherEmail={teacher?.email ?? null}
                yearGroup={cls.year_group}
                academicYear={cls.academic_year}
                students={students}
                emptyMessage="No students enrolled in this class."
              />
            </div>
          )
        })
      )}
    </div>
  )
}
