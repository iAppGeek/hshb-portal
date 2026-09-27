import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

import PermissionedButton from './PermissionedButton'

function renderButton(
  overrides: Partial<React.ComponentProps<typeof PermissionedButton>> = {},
): ReturnType<typeof render> {
  return render(
    <PermissionedButton
      allowed
      showDisabled
      disabledReason="Only admins can do this"
      onClick={vi.fn()}
      className="bg-white"
      {...overrides}
    >
      Reject
    </PermissionedButton>,
  )
}

describe('PermissionedButton', () => {
  it('renders a clickable button when allowed', () => {
    const onClick = vi.fn()
    renderButton({ onClick })
    fireEvent.click(screen.getByRole('button', { name: 'Reject' }))
    expect(onClick).toHaveBeenCalled()
  })

  it('renders greyed-out text with the reason when not allowed but shown', () => {
    renderButton({ allowed: false })
    expect(screen.queryByRole('button')).toBeNull()
    const span = screen.getByText('Reject')
    expect(span.className).toContain('cursor-not-allowed')
    expect(screen.getByRole('tooltip').textContent).toBe(
      'Only admins can do this',
    )
  })

  it('renders nothing when neither allowed nor shown', () => {
    const { container } = renderButton({ allowed: false, showDisabled: false })
    expect(container.firstChild).toBeNull()
  })
})
