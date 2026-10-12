import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'

import { formatCalendarDate } from '@/lib/datetime'
import type {
  StudentAttendanceDay,
  StudentAttendanceTotals,
} from '@/lib/studentAttendance'

import StudentAttendanceSection from './StudentAttendanceSection'

const totals: StudentAttendanceTotals = {
  studentId: 'student-1',
  possible: 4,
  attended: 2,
  late: 1,
  absent: 1,
  unmarked: 1,
}

const days: StudentAttendanceDay[] = [
  { date: '2026-10-08', status: 'unmarked', classNames: ['Alpha', 'Beta'] },
  { date: '2026-10-07', status: 'absent', classNames: ['Alpha'] },
  { date: '2026-10-06', status: 'late', classNames: ['Alpha'] },
  { date: '2026-10-05', status: 'present', classNames: ['Beta'] },
]

function renderSection(
  next: {
    totals?: StudentAttendanceTotals
    days?: StudentAttendanceDay[]
  } = {},
): ReturnType<typeof render> {
  return render(
    <StudentAttendanceSection
      yearCode="2026-27"
      totals={next.totals ?? totals}
      days={next.days ?? days}
    />,
  )
}

describe('StudentAttendanceSection', () => {
  it('shows the headline and the non-zero counts', () => {
    renderSection()

    expect(
      screen.getByRole('heading', { name: 'Attendance · 2026-27' }),
    ).toBeTruthy()
    expect(screen.getByText('50% (2/4)')).toBeTruthy()
    expect(screen.getByText('1 late · 1 absent · 1 not marked')).toBeTruthy()
  })

  it('leaves zero counts out of the breakdown', () => {
    renderSection({
      totals: {
        ...totals,
        possible: 2,
        attended: 0,
        late: 0,
        unmarked: 0,
        absent: 2,
      },
      days: [
        { date: '2026-10-07', status: 'absent', classNames: ['Alpha'] },
        { date: '2026-10-06', status: 'absent', classNames: ['Alpha'] },
      ],
    })

    expect(screen.getByText('2 absent')).toBeTruthy()
    expect(screen.queryByText(/late/)).toBeNull()
    expect(screen.queryByText(/not marked/)).toBeNull()
  })

  it('shows the empty state and no day list when nothing was taken', () => {
    renderSection({
      totals: {
        studentId: 'student-1',
        possible: 0,
        attended: 0,
        late: 0,
        absent: 0,
        unmarked: 0,
      },
      days: [],
    })

    expect(screen.getByText('No registers taken this year.')).toBeTruthy()
    expect(screen.queryByText(/Show all days/)).toBeNull()
  })

  it('keeps the day list closed until it is opened', () => {
    renderSection()

    const details = screen.getByText('Show all days (4)').closest('details')
    expect(details?.hasAttribute('open')).toBe(false)
  })

  it('lists each day newest first with its status and classes', () => {
    renderSection()

    const items = screen.getAllByRole('listitem')
    expect(items.map((item) => item.textContent)).toEqual(
      days.map(
        (day) =>
          `${formatCalendarDate(day.date, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })} · ${day.classNames.join(', ')}${label(day.status)}`,
      ),
    )
    expect(screen.getByText('Present').className).toContain(
      'bg-green-100 text-green-800',
    )
    expect(screen.getByText('Late').className).toContain(
      'bg-amber-100 text-amber-800',
    )
    expect(screen.getByText('Absent').className).toContain(
      'bg-red-100 text-red-800',
    )
    expect(screen.getByText('Not marked').className).toContain(
      'bg-gray-100 text-gray-600',
    )
  })
})

function label(status: StudentAttendanceDay['status']): string {
  switch (status) {
    case 'present':
      return 'Present'
    case 'late':
      return 'Late'
    case 'absent':
      return 'Absent'
    case 'unmarked':
      return 'Not marked'
  }
}
