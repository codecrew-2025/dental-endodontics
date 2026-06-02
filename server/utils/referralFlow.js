import GeneralCase from '../models/GeneralCase.js';
import Appointment from '../models/AppoitmentBooked.js';
import { User } from '../models/User.js';
import AssignmentState from '../models/AssignmentState.js';

const normalizeDepartment = (value) => String(value || '').trim().toLowerCase().replace(/[\s_]+/g, '');

const GENERAL_DEPARTMENT_KEYS = new Set([
  'general',
  'generaldentistry',
  'oralmedicine',
  'oralmedicineandradiology',
]);

const departmentAliasMap = {
  prosthodontics: ['prosthodontics', 'prothodontics', 'prosthondontics'],
  pedodontics: ['pedodontics'],
  periodontics: ['periodontics'],
  conservativedentistryandendodontics: [
    'conservativedentistryandendodontics',
    'conservativedentistry',
    'endodontics',
  ],
  oralandmaxillofacial: ['oralandmaxillofacial', 'oralmaxillofacial', 'oralsurgery'],
  general: ['general', 'generaldentistry', 'oralmedicine', 'oralmedicineandradiology'],
};

const normalizeLabelToDepartmentKey = (departmentLabel) => {
  const normalized = normalizeDepartment(departmentLabel);

  if (normalized.startsWith('prostho') || normalized.startsWith('protho') || normalized.startsWith('prosth')) {
    return 'prosthodontics';
  }
  if (normalized === 'pedodontics') return 'pedodontics';
  if (normalized === 'periodontics') return 'periodontics';
  if (normalized.includes('conservative') || normalized.includes('endodontic') || normalized.includes('endodontics')) {
    return 'conservativedentistryandendodontics';
  }
  if (normalized.includes('oral') || normalized.includes('maxillofacial')) {
    return 'oralandmaxillofacial';
  }
  if (GENERAL_DEPARTMENT_KEYS.has(normalized)) return 'general';

  return normalized;
};

const isGeneralDepartment = (departmentLabel) => {
  return GENERAL_DEPARTMENT_KEYS.has(normalizeDepartment(departmentLabel));
};

const getDepartmentAliases = (departmentLabel) => {
  const departmentKey = normalizeLabelToDepartmentKey(departmentLabel);
  return departmentAliasMap[departmentKey] || [departmentKey];
};

const getNextRoundRobinStartIndex = async (key, length) => {
  if (!length) return 0;

  const state = await AssignmentState.findOneAndUpdate(
    { key },
    {
      $setOnInsert: { key },
      $inc: { counter: 1 },
    },
    { new: true, upsert: true }
  ).lean();

  const counter = typeof state?.counter === 'number' ? state.counter : 1;
  const startCounter = counter - 1;
  return ((startCounter % length) + length) % length;
};

const sortUsersForAssignment = (users) => {
  return users.sort((left, right) => {
    const leftId = String(left.Identity || '');
    const rightId = String(right.Identity || '');
    const byIdentity = leftId.localeCompare(rightId, 'en', { numeric: true, sensitivity: 'base' });
    if (byIdentity !== 0) return byIdentity;
    return String(left._id).localeCompare(String(right._id));
  });
};

const pickSpecialistDoctorForDepartment = async (departmentLabel) => {
  const aliases = getDepartmentAliases(departmentLabel);
  const doctors = await User.find({ role: 'doctor' }, { _id: 1, name: 1, Identity: 1, department: 1 }).lean();

  const eligibleDoctors = sortUsersForAssignment(
    doctors.filter((doctor) => {
      const departmentKey = normalizeDepartment(doctor.department);
      return !GENERAL_DEPARTMENT_KEYS.has(departmentKey) && aliases.includes(departmentKey);
    })
  );

  if (!eligibleDoctors.length) return null;

  const startIndex = await getNextRoundRobinStartIndex(`specialistReferral:${aliases[0]}`, eligibleDoctors.length);
  return eligibleDoctors[startIndex];
};

const pickPgForDoctor = async (doctor) => {
  const students = await User.find(
    { role: { $in: ['pg', 'ug'] }, createdBy: doctor._id },
    { _id: 1, name: 1, Identity: 1, department: 1, role: 1 }
  ).lean();

  const eligibleStudents = sortUsersForAssignment(students);
  if (!eligibleStudents.length) return null;

  const startIndex = await getNextRoundRobinStartIndex(`pgReferral:${String(doctor._id)}`, eligibleStudents.length);
  return eligibleStudents[startIndex];
};

const assignReferralToPg = async (caseItem) => {
  const referredDepartment = String(caseItem?.referredDepartment || '').trim();
  if (!referredDepartment || isGeneralDepartment(referredDepartment)) {
    return { specialistDoctor: null, assignedPg: null };
  }

  const specialistDoctor = await pickSpecialistDoctorForDepartment(referredDepartment);
  if (!specialistDoctor?._id) {
    return { specialistDoctor: null, assignedPg: null };
  }

  const assignedPg = await pickPgForDoctor(specialistDoctor);
  if (!assignedPg?._id) {
    return { specialistDoctor, assignedPg: null };
  }

  const assignmentTimestamp = new Date();

  caseItem.specialistDoctorId = specialistDoctor.Identity || '';
  caseItem.specialistDoctorName = specialistDoctor.name || '';
  caseItem.specialistAssignedAt = assignmentTimestamp;
  caseItem.specialistStatus = 'approved';
  caseItem.specialistRescheduleReason = '';
  caseItem.specialistReviewedBy = 'System Auto-Transfer';
  caseItem.specialistReviewedAt = assignmentTimestamp;
  caseItem.assignedPgId = assignedPg.Identity || '';
  caseItem.assignedPgName = assignedPg.name || assignedPg.Identity || '';
  caseItem.pgAssignedAt = assignmentTimestamp;

  return { specialistDoctor, assignedPg };
};

