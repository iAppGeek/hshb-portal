import { test, expect } from '../../fixtures/index'
import { deleteAcademicYearByCode, insertRow, sql } from '../../fixtures/seed'

test.use({ storageState: 'e2e/.auth/admin.json' })

const FROM = '2015-09-01'
const TO = '2015-09-02'

test('lists the worst attenders for a date range', async ({ page }) => {
  const yearId = await insertRow('academic_years', {
    code: '2015-16',
    start_date: '2015-09-01',
    end_date: '2016-08-31',
    is_current: false,
  })
  const classId = await insertRow('classes', {
    name: 'Worst 2015',
    year_group: '1',
    academic_year_id: yearId,
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
      start_date: FROM,
      end_date: '2015-09-03',
    })
    await insertRow('student_classes', {
      student_id: amy,
      class_id: classId,
      start_date: FROM,
      end_date: '2015-09-02',
    })
    await insertRow('student_classes', {
      student_id: bea,
      class_id: classId,
      start_date: FROM,
      end_date: '2015-09-03',
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

    await take(FROM, [
      { studentId: zoe, status: 'absent' },
      { studentId: amy, status: 'absent' },
      { studentId: bea, status: 'present' },
    ])
    await take(TO, [
      { studentId: zoe, status: 'absent' },
      { studentId: bea, status: 'absent' },
    ])

    await page.goto(`/reports?mode=range&from=${FROM}&to=${TO}`)
    const table = page.getByRole('table', { name: 'Worst attenders' })
    await expect(table.getByRole('link', { name: 'Zoe Zero' })).toBeVisible()
    const names = (await table.getByRole('link').allTextContents()).map(
      (name) => name.replace(/\s+/g, ' ').trim(),
    )
    const ours = names.filter((name) =>
      ['Zoe Zero', 'Amy Able', 'Bea Middle'].includes(name),
    )
    expect(ours).toEqual(['Zoe Zero', 'Amy Able', 'Bea Middle'])

    await page.getByLabel('Show top').fill('1')
    await expect(table.getByRole('link', { name: 'Zoe Zero' })).toBeVisible()
    await expect(table.getByRole('link', { name: 'Amy Able' })).toHaveCount(0)
    await expect(table.getByRole('link', { name: 'Bea Middle' })).toHaveCount(0)
  } finally {
    await sql`delete from attendance_registers where class_id = ${classId}`
    await sql`delete from attendance where student_id in ${sql(studentIds)}`
    await sql`delete from student_classes where student_id in ${sql(studentIds)}`
    await sql`delete from students where id in ${sql(studentIds)}`
    await sql`delete from classes where id = ${classId}`
    await sql`delete from guardians where id = ${guardianId}`
    await deleteAcademicYearByCode('2015-16')
  }
})
