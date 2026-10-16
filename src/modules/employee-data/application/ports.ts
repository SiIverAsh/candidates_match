import type {
  EmployeeDataOverview,
  EmployeeDataVersionSummary,
  ParsedEmployeeData,
  EmployeeDirectoryPage,
  EmployeeProfile,
} from "../domain/models";

export interface ImportActor {
  id: string;
  displayName: string;
}

export interface EmployeeDirectoryRepository {
  list(page: number, search: string): EmployeeDirectoryPage;
  find(employeeId: string, versionId: string): EmployeeProfile | null;
}

export type ImportFailureCode =
  | "FILE_REJECTED"
  | "VALIDATION_FAILED"
  | "PUBLISH_FAILED";

export interface ImportValidationIssue {
  sheet: string;
  row: number;
  field: string;
  code: string;
  message: string;
}

export interface ImportValidationResult {
  data: ParsedEmployeeData | null;
  issues: ImportValidationIssue[];
  totalIssueCount: number;
}

export interface EmployeeWorkbookParser {
  parse(bytes: ArrayBuffer): Promise<ImportValidationResult>;
}

export interface EmployeeDataRepository {
  getOverview(): EmployeeDataOverview;
  recordFailedImport(
    actor: ImportActor,
    outcomeCode: ImportFailureCode,
    issueCount: number,
  ): void;
  publishEmployeeData(
    data: ParsedEmployeeData,
    actor: ImportActor,
  ): EmployeeDataVersionSummary;
}
