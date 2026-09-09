import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'

import RegistrationDetailLoading from './loading'

describe('RegistrationDetailLoading', () => {
  it('renders with skeleton animation', () => {
    const { container } = render(<RegistrationDetailLoading />)
    expect(container.querySelector('.animate-pulse')).toBeTruthy()
  })

  it('renders 4 skeleton section cards', () => {
    const { container } = render(<RegistrationDetailLoading />)
    expect(container.querySelectorAll('.rounded-xl').length).toBe(4)
  })
})
