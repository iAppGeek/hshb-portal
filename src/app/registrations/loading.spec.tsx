import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'

import RegistrationsLoading from './loading'

describe('RegistrationsLoading', () => {
  it('renders with skeleton animation', () => {
    const { container } = render(<RegistrationsLoading />)
    expect(container.querySelector('.animate-pulse')).toBeTruthy()
  })

  it('renders 8 skeleton table rows', () => {
    const { container } = render(<RegistrationsLoading />)
    const rows = container.querySelectorAll('tbody tr')
    expect(rows.length).toBe(8)
  })

  it('renders 6 skeleton column headers matching the registrations table columns', () => {
    const { container } = render(<RegistrationsLoading />)
    const headers = container.querySelectorAll('thead th')
    expect(headers.length).toBe(6)
  })
})
