'use client'

import { useState, useTransition } from 'react'
import { Dialog, DialogPanel, DialogTitle } from '@headlessui/react'

import type { DocumentRow, DocumentField } from '@/db'
import {
  DOCUMENT_TYPES,
  getDocumentType,
  type DocumentTypeMode,
} from '@/lib/documentTypes'
import { formatCalendarDate, todayInSchoolTz } from '@/lib/datetime'
import {
  uploadDocumentAction,
  linkDocumentAction,
  createRecordAction,
  updateDocumentAction,
  deleteDocumentAction,
} from '@/app/documents/actions'

import RecordFieldsEditor from './RecordFieldsEditor'

export type DocumentsSectionProps = {
  ownerType: 'student' | 'staff'
  ownerId: string
  documents: DocumentRow[]
  canManage: boolean
}

const inputClass =
  'mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm placeholder:text-gray-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none'
const labelClass = 'block text-sm font-medium text-gray-700'

function isExpired(expiresAt: string | null): boolean {
  return expiresAt != null && expiresAt < todayInSchoolTz()
}

function typeLabel(value: string): string {
  return getDocumentType(value)?.label ?? value
}

export default function DocumentsSection({
  ownerType,
  ownerId,
  documents,
  canManage,
}: DocumentsSectionProps) {
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<DocumentRow | null>(null)

  return (
    <div
      data-testid="documents-section"
      className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-gray-200"
    >
      <h2 className="mb-4 text-sm font-semibold text-gray-900">
        Documents &amp; Records
      </h2>

      {documents.length === 0 ? (
        <p className="text-sm text-gray-500">No documents or records yet.</p>
      ) : (
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-xs text-gray-500">
              <th className="py-2 pr-3 font-medium">Name</th>
              <th className="py-2 pr-3 font-medium">Type</th>
              <th className="py-2 pr-3 font-medium">Expires</th>
              <th className="py-2 pr-3 font-medium">Notes</th>
              <th className="py-2 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {documents.map((doc) =>
              editingId === doc.id ? (
                <tr key={doc.id}>
                  <td colSpan={5} className="py-3">
                    <DocumentForm
                      ownerType={ownerType}
                      ownerId={ownerId}
                      existing={doc}
                      onDone={() => setEditingId(null)}
                    />
                  </td>
                </tr>
              ) : (
                <DocumentRowView
                  key={doc.id}
                  doc={doc}
                  canManage={canManage}
                  onEdit={() => setEditingId(doc.id)}
                  onDelete={() => setDeleteTarget(doc)}
                />
              ),
            )}
          </tbody>
        </table>
      )}

      {canManage && (
        <div className="mt-4 border-t border-gray-200 pt-4">
          {adding ? (
            <DocumentForm
              ownerType={ownerType}
              ownerId={ownerId}
              onDone={() => setAdding(false)}
            />
          ) : (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="text-sm font-medium text-blue-600 hover:text-blue-800"
            >
              + Add document or record
            </button>
          )}
        </div>
      )}

      <DeleteDialog
        target={deleteTarget}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  )
}

function DocumentRowView({
  doc,
  canManage,
  onEdit,
  onDelete,
}: {
  doc: DocumentRow
  canManage: boolean
  onEdit: () => void
  onDelete: () => void
}) {
  const expired = isExpired(doc.expires_at)
  const isFile = doc.source === 'upload' || doc.source === 'link'
  return (
    <>
      <tr className="border-b border-gray-100 align-top">
        <td className="py-2 pr-3 font-medium text-gray-900">{doc.name}</td>
        <td className="py-2 pr-3 text-gray-700">{typeLabel(doc.type)}</td>
        <td className="py-2 pr-3 text-gray-700">
          {doc.expires_at == null ? (
            'Never'
          ) : (
            <span>
              {formatCalendarDate(doc.expires_at)}
              {expired && (
                <span className="ml-1 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-800">
                  ⚠ Expired
                </span>
              )}
            </span>
          )}
        </td>
        <td className="py-2 pr-3 text-gray-500">{doc.other ?? '—'}</td>
        <td className="py-2">
          <div className="flex items-center gap-3">
            {isFile && (
              <a
                href={`/api/documents/${doc.id}/download`}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-blue-600 hover:text-blue-800"
              >
                View {doc.source === 'upload' ? '⤓' : '↗'}
              </a>
            )}
            {canManage && (
              <>
                <button
                  type="button"
                  onClick={onEdit}
                  className="font-medium text-gray-600 hover:text-gray-900"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={onDelete}
                  className="font-medium text-red-600 hover:text-red-800"
                >
                  Delete
                </button>
              </>
            )}
          </div>
        </td>
      </tr>
      {doc.source === 'record' && doc.fields && doc.fields.length > 0 && (
        <tr className="border-b border-gray-100">
          <td colSpan={5} className="pb-2 pl-4 text-xs text-gray-600">
            {doc.fields.map((f, i) => (
              <span key={i} className="mr-4">
                <span className="font-medium">{f.field}:</span> {f.value}
              </span>
            ))}
          </td>
        </tr>
      )}
    </>
  )
}

