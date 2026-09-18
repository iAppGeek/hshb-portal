'use client'

import type { ReactElement } from 'react'

type Option = { value: string; label: string }

type Props = {
  value: string
  onChange: (value: string) => void
  label: string
  placeholderOption: string
  options: Option[]
}

/** One dropdown column filter in a `FunctionalGrid` toolbar. Empty value means "no filter". */
export default function FacetSelect({
  value,
  onChange,
  label,
  placeholderOption,
  options,
}: Props): ReactElement {
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
    >
      <option value="">{placeholderOption}</option>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  )
}
