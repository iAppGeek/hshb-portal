import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

import RadioGroup from './RadioGroup'

const options = [
  { value: 'guardian', label: 'Same as guardian' },
  { value: 'own', label: 'Enter address' },
]

describe('RadioGroup', () => {
  it('renders the legend and options, checking the current value', () => {
    render(
      <RadioGroup
        name="address_mode"
        legend="Address"
        options={options}
        value="guardian"
        onChange={vi.fn()}
      />,
    )
    expect(screen.getByText('Address')).toBeInTheDocument()
    expect(screen.getByLabelText('Same as guardian')).toBeChecked()
    expect(screen.getByLabelText('Enter address')).not.toBeChecked()
  })

  it('calls onChange with the selected value', () => {
    const onChange = vi.fn()
    render(
      <RadioGroup
        name="address_mode"
        legend="Address"
        options={options}
        value="guardian"
        onChange={onChange}
      />,
    )
    fireEvent.click(screen.getByLabelText('Enter address'))
    expect(onChange).toHaveBeenCalledWith('own')
  })
})
