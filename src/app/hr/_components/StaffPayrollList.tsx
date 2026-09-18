import Link from 'next/link'

import SimpleGrid from '@/components/grid/SimpleGrid'
import { getStaffPayrollList, type StaffPayrollRow } from '@/db'
import {
  expiryState,
  labelFor,
  maskLastFour,
  PAYMENT_FUNDING_LABELS,
  type ExpiryState,
} from '@/lib/compliance'
import { formatCalendarDate, todayInSchoolTz } from '@/lib/datetime'
import type { GridColumn } from '@/lib/grid/columns'
import { rowLink } from '@/lib/grid/styles'

import EmptyState from '../../_components/EmptyState'

type StaffMember = Awaited<ReturnType<typeof getStaffPayrollList>>[number]

const STATE_STYLES: Record<ExpiryState, string> = {
  expired: 'font-medium text-red-700',
  expiring: 'font-medium text-amber-700',
  ok: 'text-gray-700',
}

function formatDate(date: string): string {
  return formatCalendarDate(date, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function Tick({
  ok,
  label,
}: {
  ok: boolean
  label: string
}): React.ReactElement {
  return (
    <span className={ok ? 'text-green-700' : 'text-gray-400'}>
      {ok ? '✓' : '✗'} {label}
    </span>
  )
}

function Certificate({
  held,
  date,
  today,
  dueLabel,
  pastLabel,
}: {
  held: boolean
  date: string | null
  today: string
  dueLabel: string
  pastLabel: string
}): React.ReactElement {
  if (!held) return <span className="text-gray-400">Not recorded</span>
  const state = expiryState(date, today)
  if (!date || !state) return <span className="text-green-700">✓ Held</span>
  return (
    <span className={STATE_STYLES[state]}>
      {state === 'expired' ? pastLabel : dueLabel} {formatDate(date)}
    </span>
  )
}

function hasLapsed(payroll: StaffPayrollRow, today: string): boolean {
  return (
    (payroll.dbs_verified &&
      expiryState(payroll.dbs_renewal_due, today) === 'expired') ||
    (payroll.first_aid_certified &&
      expiryState(payroll.first_aid_expiry_date, today) === 'expired') ||
    (payroll.fire_warden_certified &&
      expiryState(payroll.fire_warden_expiry_date, today) === 'expired')
  )
}

export default async function StaffPayrollList(): Promise<React.ReactElement> {
  const staff = await getStaffPayrollList()
  const today = todayInSchoolTz()

  if (staff.length === 0) return <EmptyState message="No staff found." />

  const columns: GridColumn<StaffMember>[] = [
    {
      id: 'staff_member',
      header: 'Staff member',
      primary: true,
      className: 'whitespace-nowrap',
      cell: (member) =>
        `${member.title} ${member.first_name} ${member.last_name}`,
    },
    {
      id: 'funding',
      header: 'Funding',
      className: 'whitespace-nowrap',
      cell: (member) =>
        member.payroll
          ? labelFor(PAYMENT_FUNDING_LABELS, member.payroll.payment_funding)
          : 'No record',
    },
    {
      id: 'bank',
      header: 'Bank',
      className: 'whitespace-nowrap font-mono',
      cell: (member) =>
        member.payroll
          ? (maskLastFour(member.payroll.bank_account_number) ?? '—')
          : null,
    },
    {
      id: 'id_rtw',
      header: 'ID / RTW',
      className: 'whitespace-nowrap',
      cell: (member) =>
        member.payroll ? (
          <div className="flex flex-col">
            <Tick ok={member.payroll.id_verified} label="ID" />
            <Tick
              ok={member.payroll.right_to_work_checked}
              label="Right to work"
            />
          </div>
        ) : null,
    },
    {
      id: 'dbs',
      header: 'DBS',
      className: 'whitespace-nowrap',
      cell: (member) =>
        member.payroll ? (
          <Certificate
            held={member.payroll.dbs_verified}
            date={member.payroll.dbs_renewal_due}
            today={today}
            dueLabel="Renew by"
            pastLabel="Renewal overdue since"
          />
        ) : null,
    },
    {
      id: 'first_aid',
      header: 'First aid',
      className: 'whitespace-nowrap',
      cell: (member) =>
        member.payroll ? (
          <Certificate
            held={member.payroll.first_aid_certified}
            date={member.payroll.first_aid_expiry_date}
            today={today}
            dueLabel="Expires"
            pastLabel="Expired"
          />
        ) : null,
    },
    {
      id: 'fire_warden',
      header: 'Fire warden',
      className: 'whitespace-nowrap',
      cell: (member) =>
        member.payroll ? (
          <Certificate
            held={member.payroll.fire_warden_certified}
            date={member.payroll.fire_warden_expiry_date}
            today={today}
            dueLabel="Expires"
            pastLabel="Expired"
          />
        ) : null,
    },
    {
      id: 'actions',
      header: 'Actions',
      srOnlyHeader: true,
      align: 'right',
      className: 'whitespace-nowrap',
      cell: (member) => (
        <Link
          href={`/hr/staff/${member.id}`}
          className={`font-medium ${rowLink}`}
        >
          {member.payroll ? 'Edit' : 'Add record'}
        </Link>
      ),
    },
  ]

  return (
    <SimpleGrid
      columns={columns}
      rows={staff}
      getRowKey={(member) => member.id}
      rowClassName={(member) =>
        member.payroll && hasLapsed(member.payroll, today)
          ? 'bg-red-50'
          : undefined
      }
      rowTestId={(member) => `payroll-row-${member.id}`}
    />
  )
}
