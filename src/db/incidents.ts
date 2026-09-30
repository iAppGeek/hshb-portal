import 'server-only'

import { and, count, desc, eq, gte, inArray, lte, or } from 'drizzle-orm'

import { toCamel, toSnake } from './casing'
import { db, type Tx } from './client'
import { incidents, type Incident } from './schema'

export type IncidentType = Incident['type']

export type IncidentRow = {
  id: string
  type: IncidentType
  student_id: string
  title: string
  description: string
  incident_date: string
  created_by: string
  updated_by: string | null
  parent_notified: boolean
  parent_notified_at: string | null
  created_at: string
  updated_at: string
  student: { id: string; first_name: string; last_name: string }
  creator: { id: string; first_name: string; last_name: string }
  updater: { id: string; first_name: string; last_name: string } | null
}

const person = {
  columns: { id: true, firstName: true, lastName: true },
} as const
const incidentWith = {
  student: person,
  creator: person,
  updater: person,
} as const

async function findIncident(
  tx: Tx | typeof db,
  id: string,
): Promise<IncidentRow | null> {
  const row = await tx.query.incidents.findFirst({
    where: eq(incidents.id, id),
    with: incidentWith,
  })
  return row ? toSnake(row) : null
}

export async function getIncidentCount(): Promise<number> {
  const [{ n }] = await db.select({ n: count() }).from(incidents)
  return n
}

export async function getIncidents(options?: {
  type?: IncidentType
  studentIds?: string[]
  createdBy?: string
  limit?: number
  offset?: number
}): Promise<IncidentRow[]> {
  const studentIds = options?.studentIds ?? []
  const forStudents =
    studentIds.length > 0 ? inArray(incidents.studentId, studentIds) : undefined
  // With createdBy: incidents for studentIds OR recorded by that staff member.
  const scope = options?.createdBy
    ? or(eq(incidents.createdBy, options.createdBy), forStudents)
    : forStudents
  const rows = await db.query.incidents.findMany({
    with: incidentWith,
    where: and(
      options?.type ? eq(incidents.type, options.type) : undefined,
      scope,
    ),
    orderBy: desc(incidents.incidentDate),
    limit: options?.limit,
    offset: options?.limit !== undefined ? (options.offset ?? 0) : undefined,
  })
  return toSnake(rows)
}

export async function getIncidentById(id: string): Promise<IncidentRow | null> {
  return findIncident(db, id)
}

export async function createIncident(data: {
  type: IncidentType
  student_id: string
  title: string
  description: string
  incident_date: string
  created_by: string
  parent_notified?: boolean
  parent_notified_at?: string | null
}): Promise<IncidentRow> {
  return db.transaction(async (tx) => {
    const [{ id }] = await tx
      .insert(incidents)
      .values(toCamel(data))
      .returning({ id: incidents.id })
    return (await findIncident(tx, id))!
  })
}

export type IncidentCounts = {
  medical: number
  behaviour: number
  other: number
  total: number
}

/** Count incidents by type across a date range (inclusive). */
export async function getIncidentCountsByDateRange(
  startDate: string,
  endDate: string,
): Promise<IncidentCounts> {
  const rows = await db
    .select({ type: incidents.type, n: count() })
    .from(incidents)
    .where(
      and(
        gte(incidents.incidentDate, startDate),
        lte(incidents.incidentDate, endDate),
      ),
    )
    .groupBy(incidents.type)
  const counts: IncidentCounts = {
    medical: 0,
    behaviour: 0,
    other: 0,
    total: 0,
  }
  for (const { type, n } of rows) {
    counts[type] = n
    counts.total += n
  }
  return counts
}

export async function updateIncident(
  id: string,
  data: {
    title?: string
    description?: string
    incident_date?: string
    updated_by: string
    parent_notified?: boolean
    parent_notified_at?: string | null
  },
): Promise<IncidentRow> {
  return db.transaction(async (tx) => {
    await tx.update(incidents).set(toCamel(data)).where(eq(incidents.id, id))
    const row = await findIncident(tx, id)
    if (!row) throw new Error('Incident not found')
    return row
  })
}
