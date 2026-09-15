// Pure attendance-summary helpers, built on dated enrolment rows so past
// dates reflect who was actually enrolled at the time. See plans/enrolment-history.md.

import { buildRegisterRoster, type EnrolmentRow } from './enrolment'

export type SummaryClass = {
  id: string
  name: string
  yearCode: string | null
  active: boolean
}

export type AttendanceRangeRow = {
  class_id: string
  student_id: string
  date: string
  status: 'present' | 'absent' | 'late'
  created_at: string
  updated_at: string
}

export type EnrolmentRangeRow = EnrolmentRow & { class: SummaryClass }

export type ClassAttendanceSummary = {
  class: SummaryClass
  enrolled: number
  possible: number
  present: number
  absent: number
  late: number
  firstRecordedAt: string | null
  lastUpdatedAt: string | null
}

export type DateTotals = {
  distinctPresent: number
  distinctEnrolled: number
  distinctLate: number
  classesTaken: number
}

export type AttendanceSummary = {
  classes: ClassAttendanceSummary[]
  byDate: Record<string, DateTotals>
}

function emptyClassSummary(cls: SummaryClass): ClassAttendanceSummary {
  return {
    class: cls,
    enrolled: 0,
    possible: 0,
    present: 0,
    absent: 0,
    late: 0,
    firstRecordedAt: null,
    lastUpdatedAt: null,
  }
}

export function summariseAttendance(
  attendance: (AttendanceRangeRow & { class: SummaryClass })[],
  enrolments: EnrolmentRangeRow[],
  dates: string[],
): AttendanceSummary {
  const dateSet = new Set(dates)
  const rangeAttendance = attendance.filter((row) => dateSet.has(row.date))

  const classesById = new Map<string, SummaryClass>()
  for (const row of rangeAttendance) classesById.set(row.class_id, row.class)
  for (const row of enrolments) classesById.set(row.class_id, row.class)

  const enrolmentsByClass = new Map<string, EnrolmentRangeRow[]>()
  for (const row of enrolments) {
    const list = enrolmentsByClass.get(row.class_id) ?? []
    list.push(row)
    enrolmentsByClass.set(row.class_id, list)
  }
  const markedByClassDate = new Map<string, string[]>()
  for (const row of rangeAttendance) {
    const key = `${row.class_id}|${row.date}`
    const list = markedByClassDate.get(key) ?? []
    list.push(row.student_id)
    markedByClassDate.set(key, list)
  }

  // A class's roster on a date uses the same rule as its register: everyone
  // enrolled that day plus anyone marked. A student marked and then moved or
  // made a leaver the same day still counts towards possible and enrolled.
  const rostersByClass = new Map<string, Map<string, string[]>>()
  for (const classId of classesById.keys()) {
    const classEnrolments = enrolmentsByClass.get(classId) ?? []
    const byDate = new Map<string, string[]>()
    for (const date of dates) {
      byDate.set(
        date,
        buildRegisterRoster(
          markedByClassDate.get(`${classId}|${date}`) ?? [],
          classEnrolments,
          date,
        ),
      )
    }
    rostersByClass.set(classId, byDate)
  }

  const summariesByClass = new Map<string, ClassAttendanceSummary>()
  const lastDate = dates[dates.length - 1]
  for (const [classId, cls] of classesById) {
    const summary = emptyClassSummary(cls)
    const rosters = rostersByClass.get(classId)!
    if (lastDate !== undefined) {
      summary.enrolled = rosters.get(lastDate)!.length
    }
    summary.possible = dates.reduce(
      (sum, date) => sum + rosters.get(date)!.length,
      0,
    )
    summariesByClass.set(classId, summary)
  }

  for (const row of rangeAttendance) {
    const summary = summariesByClass.get(row.class_id)
    if (!summary) continue
    if (row.status === 'present' || row.status === 'late') summary.present += 1
    if (row.status === 'absent') summary.absent += 1
    if (row.status === 'late') summary.late += 1
    if (
      summary.firstRecordedAt === null ||
      row.created_at < summary.firstRecordedAt
    ) {
      summary.firstRecordedAt = row.created_at
    }
    if (
      summary.lastUpdatedAt === null ||
      row.updated_at > summary.lastUpdatedAt
    ) {
      summary.lastUpdatedAt = row.updated_at
    }
  }

  const classes = [...summariesByClass.values()].sort((a, b) => {
    const byName = a.class.name.localeCompare(b.class.name)
    if (byName !== 0) return byName
    return (a.class.yearCode ?? '').localeCompare(b.class.yearCode ?? '')
  })

  const byDate: Record<string, DateTotals> = {}
  for (const date of dates) {
    const dayAttendance = rangeAttendance.filter((row) => row.date === date)
    const presentStudentIds = new Set(
      dayAttendance
        .filter((row) => row.status === 'present' || row.status === 'late')
        .map((row) => row.student_id),
    )
    const lateStudentIds = new Set(
      dayAttendance
        .filter((row) => row.status === 'late')
        .map((row) => row.student_id),
    )
    const enrolledStudentIds = new Set(
      [...rostersByClass.values()].flatMap((rosters) => rosters.get(date)!),
    )
    byDate[date] = {
      distinctPresent: presentStudentIds.size,
      distinctEnrolled: enrolledStudentIds.size,
      distinctLate: lateStudentIds.size,
      classesTaken: new Set(dayAttendance.map((row) => row.class_id)).size,
    }
  }

  return { classes, byDate }
}
