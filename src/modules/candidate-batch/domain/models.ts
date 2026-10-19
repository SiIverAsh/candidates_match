export const BATCH_LIMITS = { maxFiles: 50, maxTotalBytes: 25 * 1024 * 1024, maxQueryIds: 200 } as const;

export type BatchItemStatus = "IMPORTED" | "MATCHED" | "NO_RESULTS" | "NEEDS_DATA" | "NEEDS_INPUT" | "FAILED";
export interface BatchEmployeeContact {
  employeeId: string;
  name: string;
  email: string;
  currentDepartment: string;
  currentTitle: string;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  score: number;
  rank: number;
}
export interface BatchItemResult {
  index: number;
  label: string;
  queryId: string | null;
  status: BatchItemStatus;
  message: string;
  resultCount: number;
  workbookRow?: { sheetName: string; rowNumber: number; candidateName: string };
  employeeContacts?: BatchEmployeeContact[];
}
export type BatchEvent =
  | { type: "start"; total: number }
  | { type: "item"; item: BatchItemResult }
  | { type: "done"; completed: number }
  | { type: "error"; message: string };

export class BatchInputError extends Error {}
