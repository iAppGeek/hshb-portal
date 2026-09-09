import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

import { rejectPhotoOptOutAction } from './photo-opt-out-actions'
import RejectOptOutDialog from './RejectOptOutDialog'

vi.mock('./photo-opt-out-actions', () => ({
  rejectPhotoOptOutAction: vi.fn(),
}))

beforeEach(() => {
  vi.clearAllMocks()
})

describe('RejectOptOutDialog', () => {
  it('requires a reason before it can be submitted', () => {
    render(<RejectOptOutDialog requestId="req-1" onClose={vi.fn()} />)
    const textarea = screen.getByLabelText(/Reason/) as HTMLTextAreaElement
    expect(textarea.required).toBe(true)
  })

  it('submits the reason to rejectPhotoOptOutAction', async () => {
    vi.mocked(rejectPhotoOptOutAction).mockResolvedValue(undefined)
    render(<RejectOptOutDialog requestId="req-1" onClose={vi.fn()} />)

    fireEvent.change(screen.getByLabelText(/Reason/), {
      target: { value: 'Cannot match to a student' },
    })
    fireEvent.submit(screen.getByLabelText(/Reason/).closest('form')!)

    await waitFor(() => {
      expect(rejectPhotoOptOutAction).toHaveBeenCalledWith(
        'req-1',
        expect.any(FormData),
      )
    })
  })

  it('shows the error returned by the action', async () => {
    vi.mocked(rejectPhotoOptOutAction).mockResolvedValue({
      error: 'Not authorised',
    })
    render(<RejectOptOutDialog requestId="req-1" onClose={vi.fn()} />)

    fireEvent.change(screen.getByLabelText(/Reason/), {
      target: { value: 'Cannot match' },
    })
    fireEvent.submit(screen.getByLabelText(/Reason/).closest('form')!)

    await waitFor(() => {
      expect(screen.getByText('Not authorised')).toBeTruthy()
    })
  })

  it('calls onClose when Cancel is clicked', () => {
    const onClose = vi.fn()
    render(<RejectOptOutDialog requestId="req-1" onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onClose).toHaveBeenCalled()
  })
})
