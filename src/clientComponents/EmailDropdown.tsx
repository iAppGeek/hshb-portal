'use client'

import { useState, type ReactElement } from 'react'
import { ChevronDownIcon } from '@heroicons/react/24/outline'
import {
  Menu,
  MenuButton,
  MenuHeading,
  MenuItem,
  MenuItems,
  MenuSection,
  MenuSeparator,
} from '@headlessui/react'
import clsx from 'clsx'

import { formatEmailsForOutlook } from '@/lib/mailto'

export type EmailGroup = {
  /** Section heading; omit for a single, unlabelled group. */
  label?: string
  emails: string[]
  mailtoHref: string | null
  /** Tooltip shown on "Open in default email app" when this group has no emails. */
  noEmailsReason?: string
}

type Props = {
  groups: EmailGroup[]
  buttonLabel: string
  triggerClassName: string
  emptyReason?: string
  mailtoUnavailableReason?: string
  menuAnchor?: 'bottom start' | 'bottom end'
}

const itemClass =
  'group flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-700 data-focus:bg-gray-100 data-disabled:cursor-not-allowed data-disabled:opacity-50'

const headingClass =
  'px-3 py-1.5 text-xs font-medium tracking-wide text-gray-500 uppercase'

function GroupSection({
  group,
  mailtoUnavailableReason,
}: {
  group: EmailGroup
  mailtoUnavailableReason: string
}): ReactElement {
  const [copied, setCopied] = useState(false)
  const [copyError, setCopyError] = useState(false)
  const hasEmails = group.emails.length > 0
  const clipboardText = formatEmailsForOutlook(group.emails)

  async function copy(): Promise<void> {
    setCopyError(false)
    try {
      await navigator.clipboard.writeText(clipboardText)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopyError(true)
    }
  }

  return (
    <MenuSection>
      {group.label && (
        <MenuHeading className={headingClass}>{group.label}</MenuHeading>
      )}
      <MenuItem disabled={!hasEmails}>
        <button type="button" className={itemClass} onClick={copy}>
          {copied
            ? 'Copied'
            : copyError
              ? 'Copy failed — try again'
              : 'Copy emails'}
        </button>
      </MenuItem>
      <MenuItem disabled={!hasEmails || group.mailtoHref == null}>
        {hasEmails && group.mailtoHref ? (
          <a
            href={group.mailtoHref}
            className={itemClass}
            onClick={(e) => e.stopPropagation()}
          >
            Open in default email app
          </a>
        ) : (
          <span
            className={itemClass}
            title={
              !hasEmails
                ? (group.noEmailsReason ?? 'No email addresses on this list.')
                : mailtoUnavailableReason
            }
          >
            Open in default email app
          </span>
        )}
      </MenuItem>
    </MenuSection>
  )
}

export default function EmailDropdown({
  groups,
  buttonLabel,
  triggerClassName,
  emptyReason = 'No email addresses available.',
  mailtoUnavailableReason = 'Too many addresses for your email app. Use copy instead.',
  menuAnchor = 'bottom end',
}: Props): ReactElement {
  const disabled = groups.every((g) => g.emails.length === 0)

  if (disabled) {
    return (
      <span
        className={clsx(triggerClassName, 'cursor-not-allowed opacity-50')}
        title={emptyReason}
      >
        {buttonLabel}
      </span>
    )
  }

  return (
    <Menu as="div" className="relative inline-block text-left">
      <MenuButton
        type="button"
        className={clsx(
          triggerClassName,
          'inline-flex items-center gap-1 data-active:opacity-90 data-hover:opacity-90',
        )}
      >
        {buttonLabel}
        <ChevronDownIcon className="h-4 w-4 shrink-0 opacity-70" aria-hidden />
      </MenuButton>

      <MenuItems
        transition
        anchor={menuAnchor}
        modal={false}
        className="z-100 min-w-[16rem] origin-top rounded-md bg-white py-1 text-sm shadow-lg ring-1 ring-black/5 transition duration-100 ease-out [--anchor-gap:4px] data-closed:scale-95 data-closed:opacity-0"
      >
        {groups.map((group, i) => (
          <div key={group.label ?? i}>
            {i > 0 && (
              <MenuSeparator className="my-1 border-t border-gray-100" />
            )}
            <GroupSection
              group={group}
              mailtoUnavailableReason={mailtoUnavailableReason}
            />
          </div>
        ))}
      </MenuItems>
    </Menu>
  )
}
