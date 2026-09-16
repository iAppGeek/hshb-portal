import type { ReactElement } from 'react'
import Link from 'next/link'

import SimpleGrid from '@/components/grid/SimpleGrid'
import Tooltip from '@/components/Tooltip'
import type { GridColumn, StackedRowSpec } from '@/lib/grid/columns'
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

function StatusBadge({ active }: { active: boolean }): ReactElement {
  return active ? (
    <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800">
      Active
    </span>
  ) : (
    <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600">
      Inactive
    </span>
  )
}

function teacherName(cls: ClassRow): string {
  return cls.teacher
    ? `${cls.teacher.last_name}, ${cls.teacher.first_name}`
    : '—'
}

function EditControl({
  cls,
  canEdit,
  role,
  size = 'desktop',
}: {
  cls: ClassRow
  canEdit: boolean
  role: StaffRole
  size?: 'desktop' | 'mobile'
}): ReactElement | null {
  if (canEdit && cls.editable) {
    return (
      <Link
        href={`/classes/${cls.id}/edit`}
        className={
          size === 'mobile'
            ? 'ml-auto shrink-0 text-sm text-gray-500 hover:text-gray-700'
            : 'text-gray-500 hover:text-gray-700'
        }
      >
        Edit
      </Link>
    )
  }
  if (canEdit === false && canSeeAllData(role)) {
    return (
      <Tooltip text="You don't have permission to edit classes">
        <span
          className={
            size === 'mobile'
              ? 'ml-auto shrink-0 cursor-not-allowed text-sm text-gray-400'
              : 'cursor-not-allowed text-gray-400'
          }
        >
          Edit
        </span>
      </Tooltip>
    )
  }
  return null
}

export default function ClassesTable({
  classes,
  canEdit,
  role,
}: Props): ReactElement {
  const columns: GridColumn<ClassRow>[] = [
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
      cell: (cls) => <StatusBadge active={cls.active} />,
    },
    {
      id: 'actions',
      header: 'Actions',
      srOnlyHeader: true,
      align: 'right',
      cell: (cls) => (
        <div className="flex items-center justify-end gap-3">
          <EditControl cls={cls} canEdit={canEdit} role={role} />
          <Link
            href={`/classes/${cls.id}`}
            className="text-blue-600 hover:text-blue-800"
          >
            Details
          </Link>
        </div>
      ),
    },
  ]

  const stacked: StackedRowSpec<ClassRow> = {
    title: (cls) => cls.name,
    titleAside: (cls) => (
      <div className="flex items-center gap-2">
        <StatusBadge active={cls.active} />
        <EditControl cls={cls} canEdit={canEdit} role={role} size="mobile" />
      </div>
    ),
    details: (cls) => [
      cls.room_number ?? '—',
      teacherName(cls),
      cls.academic_year ?? '—',
    ],
    detailsAside: (cls) => (
      <Link
        href={`/classes/${cls.id}`}
        className="shrink-0 text-sm text-blue-600 hover:text-blue-800"
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
