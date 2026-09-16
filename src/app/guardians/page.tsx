import { type Metadata } from 'next'
import { redirect } from 'next/navigation'

import { auth } from '@/auth'
import { getAllGuardians, getGuardianChildCounts } from '@/db'
import type { GuardianWithChildCount } from '@/db'
import { canViewGuardians } from '@/lib/permissions'
import type { StaffRole } from '@/types/next-auth'

import EmptyState from '../_components/EmptyState'
import PageHeader from '../_components/PageHeader'

import GuardiansTable from './GuardiansTable'

export const metadata: Metadata = { title: 'Guardians' }

export default async function GuardiansPage() {
  const session = await auth()
  const role = session?.user?.role as StaffRole

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
