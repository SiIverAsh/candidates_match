import type { EmployeeDataVersionSummary } from "../domain/models";
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
  | { kind: "published"; version: EmployeeDataVersionSummary; warnings?: string[] }
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

export async function previewEmployeeWorkbook(file: WorkbookUpload | null, parser: EmployeeWorkbookParser): Promise<EmployeeWorkbookPreview> {
  const rejection = validateFile(file);
  if (rejection) return { canImport: false, totalEmployees: null, workExperienceCount: null, educationCount: null, researchCount: null, issues: [rejection.issue], totalIssueCount: 1, warnings: [], format: null };
  const validation = await parser.parse(await file!.arrayBuffer());
  const data = validation.data;
  return {
    canImport: Boolean(data) && validation.totalIssueCount === 0,
    totalEmployees: validation.summary?.totalEmployees ?? data?.employees.length ?? null,
    workExperienceCount: validation.summary?.workExperienceCount ?? data?.workExperiences.length ?? null,
    educationCount: validation.summary?.educationCount ?? data?.educationExperiences.length ?? null,
    researchCount: validation.summary?.researchCount ?? (data ? data.researchExperiences?.length ?? 0 : null),
    issues: validation.issues,
    totalIssueCount: validation.totalIssueCount,
    warnings: validation.warnings ?? [],
    format: validation.format ?? null,
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
  if (!validation.data || validation.totalIssueCount) {
    repository.recordFailedImport(actor, "VALIDATION_FAILED", validation.totalIssueCount);
    return {
      kind: "validation_failed",
      issues: validation.issues,
      totalIssueCount: validation.totalIssueCount,
    };
  }

  try {
    const version = repository.publishEmployeeData(validation.data, actor);
    return { kind: "published", version, warnings: validation.warnings };
  } catch {
    repository.recordFailedImport(actor, "PUBLISH_FAILED", 1);
    return {
      kind: "publish_failed",
      issue: fileIssue("PUBLISH_FAILED", "系统未能发布新版本，请稍后重试。"),
    };
  }
}


