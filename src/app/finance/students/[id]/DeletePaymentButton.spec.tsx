import { describe, it, expect, vi, afterEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

import DeletePaymentButton from './DeletePaymentButton'

afterEach(() => {
  vi.restoreAllMocks()
})

function renderButton(
  action: (id: string) => Promise<{ error: string } | void>,
): void {
  render(
    <DeletePaymentButton paymentId="pay1" reference="REF-1" action={action} />,
  )
}

describe('DeletePaymentButton', () => {
  it('does nothing when the confirmation is cancelled', () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const action = vi.fn()
    renderButton(action)

    fireEvent.click(
      screen.getByRole('button', { name: 'Delete payment REF-1' }),
    )

    expect(confirm).toHaveBeenCalledWith(
      'Delete payment REF-1? This cannot be undone.',
    )
    expect(action).not.toHaveBeenCalled()
  })

  it('deletes the payment once confirmed', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const action = vi.fn().mockResolvedValue(undefined)
    renderButton(action)

    fireEvent.click(
      screen.getByRole('button', { name: 'Delete payment REF-1' }),
    )

    await waitFor(() => expect(action).toHaveBeenCalledWith('pay1'))
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('shows an error when deleting fails', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    renderButton(vi.fn().mockResolvedValue({ error: 'Gone' }))

    fireEvent.click(
      screen.getByRole('button', { name: 'Delete payment REF-1' }),
    )

    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toBe('Gone'),
    )
  })
})
