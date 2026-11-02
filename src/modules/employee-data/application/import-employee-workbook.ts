import type { EmployeeDataVersionSummary, EmployeeRecord, ParsedEmployeeData } from "../domain/models";
import { MAX_EMPLOYEE_IMPORT_BYTES } from "../domain/policies";
import type {
  EmployeeDataRepository,
  EmployeeWorkbookParser,
  ImportActor,
  ImportValidationIssue,
  ImportValidationResult,
} from "./ports";

export interface WorkbookUpload {
  name: string;
  size: number;
  arrayBuffer(): Promise<ArrayBuffer>;
}

export interface ImportEmployeeWorkbookCommand {
  actor: ImportActor;
  file: WorkbookUpload | null;
}

export interface ImportEmployeeWorkbookDependencies {
  parser: EmployeeWorkbookParser;
  repository: EmployeeDataRepository;
  appendStandardized?(data: ParsedEmployeeData, actor: ImportActor): { version: EmployeeDataVersionSummary | null; conflicts: string[]; importedCount: number };
}

export type ImportEmployeeWorkbookResult =
  | {
      kind: "file_rejected";
      code: "FILE_REQUIRED" | "INVALID_FILE_TYPE" | "FILE_TOO_LARGE";
      issue: ImportValidationIssue;
    }
  | {
      kind: "validation_failed";
      issues: ImportValidationIssue[];
      totalIssueCount: number;
    }
  | { kind: "published"; version: EmployeeDataVersionSummary; warnings?: string[]; importedCount?: number; skippedCount?: number; totalCount?: number; importMode?: "append" | "replace"; issues?: ImportValidationIssue[]; totalIssueCount?: number }
  | { kind: "nothing_imported"; importedCount: number; skippedCount: number; totalCount: number; importMode: "append"; issues: ImportValidationIssue[]; totalIssueCount: number; warnings?: string[] }
  | { kind: "publish_failed"; issue: ImportValidationIssue };

export interface EmployeeWorkbookPreview {
  canImport: boolean;
  totalEmployees: number | null;
  workExperienceCount: number | null;
  educationCount: number | null;
  researchCount: number | null;
  issues: ImportValidationIssue[];
  totalIssueCount: number;
  warnings: string[];
  format: ImportValidationResult["format"] | null;
  importMode: "append" | "replace";
  eligibleEmployees: number | null;
  failedEmployees: number | null;
}

function fileIssue(code: string, message: string): ImportValidationIssue {
  return { sheet: "文件", row: 0, field: "file", code, message };
}

function validateFile(file: WorkbookUpload | null): Extract<ImportEmployeeWorkbookResult, { kind: "file_rejected" }> | null {
  if (!file || file.size === 0) return { kind: "file_rejected", code: "FILE_REQUIRED", issue: fileIssue("FILE_REQUIRED", "请选择一个 .xlsx 文件。") };
  if (!file.name.toLowerCase().endsWith(".xlsx")) return { kind: "file_rejected", code: "INVALID_FILE_TYPE", issue: fileIssue("INVALID_FILE_TYPE", "仅支持 .xlsx 文件。") };
  if (file.size > MAX_EMPLOYEE_IMPORT_BYTES) return { kind: "file_rejected", code: "FILE_TOO_LARGE", issue: fileIssue("FILE_TOO_LARGE", "文件不能超过 10 MB。") };
  return null;
}

function conflictIssues(ids: string[]): ImportValidationIssue[] {
  return ids.map(employeeId => ({ sheet: "人员", row: 0, field: "记录ID", code: "EMPLOYEE_CONFLICT", message: "员工编号、邮箱或主页链接与现有员工冲突，已跳过；请核对。", employeeId }));
}

