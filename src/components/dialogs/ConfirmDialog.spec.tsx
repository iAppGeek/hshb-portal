import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

import type { ActionResult } from '@/lib/action'

import ConfirmDialog from './ConfirmDialog'

function renderDialog(
  overrides: Partial<React.ComponentProps<typeof ConfirmDialog>> = {},
): void {
  render(
    <ConfirmDialog
      title="Delete request"
      body="This cannot be undone."
      confirmLabel="Confirm delete"
      pendingLabel="Deleting…"
      variant="danger"
      onConfirm={vi.fn().mockResolvedValue(undefined)}
      onClose={vi.fn()}
      {...overrides}
    />,
  )
}

describe('ConfirmDialog', () => {
  it('renders the title and body inside the confirm-dialog test id', () => {
    renderDialog()
    const dialog = screen.getByTestId('confirm-dialog')
    expect(dialog.textContent).toContain('Delete request')
    expect(dialog.textContent).toContain('This cannot be undone.')
  })

  it('calls onConfirm when the confirm button is clicked', async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined)
    renderDialog({ onConfirm })

    fireEvent.click(screen.getByRole('button', { name: 'Confirm delete' }))

    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1))
  })

  it('shows the pending label and disables confirm while the action runs', async () => {
    let resolve: (value: ActionResult) => void = () => {}
    const onConfirm = vi.fn(
      () => new Promise<ActionResult>((r) => (resolve = r)),
    )
    renderDialog({ onConfirm })

    fireEvent.click(screen.getByRole('button', { name: 'Confirm delete' }))

    const pending = await screen.findByRole('button', { name: 'Deleting…' })
    expect(pending).toBeDisabled()
    resolve(undefined)
    await screen.findByRole('button', { name: 'Confirm delete' })
  })

  it('shows the returned error inline', async () => {
    renderDialog({
      onConfirm: vi.fn().mockResolvedValue({ error: 'Not authorised' }),
    })

    fireEvent.click(screen.getByRole('button', { name: 'Confirm delete' }))

    expect((await screen.findByRole('alert')).textContent).toBe(
      'Not authorised',
    )
  })

  it('uses red for the danger variant', () => {
    renderDialog()
    expect(
      screen.getByRole('button', { name: 'Confirm delete' }).className,
    ).toContain('bg-red-600')
  })

  it('uses blue for the primary variant', () => {
    renderDialog({ variant: 'primary', confirmLabel: 'Go' })
    expect(screen.getByRole('button', { name: 'Go' }).className).toContain(
      'bg-blue-600',
    )
  })

  it('calls onClose when Cancel is clicked', () => {
    const onClose = vi.fn()
    renderDialog({ onClose })
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onClose).toHaveBeenCalled()
  })
})
