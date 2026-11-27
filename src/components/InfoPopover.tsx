'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import clsx from 'clsx'

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

type Props = {
  /** Classes for the button that opens the popover. */
  className?: string
  /** Names the button when its content is only an icon. */
  'aria-label'?: string
  'data-level'?: string
  /** The button's content. */
  children: React.ReactNode
  /** What the popover shows. */
  content: React.ReactNode
}

/**
 * A button with an explanation that opens on hover with a mouse and on tap
 * with touch. The panel is portalled with fixed coordinates so a scrolling
 * table can't clip it.
 */
export default function InfoPopover({
  className,
  'aria-label': ariaLabel,
  'data-level': dataLevel,
  children,
  content,
}: Props): React.ReactElement {
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
          className,
          'cursor-help rounded underline decoration-dotted underline-offset-2 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none',
        )}
        data-level={dataLevel}
        aria-label={ariaLabel}
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
            {content}
          </div>,
          document.body,
        )}
    </>
  )
}
