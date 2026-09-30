import { and, eq, isNull } from 'drizzle-orm'
import { afterEach, describe, expect, it } from 'vitest'

import { todayInSchoolTz } from '@/lib/datetime'
import { DbError } from '@/lib/db-error'

import { db } from './client'
import { closeEnrolments, isClassOpen, setEnrolments } from './enrolments'
import { classes, studentClasses, students } from './schema'
import { failWritesTo, resetDatabase, SEED } from './test-db'

const { alpha, beta, gamma } = SEED.classes
const { alice, bob, carol } = SEED.students
const MISSING = '30000000-0000-0000-0000-0000000000ff'

afterEach(resetDatabase)

async function openClassIdsOf(studentId: string): Promise<string[]> {
  const rows = await db
    .select({ classId: studentClasses.classId })
    .from(studentClasses)
    .where(
      and(
        eq(studentClasses.studentId, studentId),
        isNull(studentClasses.endDate),
      ),
    )
  return rows.map((row) => row.classId).sort()
}

async function openStudentIdsOf(classId: string): Promise<string[]> {
  const rows = await db
    .select({ studentId: studentClasses.studentId })
    .from(studentClasses)
    .where(
      and(eq(studentClasses.classId, classId), isNull(studentClasses.endDate)),
    )
  return rows.map((row) => row.studentId).sort()
}

async function stayCount(): Promise<number> {
  return (await db.select().from(studentClasses)).length
}

describe('closeEnrolments', () => {
  it('ends open stays on the date, never before they started', async () => {
    const [future] = await db
      .insert(studentClasses)
      .values({ studentId: carol, classId: gamma, startDate: '2026-10-15' })
      .returning({ id: studentClasses.id })
    const [aliceStay] = await db
      .select({ id: studentClasses.id })
      .from(studentClasses)
      .where(eq(studentClasses.studentId, alice))

    await db.transaction((tx) =>
      closeEnrolments(tx, [aliceStay.id, future.id], '2026-10-01'),
    )

    const ends = await db
      .select({ id: studentClasses.id, endDate: studentClasses.endDate })
      .from(studentClasses)
    expect(ends).toEqual(
      expect.arrayContaining([
        { id: aliceStay.id, endDate: '2026-10-01' },
        { id: future.id, endDate: '2026-10-15' },
      ]),
    )
  })

  it('leaves an already-closed stay alone and accepts no ids', async () => {
    const [closed] = await db
      .insert(studentClasses)
      .values({
        studentId: carol,
        classId: alpha,
        startDate: '2026-09-01',
        endDate: '2026-09-08',
      })
      .returning({ id: studentClasses.id })
    await db.transaction(async (tx) => {
      await closeEnrolments(tx, [closed.id], '2026-10-01')
      await closeEnrolments(tx, [], '2026-10-01')
    })
    const [row] = await db
      .select({ endDate: studentClasses.endDate })
      .from(studentClasses)
      .where(eq(studentClasses.id, closed.id))
    expect(row.endDate).toBe('2026-09-08')
  })
})

describe('isClassOpen', () => {
  it('is true only for an active class in the current year', async () => {
    const [prior] = await db
      .insert(classes)
      .values({
        name: 'Old',
        yearGroup: 'Year 1',
        academicYearId: SEED.years.prior,
      })
      .returning({ id: classes.id })
    await db.update(classes).set({ active: false }).where(eq(classes.id, beta))

    await db.transaction(async (tx) => {
      expect(await isClassOpen(tx, alpha)).toBe(true)
      expect(await isClassOpen(tx, beta)).toBe(false)
      expect(await isClassOpen(tx, prior.id)).toBe(false)
      expect(
        await isClassOpen(tx, '10000000-0000-0000-0000-0000000000ff'),
      ).toBe(false)
    })
  })
})

