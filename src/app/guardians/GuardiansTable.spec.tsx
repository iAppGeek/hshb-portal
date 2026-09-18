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
    // Stacked mode's mobile summary title duplicates the desktop name cell,
    // so each name appears twice (plans/shared-grids.md §5).
    render(<GuardiansTable guardians={guardians} />)
    expect(screen.getAllByText('AliceGuardian, Gary').length).toBeGreaterThan(0)
    expect(screen.getAllByText('BobGuardian, Grace').length).toBeGreaterThan(0)
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
    expect(screen.getAllByText('AliceGuardian, Gary').length).toBeGreaterThan(0)
    expect(screen.queryByText('BobGuardian, Grace')).toBeNull()
  })

  it('filters by last name', () => {
    render(<GuardiansTable guardians={guardians} />)
    fireEvent.change(screen.getByPlaceholderText(/Search by name/), {
      target: { value: 'BobGuardian' },
    })
    expect(screen.queryByText('AliceGuardian, Gary')).toBeNull()
    expect(screen.getAllByText('BobGuardian, Grace').length).toBeGreaterThan(0)
  })

  it('filters by email', () => {
    render(<GuardiansTable guardians={guardians} />)
    fireEvent.change(screen.getByPlaceholderText(/Search by name/), {
      target: { value: 'gary.alice@example.com' },
    })
    expect(screen.getAllByText('AliceGuardian, Gary').length).toBeGreaterThan(0)
    expect(screen.queryByText('BobGuardian, Grace')).toBeNull()
  })

  it('filters by phone', () => {
    render(<GuardiansTable guardians={guardians} />)
    fireEvent.change(screen.getByPlaceholderText(/Search by name/), {
      target: { value: '07711000002' },
    })
    expect(screen.queryByText('AliceGuardian, Gary')).toBeNull()
    expect(screen.getAllByText('BobGuardian, Grace').length).toBeGreaterThan(0)
  })

  // Phones are stored formatted (e.g. "07700 900000"); the fixture above
  // uses unformatted numbers, which only exercises a literal substring
  // match. This guardian's stored number has a space, and the search here
  // has none — matching requires stripping formatting before comparing.
  it('filters by phone ignoring formatting differences', () => {
    const withFormattedPhone = [
      ...guardians,
      {
        id: 'guardian-3',
        first_name: 'Greg',
        last_name: 'CarolGuardian',
        phone: '07700 900003',
        email: null,
        child_count: 1,
      },
    ]
    render(<GuardiansTable guardians={withFormattedPhone} />)
    fireEvent.change(screen.getByPlaceholderText(/Search by name/), {
      target: { value: '07700900003' },
    })
    expect(screen.getAllByText('CarolGuardian, Greg').length).toBeGreaterThan(0)
    expect(screen.queryByText('AliceGuardian, Gary')).toBeNull()
  })

  it('does not treat a non-digit search as matching every phone number', () => {
    render(<GuardiansTable guardians={guardians} />)
    fireEvent.change(screen.getByPlaceholderText(/Search by name/), {
      target: { value: 'nobody' },
    })
    expect(screen.queryByText('AliceGuardian, Gary')).toBeNull()
    expect(screen.queryByText('BobGuardian, Grace')).toBeNull()
  })

  // A query is only phone-shaped (digits/phone punctuation) with at least 3
  // digits; a bare "3" must not be routed into the phone comparison, or it
  // would match nearly every phone number and bury the real result.
  it('does not route a short digit-only query into phone matching', () => {
    render(<GuardiansTable guardians={guardians} />)
    fireEvent.change(screen.getByPlaceholderText(/Search by name/), {
      target: { value: '3' },
    })
    expect(screen.queryByText('AliceGuardian, Gary')).toBeNull()
    expect(screen.queryByText('BobGuardian, Grace')).toBeNull()
  })

  // A query mixing letters and digits is a name/email query, not a phone
  // one — it must not match via a guardian's phone number just because
  // that number happens to contain the digit.
  it('does not route a mixed letters-and-digits query into phone matching', () => {
    const withSmith = [
      ...guardians,
      {
        id: 'guardian-4',
        first_name: 'Sam',
        last_name: 'Smith',
        phone: '07700 900001',
        email: null,
        child_count: 0,
      },
    ]
    render(<GuardiansTable guardians={withSmith} />)
    fireEvent.change(screen.getByPlaceholderText(/Search by name/), {
      target: { value: 'smith1' },
    })
    expect(screen.queryByText('Smith, Sam')).toBeNull()
    expect(screen.queryByText('AliceGuardian, Gary')).toBeNull()
    expect(screen.queryByText('BobGuardian, Grace')).toBeNull()
  })

  it('still matches a short phone-shaped fragment', () => {
    render(<GuardiansTable guardians={guardians} />)
    fireEvent.change(screen.getByPlaceholderText(/Search by name/), {
      target: { value: '00002' },
    })
    expect(screen.getAllByText('BobGuardian, Grace').length).toBeGreaterThan(0)
    expect(screen.queryByText('AliceGuardian, Gary')).toBeNull()
  })

  it('shows a no-match message when nothing filters in', () => {
    render(<GuardiansTable guardians={guardians} />)
    fireEvent.change(screen.getByPlaceholderText(/Search by name/), {
      target: { value: 'nobody' },
    })
    expect(screen.getByText('No guardians match your search.')).toBeTruthy()
  })
})
