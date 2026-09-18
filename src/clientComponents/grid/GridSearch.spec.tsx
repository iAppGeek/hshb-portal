import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

import GridSearch from './GridSearch'

describe('GridSearch', () => {
  it('renders the placeholder and aria-label', () => {
    render(
      <GridSearch
        value=""
        onChange={() => {}}
        placeholder="Search students…"
        label="Search students"
      />,
    )
    expect(screen.getByPlaceholderText('Search students…')).toBeTruthy()
    expect(
      screen.getByRole('searchbox', { name: 'Search students' }),
    ).toBeTruthy()
  })

  it('calls onChange with the new value', () => {
    const onChange = vi.fn()
    render(
      <GridSearch
        value=""
        onChange={onChange}
        placeholder="Search…"
        label="Search"
      />,
    )
    fireEvent.change(screen.getByRole('searchbox'), {
      target: { value: 'ada' },
    })
    expect(onChange).toHaveBeenCalledWith('ada')
  })

  it('reflects the current value', () => {
    render(
      <GridSearch
        value="ada"
        onChange={() => {}}
        placeholder="Search…"
        label="Search"
      />,
    )
    expect(screen.getByRole('searchbox')).toHaveValue('ada')
  })
})
