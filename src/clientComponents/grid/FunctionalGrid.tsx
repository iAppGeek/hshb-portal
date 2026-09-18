'use client'

import {
  useTable,
  type CellData,
  type ColumnDef,
  type RowData,
  type SortingState,
  type TableFeatures,
} from '@tanstack/react-table'
import type { ReactElement } from 'react'

import EmptyRow from '@/components/grid/EmptyRow'
import StackedRow from '@/components/grid/StackedRow'
import Table from '@/components/grid/Table'
import TableCard from '@/components/grid/TableCard'
import Td from '@/components/grid/Td'
import Tr from '@/components/grid/Tr'
import type {
  GridColumn,
  GridColumnMeta,
  MobileMode,
  StackedRowSpec,
} from '@/lib/grid/columns'
import { tbody, thead, theadStacked } from '@/lib/grid/styles'

import FacetSelect from './FacetSelect'
import { features } from './features'
import GridSearch from './GridSearch'
import ResultCount from './ResultCount'
import SortableTh from './SortableTh'

export { features }

// `meta` on every column def is typed as `GridColumnMeta` so `FunctionalGrid`
// and `SimpleGrid` columns share one shape (plans/shared-grids.md §2.2).
declare module '@tanstack/table-core' {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- declaration merging requires an interface body, even an empty one
  interface ColumnMeta<
    TFeatures extends TableFeatures,
    TData extends RowData,
    TValue extends CellData = CellData,
  > extends GridColumnMeta {}
}

export type FunctionalGridColumn<T extends RowData> = ColumnDef<
  typeof features,
  T
>

export type FacetConfig = {
  columnId: string
  label: string
  placeholderOption: string
  options: { value: string; label: string }[]
}

type FunctionalGridProps<T extends RowData> = {
  data: T[]
  columns: FunctionalGridColumn<T>[]
  getRowId: (row: T) => string
  search?: {
    placeholder: string
    label: string
    filterFn: (row: T, query: string) => boolean
  }
  facets?: FacetConfig[]
  initialSorting?: SortingState
  mobile?: MobileMode
  stacked?: StackedRowSpec<T>
  showCount?: boolean
  countNoun?: string
  emptyMessage: string
  frame?: 'card' | 'none'
}

/**
 * A client-rendered, TanStack Table v9 grid for the screens that search,
 * filter or sort. Renders through the same `Table` / `Th` / `Td` / `Tr` /
 * `StackedRow` / `EmptyRow` parts as `SimpleGrid` (plans/shared-grids.md
 * §2.5), so a column looks the same in either grid.
 */
export default function FunctionalGrid<T extends RowData>({
  data,
  columns,
  getRowId,
  search,
  facets,
  initialSorting,
  mobile = 'scroll',
  stacked,
  showCount = false,
  countNoun = 'results',
  emptyMessage,
  frame = 'card',
}: FunctionalGridProps<T>): ReactElement {
  // TanStack v9 gates `getCanSort`/`getCanGlobalFilter`/`getCanFilter` on
  // `!!column.accessorFn`, even though the filtered/sorted row models call a
  // custom `sortFn`/`filterFn` directly without reading the accessed value.
  // Screens define columns the same way as `SimpleGrid` (an id, a header and
  // a `cell` that reads `row.original`), so every column gets a throwaway
  // accessor here rather than repeating one in each screen.
  const resolvedColumns = columns.map((column) => ({
    accessorFn: (row: T) => row,
    ...column,
  }))

  const table = useTable({
    features,
    columns: resolvedColumns,
    data,
    getRowId: (row) => getRowId(row),
    initialState: initialSorting ? { sorting: initialSorting } : undefined,
    // Every accessor here returns the whole row (see `resolvedColumns`
    // above), not a string/number, so the default `getColumnCanGlobalFilter`
    // (which only allows string/number-valued columns) would exclude every
    // column and silently disable search. `search.filterFn` decides
    // relevance itself, so every column is a candidate.
    getColumnCanGlobalFilter: () => true,
    globalFilterFn: search
      ? (row, _columnId, filterValue: string) =>
          search.filterFn(row.original as T, filterValue)
      : undefined,
  })

  const rows = table.getRowModel().rows
  const isStacked = mobile === 'stacked'
  const sortableColumns = table
    .getAllColumns()
    .filter((column) => column.getCanSort())
  const currentSort = table.state.sorting[0]
  const sortByValue = currentSort
    ? `${currentSort.id}:${currentSort.desc ? 'desc' : 'asc'}`
    : ''

  return (
    <div className="space-y-4">
      {(search || facets) && (
        <div className="flex flex-wrap gap-2">
          {search && (
            <GridSearch
              value={table.state.globalFilter ?? ''}
              onChange={(value) => table.setGlobalFilter(value)}
              placeholder={search.placeholder}
              label={search.label}
            />
          )}
          {facets?.map((facet) => {
            const column = table.getColumn(facet.columnId)
            return (
              <FacetSelect
                key={facet.columnId}
                value={(column?.getFilterValue() as string | undefined) ?? ''}
                onChange={(value) =>
                  column?.setFilterValue(value === '' ? undefined : value)
                }
                label={facet.label}
                placeholderOption={facet.placeholderOption}
                options={facet.options}
              />
            )
          })}
        </div>
      )}

      {isStacked && sortableColumns.length > 0 && (
        <select
          aria-label="Sort by"
          value={sortByValue}
          onChange={(e) => {
            const [id, direction] = e.target.value.split(':')
            if (!id) return
            table.setSorting([{ id, desc: direction === 'desc' }])
          }}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none sm:hidden"
        >
          {sortableColumns.map((column) => {
            const header =
              typeof column.columnDef.header === 'string'
                ? column.columnDef.header
                : column.id
            return [
              <option key={`${column.id}:asc`} value={`${column.id}:asc`}>
                {header} ↑
              </option>,
              <option key={`${column.id}:desc`} value={`${column.id}:desc`}>
                {header} ↓
              </option>,
            ]
          })}
        </select>
      )}

      {showCount && (
        <ResultCount count={rows.length} total={data.length} noun={countNoun} />
      )}

      <TableCard frame={frame}>
        <Table>
          <thead className={isStacked ? theadStacked : thead}>
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
          <tbody className={tbody}>
            {rows.length === 0 ? (
              <EmptyRow colSpan={columns.length} message={emptyMessage} />
            ) : (
              rows.map((row) => {
                if (isStacked && stacked) {
                  const rowColumns: GridColumn<T>[] = row
                    .getAllCells()
                    .map((cell) => ({
                      id: cell.column.id,
                      header: '',
                      cell: () => <table.FlexRender cell={cell} />,
                      ...((cell.column.columnDef.meta as
                        GridColumnMeta | undefined) ?? {}),
                    }))
                  return (
                    <StackedRow
                      key={row.id}
                      row={row.original as T}
                      columns={rowColumns}
                      spec={stacked}
                    />
                  )
                }
                return (
                  <Tr key={row.id}>
                    {row.getAllCells().map((cell) => (
                      <Td
                        key={cell.id}
                        mobile={mobile}
                        meta={cell.column.columnDef.meta as GridColumnMeta}
                      >
                        <table.FlexRender cell={cell} />
                      </Td>
                    ))}
                  </Tr>
                )
              })
            )}
          </tbody>
        </Table>
      </TableCard>
    </div>
  )
}
