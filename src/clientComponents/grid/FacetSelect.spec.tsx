import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

import FacetSelect from './FacetSelect'

const options = [
  { value: 'a', label: 'Class A' },
  { value: 'b', label: 'Class B' },
]

describe('FacetSelect', () => {
  it('renders a placeholder option plus every option', () => {
    render(
      <FacetSelect
        value=""
        onChange={() => {}}
        label="Filter by class"
        placeholderOption="All classes"
        options={options}
      />,
    )
    const select = screen.getByRole('combobox', { name: 'Filter by class' })
    expect(select).toHaveValue('')
    expect(screen.getByRole('option', { name: 'All classes' })).toBeTruthy()
    expect(screen.getByRole('option', { name: 'Class A' })).toBeTruthy()
    expect(screen.getByRole('option', { name: 'Class B' })).toBeTruthy()
  })

  it('calls onChange with the selected value', () => {
    const onChange = vi.fn()
    render(
      <FacetSelect
        value=""
        onChange={onChange}
        label="Filter by class"
        placeholderOption="All classes"
        options={options}
      />,
    )
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'b' } })
    expect(onChange).toHaveBeenCalledWith('b')
  })
})