describe('setEnrolments for a class', () => {
  it('ends removed stays today, starts new ones today, keeps the rest', async () => {
    await db.transaction((tx) =>
      setEnrolments(tx, { classId: alpha }, [alice, carol]),
    )

    expect(await openStudentIdsOf(alpha)).toEqual([alice, carol].sort())
    const today = todayInSchoolTz()
    const [bobStay] = await db
      .select({ endDate: studentClasses.endDate })
      .from(studentClasses)
      .where(
        and(
          eq(studentClasses.studentId, bob),
          eq(studentClasses.classId, alpha),
        ),
      )
    expect(bobStay.endDate).toBe(today)
    const [carolStay] = await db
      .select({ startDate: studentClasses.startDate })
      .from(studentClasses)
      .where(
        and(
          eq(studentClasses.studentId, carol),
          eq(studentClasses.classId, alpha),
        ),
      )
    expect(carolStay.startDate).toBe(today)
    // Alice's stay was not touched.
    expect(await stayCount()).toBe(4)
  })

  it('empties a class when given no students', async () => {
    await db.transaction((tx) => setEnrolments(tx, { classId: alpha }, []))
    expect(await openStudentIdsOf(alpha)).toEqual([])
  })

  it('rejects a class that is not open', async () => {
    await db.update(classes).set({ active: false }).where(eq(classes.id, beta))
    await expect(
      db.transaction((tx) => setEnrolments(tx, { classId: beta }, [alice])),
    ).rejects.toEqual(
      new DbError(
        'Only active classes in the current academic year can be changed.',
      ),
    )
  })

  it('rejects adding a leaver, but keeps a leaver already on the class', async () => {
    await db
      .update(students)
      .set({ active: false, leavingReason: 'left' })
      .where(eq(students.id, bob))

    await expect(
      db.transaction((tx) => setEnrolments(tx, { classId: beta }, [bob])),
    ).rejects.toEqual(new DbError("Leavers can't be enrolled in classes."))

    await db.transaction((tx) =>
      setEnrolments(tx, { classId: alpha }, [alice, bob]),
    )
    expect(await openStudentIdsOf(alpha)).toEqual([alice, bob].sort())
  })

  it('leaves nothing behind when a write fails part-way', async () => {
    const before = await stayCount()
    const err = await failWritesTo(
      'student_classes',
      `student_id <> '${carol}'`,
      () =>
        db.transaction((tx) => setEnrolments(tx, { classId: alpha }, [carol])),
    )
    expect(err).toBeDefined()
    // Alice's and Bob's stays were closed before Carol's insert failed.
    expect(await openStudentIdsOf(alpha)).toEqual([alice, bob].sort())
    expect(await stayCount()).toBe(before)
  })
})

describe('setEnrolments for a student', () => {
  it('moves a student between open classes, leaving closed classes alone', async () => {
    const [prior] = await db
      .insert(classes)
      .values({
        name: 'Old',
        yearGroup: 'Year 1',
        academicYearId: SEED.years.prior,
      })
      .returning({ id: classes.id })
    await db
      .insert(studentClasses)
      .values({ studentId: carol, classId: prior.id, startDate: '2025-09-01' })

    await db.transaction((tx) =>
      setEnrolments(tx, { studentId: carol }, [gamma, alpha]),
    )
    expect(await openClassIdsOf(carol)).toEqual([alpha, gamma, prior.id].sort())

    await db.transaction((tx) => setEnrolments(tx, { studentId: carol }, []))
    expect(await openClassIdsOf(carol)).toEqual([prior.id])
  })

  it('rejects a leaver', async () => {
    await db
      .update(students)
      .set({ active: false, leavingReason: 'left' })
      .where(eq(students.id, carol))
    await expect(
      db.transaction((tx) => setEnrolments(tx, { studentId: carol }, [alpha])),
    ).rejects.toEqual(new DbError("Leavers can't be enrolled in classes."))
  })

  it('rejects a class that is not open', async () => {
    await db.update(classes).set({ active: false }).where(eq(classes.id, gamma))
    await expect(
      db.transaction((tx) =>
        setEnrolments(tx, { studentId: carol }, [beta, gamma]),
      ),
    ).rejects.toEqual(
      new DbError(
        'Students can only be enrolled in active classes of the current year.',
      ),
    )
    expect(await openClassIdsOf(carol)).toEqual([beta])
  })

  it('fails the foreign key for a missing student', async () => {
    await expect(
      db.transaction((tx) =>
        setEnrolments(tx, { studentId: MISSING }, [alpha]),
      ),
    ).rejects.toMatchObject({ cause: { code: '23503' } })
  })

  it('leaves nothing behind when a write fails part-way', async () => {
    const before = await stayCount()
    const err = await failWritesTo(
      'student_classes',
      `class_id <> '${gamma}'`,
      () =>
        db.transaction((tx) =>
          setEnrolments(tx, { studentId: carol }, [gamma]),
        ),
    )
    expect(err).toBeDefined()
    // Carol's Beta stay was closed before the Gamma insert failed.
    expect(await openClassIdsOf(carol)).toEqual([beta])
    expect(await stayCount()).toBe(before)
  })
})
