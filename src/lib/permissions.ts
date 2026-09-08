import type { StaffRole } from '@/types/next-auth'

// ── Identity ────────────────────────────────────────────────────────────────

export function isTeacher(role: StaffRole): boolean {
  return role === 'teacher'
}

export function isAdmin(role: StaffRole): boolean {
  return role === 'admin'
}

// ── Data visibility ─────────────────────────────────────────────────────────

export function canSeeAllData(role: StaffRole): boolean {
  return role === 'admin' || role === 'headteacher' || role === 'secretary'
}

// ── CRUD permissions ────────────────────────────────────────────────────────

export function canCreateStudents(role: StaffRole): boolean {
  return role === 'admin'
}

export function canEditStudents(role: StaffRole): boolean {
  return role === 'admin'
}

export function canCreateStaff(role: StaffRole): boolean {
  return role === 'admin'
}

export function canEditStaff(role: StaffRole): boolean {
  return role === 'admin'
}

export function canCreateClasses(role: StaffRole): boolean {
  return role === 'admin' || role === 'headteacher'
}

export function canEditClasses(role: StaffRole): boolean {
  return role === 'admin' || role === 'headteacher'
}

export function canEditIncidents(role: StaffRole): boolean {
  return role === 'admin' || role === 'headteacher'
}

export function canEditGuardians(role: StaffRole): boolean {
  return role === 'admin'
}

export function canEditTimetables(role: StaffRole): boolean {
  return role === 'admin' || role === 'headteacher'
}

// View is separated from manage so view-only access can be widened to other
// roles later with a one-line change, without granting upload/delete.
export function canViewDocuments(role: StaffRole): boolean {
  return role === 'admin' // widen later, e.g. || role === 'headteacher'
}

export function canManageDocuments(role: StaffRole): boolean {
  return role === 'admin' // upload + delete; stays admin-only
}

export function canCreateLessonPlans(role: StaffRole): boolean {
  return role === 'teacher' || role === 'admin' || role === 'headteacher'
}

export function canEditLessonPlans(role: StaffRole): boolean {
  return role === 'teacher' || role === 'admin' || role === 'headteacher'
}

export function canUpdateAttendance(role: StaffRole): boolean {
  return role === 'admin' || role === 'headteacher' || role === 'teacher'
}

export function canManageStaffAttendance(role: StaffRole): boolean {
  return role === 'admin' || role === 'headteacher'
}

// ── Feature access ──────────────────────────────────────────────────────────

export function canAccessReports(role: StaffRole): boolean {
  return role === 'admin' || role === 'headteacher' || role === 'secretary'
}

export function canSeeStaffContact(role: StaffRole): boolean {
  return role === 'admin' || role === 'headteacher' || role === 'secretary'
}

export function canSeeStudentMedical(role: StaffRole): boolean {
  return role === 'admin' || role === 'headteacher' || role === 'secretary'
}

export function receivesNotifications(role: StaffRole): boolean {
  return role === 'admin' || role === 'headteacher'
}

export function canMigrateClasses(role: StaffRole): boolean {
  return role === 'admin'
}

export function canAccessAdminTasks(role: StaffRole): boolean {
  return role === 'admin'
}

// ── Data classification ─────────────────────────────────────────────────────

export function isTeachingStaff(role: StaffRole): boolean {
  return role === 'teacher' || role === 'headteacher'
}

export function showsOnSignInSheet(role: StaffRole): boolean {
  return role !== 'admin'
}

// ── Role-group arrays (for DB queries) ──────────────────────────────────────

export const TEACHING_ROLES: StaffRole[] = ['teacher', 'headteacher']
export const NOTIFICATION_ROLES: StaffRole[] = ['admin', 'headteacher']
