import TableSkeleton from '@/components/grid/TableSkeleton'

export default function RegistrationsLoading() {
  return (
    <div className="animate-pulse">
      <div className="mb-6 h-8 w-48 rounded bg-gray-200" />
      <div className="mb-6 h-10 w-80 rounded-xl bg-gray-100" />

      <TableSkeleton
        columns={6}
        rows={8}
        widths={['8rem', '5rem', '5rem', '8rem', '6rem', '4rem']}
      />
    </div>
  )
}
