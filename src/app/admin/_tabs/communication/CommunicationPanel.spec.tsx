import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { ALL_PARENTS_LIST, ALL_TEACHERS_LIST } from '@/lib/communication'

import CommunicationPanel from './CommunicationPanel'

const year3 = {
  id: 'class-1',
  name: 'Year 3',
  teacherName: 'Jane Smith',
  teacherEmail: 'jane@hshb.org.uk',
  guardianEmails: ['parent.a@x.com', 'parent.b@x.com'],
}

describe('CommunicationPanel', () => {
  let clipboardWriteText: ReturnType<typeof vi.fn>

  beforeEach(() => {
    clipboardWriteText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: clipboardWriteText },
      configurable: true,
      writable: true,
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('shows both distribution lists in To for a broadcast', () => {
    render(<CommunicationPanel yearCode="2026-27" classes={[year3]} />)

    expect(
      screen.getByText(`${ALL_PARENTS_LIST}; ${ALL_TEACHERS_LIST}`),
    ).toBeTruthy()
    expect(screen.getAllByText('Empty')).toHaveLength(2)
    expect(screen.getByRole('button', { name: 'Copy Cc' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Copy Bcc' })).toBeDisabled()

    const link = screen.getByRole('link', { name: 'Open in email' })
    const href = decodeURIComponent(link.getAttribute('href') ?? '')
    expect(href).toContain(ALL_PARENTS_LIST)
    expect(href).toContain(ALL_TEACHERS_LIST)
    expect(href).not.toContain('cc=')
    expect(href).not.toContain('bcc=')
  })

  it('copies To in Outlook semicolon format', async () => {
    render(<CommunicationPanel yearCode="2026-27" classes={[year3]} />)

    fireEvent.click(screen.getByRole('button', { name: 'Copy To' }))

    await waitFor(() => {
      expect(clipboardWriteText).toHaveBeenCalledWith(
        `${ALL_PARENTS_LIST}; ${ALL_TEACHERS_LIST}`,
      )
    })
  })

  it('puts only the parents list in To', async () => {
    const user = userEvent.setup()
    render(<CommunicationPanel yearCode="2026-27" classes={[year3]} />)

    await user.click(screen.getByRole('radio', { name: /^all parents/i }))

    expect(screen.getByText(ALL_PARENTS_LIST)).toBeTruthy()
    expect(screen.queryByText(ALL_TEACHERS_LIST)).toBeNull()
    expect(screen.getAllByText('Empty')).toHaveLength(2)
  })

  it('puts only the teachers list in To', async () => {
    const user = userEvent.setup()
    render(<CommunicationPanel yearCode="2026-27" classes={[year3]} />)

    await user.click(screen.getByRole('radio', { name: /^all teachers/i }))

    expect(screen.getByText(ALL_TEACHERS_LIST)).toBeTruthy()
    expect(screen.queryByText(ALL_PARENTS_LIST)).toBeNull()
  })

  it('puts the class teacher in Cc and guardians in Bcc', async () => {
    const user = userEvent.setup()
    render(<CommunicationPanel yearCode="2026-27" classes={[year3]} />)

    await user.click(screen.getByRole('radio', { name: /^by class/i }))
    await user.selectOptions(screen.getByLabelText('Class'), 'class-1')

    expect(screen.getByText('Empty')).toBeTruthy()
    expect(screen.getByText('jane@hshb.org.uk')).toBeTruthy()
    expect(screen.getByText('parent.a@x.com; parent.b@x.com')).toBeTruthy()
    expect(
      screen.getByText('Cc is the school email for Jane Smith.'),
    ).toBeTruthy()

    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: clipboardWriteText },
      configurable: true,
      writable: true,
    })
    fireEvent.click(screen.getByRole('button', { name: 'Copy Bcc' }))
    await waitFor(() => {
      expect(clipboardWriteText).toHaveBeenCalledWith(
        'parent.a@x.com; parent.b@x.com',
      )
    })

    const href =
      screen
        .getByRole('link', { name: 'Open in email' })
        .getAttribute('href') ?? ''
    const params = new URLSearchParams(href.slice(href.indexOf('?') + 1))
    expect(params.get('cc')).toBe('jane@hshb.org.uk')
    expect(params.get('bcc')).toBe('parent.a@x.com,parent.b@x.com')
    expect(href.startsWith('mailto:?')).toBe(true)
  })

  it('asks for a class before offering a mailto link', async () => {
    const user = userEvent.setup()
    render(<CommunicationPanel yearCode="2026-27" classes={[year3]} />)

    await user.click(screen.getByRole('radio', { name: /^by class/i }))

    expect(screen.queryByRole('link', { name: 'Open in email' })).toBeNull()
    expect(screen.getByText('Choose a class to fill Cc and Bcc.')).toBeTruthy()
    expect(screen.getByText('Active classes in 2026-27.')).toBeTruthy()
  })

  it('tells the user to copy when a mailto link would be too long', async () => {
    const user = userEvent.setup()
    const guardianEmails = Array.from(
      { length: 60 },
      (_, i) => `${'parent'.repeat(8)}${i}@example.com`,
    )
    render(
      <CommunicationPanel
        yearCode="2026-27"
        classes={[{ ...year3, guardianEmails }]}
      />,
    )

    await user.click(screen.getByRole('radio', { name: /^by class/i }))
    await user.selectOptions(screen.getByLabelText('Class'), 'class-1')

    expect(screen.queryByRole('link', { name: 'Open in email' })).toBeNull()
    expect(
      screen.getByText(
        'Too many addresses for an email link. Copy the fields into Outlook instead.',
      ),
    ).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Copy Bcc' })).toBeEnabled()
  })
})
