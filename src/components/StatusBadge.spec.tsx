import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'

import StatusBadge from './StatusBadge'

describe('StatusBadge', () => {
  it('renders an ok status as plain text with no popover trigger', () => {
    render(<StatusBadge level="ok" label="OK" />)

    expect(screen.getByText('OK')).toBeInTheDocument()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('renders a status without reasons as plain text', () => {
    render(<StatusBadge level="error" label="Action needed" />)
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('toggles the reasons on tap or click', () => {
    render(
      <StatusBadge
        level="error"
        label="Action needed"
        reasons={['No HR record', 'ID has not been verified']}
      />,
    )
    const button = screen.getByRole('button', { name: 'Action needed' })
    expect(button).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('tooltip')).toBeNull()

    fireEvent.click(button)
    const tooltip = screen.getByRole('tooltip')
    expect(tooltip).toHaveTextContent('No HR record')
    expect(tooltip).toHaveTextContent('ID has not been verified')
    expect(button).toHaveAttribute('aria-expanded', 'true')
    expect(button).toHaveAttribute('aria-describedby', tooltip.id)

    fireEvent.click(button)
    expect(screen.queryByRole('tooltip')).toBeNull()
  })

  it('opens on mouse hover and closes when the mouse leaves', () => {
    render(<StatusBadge level="warning" label="Warning" reasons={['Basic']} />)
    const button = screen.getByRole('button', { name: 'Warning' })

    fireEvent.pointerEnter(button, { pointerType: 'mouse' })
    expect(screen.getByRole('tooltip')).toHaveTextContent('Basic')
    fireEvent.pointerLeave(button, { pointerType: 'mouse' })
    expect(screen.queryByRole('tooltip')).toBeNull()
  })

  it('stays open when a mouse hovers and then clicks', () => {
    render(<StatusBadge level="warning" label="Warning" reasons={['Basic']} />)
    const button = screen.getByRole('button', { name: 'Warning' })

    fireEvent.pointerEnter(button, { pointerType: 'mouse' })
    fireEvent.click(button)
    expect(screen.getByRole('tooltip')).toHaveTextContent('Basic')
    // A second click closes it
    fireEvent.click(button)
    expect(screen.queryByRole('tooltip')).toBeNull()
  })

  it('ignores touch pointer enter so a tap is handled by the click', () => {
    render(<StatusBadge level="warning" label="Warning" reasons={['Basic']} />)
    fireEvent.pointerEnter(screen.getByRole('button'), { pointerType: 'touch' })
    expect(screen.queryByRole('tooltip')).toBeNull()
  })

  it('closes on Escape and on a tap elsewhere', () => {
    render(
      <>
        <StatusBadge level="error" label="Action needed" reasons={['Why']} />
        <p>Elsewhere</p>
      </>,
    )
    const button = screen.getByRole('button')

    fireEvent.click(button)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('tooltip')).toBeNull()

    fireEvent.click(button)
    fireEvent.pointerDown(screen.getByText('Elsewhere'))
    expect(screen.queryByRole('tooltip')).toBeNull()
  })

  it('follows the button when the page scrolls instead of closing', () => {
    render(
      <StatusBadge level="error" label="Action needed" reasons={['Why']} />,
    )
    const button = screen.getByRole('button')
    vi.spyOn(button, 'getBoundingClientRect')
      .mockReturnValueOnce({ bottom: 100, left: 20 } as DOMRect)
      .mockReturnValueOnce({ bottom: 40, left: 20 } as DOMRect)

    fireEvent.click(button)
    expect(screen.getByRole('tooltip').style.top).toBe('106px')
    fireEvent.scroll(window)
    expect(screen.getByRole('tooltip').style.top).toBe('46px')
  })

  it('stays open when the popover itself is tapped', () => {
    render(
      <StatusBadge level="error" label="Action needed" reasons={['Why']} />,
    )
    fireEvent.click(screen.getByRole('button'))
    fireEvent.pointerDown(screen.getByRole('tooltip'))
    expect(screen.getByRole('tooltip')).toBeInTheDocument()
  })

  it('marks the level for styling', () => {
    render(<StatusBadge level="warning" label="Warning" reasons={['x']} />)
    expect(screen.getByRole('button')).toHaveAttribute('data-level', 'warning')
  })
})
