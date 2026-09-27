import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'

import { workflowItems } from './workflowItems'

const pending = {
  submitted_at: '2026-09-01T10:00:00Z',
  status: 'pending',
  actioned_at: null,
  student_id: null,
  rejected_reason: null,
}

describe('workflowItems', () => {
  it('lists only submitted and status while pending', () => {
    expect(workflowItems(pending).map((i) => i.label)).toEqual([
      'Submitted',
      'Status',
    ])
  })

  it('adds the actioned time and a student link once actioned', () => {
    const items = workflowItems({
      ...pending,
      status: 'actioned',
      actioned_at: '2026-09-02T10:00:00Z',
      student_id: 'student-1',
    })
    expect(items.map((i) => i.label)).toEqual([
      'Submitted',
      'Status',
      'Actioned',
      'Student',
    ])

    render(<>{items[3].value}</>)
    expect(
      screen.getByRole('link', { name: 'View student' }).getAttribute('href'),
    ).toBe('/students/student-1/edit')
  })

  it('adds the rejected reason when present', () => {
    const items = workflowItems({
      ...pending,
      status: 'rejected',
      rejected_reason: 'Duplicate',
    })
    expect(items.at(-1)).toEqual({
      label: 'Rejected reason',
      value: 'Duplicate',
    })
  })
})
