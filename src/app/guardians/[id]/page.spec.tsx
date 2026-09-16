import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { redirect } from 'next/navigation'

import { auth } from '@/auth'
import { getGuardianById, getFamilyForGuardian } from '@/db'

import GuardianFamilyPage from './page'

vi.mock('@/auth', () => ({
  auth: vi.fn(),
}))

vi.mock('@/db', () => ({
  getGuardianById: vi.fn(),
  getFamilyForGuardian: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
}))

beforeEach(() => {
  vi.clearAllMocks()
})

const mockGuardian = {
  id: 'guardian-1',
  first_name: 'Gary',
  last_name: 'AliceGuardian',
  phone: '07711000001',
  email: 'gary.alice@example.com',
  occupation: 'Bus driver',
  address_line_1: '1 Test St',
  address_line_2: null,
  city: 'London',
  postcode: 'N1 1AA',
  notes: null,
}

const emptyFamily = { children: [], coGuardians: [] }

describe('GuardianFamilyPage', () => {
  it('renders the guardian name for admin', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { role: 'admin' } } as any)
    vi.mocked(getGuardianById).mockResolvedValue(mockGuardian as any)
    vi.mocked(getFamilyForGuardian).mockResolvedValue(emptyFamily as any)

    render(
      await GuardianFamilyPage({
        params: Promise.resolve({ id: 'guardian-1' }),
      }),
    )
    expect(screen.getByText('AliceGuardian, Gary')).toBeTruthy()
  })

  it('lists children with their relationship and slot', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { role: 'admin' } } as any)
    vi.mocked(getGuardianById).mockResolvedValue(mockGuardian as any)
    vi.mocked(getFamilyForGuardian).mockResolvedValue({
      children: [
        {
          id: 'student-1',
          first_name: 'Alice',
          last_name: 'Student',
          student_code: null,
          active: true,
          leaving_reason: null,
          relationship: null,
          slot: 'primary',
          classes: [{ id: 'class-1', name: 'Alpha' }],
        },
        {
          id: 'student-2',
          first_name: 'Bob',
          last_name: 'Student',
          student_code: null,
          active: true,
          leaving_reason: null,
          relationship: 'Father',
          slot: 'secondary',
          classes: [],
        },
      ],
      coGuardians: [],
    } as any)

    render(
      await GuardianFamilyPage({
        params: Promise.resolve({ id: 'guardian-1' }),
      }),
    )
    expect(screen.getByText('Student, Alice')).toBeTruthy()
    expect(screen.getByText(/Primary guardian/)).toBeTruthy()
    expect(screen.getByText(/Alpha/)).toBeTruthy()
    expect(screen.getByText('Student, Bob')).toBeTruthy()
    expect(screen.getByText(/Father/)).toBeTruthy()
  })

  it('badges a leaver child', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { role: 'admin' } } as any)
    vi.mocked(getGuardianById).mockResolvedValue(mockGuardian as any)
    vi.mocked(getFamilyForGuardian).mockResolvedValue({
      children: [
        {
          id: 'student-1',
          first_name: 'Alice',
          last_name: 'Student',
          student_code: null,
          active: false,
          leaving_reason: 'graduated',
          relationship: null,
          slot: 'primary',
          classes: [],
        },
      ],
      coGuardians: [],
    } as any)

    render(
      await GuardianFamilyPage({
        params: Promise.resolve({ id: 'guardian-1' }),
      }),
    )
    expect(screen.getByText('Graduated')).toBeTruthy()
  })

  it('lists co-guardians with the child they connect through', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { role: 'admin' } } as any)
    vi.mocked(getGuardianById).mockResolvedValue(mockGuardian as any)
    vi.mocked(getFamilyForGuardian).mockResolvedValue({
      children: [
        {
          id: 'student-2',
          first_name: 'Bob',
          last_name: 'Student',
          student_code: null,
          active: true,
          leaving_reason: null,
          relationship: 'Father',
          slot: 'secondary',
          classes: [],
        },
      ],
      coGuardians: [
        {
          id: 'guardian-2',
          first_name: 'Grace',
          last_name: 'BobGuardian',
          phone: '07711000002',
          email: 'grace.bob@example.com',
          links: [
            { childId: 'student-2', childName: 'Bob Student', slot: 'primary' },
          ],
        },
      ],
    } as any)

    render(
      await GuardianFamilyPage({
        params: Promise.resolve({ id: 'guardian-1' }),
      }),
    )
    expect(screen.getByText('Also linked')).toBeTruthy()
    expect(screen.getByText('BobGuardian, Grace')).toBeTruthy()
    expect(screen.getByText('Primary guardian for Bob Student')).toBeTruthy()
  })

  it('does not render "Also linked" when there are no co-guardians', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { role: 'admin' } } as any)
    vi.mocked(getGuardianById).mockResolvedValue(mockGuardian as any)
    vi.mocked(getFamilyForGuardian).mockResolvedValue(emptyFamily as any)

    render(
      await GuardianFamilyPage({
        params: Promise.resolve({ id: 'guardian-1' }),
      }),
    )
    expect(screen.queryByText('Also linked')).toBeNull()
  })

  it('renders an email-this-family link when there are emails', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { role: 'admin' } } as any)
    vi.mocked(getGuardianById).mockResolvedValue(mockGuardian as any)
    vi.mocked(getFamilyForGuardian).mockResolvedValue(emptyFamily as any)

    render(
      await GuardianFamilyPage({
        params: Promise.resolve({ id: 'guardian-1' }),
      }),
    )
    const link = screen.getByText('Email this family')
    expect(link.getAttribute('href')).toContain('mailto:')
    expect(link.getAttribute('href')).toContain('gary.alice%40example.com')
  })

  it('omits the email-this-family link when the guardian has no email', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { role: 'admin' } } as any)
    vi.mocked(getGuardianById).mockResolvedValue({
      ...mockGuardian,
      email: null,
    } as any)
    vi.mocked(getFamilyForGuardian).mockResolvedValue(emptyFamily as any)

    render(
      await GuardianFamilyPage({
        params: Promise.resolve({ id: 'guardian-1' }),
      }),
    )
    expect(screen.queryByText('Email this family')).toBeNull()
  })

  it.each(['teacher', 'headteacher', 'secretary'] as const)(
    'redirects %s to students list',
    async (role) => {
      vi.mocked(auth).mockResolvedValue({ user: { role } } as any)
      vi.mocked(redirect).mockImplementation(() => {
        throw new Error('NEXT_REDIRECT')
      })

      await expect(
        GuardianFamilyPage({ params: Promise.resolve({ id: 'guardian-1' }) }),
      ).rejects.toThrow('NEXT_REDIRECT')
      expect(redirect).toHaveBeenCalledWith('/students')
    },
  )

  it('redirects to the guardians list when the guardian is not found', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { role: 'admin' } } as any)
    vi.mocked(getGuardianById).mockResolvedValue(null)
    vi.mocked(getFamilyForGuardian).mockResolvedValue(emptyFamily as any)
    vi.mocked(redirect).mockImplementation(() => {
      throw new Error('NEXT_REDIRECT')
    })

    await expect(
      GuardianFamilyPage({ params: Promise.resolve({ id: 'missing-id' }) }),
    ).rejects.toThrow('NEXT_REDIRECT')
    expect(redirect).toHaveBeenCalledWith('/guardians')
  })
})
