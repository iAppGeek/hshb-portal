import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'

import ResultCount from './ResultCount'

describe('ResultCount', () => {
  it('renders the count sentence', () => {
    render(<ResultCount count={3} total={10} noun="students" />)
    expect(screen.getByText('Showing 3 of 10 students')).toBeTruthy()
  })

  it('renders a zero count', () => {
    render(<ResultCount count={0} total={5} noun="results" />)
    expect(screen.getByText('Showing 0 of 5 results')).toBeTruthy()
  })
})