type ExpiryChoice = '' | 'date' | 'never'

function DocumentForm({
  ownerType,
  ownerId,
  existing,
  onDone,
}: {
  ownerType: 'student' | 'staff'
  ownerId: string
  existing?: DocumentRow
  onDone: () => void
}) {
  const isEdit = existing != null
  const existingMode: DocumentTypeMode | null = existing
    ? existing.source === 'record'
      ? 'record'
      : 'file'
    : null

  const availableTypes = existingMode
    ? DOCUMENT_TYPES.filter((t) => t.mode === existingMode)
    : DOCUMENT_TYPES

  const [type, setType] = useState(existing?.type ?? '')
  const [sourceChoice, setSourceChoice] = useState<'upload' | 'link'>('upload')
  const [expiryChoice, setExpiryChoice] = useState<ExpiryChoice>(
    existing ? (existing.expires_at == null ? 'never' : 'date') : '',
  )
  const [expiryDate, setExpiryDate] = useState(existing?.expires_at ?? '')
  const [fields, setFields] = useState<DocumentField[]>(
    existing?.fields ?? [{ field: '', value: '' }],
  )
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const mode = getDocumentType(type)?.mode
  const isRecord = mode === 'record'
  const expiresAtValue =
    expiryChoice === 'never'
      ? 'never'
      : expiryChoice === 'date'
        ? expiryDate
        : ''
  const cleanFields = fields.filter((f) => f.field.trim() !== '')

  function handleTypeChange(value: string): void {
    setType(value)
    const def = getDocumentType(value)
    if (def?.mode === 'record' && !isEdit) {
      setFields(
        def.fields?.length
          ? def.fields.map((f) => ({ field: f, value: '' }))
          : [{ field: '', value: '' }],
      )
    }
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>): void {
    e.preventDefault()
    setError(null)

    if (!type) return setError('Choose a type')
    if (!expiryChoice) {
      return setError('Choose an expiry date or select Never')
    }
    if (expiryChoice === 'date' && !expiryDate) {
      return setError('Enter an expiry date')
    }
    if (isRecord && cleanFields.length === 0) {
      return setError('Add at least one field')
    }

    const form = e.currentTarget
    const fd = new FormData(form)
    if (isRecord) fd.set('fields', JSON.stringify(cleanFields))

    if (!isEdit && !isRecord && sourceChoice === 'upload') {
      const fileInput = form.elements.namedItem(
        'file',
      ) as HTMLInputElement | null
      const file = fileInput?.files?.[0]
      if (!file || file.size === 0) {
        return setError('Choose a file to upload')
      }
      // Ensure the file is present in the payload regardless of how the
      // platform populates FormData from a file input.
      fd.set('file', file)
    }

    startTransition(async () => {
      const result = isEdit
        ? await updateDocumentAction(existing.id, fd)
        : isRecord
          ? await createRecordAction(fd)
          : sourceChoice === 'upload'
            ? await uploadDocumentAction(fd)
            : await linkDocumentAction(fd)
      if (result?.error) setError(result.error)
      else onDone()
    })
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4 rounded-lg border border-gray-200 p-4"
    >
      {!isEdit && (
        <>
          <input type="hidden" name="owner_type" value={ownerType} />
          <input type="hidden" name="owner_id" value={ownerId} />
        </>
      )}
      <input type="hidden" name="expires_at" value={expiresAtValue} />

      <div>
        <label htmlFor="type" className={labelClass}>
          Type<span className="ml-0.5 text-red-500">*</span>
        </label>
        <select
          id="type"
          name="type"
          required
          value={type}
          onChange={(e) => handleTypeChange(e.target.value)}
          className={inputClass}
        >
          <option value="">Select a type…</option>
          {availableTypes.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="name" className={labelClass}>
          Name<span className="ml-0.5 text-red-500">*</span>
        </label>
        <input
          id="name"
          name="name"
          required
          defaultValue={existing?.name}
          className={inputClass}
        />
      </div>

      <fieldset>
        <legend className={labelClass}>
          Expiry<span className="ml-0.5 text-red-500">*</span>
        </legend>
        <div className="mt-1 flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="radio"
              name="expiry_choice"
              checked={expiryChoice === 'date'}
              onChange={() => setExpiryChoice('date')}
              className="text-blue-600 focus:ring-blue-500"
            />
            Date
          </label>
          {expiryChoice === 'date' && (
            <input
              type="date"
              aria-label="Expiry date"
              value={expiryDate}
              onChange={(e) => setExpiryDate(e.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
            />
          )}
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="radio"
              name="expiry_choice"
              checked={expiryChoice === 'never'}
              onChange={() => setExpiryChoice('never')}
              className="text-blue-600 focus:ring-blue-500"
            />
            Never
          </label>
        </div>
      </fieldset>

      <div>
        <label htmlFor="other" className={labelClass}>
          Notes
        </label>
        <input
          id="other"
          name="other"
          defaultValue={existing?.other ?? undefined}
          className={inputClass}
        />
      </div>

      {/* Mode-dependent area — driven by the chosen Type. */}
      {type && !isRecord && !isEdit && (
        <div className="space-y-3">
          <div className="flex gap-4">
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="radio"
                name="source_choice"
                checked={sourceChoice === 'upload'}
                onChange={() => setSourceChoice('upload')}
                className="text-blue-600 focus:ring-blue-500"
              />
              Upload file
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="radio"
                name="source_choice"
                checked={sourceChoice === 'link'}
                onChange={() => setSourceChoice('link')}
                className="text-blue-600 focus:ring-blue-500"
              />
              Paste link
            </label>
          </div>
          {sourceChoice === 'upload' ? (
            <input
              type="file"
              name="file"
              aria-label="Choose file"
              className="block w-full text-sm text-gray-700 file:mr-3 file:rounded-md file:border-0 file:bg-blue-50 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-blue-700"
            />
          ) : (
            <input
              type="url"
              name="external_url"
              aria-label="Link URL"
              placeholder="https://…"
              className={inputClass}
            />
          )}
        </div>
      )}

      {isRecord && <RecordFieldsEditor value={fields} onChange={setFields} />}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={isPending}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700 disabled:pointer-events-none disabled:opacity-50"
        >
          {isPending
            ? sourceChoice === 'upload' && !isEdit && !isRecord
              ? 'Uploading…'
              : 'Saving…'
            : isEdit
              ? 'Save'
              : 'Add'}
        </button>
        <button
          type="button"
          onClick={onDone}
          className="text-sm font-medium text-gray-500 hover:text-gray-700"
        >
          Cancel
        </button>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    </form>
  )
}

function DeleteDialog({
  target,
  onClose,
}: {
  target: DocumentRow | null
  onClose: () => void
}) {
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleConfirm(): void {
    if (!target) return
    setError(null)
    startTransition(async () => {
      const result = await deleteDocumentAction(target.id)
      if (result?.error) setError(result.error)
      else onClose()
    })
  }

  return (
    <Dialog open={target != null} onClose={onClose} className="relative z-50">
      <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <DialogPanel className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
          <DialogTitle className="text-base font-semibold text-gray-900">
            Delete document
          </DialogTitle>
          <p className="mt-2 text-sm text-gray-600">
            Remove <span className="font-medium">{target?.name}</span> from this
            record? It will no longer appear here but is retained for admin
            records.
          </p>
          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
          <div className="mt-5 flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="text-sm font-medium text-gray-500 hover:text-gray-700"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={isPending}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-red-700 disabled:pointer-events-none disabled:opacity-50"
            >
              {isPending ? 'Deleting…' : 'Confirm'}
            </button>
          </div>
        </DialogPanel>
      </div>
    </Dialog>
  )
}
