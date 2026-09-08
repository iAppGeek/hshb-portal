import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'

import PhotoOptOutSuccessPage from './page'

describe('PhotoOptOutSuccessPage', () => {
  it('renders the thank-you copy and a link back to the school site', () => {
    render(<PhotoOptOutSuccessPage />)

    expect(screen.getByText(/we've received your request/)).toBeTruthy()
    const link = screen.getByRole('link', { name: /back to hshb.org.uk/i })
    expect(link.getAttribute('href')).toBe('https://hshb.org.uk')
  })
})
