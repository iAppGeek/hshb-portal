import { type Metadata } from 'next'

import { requireRouteAccess } from '@/auth/require'
import TabBar, { type Tab } from '@/components/TabBar'
import {
  getRegistrationSubmissions,
  getPhotoOptOuts,
  getPendingPhotoOptOutCount,
} from '@/db'
import { registrationStatusFilter, registrationsTab } from '@/lib/schemas'

import EmptyState from '../_components/EmptyState'
import PageHeader from '../_components/PageHeader'

import { OPT_OUTS_PATH } from './paths'
import PhotoOptOutsTable from './PhotoOptOutsTable'
import RegistrationsTable from './RegistrationsTable'
import ShareLinksBar from './ShareLinksBar'

export const metadata: Metadata = { title: 'Registrations' }

const STATUSES = [
  { key: 'pending', label: 'To-do' },
  { key: 'actioned', label: 'Actioned' },
  { key: 'rejected', label: 'Rejected' },
  { key: 'all', label: 'All' },
]

function statusTabs(baseHref: string): Tab[] {
  const join = baseHref.includes('?') ? '&' : '?'
  return STATUSES.map(({ key, label }) => ({
    key,
    label,
    href: `${baseHref}${join}status=${key}`,
  }))
}

export default async function RegistrationsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; tab?: string }>
}): Promise<React.ReactElement> {
  await requireRouteAccess('/registrations')

  const params = await searchParams
  const tab = registrationsTab.parse(params.tab)
  const status = registrationStatusFilter.parse(params.status)
  const isOptOuts = tab === 'photo-opt-outs'

  const [registrations, optOuts, pendingOptOuts] = await Promise.all([
    isOptOuts ? Promise.resolve([]) : getRegistrationSubmissions(status),
    isOptOuts ? getPhotoOptOuts(status) : Promise.resolve([]),
    getPendingPhotoOptOutCount(),
  ])

  const tabs: Tab[] = [
    ...statusTabs('/registrations'),
    {
      key: 'photo-opt-outs',
      label: 'Photo opt-outs',
      href: OPT_OUTS_PATH,
      // TabBar renders any defined count, so 0 must not become a badge.
      count: pendingOptOuts || undefined,
    },
  ]

  return (
    <>
      <PageHeader title="Registrations" />
      <ShareLinksBar />

      <TabBar
        tabs={tabs}
        current={isOptOuts ? 'photo-opt-outs' : status}
        ariaLabel="Registrations"
      />

      {isOptOuts ? (
        <>
          <TabBar
            tabs={statusTabs(OPT_OUTS_PATH)}
            current={status}
            ariaLabel="Photo opt-out status"
          />
          <PhotoOptOutsTable requests={optOuts} />
        </>
      ) : registrations.length === 0 ? (
        <EmptyState message="No registrations found." />
      ) : (
        <RegistrationsTable registrations={registrations} />
      )}
    </>
  )
}
