import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'

import NotFound from './not-found'

describe('NotFound', () => {
  it('renders a not found heading', () => {
    render(<NotFound />)
    expect(screen.getByRole('heading', { name: 'Not found' })).toBeTruthy()
  })

  it('links back to the dashboard', () => {
    render(<NotFound />)
    const link = screen.getByRole('link', { name: /back to dashboard/i })
    expect(link.getAttribute('href')).toBe('/dashboard')
  })
})
