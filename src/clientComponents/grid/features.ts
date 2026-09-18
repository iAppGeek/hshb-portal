import {
  columnFacetingFeature,
  columnFilteringFeature,
  createFacetedRowModel,
  createFacetedUniqueValues,
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
 * without a cycle.
 */
export const features = tableFeatures({
  rowSortingFeature,
  columnFilteringFeature,
  globalFilteringFeature,
  columnFacetingFeature,
  sortedRowModel: createSortedRowModel(),
  filteredRowModel: createFilteredRowModel(),
  facetedRowModel: createFacetedRowModel(),
  facetedUniqueValues: createFacetedUniqueValues(),
})
