import { type Metadata } from 'next'
import { redirect } from 'next/navigation'

import { requireSession } from '@/auth/require'
import { getGuardiansWithChildCounts } from '@/db'
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

  const guardiansWithCounts = await getGuardiansWithChildCounts()

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
