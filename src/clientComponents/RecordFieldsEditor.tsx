'use client'

import type { DocumentField } from '@/db'

const inputClass =
  'mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm placeholder:text-gray-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none'

/**
 * Dynamic editor for a record's ordered FIELD:VALUE pairs. Controlled by the
 * parent form, which serialises `value` into a hidden `fields` input on submit.
 */
export default function RecordFieldsEditor({
  value,
  onChange,
}: {
  value: DocumentField[]
  onChange: (next: DocumentField[]) => void
}) {
  function update(index: number, patch: Partial<DocumentField>): void {
    onChange(value.map((row, i) => (i === index ? { ...row, ...patch } : row)))
  }

  function remove(index: number): void {
    onChange(value.filter((_, i) => i !== index))
  }

  function add(): void {
    onChange([...value, { field: '', value: '' }])
  }

  return (
    <div className="space-y-2">
      {value.map((row, i) => (
        <div key={i} className="flex items-end gap-2">
          <div className="flex-1">
            <label className="block text-xs font-medium text-gray-600">
              Field
            </label>
            <input
              aria-label={`Field ${i + 1} name`}
              value={row.field}
              onChange={(e) => update(i, { field: e.target.value })}
              className={inputClass}
            />
          </div>
          <div className="flex-1">
            <label className="block text-xs font-medium text-gray-600">
              Value
            </label>
            <input
              aria-label={`Field ${i + 1} value`}
              value={row.value}
              onChange={(e) => update(i, { value: e.target.value })}
              className={inputClass}
            />
          </div>
          <button
            type="button"
            aria-label={`Remove field ${i + 1}`}
            onClick={() => remove(i)}
            className="mb-2 px-2 text-gray-400 hover:text-red-600"
          >
            ✕
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={add}
        className="text-sm font-medium text-blue-600 hover:text-blue-800"
      >
        + Add field
      </button>
    </div>
  )
}
