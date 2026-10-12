import { test, expect } from '../../fixtures/index'
import {
  deleteAcademicYearByCode,
  insertRow,
  isolatedPastAcademicYear,
  sql,
} from '../../fixtures/seed'

test.use({ storageState: 'e2e/.auth/admin.json' })

function plusDays(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number)
  const next = new Date(Date.UTC(year, month - 1, day + days))
  const y = next.getUTCFullYear()
  const m = String(next.getUTCMonth() + 1).padStart(2, '0')
  const d = String(next.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

test('lists every session date in the year for this class', async ({
  page,
}, testInfo) => {
  const year = await isolatedPastAcademicYear(testInfo)
  const first = year.start_date
  const second = plusDays(first, 1)
  const third = plusDays(first, 2)
  const guardianId = await insertRow('guardians', {
    first_name: 'E2E',
    last_name: 'SessionGuardian',
    phone: '07700000160',
  })
  const studentId = await insertRow('students', {
    first_name: 'Nora',
    last_name: 'Session',
    student_code: `E2E-session-${crypto.randomUUID()}`,
    primary_guardian_id: guardianId,
    address_guardian_id: guardianId,
  })
  const classId = await insertRow('classes', {
    name: `Sessions ${year.code} ${crypto.randomUUID()}`,
    year_group: '1',
    academic_year_id: year.id,
    active: true,
  })
  const otherClassId = await insertRow('classes', {
    name: `Sessions other ${year.code} ${crypto.randomUUID()}`,
    year_group: '1',
    academic_year_id: year.id,
    active: true,
  })

  try {
    await insertRow('student_classes', {
      student_id: studentId,
      class_id: classId,
      start_date: first,
    })

    async function take(
      id: string,
      date: string,
      status: 'present' | 'absent',
    ): Promise<void> {
      await insertRow('attendance_registers', { class_id: id, date })
      await insertRow('attendance', {
        class_id: id,
        student_id: studentId,
        date,
        status,
      })
    }

    await take(classId, first, 'present')
    await take(classId, second, 'absent')
    await insertRow('attendance_registers', {
      class_id: otherClassId,
      date: third,
    })

    await page.goto(`/classes/${classId}`)
    const section = page
      .getByRole('heading', { name: 'Class Session Dates' })
      .locator('xpath=..')
    const rows = section.locator('tbody tr')
    await expect(rows).toHaveCount(3)
    await expect(rows.nth(0)).toContainText('NOT TAKEN')
    await expect(rows.nth(0)).toContainText('—')
    await expect(rows.nth(1)).toContainText('TAKEN')
    await expect(rows.nth(1)).toContainText('0% · 0 attended / 1 absent')
    await expect(rows.nth(2)).toContainText('TAKEN')
    await expect(rows.nth(2)).toContainText('100% · 1 attended / 0 absent')
  } finally {
    await sql`delete from attendance_registers where class_id in ${sql([classId, otherClassId])}`
    await sql`delete from attendance where student_id = ${studentId}`
    await sql`delete from student_classes where student_id = ${studentId}`
    await sql`delete from students where id = ${studentId}`
    await sql`delete from classes where id in ${sql([classId, otherClassId])}`
    await sql`delete from guardians where id = ${guardianId}`
    await deleteAcademicYearByCode(year.code)
  }
})
