import TableSkeleton from '@/components/grid/TableSkeleton'

export default function IncidentsLoading() {
  return (
    <div className="animate-pulse">
      <div className="mb-6 flex items-center justify-between">
        <div className="h-8 w-24 rounded bg-gray-200" />
        <div className="h-9 w-28 rounded-lg bg-gray-200" />
      </div>

      <div className="mb-4 flex gap-2">
        <div className="h-9 w-24 rounded-lg bg-gray-200" />
        <div className="h-9 w-24 rounded-lg bg-gray-200" />
      </div>

      <TableSkeleton
        columns={6}
        rows={5}
        widths={['6rem', '8rem', '10rem', '12rem', '7rem', '5rem']}
      />
    </div>
  )
}
