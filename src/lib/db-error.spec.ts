import { DrizzleQueryError } from 'drizzle-orm'
import { describe, it, expect } from 'vitest'

import { asDbError, getUserFriendlyDbError } from './db-error'

const FALLBACK = 'Something went wrong. Please try again.'

describe('getUserFriendlyDbError', () => {
  describe('23505 — unique_violation', () => {
    it('extracts column name from detail string', () => {
      const err = {
        code: '23505',
        message: 'duplicate key value violates unique constraint',
        details: 'Key (email)=(test@example.com) already exists.',
      }
      expect(getUserFriendlyDbError(err, FALLBACK)).toBe(
        'A record with this email already exists.',
      )
    })

    it('replaces underscores with spaces in column name', () => {
      const err = {
        code: '23505',
        message: 'duplicate key value violates unique constraint',
        details: 'Key (student_code)=(ABC123) already exists.',
      }
      expect(getUserFriendlyDbError(err, FALLBACK)).toBe(
        'A record with this student code already exists.',
      )
    })

    it('returns generic message when details is missing', () => {
      const err = {
        code: '23505',
        message: 'duplicate key value violates unique constraint',
      }
      expect(getUserFriendlyDbError(err, FALLBACK)).toBe(
        'A record with this value already exists.',
      )
    })
  })

  describe('23503 — foreign_key_violation', () => {
    it('returns foreign key message', () => {
      const err = {
        code: '23503',
        message: 'insert or update violates foreign key constraint',
      }
      expect(getUserFriendlyDbError(err, FALLBACK)).toBe(
        'This record is linked to other data and cannot be changed this way.',
      )
    })
  })

  describe('23502 — not_null_violation', () => {
    it('returns not-null message', () => {
      const err = {
        code: '23502',
        message: 'null value in column violates not-null constraint',
      }
      expect(getUserFriendlyDbError(err, FALLBACK)).toBe(
        'A required field is missing.',
      )
    })
  })

  describe('23514 — check_constraint_violation', () => {
    it('returns check constraint message', () => {
      const err = {
        code: '23514',
        message: 'new row violates check constraint',
      }
      expect(getUserFriendlyDbError(err, FALLBACK)).toBe(
        'A value does not meet the required conditions.',
      )
    })
  })

  describe('P0001 — raised exception', () => {
    it('returns the exception message verbatim', () => {
      const err = {
        code: 'P0001',
        message: 'Student code "S001" is already in use',
      }
      expect(getUserFriendlyDbError(err, FALLBACK)).toBe(
        'Student code "S001" is already in use',
      )
    })
  })

  describe('postgres.js errors', () => {
    const pgError = {
      code: '23505',
      message: 'duplicate key value violates unique constraint',
      detail: 'Key (student_code)=(S001) already exists.',
      constraint_name: 'students_student_code_key',
    }

    it('reads the column from `detail`', () => {
      expect(getUserFriendlyDbError(pgError, FALLBACK)).toBe(
        'A record with this student code already exists.',
      )
    })

    it('unwraps the cause of a DrizzleQueryError', () => {
      const wrapped = new DrizzleQueryError(
        'insert into "students" …',
        ['S001'],
        Object.assign(new Error(pgError.message), pgError),
      )
      expect(getUserFriendlyDbError(wrapped, FALLBACK)).toBe(
        'A record with this student code already exists.',
      )
    })

    it('maps 22P02 (invalid input syntax)', () => {
      const err = { code: '22P02', message: 'invalid input syntax for uuid' }
      expect(getUserFriendlyDbError(err, FALLBACK)).toBe(
        'A value is not in the expected format.',
      )
    })

    it('falls back for connection errors', () => {
      const err = { code: 'CONNECTION_CLOSED', message: 'connection closed' }
      expect(getUserFriendlyDbError(err, FALLBACK)).toBe(FALLBACK)
    })
  })

  describe('unknown or non-DB errors', () => {
    it('returns fallback for unknown error code', () => {
      const err = { code: '42P01', message: 'relation does not exist' }
      expect(getUserFriendlyDbError(err, FALLBACK)).toBe(FALLBACK)
    })

    it('returns fallback for a string error', () => {
      expect(getUserFriendlyDbError('something broke', FALLBACK)).toBe(FALLBACK)
    })

    it('returns fallback for null', () => {
      expect(getUserFriendlyDbError(null, FALLBACK)).toBe(FALLBACK)
    })

    it('returns fallback for undefined', () => {
      expect(getUserFriendlyDbError(undefined, FALLBACK)).toBe(FALLBACK)
    })

    it('returns fallback for object without code property', () => {
      const err = { message: 'some error' }
      expect(getUserFriendlyDbError(err, FALLBACK)).toBe(FALLBACK)
    })
  })
})

describe('asDbError', () => {
  it('returns the code, message, detail and constraint of a wrapped error', () => {
    const cause = Object.assign(new Error('violates check constraint'), {
      code: '23514',
      detail: 'Failing row contains (…).',
      constraint_name: 'staff_payroll_bank_sort_code_check',
    })
    expect(asDbError(new DrizzleQueryError('update …', [], cause))).toEqual({
      code: '23514',
      message: 'violates check constraint',
      details: 'Failing row contains (…).',
      constraint: 'staff_payroll_bank_sort_code_check',
    })
  })

  it('reads the PostgREST `details` field', () => {
    expect(
      asDbError({ code: 'P0001', message: 'Nope', details: 'more' }),
    ).toEqual({
      code: 'P0001',
      message: 'Nope',
      details: 'more',
      constraint: undefined,
    })
  })

  it('reads the constraint of a PostgREST error from its message', () => {
    expect(
      asDbError({
        code: '23505',
        message:
          'duplicate key value violates unique constraint "students_student_code_key"',
        details: 'Key (student_code)=(GK-1001) already exists.',
      }),
    ).toMatchObject({ constraint: 'students_student_code_key' })
  })

  it('returns null for errors without a code', () => {
    expect(asDbError(new Error('boom'))).toBeNull()
    expect(asDbError('boom')).toBeNull()
    expect(asDbError(null)).toBeNull()
  })
})
