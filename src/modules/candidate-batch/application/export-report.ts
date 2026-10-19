import { prepareBatchReport, type BatchReport } from "../domain/report";
import type { BatchReportWriter } from "./ports";

export function exportBatchReport(report: BatchReport, writer: BatchReportWriter) {
  return writer.write(prepareBatchReport(report));
}
