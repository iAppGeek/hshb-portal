'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'

type Guardian = {
  id: string
  first_name: string
  last_name: string
  phone: string
  email: string | null
  child_count: number
}

type Props = {
  guardians: Guardian[]
}

const TH =
  'px-3 py-3 text-left text-xs font-medium tracking-wide text-gray-500 uppercase sm:px-6'
const TD = 'hidden px-3 py-4 text-sm text-gray-500 sm:table-cell sm:px-6'

const digitsOnly = (value: string): string => value.replace(/\D/g, '')

// Guardian viewing and editing share one gate (canViewGuardians and
// canEditGuardians are both admin-only), so unlike StudentsTable this never
// needs a permission-denied fallback for the edit link.
export default function GuardiansTable({ guardians }: Props) {
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim()
    if (!q) return guardians
    // Phone numbers are stored formatted (e.g. "07700 900000"), so match on
    // digits only rather than a raw substring — otherwise typing the digits
    // a phone is actually stored under can fail to find it.
    const queryDigits = digitsOnly(q)
    return guardians.filter((g) => {
      const name =
        `${g.first_name} ${g.last_name} ${g.last_name}, ${g.first_name}`.toLowerCase()
      const email = (g.email ?? '').toLowerCase()
      const phoneMatches =
        queryDigits.length > 0 && digitsOnly(g.phone).includes(queryDigits)
      return name.includes(q) || email.includes(q) || phoneMatches
    })
  }, [guardians, query])

  return (
    <>
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search by name, email or phone…"
        className="mb-4 w-full rounded-lg border border-gray-300 px-4 py-2 text-sm shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none sm:max-w-xs"
      />
      <div className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-gray-200">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="hidden bg-gray-50 sm:table-header-group">
              <tr>
                <th className={TH}>Name</th>
                <th className={TH}>Phone</th>
                <th className={TH}>Email</th>
                <th className={TH}>Children</th>
                <th className="relative px-3 py-3 sm:px-6">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {filtered.map((guardian) => (
                <tr
                  key={guardian.id}
                  className="block border-b border-gray-200 last:border-0 hover:bg-gray-50 sm:table-row sm:border-0"
                >
                  {/* Name — on mobile: name left, View link right */}
                  <td className="block px-4 pt-4 pb-0 text-sm font-medium text-gray-900 sm:table-cell sm:px-6 sm:py-4 sm:whitespace-nowrap">
                    <div className="flex items-center justify-between gap-2 sm:block">
                      <span>
                        {guardian.last_name}, {guardian.first_name}
                      </span>
                      <Link
                        href={`/guardians/${guardian.id}`}
                        className="shrink-0 text-sm text-blue-600 hover:text-blue-800 sm:hidden"
                      >
                        View
                      </Link>
                    </div>
                  </td>

                  {/* Mobile secondary: phone · email · children + edit link */}
                  <td className="block px-4 py-2 text-xs text-gray-500 sm:hidden">
                    <div className="flex items-center justify-between gap-2">
                      <span>
                        {guardian.phone}
                        {' · '}
                        {guardian.email ?? '—'}
                        {' · '}
                        {guardian.child_count}{' '}
                        {guardian.child_count === 1 ? 'child' : 'children'}
                      </span>
                      <Link
                        href={`/guardians/${guardian.id}/edit`}
                        className="shrink-0 text-sm text-gray-500 hover:text-gray-700"
                      >
                        Edit
                      </Link>
                    </div>
                  </td>

                  {/* Desktop-only columns */}
                  <td className={TD}>{guardian.phone}</td>
                  <td className={TD}>{guardian.email ?? '—'}</td>
                  <td className={TD}>{guardian.child_count}</td>
                  <td className="hidden px-3 py-4 text-right text-sm font-medium sm:table-cell sm:px-6">
                    <div className="flex items-center justify-end gap-3">
                      <Link
                        href={`/guardians/${guardian.id}`}
                        className="text-blue-600 hover:text-blue-800"
                      >
                        View
                      </Link>
                      <Link
                        href={`/guardians/${guardian.id}/edit`}
                        className="text-gray-500 hover:text-gray-700"
                      >
                        Edit
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {filtered.length === 0 && (
        <p className="mt-4 text-center text-sm text-gray-500">
          No guardians match your search.
        </p>
      )}
    </>
  )
}
