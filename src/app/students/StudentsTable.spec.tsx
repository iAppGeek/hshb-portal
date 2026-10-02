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

import StudentsTable from './StudentsTable'

beforeEach(() => {
  vi.clearAllMocks()
})

const students = [
  {
    id: 'student-1',
    first_name: 'Anna',
    last_name: 'Papadopoulos',
    student_code: 'S001',
    student_classes: [
      {
        class: {
          id: 'class-1',
          name: 'Year 1A',
          year_group: '1',
          academic_year: null,
        },
      },
    ],
    address_guardian_id: null,
    address_guardian: null,
    address_line_1: null,
    address_line_2: null,
    city: null,
    postcode: null,
    allergies: null,
    notes: null,
    medical_details: null,
    primary_guardian_id: 'guardian-1',
    primary_guardian: {
      first_name: 'Maria',
      last_name: 'Papadopoulos',
      phone: '07700 900000',
      email: 'maria@example.com',
      occupation: 'Teacher',
      address_line_1: null,
      address_line_2: null,
      city: null,
      postcode: null,
      notes: null,
    },
    primary_guardian_relationship: 'Mother',
    secondary_guardian_id: null,
    secondary_guardian: null,
    secondary_guardian_relationship: null,
    additional_contact_1_id: null,
    additional_contact_1: null,
    additional_contact_1_relationship: null,
    additional_contact_2_id: null,
    additional_contact_2: null,
    additional_contact_2_relationship: null,
    consent_privacy_notice: false,
    consent_emergency_first_aid: false,
    consent_photo_media: false,
    consent_home_school: false,
    consent_comms_email_sms: false,
    active: true,
    leaving_reason: null,
  },
  {
    id: 'student-2',
    first_name: 'Nick',
    last_name: 'Georgiou',
    student_code: 'S002',
    student_classes: [
      {
        class: {
          id: 'class-1',
          name: 'Year 1A',
          year_group: '1',
          academic_year: null,
        },
      },
    ],
    address_guardian_id: null,
    address_guardian: null,
    address_line_1: null,
    address_line_2: null,
    city: null,
    postcode: null,
    allergies: null,
    notes: null,
    medical_details: null,
    primary_guardian_id: 'guardian-2',
    primary_guardian: {
      first_name: 'Eleni',
      last_name: 'Georgiou',
      phone: '07700 900001',
      email: null,
      occupation: 'Teacher',
      address_line_1: null,
      address_line_2: null,
      city: null,
      postcode: null,
      notes: null,
    },
    primary_guardian_relationship: null,
    secondary_guardian_id: null,
    secondary_guardian: null,
    secondary_guardian_relationship: null,
    additional_contact_1_id: null,
    additional_contact_1: null,
    additional_contact_1_relationship: null,
    additional_contact_2_id: null,
    additional_contact_2: null,
    additional_contact_2_relationship: null,
    consent_privacy_notice: false,
    consent_emergency_first_aid: false,
    consent_photo_media: false,
    consent_home_school: false,
    consent_comms_email_sms: false,
    active: true,
    leaving_reason: null,
  },
]

