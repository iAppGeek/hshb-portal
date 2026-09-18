import TableSkeleton from '@/components/grid/TableSkeleton'

export default function TimetablesLoading() {
  return (
    <div className="animate-pulse">
      <div className="mb-6 flex items-center justify-between">
        <div className="h-8 w-32 rounded bg-gray-200" />
        <div className="h-9 w-24 rounded-lg bg-gray-200" />
      </div>

      <div className="space-y-6">
        {[1, 2, 3].map((day) => (
          <div
            key={day}
            className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-gray-200"
          >
            <div className="border-b border-gray-200 bg-gray-50 px-6 py-3">
              <div className="h-4 w-24 rounded bg-gray-200" />
            </div>
            <TableSkeleton
              columns={4}
              rows={3}
              widths={['7rem', '5rem', '6rem', '3rem']}
              frame="none"
            />
          </div>
        ))}
      </div>
    </div>
  )
}
