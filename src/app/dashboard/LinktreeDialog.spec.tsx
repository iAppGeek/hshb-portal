import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import LinktreeDialog from './LinktreeDialog'

const LINKTREE_URL = 'https://www.hshb.org.uk/linktree?t=jsmith'

describe('LinktreeDialog', () => {
  let clipboardWriteText: ReturnType<typeof vi.fn>

  beforeEach(() => {
    clipboardWriteText = vi.fn().mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  function renderDialog(onClose = vi.fn()): ReturnType<typeof userEvent.setup> {
    const user = userEvent.setup()
    // After setup(), which installs user-event's own clipboard stub.
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: clipboardWriteText },
      configurable: true,
      writable: true,
    })
    render(<LinktreeDialog url={LINKTREE_URL} onClose={onClose} />)
    return user
  }

  it('shows a QR code and the URL', () => {
    renderDialog()

    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(
      screen.getByRole('img', { name: 'QR code for the Linktree' }),
    ).toBeTruthy()
    expect(screen.getByText(LINKTREE_URL)).toBeTruthy()
  })

  it('links to the Linktree in a new tab', () => {
    renderDialog()

    const link = screen.getByRole('link', { name: /open linktree/i })
    expect(link).toHaveAttribute('href', LINKTREE_URL)
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  })

  it('copies the URL to the clipboard', async () => {
    const user = renderDialog()

    await user.click(screen.getByRole('button', { name: 'Copy link' }))

    expect(clipboardWriteText).toHaveBeenCalledWith(LINKTREE_URL)
    expect(screen.getByRole('button', { name: 'Copied' })).toBeTruthy()
  })

  it('says when the copy fails', async () => {
    clipboardWriteText.mockRejectedValue(new Error('denied'))
    const user = renderDialog()

    await user.click(screen.getByRole('button', { name: 'Copy link' }))

    expect(screen.getByRole('button', { name: 'Copy failed' })).toBeTruthy()
  })

  it('calls onClose from the Close button', async () => {
    const onClose = vi.fn()
    const user = renderDialog(onClose)

    await user.click(screen.getByRole('button', { name: 'Close' }))

    expect(onClose).toHaveBeenCalledOnce()
  })
})
