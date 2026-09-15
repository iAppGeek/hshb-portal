import {
  getAcademicYears,
  getClassesByAcademicYear,
  getCurrentAcademicYear,
  getTeachers,
  getStudentsByClass,
} from '@/db'
import { uuid } from '@/lib/schemas'

import ClassMigrationForm from './ClassMigrationForm'
import type { MigrationClass, MigrationStudent } from './ClassMigrationForm'
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

  // A class can be completed straight from the current year (e.g. an A Level
  // class with no next year), so source classes come from every year up to
  // and including the current one, not just "the year before the target".
  const eligibleYears = years.filter(
    (y) => y.start_date <= currentYear.start_date,
  )
  const classesByYear = await Promise.all(
    eligibleYears.map((y) => getClassesByAcademicYear(y.id)),
  )
  const sourceClasses: (MigrationClass & { academicYearId: string })[] =
    eligibleYears.flatMap((y, i) =>
      classesByYear[i]
        .filter((c) => c.active)
        .map((c) => ({
          id: c.id,
          name: c.name,
          yearCode: y.code,
          academicYearId: y.id,
        })),
    )

  const isValidSource = sourceClassId
    ? uuid.safeParse(sourceClassId).success
    : false
  const selectedSource = isValidSource
    ? sourceClasses.find((c) => c.id === sourceClassId)
    : undefined
  const sourceYear = selectedSource
    ? years.find((y) => y.id === selectedSource.academicYearId)
    : undefined

  // Target years for a new class: after the source class's own year, and never
  // before the current year. Earliest first, so the default for last year's
  // class is the current year and for a current-year class is the next year.
  const availableTargetYears = sourceYear
    ? years
        .filter(
          (y) =>
            y.start_date > sourceYear.start_date &&
            y.start_date >= currentYear.start_date,
        )
        .sort((a, b) => a.start_date.localeCompare(b.start_date))
    : []

  const selectedTargetYearId =
    targetYearId && availableTargetYears.some((y) => y.id === targetYearId)
      ? targetYearId
      : availableTargetYears[0]?.id

  const students: MigrationStudent[] = selectedSource
    ? await getStudentsByClass(selectedSource.id)
    : []

  return (
    <ClassMigrationForm
      // Remounts (resetting the create-new-class checkbox and per-student
      // action defaults) whenever the source class changes.
      key={selectedSource?.id ?? 'none'}
      years={availableTargetYears.map((y) => ({ id: y.id, code: y.code }))}
      targetYearId={selectedTargetYearId}
      classes={sourceClasses.map(({ id, name, yearCode }) => ({
        id,
        name,
        yearCode,
      }))}
      teachers={teachers.map((t) => ({
        id: t.id,
        first_name: t.first_name,
        last_name: t.last_name,
        display_name: t.display_name,
      }))}
      sourceClassId={selectedSource ? selectedSource.id : null}
      students={students}
      action={migrateClassAction}
      baseUrl="/admin?tab=class-migration"
    />
  )
}
