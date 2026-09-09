'use client'

import { useEffect, useRef } from 'react'
import Script from 'next/script'

type Props = {
  siteKey: string
  onToken: (token: string | null) => void
  /** Called if the widget fails to load or render, e.g. the script is
   * blocked by a network filter or ad-blocker. */
  onError?: () => void
}

const LOAD_TIMEOUT_MS = 8000

export default function TurnstileWidget({ siteKey, onToken, onError }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const renderedRef = useRef(false)

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (!renderedRef.current) onError?.()
    }, LOAD_TIMEOUT_MS)
    return () => window.clearTimeout(timer)
  }, [onError])

  function renderWidget() {
    if (!containerRef.current || !window.turnstile) {
      onError?.()
      return
    }
    renderedRef.current = true
    window.turnstile.render(containerRef.current, {
      sitekey: siteKey,
      callback: (token) => onToken(token),
      'expired-callback': () => onToken(null),
      'error-callback': () => {
        onToken(null)
        onError?.()
      },
    })
  }

  return (
    <>
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js"
        strategy="afterInteractive"
        onLoad={renderWidget}
        onError={() => onError?.()}
      />
      <div ref={containerRef} />
    </>
  )
}
