import type { ReactElement } from 'react'

type Props = {
  fields?: number
}

const DEFAULT_FIELDS = 6

/**
 * A hand-drawn loading skeleton for add/edit forms. There's no shared
 * `FormSection` component yet (plan 04 adds the form kit), so this
 * approximates the label+input rows those forms already render.
 */
export default function FormSkeleton({
  fields = DEFAULT_FIELDS,
}: Props): ReactElement {
  return (
    <div
      className="animate-pulse rounded-xl bg-white p-6 shadow-sm ring-1 ring-gray-200"
      aria-hidden="true"
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {Array.from({ length: fields }).map((_, i) => (
          <div key={i}>
            <div className="h-3 w-20 rounded bg-gray-200" />
            <div className="mt-2 h-9 w-full rounded-lg bg-gray-100" />
          </div>
        ))}
      </div>
      <div className="mt-6 h-9 w-28 rounded-lg bg-gray-200" />
    </div>
  )
}
