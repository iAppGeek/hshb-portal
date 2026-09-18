import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'

import Th from './Th'

function renderTh(props: React.ComponentProps<typeof Th>) {
  return render(
    <table>
      <thead>
        <tr>
          <Th {...props} />
        </tr>
      </thead>
    </table>,
  )
}

describe('Th', () => {
  it('applies the header token classes', () => {
    renderTh({ children: 'Name' })
    expect(screen.getByRole('columnheader').className).toContain('font-medium')
  })

  it('renders header text', () => {
    renderTh({ children: 'Year Group' })
    expect(screen.getByText('Year Group')).toBeTruthy()
  })

  it('wraps children in a sr-only span when meta.srOnlyHeader is set, keeping the th a real table-cell', () => {
    renderTh({ children: 'Actions', meta: { srOnlyHeader: true } })
    const th = screen.getByRole('columnheader', { name: 'Actions' })
    expect(th.className).not.toContain('sr-only')
    expect(screen.getByText('Actions').className).toContain('sr-only')
  })

  it('does not add sr-only by default', () => {
    renderTh({ children: 'Actions' })
    expect(screen.getByText('Actions').className).not.toContain('sr-only')
  })

  it('right-aligns when meta.align is "right"', () => {
    renderTh({ children: 'Owed', meta: { align: 'right' } })
    expect(screen.getByRole('columnheader').className).toContain('text-right')
  })

  it('appends a caller-supplied className', () => {
    renderTh({ children: 'Name', meta: { className: 'w-40' } })
    expect(screen.getByRole('columnheader').className).toContain('w-40')
  })

  it('sets scope="col"', () => {
    renderTh({ children: 'Name' })
    expect(screen.getByRole('columnheader').getAttribute('scope')).toBe('col')
  })
})
