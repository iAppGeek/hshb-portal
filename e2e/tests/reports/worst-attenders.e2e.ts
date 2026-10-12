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

test('lists the worst attenders for a date range', async ({
  page,
}, testInfo) => {
  const year = await isolatedPastAcademicYear(testInfo)
  const from = year.start_date
  const to = plusDays(from, 1)
  const classId = await insertRow('classes', {
    name: `Worst ${year.code} ${crypto.randomUUID()}`,
    year_group: '1',
    academic_year_id: year.id,
    active: true,
  })
  const guardianId = await insertRow('guardians', {
    first_name: 'E2E',
    last_name: 'WorstGuardian',
    phone: '07700000150',
  })

  async function pupil(firstName: string, lastName: string): Promise<string> {
    return insertRow('students', {
      first_name: firstName,
      last_name: lastName,
      student_code: `E2E-worst-${crypto.randomUUID()}`,
      primary_guardian_id: guardianId,
      address_guardian_id: guardianId,
    })
  }

  const zoe = await pupil('Zoe', 'Zero')
  const amy = await pupil('Amy', 'Able')
  const bea = await pupil('Bea', 'Middle')
  const studentIds = [zoe, amy, bea]

  try {
    await insertRow('student_classes', {
      student_id: zoe,
      class_id: classId,
      start_date: from,
      end_date: plusDays(from, 2),
    })
    await insertRow('student_classes', {
      student_id: amy,
      class_id: classId,
      start_date: from,
      end_date: plusDays(from, 1),
    })
    await insertRow('student_classes', {
      student_id: bea,
      class_id: classId,
      start_date: from,
      end_date: plusDays(from, 2),
    })

    async function take(
      date: string,
      marks: { studentId: string; status: 'present' | 'absent' }[],
    ): Promise<void> {
      await insertRow('attendance_registers', { class_id: classId, date })
      for (const mark of marks) {
        await insertRow('attendance', {
          class_id: classId,
          student_id: mark.studentId,
          date,
          status: mark.status,
        })
      }
    }

    await take(from, [
      { studentId: zoe, status: 'absent' },
      { studentId: amy, status: 'absent' },
      { studentId: bea, status: 'present' },
    ])
    await take(to, [
      { studentId: zoe, status: 'absent' },
      { studentId: bea, status: 'absent' },
    ])

    await page.goto(`/reports?mode=range&from=${from}&to=${to}`)
    const table = page.getByRole('table', { name: 'Worst attenders' })
    await expect(table.getByRole('link', { name: 'Zero, Zoe' })).toBeVisible()
    const names = (await table.getByRole('link').allTextContents()).map(
      (name) => name.replace(/\s+/g, ' ').trim(),
    )
    const ours = names.filter((name) =>
      ['Zero, Zoe', 'Able, Amy', 'Middle, Bea'].includes(name),
    )
    expect(ours).toEqual(['Zero, Zoe', 'Able, Amy', 'Middle, Bea'])

    await page.getByLabel('Show top').fill('1')
    await expect(table.getByRole('link', { name: 'Zero, Zoe' })).toBeVisible()
    await expect(table.getByRole('link', { name: 'Able, Amy' })).toHaveCount(0)
    await expect(table.getByRole('link', { name: 'Middle, Bea' })).toHaveCount(
      0,
    )
  } finally {
    await sql`delete from attendance_registers where class_id = ${classId}`
    await sql`delete from attendance where student_id in ${sql(studentIds)}`
    await sql`delete from student_classes where student_id in ${sql(studentIds)}`
    await sql`delete from students where id in ${sql(studentIds)}`
    await sql`delete from classes where id = ${classId}`
    await sql`delete from guardians where id = ${guardianId}`
    await deleteAcademicYearByCode(year.code)
  }
})
