import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('@/db', () => ({
  getStudentsByIds: vi.fn(),
  getAttendanceByClassAndDate: vi.fn(),
  getEnrolmentsForClass: vi.fn(),
}))

vi.mock('./AttendanceForm', () => ({
  default: vi.fn(() => <div>AttendanceForm</div>),
}))

import {
  getStudentsByIds,
  getAttendanceByClassAndDate,
  getEnrolmentsForClass,
} from '@/db'
import { todayInSchoolTz } from '@/lib/datetime'

import AttendanceRegister from './AttendanceRegister'
import AttendanceForm from './AttendanceForm'

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getStudentsByIds).mockResolvedValue([])
  vi.mocked(getAttendanceByClassAndDate).mockResolvedValue([])
  vi.mocked(getEnrolmentsForClass).mockResolvedValue([])
})

const mockStudent = {
  id: 'student-1',
  first_name: 'Anna',
  last_name: 'Papadopoulos',
  student_code: 'S001',
}

const openEnrolment = {
  class_id: 'class-1',
  student_id: 'student-1',
  start_date: '2020-01-01',
  end_date: null,
}

describe('AttendanceRegister', () => {
  it('builds the roster from marked and enrolled students', async () => {
    vi.mocked(getEnrolmentsForClass).mockResolvedValue([openEnrolment] as any)
    vi.mocked(getStudentsByIds).mockResolvedValue([mockStudent] as any)
    vi.mocked(getAttendanceByClassAndDate).mockResolvedValue([])

    render(
      await AttendanceRegister({
        classId: 'class-1',
        date: '2024-06-15',
        className: 'Year 3A',
        role: 'admin',
      }),
    )

    expect(getEnrolmentsForClass).toHaveBeenCalledWith('class-1')
    expect(getAttendanceByClassAndDate).toHaveBeenCalledWith(
      'class-1',
      '2024-06-15',
    )
    expect(getStudentsByIds).toHaveBeenCalledWith(['student-1'])
  })

  it('renders AttendanceForm with students and existing attendance', async () => {
    vi.mocked(getEnrolmentsForClass).mockResolvedValue([openEnrolment] as any)
    vi.mocked(getStudentsByIds).mockResolvedValue([mockStudent] as any)
    vi.mocked(getAttendanceByClassAndDate).mockResolvedValue([
      {
        id: 'att-1',
        student_id: 'student-1',
        status: 'absent',
        class_id: 'class-1',
        date: '2024-06-15',
      },
    ] as any)

    render(
      await AttendanceRegister({
        classId: 'class-1',
        date: '2024-06-15',
        className: 'Year 3A',
        role: 'admin',
      }),
    )

    expect(vi.mocked(AttendanceForm)).toHaveBeenCalledWith(
      expect.objectContaining({
        classId: 'class-1',
        date: '2024-06-15',
        students: [mockStudent],
        existing: { 'student-1': 'absent' },
        role: 'admin',
      }),
      undefined,
    )
  })

  it('renders the empty-roster message instead of the form when no one was enrolled', async () => {
    render(
      await AttendanceRegister({
        classId: 'class-1',
        date: '2024-06-15',
        className: 'Year 3A',
        role: 'admin',
      }),
    )

    expect(
      screen.getByText('No students were in this class on this date.'),
    ).toBeTruthy()
    expect(vi.mocked(AttendanceForm)).not.toHaveBeenCalled()
  })

  it('includes a leaver with a mark, and a same-day joiner on a taken register', async () => {
    vi.mocked(getEnrolmentsForClass).mockResolvedValue([
      {
        class_id: 'class-1',
        student_id: 'joiner',
        start_date: '2024-06-15',
        end_date: null,
      },
    ] as any)
    vi.mocked(getAttendanceByClassAndDate).mockResolvedValue([
      {
        id: 'att-1',
        student_id: 'leaver',
        status: 'absent',
        class_id: 'class-1',
        date: '2024-06-15',
      },
    ] as any)

    await AttendanceRegister({
      classId: 'class-1',
      date: '2024-06-15',
      className: 'Year 3A',
      role: 'admin',
    })

    expect(getStudentsByIds).toHaveBeenCalledWith(['joiner', 'leaver'])
  })

  it('shows the class name and date in the summary line', async () => {
    render(
      await AttendanceRegister({
        classId: 'class-1',
        date: '2024-06-15',
        className: 'Year 3A',
        role: 'admin',
      }),
    )

    expect(screen.getByText(/Year 3A/)).toBeTruthy()
    expect(screen.getByText(/2024-06-15/)).toBeTruthy()
  })

  it('shows already-taken notice when existing attendance exists', async () => {
    vi.mocked(getAttendanceByClassAndDate).mockResolvedValue([
      {
        id: 'att-1',
        student_id: 'student-1',
        status: 'present',
        class_id: 'class-1',
        date: '2024-06-15',
      },
    ] as any)

    render(
      await AttendanceRegister({
        classId: 'class-1',
        date: '2024-06-15',
        className: 'Year 3A',
        role: 'admin',
      }),
    )

    expect(screen.getByText('(register already taken)')).toBeTruthy()
  })

  it('does not show already-taken notice when no existing attendance', async () => {
    render(
      await AttendanceRegister({
        classId: 'class-1',
        date: '2024-06-15',
        className: 'Year 3A',
        role: 'admin',
      }),
    )

    expect(screen.queryByText('(register already taken)')).toBeNull()
  })

  it('shows Historical label for a past date', async () => {
    render(
      await AttendanceRegister({
        classId: 'class-1',
        date: '2024-06-15',
        className: 'Year 3A',
        role: 'admin',
      }),
    )

    expect(screen.getByText('Historical')).toBeTruthy()
  })

  it('shows Future label for a future date', async () => {
    render(
      await AttendanceRegister({
        classId: 'class-1',
        date: '2099-01-01',
        className: 'Year 3A',
        role: 'admin',
      }),
    )

    expect(screen.getByText('Future')).toBeTruthy()
  })

  it("shows Today label for today's date", async () => {
    // Europe/London, not UTC: between 23:00 and midnight UTC the two differ
    // and the component would be compared against yesterday.
    const today = todayInSchoolTz()

    render(
      await AttendanceRegister({
        classId: 'class-1',
        date: today,
        className: 'Year 3A',
        role: 'admin',
      }),
    )

    expect(screen.getByText('Today')).toBeTruthy()
  })

  it('passes archived to AttendanceForm, defaulting to false', async () => {
    vi.mocked(getEnrolmentsForClass).mockResolvedValue([openEnrolment] as any)
    vi.mocked(getStudentsByIds).mockResolvedValue([mockStudent] as any)

    render(
      await AttendanceRegister({
        classId: 'class-1',
        date: '2024-06-15',
        className: 'Year 3A',
        role: 'admin',
      }),
    )
    expect(vi.mocked(AttendanceForm)).toHaveBeenLastCalledWith(
      expect.objectContaining({ archived: false }),
      undefined,
    )

    render(
      await AttendanceRegister({
        classId: 'class-1',
        date: '2024-06-15',
        className: 'Year 3A',
        role: 'admin',
        archived: true,
      }),
    )
    expect(vi.mocked(AttendanceForm)).toHaveBeenLastCalledWith(
      expect.objectContaining({ archived: true }),
      undefined,
    )
  })
})
