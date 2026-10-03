'use client'

import { useOptimistic, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'

import type { StaffAttendanceRow } from '@/db'
import FunctionalGrid, {
  type FunctionalGridColumn,
} from '@/clientComponents/grid/FunctionalGrid'
import Tooltip from '@/components/Tooltip'
import { useServerForm } from '@/components/form'
import {
  formatTimeInSchoolTz,
  nowTimeInSchoolTz,
  schoolTzToUtcIso,
  todayInSchoolTz,
} from '@/lib/datetime'
import { personName } from '@/lib/format'
import type { StackedRowSpec } from '@/lib/grid/columns'
import { canManageStaffAttendance } from '@/lib/permissions'
import type { StaffRole } from '@/types/next-auth'

import { signInAction, signOutAction } from './actions'
import SignInSheetPrintTable from './SignInSheetPrintTable'
import { useSchoolClock } from './useSchoolClock'

export type StaffMember = {
  id: string
  first_name: string
  last_name: string
  display_name: string | null
  class_name: string | null
  class_year_group: string | null
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

const timeInputClass =
  'min-w-0 flex-1 rounded-md border border-gray-200 px-2 py-1 text-sm tabular-nums focus:ring-2 focus:ring-blue-500 focus:outline-none disabled:opacity-60 sm:flex-none'

/**
 * The time a tap will record. Until opened for editing it is a read-only
 * chip (the live clock today); a double-click, or Enter/Space, swaps in a
 * time input so the time can be set by hand.
 */
function SignTimeField({
  time,
  editing,
  autoFocus,
  disabled,
  onEdit,
  onCancel,
}: {
  time: string
  editing: boolean
  autoFocus: boolean
  disabled: boolean
  onEdit: () => void
  onCancel?: () => void
}) {
  if (editing) {
    return (
      <input
        type="time"
        name="time"
        aria-label="Time"
        defaultValue={time}
        required
        autoFocus={autoFocus}
        disabled={disabled}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && onCancel) {
            e.preventDefault()
            onCancel()
          }
        }}
        className={timeInputClass}
      />
    )
  }
  return (
    <button
      type="button"
      title="Double-click to change the time"
      aria-label={`Time ${time}, double-click to change`}
      disabled={disabled}
      onDoubleClick={onEdit}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onEdit()
        }
      }}
      className={`${timeInputClass} cursor-pointer touch-manipulation bg-gray-50 text-left text-gray-700 select-none`}
    >
      {time}
    </button>
  )
}

/**
 * The status badge and the sign-in/out form for one row, as a single
 * component so the optimistic record is shared between them — TanStack
 * cells are plain functions, not components, so hooks can only live in a
 * genuine child component like this one.
 */
function SignInOutCell({
  staff,
  record: saved,
  onSaved,
  time,
  live,
  isHistorical,
  date,
  role,
  currentStaffId,
}: {
  staff: StaffMember
  /** The row as last written. */
  record: StaffAttendanceRow | null
  onSaved: (staffId: string, record: StaffAttendanceRow | null) => void
  /** The live clock today, otherwise the day's default time. */
  time: string
  /** Whether `time` is the live clock (the page shows today). */
  live: boolean
  /** Past days open straight into the time input. */
  isHistorical: boolean
  date: string
  role: StaffRole
  currentStaffId: string
}) {
  // Shows a tap straight away and falls back to `saved` by itself if the
  // save fails.
  const [record, setOptimisticRecord] = useOptimistic(saved)
  const [editing, setEditing] = useState(isHistorical)
  const isSignedIn = !!record && !record.signed_out_at
  const canManageOthers = canManageStaffAttendance(role)
  const isSelf = staff.id === currentStaffId
  const disabled = !canManageOthers && !isSelf

  /** Unless the time was set by hand, record the moment of the tap. */
  function withTime(fd: FormData): FormData {
    if (!editing) fd.set('time', live ? nowTimeInSchoolTz() : time)
    return fd
  }

  function handleSaved(row: StaffAttendanceRow | null): void {
    onSaved(staff.id, row)
    if (!isHistorical) setEditing(false)
  }

  const signIn = useServerForm(
    async (fd: FormData) => {
      withTime(fd)
      setOptimisticRecord(predictRecord(saved, fd, true))
      return signInAction(fd)
    },
    { onSuccess: handleSaved },
  )
  const signOut = useServerForm(
    async (fd: FormData) => {
      withTime(fd)
      setOptimisticRecord(predictRecord(saved, fd, false))
      return signOutAction(fd)
    },
    { onSuccess: handleSaved },
  )
  const { handleSubmit, error } = isSignedIn ? signOut : signIn
  // The optimistic row flips which form shows mid-save, so either pending
  // save keeps the row's controls disabled.
  const isPending = signIn.isPending || signOut.isPending

  const actionForm = disabled ? (
    <Tooltip text="You can only sign yourself in/out">
      <span className="text-sm text-gray-400">—</span>
    </Tooltip>
  ) : (
    <form onSubmit={handleSubmit} className="flex items-center gap-2">
      <input type="hidden" name="staffId" value={staff.id} />
      <input type="hidden" name="date" value={date} />
      <SignTimeField
        time={time}
        editing={editing}
        autoFocus={!isHistorical}
        disabled={isPending}
        onEdit={() => setEditing(true)}
        onCancel={isHistorical ? undefined : () => setEditing(false)}
      />
      <button
        type="submit"
        disabled={isPending}
        className={`w-24 shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium transition disabled:opacity-60 ${
          isSignedIn
            ? 'bg-amber-100 text-amber-800 hover:bg-amber-200'
            : 'bg-green-100 text-green-800 hover:bg-green-200'
        }`}
      >
        {isPending ? 'Saving…' : isSignedIn ? 'Sign Out' : 'Sign In'}
      </button>
    </form>
  )

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <StatusBadge record={record} />
      <div>
        {error && <p className="mb-1 text-xs text-red-600">{error}</p>}
        {actionForm}
      </div>
    </div>
  )
}

