import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'

import ActiveBadge from './ActiveBadge'

describe('ActiveBadge', () => {
  it('renders "Active" when active is true', () => {
    render(<ActiveBadge active={true} />)
    expect(screen.getByText('Active')).toBeTruthy()
  })

  it('renders "Inactive" when active is false', () => {
    render(<ActiveBadge active={false} />)
    expect(screen.getByText('Inactive')).toBeTruthy()
  })
})
