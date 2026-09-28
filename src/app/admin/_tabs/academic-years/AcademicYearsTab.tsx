import Link from 'next/link'

import { getAcademicYears, getClassesByAcademicYear, getFeePlans } from '@/db'

import { setCurrentAcademicYearAction } from '../../academic-years/actions'

import AcademicYearsTable from './AcademicYearsTable'

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
  const currentId = years.find((y) => y.is_current)?.id ?? null

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Link
          href="/admin/academic-years/new"
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700"
        >
          Add academic year
        </Link>
      </div>

      {/* Keyed on the saved current year: the table holds it in state, so a
          re-render with a different one starts it afresh. */}
      <AcademicYearsTable
        key={currentId ?? 'none'}
        years={years.map((y) => ({
          id: y.id,
          code: y.code,
          start_date: y.start_date,
          end_date: y.end_date,
          is_current: y.is_current,
          classCount: countsById.get(y.id)?.classCount ?? 0,
          feePlanCount: countsById.get(y.id)?.feePlanCount ?? 0,
        }))}
        makeCurrentAction={setCurrentAcademicYearAction}
      />
    </div>
  )
}
