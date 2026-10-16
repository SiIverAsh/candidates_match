import type { EmployeeDataOverview } from "../domain/models";
import type { EmployeeDataRepository } from "./ports";

export function getEmployeeDataOverview(
  repository: EmployeeDataRepository,
): EmployeeDataOverview {
  return repository.getOverview();
}