describe('StudentsTable', () => {
  it('renders all student names', () => {
    // Stacked mode's mobile summary title duplicates the desktop name cell,
    // so each name appears twice (plans/shared-grids.md §5).
    render(<StudentsTable students={students} role="admin" />)
    expect(screen.getAllByText('Papadopoulos, Anna').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Georgiou, Nick').length).toBeGreaterThan(0)
  })

  it('renders student codes', () => {
    render(<StudentsTable students={students} role="admin" />)
    expect(screen.getAllByText('S001').length).toBeGreaterThan(0)
    expect(screen.getAllByText('S002').length).toBeGreaterThan(0)
  })

  it('renders class names from student_classes', () => {
    render(<StudentsTable students={students} role="admin" />)
    expect(screen.getAllByText('Year 1A')).toHaveLength(2)
  })

  it("lists a student's classes in school order, youngest first", () => {
    const classOf = (id: string, name: string) => ({
      class: { ...students[0].student_classes[0].class, id, name },
    })
    render(
      <StudentsTable
        students={[
          {
            ...students[0],
            student_classes: [
              classOf('c1', 'GCSE II'),
              classOf('c2', 'Year 5'),
              classOf('c3', 'Reception'),
            ],
          },
        ]}
        role="admin"
      />,
    )
    expect(
      screen.getAllByText('Reception, Year 5, GCSE II').length,
    ).toBeGreaterThan(0)
  })

  it('renders primary guardian name', () => {
    render(<StudentsTable students={students} role="admin" />)
    expect(screen.getByText('Maria Papadopoulos')).toBeTruthy()
  })

  it('shows dash when student code is null', () => {
    render(
      <StudentsTable
        students={[{ ...students[0], student_code: null }]}
        role="admin"
      />,
    )
    expect(screen.getAllByText('—').length).toBeGreaterThan(0)
  })

  it('shows dash when student has no classes', () => {
    render(
      <StudentsTable
        students={[{ ...students[0], student_classes: [] }]}
        role="admin"
      />,
    )
    expect(screen.getAllByText('—').length).toBeGreaterThan(0)
  })

  it('shows dash when primary guardian is null', () => {
    render(
      <StudentsTable
        students={[{ ...students[0], primary_guardian: null }]}
        role="admin"
      />,
    )
    expect(screen.getAllByText('—').length).toBeGreaterThan(0)
  })

  it('renders the Classes and Primary Guardian column headers', () => {
    render(<StudentsTable students={students} role="admin" />)
    expect(screen.getByText('Classes')).toBeTruthy()
    expect(screen.getByText('Primary Guardian')).toBeTruthy()
  })

  it('renders a Details link to the student page for each student (mobile + desktop)', () => {
    render(<StudentsTable students={students} role="admin" />)
    // Each student has a Details link in both the mobile card and desktop actions cell
    const links = screen.getAllByRole('link', { name: 'Details' })
    expect(links).toHaveLength(4)
    // Sorted by name ascending: Georgiou (student-2) before Papadopoulos (student-1)
    expect(links[0].getAttribute('href')).toBe('/students/student-2')
    expect(links[2].getAttribute('href')).toBe('/students/student-1')
  })

  it('shows Edit links for admin with correct hrefs', () => {
    render(<StudentsTable students={students} role="admin" />)
    const editLinks = screen.getAllByRole('link', { name: 'Edit' })
    // Each student has an Edit link in both the mobile name cell and desktop actions cell
    expect(editLinks).toHaveLength(4)
    // Sorted by name ascending: Georgiou (student-2) before Papadopoulos
    // (student-1). Order: [0]=student-2 mobile, [1]=student-2 desktop,
    // [2]=student-1 mobile, [3]=student-1 desktop
    expect(editLinks[0].getAttribute('href')).toBe('/students/student-2/edit')
    expect(editLinks[2].getAttribute('href')).toBe('/students/student-1/edit')
  })

  it('does not show Edit links for teacher', () => {
    render(<StudentsTable students={students} role="teacher" />)
    expect(screen.queryByRole('link', { name: 'Edit' })).toBeNull()
  })

  it('does not show Edit links for headteacher', () => {
    render(<StudentsTable students={students} role="headteacher" />)
    expect(screen.queryByRole('link', { name: 'Edit' })).toBeNull()
  })

  it('shows a leaver badge for an inactive student', () => {
    render(
      <StudentsTable
        students={[
          { ...students[0], active: false, leaving_reason: 'graduated' },
          students[1],
        ]}
        role="admin"
      />,
    )
    expect(screen.getAllByText('Graduated').length).toBeGreaterThan(0)
    expect(screen.queryByText('Left')).toBeNull()
  })

  it('does not show a leaver badge for an active student', () => {
    render(<StudentsTable students={students} role="admin" />)
    expect(screen.queryByText('Left')).toBeNull()
    expect(screen.queryByText('Graduated')).toBeNull()
    expect(screen.queryByText('Transferred')).toBeNull()
  })
})
