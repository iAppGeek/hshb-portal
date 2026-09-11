import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'

vi.mock('@/auth', () => ({
  auth: vi.fn(),
}))

vi.mock('@/db', () => ({
  getClassWithStudents: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`)
  }),
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

vi.mock('@/clientComponents/BulkEmailDropdown', () => ({
  default: () => <div>BulkEmailDropdown</div>,
}))

vi.mock('./PrintButton', () => ({
  default: () => <button>Print</button>,
}))

import { auth } from '@/auth'
import { getClassWithStudents } from '@/db'

import ClassRegisterPage from './page'

type MockStudent = {
  id: string
  student_code: string | null
  first_name: string
  last_name: string
  allergies: string | null
  primary_guardian: {
    first_name: string
    last_name: string
    phone: string | null
    email: string | null
  } | null
  secondary_guardian: null
}

function makeStudent(overrides: Partial<MockStudent> = {}): MockStudent {
  return {
    id: 'student-1',
    student_code: 'S001',
    first_name: 'Nikos',
    last_name: 'Papadopoulos',
    allergies: null,
    primary_guardian: {
      first_name: 'Maria',
      last_name: 'Papadopoulos',
      phone: '07700 900000',
      email: 'maria@example.com',
    },
    secondary_guardian: null,
    ...overrides,
  }
}

function makeClass(students: MockStudent[] = [makeStudent()]): unknown {
  return {
    id: 'class-1',
    name: 'Alpha',
    year_group: '1',
    academic_year: '2025-26',
    teacher_id: 'staff-1',
    teacher: {
      first_name: 'Tom',
      last_name: 'Teacher',
      display_name: null,
      email: 'tom.teacher@hshb.org.uk',
    },
    student_classes: students.map((student) => ({ student })),
  }
}

function mockSession(role: string, staffId = 'staff-1'): void {
  vi.mocked(auth).mockResolvedValue({
    user: { role, staffId },
  } as unknown as Awaited<ReturnType<typeof auth>>)
}

function mockClass(cls: unknown): void {
  vi.mocked(getClassWithStudents).mockResolvedValue(
    cls as Awaited<ReturnType<typeof getClassWithStudents>>,
  )
}

async function renderPage(): Promise<void> {
  render(
    await ClassRegisterPage({ params: Promise.resolve({ id: 'class-1' }) }),
  )
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('ClassRegisterPage', () => {
  it('redirects to /login when there is no session', async () => {
    vi.mocked(auth).mockResolvedValue(
      null as unknown as Awaited<ReturnType<typeof auth>>,
    )
    await expect(renderPage()).rejects.toThrow('REDIRECT:/login')
  })

  it("redirects a teacher away from another teacher's class", async () => {
    mockSession('teacher', 'staff-2')
    mockClass(makeClass())
    await expect(renderPage()).rejects.toThrow('REDIRECT:/classes')
  })

  it("shows the teacher's work email as a mailto link, not a phone number", async () => {
    mockSession('admin')
    mockClass(makeClass())
    await renderPage()

    const link = screen.getByRole('link', { name: 'tom.teacher@hshb.org.uk' })
    expect(link).toHaveAttribute('href', 'mailto:tom.teacher@hshb.org.uk')
    expect(document.querySelectorAll('a[href^="tel:"]')).toHaveLength(1)
  })

  it('shows a Student ID column with each student code', async () => {
    mockSession('admin')
    mockClass(makeClass())
    await renderPage()

    expect(
      screen.getByRole('columnheader', { name: 'Student ID' }),
    ).toBeInTheDocument()
    const row = screen.getByRole('row', { name: /Nikos/ })
    expect(within(row).getByText('S001')).toBeInTheDocument()
  })

  it('shows a dash when a student has no code', async () => {
    mockSession('admin')
    mockClass(makeClass([makeStudent({ student_code: null })]))
    await renderPage()

    const row = screen.getByRole('row', { name: /Nikos/ })
    expect(within(row).getAllByRole('cell')[1]).toHaveTextContent('—')
  })

  it('labels the guardian column "Primary Contact"', async () => {
    mockSession('admin')
    mockClass(makeClass())
    await renderPage()

    expect(
      screen.getByRole('columnheader', { name: 'Primary Contact' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('columnheader', { name: 'Guardian' }),
    ).not.toBeInTheDocument()
  })
})
