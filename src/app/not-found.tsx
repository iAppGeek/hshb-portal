import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="rounded-xl bg-white p-12 text-center shadow-sm ring-1 ring-gray-200">
      <h1 className="text-2xl font-bold text-gray-900">Not found</h1>
      <p className="mt-2 text-sm text-gray-500">
        The page or record you&rsquo;re looking for doesn&rsquo;t exist, or you
        don&rsquo;t have access to it.
      </p>
      <Link
        href="/dashboard"
        className="mt-6 inline-block rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700"
      >
        Back to dashboard
      </Link>
    </div>
  )
}
