import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

import DialogFrame, { DialogButtons } from './DialogFrame'

describe('DialogFrame', () => {
  it('renders the title, description and children under the test id', () => {
    render(
      <DialogFrame
        title="A title"
        description="Some context"
        testId="frame"
        onClose={vi.fn()}
      >
        <p>Body</p>
      </DialogFrame>,
    )
    const frame = screen.getByTestId('frame')
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(frame.textContent).toContain('A title')
    expect(frame.textContent).toContain('Some context')
    expect(frame.textContent).toContain('Body')
  })

  it('widens the panel for the lg size', () => {
    render(
      <DialogFrame title="Wide" size="lg" testId="frame" onClose={vi.fn()}>
        <p>Body</p>
      </DialogFrame>,
    )
    expect(screen.getByTestId('frame').className).toContain('max-w-lg')
  })
})

describe('DialogButtons', () => {
  it('disables confirm when disabled even if not pending', () => {
    render(
      <DialogButtons
        confirmLabel="Go"
        pendingLabel="Going…"
        isPending={false}
        disabled
        error={null}
        onCancel={vi.fn()}
      />,
    )
    expect(screen.getByRole('button', { name: 'Go' })).toBeDisabled()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('shows the pending label, the error, and wires Cancel', () => {
    const onCancel = vi.fn()
    render(
      <DialogButtons
        confirmLabel="Go"
        pendingLabel="Going…"
        isPending
        error="Nope"
        onCancel={onCancel}
      />,
    )
    expect(screen.getByRole('button', { name: 'Going…' })).toBeDisabled()
    expect(screen.getByRole('alert').textContent).toBe('Nope')
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onCancel).toHaveBeenCalled()
  })

  it('leaves the initial focus to Headless UI by default', () => {
    render(
      <DialogButtons
        confirmLabel="Go"
        pendingLabel="Going…"
        isPending={false}
        error={null}
        onCancel={vi.fn()}
      />,
    )
    expect(screen.getByRole('button', { name: 'Cancel' })).not.toHaveAttribute(
      'data-autofocus',
    )
  })

  it('marks Cancel as the autofocus target when asked', () => {
    render(
      <DialogButtons
        confirmLabel="Go"
        pendingLabel="Going…"
        isPending={false}
        autoFocusCancel
        error={null}
        onCancel={vi.fn()}
      />,
    )
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveAttribute(
      'data-autofocus',
    )
    expect(screen.getByRole('button', { name: 'Go' })).not.toHaveAttribute(
      'data-autofocus',
    )
  })
})
