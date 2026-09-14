import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('@/db', () => ({
  getAcademicYears: vi.fn(),
  getCurrentAcademicYear: vi.fn(),
  getClassesByAcademicYear: vi.fn(),
  getTeachers: vi.fn(),
  getStudentsByClass: vi.fn(),
}))
vi.mock('./ClassMigrationForm', () => ({
  default: vi.fn(
    ({ sourceClassId, students, classes, teachers, baseUrl, targetYearId }) => (
      <div data-testid="migration-form">
        <span data-testid="source-class-id">{sourceClassId ?? 'none'}</span>
        <span data-testid="student-count">{students.length}</span>
        <span data-testid="class-count">{classes.length}</span>
        <span data-testid="teacher-count">{teachers.length}</span>
        <span data-testid="base-url">{baseUrl}</span>
        <span data-testid="target-year-id">{targetYearId}</span>
      </div>
    ),
  ),
}))
vi.mock('./actions', () => ({ migrateClassAction: vi.fn() }))

import {
  getAcademicYears,
  getClassesByAcademicYear,
  getCurrentAcademicYear,
  getTeachers,
  getStudentsByClass,
} from '@/db'

import ClassMigrationForm from './ClassMigrationForm'
import ClassMigrationTab from './ClassMigrationTab'

const CLASS_ID = '00000000-0000-4000-8000-000000000001'
const TEACHER_ID = '00000000-0000-4000-8000-000000000002'

const currentYear = {
  id: 'year-2',
  code: '2026-27',
  start_date: '2026-09-01',
  end_date: '2027-08-31',
}
const previousYear = {
  id: 'year-1',
  code: '2025-26',
  start_date: '2025-09-01',
  end_date: '2026-08-31',
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getAcademicYears).mockResolvedValue([
    currentYear,
    previousYear,
  ] as any)
  vi.mocked(getCurrentAcademicYear).mockResolvedValue(currentYear as any)
  vi.mocked(getClassesByAcademicYear).mockResolvedValue([
    {
      id: CLASS_ID,
      name: 'Year 1A',
      year_group: '1',
      active: true,
    },
  ] as any)
  vi.mocked(getTeachers).mockResolvedValue([
    {
      id: TEACHER_ID,
      first_name: 'Alice',
      last_name: 'Smith',
      display_name: null,
    },
  ] as any)
  vi.mocked(getStudentsByClass).mockResolvedValue([])
})

describe('ClassMigrationTab', () => {
  it('defaults to the current year and sources from the year before it', async () => {
    render(
      await ClassMigrationTab({
        sourceClassId: undefined,
        targetYearId: undefined,
      }),
    )

    expect(getClassesByAcademicYear).toHaveBeenCalledWith(previousYear.id)
    expect(screen.getByTestId('target-year-id').textContent).toBe(
      currentYear.id,
    )
    expect(getTeachers).toHaveBeenCalled()
    expect(screen.getByTestId('class-count').textContent).toBe('1')
    expect(screen.getByTestId('teacher-count').textContent).toBe('1')
  })

  it('sources from the year before an explicitly chosen target year', async () => {
    render(
      await ClassMigrationTab({
        sourceClassId: undefined,
        targetYearId: previousYear.id,
      }),
    )

    // Nothing precedes the oldest year, so there is no source year to fetch.
    expect(getClassesByAcademicYear).not.toHaveBeenCalled()
    expect(screen.getByTestId('class-count').textContent).toBe('0')
  })

  it('excludes inactive classes from the source list', async () => {
    vi.mocked(getClassesByAcademicYear).mockResolvedValue([
      { id: CLASS_ID, name: 'Year 1A', year_group: '1', active: false },
    ] as any)

    render(
      await ClassMigrationTab({
        sourceClassId: undefined,
        targetYearId: undefined,
      }),
    )

    expect(screen.getByTestId('class-count').textContent).toBe('0')
  })

  it('does not fetch students when sourceClassId is undefined', async () => {
    render(
      await ClassMigrationTab({
        sourceClassId: undefined,
        targetYearId: undefined,
      }),
    )

    expect(getStudentsByClass).not.toHaveBeenCalled()
    expect(screen.getByTestId('student-count').textContent).toBe('0')
    expect(screen.getByTestId('source-class-id').textContent).toBe('none')
  })

  it('does not fetch students when sourceClassId is not a valid UUID', async () => {
    render(
      await ClassMigrationTab({
        sourceClassId: 'not-a-uuid',
        targetYearId: undefined,
      }),
    )

    expect(getStudentsByClass).not.toHaveBeenCalled()
    expect(screen.getByTestId('student-count').textContent).toBe('0')
  })

  it('fetches students when sourceClassId is provided', async () => {
    vi.mocked(getStudentsByClass).mockResolvedValue([
      { id: 's1', first_name: 'John', last_name: 'Doe' },
    ] as any)

    render(
      await ClassMigrationTab({
        sourceClassId: CLASS_ID,
        targetYearId: undefined,
      }),
    )

    expect(getStudentsByClass).toHaveBeenCalledWith(CLASS_ID)
    expect(screen.getByTestId('student-count').textContent).toBe('1')
  })

  it('passes the correct baseUrl to the form', async () => {
    render(
      await ClassMigrationTab({
        sourceClassId: undefined,
        targetYearId: undefined,
      }),
    )

    expect(screen.getByTestId('base-url').textContent).toBe(
      '/admin?tab=class-migration',
    )
  })

  it('passes mapped class and teacher shapes to form', async () => {
    render(
      await ClassMigrationTab({
        sourceClassId: undefined,
        targetYearId: undefined,
      }),
    )

    expect(vi.mocked(ClassMigrationForm)).toHaveBeenCalledWith(
      expect.objectContaining({
        classes: [
          expect.objectContaining({
            id: CLASS_ID,
            name: 'Year 1A',
          }),
        ],
        teachers: [
          expect.objectContaining({
            id: TEACHER_ID,
            first_name: 'Alice',
          }),
        ],
      }),
      undefined,
    )
  })
})
