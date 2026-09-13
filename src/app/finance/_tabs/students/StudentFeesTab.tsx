import { getFeePlans, getStudentFeeList } from '@/db'
import { todayInSchoolTz } from '@/lib/datetime'

import EmptyState from '../../../_components/EmptyState'
import { buildStudentFeeRows } from '../../_lib/studentFeeSummary'

import StudentFeesTable from './StudentFeesTable'

export default async function StudentFeesTab(): Promise<React.ReactElement> {
  const [students, plans] = await Promise.all([
    getStudentFeeList(),
    getFeePlans(),
  ])

  if (students.length === 0) {
    return <EmptyState message="No active students." />
  }

  return (
    <StudentFeesTable
      rows={buildStudentFeeRows(students, plans, todayInSchoolTz())}
    />
  )
}
