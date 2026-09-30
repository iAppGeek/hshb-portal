import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

import EmailClassDropdown from './EmailClassDropdown'

function guardian(email: string | null): { email: string | null } {
  return { email }
}

describe('EmailClassDropdown', () => {
  let clipboardWriteText: ReturnType<typeof vi.fn>

  beforeEach(() => {
    clipboardWriteText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: clipboardWriteText },
      configurable: true,
      writable: true,
    })
  })

  it('renders nothing when the class has no students', () => {
    const { container } = render(
      <EmailClassDropdown students={[]} subject="Year 1" />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('shows a disabled trigger when no guardian has an email', () => {
    render(
      <EmailClassDropdown
        students={[{ primary_guardian: guardian(null) }]}
        subject="Year 1"
      />,
    )
    expect(screen.getByText('Email class')).toHaveAttribute(
      'title',
      'No guardian email addresses on file for this class.',
    )
    expect(screen.queryByRole('button', { name: /email class/i })).toBeNull()
  })

  it('copies guardian emails separated by semicolons', async () => {
    render(
      <EmailClassDropdown
        students={[
          {
            primary_guardian: guardian('a@x.com'),
            secondary_guardian: guardian('b@x.com'),
          },
          { primary_guardian: guardian('A@x.com') },
        ]}
        subject="Year 1"
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /email class/i }))
    fireEvent.click(
      await screen.findByRole('menuitem', { name: 'Copy emails' }),
    )

    await waitFor(() => {
      expect(clipboardWriteText).toHaveBeenCalledWith('a@x.com; b@x.com')
    })
  })

  it('opens the email app with guardians in Bcc and the given subject', async () => {
    render(
      <EmailClassDropdown
        students={[{ primary_guardian: guardian('a@x.com') }]}
        subject="Year 1 — Class register"
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /email class/i }))
    const link = await screen.findByRole('menuitem', {
      name: /open in default email app/i,
    })
    const params = new URL(link.getAttribute('href')!).searchParams
    expect(params.get('bcc')).toBe('a@x.com')
    expect(params.get('subject')).toBe('Year 1 — Class register')
  })
})
