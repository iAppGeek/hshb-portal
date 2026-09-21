import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'

import FormSkeleton from './FormSkeleton'

describe('FormSkeleton', () => {
  it('renders the default number of field placeholders', () => {
    const { container } = render(<FormSkeleton />)
    expect(container.querySelectorAll('.h-9.w-full').length).toBe(6)
  })

  it('renders a custom number of field placeholders', () => {
    const { container } = render(<FormSkeleton fields={3} />)
    expect(container.querySelectorAll('.h-9.w-full').length).toBe(3)
  })

  it('is hidden from the accessibility tree', () => {
    const { container } = render(<FormSkeleton />)
    expect(container.firstElementChild?.getAttribute('aria-hidden')).toBe(
      'true',
    )
  })
})
