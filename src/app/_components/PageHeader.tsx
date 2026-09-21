import Link from 'next/link'
import clsx from 'clsx'

export const RequiredFieldsNote = (
  <>
    Fields marked with <span className="text-red-500">*</span> are required.
  </>
)

export default function PageHeader({
  title,
  subtitle,
  backHref,
  backLabel,
  action,
}: {
  title: React.ReactNode
  subtitle?: React.ReactNode
  backHref?: string
  backLabel?: string
  action?: React.ReactNode
}) {
  return (
    <div className="mb-6 flex items-center justify-between">
      <div>
        {backHref && (
          <Link
            href={backHref}
            className="text-sm text-blue-600 hover:text-blue-800"
          >
            ← {backLabel}
          </Link>
        )}
        <h1
          className={clsx(
            'text-2xl font-bold text-gray-900',
            backHref && 'mt-1',
          )}
        >
          {title}
        </h1>
        {subtitle && <p className="mt-1 text-sm text-gray-500">{subtitle}</p>}
      </div>
      {action}
    </div>
  )
}
