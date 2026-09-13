import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'

import FinanceTabBar from './FinanceTabBar'

describe('FinanceTabBar', () => {
  it('links to each finance tab', () => {
    render(<FinanceTabBar currentTab="staff" />)

    expect(
      screen.getByRole('link', { name: 'Staff' }).getAttribute('href'),
    ).toBe('/finance?tab=staff')
    expect(
      screen.getByRole('link', { name: 'Students' }).getAttribute('href'),
    ).toBe('/finance?tab=students')
    expect(
      screen.getByRole('link', { name: 'Fee Plans' }).getAttribute('href'),
    ).toBe('/finance?tab=fee-plans')
  })

  it('marks only the current tab', () => {
    render(<FinanceTabBar currentTab="fee-plans" />)

    expect(
      screen
        .getByRole('link', { name: 'Fee Plans' })
        .getAttribute('aria-current'),
    ).toBe('page')
    expect(
      screen.getByRole('link', { name: 'Staff' }).getAttribute('aria-current'),
    ).toBeNull()
  })
})
