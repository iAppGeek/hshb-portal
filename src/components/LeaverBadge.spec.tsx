import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'

import LeaverBadge from './LeaverBadge'

describe('LeaverBadge', () => {
  it('renders "Left" for reason left', () => {
    render(<LeaverBadge reason="left" />)
    expect(screen.getByText('Left')).toBeTruthy()
  })

  it('renders "Graduated" for reason graduated', () => {
    render(<LeaverBadge reason="graduated" />)
    expect(screen.getByText('Graduated')).toBeTruthy()
  })

  it('renders "Transferred" for reason transferred', () => {
    render(<LeaverBadge reason="transferred" />)
    expect(screen.getByText('Transferred')).toBeTruthy()
  })

  it('falls back to "Left" for null or an unknown reason', () => {
    render(<LeaverBadge reason={null} />)
    expect(screen.getByText('Left')).toBeTruthy()
  })
})
