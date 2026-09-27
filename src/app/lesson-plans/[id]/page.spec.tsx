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
  getLessonPlanById: vi.fn(),
  getClassesByTeacher: vi.fn(),
}))

import { auth } from '@/auth'
import { getLessonPlanById, getClassesByTeacher } from '@/db'

import LessonPlanPage from './page'

beforeEach(() => {
  vi.clearAllMocks()
})

const mockPlan = {
  id: 'plan-1',
  class_id: 'class-1',
  lesson_date: '2026-03-21',
  description: 'Phonics lesson',
  created_by: 'staff-1',
  updated_by: null,
  created_at: '2026-03-21T08:00:00Z',
  updated_at: '2026-03-21T08:00:00Z',
  class: { id: 'class-1', name: 'Year 1A', year_group: 'Year 1' },
  creator: { id: 'staff-1', first_name: 'Alice', last_name: 'Smith' },
  updater: null,
}

function renderPage(id = 'plan-1') {
  return LessonPlanPage({ params: Promise.resolve({ id }) })
}

describe('LessonPlanPage', () => {
  it('redirects to /login when not authenticated', async () => {
    vi.mocked(auth).mockResolvedValue(null as any)

    await expect(renderPage()).rejects.toThrow('NEXT_REDIRECT:/login')
  })

  it('404s when the plan does not exist', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { role: 'admin', staffId: 'staff-1' },
    } as any)
    vi.mocked(getLessonPlanById).mockResolvedValue(null)

    await expect(renderPage()).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('renders the plan for admin with an edit link', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { role: 'admin', staffId: 'staff-1' },
    } as any)
    vi.mocked(getLessonPlanById).mockResolvedValue(mockPlan as any)

    render(await renderPage())

    expect(screen.getByText('Phonics lesson')).toBeTruthy()
    expect(screen.getByText('Edit')).toBeTruthy()
  })

  it('404s for a teacher viewing a plan outside their classes', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { role: 'teacher', staffId: 'staff-3' },
    } as any)
    vi.mocked(getLessonPlanById).mockResolvedValue(mockPlan as any)
    vi.mocked(getClassesByTeacher).mockResolvedValue([
      { id: 'other-class' },
    ] as any)

    await expect(renderPage()).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('renders the plan for a teacher who owns the class', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { role: 'teacher', staffId: 'staff-3' },
    } as any)
    vi.mocked(getLessonPlanById).mockResolvedValue(mockPlan as any)
    vi.mocked(getClassesByTeacher).mockResolvedValue([{ id: 'class-1' }] as any)

    render(await renderPage())

    expect(screen.getByText('Phonics lesson')).toBeTruthy()
  })
})
