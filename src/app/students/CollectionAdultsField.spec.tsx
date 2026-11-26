import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'

import type { CollectionAdult } from '@/db/schema'

import CollectionAdultsField from './CollectionAdultsField'

function renderField(
  initial?: CollectionAdult[],
  errors: Record<string, string> = {},
): ReturnType<typeof render> {
  return render(
    <CollectionAdultsField
      initial={initial}
      fieldError={(name) => errors[name]}
    />,
  )
}

function nameInputs(container: HTMLElement): HTMLInputElement[] {
  return [
    ...container.querySelectorAll<HTMLInputElement>('input[name$="_name"]'),
  ]
}

describe('CollectionAdultsField', () => {
  it('says when no adults are listed', () => {
    renderField()
    expect(
      screen.getByText('No other adults are allowed to collect this student.'),
    ).toBeInTheDocument()
  })

  it('adds rows whose fields are named by position', () => {
    const { container } = renderField()

    fireEvent.click(screen.getByRole('button', { name: '+ Add adult' }))
    fireEvent.click(screen.getByRole('button', { name: '+ Add adult' }))

    expect(screen.getAllByRole('group')).toHaveLength(2)
    expect(nameInputs(container).map((input) => input.name)).toEqual([
      'collection_adult_0_name',
      'collection_adult_1_name',
    ])
    expect(
      container.querySelector('input[name="collection_adult_1_phone"]'),
    ).toHaveAttribute('type', 'tel')
    expect(
      container.querySelector('input[name="collection_adult_1_relationship"]'),
    ).toBeInTheDocument()
    expect(nameInputs(container)[0]).toBeRequired()
  })

  it('pre-fills the adults already recorded', () => {
    renderField([
      { name: 'Eleni Georgiou', relationship: 'Aunt', phone: '07700 900002' },
    ])

    const row = screen.getByRole('group', { name: 'Adult 1' })
    expect(within(row).getByLabelText(/Full name/)).toHaveValue(
      'Eleni Georgiou',
    )
    expect(within(row).getByLabelText('Relationship to student')).toHaveValue(
      'Aunt',
    )
    expect(within(row).getByLabelText('Phone')).toHaveValue('07700 900002')
  })

  it('removing a row keeps the others and renumbers them', () => {
    const { container } = renderField([
      { name: 'Eleni Georgiou', relationship: null, phone: null },
      { name: 'Kostas Ioannou', relationship: null, phone: null },
    ])

    fireEvent.click(screen.getByRole('button', { name: 'Remove adult 1' }))

    const inputs = nameInputs(container)
    expect(inputs).toHaveLength(1)
    expect(inputs[0]).toHaveValue('Kostas Ioannou')
    expect(inputs[0].name).toBe('collection_adult_0_name')
    expect(screen.getByRole('group', { name: 'Adult 1' })).toBeInTheDocument()
  })

  it('shows the error for each field by its position', () => {
    renderField([{ name: '', relationship: null, phone: '12' }], {
      collection_adult_0_phone: 'Phone number is too short',
    })

    expect(screen.getByText('Phone number is too short')).toBeInTheDocument()
    expect(screen.getByLabelText('Phone')).toHaveAttribute(
      'aria-invalid',
      'true',
    )
  })
})
