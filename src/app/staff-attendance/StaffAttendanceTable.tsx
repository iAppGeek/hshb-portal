'use client'

import { useOptimistic, useState } from 'react'

import type { StaffAttendanceRow } from '@/db'
import Table from '@/components/grid/Table'
import TableCard from '@/components/grid/TableCard'
import Th from '@/components/grid/Th'
import Tooltip from '@/components/Tooltip'
import Tr from '@/components/grid/Tr'
import { useServerForm } from '@/components/form'
import { formatTimeInSchoolTz, schoolTzToUtcIso } from '@/lib/datetime'
import { tbody, theadStacked } from '@/lib/grid/styles'
import { canManageStaffAttendance } from '@/lib/permissions'
import type { StaffRole } from '@/types/next-auth'

import { signInAction, signOutAction } from './actions'

export type StaffMember = {
  id: string
  first_name: string
  last_name: string
  display_name: string | null
  class_name: string | null
  room_number: string | null
}

export type TableRow = {
  staff: StaffMember
  record: StaffAttendanceRow | null
}

function StatusBadge({ record }: { record: StaffAttendanceRow | null }) {
  if (!record) return <span className="text-gray-400">—</span>
  if (record.signed_out_at) {
    return (
      <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-700">
        In {formatTimeInSchoolTz(record.signed_in_at)} · Out{' '}
        {formatTimeInSchoolTz(record.signed_out_at)}
      </span>
    )
  }
  return (
    <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800">
      Signed In {formatTimeInSchoolTz(record.signed_in_at)}
    </span>
  )
}

/** What the row will look like once the save lands, from the submitted form. */
function predictRecord(
  current: StaffAttendanceRow | null,
  formData: FormData,
  signingIn: boolean,
): StaffAttendanceRow | null {
  const staffId = String(formData.get('staffId'))
  const date = String(formData.get('date'))
  const at = schoolTzToUtcIso(date, String(formData.get('time')))
  if (!signingIn) return current && { ...current, signed_out_at: at }
  return {
    id: current?.id ?? `pending-${staffId}`,
    staff_id: staffId,
    date,
    signed_in_at: at,
    signed_out_at: null,
    created_at: current?.created_at ?? null,
    updated_at: current?.updated_at ?? null,
  }
}

