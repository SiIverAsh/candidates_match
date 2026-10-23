import type {
  EmployeeDataOverview,
  EmployeeDataVersionSummary,
  ParsedEmployeeData,
  EmployeeDirectoryPage,
  EmployeeProfile,
} from "../domain/models";
import type { EmployeeResumeDraft } from "../domain/resume-import";

export interface EmployeeResumeReader {
  read(file: { name: string; type: string; size: number; arrayBuffer(): Promise<ArrayBuffer> }): Promise<
    { kind: "parsed"; draft: EmployeeResumeDraft } | { kind: "rejected"; message: string }
  >;
}

export interface EmployeeResumeRepository {
  append(data: ParsedEmployeeData, actor: ImportActor): EmployeeDataVersionSummary;
  recordFailedImport(actor: ImportActor, outcomeCode: ImportFailureCode, issueCount: number): void;
}

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
  warnings?: string[];
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
