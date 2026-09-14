import { getFeePlans, getPriorYearBalances, getStudentFeeList } from '@/db'
import { todayInSchoolTz } from '@/lib/datetime'

import EmptyState from '../../../_components/EmptyState'
import { buildStudentFeeRows } from '../../_lib/studentFeeSummary'

import StudentFeesTable from './StudentFeesTable'

type Props = {
  yearId: string
}

export default async function StudentFeesTab({
  yearId,
}: Props): Promise<React.ReactElement> {
  const [students, plans, priorOwed] = await Promise.all([
    getStudentFeeList(yearId),
    getFeePlans(yearId),
    getPriorYearBalances(yearId),
  ])

  if (students.length === 0) {
    return <EmptyState message="No active students." />
  }

  return (
    <StudentFeesTable
      rows={buildStudentFeeRows(students, plans, todayInSchoolTz(), priorOwed)}
      yearId={yearId}
    />
  )
}
