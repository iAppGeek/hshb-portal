import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

vi.mock('next/link', () => ({
  default: ({
    children,
    href,
  }: {
    children: React.ReactNode
    href: string
  }) => <a href={href}>{children}</a>,
}))

import GuardiansTable from './GuardiansTable'

beforeEach(() => {
  vi.clearAllMocks()
})

const guardians = [
  {
    id: 'guardian-1',
    first_name: 'Gary',
    last_name: 'AliceGuardian',
    phone: '07711000001',
    email: 'gary.alice@example.com',
    child_count: 2,
  },
  {
    id: 'guardian-2',
    first_name: 'Grace',
    last_name: 'BobGuardian',
    phone: '07711000002',
    email: null,
    child_count: 1,
  },
]

describe('GuardiansTable', () => {
  it('renders all guardian names', () => {
    render(<GuardiansTable guardians={guardians} />)
    expect(screen.getByText('AliceGuardian, Gary')).toBeTruthy()
    expect(screen.getByText('BobGuardian, Grace')).toBeTruthy()
  })

  it('renders emails, dashing out a missing one', () => {
    render(<GuardiansTable guardians={guardians} />)
    expect(
      screen.getAllByText('gary.alice@example.com').length,
    ).toBeGreaterThan(0)
    expect(screen.getAllByText('—').length).toBeGreaterThan(0)
  })

  it('renders child counts', () => {
    render(<GuardiansTable guardians={guardians} />)
    expect(screen.getAllByText('2').length).toBeGreaterThan(0)
    expect(screen.getAllByText('1').length).toBeGreaterThan(0)
  })

  it('renders View and Edit links with correct hrefs', () => {
    render(<GuardiansTable guardians={guardians} />)
    const viewLinks = screen.getAllByText('View')
    const editLinks = screen.getAllByText('Edit')
    expect(
      viewLinks.some((l) => l.getAttribute('href') === '/guardians/guardian-1'),
    ).toBe(true)
    expect(
      editLinks.some(
        (l) => l.getAttribute('href') === '/guardians/guardian-1/edit',
      ),
    ).toBe(true)
  })

  it('filters by first name', () => {
    render(<GuardiansTable guardians={guardians} />)
    fireEvent.change(screen.getByPlaceholderText(/Search by name/), {
      target: { value: 'gary' },
    })
    expect(screen.getByText('AliceGuardian, Gary')).toBeTruthy()
    expect(screen.queryByText('BobGuardian, Grace')).toBeNull()
  })

  it('filters by last name', () => {
    render(<GuardiansTable guardians={guardians} />)
    fireEvent.change(screen.getByPlaceholderText(/Search by name/), {
      target: { value: 'BobGuardian' },
    })
    expect(screen.queryByText('AliceGuardian, Gary')).toBeNull()
    expect(screen.getByText('BobGuardian, Grace')).toBeTruthy()
  })

  it('filters by email', () => {
    render(<GuardiansTable guardians={guardians} />)
    fireEvent.change(screen.getByPlaceholderText(/Search by name/), {
      target: { value: 'gary.alice@example.com' },
    })
    expect(screen.getByText('AliceGuardian, Gary')).toBeTruthy()
    expect(screen.queryByText('BobGuardian, Grace')).toBeNull()
  })

  it('filters by phone', () => {
    render(<GuardiansTable guardians={guardians} />)
    fireEvent.change(screen.getByPlaceholderText(/Search by name/), {
      target: { value: '07711000002' },
    })
    expect(screen.queryByText('AliceGuardian, Gary')).toBeNull()
    expect(screen.getByText('BobGuardian, Grace')).toBeTruthy()
  })

  it('shows a no-match message when nothing filters in', () => {
    render(<GuardiansTable guardians={guardians} />)
    fireEvent.change(screen.getByPlaceholderText(/Search by name/), {
      target: { value: 'nobody' },
    })
    expect(screen.getByText('No guardians match your search.')).toBeTruthy()
  })
})
