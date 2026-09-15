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
          <p className="mt-1 min-w-[100px] border-b border-gray-300 pb-1 text-sm">
            &nbsp;
          </p>
        </div>
      </div>

      {students.length === 0 ? (
        <div className="mb-6 print:hidden">
          <EmptyState message={emptyMessage} />
        </div>
      ) : (
        <div className="mb-6 overflow-x-auto rounded-xl bg-white shadow-sm ring-1 ring-gray-200 print:overflow-visible print:rounded-none print:shadow-none print:ring-0">
          <table className="min-w-full border-collapse">
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
                    className={`border border-gray-200 px-3 py-2 text-left text-xs font-medium tracking-wide text-gray-500 uppercase sm:px-6 sm:py-3 print:table-cell print:border-gray-400 print:p-px print:text-xs print:font-bold print:text-gray-900 ${mobileHidden ? 'hidden sm:table-cell' : ''}`}
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
                  <td className="hidden border border-gray-200 px-3 py-2 text-sm text-gray-500 sm:table-cell sm:px-6 sm:py-3 print:table-cell print:border-gray-400 print:p-px print:text-xs">
                    {i + 1}
                  </td>
                  <td className="hidden border border-gray-200 px-3 py-2 text-sm text-gray-700 sm:table-cell sm:px-6 sm:py-3 print:table-cell print:border-gray-400 print:p-px print:text-xs">
                    {student.student_code ?? '—'}
                  </td>
                  <td className="border border-gray-200 px-3 py-2 text-sm text-gray-900 sm:px-6 sm:py-3 print:border-gray-400 print:p-px print:text-xs">
                    {student.first_name}
                  </td>
                  <td className="border border-gray-200 px-3 py-2 text-sm font-medium text-gray-900 sm:px-6 sm:py-3 print:border-gray-400 print:p-px print:text-xs">
                    {student.last_name}
                  </td>
                  <td className="border border-gray-200 px-3 py-2 text-sm text-gray-700 sm:px-6 sm:py-3 print:border-gray-400 print:p-px print:text-xs">
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
                  <td className="border border-gray-200 px-3 py-2 text-sm text-gray-700 sm:px-6 sm:py-3 print:border-gray-400 print:p-px print:text-xs">
                    {student.allergies ?? '—'}
                  </td>
                  <td className="w-16 border border-gray-200 px-3 py-2 sm:px-6 sm:py-3 print:w-16 print:border-gray-400 print:p-px" />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
