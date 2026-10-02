'use client'

import Link from 'next/link'

import FunctionalGrid, {
  type FunctionalGridColumn,
} from '@/clientComponents/grid/FunctionalGrid'
import LeaverBadge from '@/components/LeaverBadge'
import PermissionedLink from '@/components/PermissionedLink'
import { compareClassNames } from '@/lib/classes'
import { personName } from '@/lib/format'
import type { StackedRowSpec } from '@/lib/grid/columns'
import { fullName, matchesAny, normaliseQuery } from '@/lib/grid/search'
import { compareByName, compareNullableText } from '@/lib/grid/sort'
import { canEditStudents, canSeeAllData } from '@/lib/permissions'
import type { StaffRole } from '@/types/next-auth'

type Student = {
  id: string
  first_name: string
  last_name: string
  student_code: string | null
  active: boolean
  leaving_reason: string | null
  student_classes: Array<{ class: { name: string } | null }>
  primary_guardian: { first_name: string; last_name: string } | null
}

type Props = {
  students: Student[]
  role: StaffRole
}

/** The student's class names in school order, youngest first. */
function sortedClassNames(student: Student): string[] {
  return student.student_classes
    .flatMap((sc) => (sc.class ? [sc.class.name] : []))
    .sort(compareClassNames)
}

function classNames(student: Student): string {
  return sortedClassNames(student).join(', ') || '—'
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
  return (
    <PermissionedLink
      href={`/students/${student.id}/edit`}
      allowed={canEditStudents(role)}
      showDisabled={canSeeAllData(role)}
      disabledReason="You don't have permission to edit students"
    >
      Edit
    </PermissionedLink>
  )
}

export default function StudentsTable({
  students,
  role,
}: Props): React.ReactElement {
  const columns: FunctionalGridColumn<Student>[] = [
    {
      id: 'name',
      header: 'Name',
      cell: (info) => {
        const student = info.row.original
        return (
          <span className="inline-flex items-center gap-2">
            {personName(student, 'lastFirst')}
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
        compareClassNames(
          sortedClassNames(rowA.original)[0] ?? null,
          sortedClassNames(rowB.original)[0] ?? null,
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
            <Link
              href={`/students/${student.id}`}
              className="text-gray-500 hover:text-gray-700"
            >
              Details
            </Link>
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
        {personName(student, 'lastFirst')}
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
      <Link
        href={`/students/${student.id}`}
        className="shrink-0 text-sm text-gray-500 hover:text-gray-700"
      >
        Details
      </Link>
    ),
  }

  return (
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
  )
}
