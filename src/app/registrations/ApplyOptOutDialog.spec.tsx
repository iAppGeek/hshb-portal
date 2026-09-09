import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

import { applyPhotoOptOutAction } from './photo-opt-out-actions'
import ApplyOptOutDialog from './ApplyOptOutDialog'

vi.mock('./photo-opt-out-actions', () => ({
  applyPhotoOptOutAction: vi.fn(),
}))

beforeEach(() => {
  vi.clearAllMocks()
})

const studentsForLinking = [
  {
    id: 'student-1',
    first_name: 'Alice',
    last_name: 'Student',
    date_of_birth: '2015-06-01',
    student_code: 'S001',
    active: true,
  },
  {
    id: 'student-2',
    first_name: 'Bob',
    last_name: 'Student',
    date_of_birth: '2016-01-01',
    student_code: null,
    active: true,
  },
]

function submitForm() {
  fireEvent.submit(
    screen.getByRole('button', { name: 'Apply opt-out' }).closest('form')!,
  )
}

describe('ApplyOptOutDialog', () => {
  it('pre-selects the first match when one exists', () => {
    render(
      <ApplyOptOutDialog
        requestId="req-1"
        matches={[studentsForLinking[0]]}
        studentsForLinking={studentsForLinking}
        onClose={vi.fn()}
      />,
    )
    expect(screen.getByText(/Selected: Student, Alice/)).toBeTruthy()
  })

  it('disables Apply until a student is selected', () => {
    render(
      <ApplyOptOutDialog
        requestId="req-1"
        matches={[]}
        studentsForLinking={studentsForLinking}
        onClose={vi.fn()}
      />,
    )
    expect(screen.getByRole('button', { name: 'Apply opt-out' })).toBeDisabled()
  })

  it('filters the student search after 5 characters', () => {
    render(
      <ApplyOptOutDialog
        requestId="req-1"
        matches={[]}
        studentsForLinking={studentsForLinking}
        onClose={vi.fn()}
      />,
    )

    const search = screen.getByLabelText('Search all students')
    fireEvent.change(search, { target: { value: 'Ali' } })
    expect(screen.queryByText(/Student, Alice/)).toBeNull()

    fireEvent.change(search, { target: { value: 'Alice' } })
    expect(screen.getByText(/Student, Alice/)).toBeTruthy()
  })

  it('submits with the selected student_id', async () => {
    vi.mocked(applyPhotoOptOutAction).mockResolvedValue(undefined)
    render(
      <ApplyOptOutDialog
        requestId="req-1"
        matches={[studentsForLinking[0]]}
        studentsForLinking={studentsForLinking}
        onClose={vi.fn()}
      />,
    )

    submitForm()

    await waitFor(() => {
      expect(applyPhotoOptOutAction).toHaveBeenCalledWith(
        'req-1',
        expect.any(FormData),
      )
    })
    const formData = vi.mocked(applyPhotoOptOutAction).mock
      .calls[0][1] as FormData
    expect(formData.get('student_id')).toBe('student-1')
  })

  it('shows the error returned by the action', async () => {
    vi.mocked(applyPhotoOptOutAction).mockResolvedValue({
      error: 'Student not found',
    })
    render(
      <ApplyOptOutDialog
        requestId="req-1"
        matches={[studentsForLinking[0]]}
        studentsForLinking={studentsForLinking}
        onClose={vi.fn()}
      />,
    )

    submitForm()

    await waitFor(() => {
      expect(screen.getByText('Student not found')).toBeTruthy()
    })
  })

  it('calls onClose when Cancel is clicked', () => {
    const onClose = vi.fn()
    render(
      <ApplyOptOutDialog
        requestId="req-1"
        matches={[]}
        studentsForLinking={studentsForLinking}
        onClose={onClose}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onClose).toHaveBeenCalled()
  })
})
