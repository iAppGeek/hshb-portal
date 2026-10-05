import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

import { withdrawPhotoVideoConsentAction } from '../../actions'

import WithdrawPhotoConsentButton from './WithdrawPhotoConsentButton'

vi.mock('../../actions', () => ({
  withdrawPhotoVideoConsentAction: vi.fn(),
}))

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(withdrawPhotoVideoConsentAction).mockResolvedValue(undefined)
})

describe('WithdrawPhotoConsentButton', () => {
  it('asks for confirmation before withdrawing', () => {
    render(<WithdrawPhotoConsentButton studentId="student-1" />)

    fireEvent.click(
      screen.getByRole('button', { name: 'Withdraw photo consent' }),
    )

    expect(screen.getByRole('dialog')).toHaveTextContent(
      'Your name and the time will be kept with the record.',
    )
    expect(withdrawPhotoVideoConsentAction).not.toHaveBeenCalled()
  })

  it('withdraws consent for the student once confirmed', async () => {
    render(<WithdrawPhotoConsentButton studentId="student-1" />)

    fireEvent.click(
      screen.getByRole('button', { name: 'Withdraw photo consent' }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Withdraw consent' }))

    await waitFor(() => {
      expect(withdrawPhotoVideoConsentAction).toHaveBeenCalledWith('student-1')
    })
  })

  it('shows an error the action returns', async () => {
    vi.mocked(withdrawPhotoVideoConsentAction).mockResolvedValue({
      error: 'Failed to withdraw photo consent. Please try again.',
    })
    render(<WithdrawPhotoConsentButton studentId="student-1" />)

    fireEvent.click(
      screen.getByRole('button', { name: 'Withdraw photo consent' }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Withdraw consent' }))

    expect(
      await screen.findByText(
        'Failed to withdraw photo consent. Please try again.',
      ),
    ).toBeTruthy()
  })
})
