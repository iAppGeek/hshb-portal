'use client'

import { useState } from 'react'
import clsx from 'clsx'

import SelectField from '@/components/form/SelectField'
import {
  recipientFields,
  type ClassEmailRoster,
  type CommunicationAudience,
  type RecipientFields,
} from '@/lib/communication'
import { formatEmailsForOutlook, mailtoWithRecipients } from '@/lib/mailto'

const AUDIENCES: {
  value: CommunicationAudience
  label: string
  description: string
}[] = [
  {
    value: 'broadcast',
    label: 'Broadcast',
    description:
      'To holds the All Parents and All Teachers distribution lists.',
  },
  {
    value: 'parents',
    label: 'All parents',
    description: 'To holds the All Parents distribution list.',
  },
  {
    value: 'teachers',
    label: 'All teachers',
    description: 'To holds the All Teachers distribution list.',
  },
  {
    value: 'class',
    label: 'By class',
    description:
      'Cc holds the class teacher’s school email. Bcc holds parent and guardian emails for students in that class.',
  },
]

type Props = {
  yearCode: string
  classes: ClassEmailRoster[]
}

export default function CommunicationPanel({
  yearCode,
  classes,
}: Props): React.ReactElement {
  const [audience, setAudience] = useState<CommunicationAudience>('broadcast')
  const [classId, setClassId] = useState('')

  const selectedClass =
    audience === 'class'
      ? (classes.find((cls) => cls.id === classId) ?? null)
      : null
  const fields = recipientFields(audience, selectedClass)
  const mailtoHref = mailtoWithRecipients(fields)
  const hasRecipients =
    fields.to.length + fields.cc.length + fields.bcc.length > 0

  return (
    <div className="space-y-6">
      <p className="text-sm text-gray-600">
        Choose who to email. Each option shows the To, Cc, and Bcc addresses.
        Copy a field to paste into Outlook, or open your email app with every
        field filled in.
      </p>

      <div className="space-y-6 rounded-xl bg-white p-6 shadow-sm ring-1 ring-gray-200">
        <fieldset>
          <legend className="mb-2 text-sm font-medium text-gray-700">
            Who to email
          </legend>
          <div className="space-y-2">
            {AUDIENCES.map((option) => {
              const selected = audience === option.value
              return (
                <label
                  key={option.value}
                  className={clsx(
                    'flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2',
                    selected
                      ? 'border-blue-600 bg-blue-50'
                      : 'border-gray-200 hover:bg-gray-50',
                  )}
                >
                  <input
                    type="radio"
                    name="audience"
                    value={option.value}
                    checked={selected}
                    onChange={() => setAudience(option.value)}
                    className="mt-1 text-blue-600 focus:ring-blue-500"
                  />
                  <span>
                    <span className="block text-sm font-medium text-gray-900">
                      {option.label}
                    </span>
                    <span className="block text-sm text-gray-500">
                      {option.description}
                    </span>
                  </span>
                </label>
              )
            })}
          </div>
        </fieldset>

        {audience === 'class' && (
          <div className="space-y-2">
            <SelectField
              label="Class"
              name="classId"
              value={classId}
              onChange={setClassId}
              placeholder="Select a class"
              disabled={classes.length === 0}
              options={classes.map((cls) => ({
                value: cls.id,
                label: cls.name,
              }))}
              hint={
                classes.length === 0
                  ? `No active classes in ${yearCode}.`
                  : `Active classes in ${yearCode}.`
              }
            />
            {selectedClass && (
              <ClassNotes roster={selectedClass} fields={fields} />
            )}
          </div>
        )}

        {audience !== 'class' && (
          <p className="text-sm text-gray-500">
            Exchange only delivers to these lists from mailboxes allowed to send
            to them.
          </p>
        )}

        <div>
          <h2 className="text-sm font-semibold text-gray-900">Recipients</h2>
          <AddressField
            key={`To:${fields.to.join(';')}`}
            label="To"
            emails={fields.to}
          />
          <AddressField
            key={`Cc:${fields.cc.join(';')}`}
            label="Cc"
            emails={fields.cc}
          />
          <AddressField
            key={`Bcc:${fields.bcc.join(';')}`}
            label="Bcc"
            emails={fields.bcc}
          />
        </div>

        {mailtoHref ? (
          <a
            href={mailtoHref}
            className="inline-flex rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700"
          >
            Open in email
          </a>
        ) : (
          <p className="text-sm text-gray-500">
            {hasRecipients
              ? 'Too many addresses for an email link. Copy the fields into Outlook instead.'
              : audience === 'class' && selectedClass
                ? 'This class has no addresses to put in Cc or Bcc.'
                : 'Choose a class to fill Cc and Bcc.'}
          </p>
        )}

        <p className="text-xs text-gray-400">
          Copied addresses are separated with semicolons so Outlook treats each
          one as its own recipient.
        </p>
      </div>
    </div>
  )
}

function ClassNotes({
  roster,
  fields,
}: {
  roster: ClassEmailRoster
  fields: RecipientFields
}): React.ReactElement {
  return (
    <div className="space-y-1 text-sm text-gray-500">
      {roster.teacherName == null ? (
        <p>This class has no teacher assigned, so Cc is empty.</p>
      ) : fields.cc.length === 0 ? (
        <p>{roster.teacherName} has no school email on file, so Cc is empty.</p>
      ) : (
        <p>Cc is the school email for {roster.teacherName}.</p>
      )}
      {fields.bcc.length === 0 && (
        <p>
          No parent or guardian emails on file for this class, so Bcc is empty.
        </p>
      )}
    </div>
  )
}

function AddressField({
  label,
  emails,
}: {
  label: 'To' | 'Cc' | 'Bcc'
  emails: string[]
}): React.ReactElement {
  const text = formatEmailsForOutlook(emails)
  const [copied, setCopied] = useState(false)
  const [copyError, setCopyError] = useState(false)

  async function copy() {
    setCopyError(false)
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopyError(true)
    }
  }

  const count = emails.length === 1 ? '1 address' : `${emails.length} addresses`

  return (
    <div className="mt-4 flex items-start justify-between gap-3 border-t border-gray-100 pt-4">
      <div className="min-w-0">
        <p className="text-sm font-medium text-gray-900">
          {label}
          {emails.length > 0 && (
            <span className="ml-2 font-normal text-gray-400">{count}</span>
          )}
        </p>
        {emails.length > 0 ? (
          <p className="mt-1 font-mono text-sm break-all text-gray-800">
            {text}
          </p>
        ) : (
          <p className="mt-1 text-sm text-gray-400">Empty</p>
        )}
      </div>
      <button
        type="button"
        onClick={copy}
        disabled={emails.length === 0}
        aria-label={
          copied
            ? `Copied ${label}`
            : copyError
              ? `Copy ${label} failed`
              : `Copy ${label}`
        }
        className="shrink-0 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 shadow-sm transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {copied ? 'Copied' : copyError ? 'Copy failed' : 'Copy'}
      </button>
    </div>
  )
}
