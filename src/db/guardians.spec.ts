import { describe, it, expect, vi, beforeEach } from 'vitest'
import { updateTag } from 'next/cache'

import {
  getGuardianCount,
  getAllGuardians,
  createGuardian,
  getGuardianById,
  getStudentsByGuardian,
  getFamilyForGuardian,
  updateGuardian,
  findGuardianMatches,
} from './guardians'

beforeEach(() => {
  vi.clearAllMocks()
})

const mockFrom = vi.hoisted(() => vi.fn())
const mockRpc = vi.hoisted(() => vi.fn())

vi.mock('next/cache', () => ({
  unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
  updateTag: vi.fn(),
}))

vi.mock('./client', () => ({
  supabase: { from: mockFrom, rpc: mockRpc },
}))

describe('getGuardianCount', () => {
  it('returns the total number of guardians', async () => {
    mockFrom.mockReturnValue({
      select: vi.fn().mockResolvedValue({ count: 12, error: null }),
    })

    const result = await getGuardianCount()
    expect(result).toBe(12)
    expect(mockFrom).toHaveBeenCalledWith('guardians')
  })

  it('returns 0 when count is null', async () => {
    mockFrom.mockReturnValue({
      select: vi.fn().mockResolvedValue({ count: null, error: null }),
    })

    const result = await getGuardianCount()
    expect(result).toBe(0)
  })

  it('throws on database error', async () => {
    mockFrom.mockReturnValue({
      select: vi
        .fn()
        .mockResolvedValue({ count: null, error: { message: 'DB error' } }),
    })

    await expect(getGuardianCount()).rejects.toEqual({ message: 'DB error' })
  })
})

describe('getAllGuardians', () => {
  function mockGuardiansAndStudents(
    guardians: unknown[] | null,
    students: unknown[] | null,
  ) {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'guardians') {
        return {
          select: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: guardians }),
          }),
        }
      }
      return {
        select: vi.fn().mockResolvedValue({ data: students }),
      }
    })
  }

  it('returns guardians ordered by last name with a child count per guardian', async () => {
    mockGuardiansAndStudents(
      [
        {
          id: 'g-1',
          first_name: 'Maria',
          last_name: 'Smith',
          phone: '07700 900000',
          email: 'maria@example.com',
        },
        {
          id: 'g-2',
          first_name: 'John',
          last_name: 'Doe',
          phone: '07700 900001',
          email: null,
        },
      ],
      [
        {
          primary_guardian_id: 'g-1',
          secondary_guardian_id: null,
          additional_contact_1_id: null,
          additional_contact_2_id: null,
        },
        {
          primary_guardian_id: 'g-2',
          secondary_guardian_id: 'g-1',
          additional_contact_1_id: null,
          additional_contact_2_id: null,
        },
      ],
    )

    const result = await getAllGuardians()
    expect(result).toEqual([
      {
        id: 'g-1',
        first_name: 'Maria',
        last_name: 'Smith',
        phone: '07700 900000',
        email: 'maria@example.com',
        child_count: 2,
      },
      {
        id: 'g-2',
        first_name: 'John',
        last_name: 'Doe',
        phone: '07700 900001',
        email: null,
        child_count: 1,
      },
    ])
    expect(mockFrom).toHaveBeenCalledWith('guardians')
    expect(mockFrom).toHaveBeenCalledWith('students')
  })

  it('returns empty array when no guardians exist', async () => {
    mockGuardiansAndStudents(null, null)

    const result = await getAllGuardians()
    expect(result).toEqual([])
  })

  it('gives a guardian with no linked students a zero count', async () => {
    mockGuardiansAndStudents(
      [
        {
          id: 'g-1',
          first_name: 'Maria',
          last_name: 'Smith',
          phone: '07700 900000',
          email: null,
        },
      ],
      null,
    )

    const result = await getAllGuardians()
    expect(result[0].child_count).toBe(0)
  })
})

