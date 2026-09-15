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

const mockClasses: MigrationClass[] = [
  { id: 'class-1', name: 'Year 1A', yearCode: '2026-27' },
  { id: 'class-2', name: 'Year 2B', yearCode: '2025-26' },
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

const mockYears: MigrationYear[] = [{ id: 'year-3', code: '2027-28' }]

const mockAction = vi.fn()

const baseProps = {
  years: mockYears,
  targetYearId: 'year-3',
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
  it('renders source class dropdown with the given classes, labelled with year code', () => {
    render(
      <ClassMigrationForm {...baseProps} sourceClassId={null} students={[]} />,
    )

    expect(screen.getByLabelText(/class to migrate/i)).toBeTruthy()
    expect(screen.getByText('Year 1A (2026-27)')).toBeTruthy()
    expect(screen.getByText('Year 2B (2025-26)')).toBeTruthy()
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

    expect(screen.getByText(/no active classes available/i)).toBeTruthy()
  })

  it('does not show the create-new-class section or student list before a source is selected', () => {
    render(
      <ClassMigrationForm {...baseProps} sourceClassId={null} students={[]} />,
    )

    expect(screen.queryByTestId('student-list')).toBeNull()
    expect(screen.queryByLabelText(/class name/i)).toBeNull()
  })

  it('checks and enables "create a new class" by default when a later year exists', () => {
    render(
      <ClassMigrationForm
        {...baseProps}
        sourceClassId="class-1"
        students={mockStudents}
      />,
    )

    const checkbox = screen.getByRole('checkbox', {
      name: /create a new class/i,
    }) as HTMLInputElement
    expect(checkbox.checked).toBe(true)
    expect(checkbox.disabled).toBe(false)
    expect(screen.getByLabelText(/class name/i)).toBeTruthy()
  })

  it('disables and unchecks "create a new class" when no later year exists', () => {
    render(
      <ClassMigrationForm
        {...baseProps}
        years={[]}
        targetYearId={undefined}
        sourceClassId="class-1"
        students={mockStudents}
      />,
    )

    const checkbox = screen.getByRole('checkbox', {
      name: /create a new class/i,
    }) as HTMLInputElement
    expect(checkbox.checked).toBe(false)
    expect(checkbox.disabled).toBe(true)
    expect(
      screen.getByText(
        /create the next academic year first to move students into a new class/i,
      ),
    ).toBeTruthy()
    expect(screen.queryByLabelText(/class name/i)).toBeNull()
  })

  it('hides the new-class fields when the checkbox is unticked', () => {
    render(
      <ClassMigrationForm
        {...baseProps}
        sourceClassId="class-1"
        students={mockStudents}
      />,
    )

    fireEvent.click(
      screen.getByRole('checkbox', { name: /create a new class/i }),
    )

    expect(screen.queryByLabelText(/class name/i)).toBeNull()
    expect(screen.queryByLabelText(/year group/i)).toBeNull()
    expect(screen.queryByLabelText(/^teacher/i)).toBeNull()
  })

  it('shows the student list with a per-student action select', () => {
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
    expect(
      screen.getByTestId('student-list').querySelectorAll('select'),
    ).toHaveLength(2)
  })

  it('defaults each student action to "Move to new class" when creating a new class', () => {
    render(
      <ClassMigrationForm
        {...baseProps}
        sourceClassId="class-1"
        students={mockStudents}
      />,
    )

    const list = screen.getByTestId('student-list')
    const selects = list.querySelectorAll(
      'select',
    ) as NodeListOf<HTMLSelectElement>
    expect(selects[0].value).toBe('move')
    expect(selects).toHaveLength(2)
  })

  it('defaults each student action to "No class" when not creating a new class', () => {
    render(
      <ClassMigrationForm
        {...baseProps}
        years={[]}
        targetYearId={undefined}
        sourceClassId="class-1"
        students={mockStudents}
      />,
    )

    const list = screen.getByTestId('student-list')
    const selects = list.querySelectorAll(
      'select',
    ) as NodeListOf<HTMLSelectElement>
    expect(selects[0].value).toBe('none')
  })

  it('offers move only when creating a new class', () => {
    render(
      <ClassMigrationForm
        {...baseProps}
        years={[]}
        targetYearId={undefined}
        sourceClassId="class-1"
        students={mockStudents}
      />,
    )

    const list = screen.getByTestId('student-list')
    const select = list.querySelector('select')!
    const options = [...select.options].map((o) => o.value)
    expect(options).not.toContain('move')
    expect(options).toEqual(
      expect.arrayContaining(['none', 'left', 'graduated', 'transferred']),
    )
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
      <ClassMigrationForm
        {...baseProps}
        years={[]}
        targetYearId={undefined}
        sourceClassId={null}
        students={[]}
      />,
    )

    fireEvent.change(screen.getByLabelText(/class to migrate/i), {
      target: { value: 'class-1' },
    })

    expect(push).toHaveBeenCalledWith(
      '/admin?tab=class-migration&sourceClassId=class-1',
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

    expect(push).toHaveBeenCalledWith('/admin?tab=class-migration')
  })

  it('drops targetYearId from the URL when unticking create-a-new-class', () => {
    const push = vi.fn()
    vi.mocked(useRouter).mockReturnValue({ push } as any)

    render(
      <ClassMigrationForm
        {...baseProps}
        sourceClassId="class-1"
        students={mockStudents}
      />,
    )

    fireEvent.click(
      screen.getByRole('checkbox', { name: /create a new class/i }),
    )

    expect(push).toHaveBeenCalledWith(
      '/admin?tab=class-migration&sourceClassId=class-1',
    )
  })

  it('submits the source class id as a hidden field', () => {
    render(
      <ClassMigrationForm
        {...baseProps}
        sourceClassId="class-1"
        students={mockStudents}
      />,
    )

    const form = screen.getByText(/migrate class/i).closest('form')!
    const hidden = form.querySelector(
      'input[name="source_class_id"]',
    ) as HTMLInputElement
    expect(hidden.value).toBe('class-1')
  })

  it('submits create_new_class as a hidden field reflecting the checkbox', () => {
    render(
      <ClassMigrationForm
        {...baseProps}
        sourceClassId="class-1"
        students={mockStudents}
      />,
    )

    const form = screen.getByText(/migrate class/i).closest('form')!
    const hidden = form.querySelector(
      'input[name="create_new_class"]',
    ) as HTMLInputElement
    expect(hidden.value).toBe('true')

    fireEvent.click(
      screen.getByRole('checkbox', { name: /create a new class/i }),
    )
    expect(hidden.value).toBe('false')
  })

  it('shows the migration note about completed classes', () => {
    render(
      <ClassMigrationForm {...baseProps} sourceClassId={null} students={[]} />,
    )
    expect(
      screen.getByText(/migrating completes this class straight away/i),
    ).toBeTruthy()
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
