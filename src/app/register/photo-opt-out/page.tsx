import { type Metadata } from 'next'

import PhotoOptOutForm from './PhotoOptOutForm'

export const metadata: Metadata = {
  title: {
    absolute: 'Withdraw photo consent | Hellenic School of High Barnet',
  },
  robots: { index: false, follow: false },
}

export default function PhotoOptOutPage() {
  const turnstileSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? null

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">
          Hellenic School of High Barnet
        </h1>
        <p className="mt-1 text-lg font-medium text-gray-700">
          Withdraw photo & media consent
        </p>
        <p className="mt-2 text-sm text-gray-500">
          If your child is already registered with us and you no longer want
          their photo used on social media, the school website or printed
          material, use this form to let us know. Fields marked with{' '}
          <span className="text-red-500">*</span> are required.
        </p>
      </div>

      {turnstileSiteKey ? (
        <PhotoOptOutForm turnstileSiteKey={turnstileSiteKey} />
      ) : (
        <p className="rounded-lg bg-yellow-50 p-4 text-sm text-yellow-800">
          This form is temporarily unavailable. Please try again later.
        </p>
      )}
    </div>
  )
}