describe('createGuardian', () => {
  it('inserts a guardian and returns the id', async () => {
    mockFrom.mockReturnValue({
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: { id: 'guardian-1' },
            error: null,
          }),
        }),
      }),
    })

    const result = await createGuardian({
      first_name: 'Maria',
      last_name: 'Papadopoulos',
      phone: '07700 900000',
      email: 'maria@example.com',
    })

    expect(result).toEqual({ id: 'guardian-1' })
    expect(mockFrom).toHaveBeenCalledWith('guardians')
    expect(updateTag).toHaveBeenCalledWith('students')
  })

  it('sends occupation through to the insert', async () => {
    const insert = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: { id: 'guardian-1' },
          error: null,
        }),
      }),
    })
    mockFrom.mockReturnValue({ insert })

    await createGuardian({
      first_name: 'Maria',
      last_name: 'Papadopoulos',
      phone: '07700 900000',
      occupation: 'Teacher',
    })

    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ occupation: 'Teacher' }),
    )
  })

  it('throws when the database returns an error', async () => {
    mockFrom.mockReturnValue({
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: null,
            error: new Error('DB error'),
          }),
        }),
      }),
    })

    await expect(
      createGuardian({ first_name: 'A', last_name: 'B', phone: '07700' }),
    ).rejects.toThrow('DB error')
  })
})

describe('getGuardianById', () => {
  it('returns a guardian by id', async () => {
    const mockGuardian = {
      id: 'guardian-1',
      first_name: 'Maria',
      last_name: 'Smith',
      phone: '07700 900000',
      email: 'maria@example.com',
      occupation: 'Teacher',
      address_line_1: null,
      address_line_2: null,
      city: null,
      postcode: null,
      notes: null,
    }
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: mockGuardian }),
        }),
      }),
    })

    const result = await getGuardianById('guardian-1')
    expect(result).toEqual(mockGuardian)
    expect(mockFrom).toHaveBeenCalledWith('guardians')
  })

  // The select list is explicit, so a new column must be named or it is
  // silently absent from every screen that reads this row.
  it('selects the occupation column', async () => {
    const select = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data: null }),
      }),
    })
    mockFrom.mockReturnValue({ select })

    await getGuardianById('guardian-1')

    expect(select).toHaveBeenCalledWith(expect.stringContaining('occupation'))
  })

  it('returns null when guardian not found', async () => {
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: null }),
        }),
      }),
    })

    const result = await getGuardianById('missing-id')
    expect(result).toBeNull()
  })
})

describe('getStudentsByGuardian', () => {
  it('returns students linked to the guardian', async () => {
    const mockStudents = [
      {
        id: 'student-1',
        first_name: 'Anna',
        last_name: 'Smith',
        student_code: 'S001',
      },
    ]
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        or: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: mockStudents }),
          }),
        }),
      }),
    })

    const result = await getStudentsByGuardian('guardian-1')
    expect(result).toEqual(mockStudents)
    expect(mockFrom).toHaveBeenCalledWith('students')
  })

  it('returns empty array when no students are linked', async () => {
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        or: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: null }),
          }),
        }),
      }),
    })

    const result = await getStudentsByGuardian('guardian-1')
    expect(result).toEqual([])
  })
})

