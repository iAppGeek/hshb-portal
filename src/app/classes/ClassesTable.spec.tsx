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

import ClassesTable, { type ClassRow } from './ClassesTable'

beforeEach(() => {
  vi.clearAllMocks()
})

const mockClasses: ClassRow[] = [
  {
    id: 'class-1',
    name: 'Year 1A',
    year_group: '1',
    room_number: 'R1',
    academic_year: '2024/25',
    academic_year_id: 'year-1',
    active: true,
    editable: true,
    teacher: { first_name: 'Jane', last_name: 'Smith' },
  },
  {
    id: 'class-2',
    name: 'Year 2B',
    year_group: '2',
    room_number: null,
    academic_year: null,
    academic_year_id: 'year-0',
    active: false,
    editable: false,
    teacher: null,
  },
]

describe('ClassesTable', () => {
  it('renders class names', () => {
    render(<ClassesTable classes={mockClasses} canEdit={false} role="admin" />)
    // Appears twice per class: once in the stacked mobile summary title,
    // once in the desktop-only "Name" column.
    expect(screen.getAllByText('Year 1A')).toHaveLength(2)
    expect(screen.getAllByText('Year 2B')).toHaveLength(2)
  })

  it('renders teacher name', () => {
    render(<ClassesTable classes={mockClasses} canEdit={false} role="admin" />)
    // The desktop Teacher column is the only cell whose full text is exactly
    // "Smith, Jane" — the mobile details line joins it with " · " into a
    // sibling text node, so it doesn't match an exact-text query.
    expect(screen.getAllByText('Smith, Jane')).toHaveLength(1)
  })

  it('renders active status badge', () => {
    render(<ClassesTable classes={mockClasses} canEdit={false} role="admin" />)
    // class-1 is the only active class: once in the mobile title, once in
    // the desktop Status column.
    expect(screen.getAllByText('Active')).toHaveLength(2)
  })

  it('renders inactive status badge', () => {
    render(<ClassesTable classes={mockClasses} canEdit={false} role="admin" />)
    // class-2 is the only inactive class: once in the mobile title, once in
    // the desktop Status column.
    expect(screen.getAllByText('Inactive')).toHaveLength(2)
  })

  it('shows Details links for all classes (mobile secondary + desktop)', () => {
    render(<ClassesTable classes={mockClasses} canEdit={false} role="admin" />)
    // Each class has a Details link in both the mobile secondary cell and desktop actions cell
    const detailsLinks = screen.getAllByRole('link', { name: 'Details' })
    expect(detailsLinks).toHaveLength(4)
    expect(detailsLinks[0].getAttribute('href')).toBe('/classes/class-1')
    expect(detailsLinks[2].getAttribute('href')).toBe('/classes/class-2')
  })

  it('does not show Edit links when canEdit is false', () => {
    render(<ClassesTable classes={mockClasses} canEdit={false} role="admin" />)
    expect(screen.queryByRole('link', { name: 'Edit' })).toBeNull()
  })

  it('shows Edit links when canEdit is true, but not for a read-only class', () => {
    render(<ClassesTable classes={mockClasses} canEdit={true} role="admin" />)
    const editLinks = screen.getAllByRole('link', { name: 'Edit' })
    // Only class-1 (editable) gets an Edit link, in both the mobile name cell
    // and desktop actions cell — class-2 is read-only.
    expect(editLinks).toHaveLength(2)
    expect(editLinks[0].getAttribute('href')).toBe('/classes/class-1/edit')
    expect(editLinks[1].getAttribute('href')).toBe('/classes/class-1/edit')
  })

  it('canEdit={false} with role="admin" renders 2 disabled Edit spans per class and no Edit links', () => {
    render(<ClassesTable classes={mockClasses} canEdit={false} role="admin" />)
    expect(screen.queryByRole('link', { name: 'Edit' })).toBeNull()
    const disabledEdits = screen.getAllByText('Edit')
    expect(disabledEdits).toHaveLength(4) // 2 per class: titleAside + desktop actions
  })

  it('renders nothing Edit-related when the role cannot see all data', () => {
    render(
      <ClassesTable classes={mockClasses} canEdit={false} role="teacher" />,
    )
    expect(screen.queryByRole('link', { name: 'Edit' })).toBeNull()
    expect(screen.queryByText('Edit')).toBeNull()
    expect(screen.queryByRole('tooltip')).toBeNull()
  })

  it('renders the status badge inside the mobile summary cell title', () => {
    render(<ClassesTable classes={mockClasses} canEdit={false} role="admin" />)
    const titles = screen.getAllByText('Year 1A')
    const titleWithBadge = titles.find((el) =>
      el.parentElement?.textContent?.includes('Active'),
    )
    expect(titleWithBadge).toBeTruthy()
  })

  it('shows dash when no teacher assigned', () => {
    render(<ClassesTable classes={mockClasses} canEdit={false} role="admin" />)
    // Desktop-only "—" cells for class-2 (room, teacher, academic year); the
    // mobile details line renders its own "—" text nodes joined with " · ".
    expect(screen.getAllByText('—').length).toBeGreaterThan(0)
  })

  it('renders empty table when no classes provided', () => {
    render(<ClassesTable classes={[]} canEdit={false} role="admin" />)
    expect(screen.queryByRole('link', { name: 'Details' })).toBeNull()
  })
})
