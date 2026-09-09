import { type Metadata } from 'next'

import { getAllClasses } from '@/db'
import { distinctYearGroups } from '@/lib/registration'

import RegistrationForm from './RegistrationForm'

export const metadata: Metadata = {
  title: { absolute: 'Register | Hellenic School of High Barnet' },
  robots: { index: true, follow: true },
}

export default async function RegisterPage() {
  const turnstileSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? null

  const classes = await getAllClasses()
  const yearGroups = distinctYearGroups(classes)

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">
          Hellenic School of High Barnet
        </h1>
        <p className="mt-1 text-lg font-medium text-gray-700">
          Student registration
        </p>
        <p className="mt-2 text-sm text-gray-500">
          Please complete this form to register your child. Fields marked with{' '}
          <span className="text-red-500">*</span> are required.
        </p>
      </div>

      {turnstileSiteKey ? (
        <RegistrationForm
          yearGroups={yearGroups}
          turnstileSiteKey={turnstileSiteKey}
        />
      ) : (
        <p className="rounded-lg bg-yellow-50 p-4 text-sm text-yellow-800">
          Registration is temporarily unavailable. Please try again later.
        </p>
      )}
    </div>
  )
}
