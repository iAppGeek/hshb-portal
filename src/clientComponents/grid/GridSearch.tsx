'use client'

import type { ReactElement } from 'react'

type Props = {
  value: string
  onChange: (value: string) => void
  placeholder: string
  label: string
}

/** The `<input type="search">` toolbar control for a `FunctionalGrid`'s global filter. */
export default function GridSearch({
  value,
  onChange,
  placeholder,
  label,
}: Props): ReactElement {
  return (
    <input
      type="search"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      aria-label={label}
      className="w-full rounded-lg border border-gray-300 px-4 py-2 text-sm shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none sm:max-w-xs"
    />
  )
}
