import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'

import ClassRegisterCard, { type RegisterStudent } from './ClassRegisterCard'

function makeStudent(
  overrides: Partial<RegisterStudent> = {},
): RegisterStudent {
  return {
    id: 'student-1',
    student_code: 'S001',
    first_name: 'Nikos',
    last_name: 'Papadopoulos',
    allergies: null,
    primary_guardian: null,
    ...overrides,
  }
}

describe('ClassRegisterCard', () => {
  it('shows the teacher, year group and academic year', () => {
    render(
      <ClassRegisterCard
        teacherName="Tom Teacher"
        teacherEmail="tom.teacher@hshb.org.uk"
        yearGroup="1"
        academicYear="2026-27"
        students={[makeStudent()]}
        emptyMessage="No students enrolled in this class."
      />,
    )

    expect(screen.getByText('Tom Teacher')).toBeTruthy()
    expect(
      screen.getByRole('link', { name: 'tom.teacher@hshb.org.uk' }),
    ).toHaveAttribute('href', 'mailto:tom.teacher@hshb.org.uk')
    expect(screen.getByText('Year 1')).toBeTruthy()
    expect(screen.getByText('2026-27')).toBeTruthy()
  })

  it('shows the empty message when there are no students', () => {
    render(
      <ClassRegisterCard
        teacherName="Tom Teacher"
        teacherEmail={null}
        yearGroup="1"
        academicYear="2026-27"
        students={[]}
        emptyMessage="No students enrolled in this class."
      />,
    )

    expect(screen.getByText('No students enrolled in this class.')).toBeTruthy()
    expect(screen.queryByRole('table')).toBeNull()
  })

  it('renders a table row per student with their primary contact', () => {
    render(
      <ClassRegisterCard
        teacherName="Tom Teacher"
        teacherEmail={null}
        yearGroup="1"
        academicYear="2026-27"
        students={[
          makeStudent({
            primary_guardian: {
              first_name: 'Maria',
              last_name: 'Papadopoulos',
              phone: '07700 900000',
              email: 'maria@example.com',
            },
          }),
        ]}
        emptyMessage="No students enrolled in this class."
      />,
    )

    const row = screen.getByRole('row', { name: /Nikos/ })
    expect(row).toBeTruthy()
    expect(screen.getByText('Maria Papadopoulos')).toBeTruthy()
    expect(screen.getByRole('link', { name: '07700 900000' })).toHaveAttribute(
      'href',
      'tel:07700 900000',
    )
  })
})
