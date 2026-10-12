import { describe, expect, it } from 'vitest'

import { attendancePercent, formatAttendance } from './studentAttendance'

describe('attendancePercent', () => {
  it('is null when there were no possible days', () => {
    expect(attendancePercent(0, 0)).toBeNull()
  })

  it('rounds to the nearest whole number', () => {
    expect(attendancePercent(2, 3)).toBe(67)
    expect(attendancePercent(23, 25)).toBe(92)
  })
})

describe('formatAttendance', () => {
  it('shows the percentage and the counts', () => {
    expect(formatAttendance(23, 25)).toBe('92% (23/25)')
  })

  it('uses an em dash when there were no possible days', () => {
    expect(formatAttendance(0, 0)).toBe('—')
  })
})
