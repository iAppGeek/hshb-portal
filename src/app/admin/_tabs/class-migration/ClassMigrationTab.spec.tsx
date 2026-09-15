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
    ({
      sourceClassId,
      students,
      classes,
      teachers,
      baseUrl,
      targetYearId,
      years,
    }) => (
      <div data-testid="migration-form">
        <span data-testid="source-class-id">{sourceClassId ?? 'none'}</span>
        <span data-testid="student-count">{students.length}</span>
        <span data-testid="class-count">{classes.length}</span>
        <span data-testid="teacher-count">{teachers.length}</span>
        <span data-testid="base-url">{baseUrl}</span>
        <span data-testid="target-year-id">{targetYearId ?? 'none'}</span>
        <span data-testid="available-years">{years.length}</span>
        {classes.map((c: { id: string; name: string; yearCode: string }) => (
          <span key={c.id}>
            {c.name} ({c.yearCode})
          </span>
        ))}
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

const nextYear = {
  id: 'year-3',
  code: '2027-28',
  start_date: '2027-09-01',
  end_date: '2028-08-31',
}
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
    nextYear,
    currentYear,
    previousYear,
  ] as any)
  vi.mocked(getCurrentAcademicYear).mockResolvedValue(currentYear as any)
  vi.mocked(getClassesByAcademicYear).mockImplementation(
    async (yearId: string) => {
      if (yearId === currentYear.id) {
        return [{ id: CLASS_ID, name: 'Year 1A', active: true }] as any
      }
      return [] as any
    },
  )
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
  it('lists active classes across every year up to and including the current year', async () => {
    render(
      await ClassMigrationTab({
        sourceClassId: undefined,
        targetYearId: undefined,
      }),
    )

    expect(getClassesByAcademicYear).toHaveBeenCalledWith(previousYear.id)
    expect(getClassesByAcademicYear).toHaveBeenCalledWith(currentYear.id)
    // Classes from a future year are never fetched as migration sources.
    expect(getClassesByAcademicYear).not.toHaveBeenCalledWith(nextYear.id)
    expect(screen.getByTestId('class-count').textContent).toBe('1')
    expect(screen.getByText('Year 1A (2026-27)')).toBeTruthy()
  })

  it('excludes inactive classes from the source list', async () => {
    vi.mocked(getClassesByAcademicYear).mockResolvedValue([
      { id: CLASS_ID, name: 'Year 1A', active: false },
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
    // No source selected, so there's nothing to compute target years from.
    expect(screen.getByTestId('available-years').textContent).toBe('0')
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

  it('fetches students and offers years after the source class year as targets', async () => {
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
    // Only the year after the source's own (current) year is offered.
    expect(screen.getByTestId('available-years').textContent).toBe('1')
    expect(screen.getByTestId('target-year-id').textContent).toBe(nextYear.id)
  })

  it('ignores an explicit targetYearId that is not after the source year', async () => {
    render(
      await ClassMigrationTab({
        sourceClassId: CLASS_ID,
        targetYearId: previousYear.id,
      }),
    )

    expect(screen.getByTestId('target-year-id').textContent).toBe(nextYear.id)
  })

  it("offers last year's class the current year first, and never a past year", async () => {
    const PAST_CLASS_ID = '00000000-0000-4000-8000-000000000003'
    const olderYear = {
      id: 'year-0',
      code: '2024-25',
      start_date: '2024-09-01',
      end_date: '2025-08-31',
    }
    vi.mocked(getAcademicYears).mockResolvedValue([
      nextYear,
      currentYear,
      previousYear,
      olderYear,
    ] as any)
    vi.mocked(getClassesByAcademicYear).mockImplementation(
      async (yearId: string) =>
        yearId === olderYear.id
          ? ([{ id: PAST_CLASS_ID, name: 'Year 5A', active: true }] as any)
          : ([] as any),
    )

    render(
      await ClassMigrationTab({
        sourceClassId: PAST_CLASS_ID,
        targetYearId: previousYear.id,
      }),
    )

    expect(screen.getByTestId('source-class-id').textContent).toBe(
      PAST_CLASS_ID,
    )
    // 2025-26 is after the source year but before the current year.
    expect(screen.getByTestId('available-years').textContent).toBe('2')
    expect(screen.getByTestId('target-year-id').textContent).toBe(
      currentYear.id,
    )
  })

  it('respects an explicit targetYearId that is a valid later year', async () => {
    render(
      await ClassMigrationTab({
        sourceClassId: CLASS_ID,
        targetYearId: nextYear.id,
      }),
    )

    expect(screen.getByTestId('target-year-id').textContent).toBe(nextYear.id)
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

  it('passes mapped teacher shapes to form', async () => {
    render(
      await ClassMigrationTab({
        sourceClassId: undefined,
        targetYearId: undefined,
      }),
    )

    expect(vi.mocked(ClassMigrationForm)).toHaveBeenCalledWith(
      expect.objectContaining({
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
