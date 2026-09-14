import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { useRouter } from 'next/navigation'

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(() => ({ push: vi.fn() })),
}))

import ClassMigrationForm from './ClassMigrationForm'
import type {
  MigrationYear,
  MigrationClass,
  MigrationTeacher,
  MigrationStudent,
} from './ClassMigrationForm'

const BASE_URL = '/admin?tab=class-migration'

const mockYears: MigrationYear[] = [
  { id: 'year-2', code: '2026-27' },
  { id: 'year-1', code: '2025-26' },
]

const mockClasses: MigrationClass[] = [
  { id: 'class-1', name: 'Year 1A', year_group: '1' },
  { id: 'class-2', name: 'Year 2B', year_group: '2' },
]

const mockTeachers: MigrationTeacher[] = [
  {
    id: 'teacher-1',
    first_name: 'Alice',
    last_name: 'Smith',
    display_name: null,
  },
]

const mockStudents: MigrationStudent[] = [
  { id: 'student-1', first_name: 'John', last_name: 'Doe' },
  { id: 'student-2', first_name: 'Jane', last_name: 'Roe' },
]

const mockAction = vi.fn()

const baseProps = {
  years: mockYears,
  targetYearId: 'year-2',
  classes: mockClasses,
  teachers: mockTeachers,
  action: mockAction,
  baseUrl: BASE_URL,
}

beforeEach(() => {
  vi.clearAllMocks()
  mockAction.mockResolvedValue(undefined)
})

describe('ClassMigrationForm', () => {
  it('renders the target year select with all years', () => {
    render(
      <ClassMigrationForm {...baseProps} sourceClassId={null} students={[]} />,
    )

    expect(screen.getByLabelText(/migrate into academic year/i)).toBeTruthy()
    expect(screen.getByText('2026-27')).toBeTruthy()
    expect(screen.getByText('2025-26')).toBeTruthy()
  })

  it('renders source class dropdown with the given classes', () => {
    render(
      <ClassMigrationForm {...baseProps} sourceClassId={null} students={[]} />,
    )

    expect(screen.getByLabelText(/class to migrate/i)).toBeTruthy()
    expect(screen.getByText('Year 1A (Year 1)')).toBeTruthy()
    expect(screen.getByText('Year 2B (Year 2)')).toBeTruthy()
  })

  it('shows a note when there are no source classes', () => {
    render(
      <ClassMigrationForm
        {...baseProps}
        classes={[]}
        sourceClassId={null}
        students={[]}
      />,
    )

    expect(
      screen.getByText(/no active classes in the year before/i),
    ).toBeTruthy()
  })

  it('renders new class detail fields', () => {
    render(
      <ClassMigrationForm {...baseProps} sourceClassId={null} students={[]} />,
    )

    expect(screen.getByLabelText(/class name/i)).toBeTruthy()
    expect(screen.getByLabelText(/year group/i)).toBeTruthy()
    expect(screen.getByLabelText(/teacher/i)).toBeTruthy()
  })

  it('shows student list when sourceClassId is set', () => {
    render(
      <ClassMigrationForm
        {...baseProps}
        sourceClassId="class-1"
        students={mockStudents}
      />,
    )

    expect(screen.getByTestId('student-list')).toBeTruthy()
    expect(screen.getByText('Doe, John')).toBeTruthy()
    expect(screen.getByText('Roe, Jane')).toBeTruthy()
  })

  it('does not show student list when no source selected', () => {
    render(
      <ClassMigrationForm {...baseProps} sourceClassId={null} students={[]} />,
    )

    expect(screen.queryByTestId('student-list')).toBeNull()
  })

  it('pushes with sourceClassId when source class selection changes', () => {
    const push = vi.fn()
    vi.mocked(useRouter).mockReturnValue({ push } as any)

    render(
      <ClassMigrationForm {...baseProps} sourceClassId={null} students={[]} />,
    )

    fireEvent.change(screen.getByLabelText(/class to migrate/i), {
      target: { value: 'class-1' },
    })

    expect(push).toHaveBeenCalledWith(
      '/admin?tab=class-migration&targetYearId=year-2&sourceClassId=class-1',
    )
  })

  it('pushes without sourceClassId when selection is cleared', () => {
    const push = vi.fn()
    vi.mocked(useRouter).mockReturnValue({ push } as any)

    render(
      <ClassMigrationForm
        {...baseProps}
        sourceClassId="class-1"
        students={mockStudents}
      />,
    )

    fireEvent.change(screen.getByLabelText(/class to migrate/i), {
      target: { value: '' },
    })

    expect(push).toHaveBeenCalledWith(
      '/admin?tab=class-migration&targetYearId=year-2',
    )
  })

  it('pushes with the new target year, dropping the source selection', () => {
    const push = vi.fn()
    vi.mocked(useRouter).mockReturnValue({ push } as any)

    render(
      <ClassMigrationForm
        {...baseProps}
        sourceClassId="class-1"
        students={mockStudents}
      />,
    )

    fireEvent.change(screen.getByLabelText(/migrate into academic year/i), {
      target: { value: 'year-1' },
    })

    expect(push).toHaveBeenCalledWith(
      '/admin?tab=class-migration&targetYearId=year-1',
    )
  })

  it('submits the target year as a hidden field', () => {
    render(
      <ClassMigrationForm
        {...baseProps}
        sourceClassId="class-1"
        students={mockStudents}
      />,
    )

    const form = screen.getByText(/migrate class/i).closest('form')!
    const hidden = form.querySelector(
      'input[name="academic_year_id"]',
    ) as HTMLInputElement
    expect(hidden.value).toBe('year-2')
  })

  it('calls action on form submit', async () => {
    render(
      <ClassMigrationForm
        {...baseProps}
        sourceClassId="class-1"
        students={mockStudents}
      />,
    )

    fireEvent.submit(screen.getByText(/migrate class/i).closest('form')!)

    await vi.waitFor(() => {
      expect(mockAction).toHaveBeenCalled()
    })
  })

  it('displays error returned from action', async () => {
    mockAction.mockResolvedValue({ error: 'Source class is already inactive' })

    render(
      <ClassMigrationForm
        {...baseProps}
        sourceClassId="class-1"
        students={mockStudents}
      />,
    )

    fireEvent.submit(screen.getByText(/migrate class/i).closest('form')!)

    await vi.waitFor(() => {
      expect(screen.getByText('Source class is already inactive')).toBeTruthy()
    })
  })
})
