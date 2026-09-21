import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

import ErrorPage from './error'

describe('ErrorPage', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    consoleSpy.mockRestore()
  })

  it('renders an error heading', () => {
    render(<ErrorPage error={new Error('boom')} reset={() => {}} />)
    expect(
      screen.getByRole('heading', { name: /something went wrong/i }),
    ).toBeTruthy()
  })

  it('logs the error via console.error', () => {
    const error = new Error('boom')
    render(<ErrorPage error={error} reset={() => {}} />)
    expect(consoleSpy).toHaveBeenCalledWith(error)
  })

  it('calls reset when "Try again" is clicked', () => {
    const reset = vi.fn()
    render(<ErrorPage error={new Error('boom')} reset={reset} />)
    fireEvent.click(screen.getByRole('button', { name: /try again/i }))
    expect(reset).toHaveBeenCalled()
  })

  it('links back to the dashboard', () => {
    render(<ErrorPage error={new Error('boom')} reset={() => {}} />)
    const link = screen.getByRole('link', { name: /back to dashboard/i })
    expect(link.getAttribute('href')).toBe('/dashboard')
  })
})
