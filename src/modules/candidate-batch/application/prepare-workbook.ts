import { BatchInputError } from "../domain/models";
import { CANDIDATE_WORKBOOK_LIMITS } from "../domain/workbook";
import type { BatchFile, CandidateWorkbookParser } from "./ports";

export async function prepareCandidateWorkbook(file: BatchFile, parser: CandidateWorkbookParser) {
  if (!file.name.toLowerCase().endsWith(".xlsx")) throw new BatchInputError("候选人表格仅支持 .xlsx，请使用下载模板。");
  if (!file.size || file.size > CANDIDATE_WORKBOOK_LIMITS.maxBytes) throw new BatchInputError("Excel 文件不能为空，且不能超过 10 MB。");
  return parser.parse(await file.arrayBuffer());
}
