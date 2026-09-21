import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

import ReasonDialog from './ReasonDialog'

function renderDialog(
  overrides: Partial<React.ComponentProps<typeof ReasonDialog>> = {},
): void {
  render(
    <ReasonDialog
      title="Reject registration"
      confirmLabel="Reject"
      pendingLabel="Rejecting…"
      onConfirm={vi.fn().mockResolvedValue(undefined)}
      onClose={vi.fn()}
      {...overrides}
    />,
  )
}

function submit(): void {
  fireEvent.submit(screen.getByLabelText(/Reason/).closest('form')!)
}

describe('ReasonDialog', () => {
  it('renders inside the reason-dialog test id', () => {
    renderDialog()
    expect(screen.getByTestId('reason-dialog').textContent).toContain(
      'Reject registration',
    )
  })

  it('requires a reason before it can be submitted', () => {
    renderDialog()
    const textarea = screen.getByLabelText(/Reason/) as HTMLTextAreaElement
    expect(textarea.required).toBe(true)
    expect(textarea.name).toBe('reason')
  })

  it('passes the typed reason to onConfirm', async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined)
    renderDialog({ onConfirm })

    fireEvent.change(screen.getByLabelText(/Reason/), {
      target: { value: 'Duplicate' },
    })
    submit()

    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith('Duplicate'))
  })

  it('shows the reason field error returned by the action', async () => {
    renderDialog({
      onConfirm: vi.fn().mockResolvedValue({
        error: 'Required',
        fieldErrors: { reason: 'Required' },
      }),
    })

    fireEvent.change(screen.getByLabelText(/Reason/), {
      target: { value: '   ' },
    })
    submit()

    await waitFor(() =>
      expect(screen.getByLabelText(/Reason/).getAttribute('aria-invalid')).toBe(
        'true',
      ),
    )
  })

  it('shows a general error inline', async () => {
    renderDialog({
      onConfirm: vi.fn().mockResolvedValue({ error: 'Not authorised' }),
    })

    fireEvent.change(screen.getByLabelText(/Reason/), {
      target: { value: 'Cannot match' },
    })
    submit()

    expect((await screen.findByRole('alert')).textContent).toBe(
      'Not authorised',
    )
  })

  it('uses the custom reason label and a red confirm by default', () => {
    renderDialog({ reasonLabel: 'Why?' })
    expect(screen.getByLabelText(/Why\?/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Reject' }).className).toContain(
      'bg-red-600',
    )
  })

  it('calls onClose when Cancel is clicked', () => {
    const onClose = vi.fn()
    renderDialog({ onClose })
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onClose).toHaveBeenCalled()
  })
})
