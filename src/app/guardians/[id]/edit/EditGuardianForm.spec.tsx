import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'

vi.mock('./actions', () => ({
  updateGuardianAction: vi.fn(),
}))

vi.mock('next/link', () => ({
  default: ({
    children,
    href,
  }: {
    children: React.ReactNode
    href: string
  }) => <a href={href}>{children}</a>,
}))

import type { GuardianFull } from '@/db'

import EditGuardianForm from './EditGuardianForm'

beforeEach(() => {
  vi.clearAllMocks()
})

const guardian: GuardianFull = {
  id: 'guardian-1',
  first_name: 'Maria',
  last_name: 'Smith',
  phone: '07700 900000',
  email: 'maria@example.com',
  occupation: 'Teacher',
  address_line_1: null,
  address_line_2: null,
  city: null,
  postcode: null,
  notes: null,
}

function renderForm(overrides: Partial<GuardianFull> = {}) {
  return render(
    <EditGuardianForm
      guardian={{ ...guardian, ...overrides }}
      linkedStudents={[]}
    />,
  )
}

describe('EditGuardianForm', () => {
  it('pre-fills the occupation', () => {
    const { container } = renderForm()
    const input = container.querySelector(
      'input[name="occupation"]',
    ) as HTMLInputElement
    expect(input.value).toBe('Teacher')
  })

  // This page edits a guardian in isolation and cannot tell a parent from an
  // emergency contact, so it must never block an unrelated edit.
  it('does not require an occupation', () => {
    const { container } = renderForm()
    const input = container.querySelector(
      'input[name="occupation"]',
    ) as HTMLInputElement
    expect(input.required).toBe(false)
  })

  it('renders an empty occupation for a guardian recorded before the field existed', () => {
    const { container } = renderForm({ occupation: null })
    const input = container.querySelector(
      'input[name="occupation"]',
    ) as HTMLInputElement
    expect(input.value).toBe('')
  })
})
