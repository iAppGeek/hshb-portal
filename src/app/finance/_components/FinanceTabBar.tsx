import Link from 'next/link'

type Tab = {
  id: string
  label: string
}

const TABS: Tab[] = [
  { id: 'students', label: 'Students' },
  { id: 'fee-plans', label: 'Fee Plans' },
]

type Props = {
  currentTab: string
  yearId: string
}

export default function FinanceTabBar({
  currentTab,
  yearId,
}: Props): React.ReactElement {
  return (
    <div className="mb-6 flex max-w-md gap-1 rounded-xl bg-gray-100 p-1">
      {TABS.map((tab) => (
        <Link
          key={tab.id}
          href={`/finance?tab=${tab.id}&year=${yearId}`}
          aria-current={currentTab === tab.id ? 'page' : undefined}
          className={
            currentTab === tab.id
              ? 'flex-1 rounded-lg bg-white px-4 py-2 text-center text-sm font-medium text-gray-900 shadow-sm'
              : 'flex-1 rounded-lg px-4 py-2 text-center text-sm font-medium text-gray-500 hover:text-gray-700'
          }
        >
          {tab.label}
        </Link>
      ))}
    </div>
  )
}
