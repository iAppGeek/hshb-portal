import { type Metadata } from 'next'
import { redirect } from 'next/navigation'

import { auth } from '@/auth'
import { getAllGuardians } from '@/db'
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

  const guardians = await getAllGuardians()

  return (
    <>
      <PageHeader title="Guardians" />

      {guardians.length === 0 ? (
        <EmptyState message="No guardians found." />
      ) : (
        <GuardiansTable guardians={guardians} />
      )}
    </>
  )
}
