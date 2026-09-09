import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

import RegistrationRetentionTab from './RegistrationRetentionTab'

vi.mock('./PurgeSubmissionsCard', () => ({
  default: () => <div data-testid="purge-card" />,
}))

describe('RegistrationRetentionTab', () => {
  it('renders the purge submissions card', () => {
    render(<RegistrationRetentionTab />)
    expect(screen.getByTestId('purge-card')).toBeTruthy()
  })
})