describe('getFamilyForGuardian', () => {
  function mockFamilyQuery(
    students: unknown[] | null,
    coGuardians: unknown[] | null = [],
  ) {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'students') {
        return {
          select: vi.fn().mockReturnValue({
            or: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({ data: students }),
            }),
          }),
        }
      }
      return {
        select: vi.fn().mockReturnValue({
          in: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: coGuardians }),
          }),
        }),
      }
    })
  }

  it('returns an empty family when the guardian has no children', async () => {
    mockFamilyQuery(null)

    const result = await getFamilyForGuardian('guardian-1')
    expect(result).toEqual({ children: [], coGuardians: [] })
    expect(mockFrom).toHaveBeenCalledWith('students')
    expect(mockFrom).not.toHaveBeenCalledWith('guardians')
  })

  it('includes leavers, tagged with their slot and relationship', async () => {
    mockFamilyQuery([
      {
        id: 'student-1',
        first_name: 'Alice',
        last_name: 'Smith',
        student_code: 'S001',
        active: false,
        leaving_reason: 'graduated',
        primary_guardian_id: 'guardian-1',
        primary_guardian_relationship: 'Mother',
        secondary_guardian_id: null,
        secondary_guardian_relationship: null,
        additional_contact_1_id: null,
        additional_contact_1_relationship: null,
        additional_contact_2_id: null,
        additional_contact_2_relationship: null,
        student_classes: [],
      },
    ])

    const result = await getFamilyForGuardian('guardian-1')
    expect(result.children).toEqual([
      {
        id: 'student-1',
        first_name: 'Alice',
        last_name: 'Smith',
        student_code: 'S001',
        active: false,
        leaving_reason: 'graduated',
        relationship: 'Mother',
        slot: 'primary',
        classes: [],
      },
    ])
    expect(result.coGuardians).toEqual([])
  })

  // The case a different primary guardian per child hinges on: the anchor
  // guardian is secondary for one child and the query still surfaces the
  // child's primary guardian as a co-guardian.
  it('surfaces the other guardian on a child with a different primary', async () => {
    mockFamilyQuery(
      [
        {
          id: 'student-1',
          first_name: 'Bob',
          last_name: 'Jones',
          student_code: null,
          active: true,
          leaving_reason: null,
          primary_guardian_id: 'guardian-2',
          primary_guardian_relationship: 'Mother',
          secondary_guardian_id: 'guardian-1',
          secondary_guardian_relationship: 'Father',
          additional_contact_1_id: null,
          additional_contact_1_relationship: null,
          additional_contact_2_id: null,
          additional_contact_2_relationship: null,
          student_classes: [
            { class: { id: 'class-1', name: 'Year 3A' } },
            { class: null },
          ],
        },
      ],
      [
        {
          id: 'guardian-2',
          first_name: 'Grace',
          last_name: 'Jones',
          phone: '07700 900002',
          email: 'grace@example.com',
        },
      ],
    )

    const result = await getFamilyForGuardian('guardian-1')
    expect(result.children).toEqual([
      {
        id: 'student-1',
        first_name: 'Bob',
        last_name: 'Jones',
        student_code: null,
        active: true,
        leaving_reason: null,
        relationship: 'Father',
        slot: 'secondary',
        classes: [{ id: 'class-1', name: 'Year 3A' }],
      },
    ])
    expect(result.coGuardians).toEqual([
      {
        id: 'guardian-2',
        first_name: 'Grace',
        last_name: 'Jones',
        phone: '07700 900002',
        email: 'grace@example.com',
        links: [
          { childId: 'student-1', childName: 'Bob Jones', slot: 'primary' },
        ],
      },
    ])
  })
})

describe('updateGuardian', () => {
  it('updates a guardian successfully', async () => {
    const mockUpdate = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    })
    mockFrom.mockReturnValue({ update: mockUpdate })

    await updateGuardian('guardian-1', {
      first_name: 'Maria',
      last_name: 'Smith',
      phone: '07700 900000',
    })

    expect(mockFrom).toHaveBeenCalledWith('guardians')
    expect(mockUpdate).toHaveBeenCalled()
    expect(updateTag).toHaveBeenCalledWith('students')
  })

  it('throws when the database returns an error', async () => {
    mockFrom.mockReturnValue({
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: new Error('DB error') }),
      }),
    })

    await expect(
      updateGuardian('guardian-1', {
        first_name: 'A',
        last_name: 'B',
        phone: '07700',
      }),
    ).rejects.toThrow('DB error')
    expect(updateTag).not.toHaveBeenCalled()
  })
})

describe('findGuardianMatches', () => {
  it('passes args through to the rpc', async () => {
    mockRpc.mockResolvedValue({
      data: [
        {
          id: 'guardian-1',
          first_name: 'Maria',
          last_name: 'Smith',
          phone: '07700 900000',
          email: 'maria@example.com',
          matched_on: 'email',
        },
      ],
      error: null,
    })

    const result = await findGuardianMatches({
      email: 'maria@example.com',
      phone: '07700 900000',
      lastName: 'Smith',
    })

    expect(result).toHaveLength(1)
    expect(mockRpc).toHaveBeenCalledWith('find_guardian_matches', {
      p_email: 'maria@example.com',
      p_phone: '07700 900000',
      p_last_name: 'Smith',
    })
  })

  it('returns empty array when data is null', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null })

    const result = await findGuardianMatches({
      email: null,
      phone: '07700 900000',
      lastName: 'Smith',
    })
    expect(result).toEqual([])
  })

  it('throws the rpc error', async () => {
    mockRpc.mockResolvedValue({ data: null, error: new Error('rpc failed') })

    await expect(
      findGuardianMatches({
        email: null,
        phone: '07700 900000',
        lastName: 'Smith',
      }),
    ).rejects.toThrow('rpc failed')
  })
})
