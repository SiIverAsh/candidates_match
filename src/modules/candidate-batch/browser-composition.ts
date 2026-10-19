import { exportBatchReport } from "./application/export-report";
import type { BatchReport } from "./domain/report";
import { batchReportWriter } from "./infrastructure/write-batch-report";

export const batchReportApplication = {
  export: (report: BatchReport) => exportBatchReport(report, batchReportWriter),
};
