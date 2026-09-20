'use client'

import { useEffect } from 'react'

import { logError } from '@/lib/log'

export default function PwaRegistrar() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/sw.js', { scope: '/' })
        .catch((err: unknown) => logError('pwa.service-worker', err))
    }
  }, [])

  return null
}
