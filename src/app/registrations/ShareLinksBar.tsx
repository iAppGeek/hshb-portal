const LINK_CLASS =
  'inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-sm font-medium text-blue-600 shadow-sm ring-1 ring-gray-200 hover:bg-blue-50'

export default function ShareLinksBar() {
  return (
    <div className="mb-6 flex flex-wrap items-center gap-3 rounded-xl bg-blue-50 p-4">
      <p className="text-sm font-medium text-blue-900">Share with parents:</p>
      <a
        href="/register"
        target="_blank"
        rel="noopener noreferrer"
        className={LINK_CLASS}
      >
        Registration form ↗
      </a>
      <a
        href="/register/photo-opt-out"
        target="_blank"
        rel="noopener noreferrer"
        className={LINK_CLASS}
      >
        Photo consent opt-out ↗
      </a>
    </div>
  )
}
