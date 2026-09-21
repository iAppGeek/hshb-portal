type Props = {
  title: string
  description?: string
  onRemove?: () => void
  removeLabel?: string
  children: React.ReactNode
}

export default function FormSection({
  title,
  description,
  onRemove,
  removeLabel = 'Remove',
  children,
}: Props): React.ReactElement {
  return (
    <div className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-gray-200">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
          {description && (
            <p className="mt-1 text-sm text-gray-500">{description}</p>
          )}
        </div>
        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="text-xs text-gray-400 hover:text-red-500"
          >
            {removeLabel}
          </button>
        )}
      </div>
      {children}
    </div>
  )
}
