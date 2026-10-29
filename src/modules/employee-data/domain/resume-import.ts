import type { EmployeeRecord, WorkExperienceRecord, EducationRecord } from "./models";

export interface EmployeeResumeDraft {
  employee: EmployeeRecord;
  workExperiences: Omit<WorkExperienceRecord, "employeeId">[];
  educations: Omit<EducationRecord, "employeeId">[];
  warnings: string[];
}

export class EmployeeImportConflict extends Error {}

export function validEmployeeDate(value: string, today: string): boolean {
  if (!value) return true;
  if (!/^(?:19|20)\d{2}(?:-(?:0[1-9]|1[0-2])(?:-(?:0[1-9]|[12]\d|3[01]))?)?$/u.test(value)) return false;
  const day = value.length === 4 ? `${value}-01-01` : value.length === 7 ? `${value}-01` : value;
  return !Number.isNaN(Date.parse(day)) && new Date(day).toISOString().slice(0, 10) === day && day <= today;
}

export function validateEmployeeResume(draft: EmployeeResumeDraft, today: string) {
  const issues: { sheet: string; row: number; field: string; code: string; message: string }[] = [];
  const add = (sheet: string, row: number, field: string, message: string) => issues.push({ sheet, row, field, code: "INVALID_VALUE", message });
  const text = (sheet: string, row: number, field: string, value: string, required = true) => {
    if (required && !value.trim()) add(sheet, row, field, "请填写该字段。");
  };
  for (const field of ["employeeId", "name", "email", "currentDepartment", "currentTitle"] as const) text("Employees", 1, field, draft.employee[field], field === "name");
  if (draft.employee.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(draft.employee.email.trim())) add("Employees", 1, "email", "请填写有效的员工工作邮箱，未知可留空。");
  const date = (sheet: string, row: number, field: string, value: string) => {
    if (!validEmployeeDate(value, field === "endDate" ? "2099-12-31" : today)) add(sheet, row, field, "日期支持 YYYY、YYYY-MM、YYYY-MM-DD；未知请留空，开始日期不可晚于今天。");
  };
  if (!draft.workExperiences.length && !draft.educations.length) add("经历", 0, "记录", "至少提供一条工作或教育经历。");
  for (const [sheet, records] of [["WorkExperience", draft.workExperiences], ["Education", draft.educations]] as const) {
    for (const [index, record] of records.entries()) {
      if ("company" in record) { text(sheet, index + 1, "company", record.company); text(sheet, index + 1, "title", record.title, false); }
      else { text(sheet, index + 1, "school", record.school); text(sheet, index + 1, "major", record.major, false); }
      date(sheet, index + 1, "startDate", record.startDate);
      if (record.endDate) date(sheet, index + 1, "endDate", record.endDate);
      if (record.current && record.endDate) add(sheet, index + 1, "endDate", "当前经历不能同时填写结束日期。");
      if (record.endDate && record.startDate.slice(0, Math.min(record.startDate.length, record.endDate.length)) > record.endDate.slice(0, Math.min(record.startDate.length, record.endDate.length))) add(sheet, index + 1, "endDate", "结束日期不能早于开始日期。");
    }
  }
  return issues;
}
