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
  getStudentById: vi.fn(),
  getStudentIdsByTeacher: vi.fn(),
}))

import { auth } from '@/auth'
import { getStudentById, getStudentIdsByTeacher } from '@/db'

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
  consent_privacy_notice: true,
  consent_emergency_first_aid: false,
  consent_photo_media: true,
  consent_home_school: false,
  consent_comms_email_sms: true,
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

  it('404s for a teacher viewing a student outside their classes', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { role: 'teacher', staffId: 'staff-3' },
    } as any)
    vi.mocked(getStudentIdsByTeacher).mockResolvedValue(['other-student'])

    await expect(renderPage()).rejects.toThrow('NEXT_NOT_FOUND')
    expect(getStudentById).not.toHaveBeenCalled()
  })
})
