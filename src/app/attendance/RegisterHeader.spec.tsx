import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'

import RegisterHeader from './RegisterHeader'

describe('RegisterHeader', () => {
  it('shows the class, date and date label', () => {
    render(
      <RegisterHeader
        className="Year 3A"
        date="2024-06-15"
        dateLabel="Historical"
        taken={false}
      />,
    )

    expect(screen.getByText(/Year 3A/)).toBeTruthy()
    expect(screen.getByText(/2024-06-15/)).toBeTruthy()
    expect(screen.getByText('Historical')).toBeTruthy()
  })

  it('shows the already-taken notice only when taken', () => {
    const { rerender } = render(
      <RegisterHeader
        className="Year 3A"
        date="2024-06-15"
        dateLabel="Today"
        taken={false}
      />,
    )
    expect(screen.queryByText('(register already taken)')).toBeNull()

    rerender(
      <RegisterHeader
        className="Year 3A"
        date="2024-06-15"
        dateLabel="Today"
        taken
      />,
    )
    expect(screen.getByText('(register already taken)')).toBeTruthy()
  })

  it('renders the actions slot when given', () => {
    render(
      <RegisterHeader
        className="Year 3A"
        date="2024-06-15"
        dateLabel="Future"
        taken={false}
        actions={<button type="button">Email class</button>}
      />,
    )

    expect(screen.getByRole('button', { name: 'Email class' })).toBeTruthy()
  })
})
