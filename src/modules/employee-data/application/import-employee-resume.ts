import type { EmployeeResumeDraft } from "../domain/resume-import";
import { EmployeeImportConflict, validateEmployeeResume } from "../domain/resume-import";
import type { EmployeeResumeReader, EmployeeResumeRepository, ImportActor } from "./ports";
import type { ImportEmployeeWorkbookResult } from "./import-employee-workbook";

export function previewEmployeeResume(file: Parameters<EmployeeResumeReader["read"]>[0], reader: EmployeeResumeReader) {
  return reader.read(file);
}

export function importEmployeeResume(draft: EmployeeResumeDraft, actor: ImportActor, repository: EmployeeResumeRepository, today: string): ImportEmployeeWorkbookResult {
  return importEmployeeResumes([draft], actor, repository, today);
}

export function importEmployeeResumes(drafts: EmployeeResumeDraft[], actor: ImportActor, repository: EmployeeResumeRepository, today: string): ImportEmployeeWorkbookResult {
  const issues = drafts.flatMap((draft, index) => validateEmployeeResume(draft, today).map(issue => ({ ...issue, sheet: `简历 ${index + 1} / ${issue.sheet}` })));
  if (issues.length) {
    repository.recordFailedImport(actor, "VALIDATION_FAILED", issues.length);
    return { kind: "validation_failed", issues, totalIssueCount: issues.length };
  }
  const employees = drafts.map(draft => ({ ...draft.employee, employeeId: draft.employee.employeeId.trim(), name: draft.employee.name.trim(), email: draft.employee.email.trim(), currentDepartment: draft.employee.currentDepartment.trim(), currentTitle: draft.employee.currentTitle.trim(), warnings: draft.warnings }));
  if (employees.some(employee => !employee.employeeId)) return { kind: "validation_failed", issues: [{ sheet: "Employees", row: 1, field: "employee_id", code: "REQUIRED", message: "请保留自动生成的员工记录编号，或填写员工编号。" }], totalIssueCount: 1 };
  try {
    return { kind: "published", version: repository.append({
      employees,
      workExperiences: drafts.flatMap((draft, index) => draft.workExperiences.map(item => ({ ...item, company: item.company.trim(), title: item.title.trim(), employeeId: employees[index].employeeId }))),
      educationExperiences: drafts.flatMap((draft, index) => draft.educations.map(item => ({ ...item, school: item.school.trim(), major: item.major.trim(), employeeId: employees[index].employeeId }))),
    }, actor) };
  } catch (error) {
    const conflict = error instanceof EmployeeImportConflict;
    repository.recordFailedImport(actor, conflict ? "VALIDATION_FAILED" : "PUBLISH_FAILED", 1);
    const issue = { sheet: "Employees", row: 1, field: "employee_id", code: conflict ? "EMPLOYEE_CONFLICT" : "PUBLISH_FAILED", message: conflict ? error.message : "员工资料暂时无法发布，请稍后重试。" };
    return conflict ? { kind: "validation_failed", issues: [issue], totalIssueCount: 1 } : { kind: "publish_failed", issue };
  }
}
