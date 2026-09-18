import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { useTable } from '@tanstack/react-table'

import { features } from './features'
import SortableTh from './SortableTh'

type Person = { id: string; name: string }

const people: Person[] = [
  { id: '1', name: 'Ada' },
  { id: '2', name: 'Bo' },
]

function Harness({ sortable }: { sortable: boolean }) {
  const table = useTable({
    features,
    data: people,
    columns: [
      {
        id: 'name',
        header: 'Name',
        accessorFn: (row: Person) => row.name,
        cell: (info) => info.row.original.name,
        enableSorting: sortable,
      },
      {
        id: 'actions',
        header: 'Actions',
        accessorFn: (row: Person) => row,
        cell: () => null,
        enableSorting: false,
        meta: { srOnlyHeader: true },
      },
    ],
    getRowId: (row) => row.id,
  })

  return (
    <table>
      <thead>
        <tr>
          {table
            .getHeaderGroups()
            .map((group) =>
              group.headers.map((header) => (
                <SortableTh key={header.id} header={header} />
              )),
            )}
        </tr>
      </thead>
    </table>
  )
}

describe('SortableTh', () => {
  it('renders plain text for a non-sortable column', () => {
    render(<Harness sortable={false} />)
    const th = screen.getByRole('columnheader', { name: 'Name' })
    expect(th.querySelector('button')).toBeNull()
  })

  it('wraps an srOnlyHeader column in a sr-only span', () => {
    render(<Harness sortable={false} />)
    expect(screen.getByText('Actions').className).toContain('sr-only')
  })

  it('renders a sort button with aria-sort="none" for an unsorted sortable column', () => {
    render(<Harness sortable={true} />)
    const th = screen.getByRole('columnheader', { name: 'Name' })
    expect(th.getAttribute('aria-sort')).toBe('none')
    expect(screen.getByRole('button', { name: 'Name' })).toBeTruthy()
  })

  it('cycles aria-sort and toggles direction on click', () => {
    render(<Harness sortable={true} />)
    const button = screen.getByRole('button', { name: 'Name' })

    fireEvent.click(button)
    expect(
      screen
        .getByRole('columnheader', { name: 'Name' })
        .getAttribute('aria-sort'),
    ).toBe('ascending')

    fireEvent.click(button)
    expect(
      screen
        .getByRole('columnheader', { name: 'Name' })
        .getAttribute('aria-sort'),
    ).toBe('descending')
  })
})
