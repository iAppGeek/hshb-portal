import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

import { purgeActionedSubmissionsAction } from './actions'
import PurgeSubmissionsCard from './PurgeSubmissionsCard'

vi.mock('./actions', () => ({
  purgeActionedSubmissionsAction: vi.fn(),
}))

beforeEach(() => {
  vi.clearAllMocks()
})

describe('PurgeSubmissionsCard', () => {
  it('renders the card copy', () => {
    render(<PurgeSubmissionsCard />)
    expect(screen.getByText('Purge actioned registrations')).toBeTruthy()
    expect(screen.getByText(/actioned more than 90 days ago/)).toBeTruthy()
  })

  it('shows the removed count on success', async () => {
    vi.mocked(purgeActionedSubmissionsAction).mockResolvedValue({
      success: true,
      removed: 3,
    })
    render(<PurgeSubmissionsCard />)

    fireEvent.click(screen.getByRole('button', { name: 'Purge now' }))

    await waitFor(() => {
      expect(screen.getByText('3 records removed.')).toBeTruthy()
    })
  })

  it('shows the singular form for one removed record', async () => {
    vi.mocked(purgeActionedSubmissionsAction).mockResolvedValue({
      success: true,
      removed: 1,
    })
    render(<PurgeSubmissionsCard />)

    fireEvent.click(screen.getByRole('button', { name: 'Purge now' }))

    await waitFor(() => {
      expect(screen.getByText('1 record removed.')).toBeTruthy()
    })
  })

  it('shows the error returned by the action', async () => {
    vi.mocked(purgeActionedSubmissionsAction).mockResolvedValue({
      error: 'Not authorised',
    })
    render(<PurgeSubmissionsCard />)

    fireEvent.click(screen.getByRole('button', { name: 'Purge now' }))

    await waitFor(() => {
      expect(screen.getByText('Not authorised')).toBeTruthy()
    })
  })
})
