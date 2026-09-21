import { type Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'

import { requireSession } from '@/auth/require'
import { getGuardianById, getFamilyForGuardian } from '@/db'
import type { FamilySlot } from '@/db'
import LeaverBadge from '@/components/LeaverBadge'
import { mailtoWithBcc } from '@/lib/mailto'
import { canViewGuardians } from '@/lib/permissions'

import PageHeader from '../../_components/PageHeader'

export const metadata: Metadata = { title: 'Guardian' }

const SLOT_LABELS: Record<FamilySlot, string> = {
  primary: 'Primary guardian',
  secondary: 'Secondary guardian',
  additional_1: 'Additional contact',
  additional_2: 'Additional contact',
}

export default async function GuardianFamilyPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const actor = await requireSession()
  const role = actor.role

  if (!canViewGuardians(role)) {
    redirect('/students')
  }

  const { id } = await params

  const [guardian, family] = await Promise.all([
    getGuardianById(id),
    getFamilyForGuardian(id),
  ])

  if (!guardian) {
    notFound()
  }

  const familyEmails = [
    guardian.email,
    ...family.coGuardians.map((g) => g.email),
  ].filter((e): e is string => !!e)
  const mailtoHref = mailtoWithBcc(familyEmails)

  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader
        title={`${guardian.last_name}, ${guardian.first_name}`}
        backHref="/guardians"
        backLabel="Guardians"
        action={
          <Link
            href={`/guardians/${guardian.id}/edit`}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700"
          >
            Edit guardian
          </Link>
        }
      />

      {/* Guardian details */}
      <div className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-gray-200">
        <h2 className="mb-4 text-sm font-semibold text-gray-900">
          Contact details
        </h2>
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-xs font-medium tracking-wide text-gray-500 uppercase">
              Phone
            </dt>
            <dd className="mt-1 text-sm text-gray-900">{guardian.phone}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium tracking-wide text-gray-500 uppercase">
              Email
            </dt>
            <dd className="mt-1 text-sm text-gray-900">
              {guardian.email ?? '—'}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium tracking-wide text-gray-500 uppercase">
              Occupation
            </dt>
            <dd className="mt-1 text-sm text-gray-900">
              {guardian.occupation ?? '—'}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium tracking-wide text-gray-500 uppercase">
              Address
            </dt>
            <dd className="mt-1 text-sm text-gray-900">
              {[
                guardian.address_line_1,
                guardian.address_line_2,
                guardian.city,
                guardian.postcode,
              ]
                .filter(Boolean)
                .join(', ') || '—'}
            </dd>
          </div>
        </dl>
        {mailtoHref && (
          <a
            href={mailtoHref}
            className="mt-4 inline-block text-sm font-medium text-blue-600 hover:text-blue-800"
          >
            Email this family
          </a>
        )}
      </div>

      {/* Children */}
      <div className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-gray-200">
        <h2 className="mb-4 text-sm font-semibold text-gray-900">Children</h2>
        {family.children.length === 0 ? (
          <p className="text-sm text-gray-500">
            No children are linked to this guardian.
          </p>
        ) : (
          <ul className="divide-y divide-gray-200">
            {family.children.map((child) => (
              <li
                key={child.id}
                className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0"
              >
                <div>
                  <p className="flex items-center gap-2 text-sm font-medium text-gray-900">
                    {child.last_name}, {child.first_name}
                    {!child.active && (
                      <LeaverBadge reason={child.leaving_reason} />
                    )}
                  </p>
                  <p className="mt-0.5 text-xs text-gray-500">
                    {child.relationship ?? SLOT_LABELS[child.slot]}
                    {child.classes.length > 0 &&
                      ` · ${child.classes.map((c) => c.name).join(', ')}`}
                  </p>
                </div>
                <Link
                  href={`/students/${child.id}/edit`}
                  className="shrink-0 text-sm text-blue-600 hover:text-blue-800"
                >
                  View student
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Also linked — the other guardians on this guardian's children, one hop out */}
      {family.coGuardians.length > 0 && (
        <div className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-gray-200">
          <h2 className="mb-4 text-sm font-semibold text-gray-900">
            Also linked
          </h2>
          <ul className="divide-y divide-gray-200">
            {family.coGuardians.map((co) => (
              <li
                key={co.id}
                className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0"
              >
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    {co.last_name}, {co.first_name}
                  </p>
                  <p className="mt-0.5 text-xs text-gray-500">
                    {co.links
                      .map(
                        (link) =>
                          `${SLOT_LABELS[link.slot]} for ${link.childName}`,
                      )
                      .join(' · ')}
                  </p>
                </div>
                <Link
                  href={`/guardians/${co.id}`}
                  className="shrink-0 text-sm text-blue-600 hover:text-blue-800"
                >
                  View
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
