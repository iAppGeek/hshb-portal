import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

vi.mock('./actions', () => ({
  markStudentAsLeaverAction: vi.fn(),
}))

import { markStudentAsLeaverAction } from './actions'
import LeaverSection from './LeaverSection'

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(window, 'confirm')
})

describe('LeaverSection', () => {
  it('shows a reason select and a Mark as leaver button', () => {
    render(<LeaverSection studentId="student-1" />)
    expect(screen.getByLabelText('Reason')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Mark as leaver' })).toBeTruthy()
  })

  it('does nothing when the confirmation is declined', () => {
    vi.mocked(window.confirm).mockReturnValue(false)
    render(<LeaverSection studentId="student-1" />)

    fireEvent.click(screen.getByRole('button', { name: 'Mark as leaver' }))

    expect(window.confirm).toHaveBeenCalledWith(
      'Mark this student as a leaver? They will be removed from all classes today.',
    )
    expect(markStudentAsLeaverAction).not.toHaveBeenCalled()
  })

  it('calls the action with the student id when confirmed', async () => {
    vi.mocked(window.confirm).mockReturnValue(true)
    vi.mocked(markStudentAsLeaverAction).mockResolvedValue(undefined)
    render(<LeaverSection studentId="student-1" />)

    fireEvent.click(screen.getByRole('button', { name: 'Mark as leaver' }))

    await waitFor(() => {
      expect(markStudentAsLeaverAction).toHaveBeenCalledWith(
        'student-1',
        expect.any(FormData),
      )
    })
  })

  it('shows the returned error', async () => {
    vi.mocked(window.confirm).mockReturnValue(true)
    vi.mocked(markStudentAsLeaverAction).mockResolvedValue({
      error: 'This student has already left.',
    })
    render(<LeaverSection studentId="student-1" />)

    fireEvent.click(screen.getByRole('button', { name: 'Mark as leaver' }))

    await waitFor(() => {
      expect(screen.getByText('This student has already left.')).toBeTruthy()
    })
  })
})
