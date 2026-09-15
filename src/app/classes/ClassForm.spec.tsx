import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'

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

  it('has no Active checkbox — deactivation only happens via migration', () => {
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

    expect(container.querySelector('[name="active"]')).toBeNull()
    expect(screen.queryByText('Active')).toBeNull()
  })

  const alice = {
    id: 's-alice',
    first_name: 'Alice',
    last_name: 'Adams',
    student_code: null,
  }
  const bob = {
    id: 's-bob',
    first_name: 'Bob',
    last_name: 'Brown',
    student_code: null,
  }

  function submittedStudentIds(container: HTMLElement): FormDataEntryValue[] {
    return new FormData(container.querySelector('form')!).getAll('student_ids')
  }

  it('keeps a member hidden by the search in the submitted students', () => {
    const { container } = render(
      <ClassForm
        teachers={teachers}
        students={[alice, bob]}
        years={years}
        classData={{
          ...classData,
          student_classes: [
            {
              student_id: alice.id,
              student: { ...alice, active: true, leaving_reason: null },
            },
          ],
        }}
        action={vi.fn()}
        submitLabel="Save changes"
      />,
    )

    fireEvent.change(screen.getByPlaceholderText('Filter students by name…'), {
      target: { value: 'Bob' },
    })

    expect(
      screen.getByText('Adams, Alice').closest('label')!.className,
    ).toContain('hidden')
    expect(submittedStudentIds(container)).toEqual([alice.id])
  })

  it('shows a leaver still on the class ticked with a badge, and lets them be unticked', () => {
    const { container } = render(
      <ClassForm
        teachers={teachers}
        students={[bob]}
        years={years}
        classData={{
          ...classData,
          student_classes: [
            {
              student_id: alice.id,
              student: { ...alice, active: false, leaving_reason: 'graduated' },
            },
          ],
        }}
        action={vi.fn()}
        submitLabel="Save changes"
      />,
    )

    const leaverRow = screen.getByText('Adams, Alice').closest('label')!
    expect(leaverRow.textContent).toContain('Graduated')
    expect(submittedStudentIds(container)).toEqual([alice.id])

    fireEvent.click(leaverRow.querySelector('input')!)
    expect(submittedStudentIds(container)).toEqual([])
  })
})
