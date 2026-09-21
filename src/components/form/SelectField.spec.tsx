import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'

import SelectField from './SelectField'

const options = [
  { value: 'a', label: 'Option A' },
  { value: 'b', label: 'Option B' },
]

describe('SelectField', () => {
  it('renders the label and options', () => {
    render(<SelectField label="Choice" name="choice" options={options} />)
    expect(screen.getByRole('option', { name: 'Option A' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Option B' })).toBeInTheDocument()
  })

  it('renders a placeholder option when given', () => {
    render(
      <SelectField
        label="Choice"
        name="choice"
        options={options}
        placeholder="Select…"
      />,
    )
    expect(screen.getByRole('option', { name: 'Select…' })).toHaveValue('')
  })

  it('omits the placeholder option when not given', () => {
    render(<SelectField label="Choice" name="choice" options={options} />)
    expect(screen.queryByRole('option', { name: '' })).not.toBeInTheDocument()
  })

  it('treats a null defaultValue as an empty selection', () => {
    render(
      <SelectField
        label="Choice"
        name="choice"
        options={options}
        defaultValue={null}
        placeholder="Select…"
      />,
    )
    expect(screen.getByLabelText('Choice')).toHaveValue('')
  })

  it('marks aria-invalid and shows the error message', () => {
    render(
      <SelectField
        label="Choice"
        name="choice"
        options={options}
        error="Required"
      />,
    )
    const select = screen.getByLabelText('Choice')
    expect(select).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByText('Required')).toBeInTheDocument()
  })

  it('is controlled when given a value, reporting changes via onChange', () => {
    const onChange = vi.fn()
    render(
      <SelectField
        label="Choice"
        name="choice"
        options={options}
        value="b"
        onChange={onChange}
      />,
    )
    const select = screen.getByLabelText('Choice')
    expect(select).toHaveValue('b')
    fireEvent.change(select, { target: { value: 'a' } })
    expect(onChange).toHaveBeenCalledWith('a')
  })

  it('disables the placeholder option only when required', () => {
    const { rerender } = render(
      <SelectField
        label="Choice"
        name="choice"
        options={options}
        placeholder="Select…"
        required
      />,
    )
    expect(screen.getByRole('option', { name: 'Select…' })).toBeDisabled()

    rerender(
      <SelectField
        label="Choice"
        name="choice"
        options={options}
        placeholder="Select…"
      />,
    )
    expect(screen.getByRole('option', { name: 'Select…' })).toBeEnabled()
  })
})
