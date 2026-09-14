import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

import ClassForm, { type ClassFormData } from './ClassForm'

const years = [
  { id: 'year-2', code: '2026-27' },
  { id: 'year-1', code: '2025-26' },
]

const teachers = [
  { id: 't1', first_name: 'Tom', last_name: 'Teacher', display_name: null },
]

const classData: ClassFormData = {
  id: 'c1',
  name: 'Alpha',
  year_group: 'Year 1',
  room_number: null,
  academic_year_id: 'year-1',
  teacher_id: 't1',
  active: true,
  student_classes: [],
}

describe('ClassForm', () => {
  it('lets a new class pick its academic year', () => {
    const { container } = render(
      <ClassForm
        teachers={teachers}
        students={[]}
        years={years}
        defaultAcademicYearId="year-2"
        action={vi.fn()}
        submitLabel="Add class"
      />,
    )

    const select = screen.getByLabelText(/Academic year/) as HTMLSelectElement
    expect(select.tagName).toBe('SELECT')
    expect(select.value).toBe('year-2')
    expect(container.querySelector('[name="academic_year_id"]')).toBeTruthy()
  })

  it('shows the academic year as read-only when editing a class', () => {
    const { container } = render(
      <ClassForm
        teachers={teachers}
        students={[]}
        years={years}
        classData={classData}
        action={vi.fn()}
        submitLabel="Save changes"
      />,
    )

    expect(screen.getByTestId('class-academic-year').textContent).toBe(
      '2025-26',
    )
    expect(container.querySelector('[name="academic_year_id"]')).toBeNull()
    expect(
      screen.getByText(
        "A class's academic year can't be changed after it is created.",
      ),
    ).toBeTruthy()
  })
})
