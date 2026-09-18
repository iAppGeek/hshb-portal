import TableSkeleton from '@/components/grid/TableSkeleton'

export default function StudentsLoading() {
  return (
    <div className="animate-pulse">
      <div className="mb-6 flex items-center justify-between">
        <div className="h-8 w-32 rounded bg-gray-200" />
        <div className="h-9 w-28 rounded-lg bg-gray-200" />
      </div>

      <TableSkeleton
        columns={5}
        rows={8}
        widths={['8rem', '5rem', '3rem', '6rem', '2rem']}
      />
    </div>
  )
}
