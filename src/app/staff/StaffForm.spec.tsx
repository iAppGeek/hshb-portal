import { describe, it, expect, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'

import { roleDescriptions } from '@/lib/roleLabels'

import StaffForm, { type StaffRow } from './StaffForm'

vi.mock('next/link', () => ({
  default: ({
    children,
    href,
  }: {
    children: React.ReactNode
    href: string
  }) => <a href={href}>{children}</a>,
}))

const staff: StaffRow = {
  id: 'staff-1',
  title: 'Mr',
  first_name: 'Alice',
  last_name: 'Smith',
  email: 'alice@school.com',
  role: 'headteacher',
  display_name: 'Ms Smith',
  contact_number: null,
  personal_email: null,
}

function value(label: RegExp): string {
  return (screen.getByLabelText(label) as HTMLInputElement).value
}

describe('StaffForm', () => {
  it('starts a new staff member blank with the default title', () => {
    render(<StaffForm action={vi.fn()} submitLabel="Add Staff Member" />)

    expect(value(/Title/)).toBe('Ms')
    expect(value(/First name/)).toBe('')
    expect(value(/Role/)).toBe('')
    expect(screen.queryByText(roleDescriptions.teacher)).toBeNull()
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual([
      'Select a role…',
      'Teacher',
      'Admin',
      'Headteacher',
      'Secretary',
    ])
  })

  it('describes the role once one is picked', () => {
    render(<StaffForm action={vi.fn()} submitLabel="Add Staff Member" />)

    fireEvent.change(screen.getByLabelText(/Role/), {
      target: { value: 'teacher' },
    })

    expect(screen.getByText(roleDescriptions.teacher)).toBeTruthy()
  })

  it('prefills an existing staff member and submits their details', async () => {
    const action = vi.fn().mockResolvedValue(undefined)
    render(
      <StaffForm initial={staff} action={action} submitLabel="Save changes" />,
    )

    expect(value(/Title/)).toBe('Mr')
    expect(value(/Email/)).toBe('alice@school.com')
    expect(value(/Display name/)).toBe('Ms Smith')
    expect(value(/Role/)).toBe('headteacher')
    expect(screen.getByText(roleDescriptions.headteacher)).toBeTruthy()

    const form = screen
      .getByRole('button', { name: 'Save changes' })
      .closest('form')
    if (!form) throw new Error('form not found')
    await act(async () => {
      fireEvent.submit(form)
    })

    const fd = action.mock.calls[0][0] as FormData
    expect(fd.get('role')).toBe('headteacher')
    expect(fd.get('first_name')).toBe('Alice')
  })
})
