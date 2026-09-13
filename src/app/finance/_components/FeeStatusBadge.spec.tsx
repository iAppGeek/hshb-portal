import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'

import FeeStatusBadge from './FeeStatusBadge'

describe('FeeStatusBadge', () => {
  it.each([
    ['paid_in_full', 'Paid in full', 'bg-green-100'],
    ['up_to_date', 'Up to date', 'bg-blue-100'],
    ['behind', 'Behind', 'bg-red-100'],
    ['no_plan', 'No plan', 'bg-gray-100'],
  ] as const)('renders %s', (status, label, colour) => {
    render(<FeeStatusBadge status={status} />)
    expect(screen.getByText(label).className).toContain(colour)
  })
})
