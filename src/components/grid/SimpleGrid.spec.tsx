import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'

import type { GridColumn, StackedRowSpec } from '@/lib/grid/columns'

import SimpleGrid from './SimpleGrid'

type Row = { id: string; name: string; room: string | null }

const rows: Row[] = [
  { id: '1', name: 'Year 1A', room: 'R1' },
  { id: '2', name: 'Year 2B', room: null },
]

const columns: GridColumn<Row>[] = [
  { id: 'name', header: 'Name', cell: (row) => row.name },
  { id: 'room', header: 'Room', cell: (row) => row.room ?? '—' },
  {
    id: 'actions',
    header: 'Actions',
    srOnlyHeader: true,
    cell: (row) => <a href={`/rows/${row.id}`}>Details</a>,
  },
]

const stackedSpec: StackedRowSpec<Row> = {
  title: (row) => row.name,
  details: (row) => [row.room ?? '—'],
}

describe('SimpleGrid', () => {
  it('renders a header per column', () => {
    render(<SimpleGrid columns={columns} rows={rows} getRowKey={(r) => r.id} />)
    expect(screen.getByRole('columnheader', { name: 'Name' })).toBeTruthy()
    expect(screen.getByRole('columnheader', { name: 'Room' })).toBeTruthy()
  })

  it('applies sr-only to columns marked srOnlyHeader, without hiding the th itself', () => {
    render(<SimpleGrid columns={columns} rows={rows} getRowKey={(r) => r.id} />)
    const th = screen.getByRole('columnheader', { name: 'Actions' })
    expect(th.className).not.toContain('sr-only')
    expect(screen.getByText('Actions').className).toContain('sr-only')
  })

  it('renders an EmptyRow when there are no rows and an emptyMessage is given', () => {
    render(
      <SimpleGrid
        columns={columns}
        rows={[]}
        getRowKey={(r) => r.id}
        emptyMessage="No classes yet."
      />,
    )
    expect(screen.getByText('No classes yet.')).toBeTruthy()
    expect(screen.getByRole('cell').getAttribute('colspan')).toBe('3')
  })

  it('renders no rows and no EmptyRow when rows is empty and there is no emptyMessage', () => {
    render(<SimpleGrid columns={columns} rows={[]} getRowKey={(r) => r.id} />)
    expect(screen.queryAllByRole('cell')).toHaveLength(0)
  })

  it('applies rowClassName to each row', () => {
    render(
      <SimpleGrid
        columns={columns}
        rows={rows}
        getRowKey={(r) => r.id}
        rowClassName={(row) => (row.id === '1' ? 'bg-yellow-50' : undefined)}
      />,
    )
    const dataRows = screen.getAllByRole('row').slice(1) // drop header row
    expect(dataRows[0].className).toContain('bg-yellow-50')
    expect(dataRows[1].className).not.toContain('bg-yellow-50')
  })

  it('applies rowTestId to each row as data-testid', () => {
    render(
      <SimpleGrid
        columns={columns}
        rows={rows}
        getRowKey={(r) => r.id}
        rowTestId={(row) => `row-${row.id}`}
      />,
    )
    expect(screen.getByTestId('row-1')).toBeTruthy()
    expect(screen.getByTestId('row-2')).toBeTruthy()
  })

  it('mobile="scroll" (default): header is always visible (not hidden below sm)', () => {
    render(<SimpleGrid columns={columns} rows={rows} getRowKey={(r) => r.id} />)
    expect(
      screen.getByRole('columnheader', { name: 'Name' }).closest('thead')
        ?.className,
    ).not.toContain('hidden')
  })

  it('mobile="hide-columns": hides columns marked meta.mobile "hide" below sm', () => {
    const hideColumns: GridColumn<Row>[] = [
      { id: 'name', header: 'Name', cell: (row) => row.name },
      {
        id: 'room',
        header: 'Room',
        mobile: 'hide',
        cell: (row) => row.room ?? '—',
      },
    ]
    render(
      <SimpleGrid
        columns={hideColumns}
        rows={rows}
        getRowKey={(r) => r.id}
        mobile="hide-columns"
      />,
    )
    expect(screen.getByText('R1').className).toContain('hidden sm:table-cell')
  })

  it('mobile="stacked": header is hidden below sm', () => {
    render(
      <SimpleGrid
        columns={columns}
        rows={rows}
        getRowKey={(r) => r.id}
        mobile="stacked"
        stacked={stackedSpec}
      />,
    )
    const className = screen
      .getByRole('columnheader', { name: 'Name' })
      .closest('thead')?.className
    expect(className).toContain('hidden')
    expect(className).toContain('sm:table-header-group')
  })

  it('mobile="stacked": renders one summary cell per row, holding the title text', () => {
    render(
      <SimpleGrid
        columns={columns}
        rows={rows}
        getRowKey={(r) => r.id}
        mobile="stacked"
        stacked={stackedSpec}
      />,
    )
    // "Year 1A" appears once in the stacked summary cell and once in the
    // hidden-on-mobile desktop "Name" column cell.
    expect(screen.getAllByText('Year 1A')).toHaveLength(2)
  })

  it('mobile="stacked" requires a stacked spec at compile time', () => {
    render(
      // @ts-expect-error `stacked` is required when `mobile` is "stacked"
      <SimpleGrid
        columns={columns}
        rows={rows}
        getRowKey={(r) => r.id}
        mobile="stacked"
      />,
    )
  })

  it('stacked mode with no rows and an emptyMessage renders EmptyRow spanning every column', () => {
    render(
      <SimpleGrid
        columns={columns}
        rows={[]}
        getRowKey={(r) => r.id}
        mobile="stacked"
        stacked={stackedSpec}
        emptyMessage="No classes yet."
      />,
    )
    expect(screen.getByText('No classes yet.')).toBeTruthy()
    expect(screen.getByRole('cell').getAttribute('colspan')).toBe('3')
  })

  it('applies rowClassName to each row in stacked mode', () => {
    render(
      <SimpleGrid
        columns={columns}
        rows={rows}
        getRowKey={(r) => r.id}
        mobile="stacked"
        stacked={stackedSpec}
        rowClassName={(row) => (row.id === '1' ? 'bg-yellow-50' : undefined)}
      />,
    )
    const dataRows = screen.getAllByRole('row').slice(1) // drop header row
    expect(dataRows[0].className).toContain('bg-yellow-50')
    expect(dataRows[1].className).not.toContain('bg-yellow-50')
  })

  it('frame="card" (default): wraps in the card + scroll tokens', () => {
    const { container } = render(
      <SimpleGrid columns={columns} rows={rows} getRowKey={(r) => r.id} />,
    )
    expect(container.firstElementChild?.className).toContain('rounded-xl')
  })

  it('frame="none": omits the card wrapper, keeps the scroll wrapper', () => {
    const { container } = render(
      <SimpleGrid
        columns={columns}
        rows={rows}
        getRowKey={(r) => r.id}
        frame="none"
      />,
    )
    expect(container.firstElementChild?.className).toContain('overflow-x-auto')
    expect(container.firstElementChild?.className).not.toContain('rounded-xl')
  })

  it('renders an sr-only caption when given one', () => {
    render(
      <SimpleGrid
        columns={columns}
        rows={rows}
        getRowKey={(r) => r.id}
        caption="Classes"
      />,
    )
    expect(screen.getByText('Classes').tagName).toBe('CAPTION')
  })
})
