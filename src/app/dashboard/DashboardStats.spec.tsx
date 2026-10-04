import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('@/db', () => ({
  getDashboardStats: vi.fn(),
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

vi.mock('@heroicons/react/24/outline', () => ({
  UsersIcon: () => <svg />,
  CalendarDaysIcon: () => <svg />,
  ExclamationTriangleIcon: () => <svg />,
  BookOpenIcon: () => <svg />,
  AcademicCapIcon: () => <svg />,
  InboxIcon: () => <svg />,
}))

// The tile and its QR modal are tested in LinktreeTile.spec.tsx; here we
// only check which URL it is given.
vi.mock('./LinktreeTile', () => ({
  default: ({ url }: { url: string }) => (
    <p data-testid="linktree-tile">{url}</p>
  ),
}))

import { getDashboardStats, type DashboardStats as Stats } from '@/db'
import { todayInSchoolTz } from '@/lib/datetime'

import DashboardStats from './DashboardStats'

const today = todayInSchoolTz()

// Distinct values so each tile's number can be found on its own.
const adminStats: Stats = {
  studentCount: 42,
  classCount: 3,
  teacherCount: 2,
  incidentCount: 5,
  lessonPlansToday: 0,
  presentToday: 50,
  enrolledToday: 100,
  registersTakenToday: 1,
  pendingRegistrationCount: 7,
}

const teacherStats: Stats = {
  studentCount: 12,
  classCount: 1,
  teacherCount: null,
  incidentCount: null,
  lessonPlansToday: null,
  presentToday: null,
  enrolledToday: null,
  registersTakenToday: null,
  pendingRegistrationCount: null,
}

beforeEach(() => {
  vi.clearAllMocks()
})

async function renderStats(
  role: 'admin' | 'teacher' | 'headteacher' | 'secretary',
  stats: Stats,
) {
  vi.mocked(getDashboardStats).mockResolvedValue(stats)
  render(
    await DashboardStats({
      role,
      staffId: 'staff-1',
      email: 'jsmith@hshb.org.uk',
      today,
    }),
  )
}

describe('DashboardStats', () => {
  it('asks for the actor’s figures for today in one call', async () => {
    await renderStats('admin', adminStats)
    expect(getDashboardStats).toHaveBeenCalledTimes(1)
    expect(getDashboardStats).toHaveBeenCalledWith(
      { role: 'admin', staffId: 'staff-1' },
      today,
    )
  })

  it('shows all admin tiles', async () => {
    await renderStats('admin', adminStats)
    expect(screen.getByText('Total Students')).toBeTruthy()
    expect(screen.getByText('Students attendance today')).toBeTruthy()
    expect(screen.getByText('Total Classes')).toBeTruthy()
    expect(screen.getByText('Attendance submitted today')).toBeTruthy()
    expect(screen.getByText('Total Teachers')).toBeTruthy()
    expect(screen.getByText('Total Incidents')).toBeTruthy()
    expect(screen.getByText('Lessons planned today')).toBeTruthy()
  })

  it('shows the student, teacher and incident counts', async () => {
    await renderStats('admin', adminStats)
    expect(screen.getByText('42')).toBeTruthy()
    expect(screen.getByText('2')).toBeTruthy()
    expect(screen.getByText('5')).toBeTruthy()
  })

  it('shows the attendance ratio and percentage', async () => {
    await renderStats('admin', adminStats)
    expect(screen.getByText('50/100')).toBeTruthy()
    expect(screen.getByText('50%')).toBeTruthy()
  })

  it('shows registers submitted and lessons planned against the class count', async () => {
    await renderStats('admin', adminStats)
    expect(screen.getByText('1/3')).toBeTruthy()
    expect(screen.getByText('33%')).toBeTruthy()
    expect(screen.getByText('0/3')).toBeTruthy()
  })

  it('shows a dash rather than a percentage when nobody is enrolled', async () => {
    await renderStats('admin', {
      ...adminStats,
      presentToday: 0,
      enrolledToday: 0,
    })
    expect(screen.getByText('0/0')).toBeTruthy()
    expect(screen.getAllByText('—').length).toBeGreaterThan(0)
  })

  it('does not show admin tiles for teacher', async () => {
    await renderStats('teacher', teacherStats)
    expect(screen.queryByText('Students attendance today')).toBeNull()
    expect(screen.queryByText('Attendance submitted today')).toBeNull()
    expect(screen.queryByText('Total Teachers')).toBeNull()
    expect(screen.queryByText('Total Incidents')).toBeNull()
    expect(screen.queryByText('Lessons planned today')).toBeNull()
  })

  it('shows My Students and My Classes with the teacher’s counts', async () => {
    await renderStats('teacher', teacherStats)
    expect(screen.getByText('My Students')).toBeTruthy()
    expect(screen.getByText('My Classes')).toBeTruthy()
    expect(screen.getByText('12')).toBeTruthy()
    expect(screen.getByText('1')).toBeTruthy()
  })

  it('classes card links to /classes', async () => {
    await renderStats('admin', adminStats)
    const link = screen.getByText('Total Classes').closest('a')
    expect(link?.getAttribute('href')).toBe('/classes')
  })

  it('teachers card links to /staff', async () => {
    await renderStats('admin', adminStats)
    const link = screen.getByText('Total Teachers').closest('a')
    expect(link?.getAttribute('href')).toBe('/staff')
  })

  it('shows all admin tiles for secretary', async () => {
    await renderStats('secretary', adminStats)
    expect(screen.getByText('Total Students')).toBeTruthy()
    expect(screen.getByText('Total Classes')).toBeTruthy()
    expect(screen.getByText('Total Teachers')).toBeTruthy()
    expect(screen.getByText('Total Incidents')).toBeTruthy()
    expect(screen.getByText('Lessons planned today')).toBeTruthy()
    expect(screen.getByText('Pending registrations')).toBeTruthy()
  })

  it('shows the pending registrations tile with its count', async () => {
    await renderStats('admin', adminStats)
    expect(screen.getByText('Pending registrations')).toBeTruthy()
    expect(screen.getByText('7')).toBeTruthy()
    const link = screen.getByText('Pending registrations').closest('a')
    expect(link?.getAttribute('href')).toBe('/registrations')
  })

  it('hides the pending registrations tile when the count is not given', async () => {
    await renderStats('teacher', teacherStats)
    expect(screen.queryByText('Pending registrations')).toBeNull()
  })

  it.each(['admin', 'teacher'] as const)(
    'shows a Linktree tile for %s with the personalised page',
    async (role) => {
      await renderStats(role, role === 'teacher' ? teacherStats : adminStats)

      expect(screen.getByTestId('linktree-tile')).toHaveTextContent(
        'https://www.hshb.org.uk/linktree?t=jsmith',
      )
    },
  )
})
