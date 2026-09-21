import { test, expect } from '../../fixtures/index'
import { loadWithFreshData } from '../../fixtures/loadWithFreshData'
import {
  db,
  SEED_IDS,
  createRegistrationSubmission,
  deleteRegistrationSubmissionsByChildLastName,
} from '../../fixtures/seed'

// Pin to admin by default — most of this file exercises admin-only pages.
// One block below overrides storageState to the seed teacher.
test.use({ storageState: 'e2e/.auth/admin.json' })
// Several tests walk through multiple pages and fixture set-ups.
test.describe.configure({ timeout: 120_000 })

// Europe/London, not UTC: the app resolves "today" in the school's
// timezone, so between 23:00 and midnight UTC a UTC-derived date points at
// yesterday and turns today's register into a past one.
const TODAY = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/London',
}).format(new Date())
const PAST_DATE = '2026-09-01'

// A far-future year, unique per test suffix, keeps parallel projects from
// colliding on the academic_years.code unique constraint.
function futureAcademicYear(suffix: string): {
  code: string
  start_date: string
  end_date: string
} {
  let hash = 0
  for (const ch of suffix) hash = (hash * 31 + ch.charCodeAt(0)) % 400
  const year = 2600 + hash
  return {
    code: `${year}-${String((year + 1) % 100).padStart(2, '0')}`,
    start_date: `${year}-09-01`,
    end_date: `${year + 1}-08-31`,
  }
}

// The seed staff ids are not RFC 4122 UUIDs, so class forms reject them on
// save. Fixture teachers get real UUIDs and owning a class keeps it out of
// the seed teachers' own class lists in other parallel tests. Copied from
// e2e/tests/classes/edit-class.e2e.ts.
async function createTeacher(lastName: string, email: string): Promise<string> {
  const { data, error } = await db
    .from('staff')
    .insert({ first_name: 'E2E', last_name: lastName, email, role: 'teacher' })
    .select('id')
    .single()
  if (error) throw error
  return data.id
}

async function createClass(
  name: string,
  teacherId: string,
  academicYearId: string,
  active = true,
): Promise<string> {
  const { data, error } = await db
    .from('classes')
    .insert({
      name,
      year_group: '1',
      teacher_id: teacherId,
      academic_year_id: academicYearId,
      active,
    })
    .select('id')
    .single()
  if (error) throw error
  return data.id
}

// The seed guardian id isn't RFC 4122 UUID-shaped, so it fails the
// student edit form's `existing_id: uuid` validation on re-save. Every
// fixture student gets its own freshly-inserted guardian (a real UUID)
// instead. Guardians are cleaned up per-worker in the afterAll below.
const createdGuardianIds: string[] = []

async function createStudent(
  firstName: string,
  lastName: string,
): Promise<string> {
  const { data: guardian, error: guardianError } = await db
    .from('guardians')
    .insert({
      first_name: 'E2E',
      last_name: `Guardian${lastName}`,
      phone: '07700000000',
      address_line_1: '1 Fixture Street',
      city: 'London',
      postcode: 'N1 1AA',
    })
    .select('id')
    .single()
  if (guardianError) throw guardianError
  createdGuardianIds.push(guardian.id)

  const { data, error } = await db
    .from('students')
    .insert({
      first_name: firstName,
      last_name: lastName,
      primary_guardian_id: guardian.id,
      primary_guardian_relationship: 'Guardian',
      address_guardian_id: guardian.id,
    })
    .select('id')
    .single()
  if (error) throw error
  return data.id
}

test.afterAll(async () => {
  if (createdGuardianIds.length > 0) {
    await db.from('guardians').delete().in('id', createdGuardianIds)
  }
})

async function enrol(
  studentId: string,
  classId: string,
  startDate: string,
  endDate: string | null = null,
): Promise<string> {
  const { data, error } = await db
    .from('student_classes')
    .insert({
      student_id: studentId,
      class_id: classId,
      start_date: startDate,
      end_date: endDate,
    })
    .select('id')
    .single()
  if (error) throw error
  return data.id
}

async function mark(
  classId: string,
  studentId: string,
  date: string,
  status: 'present' | 'absent' | 'late',
): Promise<void> {
  const { error } = await db
    .from('attendance')
    .insert({ class_id: classId, student_id: studentId, date, status })
  if (error) throw error
}

