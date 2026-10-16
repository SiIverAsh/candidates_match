import type { EmployeeDataVersionSummary } from "../domain/models";
import type { ImportValidationIssue } from "../application/ports";

export interface ImportActionState {
  status: "idle" | "success" | "error";
  message: string;
  issues: ImportValidationIssue[];
  totalIssueCount: number;
  version: EmployeeDataVersionSummary | null;
}

export const INITIAL_IMPORT_STATE: ImportActionState = {
  status: "idle",
  message: "",
  issues: [],
  totalIssueCount: 0,
  version: null,
};

