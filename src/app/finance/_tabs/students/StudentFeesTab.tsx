import {
  getAcademicYears,
  getFeePlans,
  getPriorYearBalances,
  getStudentFeeList,
} from '@/db'
import { todayInSchoolTz } from '@/lib/datetime'

import EmptyState from '../../../_components/EmptyState'
import YearSelector from '../../../_components/YearSelector'
import { buildStudentFeeRows } from '../../_lib/studentFeeSummary'

import StudentFeesTable from './StudentFeesTable'

type Props = {
  yearId: string
}

export default async function StudentFeesTab({
  yearId,
}: Props): Promise<React.ReactElement> {
  const [years, students, plans, priorOwed] = await Promise.all([
    getAcademicYears(),
    getStudentFeeList(yearId),
    getFeePlans(yearId),
    getPriorYearBalances(yearId),
  ])

  return (
    <div className="space-y-4">
      <YearSelector
        years={years}
        value={yearId}
        basePath="/finance"
        extraParams={{ tab: 'students' }}
      />

      {students.length === 0 ? (
        <EmptyState message="No active students." />
      ) : (
        <StudentFeesTable
          rows={buildStudentFeeRows(
            students,
            plans,
            todayInSchoolTz(),
            priorOwed,
          )}
        />
      )}
    </div>
  )
}
