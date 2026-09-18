import type { ReactElement } from 'react'
import clsx from 'clsx'

import { formatTimeInSchoolTz } from '@/lib/datetime'
import {
  printBlankLine,
  printTable,
  printTdCompact,
  printThCompact,
} from '@/lib/grid/styles'

import type { TableRow } from './StaffAttendanceTable'

const HEADERS = ['#', 'Name', 'Class', 'Room', 'Arrival Time', 'Departure Time']

type Props = {
  rows: TableRow[]
}

/** Print-only Staff Sign-In sheet: title, a blank Date line, then one row per staff member. */
export default function SignInSheetPrintTable({ rows }: Props): ReactElement {
  return (
    <>
      <div className="mb-4 hidden print:block">
        <h1 className="text-xl font-bold">Staff Sign-In Sheet</h1>
        <div className="mt-2">
          <p className="text-xs font-bold tracking-wide text-gray-900 uppercase">
            Date
          </p>
          <p className={printBlankLine}>&nbsp;</p>
        </div>
      </div>

      <div className="hidden print:block">
        <table className={printTable}>
          <thead>
            <tr>
              {HEADERS.map((h) => (
                <th key={h} className={printThCompact}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ staff, record }, i) => (
              <tr key={staff.id}>
                <td className={clsx(printTdCompact, 'text-gray-500')}>
                  {i + 1}
                </td>
                <td
                  className={clsx(printTdCompact, 'font-medium text-gray-900')}
                >
                  {staff.display_name ??
                    `${staff.first_name} ${staff.last_name}`}
                </td>
                <td className={clsx(printTdCompact, 'text-gray-700')}>
                  {staff.class_name ?? '—'}
                </td>
                <td className={clsx(printTdCompact, 'text-gray-700')}>
                  {staff.room_number ?? '—'}
                </td>
                <td className={clsx(printTdCompact, 'text-gray-700')}>
                  {record ? (
                    formatTimeInSchoolTz(record.signed_in_at)
                  ) : (
                    <span className="block min-w-[80px] border-b border-gray-400">
                      &nbsp;
                    </span>
                  )}
                </td>
                <td className={clsx(printTdCompact, 'text-gray-700')}>
                  {record?.signed_out_at ? (
                    formatTimeInSchoolTz(record.signed_out_at)
                  ) : (
                    <span className="block min-w-[80px] border-b border-gray-400">
                      &nbsp;
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