export async function previewEmployeeWorkbook(file: WorkbookUpload | null, parser: EmployeeWorkbookParser, findConflicts: (employees: EmployeeRecord[]) => string[]): Promise<EmployeeWorkbookPreview> {
  const rejection = validateFile(file);
  if (rejection) return { canImport: false, totalEmployees: null, workExperienceCount: null, educationCount: null, researchCount: null, issues: [rejection.issue], totalIssueCount: 1, warnings: [], format: null, importMode: "replace", eligibleEmployees: null, failedEmployees: null };
  const validation = await parser.parse(await file!.arrayBuffer());
  const data = validation.data;
  const standardized = validation.format === "standardized";
  const conflicts = standardized && data ? findConflicts(data.employees) : [];
  const eligible = standardized && validation.selection ? Math.max(0, validation.selection.eligibleEmployees - conflicts.length) : data?.employees.length ?? null;
  const failed = standardized && validation.selection && !validation.selection.fatal ? validation.selection.failedEmployees + conflicts.length : null;
  return {
    canImport: standardized ? Boolean(data && validation.selection && !validation.selection.fatal && eligible) : Boolean(data) && validation.totalIssueCount === 0,
    totalEmployees: validation.summary?.totalEmployees ?? data?.employees.length ?? null,
    workExperienceCount: validation.summary?.workExperienceCount ?? data?.workExperiences.length ?? null,
    educationCount: validation.summary?.educationCount ?? data?.educationExperiences.length ?? null,
    researchCount: validation.summary?.researchCount ?? (data ? data.researchExperiences?.length ?? 0 : null),
    issues: [...validation.issues, ...conflictIssues(conflicts)].slice(0, 200),
    totalIssueCount: validation.totalIssueCount + conflicts.length,
    warnings: validation.warnings ?? [],
    format: validation.format ?? null,
    importMode: standardized ? "append" : "replace",
    eligibleEmployees: eligible,
    failedEmployees: failed,
  };
}

export async function importEmployeeWorkbook(
  command: ImportEmployeeWorkbookCommand,
  dependencies: ImportEmployeeWorkbookDependencies,
): Promise<ImportEmployeeWorkbookResult> {
  const { actor, file } = command;
  const { parser, repository } = dependencies;

  const rejection = validateFile(file);
  if (rejection) { repository.recordFailedImport(actor, "FILE_REJECTED", 1); return rejection; }

  const validation = await parser.parse(await file!.arrayBuffer());
  if (validation.format === "standardized" && validation.selection && !validation.selection.fatal && validation.data) {
    try {
      if (!dependencies.appendStandardized) throw new Error("Standardized append repository is unavailable");
      const result = dependencies.appendStandardized(validation.data, actor);
      const totalCount = validation.selection.totalEmployees;
      const issues = [...validation.issues, ...conflictIssues(result.conflicts)].slice(0, 200);
      const totalIssueCount = validation.totalIssueCount + result.conflicts.length;
      const common = { importedCount: result.importedCount, skippedCount: totalCount - result.importedCount, totalCount, importMode: "append" as const, issues, totalIssueCount, warnings: validation.warnings };
      return result.version ? { kind: "published", version: result.version, ...common } : { kind: "nothing_imported", ...common };
    } catch {
      repository.recordFailedImport(actor, "PUBLISH_FAILED", 1);
      return { kind: "publish_failed", issue: fileIssue("PUBLISH_FAILED", "系统未能发布新版本，请稍后重试。") };
    }
  }
  if (!validation.data || validation.totalIssueCount || validation.format === "standardized") {
    repository.recordFailedImport(actor, "VALIDATION_FAILED", validation.totalIssueCount);
    return {
      kind: "validation_failed",
      issues: validation.issues,
      totalIssueCount: validation.totalIssueCount,
    };
  }

  try {
    const version = repository.publishEmployeeData(validation.data, actor);
    return { kind: "published", version, warnings: validation.warnings, importedCount: validation.data.employees.length, skippedCount: 0, totalCount: validation.data.employees.length, importMode: "replace", issues: [], totalIssueCount: 0 };
  } catch {
    repository.recordFailedImport(actor, "PUBLISH_FAILED", 1);
    return {
      kind: "publish_failed",
      issue: fileIssue("PUBLISH_FAILED", "系统未能发布新版本，请稍后重试。"),
    };
  }
}


