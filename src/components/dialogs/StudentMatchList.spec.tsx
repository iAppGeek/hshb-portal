import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

import type { StudentMatch } from '@/db'

import StudentMatchList, {
  initialStudentSelection,
  toStudentChoice,
} from './StudentMatchList'

const alice: StudentMatch = {
  id: 'student-1',
  first_name: 'Alice',
  last_name: 'Smith',
  date_of_birth: '2019-01-01',
  student_code: 'S001',
  active: true,
}

describe('initialStudentSelection', () => {
  it('starts on "new" with the first candidate remembered when new is allowed', () => {
    expect(initialStudentSelection([alice], true)).toEqual({
      mode: 'new',
      studentId: 'student-1',
    })
  })

  it('starts on "existing" with no student when there are no candidates', () => {
    expect(initialStudentSelection([], false)).toEqual({
      mode: 'existing',
      studentId: '',
    })
  })
})

describe('toStudentChoice', () => {
  it('maps "new" regardless of the remembered student', () => {
    expect(toStudentChoice({ mode: 'new', studentId: 'student-1' })).toEqual({
      mode: 'new',
    })
  })

  it('maps "existing" with a student', () => {
    expect(
      toStudentChoice({ mode: 'existing', studentId: 'student-1' }),
    ).toEqual({ mode: 'existing', studentId: 'student-1' })
  })

  it('is null for "existing" without a student', () => {
    expect(toStudentChoice({ mode: 'existing', studentId: '' })).toBeNull()
  })
})

describe('StudentMatchList', () => {
  it('shows the existing-student note only while linking', () => {
    const onChange = vi.fn()
    const { rerender } = render(
      <StudentMatchList
        candidates={[alice]}
        students={[alice]}
        allowNew
        value={{ mode: 'new', studentId: 'student-1' }}
        onChange={onChange}
        existingNote="This overwrites the student."
      />,
    )
    expect(screen.queryByText('This overwrites the student.')).toBeNull()

    fireEvent.click(
      screen.getByRole('radio', { name: 'Link to existing student' }),
    )
    expect(onChange).toHaveBeenCalledWith({
      mode: 'existing',
      studentId: 'student-1',
    })

    rerender(
      <StudentMatchList
        candidates={[alice]}
        students={[alice]}
        allowNew
        value={{ mode: 'existing', studentId: 'student-1' }}
        onChange={onChange}
        existingNote="This overwrites the student."
      />,
    )
    expect(screen.getByText('This overwrites the student.')).toBeTruthy()
    expect(screen.getByText('Selected: Smith, Alice')).toBeTruthy()
  })

  it('labels candidates with their student code', () => {
    render(
      <StudentMatchList
        candidates={[alice]}
        students={[alice]}
        allowNew={false}
        value={{ mode: 'existing', studentId: 'student-1' }}
        onChange={vi.fn()}
      />,
    )
    expect(
      screen.getByRole('option', { name: 'Smith, Alice (S001)' }),
    ).toBeTruthy()
  })
})
