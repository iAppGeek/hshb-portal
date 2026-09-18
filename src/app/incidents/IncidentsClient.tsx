'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'

import type { IncidentRow, IncidentType } from '@/db'
import Table from '@/components/grid/Table'
import TableCard from '@/components/grid/TableCard'
import Td from '@/components/grid/Td'
import Th from '@/components/grid/Th'
import Tooltip from '@/components/Tooltip'
import { formatDateInSchoolTz } from '@/lib/datetime'
import { tbody, thead } from '@/lib/grid/styles'
import { isTeacher } from '@/lib/permissions'
import type { StaffRole } from '@/types/next-auth'

type Props = {
  incidents: IncidentRow[]
  role: StaffRole
  staffId: string
  canEdit: boolean
}

const TABS: { type: IncidentType; label: string }[] = [
  { type: 'medical', label: 'Medical' },
  { type: 'behaviour', label: 'Behaviour' },
  { type: 'other', label: 'Other' },
]

export default function IncidentsClient({ incidents, role, canEdit }: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const activeTab = (searchParams.get('tab') as IncidentType) ?? 'medical'

  const filtered = incidents.filter((i) => i.type === activeTab)

  function setTab(tab: IncidentType) {
    router.replace(`/incidents?tab=${tab}`)
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Incidents</h1>
        <Link
          href={`/incidents/new?type=${activeTab}`}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700"
        >
          Add incident
        </Link>
      </div>

      <div className="mb-4 flex gap-2">
        {TABS.map((tab) => (
          <button
            key={tab.type}
            onClick={() => setTab(tab.type)}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
              activeTab === tab.type
                ? 'bg-blue-600 text-white'
                : 'bg-white text-gray-700 ring-1 ring-gray-200 hover:bg-gray-50'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {isTeacher(role) && (
        <p className="mb-4 text-sm text-gray-500">
          You can only view and record incidents for students in your class.
        </p>
      )}

      {filtered.length === 0 ? (
        <div className="rounded-xl bg-white p-12 text-center shadow-sm ring-1 ring-gray-200">
          <p className="text-gray-500">No {activeTab} incidents found.</p>
        </div>
      ) : (
        <>
          {/* Mobile card list */}
          <div className="space-y-3 sm:hidden">
            {filtered.map((incident) => (
              <div
                key={incident.id}
                className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-gray-200"
              >
                <div className="mb-2 flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {incident.student.last_name},{' '}
                      {incident.student.first_name}
                    </p>
                    <p className="text-xs text-gray-500">
                      {formatDateInSchoolTz(incident.incident_date)}
                    </p>
                  </div>
                  {canEdit ? (
                    <Link
                      href={`/incidents/${incident.id}/edit`}
                      className="shrink-0 text-xs font-medium text-blue-600 hover:text-blue-800"
                    >
                      Edit
                    </Link>
                  ) : (
                    !isTeacher(role) && (
                      <Tooltip text="You don't have permission to edit incidents">
                        <span className="shrink-0 cursor-not-allowed text-xs font-medium text-gray-400">
                          Edit
                        </span>
                      </Tooltip>
                    )
                  )}
                </div>
                <p className="text-sm font-medium text-gray-800">
                  {incident.title}
                </p>
                <p className="mt-1 line-clamp-2 text-sm text-gray-500">
                  {incident.description}
                </p>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-400">
                  <span>
                    By {incident.creator.first_name}{' '}
                    {incident.creator.last_name}
                  </span>
                  {incident.updater && (
                    <span>
                      Updated by {incident.updater.first_name}{' '}
                      {incident.updater.last_name}
                    </span>
                  )}
                  <span>
                    Guardians notified:{' '}
                    {incident.parent_notified_at
                      ? formatDateInSchoolTz(incident.parent_notified_at)
                      : incident.parent_notified
                        ? 'Yes'
                        : 'No'}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop table */}
          <TableCard className="hidden sm:block">
            <Table>
              <thead className={thead}>
                <tr>
                  {[
                    'Incident date',
                    'Student',
                    'Title',
                    'Description',
                    'Recorded by',
                    'Last updated',
                    'Guardians notified',
                    ...(!isTeacher(role) ? [''] : []),
                  ].map((h) => (
                    <Th key={h}>{h}</Th>
                  ))}
                </tr>
              </thead>
              <tbody className={tbody}>
                {filtered.map((incident) => (
                  <tr key={incident.id} className="hover:bg-gray-50">
                    <Td
                      mobile="scroll"
                      meta={{ className: 'whitespace-nowrap text-gray-900' }}
                    >
                      {formatDateInSchoolTz(incident.incident_date)}
                    </Td>
                    <Td
                      mobile="scroll"
                      meta={{ className: 'whitespace-nowrap text-gray-900' }}
                    >
                      {incident.student.last_name},{' '}
                      {incident.student.first_name}
                    </Td>
                    <Td mobile="scroll" meta={{ className: 'text-gray-900' }}>
                      {incident.title}
                    </Td>
                    <Td mobile="scroll">
                      <span
                        title={incident.description}
                        className="line-clamp-2 max-w-xs"
                      >
                        {incident.description}
                      </span>
                    </Td>
                    <Td
                      mobile="scroll"
                      meta={{ className: 'whitespace-nowrap' }}
                    >
                      {incident.creator.first_name} {incident.creator.last_name}
                    </Td>
                    <Td
                      mobile="scroll"
                      meta={{ className: 'whitespace-nowrap' }}
                    >
                      {incident.updater
                        ? `${incident.updater.first_name} ${incident.updater.last_name}`
                        : '—'}
                    </Td>
                    <Td
                      mobile="scroll"
                      meta={{ className: 'whitespace-nowrap' }}
                    >
                      {incident.parent_notified_at
                        ? formatDateInSchoolTz(incident.parent_notified_at)
                        : incident.parent_notified
                          ? 'Yes'
                          : '—'}
                    </Td>
                    {canEdit ? (
                      <Td
                        mobile="scroll"
                        meta={{ className: 'whitespace-nowrap' }}
                      >
                        <Link
                          href={`/incidents/${incident.id}/edit`}
                          className="font-medium text-blue-600 hover:text-blue-800"
                        >
                          Edit
                        </Link>
                      </Td>
                    ) : (
                      !isTeacher(role) && (
                        <Td
                          mobile="scroll"
                          meta={{ className: 'whitespace-nowrap' }}
                        >
                          <Tooltip text="You don't have permission to edit incidents">
                            <span className="cursor-not-allowed font-medium text-gray-400">
                              Edit
                            </span>
                          </Tooltip>
                        </Td>
                      )
                    )}
                  </tr>
                ))}
              </tbody>
            </Table>
          </TableCard>
        </>
      )}
    </div>
  )
}
