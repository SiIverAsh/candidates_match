import type { EmployeeDirectoryRepository } from "./ports";

export function listEmployees(input: { page?: number; search?: string }, repository: EmployeeDirectoryRepository) {
  const page = Number.isSafeInteger(input.page) && input.page! > 0 ? Math.min(input.page!, 100_000) : 1;
  return repository.list(page, (input.search ?? "").trim().slice(0, 100));
}

export function getEmployeeProfile(employeeId: string, versionId: string, repository: EmployeeDirectoryRepository) {
  return repository.find(employeeId, versionId);
}
