import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'

import { getAllClasses } from '@/db'

import RegisterPage, { metadata } from './page'

vi.mock('@/db', () => ({
  getAllClasses: vi.fn(),
}))

vi.mock('./RegistrationForm', () => ({
  default: ({ yearGroups }: { yearGroups: string[] }) => (
    <div data-testid="registration-form">{yearGroups.join(',')}</div>
  ),
}))

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  delete process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY
})

describe('RegisterPage', () => {
  it('derives year groups from active classes and renders the form', async () => {
    process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = 'test-site-key'
    vi.mocked(getAllClasses).mockResolvedValue([
      { year_group: 'Year 2' },
      { year_group: 'Year 1' },
      { year_group: 'Year 1' },
    ] as never)

    render(await RegisterPage())

    expect(screen.getByTestId('registration-form').textContent).toBe(
      'Year 1,Year 2',
    )
  })

  it('shows an unavailable notice when the site key is missing', async () => {
    delete process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY
    vi.mocked(getAllClasses).mockResolvedValue([])

    render(await RegisterPage())

    expect(
      screen.getByText(/Registration is temporarily unavailable/),
    ).toBeTruthy()
    expect(screen.queryByTestId('registration-form')).toBeNull()
  })

  it('sets metadata to index the public form', () => {
    expect(metadata.robots).toEqual({ index: true, follow: true })
  })
})
