'use client'

import { useState } from 'react'
import Link from 'next/link'

import LeaverBadge from '@/components/LeaverBadge'
import { attendancePercent } from '@/lib/studentAttendance'
import type { WorstAttenderRow } from '@/lib/studentAttendance'

import SectionCard from '../../_components/SectionCard'

function shownCount(value: string): number {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed >= 1 ? parsed : 10
}

export default function WorstAttendersCard({
  rows,
}: {
  rows: WorstAttenderRow[]
}): React.ReactElement {
  const [limit, setLimit] = useState('10')
  const shown = rows.slice(0, shownCount(limit))

  return (
    <SectionCard title="Worst attenders">
      <div className="p-6">
        <label className="mb-4 flex items-center gap-2 text-sm text-gray-700 print:hidden">
          Show top
          <input
            type="number"
            min={1}
            step={1}
            value={limit}
            onChange={(event) => setLimit(event.target.value)}
            className="w-20 rounded-md border border-gray-300 px-2 py-1"
          />
        </label>
        {shown.length === 0 ? (
          <p className="text-sm text-gray-600">
            Every student attended every register in this period.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm" aria-label="Worst attenders">
              <thead>
                <tr className="border-b border-gray-200 text-left text-xs font-medium tracking-wide text-gray-500 uppercase">
                  <th className="px-3 py-2">Student</th>
                  <th className="px-3 py-2">Class(es)</th>
                  <th className="px-3 py-2">Attended</th>
                  <th className="px-3 py-2">%</th>
                  <th className="px-3 py-2">Late</th>
                  <th className="px-3 py-2">Absent</th>
                  <th className="px-3 py-2">Not marked</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((row) => {
                  const percent = attendancePercent(row.attended, row.possible)
                  return (
                    <tr
                      key={row.studentId}
                      className="border-b border-gray-100"
                    >
                      <td className="px-3 py-2">
                        <Link
                          href={`/students/${row.studentId}`}
                          className="font-medium text-blue-700 hover:underline"
                        >
                          {row.lastName}, {row.firstName}
                        </Link>
                        {row.leavingReason !== null && (
                          <span className="ml-2">
                            <LeaverBadge reason={row.leavingReason} />
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2">{row.classNames.join(', ')}</td>
                      <td className="px-3 py-2">
                        {row.attended}/{row.possible}
                      </td>
                      <td className="px-3 py-2">
                        {percent === null ? '—' : `${percent}%`}
                      </td>
                      <td className="px-3 py-2">{row.late}</td>
                      <td className="px-3 py-2">{row.absent}</td>
                      <td className="px-3 py-2">{row.unmarked}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </SectionCard>
  )
}
