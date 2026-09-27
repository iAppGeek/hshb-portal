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
}))

vi.mock('@/db', () => ({
  getLessonPlans: vi.fn(),
  getClassesByTeacher: vi.fn(),
}))

import { auth } from '@/auth'
import { getLessonPlans, getClassesByTeacher } from '@/db'

import LessonPlansPage from './page'

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

async function renderPage(searchParams: { classId?: string } = {}) {
  render(await LessonPlansPage({ searchParams: Promise.resolve(searchParams) }))
}

describe('LessonPlansPage', () => {
  it('redirects to /login when not authenticated', async () => {
    vi.mocked(auth).mockResolvedValue(null as any)

    await expect(
      LessonPlansPage({ searchParams: Promise.resolve({}) }),
    ).rejects.toThrow('NEXT_REDIRECT:/login')
  })

  it('renders lesson plans for admin with an add button and edit links', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { role: 'admin', staffId: 'staff-1' },
    } as any)
    vi.mocked(getLessonPlans).mockResolvedValue([mockPlan] as any)

    await renderPage()

    expect(screen.getByText('Add lesson plan')).toBeTruthy()
    expect(screen.getAllByText('Year 1A').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Edit').length).toBeGreaterThan(0)
    expect(screen.getAllByText('View').length).toBeGreaterThan(0)
  })

  it('renders lesson plans for teacher with an add button and edit links', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { role: 'teacher', staffId: 'staff-3' },
    } as any)
    vi.mocked(getClassesByTeacher).mockResolvedValue([{ id: 'class-1' }] as any)
    vi.mocked(getLessonPlans).mockResolvedValue([mockPlan] as any)

    await renderPage()

    expect(screen.getByText('Add lesson plan')).toBeTruthy()
    expect(screen.getAllByText('Edit').length).toBeGreaterThan(0)
    expect(
      screen.getByText(
        'You can only view and create lesson plans for your class.',
      ),
    ).toBeTruthy()
  })

  it('scopes lesson plans to teacher classes only', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { role: 'teacher', staffId: 'staff-3' },
    } as any)
    vi.mocked(getClassesByTeacher).mockResolvedValue([{ id: 'class-1' }] as any)
    vi.mocked(getLessonPlans).mockResolvedValue([])

    await renderPage()

    expect(getClassesByTeacher).toHaveBeenCalledWith('staff-3')
    expect(getLessonPlans).toHaveBeenCalledWith({
      classIds: ['class-1'],
      limit: 50,
    })
  })

  it('fetches all lesson plans for admin without scoping', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { role: 'admin', staffId: 'staff-1' },
    } as any)
    vi.mocked(getLessonPlans).mockResolvedValue([])

    await renderPage()

    expect(getLessonPlans).toHaveBeenCalledWith({
      classId: undefined,
      limit: 50,
    })
    expect(getClassesByTeacher).not.toHaveBeenCalled()
  })

  it('filters by the classId search param for admin', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { role: 'admin', staffId: 'staff-1' },
    } as any)
    vi.mocked(getLessonPlans).mockResolvedValue([])

    await renderPage({ classId: 'class-1' })

    expect(getLessonPlans).toHaveBeenCalledWith({
      classId: 'class-1',
      limit: 50,
    })
  })

  it('renders lesson plans for secretary without an add button', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { role: 'secretary', staffId: 'staff-4' },
    } as any)
    vi.mocked(getLessonPlans).mockResolvedValue([mockPlan] as any)

    await renderPage()

    expect(screen.queryByText('Add lesson plan')).toBeNull()
    expect(screen.getAllByText('Edit').length).toBeGreaterThan(0)
  })

  it('fetches all lesson plans for secretary without scoping', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { role: 'secretary', staffId: 'staff-4' },
    } as any)
    vi.mocked(getLessonPlans).mockResolvedValue([])

    await renderPage()

    expect(getLessonPlans).toHaveBeenCalledWith({
      classId: undefined,
      limit: 50,
    })
    expect(getClassesByTeacher).not.toHaveBeenCalled()
  })
})
