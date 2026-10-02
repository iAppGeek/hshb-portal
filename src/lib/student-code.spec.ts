import { describe, expect, it } from 'vitest'

import {
  nextStudentCode,
  STUDENT_CODE_PREFIX,
  studentCodeInUseMessage,
  studentCodePattern,
} from './student-code'

function numberOf(code: string, prefix?: string): string | null {
  return new RegExp(studentCodePattern(prefix)).exec(code)?.[1] ?? null
}

describe('studentCodePattern', () => {
  it('captures the number of a code with the prefix', () => {
    expect(numberOf(`${STUDENT_CODE_PREFIX}1005`)).toBe('1005')
    expect(numberOf('GK-0042', 'GK-')).toBe('0042')
  })

  it('ignores other prefixes, suffixes and non-numbers', () => {
    expect(numberOf('XX-1005', 'GK-')).toBeNull()
    expect(numberOf('GK-1005a', 'GK-')).toBeNull()
    expect(numberOf('GK-', 'GK-')).toBeNull()
    expect(numberOf('AGK-1005', 'GK-')).toBeNull()
  })

  it('caps the number at 9 digits', () => {
    expect(numberOf('GK-123456789', 'GK-')).toBe('123456789')
    expect(numberOf('GK-1234567890', 'GK-')).toBeNull()
  })

  it('treats regex characters in the prefix literally', () => {
    expect(numberOf('A.B-7', 'A.B-')).toBe('7')
    expect(numberOf('AxB-7', 'A.B-')).toBeNull()
  })
})

describe('nextStudentCode', () => {
  it('adds one to the highest number in use', () => {
    expect(nextStudentCode(1005, 'GK-')).toBe('GK-1006')
    expect(nextStudentCode(9999, 'GK-')).toBe('GK-10000')
  })

  it('starts at 1001 when no code has the prefix', () => {
    expect(nextStudentCode(null, 'HS-')).toBe('HS-1001')
  })

  it('uses STUDENT_CODE_PREFIX by default', () => {
    expect(nextStudentCode(1)).toBe(`${STUDENT_CODE_PREFIX}2`)
  })
})

describe('studentCodeInUseMessage', () => {
  it('names the code', () => {
    expect(studentCodeInUseMessage('GK-1005')).toBe(
      'Student code "GK-1005" is already in use',
    )
  })
})
