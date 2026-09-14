'use client'

import { useRouter } from 'next/navigation'

export type YearSelectorYear = { id: string; code: string }

type Props = {
  years: YearSelectorYear[]
  value: string
  basePath: string
  /** Other query params to preserve (e.g. `tab`, `classId`). */
  extraParams?: Record<string, string>
}

export default function YearSelector({
  years,
  value,
  basePath,
  extraParams,
}: Props) {
  const router = useRouter()

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>): void {
    const params = new URLSearchParams(extraParams)
    params.set('year', e.target.value)
    router.push(`${basePath}?${params.toString()}`)
  }

  return (
    <select
      aria-label="Academic year"
      value={value}
      onChange={handleChange}
      className="block rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
    >
      {years.map((y) => (
        <option key={y.id} value={y.id}>
          {y.code}
        </option>
      ))}
    </select>
  )
}
