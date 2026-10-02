import { beforeEach, describe, expect, it, vi } from 'vitest'

import { getNextStudentCode, isStudentCodeTaken } from '@/db'
import { ActionError } from '@/lib/action'

import { assertStudentCodeFree, guardStudentCode } from './student-code-check'

vi.mock('@/auth/require', () => ({ getActor: vi.fn() }))
vi.mock('@/db', () => ({
  getNextStudentCode: vi.fn(),
  isStudentCodeTaken: vi.fn(),
  logAuditEvent: vi.fn(),
}))

const IN_USE =
  'Student code "GK-1005" is already in use. The next free code is GK-1007.'

async function rejectionOf(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => {
      throw new Error('expected a rejection')
    },
    (err: unknown) => err,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getNextStudentCode).mockResolvedValue('GK-1007')
})

describe('assertStudentCodeFree', () => {
  it('passes a free code', async () => {
    vi.mocked(isStudentCodeTaken).mockResolvedValue(false)

    await expect(assertStudentCodeFree('GK-1005', 'id-1')).resolves.toBe(
      undefined,
    )
    expect(isStudentCodeTaken).toHaveBeenCalledWith('GK-1005', 'id-1')
  })

  it('refuses a taken code on the code field, offering the next one', async () => {
    vi.mocked(isStudentCodeTaken).mockResolvedValue(true)

    const err = await rejectionOf(assertStudentCodeFree('GK-1005', null))

    expect(err).toBeInstanceOf(ActionError)
    expect(err).toMatchObject({
      message: IN_USE,
      fieldErrors: { student_code: IN_USE },
    })
  })
})

describe('guardStudentCode', () => {
  it('returns the result of the write', async () => {
    await expect(
      guardStudentCode('GK-1005', Promise.resolve({ id: 'x' })),
    ).resolves.toEqual({ id: 'x' })
  })

  it('reports a clash on the code constraint as a code field error', async () => {
    const err = await rejectionOf(
      guardStudentCode(
        'GK-1005',
        Promise.reject({
          code: '23505',
          constraint_name: 'students_student_code_key',
        }),
      ),
    )

    expect(err).toMatchObject({ fieldErrors: { student_code: IN_USE } })
  })

  it('rethrows any other error unchanged', async () => {
    const other = {
      code: '23505',
      message:
        'duplicate key value violates unique constraint "student_classes_one_open"',
    }

    await expect(
      guardStudentCode('GK-1005', Promise.reject(other)),
    ).rejects.toBe(other)
    expect(getNextStudentCode).not.toHaveBeenCalled()
  })
})
