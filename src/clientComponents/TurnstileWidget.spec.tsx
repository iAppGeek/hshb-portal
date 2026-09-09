import { useEffect } from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'

let mockScriptMode: 'load' | 'error' | 'pending' = 'load'

function MockScript({
  onLoad,
  onError,
}: {
  onLoad?: () => void
  onError?: () => void
}) {
  useEffect(() => {
    if (mockScriptMode === 'load') onLoad?.()
    else if (mockScriptMode === 'error') onError?.()
    // 'pending': never settles, simulating a script that hangs.
  }, [onLoad, onError])
  return null
}

vi.mock('next/script', () => ({
  default: MockScript,
}))

import TurnstileWidget from './TurnstileWidget'

beforeEach(() => {
  vi.clearAllMocks()
  mockScriptMode = 'load'
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

  it('reports an error when window.turnstile is unavailable after script load', () => {
    const onError = vi.fn()

    render(
      <TurnstileWidget
        siteKey="test-site-key"
        onToken={vi.fn()}
        onError={onError}
      />,
    )

    expect(onError).toHaveBeenCalledTimes(1)
  })

  it('reports an error and clears the token when the widget errors', () => {
    let capturedError: (() => void) | undefined
    window.turnstile = {
      render: (_el, options) => {
        capturedError = options['error-callback']
        return 'widget-1'
      },
    }
    const onToken = vi.fn()
    const onError = vi.fn()

    render(
      <TurnstileWidget
        siteKey="test-site-key"
        onToken={onToken}
        onError={onError}
      />,
    )
    capturedError?.()

    expect(onToken).toHaveBeenCalledWith(null)
    expect(onError).toHaveBeenCalledTimes(1)
  })

  it('reports an error when the Turnstile script itself fails to load', () => {
    mockScriptMode = 'error'
    const onError = vi.fn()

    render(
      <TurnstileWidget
        siteKey="test-site-key"
        onToken={vi.fn()}
        onError={onError}
      />,
    )

    expect(onError).toHaveBeenCalledTimes(1)
  })

  it('reports an error if the widget never renders within the load timeout', () => {
    vi.useFakeTimers()
    mockScriptMode = 'pending'
    const onError = vi.fn()

    render(
      <TurnstileWidget
        siteKey="test-site-key"
        onToken={vi.fn()}
        onError={onError}
      />,
    )
    expect(onError).not.toHaveBeenCalled()

    vi.advanceTimersByTime(8000)
    expect(onError).toHaveBeenCalledTimes(1)

    vi.useRealTimers()
  })
})
