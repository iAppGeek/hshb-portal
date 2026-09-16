'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'

import type { RegistrationSummary } from '@/db'
import { formatDateInSchoolTz, formatDateTimeInSchoolTz } from '@/lib/datetime'
import { matchesAny, normaliseQuery } from '@/lib/grid/search'
import { td, th } from '@/lib/grid/styles'

type Props = {
  registrations: RegistrationSummary[]
}

const STATUS_BADGE: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  actioned: 'bg-green-100 text-green-800',
  rejected: 'bg-red-100 text-red-800',
}

export default function RegistrationsTable({ registrations }: Props) {
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const q = normaliseQuery(query)
    if (!q) return registrations
    return registrations.filter((r) => {
      const name = `${r.child_first_name} ${r.child_last_name}`
      return matchesAny([name], q)
    })
  }, [registrations, query])

  return (
    <>
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search by child name…"
        className="mb-4 w-full rounded-lg border border-gray-300 px-4 py-2 text-sm shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none sm:max-w-xs"
      />
      <div className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-gray-200">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="hidden bg-gray-50 sm:table-header-group">
              <tr>
                <th className={th}>Child</th>
                <th className={th}>DOB</th>
                <th className={th}>Year group pref.</th>
                <th className={th}>Primary contact</th>
                <th className={th}>Submitted</th>
                <th className={th}>Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {filtered.map((r) => {
                const contact = r.primary_contact
                  ? `${r.primary_contact.first_name} ${r.primary_contact.last_name} — ${r.primary_contact.phone}`
                  : '—'

                return (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-4 py-4 text-sm font-medium text-gray-900 sm:px-6">
                      <Link href={`/registrations/${r.id}`} className="block">
                        {r.child_last_name}, {r.child_first_name}
                      </Link>
                    </td>
                    <td className={td}>
                      {formatDateInSchoolTz(r.date_of_birth)}
                    </td>
                    <td className={td}>{r.preferred_year_group ?? '—'}</td>
                    <td className={td}>{contact}</td>
                    <td className={td}>
                      {formatDateTimeInSchoolTz(r.submitted_at)}
                    </td>
                    <td className="px-4 py-4 text-sm sm:px-6">
                      <span
                        className={`inline-flex rounded-full px-2 py-1 text-xs font-medium capitalize ${STATUS_BADGE[r.status] ?? 'bg-gray-100 text-gray-800'}`}
                      >
                        {r.status}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