const updateUpcomingAppointmentAssignment = async ({ patientId, assignedPgId, specialistDoctorId }) => {
  const today = new Date().toISOString().slice(0, 10);

  const appt = await Appointment.findOne({
    patientId,
    appointmentDate: { $gte: today },
    status: { $in: ['pending', 'confirmed', 'assigned', 'in_progress', 'rescheduled'] },
  }).sort({ appointmentDate: 1, appointmentTime: 1, createdAt: -1 });

  if (!appt) return null;

  appt.doctorId = assignedPgId || null;
  appt.assignedPgUgId = assignedPgId || null;
  appt.assigned_pg_ug_id = assignedPgId || null;
  appt.pgDoctorId = assignedPgId || null;
  appt.supervisingDeptDoctorId = specialistDoctorId || null;
  appt.supervising_dept_doctor_id = specialistDoctorId || null;

  await appt.save();
  return appt;
};

export const advanceGeneralCaseReferralIfEligible = async ({
  patientId,
  completedDepartmentLabel,
  completedBy,
}) => {
  const normalizedPatientId = String(patientId || '').trim();
  const normalizedDepartmentLabel = String(completedDepartmentLabel || '').trim();
  const completedById = String(completedBy?.Identity || '').trim();
  const completedByRole = String(completedBy?.role || '').trim().toLowerCase();

  if (!normalizedPatientId || !normalizedDepartmentLabel || !completedById) {
    return { advanced: false, reason: 'missing_required_fields' };
  }

  if (completedByRole !== 'pg' && completedByRole !== 'ug') {
    return { advanced: false, reason: 'not_pg_or_ug' };
  }

  const caseItem = await GeneralCase.findOne({
    patientId: normalizedPatientId,
    assignedPgId: completedById,
    $or: [{ referralCompletedAt: { $exists: false } }, { referralCompletedAt: null }],
  }).sort({ createdAt: -1 });

  if (!caseItem) {
    return { advanced: false, reason: 'no_active_general_case' };
  }

  const selectedDepartments = Array.isArray(caseItem.selectedDepartments)
    ? caseItem.selectedDepartments.map((dept) => String(dept || '').trim()).filter(Boolean)
    : [];

  if (!selectedDepartments.length) {
    return { advanced: false, reason: 'no_selected_departments' };
  }

  const currentIndex = Number.isInteger(caseItem.referralCurrentIndex) ? caseItem.referralCurrentIndex : 0;
  const currentDeptLabel =
    String(selectedDepartments[currentIndex] || caseItem.referredDepartment || selectedDepartments[0] || '').trim();

  if (!currentDeptLabel) {
    return { advanced: false, reason: 'no_current_department' };
  }

  const currentDeptKey = normalizeLabelToDepartmentKey(currentDeptLabel);
  const completedDeptKey = normalizeLabelToDepartmentKey(normalizedDepartmentLabel);

  if (!currentDeptKey || currentDeptKey !== completedDeptKey) {
    return { advanced: false, reason: 'department_mismatch', currentDeptLabel };
  }

  const now = new Date();

  if (!Array.isArray(caseItem.referralHistory)) {
    caseItem.referralHistory = [];
  }

  caseItem.referralHistory.push({
    department: currentDeptLabel,
    completedAt: now,
    completedById,
    completedByName: String(completedBy?.name || '').trim(),
    completedByRole,
  });

  const nextIndex = currentIndex + 1;
  caseItem.referralCurrentIndex = nextIndex;

  if (nextIndex >= selectedDepartments.length) {
    caseItem.referralCompletedAt = now;
    await caseItem.save();
    return { advanced: true, completed: true, nextDepartment: null };
  }

  caseItem.referredDepartment = String(selectedDepartments[nextIndex] || '').trim();
  caseItem.specialistDoctorId = '';
  caseItem.specialistDoctorName = '';
  caseItem.specialistAssignedAt = null;
  caseItem.specialistStatus = 'not-required';
  caseItem.specialistRescheduleReason = '';
  caseItem.specialistReviewedBy = '';
  caseItem.specialistReviewedAt = null;
  caseItem.assignedPgId = '';
  caseItem.assignedPgName = '';
  caseItem.pgAssignedAt = null;

  const { specialistDoctor, assignedPg } = await assignReferralToPg(caseItem);
  await caseItem.save();

  if (assignedPg?.Identity) {
    await updateUpcomingAppointmentAssignment({
      patientId: normalizedPatientId,
      assignedPgId: assignedPg.Identity,
      specialistDoctorId: specialistDoctor?.Identity || '',
    });
  }

  return {
    advanced: true,
    completed: false,
    nextDepartment: caseItem.referredDepartment,
    specialistDoctorId: caseItem.specialistDoctorId,
    assignedPgId: caseItem.assignedPgId,
  };
};

export default advanceGeneralCaseReferralIfEligible;
