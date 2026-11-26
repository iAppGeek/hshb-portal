'use client'

import { useRef, useState } from 'react'

import type { CollectionAdult } from '@/db/schema'
import { FormGrid, TextField } from '@/components/form'
import { collectionAdultFieldName } from '@/lib/collection/fieldNames'

type Row = CollectionAdult & { key: number }

type Props = {
  initial?: CollectionAdult[]
  fieldError: (name: string) => string | undefined
}

/**
 * The student form's list of adults, other than guardians, allowed to collect
 * the child. Fields are named by position (`collection_adult_0_name`, …) for
 * `parseCollectionAdults`; each row keeps a stable key so removing one leaves
 * what was typed in the others.
 */
export default function CollectionAdultsField({
  initial = [],
  fieldError,
}: Props): React.ReactElement {
  const nextKey = useRef(initial.length)
  const [rows, setRows] = useState<Row[]>(() =>
    initial.map((adult, key) => ({ ...adult, key })),
  )

  function addRow(): void {
    const key = nextKey.current
    nextKey.current += 1
    setRows((current) => [
      ...current,
      { key, name: '', relationship: null, phone: null },
    ])
  }

  function removeRow(key: number): void {
    setRows((current) => current.filter((row) => row.key !== key))
  }

  return (
    <div className="space-y-4">
      {rows.length === 0 && (
        <p className="text-sm text-gray-500">
          No other adults are allowed to collect this student.
        </p>
      )}

      {rows.map((row, index) => (
        <div
          key={row.key}
          role="group"
          aria-label={`Adult ${index + 1}`}
          className="rounded-lg border border-gray-200 p-4"
        >
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-medium text-gray-700">
              Adult {index + 1}
            </h3>
            <button
              type="button"
              onClick={() => removeRow(row.key)}
              className="text-xs text-gray-400 hover:text-red-500"
              aria-label={`Remove adult ${index + 1}`}
            >
              Remove
            </button>
          </div>
          <FormGrid>
            <TextField
              label="Full name"
              name={collectionAdultFieldName(index, 'name')}
              required
              defaultValue={row.name}
              error={fieldError(collectionAdultFieldName(index, 'name'))}
            />
            <TextField
              label="Relationship to student"
              name={collectionAdultFieldName(index, 'relationship')}
              defaultValue={row.relationship}
              error={fieldError(
                collectionAdultFieldName(index, 'relationship'),
              )}
            />
            <TextField
              label="Phone"
              name={collectionAdultFieldName(index, 'phone')}
              type="tel"
              defaultValue={row.phone}
              error={fieldError(collectionAdultFieldName(index, 'phone'))}
            />
          </FormGrid>
        </div>
      ))}

      <button
        type="button"
        onClick={addRow}
        className="text-sm font-medium text-blue-600 hover:text-blue-800"
      >
        + Add adult
      </button>
    </div>
  )
}
