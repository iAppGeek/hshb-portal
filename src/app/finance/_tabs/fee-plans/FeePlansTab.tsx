import Link from 'next/link'

import { getAllClassesIncludingInactive, getFeePlans } from '@/db'
import { formatGbp } from '@/lib/fees'

import EmptyState from '../../../_components/EmptyState'

const TH =
  'px-3 py-3 text-left text-xs font-medium tracking-wide text-gray-500 uppercase'
const TD = 'px-3 py-3 text-sm text-gray-700'

export default async function FeePlansTab(): Promise<React.ReactElement> {
  const [plans, classes] = await Promise.all([
    getFeePlans(),
    getAllClassesIncludingInactive(),
  ])
  const classNames = new Map(classes.map((c) => [c.id, c.name]))

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Link
          href="/finance/fee-plans/new"
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700"
        >
          Add fee plan
        </Link>
      </div>

      {plans.length === 0 ? (
        <EmptyState message="No fee plans yet." />
      ) : (
        <div className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-gray-200">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className={TH}>Name</th>
                  <th className={TH}>Academic year</th>
                  <th className={TH}>Full year</th>
                  <th className={TH}>Monthly</th>
                  <th className={TH}>Termly</th>
                  <th className={TH}>Classes</th>
                  <th className={TH}>Status</th>
                  <th className={`relative ${TH}`}>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {plans.map((plan) => (
                  <tr key={plan.id} className="hover:bg-gray-50">
                    <td className={`${TD} font-medium text-gray-900`}>
                      {plan.name}
                    </td>
                    <td className={TD}>{plan.academic_year}</td>
                    <td className={TD}>{formatGbp(plan.full_year_amount)}</td>
                    <td className={TD}>
                      {formatGbp(plan.monthly_instalment_amount)}
                    </td>
                    <td className={TD}>
                      {formatGbp(plan.termly_instalment_amount)}
                    </td>
                    <td className={TD}>
                      {plan.class_ids
                        .map((id) => classNames.get(id))
                        .filter(Boolean)
                        .join(', ') || '—'}
                    </td>
                    <td className={TD}>
                      {plan.active ? (
                        <span className="text-green-700">Active</span>
                      ) : (
                        <span className="text-gray-400">Inactive</span>
                      )}
                    </td>
                    <td className={`${TD} text-right`}>
                      <Link
                        href={`/finance/fee-plans/${plan.id}/edit`}
                        className="font-medium text-blue-600 hover:text-blue-800"
                      >
                        Edit
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