type Props = {
  rows: TableRow[]
  /** Today: the server's current time. Other days: that day's default. */
  defaultTime: string
  date: string
  /** The school's today when the page rendered. */
  today: string
  role: StaffRole
  currentStaffId: string
  /** Also render the print-only sign-in sheet, from the same saved rows. */
  withPrintSheet?: boolean
}

/** A save, and the `updated_at` of the rendered row it replaced. */
type SavedOverride = {
  record: StaffAttendanceRow | null
  basis: string | null
}

/**
 * Saves are applied over the rows the page rendered with, so the screen and
 * the printed sheet both show them without a re-fetch. The page keys this on
 * the date: a `?date=` change doesn't remount it.
 *
 * Today, the clock ticks every minute and each tick re-fetches the rows, so
 * a tablet left open at reception also picks up sign-ins made on phones, and
 * moves on to the new day once the date changes.
 */
export default function StaffAttendanceTable({
  rows,
  defaultTime,
  date,
  today,
  role,
  currentStaffId,
  withPrintSheet = false,
}: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const live = date === today
  const time = useSchoolClock(defaultTime, live, () => {
    // Dropping `?date=` lets the page fall back to the new today.
    if (todayInSchoolTz() !== date) router.replace(pathname)
    else router.refresh()
  })

  // Staff id → the row as last saved; null when a sign-out found no row.
  const [savedById, setSavedById] = useState<Record<string, SavedOverride>>({})
  // A save wins until a re-fetch brings a newer row than the one it replaced.
  const current = rows.map((row) => {
    const saved = savedById[row.staff.id]
    return saved && saved.basis === (row.record?.updated_at ?? null)
      ? { ...row, record: saved.record }
      : row
  })

  function handleSaved(
    staffId: string,
    record: StaffAttendanceRow | null,
  ): void {
    const rendered = rows.find((row) => row.staff.id === staffId)
    const basis = rendered?.record?.updated_at ?? null
    setSavedById((prev) => ({ ...prev, [staffId]: { record, basis } }))
  }

  const isHistorical = date < today

  function renderSignInOut(row: TableRow): React.ReactNode {
    return (
      <SignInOutCell
        staff={row.staff}
        record={row.record}
        onSaved={handleSaved}
        time={time}
        live={live}
        isHistorical={isHistorical}
        date={date}
        role={role}
        currentStaffId={currentStaffId}
      />
    )
  }

  const columns: FunctionalGridColumn<TableRow>[] = [
    {
      id: 'name',
      header: 'Name',
      cell: (info) => personName(info.row.original.staff),
      enableSorting: false,
      meta: { primary: true },
    },
    {
      id: 'sign_in_out',
      header: 'Sign in / out',
      cell: (info) => renderSignInOut(info.row.original),
      enableSorting: false,
    },
    {
      id: 'room',
      header: 'Room',
      cell: (info) => info.row.original.staff.room_number ?? '—',
      enableSorting: false,
    },
    {
      id: 'class',
      header: 'Class',
      cell: (info) => info.row.original.staff.class_name ?? '—',
      enableSorting: false,
    },
  ]

  const stacked: StackedRowSpec<TableRow> = {
    title: (row) => personName(row.staff),
    details: (row) =>
      [
        row.staff.room_number ? `Room ${row.staff.room_number}` : null,
        row.staff.class_name,
      ].filter((detail): detail is string => Boolean(detail)),
    detailsAside: (row) => renderSignInOut(row),
  }

  const table = (
    <FunctionalGrid
      data={current}
      columns={columns}
      getRowId={(row) => row.staff.id}
      mobile="stacked"
      stacked={stacked}
      emptyMessage="No staff found."
    />
  )

  if (!withPrintSheet) return table
  return (
    <>
      <div className="print:hidden">{table}</div>
      <SignInSheetPrintTable rows={current} />
    </>
  )
}
