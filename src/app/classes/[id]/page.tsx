import { type Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'

import { requireSession } from '@/auth/require'
import BulkEmailDropdown from '@/clientComponents/BulkEmailDropdown'
import PrintPageSetup from '@/components/grid/PrintPageSetup'
import { getClassWithStudents } from '@/db'
import { compareByName } from '@/lib/grid/sort'
import { guardianEmailsForMailto, mailtoWithBcc } from '@/lib/mailto'
import { isTeacher } from '@/lib/permissions'

import PrintButton from '../PrintButton'

import ClassRegisterCard, { type RegisterStudent } from './ClassRegisterCard'
import EnrolmentHistoryTable, {
  type EnrolmentHistoryRow,
} from './EnrolmentHistoryTable'

export const metadata: Metadata = { title: 'Class Register' }

type Student = RegisterStudent & {
  secondary_guardian: {
    first_name: string
    last_name: string
    phone: string | null
    email: string | null
  } | null
}

export default async function ClassRegisterPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const actor = await requireSession()
  const role = actor.role
  const { id } = await params

  const cls = await getClassWithStudents(id)
  if (!cls) redirect('/classes')

  if (isTeacher(role) && cls.teacher_id !== actor.staffId) {
    redirect('/classes')
  }

  const teacher = cls.teacher as {
    first_name: string
    last_name: string
    display_name: string | null
    email: string | null
  } | null

  const teacherName = teacher
    ? (teacher.display_name ?? `${teacher.first_name} ${teacher.last_name}`)
    : '—'

  const students = (cls.student_classes as Array<{ student: Student | null }>)
    .map((sc) => sc.student)
    .filter((s): s is Student => s !== null)
    .sort(compareByName)

  const enrolmentHistory = (cls.enrolment_history ??
    []) as EnrolmentHistoryRow[]

  const classBccEmails = guardianEmailsForMailto(students)
  const classMailtoHref = mailtoWithBcc(classBccEmails, {
    subject: `${cls.name} — Class register`,
  })

  return (
    <div className="max-w-5xl print:max-w-none">
      <PrintPageSetup />
      {/* Screen-only toolbar */}
      <div className="mb-6 flex items-center justify-between print:hidden">
        <div>
          <Link
            href="/classes"
            className="text-sm text-blue-600 hover:text-blue-800"
          >
            ← Back to Classes
          </Link>
          <h1 className="mt-1 text-2xl font-bold text-gray-900">
            {cls.name} — Register
          </h1>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {students.length > 0 && (
            <BulkEmailDropdown
              emails={classBccEmails}
              mailtoHref={classMailtoHref}
              buttonLabel="Email class"
              triggerClassName="rounded-lg border border-blue-600 px-4 py-2 text-sm font-medium text-blue-600 shadow-sm transition hover:bg-blue-50"
              emptyReason="No guardian email addresses on file for this class."
              mailtoUnavailableReason="Too many addresses for your email app. Use copy instead."
            />
          )}
          <PrintButton />
        </div>
      </div>

      {/* Print-only title */}
      <div className="mb-4 hidden print:block">
        <h1 className="text-xl font-bold">{cls.name} — Class Register</h1>
      </div>

      <ClassRegisterCard
        teacherName={teacherName}
        teacherEmail={teacher?.email ?? null}
        yearGroup={cls.year_group}
        academicYear={cls.academic_year}
        students={students}
        emptyMessage={
          enrolmentHistory.length > 0
            ? 'No current students. See enrolment history below.'
            : 'No students enrolled in this class.'
        }
      />

      <div className="print:hidden">
        <EnrolmentHistoryTable rows={enrolmentHistory} />
      </div>
    </div>
  )
}
