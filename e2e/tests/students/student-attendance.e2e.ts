import { test, expect } from '../../fixtures/index'
import { insertRow, SEED_IDS, sql } from '../../fixtures/seed'

test.use({ storageState: 'e2e/.auth/admin.json' })
const PRESENT = '2026-09-15'
const ABSENT = '2026-09-16'

test('shows the year attendance figure and each day', async ({ page }) => {
  const guardianId = await insertRow('guardians', {
    first_name: 'E2E',
    last_name: 'AttendanceGuardian',
    phone: '07700000099',
  })
  const studentId = await insertRow('students', {
    first_name: 'Nora',
    last_name: 'Attendee',
    student_code: `E2E-att-${crypto.randomUUID()}`,
    primary_guardian_id: guardianId,
    address_guardian_id: guardianId,
  })
  const classId = await insertRow('classes', {
    name: `Attendance ${crypto.randomUUID()}`,
    year_group: '1',
    academic_year_id: SEED_IDS.academicYears.current,
  })

  try {
    await insertRow('student_classes', {
      student_id: studentId,
      class_id: classId,
      start_date: '2026-09-01',
    })
    await insertRow('attendance_registers', {
      class_id: classId,
      date: PRESENT,
    })
    await insertRow('attendance', {
      class_id: classId,
      student_id: studentId,
      date: PRESENT,
      status: 'present',
    })
    await insertRow('attendance_registers', { class_id: classId, date: ABSENT })
    await insertRow('attendance', {
      class_id: classId,
      student_id: studentId,
      date: ABSENT,
      status: 'absent',
    })

    await page.goto(`/students/${studentId}`)

    await expect(page.getByText('50% (1/2)')).toBeVisible()
    await expect(
      page.getByRole('heading', { name: 'Attendance · 2026-27' }),
    ).toBeVisible()
    await page.getByText('Show all days (2)').click()
    await expect(page.getByText('Present', { exact: true })).toBeVisible()
    await expect(page.getByText('Absent', { exact: true })).toBeVisible()
    await expect(page.getByText('1 absent')).toBeVisible()
  } finally {
    await sql`delete from attendance_registers where class_id = ${classId}`
    await sql`delete from attendance where student_id = ${studentId}`
    await sql`delete from student_classes where student_id = ${studentId}`
    await sql`delete from students where id = ${studentId}`
    await sql`delete from classes where id = ${classId}`
    await sql`delete from guardians where id = ${guardianId}`
  }
})
