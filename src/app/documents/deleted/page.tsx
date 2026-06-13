import { type Metadata } from 'next'
import { redirect } from 'next/navigation'
import Link from 'next/link'

import { auth } from '@/auth'
import { getDeletedDocuments, type DeletedDocumentRow } from '@/db'
import { canManageDocuments } from '@/lib/permissions'
import { getDocumentType } from '@/lib/documentTypes'
import { formatCalendarDate, formatDateTimeInSchoolTz } from '@/lib/datetime'
import type { StaffRole } from '@/types/next-auth'

export const metadata: Metadata = { title: 'Deleted Documents' }

function ownerLink(doc: DeletedDocumentRow): {
  name: string
  href: string
} | null {
  if (doc.student) {
    return {
      name: `${doc.student.last_name}, ${doc.student.first_name}`,
      href: `/students/${doc.student.id}/edit`,
    }
  }
  if (doc.staff) {
    return {
      name: `${doc.staff.last_name}, ${doc.staff.first_name}`,
      href: `/staff/${doc.staff.id}/edit`,
    }
  }
  return null
}

export default async function DeletedDocumentsPage() {
  const session = await auth()
  const role = session?.user?.role as StaffRole | undefined

  if (!role || !canManageDocuments(role)) {
    redirect('/dashboard')
  }

  const documents = await getDeletedDocuments()

  return (
    <div className="max-w-4xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Deleted Documents</h1>
        <p className="mt-1 text-sm text-gray-500">
          Documents removed from student and staff records. Bytes are retained,
          so files remain viewable.
        </p>
      </div>

      {documents.length === 0 ? (
        <p className="text-sm text-gray-500">No deleted documents.</p>
      ) : (
        <div className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-gray-200">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-xs text-gray-500">
                <th className="py-2 pr-3 font-medium">Name</th>
                <th className="py-2 pr-3 font-medium">Type</th>
                <th className="py-2 pr-3 font-medium">Owner</th>
                <th className="py-2 pr-3 font-medium">Expires</th>
                <th className="py-2 pr-3 font-medium">Deleted</th>
                <th className="py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {documents.map((doc) => {
                const owner = ownerLink(doc)
                const isFile = doc.source === 'upload' || doc.source === 'link'
                return (
                  <tr
                    key={doc.id}
                    className="border-b border-gray-100 align-top"
                  >
                    <td className="py-2 pr-3 font-medium text-gray-900">
                      {doc.name}
                      {doc.source === 'record' && doc.fields && (
                        <div className="mt-1 text-xs font-normal text-gray-600">
                          {doc.fields.map((f, i) => (
                            <span key={i} className="mr-3">
                              <span className="font-medium">{f.field}:</span>{' '}
                              {f.value}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="py-2 pr-3 text-gray-700">
                      {getDocumentType(doc.type)?.label ?? doc.type}
                    </td>
                    <td className="py-2 pr-3 text-gray-700">
                      {owner ? (
                        <Link
                          href={owner.href}
                          className="text-blue-600 hover:text-blue-800"
                        >
                          {owner.name}
                        </Link>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="py-2 pr-3 text-gray-700">
                      {doc.expires_at == null
                        ? 'Never'
                        : formatCalendarDate(doc.expires_at)}
                    </td>
                    <td className="py-2 pr-3 text-gray-500">
                      {doc.deleted_at
                        ? formatDateTimeInSchoolTz(doc.deleted_at)
                        : '—'}
                      {doc.deleter && (
                        <div className="text-xs">
                          by {doc.deleter.first_name} {doc.deleter.last_name}
                        </div>
                      )}
                    </td>
                    <td className="py-2">
                      {isFile && (
                        <a
                          href={`/api/documents/${doc.id}/download`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-medium text-blue-600 hover:text-blue-800"
                        >
                          View
                        </a>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
