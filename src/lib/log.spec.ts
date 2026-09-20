import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

import { logError } from './log'

let consoleError: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  consoleError.mockRestore()
})

describe('logError', () => {
  it('logs the scope and the error message on one line', () => {
    logError('students.save', new Error('boom'))

    expect(consoleError).toHaveBeenCalledWith('[students.save]', {
      message: 'boom',
    })
  })

  it('includes the code and details of a database error', () => {
    logError('students.save', {
      code: '23505',
      message: 'duplicate key',
      details: 'Key (student_code)=(S001) already exists.',
    })

    expect(consoleError).toHaveBeenCalledWith('[students.save]', {
      code: '23505',
      message: 'duplicate key',
      details: 'Key (student_code)=(S001) already exists.',
    })
  })

  it('merges the context into the payload', () => {
    logError('attendance.save', new Error('boom'), {
      classId: 'class-1',
      date: '2026-01-05',
    })

    expect(consoleError).toHaveBeenCalledWith('[attendance.save]', {
      message: 'boom',
      classId: 'class-1',
      date: '2026-01-05',
    })
  })

  it('stringifies a thrown value that is not an error', () => {
    logError('test.scope', 'something went wrong')

    expect(consoleError).toHaveBeenCalledWith('[test.scope]', {
      message: 'something went wrong',
    })
  })
})
