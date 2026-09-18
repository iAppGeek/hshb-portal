'use client'

import { useState } from 'react'

import { rowLink } from '@/lib/grid/styles'
import type { ActionResult } from '@/lib/schemas'

import AcademicYearForm from './AcademicYearForm'
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
  updateAction: (id: string, formData: FormData) => Promise<ActionResult>
  makeCurrentAction: (
    id: string,
    previousId: string | null,
  ) => Promise<ActionResult>
}

const TH =
  'px-3 py-3 text-left text-xs font-medium tracking-wide text-gray-500 uppercase sm:px-6'
const TD = 'px-3 py-4 text-sm text-gray-700 sm:px-6'

export default function AcademicYearsTable({
  years,
  updateAction,
  makeCurrentAction,
}: Props): React.ReactElement {
  const [editingId, setEditingId] = useState<string | null>(null)
  const currentId = years.find((y) => y.is_current)?.id ?? null

  return (
    <div className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-gray-200">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className={TH}>Code</th>
              <th className={TH}>Start</th>
              <th className={TH}>End</th>
              <th className={TH}>Status</th>
              <th className={TH}>Classes</th>
              <th className={TH}>Fee plans</th>
              <th className={TH}>Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {years.map((y) =>
              editingId === y.id ? (
                <tr key={y.id}>
                  <td colSpan={7} className="px-3 py-4 sm:px-6">
                    <AcademicYearForm
                      mode="edit"
                      defaultValues={y}
                      action={(formData) => updateAction(y.id, formData)}
                      submitLabel="Save changes"
                      onDone={() => setEditingId(null)}
                    />
                  </td>
                </tr>
              ) : (
                <tr key={y.id}>
                  <td className={TD}>{y.code}</td>
                  <td className={TD}>{y.start_date}</td>
                  <td className={TD}>{y.end_date}</td>
                  <td className={TD}>
                    {y.is_current && (
                      <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800">
                        Current
                      </span>
                    )}
                  </td>
                  <td className={TD}>{y.classCount}</td>
                  <td className={TD}>{y.feePlanCount}</td>
                  <td className={TD}>
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => setEditingId(y.id)}
                        className={rowLink}
                      >
                        Edit
                      </button>
                      {!y.is_current && (
                        <MakeCurrentButton
                          yearCode={y.code}
                          action={() => makeCurrentAction(y.id, currentId)}
                        />
                      )}
                    </div>
                  </td>
                </tr>
              ),
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
