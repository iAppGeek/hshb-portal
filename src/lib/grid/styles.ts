export const card =
  'overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-gray-200'
export const scroll = 'overflow-x-auto'
export const table = 'min-w-full divide-y divide-gray-200'
export const thead = 'bg-gray-50'
export const theadStacked = 'hidden bg-gray-50 sm:table-header-group'
export const th =
  'px-3 py-3 text-left text-xs font-medium tracking-wide text-gray-500 uppercase sm:px-6'
export const tdHiddenOnMobile =
  'hidden px-3 py-4 text-sm text-gray-500 sm:table-cell sm:px-6'
export const tdBase = 'px-3 py-4 text-sm sm:px-6'
export const tdMuted = 'text-gray-500'
export const tdDark = 'text-gray-900'
export const tdStrong = 'font-medium text-gray-900'
export const hiddenOnMobile = 'hidden sm:table-cell'
export const tbody = 'divide-y divide-gray-200 bg-white'
export const row = 'hover:bg-gray-50'
export const rowStacked =
  'block border-b border-gray-200 last:border-0 hover:bg-gray-50 sm:table-row sm:border-0'
export const tdStackedSummary =
  'block px-4 py-4 text-sm text-gray-500 sm:hidden'
export const stackedTitle = 'flex items-center gap-2 font-medium text-gray-900'
export const actionsCell = 'flex items-center justify-end gap-3 font-medium'
export const rowLink = 'text-blue-600 hover:text-blue-800'
// Secondary row action (e.g. "Details") — Edit uses `rowLink`, blue.
export const detailsLink = 'text-gray-500 hover:text-gray-700'

// Print tables (Class Register, Staff Sign-In): real `<table>` markup so the
// browser repeats the header row on every printed page.
export const printTable = 'min-w-full border-collapse'
export const printTh =
  'border border-gray-200 px-3 py-2 text-left text-xs font-medium tracking-wide text-gray-500 uppercase sm:px-6 sm:py-3 print:table-cell print:border-gray-400 print:p-px print:text-xs print:font-bold print:text-gray-900'
export const printTd =
  'border border-gray-200 px-3 py-2 text-sm sm:px-6 sm:py-3 print:border-gray-400 print:p-px print:text-xs'
// The fill-in line under a "Date" (or similar) label on a print sheet.
export const printBlankLine =
  'mt-1 min-w-[100px] border-b border-gray-300 pb-1 text-sm'

// Print-only tables that have no paired screen mode (Staff Sign-In): flat
// `p-1` padding rather than `printTh`/`printTd`'s responsive screen padding
// collapsing to `p-px` under print.
export const printThCompact =
  'border border-gray-400 p-1 text-left text-xs font-bold text-gray-900'
export const printTdCompact = 'border border-gray-400 p-1 text-xs'
