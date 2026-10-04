import { describe, it, expect, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'

import LinktreeTile from './LinktreeTile'

// The dialog chunk failing to load, e.g. a stale tab after a deploy.
vi.mock('./LinktreeDialog', () => {
  throw new Error('Failed to fetch dynamically imported module')
})

// fireEvent rather than user-event: user.click also fires pointerenter, and
// vitest serves the real module to the second of two concurrent imports of a
// failing mock, so the prefetch and the click must not overlap here.
describe('LinktreeTile when the dialog fails to load', () => {
  function renderTile(): HTMLElement {
    render(<LinktreeTile url="https://www.hshb.org.uk/linktree?t=jsmith" />)
    return screen.getByRole('button', { name: /linktree/i })
  }

  it('ignores a failed prefetch on hover', async () => {
    const tile = renderTile()

    // An unhandled rejection here would fail the run.
    await act(async () => {
      fireEvent.pointerEnter(tile)
    })

    expect(screen.queryByText(/couldn't open/i)).toBeNull()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('shows a retry message on the tile instead of throwing', async () => {
    const tile = renderTile()

    fireEvent.click(tile)

    expect(await screen.findByText(/couldn't open/i)).toHaveAttribute(
      'role',
      'status',
    )
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
