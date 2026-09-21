import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'

import StudentSearch from './StudentSearch'

const students = [
  { id: 'student-1', first_name: 'Anna', last_name: 'Papadopoulos' },
  { id: 'student-2', first_name: 'Nikos', last_name: 'Georgiou' },
]

describe('StudentSearch', () => {
  it('lists matching students sorted by last name', () => {
    render(<StudentSearch students={students} onSelect={vi.fn()} />)

    fireEvent.focus(screen.getByLabelText(/Student/))

    const items = screen.getAllByRole('listitem').map((li) => li.textContent)
    expect(items).toEqual(['Georgiou, Nikos', 'Papadopoulos, Anna'])
  })

  it('filters by name and reports the picked id', () => {
    const onSelect = vi.fn()
    render(<StudentSearch students={students} onSelect={onSelect} />)

    fireEvent.change(screen.getByLabelText(/Student/), {
      target: { value: 'anna' },
    })
    expect(screen.queryByText('Georgiou, Nikos')).toBeNull()
    fireEvent.mouseDown(screen.getByText('Papadopoulos, Anna'))

    expect(onSelect).toHaveBeenCalledWith('student-1')
    expect(screen.getByText('Papadopoulos, Anna')).toBeTruthy()
    expect(screen.queryByLabelText(/Student/)).toBeNull()
  })

  it('clears the selection', () => {
    const onSelect = vi.fn()
    render(<StudentSearch students={students} onSelect={onSelect} />)

    fireEvent.change(screen.getByLabelText(/Student/), {
      target: { value: 'Nikos' },
    })
    fireEvent.mouseDown(screen.getByText('Georgiou, Nikos'))
    fireEvent.click(screen.getByLabelText('Clear student selection'))

    expect(onSelect).toHaveBeenLastCalledWith('')
    expect(screen.getByLabelText(/Student/)).toBeTruthy()
  })

  it('says when nothing matches', () => {
    render(<StudentSearch students={students} onSelect={vi.fn()} />)

    fireEvent.change(screen.getByLabelText(/Student/), {
      target: { value: 'zzz' },
    })

    expect(screen.getByText('No students found.')).toBeTruthy()
  })

  it('closes the list on an outside click', () => {
    render(<StudentSearch students={students} onSelect={vi.fn()} />)

    fireEvent.focus(screen.getByLabelText(/Student/))
    fireEvent.mouseDown(document.body)

    expect(screen.queryAllByRole('listitem')).toHaveLength(0)
  })

  it('links the error to the input for assistive tech', () => {
    render(
      <StudentSearch
        students={students}
        onSelect={vi.fn()}
        error="Please select a student."
      />,
    )

    const search = screen.getByLabelText(/Student/)
    expect(search).toHaveAttribute('aria-invalid', 'true')
    expect(search).toHaveAttribute('aria-describedby', 'student_id-error')
    expect(document.getElementById('student_id-error')).toHaveTextContent(
      'Please select a student.',
    )
  })
})
