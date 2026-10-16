import type { EmployeeDataVersionSummary } from "../domain/models";
import { MAX_EMPLOYEE_IMPORT_BYTES } from "../domain/policies";
import type {
  EmployeeDataRepository,
  EmployeeWorkbookParser,
  ImportActor,
  ImportValidationIssue,
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
  | { kind: "published"; version: EmployeeDataVersionSummary }
  | { kind: "publish_failed"; issue: ImportValidationIssue };

function fileIssue(code: string, message: string): ImportValidationIssue {
  return { sheet: "文件", row: 0, field: "file", code, message };
}

function rejectFile(
  repository: EmployeeDataRepository,
  actor: ImportActor,
  code: "FILE_REQUIRED" | "INVALID_FILE_TYPE" | "FILE_TOO_LARGE",
  message: string,
): ImportEmployeeWorkbookResult {
  repository.recordFailedImport(actor, "FILE_REJECTED", 1);
  return { kind: "file_rejected", code, issue: fileIssue(code, message) };
}

export async function importEmployeeWorkbook(
  command: ImportEmployeeWorkbookCommand,
  dependencies: ImportEmployeeWorkbookDependencies,
): Promise<ImportEmployeeWorkbookResult> {
  const { actor, file } = command;
  const { parser, repository } = dependencies;

  if (!file || file.size === 0) {
    return rejectFile(repository, actor, "FILE_REQUIRED", "请选择一个 .xlsx 文件。");
  }
  if (!file.name.toLowerCase().endsWith(".xlsx")) {
    return rejectFile(repository, actor, "INVALID_FILE_TYPE", "仅支持 .xlsx 文件。");
  }
  if (file.size > MAX_EMPLOYEE_IMPORT_BYTES) {
    return rejectFile(repository, actor, "FILE_TOO_LARGE", "文件不能超过 10 MB。");
  }

  const validation = await parser.parse(await file.arrayBuffer());
  if (!validation.data) {
    repository.recordFailedImport(actor, "VALIDATION_FAILED", validation.totalIssueCount);
    return {
      kind: "validation_failed",
      issues: validation.issues,
      totalIssueCount: validation.totalIssueCount,
    };
  }

  try {
    const version = repository.publishEmployeeData(validation.data, actor);
    return { kind: "published", version };
  } catch {
    repository.recordFailedImport(actor, "PUBLISH_FAILED", 1);
    return {
      kind: "publish_failed",
      issue: fileIssue("PUBLISH_FAILED", "系统未能发布新版本，请稍后重试。"),
    };
  }
}


