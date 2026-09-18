import type { ReactElement } from 'react'

import EditAction from '@/components/EditAction'
import SimpleGrid from '@/components/grid/SimpleGrid'
import type { getAllStaffWithClasses } from '@/db'
import type { GridColumn, StackedRowSpec } from '@/lib/grid/columns'
import { rowLink } from '@/lib/grid/styles'
import { canSeeAllData } from '@/lib/permissions'
import { roleLabels } from '@/lib/roleLabels'
import type { StaffRole } from '@/types/next-auth'

export type StaffMember = Awaited<
  ReturnType<typeof getAllStaffWithClasses>
>[number]

type StaffClass = { id: string; name: string; room_number: string | null }

type Props = {
  staff: StaffMember[]
  canEdit: boolean
  canSeeContact: boolean
  role: StaffRole
}

function classesOf(member: StaffMember): StaffClass[] {
  return (member.classes as StaffClass[] | null) ?? []
}

function classesText(member: StaffMember): string {
  const classes = classesOf(member)
  return classes.length > 0 ? classes.map((c) => c.name).join(', ') : '—'
}

function roomText(member: StaffMember): string {
  const classes = classesOf(member)
  return classes.length > 0
    ? classes.map((c) => c.room_number ?? '—').join(', ')
    : '—'
}

export default function StaffTable({
  staff,
  canEdit,
  canSeeContact,
  role,
}: Props): ReactElement {
  const showDisabled = canEdit === false && canSeeAllData(role)
  const showActions = canEdit || canSeeAllData(role)

  const editAction = (member: StaffMember): ReactElement => (
    <EditAction
      href={`/staff/${member.id}/edit`}
      canEdit={canEdit}
      showDisabled={showDisabled}
      noun="staff"
    />
  )

  const columns: GridColumn<StaffMember>[] = [
    { id: 'title', header: 'Title', cell: (m) => m.title },
    {
      id: 'first_name',
      header: 'First name',
      primary: true,
      cell: (m) => m.first_name,
    },
    {
      id: 'last_name',
      header: 'Last name',
      primary: true,
      cell: (m) => m.last_name,
    },
    {
      id: 'display_name',
      header: 'Display name',
      cell: (m) => m.display_name ?? '—',
    },
    {
      id: 'role',
      header: 'Role',
      cell: (m) => roleLabels[m.role as StaffRole] ?? m.role,
    },
    {
      id: 'email',
      header: 'Email',
      cell: (m) => (
        <a href={`mailto:${m.email}`} className={rowLink}>
          {m.email}
        </a>
      ),
    },
    ...(canSeeContact
      ? [
          {
            id: 'contact',
            header: 'Contact',
            cell: (m: StaffMember) =>
              m.contact_number ? (
                <a href={`tel:${m.contact_number}`} className={rowLink}>
                  {m.contact_number}
                </a>
              ) : (
                '—'
              ),
          },
          {
            id: 'personal_email',
            header: 'Personal Email',
            cell: (m: StaffMember) =>
              m.personal_email ? (
                <a href={`mailto:${m.personal_email}`} className={rowLink}>
                  {m.personal_email}
                </a>
              ) : (
                '—'
              ),
          },
        ]
      : []),
    { id: 'class', header: 'Class', cell: (m) => classesText(m) },
    { id: 'room', header: 'Room', cell: (m) => roomText(m) },
    ...(showActions
      ? [{ id: 'actions', header: 'Actions', cell: editAction }]
      : []),
  ]

  const stacked: StackedRowSpec<StaffMember> = {
    title: (m) => `${m.title} ${m.first_name} ${m.last_name}`,
    titleAside: showActions ? editAction : undefined,
    details: (m) => [
      m.display_name ?? '—',
      roleLabels[m.role as StaffRole] ?? m.role,
      <a key="email" href={`mailto:${m.email}`} className={rowLink}>
        {m.email}
      </a>,
      classesText(m),
      roomText(m),
      ...(canSeeContact
        ? [
            m.contact_number ? (
              <a
                key="contact"
                href={`tel:${m.contact_number}`}
                className={rowLink}
              >
                {m.contact_number}
              </a>
            ) : (
              '—'
            ),
            m.personal_email ? (
              <a
                key="personal_email"
                href={`mailto:${m.personal_email}`}
                className={rowLink}
              >
                {m.personal_email}
              </a>
            ) : (
              '—'
            ),
          ]
        : []),
    ],
  }

  return (
    <SimpleGrid
      columns={columns}
      rows={staff}
      getRowKey={(m) => m.id}
      mobile="stacked"
      stacked={stacked}
    />
  )
}
