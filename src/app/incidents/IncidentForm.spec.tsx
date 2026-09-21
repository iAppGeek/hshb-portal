import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'

import type { IncidentRow } from '@/db'

import IncidentForm from './IncidentForm'

vi.mock('next/link', () => ({
  default: ({
    children,
    href,
  }: {
    children: React.ReactNode
    href: string
  }) => <a href={href}>{children}</a>,
}))

const students = [
  { id: 'student-1', first_name: 'Anna', last_name: 'Papadopoulos' },
  { id: 'student-2', first_name: 'Nikos', last_name: 'Georgiou' },
]

const incident = {
  id: 'incident-1',
  type: 'behaviour',
  student_id: 'student-1',
  title: 'Pushed in line',
  description: 'Pushed another pupil',
  incident_date: '2026-03-21T09:30:00Z',
  parent_notified: true,
  parent_notified_at: '2026-03-21T12:00:00Z',
  student: { id: 'student-1', first_name: 'Anna', last_name: 'Papadopoulos' },
} as IncidentRow

async function submit(label: string): Promise<void> {
  const form = screen.getByRole('button', { name: label }).closest('form')
  if (!form) throw new Error('form not found')
  await act(async () => {
    fireEvent.submit(form)
  })
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('IncidentForm', () => {
  it('picks a type and a student when recording an incident', async () => {
    const action = vi.fn().mockResolvedValue(undefined)
    render(
      <IncidentForm
        students={students}
        defaultType="behaviour"
        action={action}
        submitLabel="Add Incident"
      />,
    )

    expect((screen.getByLabelText(/Type/) as HTMLSelectElement).value).toBe(
      'behaviour',
    )
    expect(screen.getByRole('link', { name: 'Cancel' })).toHaveAttribute(
      'href',
      '/incidents?tab=behaviour',
    )
    expect(screen.queryByLabelText(/Date & time notified/)).toBeNull()

    fireEvent.change(screen.getByLabelText(/Student/), {
      target: { value: 'Anna' },
    })
    fireEvent.mouseDown(screen.getByText('Papadopoulos, Anna'))
    await submit('Add Incident')

    const fd = action.mock.calls[0][0] as FormData
    expect(fd.get('student_id')).toBe('student-1')
    expect(fd.get('type')).toBe('behaviour')
    expect(fd.get('parent_notified')).toBe('false')
  })

  it('shows the student error under the search input', async () => {
    const action = vi.fn().mockResolvedValue({
      error: 'Please select a student.',
      fieldErrors: { student_id: 'Please select a student.' },
    })
    render(
      <IncidentForm
        students={students}
        action={action}
        submitLabel="Add Incident"
      />,
    )

    await submit('Add Incident')

    expect(screen.getByLabelText(/Student/)).toHaveAttribute(
      'aria-invalid',
      'true',
    )
    expect(document.getElementById('student_id-error')).toHaveTextContent(
      'Please select a student.',
    )
  })

  it('keeps the type and student fixed when editing', async () => {
    const action = vi.fn().mockResolvedValue(undefined)
    const { container } = render(
      <IncidentForm
        initial={incident}
        students={[]}
        action={action}
        submitLabel="Save changes"
      />,
    )

    expect(screen.queryByLabelText(/Type/)).toBeNull()
    expect(container.querySelector('[name="student_id"]')).toBeNull()
    expect(screen.getByText('Papadopoulos, Anna')).toBeTruthy()
    expect((screen.getByLabelText(/Title/) as HTMLInputElement).value).toBe(
      'Pushed in line',
    )
    expect(screen.getByLabelText(/Date & time notified/)).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Cancel' })).toHaveAttribute(
      'href',
      '/incidents?tab=behaviour',
    )

    await submit('Save changes')

    const fd = action.mock.calls[0][0] as FormData
    expect(fd.get('type')).toBe('behaviour')
    expect(fd.get('parent_notified')).toBe('true')
  })
})
