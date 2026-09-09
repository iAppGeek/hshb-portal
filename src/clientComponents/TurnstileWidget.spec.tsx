import { useEffect } from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'

function MockScript({ onLoad }: { onLoad?: () => void }) {
  useEffect(() => {
    onLoad?.()
  }, [onLoad])
  return null
}

vi.mock('next/script', () => ({
  default: MockScript,
}))

import TurnstileWidget from './TurnstileWidget'

beforeEach(() => {
  vi.clearAllMocks()
  delete (window as { turnstile?: unknown }).turnstile
})

describe('TurnstileWidget', () => {
  it('renders a container and calls window.turnstile.render on script load', () => {
    const mockRender = vi.fn()
    window.turnstile = { render: mockRender }

    render(<TurnstileWidget siteKey="test-site-key" onToken={vi.fn()} />)

    expect(mockRender).toHaveBeenCalledTimes(1)
    expect(mockRender.mock.calls[0][1]).toMatchObject({
      sitekey: 'test-site-key',
    })
  })

  it('forwards the token via the callback', () => {
    let capturedCallback: ((token: string) => void) | undefined
    window.turnstile = {
      render: (_el, options) => {
        capturedCallback = options.callback
        return 'widget-1'
      },
    }
    const onToken = vi.fn()

    render(<TurnstileWidget siteKey="test-site-key" onToken={onToken} />)
    capturedCallback?.('token-abc')

    expect(onToken).toHaveBeenCalledWith('token-abc')
  })

  it('reports null on expiry', () => {
    let capturedExpired: (() => void) | undefined
    window.turnstile = {
      render: (_el, options) => {
        capturedExpired = options['expired-callback']
        return 'widget-1'
      },
    }
    const onToken = vi.fn()

    render(<TurnstileWidget siteKey="test-site-key" onToken={onToken} />)
    capturedExpired?.()

    expect(onToken).toHaveBeenCalledWith(null)
  })

  it('reports null on error', () => {
    let capturedError: (() => void) | undefined
    window.turnstile = {
      render: (_el, options) => {
        capturedError = options['error-callback']
        return 'widget-1'
      },
    }
    const onToken = vi.fn()

    render(<TurnstileWidget siteKey="test-site-key" onToken={onToken} />)
    capturedError?.()

    expect(onToken).toHaveBeenCalledWith(null)
  })

  it('does nothing when window.turnstile is unavailable', () => {
    expect(() =>
      render(<TurnstileWidget siteKey="test-site-key" onToken={vi.fn()} />),
    ).not.toThrow()
  })
})
