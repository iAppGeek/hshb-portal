import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'

import FinanceTabBar from './FinanceTabBar'

describe('FinanceTabBar', () => {
  it('links to each finance tab, keeping the selected year', () => {
    render(<FinanceTabBar currentTab="students" yearId="year-1" />)

    expect(
      screen.getByRole('link', { name: 'Students' }).getAttribute('href'),
    ).toBe('/finance?tab=students&year=year-1')
    expect(
      screen.getByRole('link', { name: 'Fee Plans' }).getAttribute('href'),
    ).toBe('/finance?tab=fee-plans&year=year-1')
  })

  it('has no staff tab', () => {
    render(<FinanceTabBar currentTab="students" yearId="year-1" />)

    expect(screen.queryByRole('link', { name: 'Staff' })).toBeNull()
  })

  it('marks only the current tab', () => {
    render(<FinanceTabBar currentTab="fee-plans" yearId="year-1" />)

    expect(
      screen
        .getByRole('link', { name: 'Fee Plans' })
        .getAttribute('aria-current'),
    ).toBe('page')
    expect(
      screen
        .getByRole('link', { name: 'Students' })
        .getAttribute('aria-current'),
    ).toBeNull()
  })
})
