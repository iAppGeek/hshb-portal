import 'server-only'

import { getNextStudentCode, isStudentCodeTaken } from '@/db'
import { ActionError } from '@/lib/action'
import { asDbError } from '@/lib/db-error'
import { studentCodeInUseMessage } from '@/lib/student-code'

/** An error on the form's code field that offers the next free code. */
async function studentCodeInUse(code: string): Promise<ActionError> {
  const message = studentCodeInUseMessage(code, await getNextStudentCode())
  return new ActionError(message, { student_code: message })
}

/** Refuses `code` when a student other than `exceptId` holds it. */
export async function assertStudentCodeFree(
  code: string,
  exceptId: string | null,
): Promise<void> {
  if (await isStudentCodeTaken(code, exceptId))
    throw await studentCodeInUse(code)
}

/**
 * The result of `write`, reporting a refusal by the unique constraint on the
 * code like `assertStudentCodeFree`: the code was taken after that check.
 */
export async function guardStudentCode<T>(
  code: string,
  write: Promise<T>,
): Promise<T> {
  try {
    return await write
  } catch (err) {
    if (asDbError(err)?.constraint === 'students_student_code_key')
      throw await studentCodeInUse(code)
    throw err
  }
}
