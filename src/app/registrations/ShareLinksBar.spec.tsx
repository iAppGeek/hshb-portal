import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'

import ShareLinksBar from './ShareLinksBar'

describe('ShareLinksBar', () => {
  it('links to the public registration form, opening in a new tab', () => {
    render(<ShareLinksBar />)

    const link = screen.getByRole('link', { name: /Registration form/ })
    expect(link.getAttribute('href')).toBe('/register')
    expect(link.getAttribute('target')).toBe('_blank')
    expect(link.getAttribute('rel')).toBe('noopener noreferrer')
  })

  it('links to the photo consent opt-out form, opening in a new tab', () => {
    render(<ShareLinksBar />)

    const link = screen.getByRole('link', { name: /Photo consent opt-out/ })
    expect(link.getAttribute('href')).toBe('/register/photo-opt-out')
    expect(link.getAttribute('target')).toBe('_blank')
    expect(link.getAttribute('rel')).toBe('noopener noreferrer')
  })
})
