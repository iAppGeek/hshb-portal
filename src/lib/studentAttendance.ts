export type DayStatus = 'present' | 'late' | 'absent' | 'unmarked'

export type StudentAttendanceDay = {
  date: string
  status: DayStatus
  classNames: string[]
}

export type StudentAttendanceTotals = {
  studentId: string
  possible: number
  attended: number
  late: number
  absent: number
  unmarked: number
}

export type WorstAttenderRow = StudentAttendanceTotals & {
  firstName: string
  lastName: string
  classNames: string[]
  /** Set only when the student has left (`active = false`). */
  leavingReason: string | null
}

/** Whole-number percentage, or null when there were no possible days. */
export function attendancePercent(
  attended: number,
  possible: number,
): number | null {
  if (possible === 0) return null
  return Math.round((attended / possible) * 100)
}

/** `92% (23/25)`, or `—` when there were no possible days. */
export function formatAttendance(attended: number, possible: number): string {
  const percent = attendancePercent(attended, possible)
  if (percent === null) return '—'
  return `${percent}% (${attended}/${possible})`
}
