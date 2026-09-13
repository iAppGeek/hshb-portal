import Link from 'next/link'
import clsx from 'clsx'

import { getStaffPayrollList, type StaffPayrollRow } from '@/db'
import {
  expiryState,
  labelFor,
  maskLastFour,
  PAYMENT_FUNDING_LABELS,
  type ExpiryState,
} from '@/lib/compliance'
import { formatCalendarDate, todayInSchoolTz } from '@/lib/datetime'

import EmptyState from '../../../_components/EmptyState'

const TH =
  'px-3 py-3 text-left text-xs font-medium tracking-wide text-gray-500 uppercase'
const TD = 'px-3 py-3 text-sm whitespace-nowrap text-gray-700'

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

export default async function StaffPayrollTab(): Promise<React.ReactElement> {
  const staff = await getStaffPayrollList()
  const today = todayInSchoolTz()

  if (staff.length === 0) return <EmptyState message="No staff found." />

  return (
    <div className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-gray-200">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className={TH}>Staff member</th>
              <th className={TH}>Funding</th>
              <th className={TH}>Bank</th>
              <th className={TH}>ID / RTW</th>
              <th className={TH}>DBS</th>
              <th className={TH}>First aid</th>
              <th className={TH}>Fire warden</th>
              <th className={`relative ${TH}`}>
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {staff.map((member) => {
              const p = member.payroll
              const href = `/finance/staff/${member.id}`
              return (
                <tr
                  key={member.id}
                  data-testid={`payroll-row-${member.id}`}
                  className={clsx(
                    'hover:bg-gray-50',
                    p && hasLapsed(p, today) && 'bg-red-50',
                  )}
                >
                  <td className={clsx(TD, 'font-medium text-gray-900')}>
                    {member.title} {member.first_name} {member.last_name}
                  </td>
                  {p ? (
                    <>
                      <td className={TD}>
                        {labelFor(PAYMENT_FUNDING_LABELS, p.payment_funding)}
                      </td>
                      <td className={clsx(TD, 'font-mono')}>
                        {maskLastFour(p.bank_account_number) ?? '—'}
                      </td>
                      <td className={TD}>
                        <div className="flex flex-col">
                          <Tick ok={p.id_verified} label="ID" />
                          <Tick
                            ok={p.right_to_work_checked}
                            label="Right to work"
                          />
                        </div>
                      </td>
                      <td className={TD}>
                        <Certificate
                          held={p.dbs_verified}
                          date={p.dbs_renewal_due}
                          today={today}
                          dueLabel="Renew by"
                          pastLabel="Renewal overdue since"
                        />
                      </td>
                      <td className={TD}>
                        <Certificate
                          held={p.first_aid_certified}
                          date={p.first_aid_expiry_date}
                          today={today}
                          dueLabel="Expires"
                          pastLabel="Expired"
                        />
                      </td>
                      <td className={TD}>
                        <Certificate
                          held={p.fire_warden_certified}
                          date={p.fire_warden_expiry_date}
                          today={today}
                          dueLabel="Expires"
                          pastLabel="Expired"
                        />
                      </td>
                    </>
                  ) : (
                    <td colSpan={6} className={clsx(TD, 'text-gray-400')}>
                      No record
                    </td>
                  )}
                  <td className={clsx(TD, 'text-right')}>
                    <Link
                      href={href}
                      className="font-medium text-blue-600 hover:text-blue-800"
                    >
                      {p ? 'Edit' : 'Add record'}
                    </Link>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
