import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ReactElement } from 'react'
import { render, screen } from '@testing-library/react'

vi.mock('@/auth', () => ({
  auth: vi.fn(),
}))

vi.mock('@/db', () => ({
  getStudentCount: vi.fn(),
  getStudentsByTeacher: vi.fn(),
  getAllClasses: vi.fn(),
  getClassesByTeacher: vi.fn(),
  getTeachers: vi.fn(),
  getIncidentCount: vi.fn(),
  getLessonPlanCountByDate: vi.fn(),
  getAttendanceByDateRange: vi.fn(),
  getEnrolmentsInRange: vi.fn(),
  getPendingRegistrationCount: vi.fn(),
}))

import { auth } from '@/auth'

import DashboardPage from './page'

beforeEach(() => {
  vi.clearAllMocks()
})

async function renderHeader(role: string, name: string, staffId: string) {
  vi.mocked(auth).mockResolvedValue({
    user: { name, role, staffId },
  } as any)

  // The stat tiles live in the async DashboardStats server component,
  // streamed behind a Suspense boundary — RTL's render() can't resolve
  // that on the client, so (like layout.spec.tsx) we render only the
  // header element from the returned tree instead of the whole page.
  const page = (await DashboardPage()) as ReactElement<{
    children: [ReactElement, ReactElement<{ children: ReactElement }>]
  }>
  const [header, suspense] = page.props.children
  render(header)
  return suspense
}

describe('DashboardPage', () => {
  it('renders welcome message with user first name', async () => {
    await renderHeader('admin', 'Admin User', 'staff-1')
    expect(screen.getByText(/welcome back, admin/i)).toBeTruthy()
  })

  it('shows admin role label for admin user', async () => {
    await renderHeader('admin', 'Admin User', 'staff-1')
    expect(screen.getByText('Admin')).toBeTruthy()
  })

  it('shows teacher role label for teacher user', async () => {
    await renderHeader('teacher', 'Teacher User', 'staff-2')
    expect(screen.getByText('Teacher')).toBeTruthy()
  })

  it('passes role, staffId and today to a Suspense-wrapped DashboardStats', async () => {
    const suspense = await renderHeader('admin', 'Admin User', 'staff-1')
    expect(suspense.props.children.props).toEqual(
      expect.objectContaining({ role: 'admin', staffId: 'staff-1' }),
    )
  })
})
