import { describe, it, expect, vi, beforeEach } from 'vitest'
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

import { auth } from '@/auth'
import {
  getStudentCount,
  getStudentsByTeacher,
  getAllClasses,
  getClassesByTeacher,
  getTeachers,
  getIncidentCount,
  getLessonPlanCountByDate,
  getAttendanceByDateRange,
  getEnrolmentsInRange,
  getPendingRegistrationCount,
} from '@/db'
import { todayInSchoolTz } from '@/lib/datetime'

import DashboardPage from './page'

const today = todayInSchoolTz()
const summaryClass = { id: 'c1', name: 'Class', active: true, yearCode: null }

function enrolment(studentId: string) {
  return {
    class_id: 'c1',
    student_id: studentId,
    start_date: '2020-01-01',
    end_date: null,
    class: summaryClass,
  }
}

function attendance(
  studentId: string,
  status: 'present' | 'absent' | 'late',
  classId = 'c1',
) {
  return {
    class_id: classId,
    student_id: studentId,
    date: today,
    status,
    created_at: `${today}T09:00:00Z`,
    updated_at: `${today}T09:00:00Z`,
    class: { ...summaryClass, id: classId },
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

function mockAdmin() {
  vi.mocked(auth).mockResolvedValue({
    user: { name: 'Admin User', role: 'admin', staffId: 'staff-1' },
  } as any)
  vi.mocked(getStudentCount).mockResolvedValue(0)
  vi.mocked(getAllClasses).mockResolvedValue([])
  vi.mocked(getTeachers).mockResolvedValue([])
  vi.mocked(getIncidentCount).mockResolvedValue(0)
  vi.mocked(getLessonPlanCountByDate).mockResolvedValue(0)
  vi.mocked(getAttendanceByDateRange).mockResolvedValue([])
  vi.mocked(getEnrolmentsInRange).mockResolvedValue([])
  vi.mocked(getPendingRegistrationCount).mockResolvedValue(0)
}

function mockTeacher() {
  vi.mocked(auth).mockResolvedValue({
    user: { name: 'Teacher User', role: 'teacher', staffId: 'staff-2' },
  } as any)
  vi.mocked(getStudentsByTeacher).mockResolvedValue([])
  vi.mocked(getClassesByTeacher).mockResolvedValue([])
}

describe('DashboardPage', () => {
  it('renders welcome message with user first name', async () => {
    mockAdmin()
    render(await DashboardPage())
    expect(screen.getByText(/welcome back, admin/i)).toBeTruthy()
  })

  it('shows admin role label for admin user', async () => {
    mockAdmin()
    render(await DashboardPage())
    expect(screen.getByText('Admin')).toBeTruthy()
  })

  it('shows all admin tiles', async () => {
    mockAdmin()
    render(await DashboardPage())
    expect(screen.getByText('Total Students')).toBeTruthy()
    expect(screen.getByText('Students attendance today')).toBeTruthy()
    expect(screen.getByText('Total Classes')).toBeTruthy()
    expect(screen.getByText('Attendance submitted today')).toBeTruthy()
    expect(screen.getByText('Total Teachers')).toBeTruthy()
    expect(screen.getByText('Total Incidents')).toBeTruthy()
    expect(screen.getByText('Lessons planned today')).toBeTruthy()
  })

  it('shows correct student and incident counts for admin', async () => {
    mockAdmin()
    vi.mocked(getStudentCount).mockResolvedValue(42)
    vi.mocked(getIncidentCount).mockResolvedValue(5)

    render(await DashboardPage())
    expect(screen.getByText('42')).toBeTruthy()
    expect(screen.getByText('5')).toBeTruthy()
  })

  it('shows distinct-student attendance ratio and percentage for admin', async () => {
    mockAdmin()
    const ids = Array.from({ length: 100 }, (_, i) => `s${i}`)
    vi.mocked(getEnrolmentsInRange).mockResolvedValue(ids.map(enrolment) as any)
    vi.mocked(getAttendanceByDateRange).mockResolvedValue(
      ids.slice(0, 50).map((id) => attendance(id, 'present')) as any,
    )

    render(await DashboardPage())
    expect(screen.getByText('50/100')).toBeTruthy()
    expect(screen.getByText('50%')).toBeTruthy()
  })

  it('counts a dual-class student once in the attendance ratio', async () => {
    mockAdmin()
    vi.mocked(getEnrolmentsInRange).mockResolvedValue([
      enrolment('dual'),
      {
        ...enrolment('dual'),
        class_id: 'c2',
        class: { ...summaryClass, id: 'c2' },
      },
    ] as any)
    vi.mocked(getAttendanceByDateRange).mockResolvedValue([
      attendance('dual', 'present', 'c1'),
      attendance('dual', 'present', 'c2'),
    ] as any)

    render(await DashboardPage())
    expect(screen.getByText('1/1')).toBeTruthy()
  })

  it('shows registers submitted ratio for admin', async () => {
    mockAdmin()
    vi.mocked(getAllClasses).mockResolvedValue([
      { id: 'c-1' },
      { id: 'c-2' },
      { id: 'c-3' },
    ] as any)
    vi.mocked(getAttendanceByDateRange).mockResolvedValue([
      attendance('s1', 'present', 'c-1'),
    ] as any)

    render(await DashboardPage())
    expect(screen.getByText('1/3')).toBeTruthy()
    expect(screen.getByText('33%')).toBeTruthy()
  })

  it('shows teacher count for admin', async () => {
    mockAdmin()
    vi.mocked(getTeachers).mockResolvedValue([
      { id: 't-1' },
      { id: 't-2' },
    ] as any)

    render(await DashboardPage())
    expect(screen.getByText('2')).toBeTruthy()
  })

  it('does not show admin tiles for teacher', async () => {
    mockTeacher()
    render(await DashboardPage())
    expect(screen.queryByText('Students attendance today')).toBeNull()
    expect(screen.queryByText('Attendance submitted today')).toBeNull()
    expect(screen.queryByText('Total Teachers')).toBeNull()
    expect(screen.queryByText('Total Incidents')).toBeNull()
    expect(screen.queryByText('Lessons planned today')).toBeNull()
  })

  it('shows My Students and My Classes labels for teacher', async () => {
    mockTeacher()
    render(await DashboardPage())
    expect(screen.getByText('My Students')).toBeTruthy()
    expect(screen.getByText('My Classes')).toBeTruthy()
  })

  it('calls getClassesByTeacher for teacher role', async () => {
    mockTeacher()
    await DashboardPage()
    expect(getClassesByTeacher).toHaveBeenCalledWith('staff-2')
    expect(getAllClasses).not.toHaveBeenCalled()
  })

  it('calls getStudentsByTeacher for teacher role student count', async () => {
    mockTeacher()
    vi.mocked(getStudentsByTeacher).mockResolvedValue([
      { id: 'student-1' },
    ] as any)
    await DashboardPage()
    expect(getStudentsByTeacher).toHaveBeenCalledWith('staff-2')
    expect(getStudentCount).not.toHaveBeenCalled()
  })

  it('does not query attendance data for teacher role', async () => {
    mockTeacher()
    await DashboardPage()
    expect(getAttendanceByDateRange).not.toHaveBeenCalled()
    expect(getEnrolmentsInRange).not.toHaveBeenCalled()
  })

  it('calls getStudentCount for admin role', async () => {
    mockAdmin()
    vi.mocked(getStudentCount).mockResolvedValue(42)
    await DashboardPage()
    expect(getStudentCount).toHaveBeenCalled()
    expect(getStudentsByTeacher).not.toHaveBeenCalled()
  })

  it('classes card links to /classes', async () => {
    mockAdmin()
    render(await DashboardPage())
    const link = screen.getByText('Total Classes').closest('a')
    expect(link?.getAttribute('href')).toBe('/classes')
  })

  it('teachers card links to /staff', async () => {
    mockAdmin()
    render(await DashboardPage())
    const link = screen.getByText('Total Teachers').closest('a')
    expect(link?.getAttribute('href')).toBe('/staff')
  })

  it('shows all admin tiles for secretary', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { name: 'Secretary User', role: 'secretary', staffId: 'staff-4' },
    } as any)
    vi.mocked(getStudentCount).mockResolvedValue(0)
    vi.mocked(getAllClasses).mockResolvedValue([])
    vi.mocked(getTeachers).mockResolvedValue([])
    vi.mocked(getIncidentCount).mockResolvedValue(0)
    vi.mocked(getLessonPlanCountByDate).mockResolvedValue(0)
    vi.mocked(getAttendanceByDateRange).mockResolvedValue([])
    vi.mocked(getEnrolmentsInRange).mockResolvedValue([])
    vi.mocked(getPendingRegistrationCount).mockResolvedValue(0)

    render(await DashboardPage())
    expect(screen.getByText('Total Students')).toBeTruthy()
    expect(screen.getByText('Total Classes')).toBeTruthy()
    expect(screen.getByText('Total Teachers')).toBeTruthy()
    expect(screen.getByText('Total Incidents')).toBeTruthy()
    expect(screen.getByText('Lessons planned today')).toBeTruthy()
    expect(screen.getByText('Pending registrations')).toBeTruthy()
  })

  it('shows the pending registrations tile with its count for admin', async () => {
    mockAdmin()
    vi.mocked(getPendingRegistrationCount).mockResolvedValue(7)

    render(await DashboardPage())

    expect(screen.getByText('Pending registrations')).toBeTruthy()
    expect(screen.getByText('7')).toBeTruthy()
    const link = screen.getByText('Pending registrations').closest('a')
    expect(link?.getAttribute('href')).toBe('/registrations')
  })

  it('hides the pending registrations tile for teacher', async () => {
    mockTeacher()

    render(await DashboardPage())

    expect(screen.queryByText('Pending registrations')).toBeNull()
    expect(getPendingRegistrationCount).not.toHaveBeenCalled()
  })
})
