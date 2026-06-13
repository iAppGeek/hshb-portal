import { auth } from '@/auth'
import { getDocumentById, logAuditEvent } from '@/db'
import { canViewDocuments } from '@/lib/permissions'
import { getFileStorage } from '@/lib/storage'
import type { StaffRole } from '@/types/next-auth'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const session = await auth()
  if (!session) {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }
  const role = session.user.role as StaffRole
  if (!canViewDocuments(role)) {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  const doc = await getDocumentById(id)
  if (!doc) {
    return Response.json({ error: 'Not found' }, { status: 404 })
  }

  // Records have no file — they are displayed inline, never downloaded.
  if (doc.source === 'record') {
    return Response.json({ error: 'This item has no file' }, { status: 400 })
  }

  let location: string
  if (doc.source === 'link') {
    location = doc.external_url ?? ''
  } else {
    location = await getFileStorage().getDownloadUrl(doc.storage_key ?? '')
  }

  // Sensitive bytes (medical/DBS/ID) — record who viewed which document.
  logAuditEvent({
    staffId: session.user.staffId,
    action: 'view',
    entity: 'document',
    entityId: doc.id,
    details: {
      source: doc.source,
      student_id: doc.student_id,
      staff_id: doc.staff_id,
    },
  })

  return Response.redirect(location, 302)
}
