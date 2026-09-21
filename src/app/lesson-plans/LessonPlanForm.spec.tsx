import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

import type { LessonPlanRow } from '@/db'

import LessonPlanForm from './LessonPlanForm'

const classes = [
  { id: 'class-1', name: 'Year 1A', year_group: 'Year 1' },
  { id: 'class-2', name: 'Year 2B', year_group: 'Year 2' },
]

const plan = {
  id: 'plan-1',
  class_id: 'class-1',
  lesson_date: '2026-03-21',
  description: 'Phonics lesson',
  class: { id: 'class-1', name: 'Year 1A', year_group: 'Year 1' },
} as LessonPlanRow

describe('LessonPlanForm', () => {
  it('lets a new plan pick its class', () => {
    render(
      <LessonPlanForm
        classes={classes}
        action={vi.fn()}
        submitLabel="Add Lesson Plan"
      />,
    )

    const select = screen.getByLabelText(/Class/) as HTMLSelectElement
    expect(select.tagName).toBe('SELECT')
    expect(select.value).toBe('')
    expect(screen.getByRole('button', { name: 'Add Lesson Plan' })).toBeTruthy()
  })

  it('preselects the class when there is only one', () => {
    render(
      <LessonPlanForm
        classes={[classes[0]]}
        action={vi.fn()}
        submitLabel="Add Lesson Plan"
      />,
    )

    expect((screen.getByLabelText(/Class/) as HTMLSelectElement).value).toBe(
      'class-1',
    )
  })

  it('shows the class read-only and prefills the plan when editing', () => {
    const { container } = render(
      <LessonPlanForm
        initial={plan}
        classes={[]}
        action={vi.fn()}
        submitLabel="Save changes"
      />,
    )

    expect(container.querySelector('[name="class_id"]')).toBeNull()
    expect(screen.getByText('Year 1A (Year 1)')).toBeTruthy()
    expect(
      (screen.getByLabelText(/Lesson date/) as HTMLInputElement).value,
    ).toBe('2026-03-21')
    expect(
      (screen.getByLabelText(/Lesson description/) as HTMLTextAreaElement)
        .value,
    ).toBe('Phonics lesson')
  })

  it('shows the error the action returns', async () => {
    const action = vi.fn().mockResolvedValue({
      error: 'A lesson plan already exists for this class on this date.',
    })
    render(
      <LessonPlanForm
        initial={plan}
        classes={[]}
        action={action}
        submitLabel="Save changes"
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toBe(
        'A lesson plan already exists for this class on this date.',
      ),
    )
    const fd = action.mock.calls[0][0] as FormData
    expect(fd.get('description')).toBe('Phonics lesson')
  })
})
