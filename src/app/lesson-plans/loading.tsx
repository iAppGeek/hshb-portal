import TableSkeleton from '@/components/grid/TableSkeleton'

export default function LessonPlansLoading() {
  return (
    <div className="animate-pulse">
      <div className="mb-6 flex items-center justify-between">
        <div className="h-8 w-32 rounded bg-gray-200" />
        <div className="h-9 w-32 rounded-lg bg-gray-200" />
      </div>

      <TableSkeleton
        columns={5}
        rows={5}
        widths={['6rem', '8rem', '12rem', '7rem', '7rem']}
      />
    </div>
  )
}
