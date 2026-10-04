import { describe, it, expect } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import LinktreeTile from './LinktreeTile'

const LINKTREE_URL = 'https://www.hshb.org.uk/linktree?t=jsmith'

describe('LinktreeTile', () => {
  it('renders a button, not a link, and no dialog until clicked', () => {
    render(<LinktreeTile url={LINKTREE_URL} />)

    expect(screen.getByRole('button', { name: /linktree/i })).toBeTruthy()
    expect(screen.queryByRole('link')).toBeNull()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('loads the dialog for its URL on click and closes it', async () => {
    const user = userEvent.setup()
    render(<LinktreeTile url={LINKTREE_URL} />)

    await user.click(screen.getByRole('button', { name: /linktree/i }))

    expect(await screen.findByRole('dialog')).toBeTruthy()
    expect(screen.getByText(LINKTREE_URL)).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'Close' }))

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull()
    })
  })
})
