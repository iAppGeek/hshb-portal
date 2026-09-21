import { getAcademicYears, getClassesByAcademicYear, getFeePlans } from '@/db'
import { nextAcademicYear } from '@/lib/academicYears'

import AcademicYearForm from './AcademicYearForm'
import AcademicYearsTable from './AcademicYearsTable'
import {
  createAcademicYearAction,
  updateAcademicYearAction,
  setCurrentAcademicYearAction,
} from './actions'

export default async function AcademicYearsTab(): Promise<React.ReactElement> {
  const years = await getAcademicYears()
  const counts = await Promise.all(
    years.map(async (y) => ({
      id: y.id,
      classCount: (await getClassesByAcademicYear(y.id)).length,
      feePlanCount: (await getFeePlans(y.id)).length,
    })),
  )
  const countsById = new Map(counts.map((c) => [c.id, c]))
  const latest = years[0] ?? null
  const suggested = latest
    ? nextAcademicYear(latest.code)
    : { code: '', start_date: '', end_date: '' }

  return (
    <div className="space-y-6">
      {years.length > 0 && (
        <AcademicYearsTable
          years={years.map((y) => ({
            id: y.id,
            code: y.code,
            start_date: y.start_date,
            end_date: y.end_date,
            is_current: y.is_current,
            classCount: countsById.get(y.id)?.classCount ?? 0,
            feePlanCount: countsById.get(y.id)?.feePlanCount ?? 0,
          }))}
          updateAction={updateAcademicYearAction}
          makeCurrentAction={setCurrentAcademicYearAction}
        />
      )}

      <div className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-gray-200">
        <h2 className="mb-4 text-sm font-semibold text-gray-900">Add year</h2>
        <AcademicYearForm
          mode="create"
          defaultValues={suggested}
          action={createAcademicYearAction}
          submitLabel="Add year"
        />
      </div>
    </div>
  )
}
