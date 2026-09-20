export { supabase } from './client'
export {
  getAcademicYears,
  getCurrentAcademicYear,
  getAcademicYearById,
  getAcademicYearForDate,
  createAcademicYear,
  updateAcademicYear,
  setCurrentAcademicYear,
} from './academic-years'
export type { AcademicYearRow, AcademicYearInput } from './academic-years'
export {
  getStaffByEmail,
  getStaffById,
  getAllStaff,
  getAllStaffWithClasses,
  getTeachers,
  createStaff,
  updateStaff,
} from './staff'
export {
  getAllStudents,
  getStudentsForList,
  searchStudents,
  getStudentsByTeacher,
  getStudentIdsByTeacher,
  getStudentCount,
  getStudentsWithAllergiesCount,
  getStudentsByClass,
  getStudentById,
  getStudentsByIds,
  createStudent,
  updateStudent,
  updateStudentClasses,
  markStudentAsLeaver,
  findStudentMatches,
  getStudentsForLinking,
} from './students'
export type { StudentMatch } from './students'
export {
  createRegistrationSubmission,
  getRegistrationSubmissions,
  getPendingRegistrationCount,
  getRegistrationSubmissionById,
  approveRegistration,
  rejectRegistration,
  deleteRegistrationSubmission,
} from './registrations'
export type {
  RegistrationStatus,
  ContactRole,
  RegistrationSummary,
  RegistrationFull,
  GuardianChange,
  ApproveRegistrationResult,
} from './registrations'
export {
  createPhotoOptOut,
  getPhotoOptOuts,
  getPendingPhotoOptOutCount,
  getPhotoOptOutById,
  applyPhotoOptOut,
  rejectPhotoOptOut,
  deletePhotoOptOut,
} from './photoOptOuts'
export type { PhotoOptOutStatus, PhotoOptOutRow } from './photoOptOuts'
export {
  getGuardianCount,
  getAllGuardians,
  getGuardianChildCounts,
  createGuardian,
  getGuardianById,
  getStudentsByGuardian,
  getFamilyForGuardian,
  updateGuardian,
  findGuardianMatches,
} from './guardians'
export type {
  GuardianSummary,
  GuardianListItem,
  GuardianWithChildCount,
  GuardianFull,
  GuardianStudentLink,
  GuardianMatch,
  FamilySlot,
  FamilyChild,
  FamilyCoGuardianLink,
  FamilyCoGuardian,
  GuardianFamily,
} from './guardians'
export {
  getAllClasses,
  getClassesByAcademicYear,
  getClassById,
  getClassWithStudents,
  getClassesByTeacher,
  getEnrolmentsForClass,
  getEnrolmentsInRange,
  createClass,
  updateClass,
  setClassStudents,
  migrateClass,
} from './classes'
export type { MigrationAction, MigrateClassResult } from './classes'
export {
  getIncidentCount,
  getIncidents,
  getIncidentCountsByDateRange,
  createIncident,
  updateIncident,
  getIncidentById,
} from './incidents'
export type { IncidentType, IncidentRow, IncidentCounts } from './incidents'
export {
  getLessonPlanCount,
  getLessonPlanCountByDate,
  getLessonPlans,
  getLessonPlanById,
  createLessonPlan,
  updateLessonPlan,
} from './lesson-plans'
export type { LessonPlanRow } from './lesson-plans'
export {
  savePushSubscription,
  deletePushSubscription,
  pushSubscriptionExists,
  getAdminSubscriptions,
} from './push-subscriptions'
export type {
  SavePushSubscriptionInput,
  PushSubscriptionRow,
} from './push-subscriptions'
export {
  getAttendanceByClassAndDate,
  getAttendanceByDateRange,
  saveAttendance,
} from './attendance'
export type { AttendanceStatus, AttendanceInsert } from './attendance'
export { fetchAllPages } from './paging'
export {
  getStaffAttendanceForToday,
  getStaffAttendanceByDate,
  getStaffAttendanceByDateRange,
  signInStaff,
  signOutStaff,
  getStaffAttendedCount,
} from './staff-attendance'
export type { StaffAttendanceRow } from './staff-attendance'
export {
  getStaffPayrollList,
  getStaffPayrollByStaffId,
  upsertStaffPayroll,
} from './staff-payroll'
export type {
  StaffPayrollRow,
  StaffPayrollInput,
  StaffPayrollListItem,
} from './staff-payroll'
export {
  getFeePlans,
  getFeePlanById,
  createFeePlan,
  updateFeePlan,
} from './fee-plans'
export type {
  FeePlanRow,
  FeePlanWithClasses,
  FeePlanAcademicYear,
  FeePlanInput,
} from './fee-plans'
export {
  getStudentFeeList,
  getStudentFeeDetail,
  getStudentFeeYears,
  getPriorYearBalances,
  upsertStudentFeeAccount,
  addStudentPayment,
  deleteStudentPayment,
} from './student-fees'
export type {
  StudentFeeAccountRow,
  StudentPaymentRow,
  StudentFeeAccountInput,
  StudentPaymentInput,
  FeeClass,
  PaymentSummary,
  StudentFeeListItem,
  StudentPaymentWithRecorder,
  StudentFeeDetail,
  StudentFeeYear,
} from './student-fees'
export { logAuditEvent } from './audit-log'
