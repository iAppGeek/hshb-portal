import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'

import StatusBadge from './StatusBadge'

describe('StatusBadge', () => {
  it.each([
    ['pending', 'bg-yellow-100'],
    ['actioned', 'bg-green-100'],
    ['rejected', 'bg-red-100'],
    ['unknown', 'bg-gray-100'],
  ])('colours %s with %s', (status, colour) => {
    render(<StatusBadge status={status} />)
    expect(screen.getByText(status).className).toContain(colour)
  })
})
