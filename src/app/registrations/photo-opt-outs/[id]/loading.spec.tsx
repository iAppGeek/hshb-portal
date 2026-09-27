import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'

import PhotoOptOutDetailLoading from './loading'

describe('PhotoOptOutDetailLoading', () => {
  it('renders with skeleton animation', () => {
    const { container } = render(<PhotoOptOutDetailLoading />)
    expect(container.querySelector('.animate-pulse')).toBeTruthy()
  })

  it('renders 3 skeleton section cards', () => {
    const { container } = render(<PhotoOptOutDetailLoading />)
    expect(container.querySelectorAll('.rounded-xl').length).toBe(3)
  })
})
