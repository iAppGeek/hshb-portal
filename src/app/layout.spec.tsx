import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ReactElement } from 'react'

vi.mock('@/auth', () => ({
  auth: vi.fn(),
  signOut: vi.fn(),
}))

vi.mock('next/font/google', () => ({
  Inter: () => ({ variable: 'font-inter' }),
}))

vi.mock('@next/third-parties/google', () => ({
  GoogleAnalytics: () => null,
}))

import { auth } from '@/auth'

import RootLayout from './layout'

beforeEach(() => {
  vi.clearAllMocks()
})

// Renders <html>/<body> in jsdom, which already provides its own document
// element, so we call the async server component directly and inspect the
// returned React element tree instead of using RTL's render().
describe('RootLayout', () => {
  it('renders the sidebar chrome around children when a session exists', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { name: 'Alice', email: 'alice@test.com', role: 'admin' },
    } as never)

    const marker = <span data-testid="marker">Page</span>
    const html = (await RootLayout({ children: marker })) as ReactElement<{
      children: ReactElement[]
    }>
    const body = html.props.children[1] as ReactElement<{
      children: ReactElement[]
    }>
    const chromeWrapper = body.props.children[0] as ReactElement<{
      children: ReactElement[]
    }>

    expect(chromeWrapper.type).toBe('div')
    const main = chromeWrapper.props.children[2] as ReactElement<{
      children: ReactElement[]
    }>
    expect(main.type).toBe('main')
    expect(main.props.children[1]).toBe(marker)
  })

  it('renders bare children with no chrome when there is no session', async () => {
    vi.mocked(auth).mockResolvedValue(null as never)

    const marker = <span data-testid="marker">Page</span>
    const html = (await RootLayout({ children: marker })) as ReactElement<{
      children: ReactElement[]
    }>
    const body = html.props.children[1] as ReactElement<{
      children: [ReactElement, ...unknown[]]
    }>

    expect(body.props.children[0]).toBe(marker)
  })
})
