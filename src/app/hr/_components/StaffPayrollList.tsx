import Link from 'next/link'

import ComplianceSummaryCard from '@/components/ComplianceSummaryCard'
import SimpleGrid from '@/components/grid/SimpleGrid'
import StatusBadge from '@/components/StatusBadge'
import type { StaffPayrollRow } from '@/db'
import { expiryState } from '@/lib/compliance'
import { formatCalendarDate, todayInSchoolTz } from '@/lib/datetime'
import type { GridColumn } from '@/lib/grid/columns'
import { rowLink } from '@/lib/grid/styles'
import {
  dbsCheckedStatus,
  NO_CURRENT_YEAR_MESSAGE,
  STATUS_LABELS,
  staffComplianceStatus,
} from '@/lib/hrStatus'

import EmptyState from '../../_components/EmptyState'
import { loadHrCompliance, type HrCompliance } from '../_lib/loadHrCompliance'

type StaffMember = HrCompliance['staff'][number]

function formatDate(date: string): string {
  return formatCalendarDate(date, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
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
  const today = todayInSchoolTz()
  const { staff, year, summary } = await loadHrCompliance(today)

  if (staff.length === 0) return <EmptyState message="No staff found." />

  function dbsChecked(member: StaffMember): React.ReactElement {
    const status = dbsCheckedStatus(member.payroll, year)
    const checkedOn = member.payroll?.dbs_verified
      ? member.payroll.dbs_verified_at
      : null
    return (
      <StatusBadge
        level={status.level}
        label={checkedOn ? formatDate(checkedOn) : 'Not checked'}
        reasons={status.reasons}
      />
    )
  }

  function overallStatus(member: StaffMember): React.ReactElement {
    const status = staffComplianceStatus(member.payroll, year, today)
    return (
      <StatusBadge
        level={status.level}
        label={STATUS_LABELS[status.level]}
        reasons={status.reasons}
      />
    )
  }

  function editLink(member: StaffMember): React.ReactElement {
    return (
      <Link
        href={`/hr/staff/${member.id}`}
        className={`font-medium ${rowLink}`}
      >
        {member.payroll ? 'Edit' : 'Add record'}
      </Link>
    )
  }

  const columns: GridColumn<StaffMember>[] = [
    {
      id: 'staff_member',
      header: 'Staff member',
      primary: true,
      cell: (member) =>
        `${member.title} ${member.first_name} ${member.last_name}`,
    },
    {
      id: 'dbs_checked',
      header: 'DBS checked',
      className: 'whitespace-nowrap',
      cell: dbsChecked,
    },
    {
      id: 'status',
      header: 'Status',
      className: 'whitespace-nowrap',
      cell: overallStatus,
    },
    {
      id: 'actions',
      header: 'Actions',
      srOnlyHeader: true,
      align: 'right',
      className: 'whitespace-nowrap',
      cell: editLink,
    },
  ]

  return (
    <div className="space-y-4">
      {summary.noCurrentYear && (
        <p
          role="alert"
          className="rounded-md bg-amber-50 p-4 text-sm font-medium text-amber-800 ring-1 ring-amber-200"
        >
          {NO_CURRENT_YEAR_MESSAGE}
        </p>
      )}

      <ComplianceSummaryCard summary={summary} />

      <SimpleGrid
        columns={columns}
        rows={staff}
        getRowKey={(member) => member.id}
        // On a phone each row is the name and Edit, with both statuses
        // beneath, so nothing needs a sideways scroll.
        mobile="stacked"
        stacked={{
          // An unbroken long name would otherwise widen every row.
          title: (member) => (
            <span className="wrap-anywhere">
              {`${member.title} ${member.first_name} ${member.last_name}`}
            </span>
          ),
          titleAside: editLink,
          details: (member) => [
            <span key="dbs">DBS {dbsChecked(member)}</span>,
            overallStatus(member),
          ],
        }}
        rowClassName={(member) =>
          member.payroll && hasLapsed(member.payroll, today)
            ? 'bg-red-50'
            : undefined
        }
        rowTestId={(member) => `payroll-row-${member.id}`}
      />
    </div>
  )
}
