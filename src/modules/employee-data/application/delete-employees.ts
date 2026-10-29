import { EmployeeImportConflict } from "../domain/resume-import";
import type { EmployeeDataVersionSummary } from "../domain/models";
import type { ImportActor } from "./ports";

export function deleteEmployees(versionId: string, employeeIds: string[] | null, actor: ImportActor, repository: { delete(versionId: string, employeeIds: string[] | null, actor: ImportActor): EmployeeDataVersionSummary }) {
  if (!versionId || (employeeIds !== null && (!employeeIds.length || new Set(employeeIds).size !== employeeIds.length || employeeIds.some(id => !id)))) {
    throw new EmployeeImportConflict("请选择有效的员工记录。");
  }
  return repository.delete(versionId, employeeIds, actor);
}
