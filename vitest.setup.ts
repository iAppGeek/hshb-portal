import '@testing-library/jest-dom'

// src/env.ts and src/env.server.ts parse process.env at import time — set
// dummy values so any test that transitively imports them doesn't fail.
process.env.AUTH_SECRET ??= 'test-auth-secret'
process.env.AZURE_AD_CLIENT_ID ??= 'test-client-id'
process.env.AZURE_AD_TENANT_ID ??= 'test-tenant-id'
process.env.AZURE_AD_CLIENT_SECRET ??= 'test-client-secret'
process.env.NEXT_PUBLIC_SUPABASE_URL ??= 'http://127.0.0.1:54321'
process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'test-service-role-key'
process.env.VAPID_PRIVATE_KEY ??= 'test-vapid-private-key'
process.env.VAPID_SUBJECT ??= 'mailto:test@example.com'
process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ??= 'test-vapid-public-key'
process.env.TURNSTILE_SECRET_KEY ??= 'test-turnstile-secret'
process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ??= 'test-turnstile-site-key'

// @headlessui/react Menu (floating UI) uses ResizeObserver in tests.
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}

// jsdom doesn't implement scrollIntoView.
if (typeof Element.prototype.scrollIntoView !== 'function') {
  Element.prototype.scrollIntoView = () => {}
}

// vitest's coverage runner passes --localstorage-file to jsdom without a valid
// path, which leaves window.localStorage as a broken stub with no methods.
// Provide a real in-memory implementation so every test file has a working localStorage.
if (typeof window.localStorage.getItem !== 'function') {
  const store: Record<string, string> = {}
  Object.defineProperty(window, 'localStorage', {
    value: {
      getItem: (key: string) => store[key] ?? null,
      setItem: (key: string, value: string) => {
        store[key] = value
      },
      removeItem: (key: string) => {
        delete store[key]
      },
      clear: () => {
        Object.keys(store).forEach((k) => delete store[k])
      },
      get length() {
        return Object.keys(store).length
      },
      key: (i: number) => Object.keys(store)[i] ?? null,
    } satisfies Storage,
    writable: true,
  })
}
