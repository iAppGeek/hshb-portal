import { type Metadata } from 'next'
import Link from 'next/link'

import { requireSession } from '@/auth/require'
import { getIncidents, getStudentIdsByTeacher } from '@/db'
import type { IncidentRow, IncidentType } from '@/db'
import SimpleGrid from '@/components/grid/SimpleGrid'
import PermissionedLink from '@/components/PermissionedLink'
import TabBar, { type Tab } from '@/components/TabBar'
import { formatDateInSchoolTz } from '@/lib/datetime'
import type { GridColumn, StackedRowSpec } from '@/lib/grid/columns'
import { personName } from '@/lib/format'
import { isTeacher, canEditIncidents } from '@/lib/permissions'
import { incidentTypeFilter } from '@/lib/schemas'

import PageHeader from '../_components/PageHeader'

export const metadata: Metadata = { title: 'Incidents' }

const TABS: Tab[] = [
  { key: 'medical', label: 'Medical', href: '/incidents?type=medical' },
  { key: 'behaviour', label: 'Behaviour', href: '/incidents?type=behaviour' },
  { key: 'other', label: 'Other', href: '/incidents?type=other' },
]

function notifiedCell(incident: IncidentRow): React.ReactNode {
  return incident.parent_notified_at
    ? formatDateInSchoolTz(incident.parent_notified_at)
    : incident.parent_notified
      ? 'Yes'
      : '—'
}

export default async function IncidentsPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>
}): Promise<React.ReactElement> {
  const actor = await requireSession()
  const role = actor.role
  const staffId = actor.staffId
  const teacherOnly = isTeacher(role)
  const canEdit = canEditIncidents(role)

  const params = await searchParams
  const type: IncidentType = incidentTypeFilter.parse(params.type)

  const studentIds = teacherOnly
    ? await getStudentIdsByTeacher(staffId)
    : undefined
  const incidents = await getIncidents({
    type,
    studentIds,
    createdBy: teacherOnly ? staffId : undefined,
    limit: 50,
  })

  const showActions = canEdit || !teacherOnly

  const columns: GridColumn<IncidentRow>[] = [
    {
      id: 'incident_date',
      header: 'Incident date',
      dark: true,
      className: 'whitespace-nowrap',
      cell: (incident) => formatDateInSchoolTz(incident.incident_date),
    },
    {
      id: 'student',
      header: 'Student',
      primary: true,
      className: 'whitespace-nowrap',
      cell: (incident) => personName(incident.student, 'lastFirst'),
    },
    {
      id: 'title',
      header: 'Title',
      dark: true,
      cell: (incident) => incident.title,
    },
    {
      id: 'description',
      header: 'Description',
      cell: (incident) => (
        <span title={incident.description} className="line-clamp-2 max-w-xs">
          {incident.description}
        </span>
      ),
    },
    {
      id: 'recorded_by',
      header: 'Recorded by',
      className: 'whitespace-nowrap',
      cell: (incident) => personName(incident.creator),
    },
    {
      id: 'last_updated',
      header: 'Last updated',
      className: 'whitespace-nowrap',
      cell: (incident) => personName(incident.updater),
    },
    {
      id: 'guardians_notified',
      header: 'Guardians notified',
      className: 'whitespace-nowrap',
      cell: notifiedCell,
    },
    ...(showActions
      ? [
          {
            id: 'actions',
            header: 'Actions',
            srOnlyHeader: true,
            align: 'right' as const,
            className: 'whitespace-nowrap font-medium',
            cell: (incident: IncidentRow) => (
              <PermissionedLink
                href={`/incidents/${incident.id}/edit`}
                allowed={canEdit}
                showDisabled={!teacherOnly}
                disabledReason="You don't have permission to edit incidents"
              >
                Edit
              </PermissionedLink>
            ),
          },
        ]
      : []),
  ]

  const stacked: StackedRowSpec<IncidentRow> = {
    title: (incident) => personName(incident.student, 'lastFirst'),
    titleAside: showActions
      ? (incident) => (
          <PermissionedLink
            href={`/incidents/${incident.id}/edit`}
            allowed={canEdit}
            showDisabled={!teacherOnly}
            disabledReason="You don't have permission to edit incidents"
            className="text-xs font-medium text-blue-600 hover:text-blue-800"
          >
            Edit
          </PermissionedLink>
        )
      : undefined,
    details: (incident) => [
      formatDateInSchoolTz(incident.incident_date),
      incident.title,
      incident.description,
    ],
  }

  return (
    <div>
      <PageHeader
        title="Incidents"
        action={
          <Link
            href={`/incidents/new?type=${type}`}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700"
          >
            Add incident
          </Link>
        }
      />

      <TabBar tabs={TABS} current={type} ariaLabel="Incident type" />

      {teacherOnly && (
        <p className="mb-4 text-sm text-gray-500">
          You can only view and record incidents for students in your class.
        </p>
      )}

      <SimpleGrid
        columns={columns}
        rows={incidents}
        getRowKey={(incident) => incident.id}
        mobile="stacked"
        stacked={stacked}
        emptyMessage={`No ${type} incidents found.`}
      />
    </div>
  )
}
