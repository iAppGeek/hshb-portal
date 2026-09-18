import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'

import PrintPageSetup from './PrintPageSetup'

describe('PrintPageSetup', () => {
  it('renders a style tag with the shared @page setup', () => {
    const { container } = render(<PrintPageSetup />)
    const style = container.querySelector('style')
    expect(style).not.toBeNull()
    expect(style?.textContent).toContain(
      '@page { size: A4 portrait; margin: 10mm; }',
    )
    expect(style?.textContent).toContain(
      'a[href]::after { content: none !important; }',
    )
  })
})
