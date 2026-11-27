import { describe, it, expect } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'

import InfoPopover from './InfoPopover'

function renderPopover(): HTMLElement {
  render(
    <InfoPopover content={<p>The detail</p>} className="extra" data-level="x">
      Help
    </InfoPopover>,
  )
  return screen.getByRole('button', { name: 'Help' })
}

describe('InfoPopover', () => {
  it('is closed until tapped, then shows its content', () => {
    const button = renderPopover()
    expect(button).toHaveClass('extra')
    expect(button).toHaveAttribute('data-level', 'x')
    expect(button).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('tooltip')).toBeNull()

    fireEvent.click(button)

    expect(button).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('tooltip')).toHaveTextContent('The detail')
  })

  it('closes on a second tap and on Escape', () => {
    const button = renderPopover()
    fireEvent.click(button)
    fireEvent.click(button)
    expect(screen.queryByRole('tooltip')).toBeNull()

    fireEvent.click(button)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('tooltip')).toBeNull()
  })

  it('opens on mouse hover and closes when the mouse leaves', () => {
    const button = renderPopover()
    fireEvent.pointerEnter(button, { pointerType: 'mouse' })
    expect(screen.getByRole('tooltip')).toBeInTheDocument()

    fireEvent.pointerLeave(button, { pointerType: 'mouse' })
    expect(screen.queryByRole('tooltip')).toBeNull()
  })

  it('uses an aria-label when given one', () => {
    render(
      <InfoPopover content="x" aria-label="More about this">
        ?
      </InfoPopover>,
    )
    expect(
      screen.getByRole('button', { name: 'More about this' }),
    ).toBeInTheDocument()
  })
})