async function cleanupStudents(studentIds: string[]): Promise<void> {
  const ids = studentIds.filter(Boolean)
  if (ids.length === 0) return
  await db.from('attendance').delete().in('student_id', ids)
  await db.from('student_classes').delete().in('student_id', ids)
  await db.from('students').delete().in('id', ids)
}

async function cleanupClasses(classIds: string[]): Promise<void> {
  const ids = classIds.filter(Boolean)
  if (ids.length === 0) return
  await db.from('attendance').delete().in('class_id', ids)
  await db.from('student_classes').delete().in('class_id', ids)
  await db.from('classes').delete().in('id', ids)
}

async function cleanupTeachers(teacherIds: string[]): Promise<void> {
  const ids = teacherIds.filter(Boolean)
  if (ids.length === 0) return
  await db.from('staff').delete().in('id', ids)
}

test.describe('Enrolment history — registers, leavers, migration', () => {
  test('past register survives a move', async ({ page }, testInfo) => {
    const suffix = testInfo.testId.replace(/[^a-z0-9]/gi, '')
    const teacherId = await createTeacher(
      `Move${suffix}`,
      `e2e.move.${suffix}@test.hshb.local`,
    )
    const classAId = await createClass(
      `E2EMoveA${suffix}`,
      teacherId,
      SEED_IDS.academicYears.current,
    )
    const classBId = await createClass(
      `E2EMoveB${suffix}`,
      teacherId,
      SEED_IDS.academicYears.current,
    )
    const studentId = await createStudent('Move', `Student${suffix}`)
    await enrol(studentId, classAId, PAST_DATE)

    try {
      // Take a register for class A on a past date.
      await loadWithFreshData(
        page,
        `/attendance?classId=${classAId}&date=${PAST_DATE}`,
        async () => {
          await expect(
            page.getByRole('row', {
              name: new RegExp(`^Student${suffix}, Move`),
            }),
          ).toBeVisible({ timeout: 3_000 })
        },
      )
      await page
        .getByRole('row', { name: new RegExp(`^Student${suffix}, Move`) })
        .getByRole('button', { name: 'Present' })
        .click()
      await page.getByRole('button', { name: 'Save register' }).click()
      await expect(page.getByText('Register saved.')).toBeVisible({
        timeout: 15_000,
      })

      // Move the student from A to B via the student edit form.
      await loadWithFreshData(page, `/students/${studentId}/edit`, async () => {
        await expect(
          page.locator(`input[name="class_ids"][value="${classAId}"]`),
        ).toBeVisible({ timeout: 3_000 })
      })
      await page
        .locator(`input[name="class_ids"][value="${classAId}"]`)
        .uncheck()
      await page.locator(`input[name="class_ids"][value="${classBId}"]`).check()
      await page.getByRole('button', { name: 'Save changes' }).click()
      await expect(page).toHaveURL('/students')

      // The past register for A still lists the student with their mark.
      await page.goto(`/attendance?classId=${classAId}&date=${PAST_DATE}`)
      await expect(
        page.getByRole('row', { name: new RegExp(`^Student${suffix}, Move`) }),
      ).toBeVisible()

      // Today's register for A no longer lists them.
      await page.goto(`/attendance?classId=${classAId}&date=${TODAY}`)
      await expect(
        page.getByRole('row', { name: new RegExp(`^Student${suffix}, Move`) }),
      ).toHaveCount(0)
    } finally {
      await cleanupStudents([studentId])
      await cleanupClasses([classAId, classBId])
      await cleanupTeachers([teacherId])
    }
  })

  test('A→B→A moves and concurrent (dual) marks', async ({
    page,
  }, testInfo) => {
    const suffix = testInfo.testId.replace(/[^a-z0-9]/gi, '')
    const teacherId = await createTeacher(
      `Dual${suffix}`,
      `e2e.dual.${suffix}@test.hshb.local`,
    )
    const classAId = await createClass(
      `E2EDualA${suffix}`,
      teacherId,
      SEED_IDS.academicYears.current,
    )
    const classBId = await createClass(
      `E2EDualB${suffix}`,
      teacherId,
      SEED_IDS.academicYears.current,
    )
    const studentId = await createStudent('Dual', `Student${suffix}`)

    // A → B → A, with each stay a separate row.
    await enrol(studentId, classAId, '2026-09-01', '2026-09-05')
    await enrol(studentId, classBId, '2026-09-05', '2026-09-10')
    await enrol(studentId, classAId, '2026-09-10')
    // Concurrently enrolled in B too, from today, for the dual-mark check.
    await enrol(studentId, classBId, TODAY)

    try {
      // Only enrolled in A on 2026-09-02 — A's past register lists them.
      await loadWithFreshData(
        page,
        `/attendance?classId=${classAId}&date=2026-09-02`,
        async () => {
          await expect(
            page.getByRole('row', {
              name: new RegExp(`^Student${suffix}, Dual`),
            }),
          ).toBeVisible({ timeout: 3_000 })
        },
      )

      // Not enrolled in B on 2026-09-02 — B's register for that date doesn't.
      await page.goto(`/attendance?classId=${classBId}&date=2026-09-02`)
      await expect(
        page.getByRole('row', { name: new RegExp(`^Student${suffix}, Dual`) }),
      ).toHaveCount(0)

      // Today: enrolled in both A and B — can be marked present in both.
      await page.goto(`/attendance?classId=${classAId}&date=${TODAY}`)
      await page
        .getByRole('row', { name: new RegExp(`^Student${suffix}, Dual`) })
        .getByRole('button', { name: 'Present' })
        .click()
      await page.getByRole('button', { name: 'Save register' }).click()
      await expect(page.getByText('Register saved.')).toBeVisible({
        timeout: 15_000,
      })

      await page.goto(`/attendance?classId=${classBId}&date=${TODAY}`)
      await page
        .getByRole('row', { name: new RegExp(`^Student${suffix}, Dual`) })
        .getByRole('button', { name: 'Present' })
        .click()
      await page.getByRole('button', { name: 'Save register' }).click()
      await expect(page.getByText('Register saved.')).toBeVisible({
        timeout: 15_000,
      })

      const { data: rows } = await db
        .from('attendance')
        .select('class_id, status')
        .eq('student_id', studentId)
        .eq('date', TODAY)
      expect(rows).toHaveLength(2)
      expect(rows?.every((r) => r.status === 'present')).toBe(true)
    } finally {
      await cleanupStudents([studentId])
      await cleanupClasses([classAId, classBId])
      await cleanupTeachers([teacherId])
    }
  })

  test('class edit keeps members hidden by the search and a leaver still on the class', async ({
    page,
  }, testInfo) => {
    const suffix = testInfo.testId.replace(/[^a-z0-9]/gi, '')
    const teacherId = await createTeacher(
      `Search${suffix}`,
      `e2e.search.${suffix}@test.hshb.local`,
    )
    const classId = await createClass(
      `E2ESearch${suffix}`,
      teacherId,
      SEED_IDS.academicYears.current,
    )
    const memberId = await createStudent('Member', `Search${suffix}`)
    const joinerId = await createStudent('Joiner', `Search${suffix}`)
    const leaverId = await createStudent('Leaver', `Search${suffix}`)
    await enrol(memberId, classId, PAST_DATE)
    // A leaver whose stay was never closed, e.g. after a manual DB change.
    await enrol(leaverId, classId, PAST_DATE)
    await db
      .from('students')
      .update({ active: false, leaving_reason: 'left' })
      .eq('id', leaverId)

    try {
      await loadWithFreshData(page, `/classes/${classId}/edit`, async () => {
        await expect(
          page.locator(`input[name="student_ids"][value="${joinerId}"]`),
        ).toBeVisible({ timeout: 3_000 })
        await expect(
          page.locator(`input[name="student_ids"][value="${leaverId}"]`),
        ).toBeChecked({ timeout: 3_000 })
      })
      await expect(
        page.locator('label', { hasText: `Search${suffix}, Leaver` }),
      ).toContainText('Left')

      // Search for the joiner only: the member and leaver rows are hidden.
      await page
        .getByPlaceholder('Filter students by name…')
        .fill(`Joiner Search${suffix}`)
      await expect(
        page.locator(`input[name="student_ids"][value="${memberId}"]`),
      ).toBeHidden()
      await page
        .locator(`input[name="student_ids"][value="${joinerId}"]`)
        .check()
      await page.getByRole('button', { name: 'Save changes' }).click()
      await expect(page).toHaveURL('/classes')

      const { data: current } = await db
        .from('student_classes')
        .select('student_id')
        .eq('class_id', classId)
        .is('end_date', null)
      expect(current?.map((r) => r.student_id).sort()).toEqual(
        [memberId, joinerId, leaverId].sort(),
      )
    } finally {
      await cleanupStudents([memberId, joinerId, leaverId])
      await cleanupClasses([classId])
      await cleanupTeachers([teacherId])
    }
  })

  test('a late joiner appears unmarked on an already-taken register', async ({
    page,
  }, testInfo) => {
    const suffix = testInfo.testId.replace(/[^a-z0-9]/gi, '')
    const teacherId = await createTeacher(
      `Late${suffix}`,
      `e2e.late.${suffix}@test.hshb.local`,
    )
    const classId = await createClass(
      `E2ELateJoin${suffix}`,
      teacherId,
      SEED_IDS.academicYears.current,
    )
    const existingStudentId = await createStudent('Existing', `Late${suffix}`)
    const joinerStudentId = await createStudent('Joiner', `Late${suffix}`)
    await enrol(existingStudentId, classId, PAST_DATE)

    try {
      // Take today's register with just the existing student.
      await loadWithFreshData(
        page,
        `/attendance?classId=${classId}&date=${TODAY}`,
        async () => {
          await expect(
            page.getByRole('row', {
              name: new RegExp(`^Late${suffix}, Existing`),
            }),
          ).toBeVisible({ timeout: 3_000 })
        },
      )
      await page
        .getByRole('row', { name: new RegExp(`^Late${suffix}, Existing`) })
        .getByRole('button', { name: 'Present' })
        .click()
      await page.getByRole('button', { name: 'Save register' }).click()
      await expect(page.getByText('Register saved.')).toBeVisible({
        timeout: 15_000,
      })

      // Enrol the new student via the class edit form.
      await loadWithFreshData(page, `/classes/${classId}/edit`, async () => {
        await expect(
          page.locator(`input[name="student_ids"][value="${joinerStudentId}"]`),
        ).toBeVisible({ timeout: 3_000 })
      })
      await page
        .locator(`input[name="student_ids"][value="${joinerStudentId}"]`)
        .check()
      await page.getByRole('button', { name: 'Save changes' }).click()
      await expect(page).toHaveURL('/classes')

      // Today's register shows the joiner, unmarked, and saving succeeds.
      await page.goto(`/attendance?classId=${classId}&date=${TODAY}`)
      const joinerRow = page.getByRole('row', {
        name: new RegExp(`^Late${suffix}, Joiner`),
      })
      await expect(joinerRow).toBeVisible()
      await joinerRow.getByRole('button', { name: 'Absent' }).click()
      await page.getByRole('button', { name: 'Save register' }).click()
      await expect(page.getByText('Register saved.')).toBeVisible({
        timeout: 15_000,
      })
    } finally {
      await cleanupStudents([existingStudentId, joinerStudentId])
      await cleanupClasses([classId])
      await cleanupTeachers([teacherId])
    }
  })

  test('leaver: gone from today, kept on past registers, hidden from the list, visible in finance', async ({
    page,
  }, testInfo) => {
    const suffix = testInfo.testId.replace(/[^a-z0-9]/gi, '')
    const teacherId = await createTeacher(
      `Leaver${suffix}`,
      `e2e.leaver.${suffix}@test.hshb.local`,
    )
    const classId = await createClass(
      `E2ELeaverClass${suffix}`,
      teacherId,
      SEED_IDS.academicYears.current,
    )
    const studentId = await createStudent('Leaves', `Soon${suffix}`)
    await enrol(studentId, classId, PAST_DATE)
    await mark(classId, studentId, PAST_DATE, 'present')

    try {
      await page.goto(`/students/${studentId}/edit`)
      page.once('dialog', (dialog) => dialog.accept())
      await page.locator('#reason').selectOption('graduated')
      await page.getByRole('button', { name: 'Mark as leaver' }).click()
      await expect(page).toHaveURL('/students')

      // Gone from today's register.
      await loadWithFreshData(
        page,
        `/attendance?classId=${classId}&date=${TODAY}`,
        async () => {
          await expect(
            page.getByText(
              "This class isn't available. It may have been completed or you may not have access.",
            ),
          ).toHaveCount(0)
        },
      )
      await expect(
        page.getByRole('row', { name: new RegExp(`^Soon${suffix}, Leaves`) }),
      ).toHaveCount(0)

      // Still shown on the past, already-taken register.
      await page.goto(`/attendance?classId=${classId}&date=${PAST_DATE}`)
      await expect(
        page.getByRole('row', { name: new RegExp(`^Soon${suffix}, Leaves`) }),
      ).toBeVisible()

      // Hidden from the students list until "Show leavers".
      await page.goto('/students')
      await expect(
        page.getByText(new RegExp(`^Soon${suffix}, Leaves`)),
      ).toHaveCount(0)
      await page.getByRole('link', { name: 'Show leavers' }).click()
      const studentRow = page.getByRole('row', {
        name: new RegExp(`^Soon${suffix}, Leaves`),
      })
      await expect(studentRow).toBeVisible()
      // Stacked mode's mobile summary title duplicates the badge already
      // shown in the desktop name cell, and only one of the two is visible
      // at a given viewport.
      await expect(
        studentRow.getByText('Graduated').filter({ visible: true }).first(),
      ).toBeVisible()

      // Finance shows them with the badge.
      await page.goto(
        `/finance?tab=students&year=${SEED_IDS.academicYears.current}`,
      )
      const row = page.getByRole('row', {
        name: new RegExp(`^Soon${suffix}, Leaves`),
      })
      await expect(row).toBeVisible()
      await expect(row.getByText('Graduated')).toBeVisible()
    } finally {
      await cleanupStudents([studentId])
      await cleanupClasses([classId])
      await cleanupTeachers([teacherId])
    }
  })

  test('migration with a new class: per-student actions applied, source completed', async ({
    page,
  }, testInfo) => {
    const suffix = testInfo.testId.replace(/[^a-z0-9]/gi, '')
    const { data: nextYear, error: nextYearError } = await db
      .from('academic_years')
      .insert(futureAcademicYear(suffix))
      .select('id')
      .single()
    if (nextYearError) throw nextYearError

    const teacherId = await createTeacher(
      `Migrate${suffix}`,
      `e2e.migrate.${suffix}@test.hshb.local`,
    )
    const newTeacherId = await createTeacher(
      `MigrateNew${suffix}`,
      `e2e.migratenew.${suffix}@test.hshb.local`,
    )
    const sourceClassId = await createClass(
      `E2EMigrateSource${suffix}`,
      SEED_IDS.staff.teacher,
      SEED_IDS.academicYears.current,
    )
    const moverId = await createStudent('Mover', `Migrate${suffix}`)
    const stayerId = await createStudent('Stayer', `Migrate${suffix}`)
    const leaverId = await createStudent('Leaver', `Migrate${suffix}`)
    await enrol(moverId, sourceClassId, PAST_DATE)
    await enrol(stayerId, sourceClassId, PAST_DATE)
    await enrol(leaverId, sourceClassId, PAST_DATE)
    await mark(sourceClassId, moverId, PAST_DATE, 'present')

    const newClassName = `E2EMigrateTarget${suffix}`

    try {
      // Pin this test's own year: the form defaults to the earliest future
      // year, which can be another parallel project's year, deleted by its
      // cleanup before this submit.
      await loadWithFreshData(
        page,
        `/admin?tab=class-migration&sourceClassId=${sourceClassId}&targetYearId=${nextYear.id}`,
        async () => {
          await expect(
            page.locator(`select[name="action_${moverId}"]`),
          ).toBeVisible({ timeout: 3_000 })
          await expect(
            page.getByRole('checkbox', { name: /create a new class/i }),
          ).toBeEnabled({ timeout: 3_000 })
        },
      )
      await expect(
        page.getByRole('checkbox', { name: /create a new class/i }),
      ).toBeChecked()

      await page.locator('input[name="name"]').fill(newClassName)
      await page.locator('input[name="year_group"]').fill('2')
      await page.locator('#teacher_id').selectOption(newTeacherId)

      await page
        .locator(`select[name="action_${moverId}"]`)
        .selectOption('move')
      await page
        .locator(`select[name="action_${stayerId}"]`)
        .selectOption('none')
      await page
        .locator(`select[name="action_${leaverId}"]`)
        .selectOption('graduated')

      await page.getByRole('button', { name: 'Migrate Class' }).click()
      await expect(page).toHaveURL('/admin')

      const { data: newClass } = await db
        .from('classes')
        .select('id, active')
        .eq('name', newClassName)
        .single()
      expect(newClass).toBeTruthy()

      const { data: moverRow } = await db
        .from('student_classes')
        .select('class_id, end_date')
        .eq('student_id', moverId)
        .is('end_date', null)
        .single()
      expect(moverRow?.class_id).toBe(newClass!.id)

      const { data: stayer } = await db
        .from('students')
        .select('active')
        .eq('id', stayerId)
        .single()
      expect(stayer?.active).toBe(true)
      const { data: stayerOpenRows } = await db
        .from('student_classes')
        .select('id')
        .eq('student_id', stayerId)
        .is('end_date', null)
      expect(stayerOpenRows).toEqual([])

      const { data: leaver } = await db
        .from('students')
        .select('active, leaving_reason')
        .eq('id', leaverId)
        .single()
      expect(leaver?.active).toBe(false)
      expect(leaver?.leaving_reason).toBe('graduated')

      const { data: source } = await db
        .from('classes')
        .select('active')
        .eq('id', sourceClassId)
        .single()
      expect(source?.active).toBe(false)

      // Admin can still view the source class's register read-only, with the
      // saved mark intact.
      await page.goto(`/attendance?classId=${sourceClassId}&date=${PAST_DATE}`)
      await expect(
        page.getByRole('row', { name: new RegExp(`^Migrate${suffix}, Mover`) }),
      ).toBeVisible()
      await expect(
        page.getByRole('button', { name: 'Save register' }),
      ).toHaveCount(0)

      // The source class's edit page redirects to its (read-only) class page.
      await page.goto(`/classes/${sourceClassId}/edit`)
      await expect(page).toHaveURL(`/classes/${sourceClassId}`)

      // Cleanup the new class + its migrated student before the outer cleanup.
      await cleanupClasses([newClass!.id])
    } finally {
      await cleanupStudents([moverId, stayerId, leaverId])
      await cleanupClasses([sourceClassId])
      await cleanupTeachers([teacherId, newTeacherId])
      await db.from('academic_years').delete().eq('id', nextYear!.id)
    }
  })

  test('a stored attendance link to a completed class shows an error panel for a teacher', async ({
    browser,
  }, testInfo) => {
    const suffix = testInfo.testId.replace(/[^a-z0-9]/gi, '')
    const classId = await createClass(
      `E2ECompletedForTeacher${suffix}`,
      SEED_IDS.staff.teacher,
      SEED_IDS.academicYears.current,
      false,
    )

    const context = await browser.newContext({
      storageState: 'e2e/.auth/teacher.json',
    })
    const page = await context.newPage()

    try {
      await page.goto(`/attendance?classId=${classId}&date=${TODAY}`)
      await expect(
        page.getByText(
          "This class isn't available. It may have been completed or you may not have access.",
        ),
      ).toBeVisible()
    } finally {
      await context.close()
      await cleanupClasses([classId])
    }
  })

  test('migration without a new class: completes the class with no-class/leaver actions only', async ({
    page,
  }, testInfo) => {
    const suffix = testInfo.testId.replace(/[^a-z0-9]/gi, '')
    const teacherId = await createTeacher(
      `NoNew${suffix}`,
      `e2e.nonew.${suffix}@test.hshb.local`,
    )
    const sourceClassId = await createClass(
      `E2ENoNewSource${suffix}`,
      teacherId,
      SEED_IDS.academicYears.current,
    )
    const stayerId = await createStudent('Stayer', `NoNew${suffix}`)
    const leaverId = await createStudent('Leaver', `NoNew${suffix}`)
    await enrol(stayerId, sourceClassId, PAST_DATE)
    await enrol(leaverId, sourceClassId, PAST_DATE)

    try {
      await loadWithFreshData(
        page,
        `/admin?tab=class-migration&sourceClassId=${sourceClassId}`,
        async () => {
          await expect(
            page.locator(`select[name="action_${stayerId}"]`),
          ).toBeVisible({ timeout: 3_000 })
        },
      )
      const checkbox = page.getByRole('checkbox', {
        name: /create a new class/i,
      })
      if (await checkbox.isChecked()) await checkbox.uncheck()

      await page
        .locator(`select[name="action_${stayerId}"]`)
        .selectOption('none')
      await page
        .locator(`select[name="action_${leaverId}"]`)
        .selectOption('left')

      await page.getByRole('button', { name: 'Migrate Class' }).click()
      await expect(page).toHaveURL('/admin')

      const { data: source } = await db
        .from('classes')
        .select('active')
        .eq('id', sourceClassId)
        .single()
      expect(source?.active).toBe(false)

      const { data: newClasses } = await db
        .from('classes')
        .select('id')
        .eq('name', `E2ENoNewTarget${suffix}`)
      expect(newClasses).toEqual([])

      const { data: leaver } = await db
        .from('students')
        .select('active, leaving_reason')
        .eq('id', leaverId)
        .single()
      expect(leaver?.active).toBe(false)
      expect(leaver?.leaving_reason).toBe('left')
    } finally {
      await cleanupStudents([stayerId, leaverId])
      await cleanupClasses([sourceClassId])
      await cleanupTeachers([teacherId])
    }
  })

  test('a returning leaver approved into a class they previously left reactivates and reopens', async ({
    page,
  }, testInfo) => {
    const suffix = testInfo.testId.replace(/[^a-z0-9]/gi, '')
    let childLastName = ''
    const teacherId = await createTeacher(
      `Return${suffix}`,
      `e2e.return.${suffix}@test.hshb.local`,
    )
    const classId = await createClass(
      `E2EReturnClass${suffix}`,
      teacherId,
      SEED_IDS.academicYears.current,
    )

    try {
      childLastName = `Returner${suffix}`
      const { data: existingStudent, error: studentError } = await db
        .from('students')
        .insert({
          first_name: 'E2E',
          last_name: childLastName,
          date_of_birth: '2019-06-01',
          address_line_1: 'Old Address',
          city: 'Oldtown',
          postcode: 'OL1 1AA',
          primary_guardian_id: '20000000-0000-0000-0000-000000000001',
          active: false,
          leaving_reason: 'left',
        })
        .select('id')
        .single()
      if (studentError) throw studentError

      // They were previously enrolled in this class and left.
      await enrol(existingStudent.id, classId, PAST_DATE, TODAY)

      const { id: submissionId } = await createRegistrationSubmission({
        child_last_name: childLastName,
        date_of_birth: '2019-06-01',
        contact_last_name: `Parent${childLastName}`,
        contact_email: `e2e.${suffix}.return@example.com`,
      })

      await loadWithFreshData(
        page,
        `/registrations/${submissionId}`,
        async () => {
          await page
            .getByRole('button', { name: 'Approve & save student' })
            .click()
          await expect(
            page.locator(`select[name="class_id"] option[value="${classId}"]`),
          ).toHaveCount(1, { timeout: 3_000 })
        },
      )
      await page
        .getByRole('radio', { name: 'Link to existing student' })
        .click()
      await page.locator('select[name="class_id"]').selectOption(classId)
      await page.getByRole('button', { name: 'Approve' }).click()

      await expect(page).toHaveURL(`/students/${existingStudent.id}/edit`)

      const { data: updated } = await db
        .from('students')
        .select('active, leaving_reason')
        .eq('id', existingStudent.id)
        .single()
      expect(updated?.active).toBe(true)
      expect(updated?.leaving_reason).toBeNull()

      await cleanupStudents([existingStudent.id])
    } finally {
      if (childLastName) {
        await deleteRegistrationSubmissionsByChildLastName(childLastName)
        await db
          .from('guardians')
          .delete()
          .eq('last_name', `Parent${childLastName}`)
      }
      await cleanupClasses([classId])
      await cleanupTeachers([teacherId])
    }
  })

  test('fees after a mid-year move show the new class plan, not a conflict', async ({
    page,
  }, testInfo) => {
    const suffix = testInfo.testId.replace(/[^a-z0-9]/gi, '')
    const teacherId = await createTeacher(
      `Fees${suffix}`,
      `e2e.fees.${suffix}@test.hshb.local`,
    )
    const classAId = await createClass(
      `E2EFeesA${suffix}`,
      teacherId,
      SEED_IDS.academicYears.current,
    )
    const classBId = await createClass(
      `E2EFeesB${suffix}`,
      teacherId,
      SEED_IDS.academicYears.current,
    )
    const planAName = `E2EFeesPlanA${suffix}`
    const planBName = `E2EFeesPlanB${suffix}`
    const studentId = await createStudent('Fees', `Student${suffix}`)
    await enrol(studentId, classAId, PAST_DATE)

    const { data: planA, error: planAError } = await db
      .from('fee_plans')
      .insert({
        name: planAName,
        academic_year_id: SEED_IDS.academicYears.current,
        full_year_amount: 800,
        monthly_instalment_amount: 100,
        termly_instalment_amount: 266.67,
      })
      .select('id')
      .single()
    if (planAError) throw planAError
    const { data: planB, error: planBError } = await db
      .from('fee_plans')
      .insert({
        name: planBName,
        academic_year_id: SEED_IDS.academicYears.current,
        full_year_amount: 900,
        monthly_instalment_amount: 110,
        termly_instalment_amount: 300,
      })
      .select('id')
      .single()
    if (planBError) throw planBError
    await db.from('fee_plan_classes').insert([
      { fee_plan_id: planA!.id, class_id: classAId },
      { fee_plan_id: planB!.id, class_id: classBId },
    ])

    try {
      // Move the student from A to B via the real edit flow.
      await loadWithFreshData(page, `/students/${studentId}/edit`, async () => {
        await expect(
          page.locator(`input[name="class_ids"][value="${classBId}"]`),
        ).toBeVisible({ timeout: 3_000 })
      })
      await page
        .locator(`input[name="class_ids"][value="${classAId}"]`)
        .uncheck()
      await page.locator(`input[name="class_ids"][value="${classBId}"]`).check()
      await page.getByRole('button', { name: 'Save changes' }).click()
      await expect(page).toHaveURL('/students')

      await page.goto(
        `/finance/students/${studentId}?year=${SEED_IDS.academicYears.current}`,
      )
      await expect(page.getByTestId('fee-plan')).toContainText(planBName)
      await expect(page.getByTestId('fee-plan')).not.toContainText(
        'Multiple fee plans',
      )
    } finally {
      await db.from('fee_plan_classes').delete().eq('fee_plan_id', planA!.id)
      await db.from('fee_plan_classes').delete().eq('fee_plan_id', planB!.id)
      await db.from('fee_plans').delete().in('id', [planA!.id, planB!.id])
      await cleanupStudents([studentId])
      await cleanupClasses([classAId, classBId])
      await cleanupTeachers([teacherId])
    }
  })

  test("migrating last year's class after the new year is current starts students with the current year", async ({
    page,
  }, testInfo) => {
    const suffix = testInfo.testId.replace(/[^a-z0-9]/gi, '')
    const teacherId = await createTeacher(
      `LastYear${suffix}`,
      `e2e.lastyear.${suffix}@test.hshb.local`,
    )
    // Not migrated before the current year started: still active, with the
    // student's stay still open.
    const sourceClassId = await createClass(
      `E2ELastYearSource${suffix}`,
      teacherId,
      SEED_IDS.academicYears.previous,
    )
    const moverId = await createStudent('Mover', `LastYear${suffix}`)
    const sourceRowId = await enrol(moverId, sourceClassId, '2025-09-01')
    const newClassName = `E2ELastYearTarget${suffix}`
    let newClassId = ''

    try {
      await loadWithFreshData(
        page,
        `/admin?tab=class-migration&sourceClassId=${sourceClassId}`,
        async () => {
          await expect(
            page.locator(`select[name="action_${moverId}"]`),
          ).toBeVisible({ timeout: 3_000 })
          await expect(
            page.locator(`#teacher_id option[value="${teacherId}"]`),
          ).toHaveCount(1, { timeout: 3_000 })
        },
      )
      // Last year's class defaults to the current year, never a past one.
      await expect(page.locator('select[name="academic_year_id"]')).toHaveValue(
        SEED_IDS.academicYears.current,
      )

      await page.locator('input[name="name"]').fill(newClassName)
      await page.locator('input[name="year_group"]').fill('4')
      await page.locator('#teacher_id').selectOption(teacherId)
      await page
        .locator(`select[name="action_${moverId}"]`)
        .selectOption('move')

      await page.getByRole('button', { name: 'Migrate Class' }).click()
      await expect(page).toHaveURL('/admin')

      const { data: newClass } = await db
        .from('classes')
        .select('id, academic_year_id, active')
        .eq('name', newClassName)
        .single()
      newClassId = newClass!.id
      expect(newClass?.academic_year_id).toBe(SEED_IDS.academicYears.current)
      expect(newClass?.active).toBe(true)

      // Dates come from the academic years, not the day the migration ran.
      const { data: sourceRow } = await db
        .from('student_classes')
        .select('end_date')
        .eq('id', sourceRowId)
        .single()
      expect(sourceRow?.end_date).toBe('2026-09-01')

      const { data: newRow } = await db
        .from('student_classes')
        .select('start_date, end_date')
        .eq('student_id', moverId)
        .eq('class_id', newClassId)
        .single()
      expect(newRow).toEqual({ start_date: '2026-09-01', end_date: null })
    } finally {
      await cleanupStudents([moverId])
      await cleanupClasses([newClassId, sourceClassId])
      await cleanupTeachers([teacherId])
    }
  })
})
