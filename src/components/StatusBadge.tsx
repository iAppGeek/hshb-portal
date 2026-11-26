'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import clsx from 'clsx'
import {
  CheckCircleIcon,
  ExclamationTriangleIcon,
  XCircleIcon,
} from '@heroicons/react/20/solid'

import type { StatusLevel } from '@/lib/hrStatus'

type Props = {
  level: StatusLevel
  /** Visible text beside the icon. */
  label: string
  /** Shown in a popover when the status is not ok. */
  reasons?: string[]
  className?: string
}

const ICONS = {
  ok: CheckCircleIcon,
  warning: ExclamationTriangleIcon,
  error: XCircleIcon,
} as const

const COLOURS: Record<StatusLevel, string> = {
  ok: 'text-green-700',
  warning: 'text-amber-700',
  error: 'text-red-700',
}

const PANEL_WIDTH = 256

type Position = { top: number; left: number }

function positionBelow(button: HTMLElement | null): Position | null {
  const rect = button?.getBoundingClientRect()
  if (!rect) return null
  const maxLeft = window.innerWidth - PANEL_WIDTH - 8
  return {
    top: rect.bottom + 6,
    left: Math.max(8, Math.min(rect.left, maxLeft)),
  }
}

/**
 * A coloured status with an explanation. The popover opens on hover with a
 * mouse and on tap with touch, and is portalled with fixed coordinates so a
 * scrolling table can't clip it.
 */
export default function StatusBadge({
  level,
  label,
  reasons = [],
  className,
}: Props): React.ReactElement {
  const Icon = ICONS[level]
  const content = (
    <>
      <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
      <span>{label}</span>
    </>
  )
  const classes = clsx(
    'inline-flex items-center gap-1 font-medium whitespace-nowrap',
    COLOURS[level],
    className,
  )

  if (level === 'ok' || reasons.length === 0) {
    return (
      <span className={classes} data-level={level}>
        {content}
      </span>
    )
  }

  return (
    <ExplainedStatus classes={classes} level={level} reasons={reasons}>
      {content}
    </ExplainedStatus>
  )
}

function ExplainedStatus({
  classes,
  level,
  reasons,
  children,
}: {
  classes: string
  level: StatusLevel
  reasons: string[]
  children: React.ReactNode
}): React.ReactElement {
  const id = useId()
  const buttonRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<Position | null>(null)
  // A mouse opens the popover on hover, so its click must not toggle it shut.
  const openedByHover = useRef(false)

  function open(): void {
    const next = positionBelow(buttonRef.current)
    if (next) setPosition(next)
  }

  function close(): void {
    openedByHover.current = false
    setPosition(null)
  }

  function handleClick(): void {
    if (openedByHover.current) {
      openedByHover.current = false
      open()
    } else if (position) {
      close()
    } else {
      open()
    }
  }

  useEffect(() => {
    if (!position) return
    function onPointerDown(event: PointerEvent): void {
      const target = event.target as Node
      if (
        !buttonRef.current?.contains(target) &&
        !panelRef.current?.contains(target)
      ) {
        setPosition(null)
      }
    }
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') setPosition(null)
    }
    // Follow the button rather than close: a scroll can land just after a
    // tap opens the popover (momentum, or the browser scrolling it into view).
    function onMove(): void {
      setPosition((current) =>
        current ? (positionBelow(buttonRef.current) ?? current) : null,
      )
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    window.addEventListener('scroll', onMove, true)
    window.addEventListener('resize', onMove)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('scroll', onMove, true)
      window.removeEventListener('resize', onMove)
    }
  }, [position])

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className={clsx(
          classes,
          'cursor-help rounded underline decoration-dotted underline-offset-2 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none',
        )}
        data-level={level}
        aria-expanded={position !== null}
        aria-describedby={position ? id : undefined}
        onClick={handleClick}
        onPointerEnter={(e) => {
          if (e.pointerType !== 'mouse') return
          openedByHover.current = true
          open()
        }}
        onPointerLeave={(e) => {
          if (e.pointerType === 'mouse') close()
        }}
      >
        {children}
      </button>
      {position &&
        createPortal(
          <div
            ref={panelRef}
            id={id}
            role="tooltip"
            style={{ top: position.top, left: position.left }}
            className="fixed z-50 w-64 rounded-md bg-gray-900 px-3 py-2 text-xs text-white shadow-lg"
          >
            <ul className="list-disc space-y-1 pl-4">
              {reasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          </div>,
          document.body,
        )}
    </>
  )
}
