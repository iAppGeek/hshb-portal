import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'

import FormGrid from './FormGrid'

describe('FormGrid', () => {
  it('renders two columns on sm screens by default', () => {
    render(
      <FormGrid>
        <p>Field</p>
      </FormGrid>,
    )
    expect(screen.getByText('Field').parentElement).toHaveClass(
      'sm:grid-cols-2',
    )
  })

  it('renders a single column when cols is 1', () => {
    render(
      <FormGrid cols={1}>
        <p>Field</p>
      </FormGrid>,
    )
    expect(screen.getByText('Field').parentElement).not.toHaveClass(
      'sm:grid-cols-2',
    )
  })
})
