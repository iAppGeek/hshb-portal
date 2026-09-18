import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'

import TableSkeleton from './TableSkeleton'

describe('TableSkeleton', () => {
  it('renders one header cell per column', () => {
    render(<TableSkeleton columns={4} />)
    expect(screen.getAllByRole('columnheader')).toHaveLength(4)
  })

  it('defaults to 6 skeleton rows', () => {
    render(<TableSkeleton columns={3} />)
    expect(screen.getAllByRole('row')).toHaveLength(1 + 6) // header + 6 body rows
  })

  it('renders the given number of rows', () => {
    render(<TableSkeleton columns={3} rows={2} />)
    expect(screen.getAllByRole('row')).toHaveLength(1 + 2)
  })

  it('renders columns * rows body cells', () => {
    render(<TableSkeleton columns={3} rows={2} />)
    expect(screen.getAllByRole('cell')).toHaveLength(6)
  })

  it('applies given widths to the matching column index', () => {
    const { container } = render(
      <TableSkeleton columns={2} rows={1} widths={['10rem', '5rem']} />,
    )
    const bars = container.querySelectorAll('td > div')
    expect((bars[0] as HTMLElement).style.width).toBe('10rem')
    expect((bars[1] as HTMLElement).style.width).toBe('5rem')
  })

  it('falls back to a default width when widths is not given', () => {
    const { container } = render(<TableSkeleton columns={1} rows={1} />)
    const bar = container.querySelector('td > div') as HTMLElement
    expect(bar.style.width).toBe('4rem')
  })

  it('frame="none" omits the card wrapper, keeps the scroll wrapper', () => {
    const { container } = render(
      <TableSkeleton columns={2} rows={1} frame="none" />,
    )
    expect(container.firstElementChild?.className).toContain('overflow-x-auto')
    expect(container.firstElementChild?.className).not.toContain('rounded-xl')
  })
})
