import type { ReactElement } from 'react'
import Link from 'next/link'

import ActiveBadge from '@/components/ActiveBadge'
import EditAction from '@/components/EditAction'
import SimpleGrid from '@/components/grid/SimpleGrid'
import type { GridColumn, StackedRowSpec } from '@/lib/grid/columns'
import { actionsCell, detailsLink } from '@/lib/grid/styles'
import { canSeeAllData } from '@/lib/permissions'
import type { StaffRole } from '@/types/next-auth'

type Teacher = {
  first_name: string
  last_name: string
} | null

export type ClassRow = {
  id: string
  name: string
  year_group: string
  room_number: string | null
  academic_year: string | null
  academic_year_id: string
  active: boolean
  teacher: Teacher
  /** Open (active, current year) — every other class is read-only. */
  editable: boolean
}

type Props = {
  classes: ClassRow[]
  canEdit: boolean
  role: StaffRole
}

function teacherName(cls: ClassRow): string {
  return cls.teacher
    ? `${cls.teacher.last_name}, ${cls.teacher.first_name}`
    : '—'
}

export default function ClassesTable({
  classes,
  canEdit,
  role,
}: Props): ReactElement {
  const columns: GridColumn<ClassRow>[] = [
    {
      id: 'name',
      header: 'Name',
      primary: true,
      className: 'sm:whitespace-nowrap',
      cell: (cls) => cls.name,
    },
    { id: 'year_group', header: 'Year Group', cell: (cls) => cls.year_group },
    { id: 'room', header: 'Room', cell: (cls) => cls.room_number ?? '—' },
    { id: 'teacher', header: 'Teacher', cell: (cls) => teacherName(cls) },
    {
      id: 'academic_year',
      header: 'Academic Year',
      cell: (cls) => cls.academic_year ?? '—',
    },
    {
      id: 'status',
      header: 'Status',
      cell: (cls) => <ActiveBadge active={cls.active} />,
    },
    {
      id: 'actions',
      header: 'Actions',
      srOnlyHeader: true,
      align: 'right',
      cell: (cls) => (
        <div className={actionsCell}>
          <EditAction
            href={`/classes/${cls.id}/edit`}
            canEdit={canEdit && cls.editable}
            showDisabled={canEdit === false && canSeeAllData(role)}
            noun="classes"
          />
          <Link href={`/classes/${cls.id}`} className={detailsLink}>
            Details
          </Link>
        </div>
      ),
    },
  ]

  const stacked: StackedRowSpec<ClassRow> = {
    title: (cls) => (
      <>
        {cls.name}
        <ActiveBadge active={cls.active} />
      </>
    ),
    titleAside: (cls) => (
      <EditAction
        href={`/classes/${cls.id}/edit`}
        canEdit={canEdit && cls.editable}
        showDisabled={canEdit === false && canSeeAllData(role)}
        noun="classes"
      />
    ),
    details: (cls) => [
      cls.room_number ?? '—',
      teacherName(cls),
      cls.academic_year ?? '—',
    ],
    detailsAside: (cls) => (
      <Link
        href={`/classes/${cls.id}`}
        className={`shrink-0 text-sm ${detailsLink}`}
      >
        Details
      </Link>
    ),
  }

  return (
    <SimpleGrid
      columns={columns}
      rows={classes}
      getRowKey={(cls) => cls.id}
      mobile="stacked"
      stacked={stacked}
    />
  )
}
