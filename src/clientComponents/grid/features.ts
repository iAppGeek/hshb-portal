import {
  columnFilteringFeature,
  createFilteredRowModel,
  createSortedRowModel,
  globalFilteringFeature,
  rowSortingFeature,
  tableFeatures,
} from '@tanstack/react-table'

/**
 * The one `tableFeatures()` registration every `FunctionalGrid` table shares
 * (plans/shared-grids.md §2.5). Lives in its own module, rather than
 * `FunctionalGrid.tsx`, so `SortableTh` can import the concrete feature type
 * without a cycle. Faceting is deliberately not registered: facet options are
 * fixed lists or built from the full data set (see `FacetConfig`), never
 * cross-filtered, so it would only add client JS.
 */
export const features = tableFeatures({
  rowSortingFeature,
  columnFilteringFeature,
  globalFilteringFeature,
  sortedRowModel: createSortedRowModel(),
  filteredRowModel: createFilteredRowModel(),
})
