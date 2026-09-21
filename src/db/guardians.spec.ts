import { describe, it, expect, vi, beforeEach } from 'vitest'

import {
  getGuardianCount,
  getAllGuardians,
  getGuardianChildCounts,
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

// getStudentsByGuardian and getFamilyForGuardian now validate the incoming
// id looks like a UUID (see isUuid) before interpolating it into a filter,
// so their tests need ids shaped like one rather than an arbitrary string.
const GUARDIAN_1 = '20000000-0000-0000-0000-000000000001'
const GUARDIAN_2 = '20000000-0000-0000-0000-000000000002'

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
  function mockGuardians(guardians: unknown[] | null, error: unknown = null) {
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        order: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({
            range: vi.fn().mockResolvedValue({ data: guardians, error }),
          }),
        }),
      }),
    })
  }

  it('returns guardians ordered by last name, without a child count', async () => {
    mockGuardians([
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
    ])

    const result = await getAllGuardians()
    expect(result).toEqual([
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
    ])
    expect(mockFrom).toHaveBeenCalledWith('guardians')
    // The picker forms on /students/new and /students/[id]/edit call this —
    // it must not touch students, or they pay for a scan they discard.
    expect(mockFrom).not.toHaveBeenCalledWith('students')
  })

  it('returns empty array when no guardians exist', async () => {
    mockGuardians(null)

    const result = await getAllGuardians()
    expect(result).toEqual([])
  })

  it('throws when the guardians query fails', async () => {
    mockGuardians(null, new Error('DB error'))

    await expect(getAllGuardians()).rejects.toThrow('DB error')
  })
})

describe('getGuardianChildCounts', () => {
  function mockStudents(students: unknown[] | null, error: unknown = null) {
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        order: vi.fn().mockReturnValue({
          range: vi.fn().mockResolvedValue({ data: students, error }),
        }),
      }),
    })
  }

  it('counts each guardian across all four slots', async () => {
    mockStudents([
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
    ])

    const result = await getGuardianChildCounts()
    expect(result.get('g-1')).toBe(2)
    expect(result.get('g-2')).toBe(1)
    expect(mockFrom).toHaveBeenCalledWith('students')
  })

  it('returns an empty map when there are no students', async () => {
    mockStudents(null)

    const result = await getGuardianChildCounts()
    expect(result.size).toBe(0)
  })

  // A guardian occupying two slots on the same student (e.g. primary and an
  // additional contact) must count that student once, not once per slot.
  it('counts a guardian occupying two slots on the same student once', async () => {
    mockStudents([
      {
        primary_guardian_id: 'g-1',
        secondary_guardian_id: 'g-1',
        additional_contact_1_id: null,
        additional_contact_2_id: null,
      },
    ])

    const result = await getGuardianChildCounts()
    expect(result.get('g-1')).toBe(1)
  })

  it('throws when the students query fails', async () => {
    mockStudents(null, new Error('DB error'))

    await expect(getGuardianChildCounts()).rejects.toThrow('DB error')
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

    const result = await getStudentsByGuardian(GUARDIAN_1)
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

    const result = await getStudentsByGuardian(GUARDIAN_1)
    expect(result).toEqual([])
  })

  // guardianId is interpolated into an .or() filter string; a non-UUID must
  // never reach it, or a crafted value could inject an extra disjunct.
  it('returns empty array without querying when the id is not a uuid', async () => {
    const result = await getStudentsByGuardian(`${GUARDIAN_1},active.eq.true`)
    expect(result).toEqual([])
    expect(mockFrom).not.toHaveBeenCalled()
  })
})

