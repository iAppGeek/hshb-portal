'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'

import type { RegistrationSummary } from '@/db'
import { formatDateInSchoolTz, formatDateTimeInSchoolTz } from '@/lib/datetime'

type Props = {
  registrations: RegistrationSummary[]
}

const TH =
  'px-3 py-3 text-left text-xs font-medium tracking-wide text-gray-500 uppercase sm:px-6'
const TD = 'hidden px-3 py-4 text-sm text-gray-500 sm:table-cell sm:px-6'

const STATUS_BADGE: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  actioned: 'bg-green-100 text-green-800',
  rejected: 'bg-red-100 text-red-800',
}

export default function RegistrationsTable({ registrations }: Props) {
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim()
    if (!q) return registrations
    return registrations.filter((r) => {
      const name = `${r.child_first_name} ${r.child_last_name}`.toLowerCase()
      return name.includes(q)
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
                <th className={TH}>Child</th>
                <th className={TH}>DOB</th>
                <th className={TH}>Year group pref.</th>
                <th className={TH}>Primary contact</th>
                <th className={TH}>Submitted</th>
                <th className={TH}>Status</th>
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
                    <td className={TD}>
                      {formatDateInSchoolTz(r.date_of_birth)}
                    </td>
                    <td className={TD}>{r.preferred_year_group ?? '—'}</td>
                    <td className={TD}>{contact}</td>
                    <td className={TD}>
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
