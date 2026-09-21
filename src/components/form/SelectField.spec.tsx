import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'

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
})