describe('getFamilyForGuardian', () => {
  function mockFamilyQuery(
    students: unknown[] | null,
    coGuardians: unknown[] | null = [],
    studentsError: unknown = null,
    coGuardiansError: unknown = null,
  ) {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'students') {
        return {
          select: vi.fn().mockReturnValue({
            or: vi.fn().mockReturnValue({
              is: vi.fn().mockReturnValue({
                order: vi
                  .fn()
                  .mockResolvedValue({ data: students, error: studentsError }),
              }),
            }),
          }),
        }
      }
      return {
        select: vi.fn().mockReturnValue({
          in: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({
              data: coGuardians,
              error: coGuardiansError,
            }),
          }),
        }),
      }
    })
  }

  it('returns an empty family when the guardian has no children', async () => {
    mockFamilyQuery(null)

    const result = await getFamilyForGuardian(GUARDIAN_1)
    expect(result).toEqual({ children: [], coGuardians: [] })
    expect(mockFrom).toHaveBeenCalledWith('students')
    expect(mockFrom).not.toHaveBeenCalledWith('guardians')
  })

  // guardianId is interpolated into an .or() filter string; a non-UUID must
  // never reach it, or a crafted value could inject an extra disjunct. The
  // empty family (rather than an error) lets the page's existing
  // "not found" redirect handle a malformed or stale id.
  it('returns an empty family without querying when the id is not a uuid', async () => {
    const result = await getFamilyForGuardian(`${GUARDIAN_1},active.eq.true`)
    expect(result).toEqual({ children: [], coGuardians: [] })
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('throws when the students query fails', async () => {
    mockFamilyQuery(null, [], new Error('DB error'))

    await expect(getFamilyForGuardian(GUARDIAN_1)).rejects.toThrow('DB error')
  })

  it('throws when the co-guardians query fails', async () => {
    mockFamilyQuery(
      [
        {
          id: 'student-1',
          first_name: 'Bob',
          last_name: 'Jones',
          student_code: null,
          active: true,
          leaving_reason: null,
          primary_guardian_id: GUARDIAN_2,
          primary_guardian_relationship: 'Mother',
          secondary_guardian_id: GUARDIAN_1,
          secondary_guardian_relationship: 'Father',
          additional_contact_1_id: null,
          additional_contact_1_relationship: null,
          additional_contact_2_id: null,
          additional_contact_2_relationship: null,
          student_classes: [],
        },
      ],
      null,
      null,
      new Error('DB error'),
    )

    await expect(getFamilyForGuardian(GUARDIAN_1)).rejects.toThrow('DB error')
  })

  // Postgres returns UUIDs in canonical lowercase; a mixed-case id reaching
  // this function (e.g. typed into the URL) must still match the slots
  // returned from the DB, or every child falls back to slot: 'primary' and
  // the guardian is rendered as their own co-guardian.
  it('matches slots correctly when the guardian id is mixed case', async () => {
    mockFamilyQuery([
      {
        id: 'student-1',
        first_name: 'Bob',
        last_name: 'Jones',
        student_code: null,
        active: true,
        leaving_reason: null,
        primary_guardian_id: GUARDIAN_2,
        primary_guardian_relationship: 'Mother',
        secondary_guardian_id: GUARDIAN_1,
        secondary_guardian_relationship: 'Father',
        additional_contact_1_id: null,
        additional_contact_1_relationship: null,
        additional_contact_2_id: null,
        additional_contact_2_relationship: null,
        student_classes: [],
      },
    ])

    const result = await getFamilyForGuardian(GUARDIAN_1.toUpperCase())
    expect(result.children[0]).toMatchObject({
      relationship: 'Father',
      slot: 'secondary',
    })
  })

  // A guardian occupying two slots on the same child (e.g. secondary and an
  // additional contact) must appear once in "also linked" for that child,
  // not once per slot.
  it('records a co-guardian once per child even if they occupy two slots on it', async () => {
    mockFamilyQuery(
      [
        {
          id: 'student-1',
          first_name: 'Bob',
          last_name: 'Jones',
          student_code: null,
          active: true,
          leaving_reason: null,
          primary_guardian_id: GUARDIAN_1,
          primary_guardian_relationship: 'Mother',
          secondary_guardian_id: GUARDIAN_2,
          secondary_guardian_relationship: 'Father',
          additional_contact_1_id: GUARDIAN_2,
          additional_contact_1_relationship: 'Emergency contact',
          additional_contact_2_id: null,
          additional_contact_2_relationship: null,
          student_classes: [],
        },
      ],
      [
        {
          id: GUARDIAN_2,
          first_name: 'Grace',
          last_name: 'Jones',
          phone: '07700 900002',
          email: 'grace@example.com',
        },
      ],
    )

    const result = await getFamilyForGuardian(GUARDIAN_1)
    expect(result.coGuardians).toHaveLength(1)
    expect(result.coGuardians[0].links).toEqual([
      { childId: 'student-1', childName: 'Bob Jones', slot: 'secondary' },
    ])
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
        primary_guardian_id: GUARDIAN_1,
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

    const result = await getFamilyForGuardian(GUARDIAN_1)
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
          primary_guardian_id: GUARDIAN_2,
          primary_guardian_relationship: 'Mother',
          secondary_guardian_id: GUARDIAN_1,
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
          id: GUARDIAN_2,
          first_name: 'Grace',
          last_name: 'Jones',
          phone: '07700 900002',
          email: 'grace@example.com',
        },
      ],
    )

    const result = await getFamilyForGuardian(GUARDIAN_1)
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
        id: GUARDIAN_2,
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
