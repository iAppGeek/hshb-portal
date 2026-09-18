import clsx from 'clsx'

import { printBlankLine, printTable, printTd, printTh } from '@/lib/grid/styles'

import EmptyState from '../../_components/EmptyState'

export type RegisterStudent = {
  id: string
  student_code: string | null
  first_name: string
  last_name: string
  allergies: string | null
  primary_guardian: {
    first_name: string
    last_name: string
    phone: string | null
    email: string | null
  } | null
}

const LABEL =
  'text-xs font-medium tracking-wide text-gray-500 uppercase print:font-bold print:text-gray-900'

export default function ClassRegisterCard({
  teacherName,
  teacherEmail,
  yearGroup,
  academicYear,
  students,
  emptyMessage,
}: {
  teacherName: string
  teacherEmail: string | null
  yearGroup: string
  academicYear: string | null
  students: RegisterStudent[]
  emptyMessage: string
}) {
  return (
    <>
      <div className="mb-6 grid grid-cols-2 gap-4 rounded-xl bg-white p-6 shadow-sm ring-1 ring-gray-200 sm:grid-cols-4 print:mb-4 print:rounded-none print:p-px print:shadow-none print:ring-0">
        <div>
          <p className={LABEL}>Teacher</p>
          <p className="mt-1 text-sm font-medium text-gray-900">
            {teacherName}
          </p>
          {teacherEmail && (
            <a
              href={`mailto:${teacherEmail}`}
              className="text-sm break-all text-blue-600 hover:text-blue-800"
            >
              {teacherEmail}
            </a>
          )}
        </div>
        <div>
          <p className={LABEL}>Year Group</p>
          <p className="mt-1 text-sm font-medium text-gray-900">
            Year {yearGroup}
          </p>
        </div>
        <div>
          <p className={LABEL}>Academic Year</p>
          <p className="mt-1 text-sm font-medium text-gray-900">
            {academicYear ?? '—'}
          </p>
        </div>
        <div>
          <p className={LABEL}>Date</p>
          <p className={printBlankLine}>&nbsp;</p>
        </div>
      </div>

      {students.length === 0 ? (
        <div className="mb-6 print:hidden">
          <EmptyState message={emptyMessage} />
        </div>
      ) : (
        <div className="mb-6 overflow-x-auto rounded-xl bg-white shadow-sm ring-1 ring-gray-200 print:overflow-visible print:rounded-none print:shadow-none print:ring-0">
          <table className={printTable}>
            <thead className="bg-gray-50 print:bg-white">
              <tr>
                {[
                  { label: '#', mobileHidden: true },
                  { label: 'Student ID', mobileHidden: true },
                  { label: 'First Name', mobileHidden: false },
                  { label: 'Surname', mobileHidden: false },
                  { label: 'Primary Contact', mobileHidden: false },
                  { label: 'Allergies', mobileHidden: false },
                  { label: 'Attendance', mobileHidden: false },
                ].map(({ label, mobileHidden }) => (
                  <th
                    key={label}
                    className={clsx(
                      printTh,
                      mobileHidden && 'hidden sm:table-cell',
                    )}
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {students.map((student, i) => (
                <tr
                  key={student.id}
                  className="hover:bg-gray-50 print:hover:bg-white"
                >
                  <td
                    className={clsx(
                      printTd,
                      'hidden text-gray-500 sm:table-cell print:table-cell',
                    )}
                  >
                    {i + 1}
                  </td>
                  <td
                    className={clsx(
                      printTd,
                      'hidden text-gray-700 sm:table-cell print:table-cell',
                    )}
                  >
                    {student.student_code ?? '—'}
                  </td>
                  <td className={clsx(printTd, 'text-gray-900')}>
                    {student.first_name}
                  </td>
                  <td className={clsx(printTd, 'font-medium text-gray-900')}>
                    {student.last_name}
                  </td>
                  <td className={clsx(printTd, 'text-gray-700')}>
                    {student.primary_guardian ? (
                      <>
                        <span className="block">
                          {student.primary_guardian.first_name}{' '}
                          {student.primary_guardian.last_name}
                        </span>
                        {student.primary_guardian.phone && (
                          <a
                            href={`tel:${student.primary_guardian.phone}`}
                            className="block text-blue-600 hover:text-blue-800"
                          >
                            {student.primary_guardian.phone}
                          </a>
                        )}
                      </>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className={clsx(printTd, 'text-gray-700')}>
                    {student.allergies ?? '—'}
                  </td>
                  <td className={clsx(printTd, 'w-16 print:w-16')} />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
