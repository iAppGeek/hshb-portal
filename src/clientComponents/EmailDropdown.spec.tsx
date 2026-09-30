import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import EmailDropdown from './EmailDropdown'

describe('EmailDropdown', () => {
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

  it('renders disabled trigger when there are no emails in a single group', () => {
    render(
      <EmailDropdown
        groups={[{ emails: [], mailtoHref: null }]}
        buttonLabel="Email class"
        triggerClassName="rounded border px-2"
      />,
    )
    expect(screen.getByText('Email class')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /email class/i })).toBeNull()
  })

  it('opens menu and copies semicolon-separated emails for a single unlabelled group', async () => {
    render(
      <EmailDropdown
        groups={[
          { emails: ['a@x.com', 'b@x.com'], mailtoHref: 'mailto:?bcc=a,b' },
        ]}
        buttonLabel="Email class"
        triggerClassName="text-sm"
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /email class/i }))
    await screen.findByRole('menu')
    const copyItem = screen.getByRole('menuitem', { name: 'Copy emails' })
    fireEvent.click(copyItem)

    await waitFor(() => {
      expect(clipboardWriteText).toHaveBeenCalledWith('a@x.com; b@x.com')
    })
  })

  it('renders mailto link when href is set for a single group', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    const href = 'mailto:?bcc=test%40x.com'

    render(
      <EmailDropdown
        groups={[{ emails: ['test@x.com'], mailtoHref: href }]}
        buttonLabel="Email"
        triggerClassName="text-sm"
      />,
    )

    await user.click(screen.getByRole('button', { name: /^email$/i }))
    const item = await screen.findByRole('menuitem', {
      name: /open in default email app/i,
    })
    expect(item.getAttribute('href')).toBe(href)
  })

  it('renders disabled trigger when all groups are empty', () => {
    render(
      <EmailDropdown
        groups={[
          { label: 'Teachers & headteachers', emails: [], mailtoHref: null },
          { label: 'All staff', emails: [], mailtoHref: null },
        ]}
        buttonLabel="Email staff"
        triggerClassName="rounded border px-2"
      />,
    )
    expect(screen.getByText('Email staff')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /email staff/i })).toBeNull()
  })

  it('copies from the correct section when there are two labelled groups', async () => {
    render(
      <EmailDropdown
        groups={[
          {
            label: 'Teachers & headteachers',
            emails: ['t@school.com'],
            mailtoHref: 'mailto:?bcc=t%40school.com',
          },
          {
            label: 'All staff',
            emails: ['t@school.com', 'a@school.com'],
            mailtoHref: 'mailto:?bcc=',
          },
        ]}
        buttonLabel="Email staff"
        triggerClassName="text-sm"
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /email staff/i }))
    await screen.findByRole('menu')
    const copyItems = screen.getAllByRole('menuitem', { name: 'Copy emails' })
    expect(copyItems.length).toBe(2)
    fireEvent.click(copyItems[0]!)

    await waitFor(() => {
      expect(clipboardWriteText).toHaveBeenCalledWith('t@school.com')
    })
  })

  it('exposes mailto per group when href is set', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    const href = 'mailto:?bcc=all%40x.com'

    render(
      <EmailDropdown
        groups={[
          {
            label: 'Teachers & headteachers',
            emails: ['t@x.com'],
            mailtoHref: 'mailto:?bcc=t',
          },
          { label: 'All staff', emails: ['all@x.com'], mailtoHref: href },
        ]}
        buttonLabel="Email staff"
        triggerClassName="text-sm"
      />,
    )

    await user.click(screen.getByRole('button', { name: /email staff/i }))
    const openItems = screen.getAllByRole('menuitem', {
      name: /open in default email app/i,
    })
    expect(openItems.length).toBe(2)
    expect(openItems[1]!.getAttribute('href')).toBe(href)
  })
})
