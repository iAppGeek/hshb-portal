import { type Metadata } from 'next'
import { redirect } from 'next/navigation'

import { requireSession } from '@/auth/require'
import { getAllGuardians, getGuardianChildCounts } from '@/db'
import type { GuardianWithChildCount } from '@/db'
import { canViewGuardians } from '@/lib/permissions'

import EmptyState from '../_components/EmptyState'
import PageHeader from '../_components/PageHeader'

import GuardiansTable from './GuardiansTable'

export const metadata: Metadata = { title: 'Guardians' }

export default async function GuardiansPage() {
  const actor = await requireSession()
  const role = actor.role

  if (!canViewGuardians(role)) {
    redirect('/students')
  }

  // Only this list page needs the per-guardian child count, so it's a
  // separate query from getAllGuardians — see the comment on
  // getGuardianChildCounts.
  const [guardians, childCounts] = await Promise.all([
    getAllGuardians(),
    getGuardianChildCounts(),
  ])
  const guardiansWithCounts: GuardianWithChildCount[] = guardians.map(
    (guardian) => ({
      ...guardian,
      child_count: childCounts.get(guardian.id) ?? 0,
    }),
  )

  return (
    <>
      <PageHeader title="Guardians" />

      {guardiansWithCounts.length === 0 ? (
        <EmptyState message="No guardians found." />
      ) : (
        <GuardiansTable guardians={guardiansWithCounts} />
      )}
    </>
  )
}
