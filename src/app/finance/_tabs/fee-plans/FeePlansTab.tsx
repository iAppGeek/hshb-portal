import Link from 'next/link'

import SimpleGrid from '@/components/grid/SimpleGrid'
import { getClassesByAcademicYear, getFeePlans } from '@/db'
import { formatGbp } from '@/lib/fees'
import type { GridColumn } from '@/lib/grid/columns'
import { rowLink } from '@/lib/grid/styles'

import EmptyState from '../../../_components/EmptyState'

type FeePlan = Awaited<ReturnType<typeof getFeePlans>>[number]

type Props = {
  yearId: string
}

export default async function FeePlansTab({
  yearId,
}: Props): Promise<React.ReactElement> {
  const [plans, classes] = await Promise.all([
    getFeePlans(yearId),
    getClassesByAcademicYear(yearId),
  ])
  const classNames = new Map(classes.map((c) => [c.id, c.name]))

  const columns: GridColumn<FeePlan>[] = [
    { id: 'name', header: 'Name', primary: true, cell: (plan) => plan.name },
    {
      id: 'full_year',
      header: 'Full year',
      cell: (plan) => formatGbp(plan.full_year_amount),
    },
    {
      id: 'monthly',
      header: 'Monthly',
      cell: (plan) => formatGbp(plan.monthly_instalment_amount),
    },
    {
      id: 'termly',
      header: 'Termly',
      cell: (plan) => formatGbp(plan.termly_instalment_amount),
    },
    {
      id: 'classes',
      header: 'Classes',
      cell: (plan) =>
        plan.class_ids
          .map((id) => classNames.get(id))
          .filter(Boolean)
          .join(', ') || '—',
    },
    {
      id: 'status',
      header: 'Status',
      cell: (plan) =>
        plan.active ? (
          <span className="text-green-700">Active</span>
        ) : (
          <span className="text-gray-400">Inactive</span>
        ),
    },
    {
      id: 'actions',
      header: 'Actions',
      srOnlyHeader: true,
      align: 'right',
      cell: (plan) => (
        <Link
          href={`/finance/fee-plans/${plan.id}/edit`}
          className={`font-medium ${rowLink}`}
        >
          Edit
        </Link>
      ),
    },
  ]

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Link
          href={`/finance/fee-plans/new?year=${yearId}`}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700"
        >
          Add fee plan
        </Link>
      </div>

      {plans.length === 0 ? (
        <EmptyState message="No fee plans yet." />
      ) : (
        <SimpleGrid
          columns={columns}
          rows={plans}
          getRowKey={(plan) => plan.id}
        />
      )}
    </div>
  )
}
