'use client'

import { useState } from 'react'
import Link from 'next/link'

import SimpleGrid from '@/components/grid/SimpleGrid'
import type { GridColumn } from '@/lib/grid/columns'
import { rowLink } from '@/lib/grid/styles'
import type { ActionResult } from '@/lib/action'

import MakeCurrentButton from './MakeCurrentButton'

export type AcademicYearTableRow = {
  id: string
  code: string
  start_date: string
  end_date: string
  is_current: boolean
  classCount: number
  feePlanCount: number
}

type Props = {
  years: AcademicYearTableRow[]
  makeCurrentAction: (
    id: string,
    previousId: string | null,
  ) => Promise<ActionResult<{ currentId: string }>>
}

export default function AcademicYearsTable({
  years,
  makeCurrentAction,
}: Props): React.ReactElement {
  // Held here so "Make current" moves the badge (and clears the no-current
  // banner) from the action's result, without re-fetching the tab. Copied
  // from props once: the tab keys this on the current year to re-sync it.
  const [currentId, setCurrentId] = useState(
    years.find((y) => y.is_current)?.id ?? null,
  )

  const columns: GridColumn<AcademicYearTableRow>[] = [
    { id: 'code', header: 'Code', primary: true, cell: (y) => y.code },
    { id: 'start', header: 'Start', cell: (y) => y.start_date },
    { id: 'end', header: 'End', cell: (y) => y.end_date },
    {
      id: 'status',
      header: 'Status',
      cell: (y) =>
        y.id === currentId ? (
          <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800">
            Current
          </span>
        ) : null,
    },
    { id: 'classes', header: 'Classes', cell: (y) => y.classCount },
    { id: 'fee_plans', header: 'Fee plans', cell: (y) => y.feePlanCount },
    {
      id: 'actions',
      header: 'Actions',
      srOnlyHeader: true,
      align: 'right',
      cell: (y) => (
        <div className="flex items-center gap-3">
          <Link href={`/admin/academic-years/${y.id}/edit`} className={rowLink}>
            Edit
          </Link>
          {y.id !== currentId && (
            <MakeCurrentButton
              yearCode={y.code}
              action={() => makeCurrentAction(y.id, currentId)}
              onMadeCurrent={setCurrentId}
            />
          )}
        </div>
      ),
    },
  ]

  return (
    <>
      {currentId === null && (
        <div className="rounded-lg bg-red-50 p-4 text-sm text-red-700 ring-1 ring-red-200">
          No academic year is marked current. Make one current below.
        </div>
      )}
      <SimpleGrid
        columns={columns}
        rows={years}
        getRowKey={(y) => y.id}
        emptyMessage="No academic years yet."
      />
    </>
  )
}