function StaffRowInteractive({
  staff,
  record: initialRecord,
  defaultTime,
  date,
  role,
  currentStaffId,
}: {
  staff: StaffMember
  record: StaffAttendanceRow | null
  defaultTime: string
  date: string
  role: StaffRole
  currentStaffId: string
}) {
  // `saved` is the row as last written; `record` shows a tap straight away and
  // falls back to `saved` by itself if the save fails.
  const [saved, setSaved] = useState(initialRecord)
  const [record, setOptimisticRecord] = useOptimistic(saved)
  const isSignedIn = !!record && !record.signed_out_at
  const name = staff.display_name ?? `${staff.first_name} ${staff.last_name}`
  const canManageOthers = canManageStaffAttendance(role)
  const isSelf = staff.id === currentStaffId
  const disabled = !canManageOthers && !isSelf

  const signIn = useServerForm(
    async (fd: FormData) => {
      setOptimisticRecord(predictRecord(saved, fd, true))
      return signInAction(fd)
    },
    { onSuccess: setSaved },
  )
  const signOut = useServerForm(
    async (fd: FormData) => {
      setOptimisticRecord(predictRecord(saved, fd, false))
      return signOutAction(fd)
    },
    { onSuccess: setSaved },
  )
  const { handleSubmit, error } = isSignedIn ? signOut : signIn
  // The optimistic row flips which form shows mid-save, so either pending
  // save keeps the row's controls disabled.
  const isPending = signIn.isPending || signOut.isPending

  const actionForm = disabled ? (
    <Tooltip text="You can only sign yourself in/out">
      <span className="text-sm text-gray-400">—</span>
    </Tooltip>
  ) : isSignedIn ? (
    <form onSubmit={handleSubmit} className="flex items-center gap-2">
      <input type="hidden" name="staffId" value={staff.id} />
      <input type="hidden" name="date" value={date} />
      <input
        type="time"
        name="time"
        defaultValue={defaultTime}
        required
        disabled={isPending}
        className="min-w-0 flex-1 rounded-md border border-gray-200 px-2 py-1 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none disabled:opacity-60 sm:flex-none"
      />
      <button
        type="submit"
        disabled={isPending}
        className="w-24 shrink-0 rounded-lg bg-amber-100 px-3 py-1.5 text-sm font-medium text-amber-800 transition hover:bg-amber-200 disabled:opacity-60"
      >
        {isPending ? 'Saving…' : 'Sign Out'}
      </button>
    </form>
  ) : (
    <form onSubmit={handleSubmit} className="flex items-center gap-2">
      <input type="hidden" name="staffId" value={staff.id} />
      <input type="hidden" name="date" value={date} />
      <input
        type="time"
        name="time"
        defaultValue={defaultTime}
        required
        disabled={isPending}
        className="min-w-0 flex-1 rounded-md border border-gray-200 px-2 py-1 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none disabled:opacity-60 sm:flex-none"
      />
      <button
        type="submit"
        disabled={isPending}
        className="w-24 shrink-0 rounded-lg bg-green-100 px-3 py-1.5 text-sm font-medium text-green-800 transition hover:bg-green-200 disabled:opacity-60"
      >
        {isPending ? 'Saving…' : 'Sign In'}
      </button>
    </form>
  )

  return (
    <Tr stacked>
      {/* Name cell — on mobile also shows status (top-right) and room/class (second line) */}
      <td className="block px-4 pt-4 pb-0 sm:table-cell sm:px-6 sm:py-3 sm:align-top">
        <div className="flex items-start justify-between gap-2 sm:block">
          <span className="text-sm font-medium text-gray-900">{name}</span>
          <span className="shrink-0 sm:hidden">
            <StatusBadge record={record} />
          </span>
        </div>
        {(staff.room_number || staff.class_name) && (
          <p className="mt-0.5 text-xs text-gray-500 sm:hidden">
            {[
              staff.room_number && `Room ${staff.room_number}`,
              staff.class_name,
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
        )}
      </td>

      {/* Action cell */}
      <td className="block px-4 pt-2 pb-4 sm:table-cell sm:px-6 sm:py-3 sm:align-top">
        {error && <p className="mb-1 text-xs text-red-600">{error}</p>}
        {actionForm}
      </td>

      {/* Status — hidden on mobile (rendered inside Name cell), visible on desktop */}
      <td className="hidden sm:table-cell sm:px-6 sm:py-3 sm:align-top">
        <StatusBadge record={record} />
      </td>

      {/* Room — hidden on mobile (rendered inside Name cell), visible on desktop */}
      <td className="hidden text-sm text-gray-600 sm:table-cell sm:px-6 sm:py-3 sm:align-top">
        {staff.room_number ?? '—'}
      </td>

      {/* Class — hidden on mobile (rendered inside Name cell), visible on desktop */}
      <td className="hidden text-sm text-gray-600 sm:table-cell sm:px-6 sm:py-3 sm:align-top">
        {staff.class_name ?? '—'}
      </td>
    </Tr>
  )
}

type Props = {
  rows: TableRow[]
  defaultTime: string
  date: string
  role: StaffRole
  currentStaffId: string
}

export default function StaffAttendanceTable({
  rows,
  defaultTime,
  date,
  role,
  currentStaffId,
}: Props) {
  return (
    <TableCard>
      <Table>
        <thead className={theadStacked}>
          <tr>
            {['Name', 'Action', 'Status', 'Room', 'Class'].map((h) => (
              <Th key={h}>{h}</Th>
            ))}
          </tr>
        </thead>
        <tbody className={tbody}>
          {rows.map(({ staff, record }) => (
            <StaffRowInteractive
              key={staff.id}
              staff={staff}
              record={record}
              defaultTime={defaultTime}
              date={date}
              role={role}
              currentStaffId={currentStaffId}
            />
          ))}
        </tbody>
      </Table>
    </TableCard>
  )
}
