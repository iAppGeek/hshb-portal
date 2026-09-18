'use client'

import { useState } from 'react'
import Link from 'next/link'

import FunctionalGrid, {
  type FunctionalGridColumn,
} from '@/clientComponents/grid/FunctionalGrid'
import LeaverBadge from '@/components/LeaverBadge'
import StudentDetailsModal, {
  type StudentForModal,
} from '@/components/StudentDetailsModal'
import Tooltip from '@/components/Tooltip'
import type { StackedRowSpec } from '@/lib/grid/columns'
import { fullName, matchesAny, normaliseQuery } from '@/lib/grid/search'
import { compareByName, compareNullableText } from '@/lib/grid/sort'
import { canEditStudents, canSeeAllData } from '@/lib/permissions'
import type { StaffRole } from '@/types/next-auth'

type Student = StudentForModal & {
  student_code: string | null
  active: boolean
  leaving_reason: string | null
}

type Props = {
  students: Student[]
  role: StaffRole
}

function classNames(student: Student): string {
  return (
    student.student_classes
      .map((sc) => sc.class?.name)
      .filter(Boolean)
      .join(', ') || '—'
  )
}

function guardianName(student: Student): string {
  return student.primary_guardian
    ? `${student.primary_guardian.first_name} ${student.primary_guardian.last_name}`
    : '—'
}

function matchesStudentSearch(student: Student, rawQuery: string): boolean {
  const q = normaliseQuery(rawQuery)
  if (!q) return true
  const name = fullName(student.first_name, student.last_name)
  const code = student.student_code ?? ''
  const guardian = student.primary_guardian
    ? `${student.primary_guardian.first_name} ${student.primary_guardian.last_name}`
    : ''
  return matchesAny([name, code, guardian], q)
}

function EditLink({
  student,
  role,
}: {
  student: Student
  role: StaffRole
}): React.ReactElement | null {
  if (canEditStudents(role)) {
    return (
      <Link
        href={`/students/${student.id}/edit`}
        className="text-blue-600 hover:text-blue-800"
      >
        Edit
      </Link>
    )
  }
  if (canSeeAllData(role)) {
    return (
      <Tooltip text="You don't have permission to edit students">
        <span className="cursor-not-allowed text-gray-400">Edit</span>
      </Tooltip>
    )
  }
  return null
}

export default function StudentsTable({
  students,
  role,
}: Props): React.ReactElement {
  const [selected, setSelected] = useState<Student | null>(null)

  const columns: FunctionalGridColumn<Student>[] = [
    {
      id: 'name',
      header: 'Name',
      cell: (info) => {
        const student = info.row.original
        return (
          <span className="inline-flex items-center gap-2">
            {student.last_name}, {student.first_name}
            {!student.active && <LeaverBadge reason={student.leaving_reason} />}
          </span>
        )
      },
      sortFn: (rowA, rowB) => compareByName(rowA.original, rowB.original),
      meta: { primary: true },
    },
    {
      id: 'code',
      header: 'Code',
      cell: (info) => info.row.original.student_code ?? '—',
      sortFn: (rowA, rowB) =>
        compareNullableText(
          rowA.original.student_code,
          rowB.original.student_code,
        ),
    },
    {
      id: 'classes',
      header: 'Classes',
      cell: (info) => classNames(info.row.original),
      sortFn: (rowA, rowB) =>
        compareNullableText(
          classNames(rowA.original),
          classNames(rowB.original),
        ),
    },
    {
      id: 'guardian',
      header: 'Primary Guardian',
      cell: (info) => guardianName(info.row.original),
      sortFn: (rowA, rowB) =>
        compareNullableText(
          guardianName(rowA.original),
          guardianName(rowB.original),
        ),
    },
    {
      id: 'actions',
      header: 'Actions',
      cell: (info) => {
        const student = info.row.original
        return (
          <div className="flex items-center justify-end gap-3">
            <EditLink student={student} role={role} />
            <button
              type="button"
              onClick={() => setSelected(student)}
              className="text-gray-500 hover:text-gray-700"
            >
              Details
            </button>
          </div>
        )
      },
      enableSorting: false,
      meta: { srOnlyHeader: true, align: 'right' },
    },
  ]

  const stacked: StackedRowSpec<Student> = {
    title: (student) => (
      <>
        {student.last_name}, {student.first_name}
        {!student.active && <LeaverBadge reason={student.leaving_reason} />}
      </>
    ),
    titleAside: (student) => <EditLink student={student} role={role} />,
    details: (student) => [
      student.student_code ?? '—',
      classNames(student),
      guardianName(student),
    ],
    detailsAside: (student) => (
      <button
        type="button"
        onClick={() => setSelected(student)}
        className="shrink-0 text-sm text-gray-500 hover:text-gray-700"
      >
        Details
      </button>
    ),
  }

  return (
    <>
      <FunctionalGrid
        data={students}
        columns={columns}
        getRowId={(student) => student.id}
        mobile="stacked"
        stacked={stacked}
        search={{
          placeholder: 'Search students…',
          label: 'Search students',
          filterFn: matchesStudentSearch,
        }}
        initialSorting={[{ id: 'name', desc: false }]}
        emptyMessage="No students match your search."
      />

      {selected && (
        <StudentDetailsModal
          student={selected}
          role={role}
          onClose={() => setSelected(null)}
        />
      )}
    </>
  )
}
