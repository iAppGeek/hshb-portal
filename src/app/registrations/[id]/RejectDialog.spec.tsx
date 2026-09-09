import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

import { rejectRegistrationAction } from '../actions'

import RejectDialog from './RejectDialog'

vi.mock('../actions', () => ({
  rejectRegistrationAction: vi.fn(),
}))

beforeEach(() => {
  vi.clearAllMocks()
})

describe('RejectDialog', () => {
  it('requires a reason before it can be submitted', () => {
    render(<RejectDialog submissionId="sub-1" onClose={vi.fn()} />)
    const textarea = screen.getByLabelText(/Reason/) as HTMLTextAreaElement
    expect(textarea.required).toBe(true)
  })

  it('submits the reason to rejectRegistrationAction', async () => {
    vi.mocked(rejectRegistrationAction).mockResolvedValue(undefined)
    render(<RejectDialog submissionId="sub-1" onClose={vi.fn()} />)

    fireEvent.change(screen.getByLabelText(/Reason/), {
      target: { value: 'Duplicate submission' },
    })
    fireEvent.submit(screen.getByLabelText(/Reason/).closest('form')!)

    await waitFor(() => {
      expect(rejectRegistrationAction).toHaveBeenCalledWith(
        'sub-1',
        expect.any(FormData),
      )
    })
  })

  it('shows the error returned by the action', async () => {
    vi.mocked(rejectRegistrationAction).mockResolvedValue({
      error: 'Not authorised',
    })
    render(<RejectDialog submissionId="sub-1" onClose={vi.fn()} />)

    fireEvent.change(screen.getByLabelText(/Reason/), {
      target: { value: 'Duplicate' },
    })
    fireEvent.submit(screen.getByLabelText(/Reason/).closest('form')!)

    await waitFor(() => {
      expect(screen.getByText('Not authorised')).toBeTruthy()
    })
  })

  it('calls onClose when Cancel is clicked', () => {
    const onClose = vi.fn()
    render(<RejectDialog submissionId="sub-1" onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onClose).toHaveBeenCalled()
  })
})
