import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('@/auth', () => ({
  auth: vi.fn(),
}))

vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  redirect: vi.fn().mockImplementation((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`)
  }),
  notFound: vi.fn().mockImplementation(() => {
    throw new Error('NEXT_NOT_FOUND')
  }),
}))

vi.mock('@/db', () => ({
  getStaffById: vi.fn(),
  getStudentById: vi.fn(),
  getStudentIdsByTeacher: vi.fn(),
}))

vi.mock('../actions', () => ({
  withdrawPhotoVideoConsentAction: vi.fn(),
}))

import { auth } from '@/auth'
import { getStaffById, getStudentById, getStudentIdsByTeacher } from '@/db'

import StudentPage from './page'

beforeEach(() => {
  vi.clearAllMocks()
})

const baseStudent = {
  id: 'student-1',
  first_name: 'Anna',
  last_name: 'Papadopoulos',
  student_code: 'S001',
  english_school_name: null,
  address_guardian_id: null,
  address_guardian: null,
  address_line_1: null,
  address_line_2: null,
  city: null,
  postcode: null,
  allergies: null,
  notes: 'Likes reading',
  medical_details: 'None',
  sen_details: null,
  primary_guardian_id: 'guardian-1',
  primary_guardian: {
    first_name: 'Maria',
    last_name: 'Papadopoulos',
    phone: '07700 900000',
    email: 'maria@example.com',
    occupation: 'Teacher',
    address_line_1: null,
    address_line_2: null,
    city: null,
    postcode: null,
    notes: null,
  },
  primary_guardian_relationship: 'Mother',
  secondary_guardian_id: null,
  secondary_guardian: null,
  secondary_guardian_relationship: null,
  additional_contact_1_id: null,
  additional_contact_1: null,
  additional_contact_1_relationship: null,
  additional_contact_2_id: null,
  additional_contact_2: null,
  additional_contact_2_relationship: null,
  privacy_notice_read: true,
  first_aid_consent: false,
  photo_video_consent: true,
  home_school_agreement: false,
  email_sms_contact_ack: true,
  may_leave_unaccompanied: null,
  consents_recorded_at: null,
  privacy_notice_version: null,
  photo_video_consent_withdrawn_at: null,
  photo_video_consent_withdrawn_by: null,
  student_classes: [{ class: { name: 'Year 1A', academic_year: null } }],
}

function renderPage(id = 'student-1') {
  return StudentPage({ params: Promise.resolve({ id }) })
}

describe('StudentPage', () => {
  it('redirects to /login when not authenticated', async () => {
    vi.mocked(auth).mockResolvedValue(null as any)

    await expect(renderPage()).rejects.toThrow('NEXT_REDIRECT:/login')
  })

  it('404s when the student does not exist', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { role: 'admin', staffId: 'staff-1' },
    } as any)
    vi.mocked(getStudentById).mockResolvedValue(null)

    await expect(renderPage()).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('renders the student for admin, including gated sections', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { role: 'admin', staffId: 'staff-1' },
    } as any)
    vi.mocked(getStudentById).mockResolvedValue(baseStudent as any)

    render(await renderPage())

    expect(
      screen.getByRole('heading', { name: 'Papadopoulos, Anna' }),
    ).toBeTruthy()
    expect(screen.getByText('Maria Papadopoulos')).toBeTruthy()
    expect(screen.getByText('Year 1A')).toBeTruthy()
    expect(screen.getByText('None')).toBeTruthy()
    expect(screen.getByText('Consents')).toBeTruthy()
  })

  it('hides medical and consent sections for a teacher', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { role: 'teacher', staffId: 'staff-3' },
    } as any)
    vi.mocked(getStudentIdsByTeacher).mockResolvedValue(['student-1'])
    vi.mocked(getStudentById).mockResolvedValue(baseStudent as any)

    render(await renderPage())

    expect(screen.queryByText('Consents')).toBeNull()
    expect(screen.queryByText('Medical')).toBeNull()
  })

  describe('consents', () => {
    type Student = Awaited<ReturnType<typeof getStudentById>>

    function signInAs(role: string): void {
      // `auth` is overloaded (it is also middleware), so mock the session form.
      const session = vi.mocked(auth as () => Promise<unknown>)
      session.mockResolvedValue({ user: { role, staffId: 'staff-1' } })
    }

    function consentRows(): string[][] {
      const card = screen.getByText('Consents').closest('div')!.parentElement!
      return Array.from(card.querySelectorAll('dt')).map((dt) => [
        dt.textContent ?? '',
        dt.nextElementSibling?.textContent ?? '',
      ])
    }

    it('shows all six consents, when they were recorded and the notice version', async () => {
      signInAs('admin')
      vi.mocked(getStudentById).mockResolvedValue({
        ...baseStudent,
        may_leave_unaccompanied: false,
        consents_recorded_at: '2026-10-04T09:30:00Z',
        privacy_notice_version: '1.0',
        sen_details: 'Dyslexia',
      } as unknown as Student)

      render(await renderPage())

      expect(consentRows()).toEqual([
        ['Read the Privacy Notice', 'Yes'],
        ['Emergency first aid', 'No'],
        ['Email & SMS contact understood', 'Yes'],
        ['Photos & video', 'Yes'],
        ['Home–school agreement', 'No'],
        ['May leave on their own', 'No'],
        ['Consents recorded', '04/10/2026, 10:30'],
        ['Privacy Notice version', '1.0'],
      ])
      expect(screen.getByText('Dyslexia')).toBeTruthy()
    })

    it('lets an admin withdraw photo consent while it is given', async () => {
      signInAs('admin')
      vi.mocked(getStudentById).mockResolvedValue(
        baseStudent as unknown as Student,
      )

      render(await renderPage())

      expect(
        screen.getByRole('button', { name: 'Withdraw photo consent' }),
      ).toBeTruthy()
    })

    it('offers no withdraw button to a headteacher', async () => {
      signInAs('headteacher')
      vi.mocked(getStudentById).mockResolvedValue(
        baseStudent as unknown as Student,
      )

      render(await renderPage())

      expect(screen.getByText('Consents')).toBeTruthy()
      expect(
        screen.queryByRole('button', { name: 'Withdraw photo consent' }),
      ).toBeNull()
    })

    it('shows who withdrew photo consent and when', async () => {
      signInAs('admin')
      vi.mocked(getStudentById).mockResolvedValue({
        ...baseStudent,
        photo_video_consent: false,
        photo_video_consent_withdrawn_at: '2026-10-04T13:05:00Z',
        photo_video_consent_withdrawn_by: 'staff-9',
      } as unknown as Student)
      vi.mocked(getStaffById).mockResolvedValue({
        first_name: 'Olga',
        last_name: 'Office',
        display_name: null,
      } as Awaited<ReturnType<typeof getStaffById>>)

      render(await renderPage())

      expect(getStaffById).toHaveBeenCalledWith('staff-9')
      expect(consentRows()).toContainEqual([
        'Photo consent withdrawn',
        '04/10/2026, 14:05 by Olga Office',
      ])
      expect(
        screen.queryByRole('button', { name: 'Withdraw photo consent' }),
      ).toBeNull()
    })
  })

  it('404s for a teacher viewing a student outside their classes', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { role: 'teacher', staffId: 'staff-3' },
    } as any)
    vi.mocked(getStudentIdsByTeacher).mockResolvedValue(['other-student'])

    await expect(renderPage()).rejects.toThrow('NEXT_NOT_FOUND')
    expect(getStudentById).not.toHaveBeenCalled()
  })
})
