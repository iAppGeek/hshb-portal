export default function RegistrationDetailLoading() {
  return (
    <div className="max-w-3xl animate-pulse space-y-6">
      <div className="h-8 w-64 rounded bg-gray-200" />
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-gray-200"
        >
          <div className="mb-3 h-4 w-32 rounded bg-gray-200" />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {Array.from({ length: 4 }).map((_, j) => (
              <div key={j} className="h-4 w-full rounded bg-gray-100" />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
