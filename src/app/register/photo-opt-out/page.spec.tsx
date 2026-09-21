import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { vi } from 'vitest'

import PhotoOptOutPage, { metadata } from './page'

const mockEnv = vi.hoisted(() => ({
  client: { NEXT_PUBLIC_TURNSTILE_SITE_KEY: 'test-site-key' as string },
}))

vi.mock('@/env', () => ({ env: mockEnv }))

vi.mock('./PhotoOptOutForm', () => ({
  default: ({ turnstileSiteKey }: { turnstileSiteKey: string }) => (
    <div data-testid="photo-opt-out-form">{turnstileSiteKey}</div>
  ),
}))

beforeEach(() => {
  vi.clearAllMocks()
  mockEnv.client.NEXT_PUBLIC_TURNSTILE_SITE_KEY = 'test-site-key'
})

describe('PhotoOptOutPage', () => {
  it('renders the form when a site key is configured', () => {
    render(<PhotoOptOutPage />)

    expect(screen.getByTestId('photo-opt-out-form').textContent).toBe(
      'test-site-key',
    )
  })

  it('shows an unavailable notice when the site key is missing', () => {
    mockEnv.client.NEXT_PUBLIC_TURNSTILE_SITE_KEY = ''

    render(<PhotoOptOutPage />)

    expect(
      screen.getByText(/This form is temporarily unavailable/),
    ).toBeTruthy()
    expect(screen.queryByTestId('photo-opt-out-form')).toBeNull()
  })

  it('sets metadata to keep the form unindexed', () => {
    expect(metadata.robots).toEqual({ index: false, follow: false })
  })
})
