import {
  getAcademicYears,
  getClassesByAcademicYear,
  getCurrentAcademicYear,
  getTeachers,
  getStudentsByClass,
} from '@/db'
import { uuid } from '@/lib/schemas'

import ClassMigrationForm from './ClassMigrationForm'
import type { MigrationStudent } from './ClassMigrationForm'
import { migrateClassAction } from './actions'

type Props = {
  sourceClassId: string | undefined
  targetYearId: string | undefined
}

export default async function ClassMigrationTab({
  sourceClassId,
  targetYearId,
}: Props): Promise<React.ReactElement> {
  const [years, teachers, currentYear] = await Promise.all([
    getAcademicYears(),
    getTeachers(),
    getCurrentAcademicYear(),
  ])

  const selectedTargetYearId = targetYearId ?? currentYear.id
  const targetYear =
    years.find((y) => y.id === selectedTargetYearId) ?? currentYear
  const previousYear =
    years
      .filter((y) => y.start_date < targetYear.start_date)
      .sort((a, b) => (a.start_date > b.start_date ? -1 : 1))[0] ?? null

  const sourceClasses = previousYear
    ? (await getClassesByAcademicYear(previousYear.id)).filter((c) => c.active)
    : []

  const isValidSource = sourceClassId
    ? uuid.safeParse(sourceClassId).success
    : false
  const students: MigrationStudent[] = isValidSource
    ? await getStudentsByClass(sourceClassId!)
    : []

  return (
    <ClassMigrationForm
      years={years.map((y) => ({ id: y.id, code: y.code }))}
      targetYearId={selectedTargetYearId}
      classes={sourceClasses.map((c) => ({
        id: c.id,
        name: c.name,
        year_group: c.year_group,
      }))}
      teachers={teachers.map((t) => ({
        id: t.id,
        first_name: t.first_name,
        last_name: t.last_name,
        display_name: t.display_name,
      }))}
      sourceClassId={sourceClassId ?? null}
      students={students}
      action={migrateClassAction}
      baseUrl="/admin?tab=class-migration"
    />
  )
}
