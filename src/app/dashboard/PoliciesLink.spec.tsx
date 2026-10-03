import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'

import PoliciesLink from './PoliciesLink'

describe('PoliciesLink', () => {
  it('links to the school policies on the website in a new tab', () => {
    render(<PoliciesLink />)

    const link = screen.getByRole('link', { name: 'School policies' })
    expect(link).toHaveAttribute('href', 'https://www.hshb.org.uk/policies')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  })
})
