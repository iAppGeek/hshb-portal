import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

import type { FeePlanWithClasses } from '@/db'

import FeePlanForm from './FeePlanForm'

const YEAR_A = { id: 'year-a', code: '2025-26' }
const YEAR_B = { id: 'year-b', code: '2026-27' }
const years = [YEAR_A, YEAR_B]

const classes = [
  {
    id: 'c1',
    name: 'Alpha',
    year_group: 'Year 1',
    academic_year_id: YEAR_A.id,
  },
  { id: 'c2', name: 'Beta', year_group: 'Year 2', academic_year_id: YEAR_A.id },
  {
    id: 'c3',
    name: 'Gamma',
    year_group: 'Year 3',
    academic_year_id: YEAR_B.id,
  },
]

const plan: FeePlanWithClasses = {
  id: 'p1',
  name: 'Standard',
  academic_year: {
    ...YEAR_A,
    start_date: '2025-09-01',
    end_date: '2026-08-31',
  },
  full_year_amount: 800,
  monthly_instalment_amount: 100,
  termly_instalment_amount: 266.67,
  notes: 'Main plan',
  active: false,
  created_at: '',
  updated_at: '',
  class_ids: ['c1'],
}

function checkbox(name: string): HTMLInputElement {
  return screen.getByRole('checkbox', {
    name: new RegExp(`^${name}`),
  }) as HTMLInputElement
}

describe('FeePlanForm', () => {
  it('shows a note when the chosen year has no classes', () => {
    render(
      <FeePlanForm
        plan={null}
        classes={[]}
        years={years}
        defaultAcademicYearId={YEAR_A.id}
        takenBy={{}}
        action={vi.fn()}
        submitLabel="Add fee plan"
      />,
    )

    expect(screen.getByText('No classes in this academic year.')).toBeTruthy()
    expect((screen.getByLabelText('Active') as HTMLInputElement).checked).toBe(
      true,
    )
  })

  it('shows only classes from the chosen year', () => {
    render(
      <FeePlanForm
        plan={null}
        classes={classes}
        years={years}
        defaultAcademicYearId={YEAR_A.id}
        takenBy={{ c2: 'Sibling (2025-26)' }}
        action={vi.fn()}
        submitLabel="Add fee plan"
      />,
    )

    expect(checkbox('Alpha').disabled).toBe(false)
    expect(checkbox('Beta').disabled).toBe(true)
    expect(screen.getByText('On Sibling (2025-26)')).toBeTruthy()
    expect(screen.queryByRole('checkbox', { name: /Gamma/ })).toBeNull()
  })

  it('switches the class list when the academic year changes', () => {
    render(
      <FeePlanForm
        plan={null}
        classes={classes}
        years={years}
        defaultAcademicYearId={YEAR_A.id}
        takenBy={{}}
        action={vi.fn()}
        submitLabel="Add fee plan"
      />,
    )

    fireEvent.change(screen.getByLabelText(/Academic year/), {
      target: { value: YEAR_B.id },
    })

    expect(screen.getByRole('checkbox', { name: /Gamma/ })).toBeTruthy()
    expect(screen.queryByRole('checkbox', { name: /Alpha/ })).toBeNull()
  })

  it('prefills an existing plan', () => {
    render(
      <FeePlanForm
        plan={plan}
        classes={classes}
        years={years}
        takenBy={{}}
        action={vi.fn()}
        submitLabel="Save changes"
      />,
    )

    expect((screen.getByLabelText(/Name/) as HTMLInputElement).value).toBe(
      'Standard',
    )
    expect(
      (screen.getByLabelText(/Academic year/) as HTMLSelectElement).value,
    ).toBe(YEAR_A.id)
    expect(
      (screen.getByLabelText(/Termly instalment/) as HTMLInputElement).value,
    ).toBe('266.67')
    expect(
      (screen.getByLabelText(/Full year amount/) as HTMLInputElement).value,
    ).toBe('800.00')
    expect((screen.getByLabelText('Notes') as HTMLTextAreaElement).value).toBe(
      'Main plan',
    )
    expect((screen.getByLabelText('Active') as HTMLInputElement).checked).toBe(
      false,
    )
    expect(checkbox('Alpha').checked).toBe(true)
    expect(checkbox('Beta').checked).toBe(false)
  })

  it('submits selected classes and shows an action error', async () => {
    const action = vi.fn().mockResolvedValue({ error: 'Duplicate name' })
    render(
      <FeePlanForm
        plan={plan}
        classes={classes}
        years={years}
        takenBy={{}}
        action={action}
        submitLabel="Save changes"
      />,
    )

    fireEvent.click(checkbox('Beta'))
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toBe('Duplicate name'),
    )
    const fd = action.mock.calls[0][0] as FormData
    expect(fd.getAll('class_ids')).toEqual(['c1', 'c2'])
    expect(fd.get('academic_year_id')).toBe(YEAR_A.id)
    expect(fd.get('active')).toBeNull()
  })
})
