import { type Metadata } from 'next'

export const metadata: Metadata = {
  title: {
    absolute: 'Request received | Hellenic School of High Barnet',
  },
  robots: { index: false, follow: false },
}

export default function PhotoOptOutSuccessPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-10 text-center">
      <h1 className="text-2xl font-bold text-gray-900">
        Thank you — we&apos;ve received your request.
      </h1>
      <p className="mt-2 text-sm text-gray-600">
        The school office will update your child&apos;s record.
      </p>
      <a
        href="https://hshb.org.uk"
        className="mt-6 inline-block text-sm font-medium text-blue-600 hover:text-blue-800"
      >
        Back to hshb.org.uk
      </a>
    </div>
  )
}
