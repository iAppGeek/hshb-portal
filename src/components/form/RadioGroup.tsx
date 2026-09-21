'use client'

type Props = {
  name: string
  legend: string
  options: { value: string; label: string }[]
  value: string
  onChange: (value: string) => void
}

export default function RadioGroup({
  name,
  legend,
  options,
  value,
  onChange,
}: Props): React.ReactElement {
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-medium text-gray-700">
        {legend}
      </legend>
      <div className="flex gap-4">
        {options.map((option) => (
          <label
            key={option.value}
            className="flex cursor-pointer items-center gap-2 text-sm text-gray-700"
          >
            <input
              type="radio"
              name={name}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
              className="text-blue-600 focus:ring-blue-500"
            />
            {option.label}
          </label>
        ))}
      </div>
    </fieldset>
  )
}
