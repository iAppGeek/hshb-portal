import Link from 'next/link'

type Tab = {
  id: string
  label: string
}

const TABS: Tab[] = [
  { id: 'pending', label: 'To-do' },
  { id: 'actioned', label: 'Actioned' },
  { id: 'rejected', label: 'Rejected' },
  { id: 'all', label: 'All' },
]

type Props = {
  currentStatus: string
}

export default function RegistrationTabs({
  currentStatus,
}: Props): React.ReactElement {
  return (
    <div className="mb-6 flex gap-1 rounded-xl bg-gray-100 p-1">
      {TABS.map((tab) => (
        <Link
          key={tab.id}
          href={`/registrations?status=${tab.id}`}
          className={
            currentStatus === tab.id
              ? 'rounded-lg bg-white px-4 py-2 text-sm font-medium text-gray-900 shadow-sm'
              : 'rounded-lg px-4 py-2 text-sm font-medium text-gray-500 hover:text-gray-700'
          }
        >
          {tab.label}
        </Link>
      ))}
    </div>
  )
}
