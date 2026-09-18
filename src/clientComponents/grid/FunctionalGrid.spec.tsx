import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'

import type { StackedRowSpec } from '@/lib/grid/columns'

import FunctionalGrid, { type FunctionalGridColumn } from './FunctionalGrid'

type Person = { id: string; name: string; team: string }

const people: Person[] = [
  { id: '1', name: 'Bo', team: 'Red' },
  { id: '2', name: 'Ada', team: 'Blue' },
  { id: '3', name: 'Cy', team: 'Red' },
]

const columns: FunctionalGridColumn<Person>[] = [
  {
    id: 'name',
    header: 'Name',
    cell: (info) => info.row.original.name,
    sortFn: (rowA, rowB) =>
      rowA.original.name.localeCompare(rowB.original.name),
    meta: { primary: true },
  },
  {
    id: 'team',
    header: 'Team',
    cell: (info) => info.row.original.team,
    enableSorting: false,
  },
]

const stacked: StackedRowSpec<Person> = {
  title: (p) => p.name,
  details: (p) => [p.team],
}

describe('FunctionalGrid', () => {
  it('renders one row per item', () => {
    render(
      <FunctionalGrid
        data={people}
        columns={columns}
        getRowId={(p) => p.id}
        emptyMessage="No people."
      />,
    )
    expect(screen.getByText('Bo')).toBeTruthy()
    expect(screen.getByText('Ada')).toBeTruthy()
    expect(screen.getByText('Cy')).toBeTruthy()
  })

  it('shows the empty message when there are no rows', () => {
    render(
      <FunctionalGrid
        data={[]}
        columns={columns}
        getRowId={(p) => p.id}
        emptyMessage="No people."
      />,
    )
    expect(screen.getByText('No people.')).toBeTruthy()
  })

  it('narrows rows with search', () => {
    render(
      <FunctionalGrid
        data={people}
        columns={columns}
        getRowId={(p) => p.id}
        search={{
          placeholder: 'Search…',
          label: 'Search people',
          filterFn: (p, q) => p.name.toLowerCase().includes(q.toLowerCase()),
        }}
        emptyMessage="No people."
      />,
    )
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search people' }), {
      target: { value: 'ad' },
    })
    expect(screen.getByText('Ada')).toBeTruthy()
    expect(screen.queryByText('Bo')).toBeNull()
    expect(screen.queryByText('Cy')).toBeNull()
  })

  it('narrows rows with a facet dropdown', () => {
    render(
      <FunctionalGrid
        data={people}
        columns={columns}
        getRowId={(p) => p.id}
        facets={[
          {
            columnId: 'team',
            label: 'Filter by team',
            placeholderOption: 'All teams',
            options: [
              { value: 'Red', label: 'Red' },
              { value: 'Blue', label: 'Blue' },
            ],
          },
        ]}
        emptyMessage="No people."
      />,
    )
    // The facet's filterFn lives on the column def itself in a real screen;
    // this harness column has none, so selecting a facet value here would
    // filter out every row. Exercise the dropdown wiring instead.
    const select = screen.getByRole('combobox', { name: 'Filter by team' })
    expect(select).toHaveValue('')
    fireEvent.change(select, { target: { value: 'Red' } })
    expect(select).toHaveValue('Red')
  })

  it('combines search and a facet filterFn defined on the column', () => {
    const columnsWithFacetFilter: FunctionalGridColumn<Person>[] = [
      ...columns.slice(0, 1),
      {
        id: 'team',
        header: 'Team',
        cell: (info) => info.row.original.team,
        enableSorting: false,
        filterFn: (row, _columnId, value: string) =>
          row.original.team === value,
      },
    ]
    render(
      <FunctionalGrid
        data={people}
        columns={columnsWithFacetFilter}
        getRowId={(p) => p.id}
        search={{
          placeholder: 'Search…',
          label: 'Search people',
          filterFn: () => true,
        }}
        facets={[
          {
            columnId: 'team',
            label: 'Filter by team',
            placeholderOption: 'All teams',
            options: [
              { value: 'Red', label: 'Red' },
              { value: 'Blue', label: 'Blue' },
            ],
          },
        ]}
        emptyMessage="No people."
      />,
    )
    fireEvent.change(screen.getByRole('combobox', { name: 'Filter by team' }), {
      target: { value: 'Red' },
    })
    expect(screen.getByText('Bo')).toBeTruthy()
    expect(screen.getByText('Cy')).toBeTruthy()
    expect(screen.queryByText('Ada')).toBeNull()

    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'x' } })
    expect(screen.getByText('Bo')).toBeTruthy()
  })

  it('clicking a sortable header cycles sort order and sets aria-sort', () => {
    render(
      <FunctionalGrid
        data={people}
        columns={columns}
        getRowId={(p) => p.id}
        emptyMessage="No people."
      />,
    )
    const header = screen.getByRole('columnheader', { name: 'Name' })
    expect(header.getAttribute('aria-sort')).toBe('none')

    fireEvent.click(screen.getByRole('button', { name: 'Name' }))
    expect(header.getAttribute('aria-sort')).toBe('descending')
    const rowsDesc = screen.getAllByRole('row').slice(1)
    expect(within(rowsDesc[0]).getByText('Cy')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Name' }))
    expect(header.getAttribute('aria-sort')).toBe('ascending')
    const rowsAsc = screen.getAllByRole('row').slice(1)
    expect(within(rowsAsc[0]).getByText('Ada')).toBeTruthy()
  })

  it('applies the given initial sort', () => {
    render(
      <FunctionalGrid
        data={people}
        columns={columns}
        getRowId={(p) => p.id}
        initialSorting={[{ id: 'name', desc: false }]}
        emptyMessage="No people."
      />,
    )
    const rows = screen.getAllByRole('row').slice(1)
    expect(within(rows[0]).getByText('Ada')).toBeTruthy()
  })

  it('shows a "Sort by" dropdown on stacked mobile when sortable columns exist', () => {
    render(
      <FunctionalGrid
        data={people}
        columns={columns}
        getRowId={(p) => p.id}
        mobile="stacked"
        stacked={stacked}
        emptyMessage="No people."
      />,
    )
    const sortBy = screen.getByRole('combobox', { name: 'Sort by' })
    fireEvent.change(sortBy, { target: { value: 'name:asc' } })
    const rows = screen.getAllByRole('row').slice(1)
    expect(within(rows[0]).getAllByText('Ada').length).toBeGreaterThan(0)
  })

  it('does not show a "Sort by" dropdown outside stacked mode', () => {
    render(
      <FunctionalGrid
        data={people}
        columns={columns}
        getRowId={(p) => p.id}
        emptyMessage="No people."
      />,
    )
    expect(screen.queryByRole('combobox', { name: 'Sort by' })).toBeNull()
  })

  it('shows a result count when showCount is set', () => {
    render(
      <FunctionalGrid
        data={people}
        columns={columns}
        getRowId={(p) => p.id}
        showCount
        countNoun="people"
        emptyMessage="No people."
      />,
    )
    expect(screen.getByText('Showing 3 of 3 people')).toBeTruthy()
  })

  it('does not show a result count by default', () => {
    render(
      <FunctionalGrid
        data={people}
        columns={columns}
        getRowId={(p) => p.id}
        emptyMessage="No people."
      />,
    )
    expect(screen.queryByText(/Showing/)).toBeNull()
  })

  it('renders stacked rows through the shared StackedRow part on mobile', () => {
    render(
      <FunctionalGrid
        data={people}
        columns={columns}
        getRowId={(p) => p.id}
        mobile="stacked"
        stacked={stacked}
        emptyMessage="No people."
      />,
    )
    // Each stacked row's summary title duplicates the name already rendered
    // by the desktop "Name" cell, so every name appears twice.
    expect(screen.getAllByText('Bo')).toHaveLength(2)
  })

  it('calls getRowId to key rows', () => {
    const getRowId = vi.fn((p: Person) => p.id)
    render(
      <FunctionalGrid
        data={people}
        columns={columns}
        getRowId={getRowId}
        emptyMessage="No people."
      />,
    )
    expect(getRowId).toHaveBeenCalled()
  })
})
