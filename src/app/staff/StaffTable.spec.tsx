import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('next/link', () => ({
  default: ({
    children,
    href,
  }: {
    children: React.ReactNode
    href: string
  }) => <a href={href}>{children}</a>,
}))

import StaffTable, { type StaffMember } from './StaffTable'

beforeEach(() => {
  vi.clearAllMocks()
})

const mockStaff: StaffMember[] = [
  {
    id: 'staff-1',
    title: 'Mrs',
    first_name: 'Jane',
    last_name: 'Smith',
    display_name: 'Jane Smith',
    role: 'teacher',
    email: 'jane@school.com',
    contact_number: '07700 900001',
    personal_email: 'jane@gmail.com',
    classes: [{ id: 'class-1', name: 'Year 3A', room_number: 'R12' }],
  },
  {
    id: 'staff-2',
    title: 'Mr',
    first_name: 'Bob',
    last_name: 'Jones',
    display_name: null,
    role: 'admin',
    email: 'bob@school.com',
    contact_number: null,
    personal_email: null,
    classes: [],
  },
] as unknown as StaffMember[]

describe('StaffTable', () => {
  it('renders each member once in the stacked title and once in a desktop cell', () => {
    render(
      <StaffTable
        staff={mockStaff}
        canEdit={false}
        canSeeContact={false}
        role="admin"
      />,
    )
    // Stacked title merges title + first + last name into one string, so
    // "Jane" alone only appears in it as a substring — assert the full
    // stacked title, then the desktop-only First/Last name cells separately.
    expect(screen.getByText('Mrs Jane Smith')).toBeTruthy()
    expect(screen.getByText('Mr Bob Jones')).toBeTruthy()
    expect(screen.getByText('Jane', { selector: 'td' })).toBeTruthy()
    expect(screen.getByText('Jones', { selector: 'td' })).toBeTruthy()
  })

  it('renders the role label in its own desktop cell', () => {
    render(
      <StaffTable
        staff={mockStaff}
        canEdit={false}
        canSeeContact={false}
        role="admin"
      />,
    )
    expect(screen.getByText('Teacher')).toBeTruthy()
    expect(screen.getByText('Admin')).toBeTruthy()
  })

  it('shows dash for staff with no class assigned', () => {
    render(
      <StaffTable
        staff={mockStaff}
        canEdit={false}
        canSeeContact={false}
        role="admin"
      />,
    )
    expect(screen.getAllByText('—').length).toBeGreaterThan(0)
    expect(screen.getByText('Year 3A')).toBeTruthy()
    expect(screen.getByText('R12')).toBeTruthy()
  })

  it('hides the Contact and Personal Email columns when canSeeContact is false', () => {
    render(
      <StaffTable
        staff={mockStaff}
        canEdit={false}
        canSeeContact={false}
        role="admin"
      />,
    )
    expect(screen.queryByText('Contact')).toBeNull()
    expect(screen.queryByText('Personal Email')).toBeNull()
    expect(screen.queryByText('07700 900001')).toBeNull()
  })

  it('shows the Contact and Personal Email columns when canSeeContact is true', () => {
    render(
      <StaffTable
        staff={mockStaff}
        canEdit={false}
        canSeeContact={true}
        role="admin"
      />,
    )
    expect(screen.getByText('Contact')).toBeTruthy()
    expect(screen.getByText('Personal Email')).toBeTruthy()
    expect(screen.getAllByRole('link', { name: '07700 900001' }).length).toBe(2) // desktop cell + stacked details line
  })

  it('shows Edit links when canEdit is true', () => {
    render(
      <StaffTable
        staff={mockStaff}
        canEdit={true}
        canSeeContact={false}
        role="admin"
      />,
    )
    const editLinks = screen.getAllByRole('link', { name: 'Edit' })
    // Two members × (titleAside + desktop Actions cell)
    expect(editLinks).toHaveLength(4)
    expect(editLinks[0].getAttribute('href')).toBe('/staff/staff-1/edit')
  })

  it('shows a disabled Edit affordance when canEdit is false but the role sees all data', () => {
    render(
      <StaffTable
        staff={mockStaff}
        canEdit={false}
        canSeeContact={false}
        role="admin"
      />,
    )
    expect(screen.queryByRole('link', { name: 'Edit' })).toBeNull()
    expect(screen.getAllByText('Edit').length).toBeGreaterThan(0)
  })

  it('renders no Edit affordance or Actions column when the role cannot see all data', () => {
    render(
      <StaffTable
        staff={mockStaff}
        canEdit={false}
        canSeeContact={false}
        role="teacher"
      />,
    )
    expect(screen.queryByText('Edit')).toBeNull()
    expect(screen.queryByText('Actions')).toBeNull()
  })

  it('renders an empty table when no staff provided', () => {
    render(
      <StaffTable
        staff={[]}
        canEdit={false}
        canSeeContact={false}
        role="admin"
      />,
    )
    expect(screen.queryAllByRole('row')).toHaveLength(1) // header row only
  })
})
