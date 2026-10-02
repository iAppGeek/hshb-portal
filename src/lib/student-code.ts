/**
 * New students are offered the code after the highest `<prefix><number>` in
 * use (e.g. GK-1005 → GK-1006). Changing the prefix starts numbering again
 * from FIRST_NUMBER for codes with the new prefix; existing codes are kept.
 */
export const STUDENT_CODE_PREFIX = 'GK-'

const FIRST_NUMBER = 1001

/**
 * A Postgres regex whose one capture group is the number of a code with
 * `prefix`. At most 9 digits, so the number always fits an `int`.
 */
export function studentCodePattern(prefix = STUDENT_CODE_PREFIX): string {
  const escaped = prefix.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&')
  return `^${escaped}([0-9]{1,9})$`
}

/** The code after `highest`, the largest number in use with `prefix`. */
export function nextStudentCode(
  highest: number | null,
  prefix = STUDENT_CODE_PREFIX,
): string {
  return `${prefix}${highest === null ? FIRST_NUMBER : highest + 1}`
}

export function studentCodeInUseMessage(code: string): string {
  return `Student code "${code}" is already in use`
}
