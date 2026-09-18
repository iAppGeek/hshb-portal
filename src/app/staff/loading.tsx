import TableSkeleton from '@/components/grid/TableSkeleton'

export default function StaffLoading() {
  return (
    <div className="animate-pulse">
      <div className="mb-6">
        <div className="h-8 w-16 rounded bg-gray-200" />
      </div>

      <TableSkeleton
        columns={8}
        rows={6}
        widths={[
          '3rem',
          '6rem',
          '6rem',
          '8rem',
          '5rem',
          '7rem',
          '5rem',
          '3rem',
        ]}
      />
    </div>
  )
}
