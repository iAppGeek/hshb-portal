import { type Metadata } from 'next'

import { requireRouteAccess } from '@/auth/require'

import PageHeader from '../_components/PageHeader'

import StaffPayrollList from './_components/StaffPayrollList'

export const metadata: Metadata = { title: 'HR' }

export default async function HrPage(): Promise<React.ReactElement> {
  await requireRouteAccess('/hr')

  return (
    <div>
      <PageHeader title="HR" subtitle="Staff payroll and compliance records." />

      <StaffPayrollList />
    </div>
  )
}
