import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'

import { th } from '@/lib/grid/styles'

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
  it('applies the th token class', () => {
    renderTh({ children: 'Name' })
    expect(screen.getByRole('columnheader').className).toBe(th)
  })

  it('renders header text', () => {
    renderTh({ children: 'Year Group' })
    expect(screen.getByText('Year Group')).toBeTruthy()
  })

  it('adds sr-only when meta.srOnlyHeader is set', () => {
    renderTh({ children: 'Actions', meta: { srOnlyHeader: true } })
    expect(screen.getByRole('columnheader').className).toContain('sr-only')
  })

  it('does not add sr-only by default', () => {
    renderTh({ children: 'Actions' })
    expect(screen.getByRole('columnheader').className).not.toContain('sr-only')
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
