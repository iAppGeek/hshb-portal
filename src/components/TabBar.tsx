import type { ReactElement } from 'react'
import Link from 'next/link'

export type Tab = { key: string; label: string; href: string; count?: number }

type Props = {
  tabs: Tab[]
  current: string
  ariaLabel: string
}

export default function TabBar({
  tabs,
  current,
  ariaLabel,
}: Props): ReactElement {
  return (
    <div
      className="mb-6 flex gap-1 rounded-xl bg-gray-100 p-1"
      aria-label={ariaLabel}
    >
      {tabs.map((tab) => (
        <Link
          key={tab.key}
          href={tab.href}
          aria-current={tab.key === current ? 'page' : undefined}
          className={
            tab.key === current
              ? 'rounded-lg bg-white px-4 py-2 text-sm font-medium text-gray-900 shadow-sm'
              : 'rounded-lg px-4 py-2 text-sm font-medium text-gray-500 hover:text-gray-700'
          }
        >
          {tab.label}
          {tab.count !== undefined && (
            <span className="ml-1.5 text-xs text-gray-400">{tab.count}</span>
          )}
        </Link>
      ))}
    </div>
  )
}
