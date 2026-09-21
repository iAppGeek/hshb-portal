import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'

vi.mock('next/link', () => ({
  default: ({
    children,
    href,
  }: {
    children: React.ReactNode
    href: string
  }) => <a href={href}>{children}</a>,
}))

vi.mock('../actions', () => ({
  createIncidentAction: vi.fn(),
}))

import { createIncidentAction } from '../actions'

import AddIncidentForm from './AddIncidentForm'

const students = [
  { id: 'student-1', first_name: 'Anna', last_name: 'Papadopoulos' },
  { id: 'student-2', first_name: 'Nikos', last_name: 'Georgiou' },
]

function renderForm(): void {
  render(
    <AddIncidentForm students={students} staffId="staff-1" type="medical" />,
  )
}

async function submit(): Promise<void> {
  const form = screen
    .getByRole('button', { name: 'Add Incident' })
    .closest('form')
  if (!form) throw new Error('form not found')
  await act(async () => {
    fireEvent.submit(form)
  })
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('AddIncidentForm', () => {
  it('shows the student error under the search input, linked for assistive tech', async () => {
    vi.mocked(createIncidentAction).mockResolvedValue({
      error: 'Please select a student.',
      fieldErrors: { student_id: 'Please select a student.' },
    })
    renderForm()

    await submit()

    const search = screen.getByLabelText(/Student/)
    expect(search).toHaveAttribute('aria-invalid', 'true')
    expect(search).toHaveAttribute('aria-describedby', 'student_id-error')
    expect(document.getElementById('student_id-error')).toHaveTextContent(
      'Please select a student.',
    )
  })

  it('submits the selected student id', async () => {
    vi.mocked(createIncidentAction).mockResolvedValue(undefined)
    renderForm()

    const search = screen.getByLabelText(/Student/)
    fireEvent.change(search, { target: { value: 'Anna' } })
    fireEvent.mouseDown(screen.getByText('Papadopoulos, Anna'))
    await submit()

    const fd = vi.mocked(createIncidentAction).mock.calls[0][0]
    expect(fd.get('student_id')).toBe('student-1')
  })
})
