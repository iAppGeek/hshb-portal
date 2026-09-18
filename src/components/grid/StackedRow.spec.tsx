import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'

import type { GridColumn, StackedRowSpec } from '@/lib/grid/columns'

import StackedRow from './StackedRow'

type Row = { id: string; name: string; room: string | null }

const columns: GridColumn<Row>[] = [
  { id: 'room', header: 'Room', cell: (row) => row.room ?? '—' },
]

function renderRow(
  spec: StackedRowSpec<Row>,
  row: Row = { id: '1', name: 'A', room: 'R1' },
) {
  return render(
    <table>
      <tbody>
        <StackedRow row={row} columns={columns} spec={spec} />
      </tbody>
    </table>,
  )
}

describe('StackedRow', () => {
  it('renders the title', () => {
    renderRow({ title: (r) => r.name, details: () => [] })
    expect(screen.getByText('A')).toBeTruthy()
  })

  it('renders the title wrapper as bold and dark (matching main)', () => {
    renderRow({ title: (r) => r.name, details: () => [] })
    const className = screen.getByText('A').className
    expect(className).toContain('font-medium')
    expect(className).toContain('text-gray-900')
  })

  it('renders titleAside next to the title', () => {
    renderRow({
      title: (r) => r.name,
      titleAside: () => <span>Edit</span>,
      details: () => [],
    })
    expect(screen.getByText('Edit')).toBeTruthy()
  })

  it('joins details with " · "', () => {
    const { container } = renderRow({
      title: (r) => r.name,
      details: () => ['R1', 'Ms Smith', '2024/25'],
    })
    const detailsLine = container.querySelector('.text-xs.text-gray-500')
    expect(detailsLine?.textContent).toBe('R1 · Ms Smith · 2024/25')
  })

  it('renders detailsAside', () => {
    renderRow({
      title: (r) => r.name,
      details: () => [],
      detailsAside: () => <button type="button">Details</button>,
    })
    expect(screen.getByRole('button', { name: 'Details' })).toBeTruthy()
  })

  it('renders exactly one summary cell (sm:hidden) plus one desktop cell per column', () => {
    renderRow({ title: (r) => r.name, details: () => [] })
    const cells = screen.getAllByRole('cell')
    // 1 summary td + 1 desktop td for the single `Room` column
    expect(cells).toHaveLength(2)
  })

  it('renders desktop cells hidden on mobile via the "td" hidden-on-mobile token', () => {
    renderRow({ title: (r) => r.name, details: () => [] })
    expect(screen.getByText('R1').className).toContain('hidden')
    expect(screen.getByText('R1').className).toContain('sm:table-cell')
  })

  it('omits the details line entirely when there are no details and no detailsAside', () => {
    const { container } = renderRow({ title: (r) => r.name, details: () => [] })
    // Only the title row div should exist inside the summary cell.
    const summaryCell = container.querySelector('td')
    expect(summaryCell?.children).toHaveLength(1)
  })
})
