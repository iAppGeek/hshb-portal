import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'

import SignInSheetPrintTable from './SignInSheetPrintTable'
import type { TableRow } from './StaffAttendanceTable'

const staffA = {
  id: 'staff-1',
  first_name: 'Jane',
  last_name: 'Smith',
  display_name: null,
  class_name: 'Year 3A',
  room_number: '12',
}

const staffB = {
  id: 'staff-2',
  first_name: 'Bob',
  last_name: 'Jones',
  display_name: 'BJ',
  class_name: null,
  room_number: null,
}

const signedInRecord = {
  id: 'sa-1',
  staff_id: 'staff-1',
  date: '2026-03-18',
  signed_in_at: '2026-03-18T09:00:00Z',
  signed_out_at: null,
  created_at: null,
  updated_at: null,
}

const signedOutRecord = {
  ...signedInRecord,
  signed_out_at: '2026-03-18T17:00:00Z',
}

describe('SignInSheetPrintTable', () => {
  it('renders the sheet title and a blank Date line', () => {
    render(<SignInSheetPrintTable rows={[]} />)
    expect(screen.getByText('Staff Sign-In Sheet')).toBeInTheDocument()
    expect(screen.getByText('Date')).toBeInTheDocument()
  })

  it('renders a header for every column', () => {
    render(<SignInSheetPrintTable rows={[]} />)
    for (const header of [
      '#',
      'Name',
      'Class',
      'Room',
      'Arrival Time',
      'Departure Time',
    ]) {
      expect(screen.getByText(header)).toBeInTheDocument()
    }
  })

  it('renders staff details, falling back to display name and dashes', () => {
    const rows: TableRow[] = [
      { staff: staffA, record: null },
      { staff: staffB, record: null },
    ]
    render(<SignInSheetPrintTable rows={rows} />)

    expect(screen.getByText('Jane Smith')).toBeInTheDocument()
    expect(screen.getByText('Year 3A')).toBeInTheDocument()
    expect(screen.getByText('12')).toBeInTheDocument()
    expect(screen.getByText('BJ')).toBeInTheDocument()
    // staffB has no class/room, rendered as em dashes
    expect(screen.getAllByText('—')).toHaveLength(2)
  })

  it('shows a blank fill-in line when there is no sign-in/sign-out time', () => {
    const rows: TableRow[] = [{ staff: staffA, record: null }]
    const { container } = render(<SignInSheetPrintTable rows={rows} />)

    expect(container.querySelectorAll('td span.border-b')).toHaveLength(2)
  })

  it('shows the formatted sign-in and sign-out times when present', () => {
    const rows: TableRow[] = [{ staff: staffA, record: signedOutRecord }]
    render(<SignInSheetPrintTable rows={rows} />)

    expect(screen.getByText('09:00')).toBeInTheDocument()
    expect(screen.getByText('17:00')).toBeInTheDocument()
  })

  it('shows one blank line for arrival when only signed in', () => {
    const rows: TableRow[] = [{ staff: staffA, record: signedInRecord }]
    const { container } = render(<SignInSheetPrintTable rows={rows} />)

    expect(screen.getByText('09:00')).toBeInTheDocument()
    expect(container.querySelectorAll('td span.border-b')).toHaveLength(1)
  })
})
