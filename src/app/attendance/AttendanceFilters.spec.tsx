import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

const mockPush = vi.hoisted(() => vi.fn())

vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  useRouter: () => ({ push: mockPush }),
}))

import AttendanceFilters from './AttendanceFilters'

beforeEach(() => {
  vi.clearAllMocks()
})

const classes = [
  { id: 'class-1', name: 'Alpha', active: true },
  { id: 'class-2', name: 'Beta', active: false },
]

describe('AttendanceFilters', () => {
  it('renders active classes by name', () => {
    render(
      <AttendanceFilters
        classes={classes}
        selectedClassId="class-1"
        selectedDate="2026-09-15"
      />,
    )
    expect(screen.getByText('Alpha')).toBeTruthy()
  })

  it('marks an inactive (completed) class', () => {
    render(
      <AttendanceFilters
        classes={classes}
        selectedClassId="class-1"
        selectedDate="2026-09-15"
      />,
    )
    expect(screen.getByText('Beta (completed)')).toBeTruthy()
  })

  it('navigates to the selected class and date', () => {
    render(
      <AttendanceFilters
        classes={classes}
        selectedClassId="class-1"
        selectedDate="2026-09-15"
      />,
    )
    fireEvent.click(screen.getByText('Beta (completed)'))
    expect(mockPush).toHaveBeenCalledWith(
      '/attendance?classId=class-2&date=2026-09-15',
    )
  })

  it('includes the year in the query string when provided', () => {
    render(
      <AttendanceFilters
        classes={classes}
        selectedClassId="class-1"
        selectedDate="2026-09-15"
        yearId="year-1"
      />,
    )
    fireEvent.click(screen.getByText('Beta (completed)'))
    expect(mockPush).toHaveBeenCalledWith(
      '/attendance?classId=class-2&date=2026-09-15&year=year-1',
    )
  })
})
