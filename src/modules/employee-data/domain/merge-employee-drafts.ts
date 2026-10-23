import type { EmployeeResumeDraft } from "./resume-import";

function mergeUnique<T>(target: T[], source: T[]) {
  const seen = new Set(target.map(item => JSON.stringify(item)));
  for (const item of source) {
    const key = JSON.stringify(item);
    if (!seen.has(key)) { target.push(item); seen.add(key); }
  }
}

export function mergeEmployeeDraft(target: EmployeeResumeDraft, source: EmployeeResumeDraft) {
  for (const key of ["email", "currentTitle", "currentDepartment", "profileUrl"] as const) {
    if (!target.employee[key] && source.employee[key]) target.employee[key] = source.employee[key];
  }
  target.warnings = [...new Set([...target.warnings, ...source.warnings])];
  mergeUnique(target.workExperiences, source.workExperiences);
  mergeUnique(target.educations, source.educations);
}
