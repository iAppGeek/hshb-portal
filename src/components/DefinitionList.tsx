type Item = { label: string; value: React.ReactNode }

type Props = {
  title?: string
  items: Item[]
}

export default function DefinitionList({
  title,
  items,
}: Props): React.ReactElement {
  return (
    <div className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-gray-200">
      {title && (
        <h2 className="mb-3 text-sm font-semibold text-gray-900">{title}</h2>
      )}
      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {items.map((item) => (
          <div key={item.label}>
            <dt className="text-xs font-medium tracking-wide text-gray-500 uppercase">
              {item.label}
            </dt>
            <dd className="mt-0.5 text-sm text-gray-900">{item.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
